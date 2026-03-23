use rusqlite::params;

use crate::db::DbPool;
use crate::error::{Result, SubbyCoreError};
use crate::models::tag::{NewTag, Tag, UpdateTag};

pub struct TagService {
    pool: DbPool,
}

impl TagService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// List all tags, sorted by name ASC.
    pub fn list(&self) -> Result<Vec<Tag>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, color, created_at
             FROM tags ORDER BY name ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;

        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Get a single tag by ID.
    pub fn get(&self, id: &str) -> Result<Tag> {
        let conn = self.pool.get()?;
        conn.query_row(
            "SELECT id, name, color, created_at
             FROM tags WHERE id = ?1",
            params![id],
            |row| {
                Ok(Tag {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color: row.get(2)?,
                    created_at: row.get(3)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                SubbyCoreError::NotFound(format!("Tag '{id}' not found"))
            }
            other => SubbyCoreError::Database(other),
        })
    }

    /// Create a new tag.
    pub fn create(&self, data: NewTag) -> Result<Tag> {
        let conn = self.pool.get()?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let color = data.color.unwrap_or_else(|| "#6b7280".to_string());

        conn.execute(
            "INSERT INTO tags (id, name, color, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![id, data.name, color, now],
        )?;

        self.get(&id)
    }

    /// Update a tag. Only provided fields are modified.
    pub fn update(&self, id: &str, data: UpdateTag) -> Result<Tag> {
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

        if sets.is_empty() {
            return self.get(id);
        }

        values.push(Box::new(id.to_string()));

        let sql = format!("UPDATE tags SET {} WHERE id = ?", sets.join(", "));

        let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, params.as_slice())?;

        self.get(id)
    }

    /// Delete a tag.
    pub fn delete(&self, id: &str) -> Result<()> {
        // Verify the tag exists
        self.get(id)?;

        let conn = self.pool.get()?;
        // subscription_tags rows are deleted via ON DELETE CASCADE
        conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Add a tag to a subscription.
    pub fn add_to_subscription(&self, subscription_id: &str, tag_id: &str) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute(
            "INSERT OR IGNORE INTO subscription_tags (subscription_id, tag_id)
             VALUES (?1, ?2)",
            params![subscription_id, tag_id],
        )?;
        Ok(())
    }

    /// Remove a tag from a subscription.
    pub fn remove_from_subscription(&self, subscription_id: &str, tag_id: &str) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute(
            "DELETE FROM subscription_tags
             WHERE subscription_id = ?1 AND tag_id = ?2",
            params![subscription_id, tag_id],
        )?;
        Ok(())
    }

    /// List all tags for a given subscription.
    pub fn list_for_subscription(&self, subscription_id: &str) -> Result<Vec<Tag>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, t.color, t.created_at
             FROM tags t
             INNER JOIN subscription_tags st ON st.tag_id = t.id
             WHERE st.subscription_id = ?1
             ORDER BY t.name ASC",
        )?;

        let rows = stmt.query_map(params![subscription_id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;

        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }
}
