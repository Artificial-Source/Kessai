use rusqlite::params;

use crate::db::DbPool;
use crate::error::{Result, SubbyCoreError};
use crate::models::category::{Category, NewCategory, UpdateCategory};

pub struct CategoryService {
    pool: DbPool,
}

impl CategoryService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// List all categories, sorted by name ASC.
    pub fn list(&self) -> Result<Vec<Category>> {
        let conn = self.pool.get()?;
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

        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Get a single category by ID.
    pub fn get(&self, id: &str) -> Result<Category> {
        let conn = self.pool.get()?;
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
                SubbyCoreError::NotFound(format!("Category '{id}' not found"))
            }
            other => SubbyCoreError::Database(other),
        })
    }

    /// Create a new (non-default) category.
    pub fn create(&self, data: NewCategory) -> Result<Category> {
        let conn = self.pool.get()?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO categories (id, name, color, icon, is_default, created_at)
             VALUES (?1, ?2, ?3, ?4, 0, ?5)",
            params![id, data.name, data.color, data.icon, now],
        )?;

        self.get(&id)
    }

    /// Update a category. Only provided fields are modified.
    /// Cannot change `is_default` or `id`.
    pub fn update(&self, id: &str, data: UpdateCategory) -> Result<Category> {
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
            return self.get(id);
        }

        values.push(Box::new(id.to_string()));

        let sql = format!("UPDATE categories SET {} WHERE id = ?", sets.join(", "));

        let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, params.as_slice())?;

        self.get(id)
    }

    /// Delete a category.
    ///
    /// - Rejects deletion of default categories with `CannotDeleteDefault`.
    /// - Cascades by setting `subscriptions.category_id = NULL` for affected subscriptions.
    pub fn delete(&self, id: &str) -> Result<()> {
        let category = self.get(id)?;
        if category.is_default {
            return Err(SubbyCoreError::CannotDeleteDefault);
        }

        let conn = self.pool.get()?;
        conn.execute(
            "UPDATE subscriptions SET category_id = NULL WHERE category_id = ?1",
            params![id],
        )?;
        conn.execute("DELETE FROM categories WHERE id = ?1", params![id])?;
        Ok(())
    }
}
