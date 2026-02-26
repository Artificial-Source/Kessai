use rusqlite::params;

use crate::db::DbPool;
use crate::error::Result;
use crate::models::price_history::PriceChange;

pub struct PriceHistoryService {
    pool: DbPool,
}

impl PriceHistoryService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Record a price change for a subscription.
    pub fn record(
        &self,
        subscription_id: &str,
        old_amount: f64,
        new_amount: f64,
        old_currency: &str,
        new_currency: &str,
    ) -> Result<PriceChange> {
        let conn = self.pool.get()?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO price_history (id, subscription_id, old_amount, new_amount, old_currency, new_currency, changed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, subscription_id, old_amount, new_amount, old_currency, new_currency, now],
        )?;

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
}
