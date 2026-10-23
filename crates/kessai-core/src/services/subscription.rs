use rusqlite::{params, Connection, TransactionBehavior};

use crate::db::DbPool;
use crate::error::{KessaiCoreError, Result};
use crate::models::subscription::{
    BillingCycle, NewSubscription, Subscription, SubscriptionStatus, UpdateSubscription,
};
use crate::services::{CategoryService, PaymentCardService, PriceHistoryService};
use crate::validation::{
    validate_amount, validate_billing_day, validate_color, validate_currency, validate_date,
    validate_days, validate_name, validate_notes, validate_shared_count, validate_subscription,
    validate_timestamp,
};

pub struct SubscriptionService {
    pool: DbPool,
}

impl SubscriptionService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// List readable subscriptions, sorted by pinned first, then due date.
    /// Corrupt legacy rows are skipped with their identity in a warning; a
    /// malformed row must not make every subscription screen unavailable.
    #[tracing::instrument(skip(self))]
    pub fn list(&self) -> Result<Vec<Subscription>> {
        let conn = self.pool.get()?;
        Self::list_with_conn(&conn)
    }

    pub(crate) fn list_with_conn(conn: &Connection) -> Result<Vec<Subscription>> {
        Self::read_with_conn(conn, false)
    }

    pub(crate) fn export_with_conn(conn: &Connection) -> Result<Vec<Subscription>> {
        Self::read_with_conn(conn, true)
    }

    fn read_with_conn(conn: &Connection, require_all: bool) -> Result<Vec<Subscription>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, amount, currency, billing_cycle, billing_day, category_id,
                    card_id, color, logo_url, notes, is_active, next_payment_date,
                    status, trial_end_date, status_changed_at, shared_count,
                    is_pinned, cancellation_reason, cancelled_at,
                    last_reviewed_at, created_at, updated_at
             FROM subscriptions
             ORDER BY
                is_pinned DESC,
                CASE WHEN next_payment_date IS NULL THEN 1 ELSE 0 END,
                next_payment_date ASC",
        )?;

        let mut rows = stmt.query([])?;
        let mut results = Vec::new();
        let mut skipped = Vec::new();
        while let Some(row) = rows.next()? {
            match read_subscription(row) {
                Ok(sub) => results.push(sub),
                Err(error) => {
                    let id = row
                        .get::<_, String>(0)
                        .unwrap_or_else(|_| "<invalid id>".into());
                    let name = row
                        .get::<_, String>(1)
                        .unwrap_or_else(|_| "<invalid name>".into());
                    if require_all {
                        skipped.push(format!("{id} ({name}): {error}"));
                    }
                    tracing::warn!(subscription_id = %id, %error, "skipping corrupt subscription");
                }
            }
        }
        if !skipped.is_empty() {
            return Err(KessaiCoreError::Validation(format!(
                "Cannot export unreadable subscriptions: {}. Repair each record with \
                 `kessai-mcp subscriptions update <id> ...` or \
                 `kessai-mcp remove <id>`, then export again.",
                skipped.join("; ")
            )));
        }
        tracing::debug!("listed {} subscriptions", results.len());
        Ok(results)
    }

    /// Get a normalized row without the list's amount/date gate so corrupt
    /// durable fields can be inspected and repaired with a validated update.
    pub fn get(&self, id: &str) -> Result<Subscription> {
        let conn = self.pool.get()?;
        Self::get_with_conn(&conn, id)
    }

    pub(crate) fn get_with_conn(conn: &Connection, id: &str) -> Result<Subscription> {
        conn.query_row(
            "SELECT id, name, amount, currency, billing_cycle, billing_day, category_id,
                    card_id, color, logo_url, notes, is_active, next_payment_date,
                    status, trial_end_date, status_changed_at, shared_count,
                    is_pinned, cancellation_reason, cancelled_at,
                    last_reviewed_at, created_at, updated_at
             FROM subscriptions WHERE id = ?1",
            params![id],
            row_to_subscription,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                KessaiCoreError::NotFound(format!("Subscription '{id}' not found"))
            }
            other => KessaiCoreError::Database(other),
        })
    }

    /// Identify even an unreadable subscription before an explicit deletion.
    pub fn get_name(&self, id: &str) -> Result<String> {
        let conn = self.pool.get()?;
        conn.query_row(
            "SELECT name FROM subscriptions WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                KessaiCoreError::NotFound(format!("Subscription '{id}' not found"))
            }
            other => KessaiCoreError::Database(other),
        })
    }

    /// Create a new subscription. Returns the created subscription.
    #[tracing::instrument(skip(self, data), fields(name = %data.name))]
    pub fn create(&self, mut data: NewSubscription) -> Result<Subscription> {
        validate_new_subscription(&data)?;
        let conn = self.pool.get()?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        validate_references(&conn, data.category_id.as_deref(), data.card_id.as_deref())?;
        let mut cancelled_at = None;
        let mut cancellation_reason = None;
        let is_active = normalize_lifecycle(
            &mut data.status,
            Some(data.is_active),
            &mut data.trial_end_date,
            &mut cancellation_reason,
            &mut cancelled_at,
            &now,
        );

        conn.execute(
            "INSERT INTO subscriptions
             (id, name, amount, currency, billing_cycle, billing_day, category_id,
              card_id, color, logo_url, notes, is_active, next_payment_date,
              status, trial_end_date, status_changed_at, shared_count, is_pinned,
              cancellation_reason, cancelled_at, last_reviewed_at,
              created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)",
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
                data.shared_count,
                if data.is_pinned { 1i32 } else { 0 },
                cancellation_reason,
                cancelled_at,
                rusqlite::types::Null,
                now,
                now,
            ],
        )?;

        tracing::info!("subscription created: {} ({})", data.name, id);
        Self::get_with_conn(&conn, &id)
    }

    /// Update durable fields and their lifecycle metadata atomically.
    ///
    /// Price changes record history atomically when the previous price is valid;
    /// repairing an invalid prior amount/currency establishes the first valid price.
    /// Cancelled, paused, and pending-cancellation states are inactive; trial,
    /// active, and grace-period states are active unless explicitly paused.
    /// Leaving trial clears its end date, except pausing retains it for resumption.
    /// Leaving cancelled clears its cancellation metadata.
    #[tracing::instrument(skip(self, data))]
    pub fn update(&self, id: &str, data: UpdateSubscription) -> Result<Subscription> {
        validate_subscription_patch(&data)?;
        let mut conn = self.pool.get()?;
        // Acquire the write reservation before reading old prices. Deferred
        // transactions can fail to upgrade when another writer commits first.
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let mut subscription = Self::get_with_conn(&tx, id)?;
        let old_amount = subscription.amount;
        let old_status = subscription.status.clone();
        let now = chrono::Utc::now().to_rfc3339();
        let explicit_activity = data.is_active;
        let explicit_status = data.status.is_some();
        let clearing_trial = matches!(data.trial_end_date, Some(None));
        let reset_billing_day = data.next_payment_date.is_some() && data.billing_day.is_none();
        let mut changed = false;

        macro_rules! apply {
            ($($field:ident),+ $(,)?) => {
                $(if let Some(value) = data.$field {
                    subscription.$field = value;
                    changed = true;
                })+
            };
        }
        apply!(
            name,
            amount,
            billing_cycle,
            billing_day,
            category_id,
            card_id,
            color,
            logo_url,
            notes,
            next_payment_date,
            status,
            trial_end_date,
            shared_count,
            is_pinned,
            cancellation_reason,
            cancelled_at,
            last_reviewed_at
        );
        if reset_billing_day {
            subscription.billing_day = None;
        }
        let old_currency = if let Some(currency) = data.currency {
            changed = true;
            Some(std::mem::replace(&mut subscription.currency, currency))
        } else {
            None
        };
        changed |= explicit_activity.is_some();
        if !changed {
            return Ok(subscription);
        }
        validate_references(
            &tx,
            subscription.category_id.as_deref(),
            subscription.card_id.as_deref(),
        )?;

        if !explicit_status && explicit_activity == Some(true) && !subscription.status.is_billable()
        {
            subscription.status = resumed_status(&subscription);
        }
        if clearing_trial && subscription.status == SubscriptionStatus::Trial {
            subscription.status = SubscriptionStatus::Active;
        }
        subscription.is_active = normalize_lifecycle(
            &mut subscription.status,
            explicit_activity,
            &mut subscription.trial_end_date,
            &mut subscription.cancellation_reason,
            &mut subscription.cancelled_at,
            &now,
        );
        if subscription.status != old_status {
            subscription.status_changed_at = Some(now.clone());
        }
        subscription.updated_at = now;
        validate_subscription(&subscription)?;
        tx.execute(
            "UPDATE subscriptions SET
                name = ?2, amount = ?3, currency = ?4, billing_cycle = ?5,
                billing_day = ?6, category_id = ?7, card_id = ?8, color = ?9,
                logo_url = ?10, notes = ?11, is_active = ?12, next_payment_date = ?13,
                status = ?14, trial_end_date = ?15, status_changed_at = ?16,
                shared_count = ?17, is_pinned = ?18, cancellation_reason = ?19,
                cancelled_at = ?20, last_reviewed_at = ?21, updated_at = ?22
             WHERE id = ?1",
            params![
                id,
                subscription.name,
                subscription.amount,
                subscription.currency,
                subscription.billing_cycle.as_str(),
                subscription.billing_day,
                subscription.category_id,
                subscription.card_id,
                subscription.color,
                subscription.logo_url,
                subscription.notes,
                subscription.is_active,
                subscription.next_payment_date,
                subscription.status.as_str(),
                subscription.trial_end_date,
                subscription.status_changed_at,
                subscription.shared_count,
                subscription.is_pinned,
                subscription.cancellation_reason,
                subscription.cancelled_at,
                subscription.last_reviewed_at,
                subscription.updated_at,
            ],
        )?;
        let previous_currency = old_currency.as_deref().unwrap_or(&subscription.currency);
        if (old_amount != subscription.amount || previous_currency != subscription.currency)
            && validate_amount(old_amount, "previous amount").is_ok()
            && validate_currency(previous_currency).is_ok()
        {
            PriceHistoryService::record_with_conn(
                &tx,
                id,
                old_amount,
                subscription.amount,
                previous_currency,
                &subscription.currency,
            )?;
        }
        let updated = Self::get_with_conn(&tx, id)?;
        tx.commit()?;
        tracing::info!("subscription updated: {}", id);
        Ok(updated)
    }

    /// Delete a subscription by ID.
    #[tracing::instrument(skip(self))]
    pub fn delete(&self, id: &str) -> Result<()> {
        let conn = self.pool.get()?;
        let changes = conn.execute("DELETE FROM subscriptions WHERE id = ?1", params![id])?;
        if changes == 0 {
            return Err(KessaiCoreError::NotFound(format!(
                "Subscription '{id}' not found"
            )));
        }
        tracing::info!("subscription deleted: {}", id);
        Ok(())
    }

    /// Toggle the active status of a subscription.
    /// Billable statuses -> Paused, non-billable -> Active (or an unexpired trial).
    #[tracing::instrument(skip(self))]
    pub fn toggle_active(&self, id: &str) -> Result<Subscription> {
        let sub = self.get(id)?;
        let new_status = if sub.status.is_billable() {
            SubscriptionStatus::Paused
        } else {
            resumed_status(&sub)
        };
        tracing::info!(
            "toggling subscription {} active: {} -> {}",
            id,
            sub.status.as_str(),
            new_status.as_str()
        );
        self.update(
            id,
            UpdateSubscription {
                status: Some(new_status),
                ..Default::default()
            },
        )
    }

    /// Toggle the pinned status of a subscription.
    pub fn toggle_pinned(&self, id: &str) -> Result<Subscription> {
        tracing::debug!("toggling subscription {} pinned", id);
        let mut conn = self.pool.get()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let changes = tx.execute(
            "UPDATE subscriptions SET is_pinned = CASE WHEN is_pinned = 0 THEN 1 ELSE 0 END,
             updated_at = ?2 WHERE id = ?1",
            params![id, chrono::Utc::now().to_rfc3339()],
        )?;
        if changes == 0 {
            return Err(KessaiCoreError::NotFound(format!(
                "Subscription '{id}' not found"
            )));
        }
        let subscription = Self::get_with_conn(&tx, id)?;
        tx.commit()?;
        Ok(subscription)
    }

    /// Transition a subscription to a new status.
    /// When transitioning to cancelled, automatically sets cancelled_at.
    #[tracing::instrument(skip(self))]
    pub fn transition_status(
        &self,
        id: &str,
        new_status: SubscriptionStatus,
    ) -> Result<Subscription> {
        tracing::info!(
            "transitioning subscription {} to {}",
            id,
            new_status.as_str()
        );
        self.update(
            id,
            UpdateSubscription {
                status: Some(new_status),
                ..Default::default()
            },
        )
    }

    /// Cancel a subscription with an optional reason.
    #[tracing::instrument(skip(self))]
    pub fn cancel_with_reason(&self, id: &str, reason: Option<&str>) -> Result<Subscription> {
        tracing::info!("cancelling subscription: {}", id);
        let now = chrono::Utc::now().to_rfc3339();
        self.update(
            id,
            UpdateSubscription {
                status: Some(SubscriptionStatus::Cancelled),
                is_active: Some(false),
                cancelled_at: Some(Some(now)),
                cancellation_reason: Some(reason.map(|r| r.to_string())),
                ..Default::default()
            },
        )
    }

    /// Mark a subscription as reviewed (sets last_reviewed_at to current timestamp).
    pub fn mark_reviewed(&self, id: &str) -> Result<Subscription> {
        tracing::debug!("marking subscription reviewed: {}", id);
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
        validate_days(days_threshold)?;
        let conn = self.pool.get()?;
        let threshold = format!("-{} days", days_threshold);
        let mut stmt = conn.prepare(
            "SELECT id, name, amount, currency, billing_cycle, billing_day, category_id,
                    card_id, color, logo_url, notes, is_active, next_payment_date,
                    status, trial_end_date, status_changed_at, shared_count,
                    is_pinned, cancellation_reason, cancelled_at,
                    last_reviewed_at, created_at, updated_at
             FROM subscriptions
             WHERE is_active = 1
               AND (last_reviewed_at IS NULL OR last_reviewed_at < datetime('now', ?1))
             ORDER BY
                CASE WHEN last_reviewed_at IS NULL THEN 0 ELSE 1 END,
                last_reviewed_at ASC",
        )?;

        let mut rows = stmt.query(params![threshold])?;
        let mut results = Vec::new();
        while let Some(row) = rows.next()? {
            match read_subscription(row) {
                Ok(subscription) => results.push(subscription),
                Err(error) => {
                    let id = row
                        .get::<_, String>(0)
                        .unwrap_or_else(|_| "<invalid id>".into());
                    tracing::warn!(subscription_id = %id, %error, "skipping corrupt subscription");
                }
            }
        }
        tracing::debug!("found {} subscriptions needing review", results.len());
        Ok(results)
    }
}

