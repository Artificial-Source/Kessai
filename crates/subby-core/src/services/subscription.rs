use rusqlite::params;

use crate::db::DbPool;
use crate::error::{Result, SubbyCoreError};
use crate::models::subscription::{
    BillingCycle, NewSubscription, Subscription, SubscriptionStatus, UpdateSubscription,
};

pub struct SubscriptionService {
    pool: DbPool,
}

impl SubscriptionService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// List all subscriptions, sorted by next_payment_date ASC (nulls last).
    pub fn list(&self) -> Result<Vec<Subscription>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, amount, currency, billing_cycle, billing_day, category_id,
                    card_id, color, logo_url, notes, is_active, next_payment_date,
                    status, trial_end_date, status_changed_at, shared_count,
                    last_reviewed_at, created_at, updated_at
             FROM subscriptions
             ORDER BY
                CASE WHEN next_payment_date IS NULL THEN 1 ELSE 0 END,
                next_payment_date ASC",
        )?;

        let rows = stmt.query_map([], |row| row_to_subscription(row))?;

        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Get a single subscription by ID.
    pub fn get(&self, id: &str) -> Result<Subscription> {
        let conn = self.pool.get()?;
        conn.query_row(
            "SELECT id, name, amount, currency, billing_cycle, billing_day, category_id,
                    card_id, color, logo_url, notes, is_active, next_payment_date,
                    status, trial_end_date, status_changed_at, shared_count,
                    last_reviewed_at, created_at, updated_at
             FROM subscriptions WHERE id = ?1",
            params![id],
            |row| row_to_subscription(row),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                SubbyCoreError::NotFound(format!("Subscription '{id}' not found"))
            }
            other => SubbyCoreError::Database(other),
        })
    }

    /// Create a new subscription. Returns the created subscription.
    pub fn create(&self, data: NewSubscription) -> Result<Subscription> {
        let conn = self.pool.get()?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        // Derive is_active from status
        let is_active = data.status.is_billable();

        conn.execute(
            "INSERT INTO subscriptions
             (id, name, amount, currency, billing_cycle, billing_day, category_id,
              card_id, color, logo_url, notes, is_active, next_payment_date,
              status, trial_end_date, status_changed_at, shared_count,
              last_reviewed_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            params![
                id,
                data.name,
                data.amount,
                data.currency,
                data.billing_cycle.as_str(),
                data.billing_day,
                data.category_id,
                data.card_id,
                data.color,
                data.logo_url,
                data.notes,
                if is_active { 1 } else { 0 },
                data.next_payment_date,
                data.status.as_str(),
                data.trial_end_date,
                now,
                data.shared_count.max(1),
                rusqlite::types::Null,
                now,
                now,
            ],
        )?;

        self.get(&id)
    }

    /// Update a subscription. Only the provided fields are modified.
    pub fn update(&self, id: &str, data: UpdateSubscription) -> Result<Subscription> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().to_rfc3339();

        let mut sets = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref name) = data.name {
            sets.push("name = ?");
            values.push(Box::new(name.clone()));
        }
        if let Some(amount) = data.amount {
            sets.push("amount = ?");
            values.push(Box::new(amount));
        }
        if let Some(ref currency) = data.currency {
            sets.push("currency = ?");
            values.push(Box::new(currency.clone()));
        }
        if let Some(ref cycle) = data.billing_cycle {
            sets.push("billing_cycle = ?");
            values.push(Box::new(cycle.as_str().to_string()));
        }
        if let Some(ref billing_day) = data.billing_day {
            sets.push("billing_day = ?");
            values.push(Box::new(*billing_day));
        }
        if let Some(ref category_id) = data.category_id {
            sets.push("category_id = ?");
            values.push(Box::new(category_id.clone()));
        }
        if let Some(ref card_id) = data.card_id {
            sets.push("card_id = ?");
            values.push(Box::new(card_id.clone()));
        }
        if let Some(ref color) = data.color {
            sets.push("color = ?");
            values.push(Box::new(color.clone()));
        }
        if let Some(ref logo_url) = data.logo_url {
            sets.push("logo_url = ?");
            values.push(Box::new(logo_url.clone()));
        }
        if let Some(ref notes) = data.notes {
            sets.push("notes = ?");
            values.push(Box::new(notes.clone()));
        }
        if let Some(is_active) = data.is_active {
            sets.push("is_active = ?");
            values.push(Box::new(if is_active { 1i32 } else { 0 }));
        }
        if let Some(ref next_payment_date) = data.next_payment_date {
            sets.push("next_payment_date = ?");
            values.push(Box::new(next_payment_date.clone()));
        }
        if let Some(ref status) = data.status {
            sets.push("status = ?");
            values.push(Box::new(status.as_str().to_string()));
            // Sync is_active from status
            sets.push("is_active = ?");
            values.push(Box::new(if status.is_billable() { 1i32 } else { 0 }));
            sets.push("status_changed_at = ?");
            values.push(Box::new(now.clone()));
        }
        if let Some(ref trial_end_date) = data.trial_end_date {
            sets.push("trial_end_date = ?");
            values.push(Box::new(trial_end_date.clone()));
        }
        if let Some(shared_count) = data.shared_count {
            sets.push("shared_count = ?");
            values.push(Box::new(shared_count.max(1)));
        }
        if let Some(ref last_reviewed_at) = data.last_reviewed_at {
            sets.push("last_reviewed_at = ?");
            values.push(Box::new(last_reviewed_at.clone()));
        }

        if sets.is_empty() {
            return self.get(id);
        }

        sets.push("updated_at = ?");
        values.push(Box::new(now));
        values.push(Box::new(id.to_string()));

        let sql = format!("UPDATE subscriptions SET {} WHERE id = ?", sets.join(", "));

        let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, params.as_slice())?;

        self.get(id)
    }

    /// Delete a subscription by ID.
    pub fn delete(&self, id: &str) -> Result<()> {
        let conn = self.pool.get()?;
        let changes = conn.execute("DELETE FROM subscriptions WHERE id = ?1", params![id])?;
        if changes == 0 {
            return Err(SubbyCoreError::NotFound(format!(
                "Subscription '{id}' not found"
            )));
        }
        Ok(())
    }

    /// Toggle the active status of a subscription.
    /// Billable statuses → Paused, non-billable → Active.
    pub fn toggle_active(&self, id: &str) -> Result<Subscription> {
        let sub = self.get(id)?;
        let new_status = if sub.status.is_billable() {
            SubscriptionStatus::Paused
        } else {
            SubscriptionStatus::Active
        };
        self.update(
            id,
            UpdateSubscription {
                status: Some(new_status),
                ..Default::default()
            },
        )
    }

    /// Transition a subscription to a new status.
    pub fn transition_status(
        &self,
        id: &str,
        new_status: SubscriptionStatus,
    ) -> Result<Subscription> {
        self.update(
            id,
            UpdateSubscription {
                status: Some(new_status),
                ..Default::default()
            },
        )
    }

    /// Mark a subscription as reviewed (sets last_reviewed_at to current timestamp).
    pub fn mark_reviewed(&self, id: &str) -> Result<Subscription> {
        let now = chrono::Utc::now().to_rfc3339();
        self.update(
            id,
            UpdateSubscription {
                last_reviewed_at: Some(Some(now)),
                ..Default::default()
            },
        )
    }

    /// List active subscriptions that haven't been reviewed in `days_threshold` days.
    pub fn list_needing_review(&self, days_threshold: i64) -> Result<Vec<Subscription>> {
        let conn = self.pool.get()?;
        let threshold = format!("-{} days", days_threshold);
        let mut stmt = conn.prepare(
            "SELECT id, name, amount, currency, billing_cycle, billing_day, category_id,
                    card_id, color, logo_url, notes, is_active, next_payment_date,
                    status, trial_end_date, status_changed_at, shared_count,
                    last_reviewed_at, created_at, updated_at
             FROM subscriptions
             WHERE is_active = 1
               AND (last_reviewed_at IS NULL OR last_reviewed_at < datetime('now', ?1))
             ORDER BY
                CASE WHEN last_reviewed_at IS NULL THEN 0 ELSE 1 END,
                last_reviewed_at ASC",
        )?;

        let rows = stmt.query_map(params![threshold], |row| row_to_subscription(row))?;

        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }
}

