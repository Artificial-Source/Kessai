use rusqlite::{params, Connection};

use crate::db::DbPool;
use crate::error::{KessaiCoreError, Result};
use crate::models::tag::{NewTag, SubscriptionTagLink, Tag, UpdateTag};
use crate::validation::{validate_color, validate_name};

pub struct TagService {
    pool: DbPool,
}

impl TagService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// List all tags, sorted by name ASC.
    #[tracing::instrument(skip(self))]
    pub fn list(&self) -> Result<Vec<Tag>> {
        let conn = self.pool.get()?;
        Self::list_with_conn(&conn)
    }

    pub(crate) fn list_with_conn(conn: &Connection) -> Result<Vec<Tag>> {
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

        let results: Vec<Tag> = rows.collect::<std::result::Result<Vec<_>, _>>()?;
        tracing::debug!("listed {} tags", results.len());
        Ok(results)
    }

    /// Get a single tag by ID.
    pub fn get(&self, id: &str) -> Result<Tag> {
        let conn = self.pool.get()?;
        Self::get_with_conn(&conn, id)
    }

    pub(crate) fn get_with_conn(conn: &Connection, id: &str) -> Result<Tag> {
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
                KessaiCoreError::NotFound(format!("Tag '{id}' not found"))
            }
            other => KessaiCoreError::Database(other),
        })
    }

    /// Create a new tag.
    #[tracing::instrument(skip(self, data), fields(name = %data.name))]
    pub fn create(&self, data: NewTag) -> Result<Tag> {
        validate_name(&data.name, "tag name")?;
        if let Some(color) = &data.color {
            validate_color(color)?;
        }
        let conn = self.pool.get()?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let color = data.color.unwrap_or_else(|| "#6b7280".to_string());

        conn.execute(
            "INSERT INTO tags (id, name, color, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![id, data.name, color, now],
        )
        .map_err(|error| tag_write_error(error, &data.name))?;

        tracing::info!("tag created: {} ({})", data.name, id);
        Self::get_with_conn(&conn, &id)
    }

    /// Update a tag. Only provided fields are modified.
    #[tracing::instrument(skip(self, data))]
    pub fn update(&self, id: &str, data: UpdateTag) -> Result<Tag> {
        if let Some(name) = &data.name {
            validate_name(name, "tag name")?;
        }
        if let Some(color) = &data.color {
            validate_color(color)?;
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

        if sets.is_empty() {
            return Self::get_with_conn(&conn, id);
        }

        values.push(Box::new(id.to_string()));

        let sql = format!("UPDATE tags SET {} WHERE id = ?", sets.join(", "));

        let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, params.as_slice()).map_err(|error| {
            tag_write_error(error, data.name.as_deref().unwrap_or("requested name"))
        })?;

        tracing::info!("tag updated: {}", id);
        Self::get_with_conn(&conn, id)
    }

    /// Delete a tag.
    #[tracing::instrument(skip(self))]
    pub fn delete(&self, id: &str) -> Result<()> {
        let conn = self.pool.get()?;
        Self::get_with_conn(&conn, id)?;
        // subscription_tags rows are deleted via ON DELETE CASCADE
        conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?;
        tracing::info!("tag deleted: {}", id);
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
        tracing::info!("tag {} added to subscription {}", tag_id, subscription_id);
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
        tracing::info!(
            "tag {} removed from subscription {}",
            tag_id,
            subscription_id
        );
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

    /// List tag links for a batch of subscriptions.
    pub fn list_links_for_subscriptions(
        &self,
        subscription_ids: &[String],
    ) -> Result<Vec<SubscriptionTagLink>> {
        if subscription_ids.is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.pool.get()?;
        let placeholders = vec!["?"; subscription_ids.len()].join(",");
        let sql = format!(
            "SELECT subscription_id, tag_id
             FROM subscription_tags
             WHERE subscription_id IN ({})
             ORDER BY subscription_id ASC, tag_id ASC",
            placeholders
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(subscription_ids.iter()), |row| {
            Ok(SubscriptionTagLink {
                subscription_id: row.get(0)?,
                tag_id: row.get(1)?,
            })
        })?;

        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }
}

fn tag_write_error(error: rusqlite::Error, name: &str) -> KessaiCoreError {
    if matches!(
        error,
        rusqlite::Error::SqliteFailure(ref sqlite, _)
            if sqlite.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE
    ) {
        KessaiCoreError::Conflict(format!("tag name '{name}' already exists"))
    } else {
        KessaiCoreError::Database(error)
    }
}