fn validate_new_subscription(data: &NewSubscription) -> Result<()> {
    validate_name(&data.name, "subscription name")?;
    validate_amount(data.amount, "amount")?;
    validate_currency(&data.currency)?;
    validate_shared_count(data.shared_count)?;
    if let Some(day) = data.billing_day {
        validate_billing_day(day)?;
    }
    if let Some(color) = &data.color {
        validate_color(color)?;
    }
    if let Some(notes) = &data.notes {
        validate_notes(notes)?;
    }
    if let Some(date) = &data.next_payment_date {
        validate_date(date, "next payment date")?;
    }
    if let Some(date) = &data.trial_end_date {
        validate_date(date, "trial end date")?;
    }
    Ok(())
}

fn validate_subscription_patch(data: &UpdateSubscription) -> Result<()> {
    if let Some(name) = &data.name {
        validate_name(name, "subscription name")?;
    }
    if let Some(amount) = data.amount {
        validate_amount(amount, "amount")?;
    }
    if let Some(currency) = &data.currency {
        validate_currency(currency)?;
    }
    if let Some(shared_count) = data.shared_count {
        validate_shared_count(shared_count)?;
    }
    if let Some(Some(day)) = data.billing_day {
        validate_billing_day(day)?;
    }
    if let Some(Some(color)) = &data.color {
        validate_color(color)?;
    }
    if let Some(Some(notes)) = &data.notes {
        validate_notes(notes)?;
    }
    if let Some(Some(reason)) = &data.cancellation_reason {
        validate_notes(reason)?;
    }
    if let Some(Some(date)) = &data.next_payment_date {
        validate_date(date, "next payment date")?;
    }
    if let Some(Some(date)) = &data.trial_end_date {
        validate_date(date, "trial end date")?;
    }
    if let Some(Some(timestamp)) = &data.cancelled_at {
        validate_timestamp(timestamp, "cancelled at")?;
    }
    if let Some(Some(timestamp)) = &data.last_reviewed_at {
        validate_timestamp(timestamp, "last reviewed at")?;
    }
    Ok(())
}

