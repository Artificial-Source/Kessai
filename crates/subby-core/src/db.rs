use std::path::Path;
use std::time::Duration;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

use crate::error::Result;

pub type DbPool = Pool<SqliteConnectionManager>;

/// Creates an r2d2 connection pool for the SQLite database at `db_path`.
///
/// Configures:
/// - WAL journal mode for concurrent read/write
/// - Foreign keys enabled
/// - 5-second busy timeout for concurrent access (MCP + Tauri)
/// - Max 4 connections (desktop app, single user)
pub fn create_pool(db_path: &Path) -> Result<DbPool> {
    let manager = SqliteConnectionManager::file(db_path).with_init(|conn| {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )
    });

    let pool = Pool::builder()
        .max_size(4)
        .connection_timeout(Duration::from_secs(10))
        .build(manager)?;

    Ok(pool)
}
