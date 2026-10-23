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
        // Install the timeout before any setup that can contend with another
        // initializer. It remains active for BEGIN IMMEDIATE in run_migrations.
        conn.execute_batch(
            "PRAGMA busy_timeout = 5000;
             PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;",
        )
    });

    // r2d2 opens `min_idle` connections concurrently at build time. Opening a
    // single connection first lets it persist WAL mode without contending with
    // sibling initializers (which otherwise log a recovered "database is locked");
    // later connections see WAL already set and the pragma is a no-op.
    let pool = Pool::builder()
        .max_size(4)
        .min_idle(Some(1))
        .connection_timeout(Duration::from_secs(10))
        .build(manager)?;

    Ok(pool)
}