fn validate_references(
    conn: &Connection,
    category_id: Option<&str>,
    card_id: Option<&str>,
) -> Result<()> {
    if let Some(id) = category_id {
        CategoryService::get_with_conn(conn, id)?;
    }
    if let Some(id) = card_id {
        PaymentCardService::get_with_conn(conn, id)?;
    }
    Ok(())
}

fn resumed_status(subscription: &Subscription) -> SubscriptionStatus {
    let unexpired_trial = subscription.status == SubscriptionStatus::Paused
        && subscription
            .trial_end_date
            .as_deref()
            .and_then(|date| chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").ok())
            .is_some_and(|date| date > chrono::Utc::now().date_naive());
    if unexpired_trial {
        SubscriptionStatus::Trial
    } else {
        SubscriptionStatus::Active
    }
}

/// Activity follows the status, not a separately persisted, contradictory flag.
/// An explicit false pauses billable states; terminal/non-billable status wins
/// over an explicit true. The caller handles reactivation without a status patch.
fn normalize_lifecycle(
    status: &mut SubscriptionStatus,
    explicit_activity: Option<bool>,
    trial_end_date: &mut Option<String>,
    cancellation_reason: &mut Option<String>,
    cancelled_at: &mut Option<String>,
    now: &str,
) -> bool {
    if status.is_billable() && explicit_activity == Some(false) {
        *status = SubscriptionStatus::Paused;
    }
    if !matches!(
        status,
        SubscriptionStatus::Trial | SubscriptionStatus::Paused
    ) {
        *trial_end_date = None;
    }
    if *status == SubscriptionStatus::Cancelled {
        if cancelled_at.is_none() {
            *cancelled_at = Some(now.to_string());
        }
    } else {
        *cancelled_at = None;
        *cancellation_reason = None;
    }
    status.is_billable()
}

fn row_to_subscription(row: &rusqlite::Row) -> rusqlite::Result<Subscription> {
    let mut subscription = Subscription {
        id: row.get(0)?,
        name: row.get(1)?,
        amount: row.get(2)?,
        currency: row.get(3)?,
        billing_cycle: BillingCycle::from_str(&row.get::<_, String>(4)?).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                4,
                rusqlite::types::Type::Text,
                Box::new(KessaiCoreError::Validation(
                    "invalid stored billing cycle".into(),
                )),
            )
        })?,
        billing_day: row.get(5)?,
        category_id: row.get(6)?,
        card_id: row.get(7)?,
        color: row.get(8)?,
        logo_url: row.get(9)?,
        notes: row.get(10)?,
        is_active: row.get::<_, i32>(11)? != 0,
        next_payment_date: row.get(12)?,
        status: SubscriptionStatus::from_str(&row.get::<_, String>(13)?).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                13,
                rusqlite::types::Type::Text,
                Box::new(KessaiCoreError::Validation(
                    "invalid stored subscription status".into(),
                )),
            )
        })?,
        trial_end_date: row.get(14)?,
        status_changed_at: row.get(15)?,
        shared_count: row.get::<_, i32>(16).unwrap_or(1),
        is_pinned: row.get::<_, i32>(17).unwrap_or(0) != 0,
        cancellation_reason: row.get(18)?,
        cancelled_at: row.get(19)?,
        last_reviewed_at: row.get(20)?,
        created_at: row.get(21)?,
        updated_at: row.get(22)?,
    };
    subscription.normalize_legacy();
    Ok(subscription)
}

/// Collection readers hide unsafe amount/date values; single-record reads do
/// not, because an update must be able to replace those corrupt fields.
fn read_subscription(row: &rusqlite::Row) -> Result<Subscription> {
    let subscription = row_to_subscription(row)?;
    validate_amount(subscription.amount, "amount")?;
    if let Some(date) = &subscription.next_payment_date {
        validate_date(date, "next payment date")?;
    }
    Ok(subscription)
}
