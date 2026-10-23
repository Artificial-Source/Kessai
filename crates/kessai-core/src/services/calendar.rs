use std::collections::{BTreeMap, HashMap};

use chrono::NaiveDate;
use rusqlite::params;

use crate::db::DbPool;
use crate::error::Result;
use crate::models::{CalendarOccurrence, Payment};
use crate::utils::{month_date_range, occurrences_in_range};

use super::payment::PaymentService;
use super::subscription::SubscriptionService;

pub struct CalendarService {
    pool: DbPool,
}

impl CalendarService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Returns all projected renewals and recorded rows in a half-open month.
    /// Subscriptions qualify when currently active and billable, or when any
    /// payment was recorded in this month, even if subsequently cancelled.
    /// Years 1900–9998 and months 1–12 are supported.
    pub fn month(&self, year: i32, month: u32) -> Result<Vec<CalendarOccurrence>> {
        let (start, end) = month_date_range(year, month)?;
        let start_text = start.to_string();
        let end_text = end.to_string();
        let conn = self.pool.get()?;
        let tx = conn.unchecked_transaction()?;
        let mut payments: HashMap<String, Vec<Payment>> = HashMap::new();
        {
            let mut stmt = tx.prepare(
                "SELECT id, subscription_id, amount, paid_at, due_date, status, notes, created_at
                 FROM payments WHERE due_date >= ?1 AND due_date < ?2 ORDER BY due_date, id",
            )?;
            let rows =
                stmt.query_map(params![start_text, end_text], PaymentService::map_payment)?;
            for row in rows {
                let payment = row?;
                payments
                    .entry(payment.subscription_id.clone())
                    .or_default()
                    .push(payment);
            }
        }

        let mut occurrences = Vec::new();
        {
            for subscription in SubscriptionService::list_with_conn(&tx)? {
                let display = CalendarOccurrence {
                    subscription_id: subscription.id,
                    due_date: String::new(),
                    name: subscription.name,
                    logo_url: subscription.logo_url,
                    category_id: subscription.category_id,
                    currency: subscription.currency,
                    billing_cycle: subscription.billing_cycle,
                    status: subscription.status,
                    is_active: subscription.is_active,
                    projected_amount: subscription.amount,
                    payment: None,
                };
                let anchor = subscription.next_payment_date;
                let billing_day = subscription.billing_day;
                let mut dates: BTreeMap<String, Vec<Payment>> = BTreeMap::new();
                // Only subscriptions that bill today get projected occurrences;
                // inactive/cancelled rows appear solely through their recorded payments.
                let projects = display.is_active && display.status.is_billable();
                if let Some(anchor) = anchor.filter(|_| projects) {
                    // The shared subscription reader has validated this date.
                    let anchor = NaiveDate::parse_from_str(&anchor, "%Y-%m-%d")
                        .expect("validated subscription date");
                    for date in occurrences_in_range(
                        anchor,
                        &display.billing_cycle,
                        billing_day.map(|day| day.clamp(1, 31) as u32),
                        start,
                        end,
                    ) {
                        dates.entry(date.to_string()).or_default();
                    }
                }
                for payment in payments
                    .remove(&display.subscription_id)
                    .unwrap_or_default()
                {
                    dates
                        .entry(payment.due_date.clone())
                        .or_default()
                        .push(payment);
                }
                for (due_date, recorded) in dates {
                    if recorded.is_empty() {
                        occurrences.push(CalendarOccurrence {
                            due_date,
                            ..display.clone()
                        });
                    } else {
                        for payment in recorded {
                            occurrences.push(CalendarOccurrence {
                                due_date: due_date.clone(),
                                payment: Some(payment),
                                ..display.clone()
                            });
                        }
                    }
                }
            }
        }
        tx.commit()?;
        occurrences.sort_by(|a, b| {
            a.due_date
                .cmp(&b.due_date)
                .then_with(|| a.subscription_id.cmp(&b.subscription_id))
                .then_with(|| {
                    a.payment
                        .as_ref()
                        .map(|p| &p.id)
                        .cmp(&b.payment.as_ref().map(|p| &p.id))
                })
        });
        Ok(occurrences)
    }
}