fn row_to_subscription(row: &rusqlite::Row) -> rusqlite::Result<Subscription> {
    Ok(Subscription {
        id: row.get(0)?,
        name: row.get(1)?,
        amount: row.get(2)?,
        currency: row.get(3)?,
        billing_cycle: billing_cycle_from_db(row.get::<_, String>(4)?),
        billing_day: row.get(5)?,
        category_id: row.get(6)?,
        card_id: row.get(7)?,
        color: row.get(8)?,
        logo_url: row.get(9)?,
        notes: row.get(10)?,
        is_active: row.get::<_, i32>(11)? != 0,
        next_payment_date: row.get(12)?,
        status: status_from_db(row.get::<_, String>(13)?),
        trial_end_date: row.get(14)?,
        status_changed_at: row.get(15)?,
        shared_count: row.get::<_, i32>(16).unwrap_or(1),
        last_reviewed_at: row.get(17)?,
        created_at: row.get(18)?,
        updated_at: row.get(19)?,
    })
}

fn billing_cycle_from_db(s: String) -> BillingCycle {
    BillingCycle::from_str(&s).unwrap_or(BillingCycle::Monthly)
}

fn status_from_db(s: String) -> SubscriptionStatus {
    SubscriptionStatus::from_str(&s).unwrap_or(SubscriptionStatus::Active)
}
