use rusqlite::{params, Connection, TransactionBehavior};

use crate::db::DbPool;
use crate::error::{KessaiCoreError, Result};
use crate::models::category::{Category, NewCategory, UpdateCategory};
use crate::validation::{validate_color, validate_name};

pub struct CategoryService {
    pool: DbPool,
}

impl CategoryService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// List all categories, sorted by name ASC.
    #[tracing::instrument(skip(self))]
    pub fn list(&self) -> Result<Vec<Category>> {
        let conn = self.pool.get()?;
        Self::list_with_conn(&conn)
    }

    pub(crate) fn list_with_conn(conn: &Connection) -> Result<Vec<Category>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, color, icon, is_default, created_at
             FROM categories ORDER BY name ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Category {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                icon: row.get(3)?,
                is_default: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
            })
        })?;

        let results: Vec<Category> = rows.collect::<std::result::Result<Vec<_>, _>>()?;
        tracing::debug!("listed {} categories", results.len());
        Ok(results)
    }

    /// Get a single category by ID.
    pub fn get(&self, id: &str) -> Result<Category> {
        let conn = self.pool.get()?;
        Self::get_with_conn(&conn, id)
    }

    pub(crate) fn get_with_conn(conn: &Connection, id: &str) -> Result<Category> {
        conn.query_row(
            "SELECT id, name, color, icon, is_default, created_at
             FROM categories WHERE id = ?1",
            params![id],
            |row| {
                Ok(Category {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color: row.get(2)?,
                    icon: row.get(3)?,
                    is_default: row.get::<_, i32>(4)? != 0,
                    created_at: row.get(5)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                KessaiCoreError::NotFound(format!("Category '{id}' not found"))
            }
            other => KessaiCoreError::Database(other),
        })
    }

    /// Create a new (non-default) category.
    #[tracing::instrument(skip(self, data), fields(name = %data.name))]
    pub fn create(&self, data: NewCategory) -> Result<Category> {
        validate_name(&data.name, "category name")?;
        validate_color(&data.color)?;
        validate_name(&data.icon, "category icon")?;
        let conn = self.pool.get()?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO categories (id, name, color, icon, is_default, created_at)
             VALUES (?1, ?2, ?3, ?4, 0, ?5)",
            params![id, data.name, data.color, data.icon, now],
        )
        .map_err(|error| category_write_error(error, &data.name))?;

        tracing::info!("category created: {} ({})", data.name, id);
        Self::get_with_conn(&conn, &id)
    }

    /// Update a category. Only provided fields are modified.
    /// Cannot change `is_default` or `id`.
    #[tracing::instrument(skip(self, data))]
    pub fn update(&self, id: &str, data: UpdateCategory) -> Result<Category> {
        if let Some(name) = &data.name {
            validate_name(name, "category name")?;
        }
        if let Some(color) = &data.color {
            validate_color(color)?;
        }
        if let Some(icon) = &data.icon {
            validate_name(icon, "category icon")?;
        }
        let conn = self.pool.get()?;

        let mut sets = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref name) = data.name {
            sets.push("name = ?");
            values.push(Box::new(name.clone()));
        }
        if let Some(ref color) = data.color {
            sets.push("color = ?");
            values.push(Box::new(color.clone()));
        }
        if let Some(ref icon) = data.icon {
            sets.push("icon = ?");
            values.push(Box::new(icon.clone()));
        }

        if sets.is_empty() {
            return Self::get_with_conn(&conn, id);
        }

        values.push(Box::new(id.to_string()));

        let sql = format!("UPDATE categories SET {} WHERE id = ?", sets.join(", "));

        let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, params.as_slice()).map_err(|error| {
            category_write_error(error, data.name.as_deref().unwrap_or("requested name"))
        })?;

        tracing::info!("category updated: {}", id);
        Self::get_with_conn(&conn, id)
    }

    /// Delete a category.
    ///
    /// - Rejects deletion of default categories with `CannotDeleteDefault`.
    /// - Cascades by setting `subscriptions.category_id = NULL` for affected subscriptions.
    #[tracing::instrument(skip(self))]
    pub fn delete(&self, id: &str) -> Result<()> {
        let mut conn = self.pool.get()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let category = Self::get_with_conn(&tx, id)?;
        if category.is_default {
            return Err(KessaiCoreError::CannotDeleteDefault);
        }

        tx.execute(
            "UPDATE subscriptions SET category_id = NULL WHERE category_id = ?1",
            params![id],
        )?;
        let changes = tx.execute("DELETE FROM categories WHERE id = ?1", params![id])?;
        if changes == 0 {
            return Err(KessaiCoreError::NotFound(format!(
                "Category '{id}' not found"
            )));
        }
        tx.commit()?;
        tracing::info!("category deleted: {}", id);
        Ok(())
    }
}

fn category_write_error(error: rusqlite::Error, name: &str) -> KessaiCoreError {
    if matches!(
        error,
        rusqlite::Error::SqliteFailure(ref sqlite, _)
            if matches!(
                sqlite.extended_code,
                rusqlite::ffi::SQLITE_CONSTRAINT_TRIGGER
                    | rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE
            )
    ) {
        KessaiCoreError::Conflict(format!("category name '{name}' already exists"))
    } else {
        KessaiCoreError::Database(error)
    }
}
