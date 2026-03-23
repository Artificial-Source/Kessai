use rusqlite::params;

use crate::db::DbPool;
use crate::error::{Result, SubbyCoreError};
use crate::models::payment::{
    NewPayment, Payment, PaymentStatus, PaymentWithSubscription, UpdatePayment,
};

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
        let conn = self.pool.get()?;
        let start_date = format!("{year}-{month:02}-01");
        let end_date = if month == 12 {
            format!("{}-01-01", year + 1)
        } else {
            format!("{year}-{:02}-01", month + 1)
        };

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
        let conn = self.pool.get()?;
        let start_date = format!("{year}-{month:02}-01");
        let end_date = if month == 12 {
            format!("{}-01-01", year + 1)
        } else {
            format!("{year}-{:02}-01", month + 1)
        };

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
        let conn = self.pool.get()?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO payments (id, subscription_id, amount, paid_at, due_date, status, notes, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                data.subscription_id,
                data.amount,
                data.paid_at,
                data.due_date,
                data.status.as_str(),
                data.notes,
                now,
            ],
        )?;

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
        let conn = self.pool.get()?;

        let mut sets = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(amount) = data.amount {
            sets.push("amount = ?");
            values.push(Box::new(amount));
        }
        if let Some(ref paid_at) = data.paid_at {
            sets.push("paid_at = ?");
            values.push(Box::new(paid_at.clone()));
        }
        if let Some(ref status) = data.status {
            sets.push("status = ?");
            values.push(Box::new(status.as_str().to_string()));
        }
        if let Some(ref notes) = data.notes {
            sets.push("notes = ?");
            values.push(Box::new(notes.clone()));
        }

        if sets.is_empty() {
            return self.get(id);
        }

        values.push(Box::new(id.to_string()));

        let sql = format!("UPDATE payments SET {} WHERE id = ?", sets.join(", "));

        let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, params.as_slice())?;

        self.get(id)
    }

    /// Delete a payment by ID.
    pub fn delete(&self, id: &str) -> Result<()> {
        let conn = self.pool.get()?;
        let changes = conn.execute("DELETE FROM payments WHERE id = ?1", params![id])?;
        if changes == 0 {
            return Err(SubbyCoreError::NotFound(format!(
                "Payment '{id}' not found"
            )));
        }
        tracing::info!("payment deleted: {}", id);
        Ok(())
    }

    /// Record a payment as paid.
    #[tracing::instrument(skip(self))]
    pub fn mark_as_paid(
        &self,
        subscription_id: &str,
        due_date: &str,
        amount: f64,
    ) -> Result<Payment> {
        tracing::info!("marking payment paid: {} on {} (amount: {})", subscription_id, due_date, amount);
        let now = chrono::Utc::now().to_rfc3339();
        self.create(NewPayment {
            subscription_id: subscription_id.to_string(),
            amount,
            paid_at: now,
            due_date: due_date.to_string(),
            status: PaymentStatus::Paid,
            notes: None,
        })
    }

    /// Record a payment as skipped.
    #[tracing::instrument(skip(self))]
    pub fn skip_payment(
        &self,
        subscription_id: &str,
        due_date: &str,
        amount: f64,
    ) -> Result<Payment> {
        tracing::info!("skipping payment: {} on {}", subscription_id, due_date);
        let now = chrono::Utc::now().to_rfc3339();
        self.create(NewPayment {
            subscription_id: subscription_id.to_string(),
            amount,
            paid_at: now,
            due_date: due_date.to_string(),
            status: PaymentStatus::Skipped,
            notes: None,
        })
    }

    /// Check if a payment is already recorded for a subscription and due date.
    pub fn is_recorded(&self, subscription_id: &str, due_date: &str) -> Result<bool> {
        let conn = self.pool.get()?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM payments WHERE subscription_id = ?1 AND due_date = ?2",
            params![subscription_id, due_date],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Get a single payment by ID.
    fn get(&self, id: &str) -> Result<Payment> {
        let conn = self.pool.get()?;
        conn.query_row(
            "SELECT id, subscription_id, amount, paid_at, due_date, status, notes, created_at
             FROM payments WHERE id = ?1",
            params![id],
            Self::map_payment,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                SubbyCoreError::NotFound(format!("Payment '{id}' not found"))
            }
            other => SubbyCoreError::Database(other),
        })
    }

    fn map_payment(row: &rusqlite::Row) -> rusqlite::Result<Payment> {
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
