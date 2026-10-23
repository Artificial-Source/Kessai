use std::collections::BTreeMap;

use rusqlite::{params, Connection, OptionalExtension};

use crate::db::DbPool;
use crate::error::{KessaiCoreError, Result};
use crate::models::analytics::{CategorySpend, MonthlySpend, SpendingVelocity, YearSummary};
use crate::models::{CategorySpending, DashboardStats};
use crate::utils::{calculate_monthly_amount, month_date_range};

use super::{CategoryService, SubscriptionService};
pub struct AnalyticsService {
    pool: DbPool,
}

impl AnalyticsService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Subscription-based totals use the user's share, not full ledger charges.
    /// Only active, billable subscriptions in the display currency contribute.
    /// Other billable currencies are counted, never converted or added together.
    pub fn dashboard_summary(&self, display_currency: &str) -> Result<DashboardStats> {
        crate::validation::validate_currency(display_currency).map_err(|error| match error {
            KessaiCoreError::Validation(message) => KessaiCoreError::Validation(format!(
                "{message}; fix with `settings update --currency`."
            )),
            other => other,
        })?;
        let conn = self.pool.get()?;
        let tx = conn.unchecked_transaction()?;
        let subscriptions = SubscriptionService::list_with_conn(&tx)?;
        let total_count = subscriptions.len();
        let categories = CategoryService::list_with_conn(&tx)?;
        let categories: std::collections::HashMap<_, _> = categories
            .iter()
            .map(|category| (category.id.as_str(), category))
            .collect();
        let mut active_count = 0;
        let mut total_monthly = 0.0;
        let mut by_category: BTreeMap<String, CategorySpending> = BTreeMap::new();
        let mut excluded_currencies = BTreeMap::new();
        for subscription in subscriptions
            .into_iter()
            .filter(|sub| sub.is_active && sub.status.is_billable())
        {
            if subscription.currency != display_currency {
                *excluded_currencies
                    .entry(subscription.currency)
                    .or_default() += 1;
                continue;
            }
            let monthly = calculate_monthly_amount(
                subscription.amount / f64::from(subscription.shared_count),
                &subscription.billing_cycle,
            );
            active_count += 1;
            total_monthly += monthly;
            let category = subscription
                .category_id
                .as_deref()
                .and_then(|id| categories.get(id));
            let id = subscription
                .category_id
                .unwrap_or_else(|| "uncategorized".into());
            let entry = match by_category.entry(id) {
                std::collections::btree_map::Entry::Occupied(entry) => entry.into_mut(),
                std::collections::btree_map::Entry::Vacant(entry) => {
                    let category = CategorySpending {
                        id: entry.key().clone(),
                        name: category
                            .map(|category| category.name.clone())
                            .unwrap_or_else(|| "Uncategorized".into()),
                        color: category
                            .map(|category| category.color.clone())
                            .unwrap_or_else(|| "#6b7280".into()),
                        amount: 0.0,
                        percentage: 0.0,
                    };
                    entry.insert(category)
                }
            };
            entry.amount += monthly;
        }
        tx.commit()?;
        let mut category_spending: Vec<_> = by_category.into_values().collect();
        for category in &mut category_spending {
            category.percentage = if total_monthly > 0.0 {
                category.amount / total_monthly * 100.0
            } else {
                0.0
            };
        }
        category_spending
            .sort_by(|a, b| b.amount.total_cmp(&a.amount).then_with(|| a.id.cmp(&b.id)));
        Ok(DashboardStats {
            total_monthly,
            total_yearly: total_monthly * 12.0,
            active_count,
            total_count,
            average_per_subscription: if active_count > 0 {
                total_monthly / active_count as f64
            } else {
                0.0
            },
            category_spending,
            excluded_currencies,
        })
    }

    /// Get monthly spending totals for the last N months, from payment data.
    /// Only counts payments with status = 'paid'.
    #[tracing::instrument(skip(self))]
    pub fn monthly_spending(&self, months: i32) -> Result<Vec<MonthlySpend>> {
        tracing::debug!("querying monthly spending for last {} months", months);
        validate_months(months)?;
        let conn = self.pool.get()?;

        let mut stmt = conn.prepare(
            "SELECT
                strftime('%Y-%m', due_date) AS month,
                SUM(amount) AS total,
                COUNT(*) AS count
             FROM payments
             WHERE status = 'paid'
               AND due_date >= date('now', '-' || ?1 || ' months', 'start of month')
             GROUP BY month
             ORDER BY month ASC",
        )?;

        let rows = stmt.query_map(params![months], |row| {
            Ok(MonthlySpend {
                month: row.get(0)?,
                total: row.get(1)?,
                count: row.get(2)?,
            })
        })?;

        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Get a summary of spending for a given year.
    #[tracing::instrument(skip(self))]
    pub fn year_summary(&self, year: i32) -> Result<YearSummary> {
        tracing::debug!("querying year summary for {}", year);
        let (start, _) = month_date_range(year, 1)?;
        let (_, end) = month_date_range(year, 12)?;
        let (start, end) = (start.to_string(), end.to_string());
        let conn = self.pool.get()?;

        // Total spent and count of months with payments
        let (total_spent, month_count): (f64, i32) = conn.query_row(
            "SELECT
                COALESCE(SUM(amount), 0.0),
                COUNT(DISTINCT strftime('%Y-%m', due_date))
             FROM payments
             WHERE status = 'paid'
               AND due_date >= ?1 AND due_date < ?2",
            params![start, end],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let avg_monthly = if month_count > 0 {
            total_spent / month_count as f64
        } else {
            0.0
        };

        // Highest spending month
        let (highest_month, highest_amount): (String, f64) = conn
            .query_row(
                "SELECT
                    strftime('%Y-%m', due_date) AS month,
                    SUM(amount) AS total
                 FROM payments
                 WHERE status = 'paid'
                   AND due_date >= ?1 AND due_date < ?2
                 GROUP BY month
                 ORDER BY total DESC
                 LIMIT 1",
                params![start, end],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
            .unwrap_or_else(|| (String::new(), 0.0));

        // Category breakdown for the year
        let category_breakdown = Self::category_spending_range_with_conn(&conn, &start, &end)?;

        Ok(YearSummary {
            year,
            total_spent,
            avg_monthly,
            highest_month,
            highest_amount,
            category_breakdown,
        })
    }

    /// Compare current month spending to previous month.
    #[tracing::instrument(skip(self))]
    pub fn spending_velocity(&self) -> Result<SpendingVelocity> {
        tracing::debug!("querying spending velocity");
        let conn = self.pool.get()?;

        let current_month: f64 = conn.query_row(
            "SELECT COALESCE(SUM(amount), 0.0)
             FROM payments
             WHERE status = 'paid'
               AND strftime('%Y-%m', due_date) = strftime('%Y-%m', 'now')",
            [],
            |row| row.get(0),
        )?;

        let previous_month: f64 = conn.query_row(
            "SELECT COALESCE(SUM(amount), 0.0)
             FROM payments
             WHERE status = 'paid'
               AND strftime('%Y-%m', due_date) = strftime('%Y-%m', 'now', '-1 month')",
            [],
            |row| row.get(0),
        )?;

        let change_percent = if previous_month > 0.0 {
            ((current_month - previous_month) / previous_month) * 100.0
        } else if current_month > 0.0 {
            100.0
        } else {
            0.0
        };

        let projected_annual = current_month * 12.0;

        Ok(SpendingVelocity {
            current_month,
            previous_month,
            change_percent,
            projected_annual,
        })
    }

    /// Get spending per category over the last N months from payment data.
    #[tracing::instrument(skip(self))]
    pub fn category_spending(&self, months: i32) -> Result<Vec<CategorySpend>> {
        tracing::debug!("querying category spending for last {} months", months);
        validate_months(months)?;
        let conn = self.pool.get()?;

        let start: String = conn.query_row(
            "SELECT date('now', '-' || ?1 || ' months', 'start of month')",
            params![months],
            |row| row.get(0),
        )?;

        let end = "9999-12-31".to_string();

        Self::category_spending_range_with_conn(&conn, &start, &end)
    }

    /// Internal helper: category spending within a date range.
    fn category_spending_range_with_conn(
        conn: &Connection,
        start: &str,
        end: &str,
    ) -> Result<Vec<CategorySpend>> {
        let mut stmt = conn.prepare(
            "SELECT
                s.category_id,
                COALESCE(c.name, 'Uncategorized') AS category_name,
                SUM(p.amount) AS total
             FROM payments p
             JOIN subscriptions s ON p.subscription_id = s.id
             LEFT JOIN categories c ON s.category_id = c.id
             WHERE p.status = 'paid'
               AND p.due_date >= ?1 AND p.due_date < ?2
             GROUP BY s.category_id
             ORDER BY total DESC",
        )?;

        let rows = stmt.query_map(params![start, end], |row| {
            Ok(CategorySpend {
                category_id: row.get(0)?,
                category_name: row.get(1)?,
                total: row.get(2)?,
                percentage: 0.0, // will be computed below
            })
        })?;

        let mut results: Vec<CategorySpend> = rows.collect::<std::result::Result<Vec<_>, _>>()?;

        let grand_total: f64 = results.iter().map(|c| c.total).sum();

        for cat in &mut results {
            cat.percentage = if grand_total > 0.0 {
                (cat.total / grand_total) * 100.0
            } else {
                0.0
            };
        }

        Ok(results)
    }
}

fn validate_months(months: i32) -> Result<()> {
    if !(1..=120).contains(&months) {
        return Err(KessaiCoreError::Validation(
            "months must be from 1 to 120".into(),
        ));
    }
    Ok(())
}
