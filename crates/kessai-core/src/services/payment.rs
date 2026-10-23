use chrono::{Datelike, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};

use crate::db::DbPool;
use crate::error::{KessaiCoreError, Result};
use crate::models::payment::{
    NewPayment, Payment, PaymentStatus, PaymentWithSubscription, UpdatePayment,
};
use crate::models::subscription::BillingCycle;
use crate::utils::{advance_one_period, month_date_range};
use crate::validation::{validate_amount, validate_date, validate_notes, validate_timestamp};

pub struct PaymentService {
    pool: DbPool,
}

impl PaymentService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// List all payments, ordered by paid_at DESC.
    #[tracing::instrument(skip(self))]
    pub fn list(&self) -> Result<Vec<Payment>> {
        let conn = self.pool.get()?;
        Self::list_with_conn(&conn)
    }

    pub(crate) fn list_with_conn(conn: &Connection) -> Result<Vec<Payment>> {
        let mut stmt = conn.prepare(
            "SELECT id, subscription_id, amount, paid_at, due_date, status, notes, created_at
             FROM payments ORDER BY paid_at DESC",
        )?;

        let rows = stmt.query_map([], Self::map_payment)?;
        let results: Vec<Payment> = rows.collect::<std::result::Result<Vec<_>, _>>()?;
        tracing::debug!("listed {} payments", results.len());
        Ok(results)
    }

    /// List payments for a specific month.
    pub fn list_by_month(&self, year: i32, month: u32) -> Result<Vec<Payment>> {
        let (start_date, end_date) = month_date_range(year, month)?;
        let (start_date, end_date) = (start_date.to_string(), end_date.to_string());
        let conn = self.pool.get()?;

        let mut stmt = conn.prepare(
            "SELECT id, subscription_id, amount, paid_at, due_date, status, notes, created_at
             FROM payments
             WHERE due_date >= ?1 AND due_date < ?2
             ORDER BY due_date ASC",
        )?;

        let rows = stmt.query_map(params![start_date, end_date], Self::map_payment)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// List payments for a specific subscription.
    pub fn list_by_subscription(&self, subscription_id: &str) -> Result<Vec<Payment>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, subscription_id, amount, paid_at, due_date, status, notes, created_at
             FROM payments WHERE subscription_id = ?1 ORDER BY paid_at DESC",
        )?;

        let rows = stmt.query_map(params![subscription_id], Self::map_payment)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// List payments with subscription and category details for a month.
    pub fn list_with_details(&self, year: i32, month: u32) -> Result<Vec<PaymentWithSubscription>> {
        let (start_date, end_date) = month_date_range(year, month)?;
        let (start_date, end_date) = (start_date.to_string(), end_date.to_string());
        let conn = self.pool.get()?;

        let mut stmt = conn.prepare(
            "SELECT
                p.id, p.subscription_id, p.amount, p.paid_at, p.due_date,
                p.status, p.notes, p.created_at,
                s.name as subscription_name,
                s.color as subscription_color,
                c.name as category_name,
                c.color as category_color
             FROM payments p
             JOIN subscriptions s ON p.subscription_id = s.id
             LEFT JOIN categories c ON s.category_id = c.id
             WHERE p.due_date >= ?1 AND p.due_date < ?2
             ORDER BY p.due_date ASC",
        )?;

        let rows = stmt.query_map(params![start_date, end_date], |row| {
            let status_str: String = row.get(5)?;
            Ok(PaymentWithSubscription {
                id: row.get(0)?,
                subscription_id: row.get(1)?,
                amount: row.get(2)?,
                paid_at: row.get(3)?,
                due_date: row.get(4)?,
                status: PaymentStatus::from_str(&status_str).unwrap_or(PaymentStatus::Paid),
                notes: row.get(6)?,
                created_at: row.get(7)?,
                subscription_name: row.get(8)?,
                subscription_color: row.get(9)?,
                category_name: row.get(10)?,
                category_color: row.get(11)?,
            })
        })?;

        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Create a new payment.
    pub fn create(&self, data: NewPayment) -> Result<Payment> {
        validate_amount(data.amount, "payment amount")?;
        validate_date(&data.due_date, "due date")?;
        validate_timestamp(&data.paid_at, "paid_at")?;
        if let Some(notes) = &data.notes {
            validate_notes(notes)?;
        }
        let conn = self.pool.get()?;
        ensure_subscription_exists(&conn, &data.subscription_id)?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        let recorded_outcome = if data.status == PaymentStatus::Pending {
            0
        } else {
            1
        };
        conn.execute(
            "INSERT INTO payments
             (id, subscription_id, amount, paid_at, due_date, status, notes, created_at, recorded_outcome)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                data.subscription_id,
                data.amount,
                data.paid_at,
                data.due_date,
                data.status.as_str(),
                data.notes,
                now,
                recorded_outcome,
            ],
        )
        .map_err(|error| payment_write_error(error, &data.subscription_id, &data.due_date))?;

        Ok(Payment {
            id,
            subscription_id: data.subscription_id,
            amount: data.amount,
            paid_at: data.paid_at,
            due_date: data.due_date,
            status: data.status,
            notes: data.notes,
            created_at: Some(now),
        })
    }

    /// Update an existing payment.
    pub fn update(&self, id: &str, data: UpdatePayment) -> Result<Payment> {
        if let Some(amount) = data.amount {
            validate_amount(amount, "payment amount")?;
        }
        if let Some(paid_at) = &data.paid_at {
            validate_timestamp(paid_at, "paid_at")?;
        }
        if let Some(Some(notes)) = &data.notes {
            validate_notes(notes)?;
        }
        let mut conn = self.pool.get()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let existing = Self::get_with_conn(&tx, id)?;
        if data.amount.is_none()
            && data.paid_at.is_none()
            && data.status.is_none()
            && data.notes.is_none()
        {
            return Ok(existing);
        }

        tx.execute(
            "UPDATE payments SET
                amount = COALESCE(?1, amount),
                paid_at = COALESCE(?2, paid_at),
                status = COALESCE(?3, status),
                notes = CASE WHEN ?4 THEN ?5 ELSE notes END,
                recorded_outcome = CASE
                    WHEN ?3 IS NULL THEN recorded_outcome
                    WHEN ?3 = 'pending' THEN 0 ELSE 1 END
             WHERE id = ?6",
            params![
                data.amount,
                data.paid_at,
                data.status.as_ref().map(PaymentStatus::as_str),
                data.notes.is_some(),
                data.notes.as_ref().and_then(|notes| notes.as_deref()),
                id,
            ],
        )
        .map_err(|error| {
            payment_write_error(error, &existing.subscription_id, &existing.due_date)
        })?;
        if data.status.is_some() {
            tx.execute(
                "UPDATE payments
                    SET recorded_outcome = 1
                  WHERE id = (
                      SELECT MIN(candidate.id) FROM payments candidate
                       WHERE candidate.subscription_id = ?1
                         AND candidate.due_date = ?2
                         AND candidate.status IN ('paid', 'skipped')
                         AND candidate.recorded_outcome = 0
                  )
                    AND NOT EXISTS (
                        SELECT 1 FROM payments marked
                         WHERE marked.subscription_id = ?1
                           AND marked.due_date = ?2
                           AND marked.recorded_outcome = 1
                    )",
                params![existing.subscription_id, existing.due_date],
            )
            .map_err(|error| {
                payment_write_error(error, &existing.subscription_id, &existing.due_date)
            })?;
        }
        let updated = Self::get_with_conn(&tx, id)?;
        tx.commit()?;
        Ok(updated)
    }

    /// Delete a payment by ID.
    pub fn delete(&self, id: &str) -> Result<()> {
        let conn = self.pool.get()?;
        let changes = conn.execute("DELETE FROM payments WHERE id = ?1", params![id])?;
        if changes == 0 {
            return Err(KessaiCoreError::NotFound(format!(
                "Payment '{id}' not found"
            )));
        }
        tracing::info!("payment deleted: {}", id);
        Ok(())
    }

    /// Record a payment as paid. Exact replays for the same subscription and due
    /// date return the original row; a different amount or skipped outcome conflicts.
    #[tracing::instrument(skip(self))]
    pub fn mark_as_paid(
        &self,
        subscription_id: &str,
        due_date: &str,
        amount: f64,
    ) -> Result<Payment> {
        tracing::info!(
            "marking payment paid: {} on {} (amount: {})",
            subscription_id,
            due_date,
            amount
        );
        self.record_outcome(subscription_id, due_date, amount, PaymentStatus::Paid)
    }

    /// Record a payment as skipped. Exact replays for the same subscription and due
    /// date return the original row; a different amount or paid outcome conflicts.
    #[tracing::instrument(skip(self))]
    pub fn skip_payment(
        &self,
        subscription_id: &str,
        due_date: &str,
        amount: f64,
    ) -> Result<Payment> {
        tracing::info!("skipping payment: {} on {}", subscription_id, due_date);
        self.record_outcome(subscription_id, due_date, amount, PaymentStatus::Skipped)
    }

    fn record_outcome(
        &self,
        subscription_id: &str,
        due_date: &str,
        amount: f64,
        status: PaymentStatus,
    ) -> Result<Payment> {
        validate_amount(amount, "payment amount")?;
        validate_date(due_date, "due date")?;
        let mut conn = self.pool.get()?;
        // Reserve the writer before reading so independent pools wait rather
        // than trying to upgrade a stale WAL read snapshot.
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let (current_due, cycle, billing_day): (Option<String>, String, Option<i32>) = tx
            .query_row(
                "SELECT next_payment_date, billing_cycle, billing_day
                 FROM subscriptions WHERE id = ?1",
                params![subscription_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?
            .ok_or_else(|| {
                KessaiCoreError::NotFound(format!("Subscription '{subscription_id}' not found"))
            })?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        tx.execute(
            "INSERT INTO payments
             (id, subscription_id, amount, paid_at, due_date, status, notes, created_at, recorded_outcome)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, 1)
             ON CONFLICT(subscription_id, due_date) WHERE recorded_outcome = 1 DO NOTHING",
            params![id, subscription_id, amount, now, due_date, status.as_str(), now],
        )
        .map_err(|error| payment_write_error(error, subscription_id, due_date))?;

        let (payment, recorded_status) = tx.query_row(
            "SELECT id, subscription_id, amount, paid_at, due_date, status, notes, created_at
             FROM payments
             WHERE subscription_id = ?1 AND due_date = ?2 AND recorded_outcome = 1",
            params![subscription_id, due_date],
            |row| Ok((Self::map_payment(row)?, row.get::<_, String>(5)?)),
        )?;

        if recorded_status != status.as_str() || payment.amount != amount {
            return Err(KessaiCoreError::Conflict(format!(
                "payment outcome for subscription '{subscription_id}' on '{due_date}' already exists with status '{}' and amount {}",
                recorded_status,
                payment.amount
            )));
        }
        if matches!(status, PaymentStatus::Paid | PaymentStatus::Skipped)
            && current_due
                .as_deref()
                .map(|date| date.split('T').next().unwrap_or(date))
                == Some(due_date)
        {
            let date = NaiveDate::parse_from_str(due_date, "%Y-%m-%d").map_err(|_| {
                KessaiCoreError::Validation("due date must be a valid YYYY-MM-DD date".into())
            })?;
            let cycle = BillingCycle::from_str(&cycle).ok_or_else(|| {
                KessaiCoreError::Validation(format!("invalid stored billing cycle '{cycle}'"))
            })?;
            // Reuse the original recurrence day across settled periods so an
            // intermediate February clamp cannot shift later occurrences.
            let recurrence_day = Some(
                billing_day
                    .map(|day| day.clamp(1, 31) as u32)
                    .unwrap_or(date.day()),
            );
            let mut settled = tx.prepare(
                "SELECT EXISTS(SELECT 1 FROM payments
                 WHERE subscription_id = ?1 AND due_date = ?2
                 AND status IN ('paid', 'skipped'))",
            )?;
            let mut next = date;
            let mut next_date;
            let mut periods = 0;
            loop {
                let previous = next;
                next = advance_one_period(previous, &cycle, recurrence_day);
                if next <= previous {
                    return Err(KessaiCoreError::Validation(
                        "next payment date is outside the supported date range".into(),
                    ));
                }
                next_date = next.to_string();
                validate_date(&next_date, "next payment date")?;
                periods += 1;
                let is_settled: bool =
                    settled.query_row(params![subscription_id, next_date], |row| row.get(0))?;
                if !is_settled {
                    break;
                }
                if periods == 120 {
                    return Err(KessaiCoreError::Validation(
                        "next payment date advancement exceeds the limit of 120 billing periods"
                            .into(),
                    ));
                }
            }
            // Persist an implicit anchor only when the final date is clamped.
            let billing_day = if billing_day.is_none()
                && date.day() > 28
                && cycle != BillingCycle::Weekly
                && next.day() < date.day()
            {
                Some(date.day() as i32)
            } else {
                billing_day
            };
            let next = next_date;
            tx.execute(
                "UPDATE subscriptions SET next_payment_date = ?1, updated_at = ?2,
                 billing_day = ?3 WHERE id = ?4",
                params![next, now, billing_day, subscription_id],
            )?;
        }
        tx.commit()?;
        Ok(payment)
    }

    /// Whether a paid or skipped outcome exists; pending-only rows do not count.
    pub fn is_recorded(&self, subscription_id: &str, due_date: &str) -> Result<bool> {
        let conn = self.pool.get()?;
        Ok(conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM payments
             WHERE subscription_id = ?1 AND due_date = ?2 AND status IN ('paid', 'skipped'))",
            params![subscription_id, due_date],
            |row| row.get(0),
        )?)
    }

    /// Get a single payment by ID.
    pub fn get(&self, id: &str) -> Result<Payment> {
        let conn = self.pool.get()?;
        Self::get_with_conn(&conn, id)
    }

    pub(crate) fn get_with_conn(conn: &Connection, id: &str) -> Result<Payment> {
        conn.query_row(
            "SELECT id, subscription_id, amount, paid_at, due_date, status, notes, created_at
             FROM payments WHERE id = ?1",
            params![id],
            Self::map_payment,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                KessaiCoreError::NotFound(format!("Payment '{id}' not found"))
            }
            other => KessaiCoreError::Database(other),
        })
    }

    pub(crate) fn map_payment(row: &rusqlite::Row) -> rusqlite::Result<Payment> {
        let status_str: String = row.get(5)?;
        Ok(Payment {
            id: row.get(0)?,
            subscription_id: row.get(1)?,
            amount: row.get(2)?,
            paid_at: row.get(3)?,
            due_date: row.get(4)?,
            status: PaymentStatus::from_str(&status_str).unwrap_or(PaymentStatus::Paid),
            notes: row.get(6)?,
            created_at: row.get(7)?,
        })
    }
}

fn ensure_subscription_exists(conn: &Connection, id: &str) -> Result<()> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM subscriptions WHERE id = ?1)",
        params![id],
        |row| row.get(0),
    )?;
    if exists {
        Ok(())
    } else {
        Err(KessaiCoreError::NotFound(format!(
            "Subscription '{id}' not found"
        )))
    }
}

fn payment_write_error(
    error: rusqlite::Error,
    subscription_id: &str,
    due_date: &str,
) -> KessaiCoreError {
    if matches!(
        error,
        rusqlite::Error::SqliteFailure(ref sqlite, _)
            if sqlite.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE
    ) {
        KessaiCoreError::Conflict(format!(
            "payment outcome for subscription '{subscription_id}' on '{due_date}' already exists"
        ))
    } else {
        KessaiCoreError::Database(error)
    }
}
