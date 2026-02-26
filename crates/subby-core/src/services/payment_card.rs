use rusqlite::params;

use crate::db::DbPool;
use crate::error::{Result, SubbyCoreError};
use crate::models::payment_card::{CardType, NewPaymentCard, PaymentCard, UpdatePaymentCard};

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
        let mut stmt = conn.prepare(
            "SELECT id, name, card_type, last_four, color, credit_limit, created_at
             FROM payment_cards ORDER BY name",
        )?;

        let rows = stmt.query_map([], |row| Self::map_card(row))?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Get a single payment card by ID.
    pub fn get(&self, id: &str) -> Result<PaymentCard> {
        let conn = self.pool.get()?;
        conn.query_row(
            "SELECT id, name, card_type, last_four, color, credit_limit, created_at
             FROM payment_cards WHERE id = ?1",
            params![id],
            |row| Self::map_card(row),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                SubbyCoreError::NotFound(format!("Payment card '{id}' not found"))
            }
            other => SubbyCoreError::Database(other),
        })
    }

    /// Create a new payment card.
    pub fn create(&self, data: NewPaymentCard) -> Result<PaymentCard> {
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

        self.get(&id)
    }

    /// Update a payment card. Only provided fields are modified.
    pub fn update(&self, id: &str, data: UpdatePaymentCard) -> Result<PaymentCard> {
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
            return self.get(id);
        }

        values.push(Box::new(id.to_string()));

        let sql = format!("UPDATE payment_cards SET {} WHERE id = ?", sets.join(", "));

        let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, params.as_slice())?;

        self.get(id)
    }

    /// Delete a payment card.
    /// Cascades by setting `subscriptions.card_id = NULL` for affected subscriptions.
    pub fn delete(&self, id: &str) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute(
            "UPDATE subscriptions SET card_id = NULL WHERE card_id = ?1",
            params![id],
        )?;
        let changes = conn.execute("DELETE FROM payment_cards WHERE id = ?1", params![id])?;
        if changes == 0 {
            return Err(SubbyCoreError::NotFound(format!(
                "Payment card '{id}' not found"
            )));
        }
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
