use rusqlite::{params, Connection};

use crate::db::DbPool;
use crate::error::Result;
use crate::models::price_history::PriceChange;
use crate::validation::validate_days;

pub struct PriceHistoryService {
    pool: DbPool,
}

impl PriceHistoryService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Record a price change for a subscription.
    #[tracing::instrument(skip(self))]
    pub fn record(
        &self,
        subscription_id: &str,
        old_amount: f64,
        new_amount: f64,
        old_currency: &str,
        new_currency: &str,
    ) -> Result<PriceChange> {
        let conn = self.pool.get()?;
        Self::record_with_conn(
            &conn,
            subscription_id,
            old_amount,
            new_amount,
            old_currency,
            new_currency,
        )
    }

    /// Shares the caller's transaction so price changes cannot outlive a failed edit.
    pub(crate) fn record_with_conn(
        conn: &Connection,
        subscription_id: &str,
        old_amount: f64,
        new_amount: f64,
        old_currency: &str,
        new_currency: &str,
    ) -> Result<PriceChange> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO price_history (id, subscription_id, old_amount, new_amount, old_currency, new_currency, changed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, subscription_id, old_amount, new_amount, old_currency, new_currency, now],
        )?;

        tracing::info!(
            "price change recorded for {}: {} {} -> {} {}",
            subscription_id,
            old_amount,
            old_currency,
            new_amount,
            new_currency
        );

        Ok(PriceChange {
            id,
            subscription_id: subscription_id.to_string(),
            old_amount,
            new_amount,
            old_currency: old_currency.to_string(),
            new_currency: new_currency.to_string(),
            changed_at: now,
        })
    }

    /// List all price changes for a subscription, most recent first.
    pub fn list_by_subscription(&self, subscription_id: &str) -> Result<Vec<PriceChange>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, subscription_id, old_amount, new_amount, old_currency, new_currency, changed_at
             FROM price_history
             WHERE subscription_id = ?1
             ORDER BY changed_at DESC",
        )?;

        let rows = stmt.query_map(params![subscription_id], |row| {
            Ok(PriceChange {
                id: row.get(0)?,
                subscription_id: row.get(1)?,
                old_amount: row.get(2)?,
                new_amount: row.get(3)?,
                old_currency: row.get(4)?,
                new_currency: row.get(5)?,
                changed_at: row.get(6)?,
            })
        })?;

        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// List recent price changes across all subscriptions within N days.
    pub fn list_recent(&self, days: i64) -> Result<Vec<PriceChange>> {
        validate_days(days)?;
        let conn = self.pool.get()?;
        let cutoff = (chrono::Utc::now() - chrono::Duration::days(days)).to_rfc3339();

        let mut stmt = conn.prepare(
            "SELECT id, subscription_id, old_amount, new_amount, old_currency, new_currency, changed_at
             FROM price_history
             WHERE changed_at >= ?1
             ORDER BY changed_at DESC",
        )?;

        let rows = stmt.query_map(params![cutoff], |row| {
            Ok(PriceChange {
                id: row.get(0)?,
                subscription_id: row.get(1)?,
                old_amount: row.get(2)?,
                new_amount: row.get(3)?,
                old_currency: row.get(4)?,
                new_currency: row.get(5)?,
                changed_at: row.get(6)?,
            })
        })?;

        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// List all price changes (for backup export).
    pub fn list(&self) -> Result<Vec<PriceChange>> {
        let conn = self.pool.get()?;
        Self::list_with_conn(&conn)
    }

    pub(crate) fn list_with_conn(conn: &Connection) -> Result<Vec<PriceChange>> {
        let mut stmt = conn.prepare(
            "SELECT id, subscription_id, old_amount, new_amount, old_currency, new_currency, changed_at
             FROM price_history
             ORDER BY changed_at DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(PriceChange {
                id: row.get(0)?,
                subscription_id: row.get(1)?,
                old_amount: row.get(2)?,
                new_amount: row.get(3)?,
                old_currency: row.get(4)?,
                new_currency: row.get(5)?,
                changed_at: row.get(6)?,
            })
        })?;

        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// List latest price change per subscription for a set of subscriptions.
    pub fn list_latest_for_subscriptions(
        &self,
        subscription_ids: &[String],
    ) -> Result<Vec<PriceChange>> {
        if subscription_ids.is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.pool.get()?;
        let placeholders = std::iter::repeat_n("?", subscription_ids.len())
            .collect::<Vec<_>>()
            .join(", ");

        let sql = format!(
            "SELECT ph.id, ph.subscription_id, ph.old_amount, ph.new_amount, ph.old_currency, ph.new_currency, ph.changed_at
             FROM price_history ph
             WHERE ph.subscription_id IN ({})
               AND ph.id = (
                 SELECT ph2.id
                 FROM price_history ph2
                 WHERE ph2.subscription_id = ph.subscription_id
                 ORDER BY ph2.changed_at DESC, ph2.id DESC
                 LIMIT 1
               )
             ORDER BY ph.changed_at DESC, ph.id DESC",
            placeholders
        );

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(subscription_ids.iter()), |row| {
            Ok(PriceChange {
                id: row.get(0)?,
                subscription_id: row.get(1)?,
                old_amount: row.get(2)?,
                new_amount: row.get(3)?,
                old_currency: row.get(4)?,
                new_currency: row.get(5)?,
                changed_at: row.get(6)?,
            })
        })?;

        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use crate::models::{BillingCycle, NewSubscription, SubscriptionStatus};
    use crate::KessaiCore;

    #[test]
    fn list_latest_for_subscriptions_returns_one_row_per_subscription_with_tie_breaking() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = KessaiCore::new(tmp.path()).unwrap();

        let sub_a = core
            .subscriptions()
            .create(NewSubscription {
                name: "Sub A".to_string(),
                amount: 10.0,
                currency: "USD".to_string(),
                billing_cycle: BillingCycle::Monthly,
                billing_day: None,
                category_id: None,
                card_id: None,
                color: None,
                logo_url: None,
                notes: None,
                is_active: true,
                next_payment_date: None,
                status: SubscriptionStatus::Active,
                trial_end_date: None,
                shared_count: 1,
                is_pinned: false,
            })
            .unwrap();

        let sub_b = core
            .subscriptions()
            .create(NewSubscription {
                name: "Sub B".to_string(),
                amount: 20.0,
                currency: "USD".to_string(),
                billing_cycle: BillingCycle::Monthly,
                billing_day: None,
                category_id: None,
                card_id: None,
                color: None,
                logo_url: None,
                notes: None,
                is_active: true,
                next_payment_date: None,
                status: SubscriptionStatus::Active,
                trial_end_date: None,
                shared_count: 1,
                is_pinned: false,
            })
            .unwrap();

        let service = core.price_history();
        let conn = service.pool.get().unwrap();
        let tied_changed_at = "2026-01-01T00:00:00Z";

        conn.execute(
            "INSERT INTO price_history (id, subscription_id, old_amount, new_amount, old_currency, new_currency, changed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                "00000000-0000-0000-0000-000000000001",
                sub_a.id,
                10.0_f64,
                11.0_f64,
                "USD",
                "USD",
                tied_changed_at
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO price_history (id, subscription_id, old_amount, new_amount, old_currency, new_currency, changed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                "00000000-0000-0000-0000-000000000002",
                sub_a.id,
                11.0_f64,
                12.0_f64,
                "USD",
                "USD",
                tied_changed_at
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO price_history (id, subscription_id, old_amount, new_amount, old_currency, new_currency, changed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                "00000000-0000-0000-0000-000000000003",
                sub_b.id,
                20.0_f64,
                21.0_f64,
                "USD",
                "USD",
                tied_changed_at
            ],
        )
        .unwrap();

        let latest = service
            .list_latest_for_subscriptions(&[sub_a.id.clone(), sub_b.id.clone()])
            .unwrap();

        assert_eq!(latest.len(), 2);

        let subscription_ids = latest
            .iter()
            .map(|row| row.subscription_id.clone())
            .collect::<HashSet<_>>();
        assert!(subscription_ids.contains(&sub_a.id));
        assert!(subscription_ids.contains(&sub_b.id));

        let latest_a = latest
            .iter()
            .find(|row| row.subscription_id == sub_a.id)
            .unwrap();
        assert_eq!(latest_a.id, "00000000-0000-0000-0000-000000000002");
        assert_eq!(latest_a.new_amount, 12.0);
    }
}
