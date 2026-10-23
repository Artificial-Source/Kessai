use rusqlite::{params, Connection, TransactionBehavior};

use crate::db::DbPool;
use crate::error::{KessaiCoreError, Result};
use crate::models::payment_card::{CardType, NewPaymentCard, PaymentCard, UpdatePaymentCard};
use crate::validation::{validate_amount, validate_color, validate_last_four, validate_name};

pub struct PaymentCardService {
    pool: DbPool,
}

impl PaymentCardService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// List all payment cards, sorted by name.
    pub fn list(&self) -> Result<Vec<PaymentCard>> {
        let conn = self.pool.get()?;
        Self::list_with_conn(&conn)
    }

    pub(crate) fn list_with_conn(conn: &Connection) -> Result<Vec<PaymentCard>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, card_type, last_four, color, credit_limit, created_at
             FROM payment_cards ORDER BY name",
        )?;

        let rows = stmt.query_map([], Self::map_card)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Get a single payment card by ID.
    pub fn get(&self, id: &str) -> Result<PaymentCard> {
        let conn = self.pool.get()?;
        Self::get_with_conn(&conn, id)
    }

    pub(crate) fn get_with_conn(conn: &Connection, id: &str) -> Result<PaymentCard> {
        conn.query_row(
            "SELECT id, name, card_type, last_four, color, credit_limit, created_at
             FROM payment_cards WHERE id = ?1",
            params![id],
            Self::map_card,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                KessaiCoreError::NotFound(format!("Payment card '{id}' not found"))
            }
            other => KessaiCoreError::Database(other),
        })
    }

    /// Create a new payment card.
    #[tracing::instrument(skip(self, data), fields(name = %data.name))]
    pub fn create(&self, data: NewPaymentCard) -> Result<PaymentCard> {
        validate_name(&data.name, "payment card name")?;
        validate_color(&data.color)?;
        if let Some(last_four) = &data.last_four {
            validate_last_four(last_four)?;
        }
        if let Some(credit_limit) = data.credit_limit {
            validate_amount(credit_limit, "credit limit")?;
        }
        let conn = self.pool.get()?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO payment_cards (id, name, card_type, last_four, color, credit_limit, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                data.name,
                data.card_type.as_str(),
                data.last_four,
                data.color,
                data.credit_limit,
                now,
            ],
        )?;

        tracing::info!("payment card created: {} ({})", data.name, id);
        Self::get_with_conn(&conn, &id)
    }

    /// Update a payment card. Only provided fields are modified.
    #[tracing::instrument(skip(self, data))]
    pub fn update(&self, id: &str, data: UpdatePaymentCard) -> Result<PaymentCard> {
        if let Some(name) = &data.name {
            validate_name(name, "payment card name")?;
        }
        if let Some(color) = &data.color {
            validate_color(color)?;
        }
        if let Some(Some(last_four)) = &data.last_four {
            validate_last_four(last_four)?;
        }
        if let Some(Some(credit_limit)) = data.credit_limit {
            validate_amount(credit_limit, "credit limit")?;
        }
        let conn = self.pool.get()?;

        let mut sets = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref name) = data.name {
            sets.push("name = ?");
            values.push(Box::new(name.clone()));
        }
        if let Some(ref card_type) = data.card_type {
            sets.push("card_type = ?");
            values.push(Box::new(card_type.as_str().to_string()));
        }
        if let Some(ref last_four) = data.last_four {
            sets.push("last_four = ?");
            values.push(Box::new(last_four.clone()));
        }
        if let Some(ref color) = data.color {
            sets.push("color = ?");
            values.push(Box::new(color.clone()));
        }
        if let Some(ref credit_limit) = data.credit_limit {
            sets.push("credit_limit = ?");
            values.push(Box::new(*credit_limit));
        }

        if sets.is_empty() {
            return Self::get_with_conn(&conn, id);
        }

        values.push(Box::new(id.to_string()));

        let sql = format!("UPDATE payment_cards SET {} WHERE id = ?", sets.join(", "));

        let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, params.as_slice())?;

        tracing::info!("payment card updated: {}", id);
        Self::get_with_conn(&conn, id)
    }

    /// Delete a payment card.
    /// Cascades by setting `subscriptions.card_id = NULL` for affected subscriptions.
    #[tracing::instrument(skip(self))]
    pub fn delete(&self, id: &str) -> Result<()> {
        let mut conn = self.pool.get()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        Self::get_with_conn(&tx, id)?;
        tx.execute(
            "UPDATE subscriptions SET card_id = NULL WHERE card_id = ?1",
            params![id],
        )?;
        let changes = tx.execute("DELETE FROM payment_cards WHERE id = ?1", params![id])?;
        if changes == 0 {
            return Err(KessaiCoreError::NotFound(format!(
                "Payment card '{id}' not found"
            )));
        }
        tx.commit()?;
        tracing::info!("payment card deleted: {}", id);
        Ok(())
    }

    fn map_card(row: &rusqlite::Row) -> rusqlite::Result<PaymentCard> {
        let card_type_str: String = row.get(2)?;
        Ok(PaymentCard {
            id: row.get(0)?,
            name: row.get(1)?,
            card_type: CardType::from_str(&card_type_str).unwrap_or(CardType::Debit),
            last_four: row.get(3)?,
            color: row.get(4)?,
            credit_limit: row.get(5)?,
            created_at: row.get(6)?,
        })
    }
}
