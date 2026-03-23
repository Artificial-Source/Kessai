use rusqlite::Connection;

use crate::error::Result;

struct Migration {
    version: u32,
    description: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "create_initial_tables",
        sql: r#"
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL,
                icon TEXT NOT NULL,
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS subscriptions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'USD',
                billing_cycle TEXT NOT NULL,
                billing_day INTEGER,
                category_id TEXT REFERENCES categories(id),
                color TEXT,
                logo_url TEXT,
                notes TEXT,
                is_active INTEGER NOT NULL DEFAULT 1,
                next_payment_date TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS settings (
                id TEXT PRIMARY KEY DEFAULT 'singleton',
                theme TEXT NOT NULL DEFAULT 'dark',
                currency TEXT NOT NULL DEFAULT 'USD',
                notification_enabled INTEGER NOT NULL DEFAULT 1,
                notification_days_before TEXT NOT NULL DEFAULT '[1,3,7]'
            );

            CREATE INDEX IF NOT EXISTS idx_subscriptions_category ON subscriptions(category_id);
            CREATE INDEX IF NOT EXISTS idx_subscriptions_next_payment ON subscriptions(next_payment_date);
        "#,
    },
    Migration {
        version: 2,
        description: "seed_default_data",
        sql: r#"
            INSERT OR IGNORE INTO categories (id, name, color, icon, is_default) VALUES
                ('cat-streaming', 'Streaming', '#8b5cf6', 'play-circle', 1),
                ('cat-software', 'Software', '#3b82f6', 'code', 1),
                ('cat-gaming', 'Gaming', '#10b981', 'gamepad-2', 1),
                ('cat-music', 'Music', '#f59e0b', 'music', 1),
                ('cat-cloud', 'Cloud Storage', '#06b6d4', 'cloud', 1),
                ('cat-productivity', 'Productivity', '#ec4899', 'briefcase', 1),
                ('cat-health', 'Health & Fitness', '#14b8a6', 'heart-pulse', 1),
                ('cat-news', 'News & Reading', '#f97316', 'newspaper', 1),
                ('cat-other', 'Other', '#6b7280', 'box', 1);

            INSERT OR IGNORE INTO settings (id) VALUES ('singleton');
        "#,
    },
    Migration {
        version: 3,
        description: "create_payments_table",
        sql: r#"
            CREATE TABLE IF NOT EXISTS payments (
                id TEXT PRIMARY KEY,
                subscription_id TEXT NOT NULL,
                amount REAL NOT NULL,
                paid_at TEXT NOT NULL,
                due_date TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'paid',
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_payments_subscription ON payments(subscription_id);
            CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at);
            CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);
        "#,
    },
    Migration {
        version: 4,
        description: "add_notification_settings",
        sql: r#"
            ALTER TABLE settings ADD COLUMN email TEXT;
            ALTER TABLE settings ADD COLUMN notification_email_enabled INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE settings ADD COLUMN notification_desktop_enabled INTEGER NOT NULL DEFAULT 1;
        "#,
    },
    Migration {
        version: 5,
        description: "create_payment_cards_table",
        sql: r#"
            CREATE TABLE IF NOT EXISTS payment_cards (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                card_type TEXT NOT NULL DEFAULT 'debit',
                last_four TEXT,
                color TEXT NOT NULL DEFAULT '#6b7280',
                credit_limit REAL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE subscriptions ADD COLUMN card_id TEXT REFERENCES payment_cards(id);
        "#,
    },
    Migration {
        version: 6,
        description: "add_lifecycle_states_and_trial_fields",
        sql: r#"
            ALTER TABLE subscriptions ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
            ALTER TABLE subscriptions ADD COLUMN trial_end_date TEXT;
            ALTER TABLE subscriptions ADD COLUMN status_changed_at TEXT;

            CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
            CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end ON subscriptions(trial_end_date) WHERE trial_end_date IS NOT NULL;
        "#,
    },
    Migration {
        version: 7,
        description: "create_price_history_table",
        sql: r#"
            CREATE TABLE IF NOT EXISTS price_history (
                id TEXT PRIMARY KEY,
                subscription_id TEXT NOT NULL,
                old_amount REAL NOT NULL,
                new_amount REAL NOT NULL,
                old_currency TEXT NOT NULL DEFAULT 'USD',
                new_currency TEXT NOT NULL DEFAULT 'USD',
                changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_price_history_subscription ON price_history(subscription_id);
            CREATE INDEX IF NOT EXISTS idx_price_history_changed_at ON price_history(changed_at);
        "#,
    },
    Migration {
        version: 8,
        description: "add_shared_subscription_splitting",
        sql: r#"
            ALTER TABLE subscriptions ADD COLUMN shared_count INTEGER NOT NULL DEFAULT 1;
        "#,
    },
    Migration {
        version: 9,
        description: "add_monthly_budget_setting",
        sql: r#"
            ALTER TABLE settings ADD COLUMN monthly_budget REAL;
        "#,
    },
    Migration {
        version: 10,
        description: "add_motion_animation_settings",
        sql: r#"
            ALTER TABLE settings ADD COLUMN reduce_motion INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE settings ADD COLUMN enable_transitions INTEGER NOT NULL DEFAULT 1;
            ALTER TABLE settings ADD COLUMN enable_hover_effects INTEGER NOT NULL DEFAULT 1;
            ALTER TABLE settings ADD COLUMN animation_speed TEXT NOT NULL DEFAULT 'normal';
        "#,
    },
    Migration {
        version: 11,
        description: "add_notification_advance_and_time",
        sql: r#"
            ALTER TABLE settings ADD COLUMN notification_advance_days INTEGER NOT NULL DEFAULT 1;
            ALTER TABLE settings ADD COLUMN notification_time TEXT NOT NULL DEFAULT '09:00';
        "#,
    },
    Migration {
        version: 12,
        description: "add_subscription_pinned",
        sql: r#"
            ALTER TABLE subscriptions ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
        "#,
    },
    Migration {
        version: 13,
        description: "add_cancellation_tracking",
        sql: r#"
            ALTER TABLE subscriptions ADD COLUMN cancellation_reason TEXT;
            ALTER TABLE subscriptions ADD COLUMN cancelled_at TEXT;
        "#,
    },
    Migration {
        version: 14,
        description: "create_tags_tables",
        sql: r#"
            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT '#6b7280',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS subscription_tags (
                subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
                tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (subscription_id, tag_id)
            );
            CREATE INDEX IF NOT EXISTS idx_subscription_tags_sub ON subscription_tags(subscription_id);
            CREATE INDEX IF NOT EXISTS idx_subscription_tags_tag ON subscription_tags(tag_id);
        "#,
    },
    Migration {
        version: 15,
        description: "add_last_reviewed_at_to_subscriptions",
        sql: r#"
            ALTER TABLE subscriptions ADD COLUMN last_reviewed_at TEXT;
        "#,
    },
];

/// Runs all pending migrations on the database connection.
///
/// Creates a `_subby_migrations` tracking table if it doesn't exist,
/// then applies any migrations whose version hasn't been recorded yet.
pub fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _subby_migrations (
            version INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );",
    )?;

    let applied: Vec<u32> = {
        let mut stmt = conn.prepare("SELECT version FROM _subby_migrations ORDER BY version")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect::<std::result::Result<Vec<u32>, _>>()?
    };

    for migration in MIGRATIONS {
        if applied.contains(&migration.version) {
            continue;
        }

        // Check if tauri-plugin-sql already applied this migration
        // by detecting if the tables/columns exist
        if should_skip_migration(conn, migration.version) {
            // Record it as applied so we don't try again
            conn.execute(
                "INSERT INTO _subby_migrations (version, description) VALUES (?1, ?2)",
                rusqlite::params![migration.version, migration.description],
            )?;
            continue;
        }

        conn.execute_batch(migration.sql)?;

        conn.execute(
            "INSERT INTO _subby_migrations (version, description) VALUES (?1, ?2)",
            rusqlite::params![migration.version, migration.description],
        )?;
    }

    Ok(())
}

/// Checks if a migration was already applied by the old tauri-plugin-sql system
/// by detecting the existence of the objects it would create.
fn should_skip_migration(conn: &Connection, version: u32) -> bool {
    match version {
        1 => table_exists(conn, "categories"),
        2 => {
            // Check if default categories are seeded
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM categories WHERE is_default = 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            count >= 9
        }
        3 => table_exists(conn, "payments"),
        4 => column_exists(conn, "settings", "email"),
        5 => table_exists(conn, "payment_cards"),
        6 => column_exists(conn, "subscriptions", "status"),
        7 => table_exists(conn, "price_history"),
        8 => column_exists(conn, "subscriptions", "shared_count"),
        9 => column_exists(conn, "settings", "monthly_budget"),
        10 => column_exists(conn, "settings", "reduce_motion"),
        11 => column_exists(conn, "settings", "notification_advance_days"),
        12 => column_exists(conn, "subscriptions", "is_pinned"),
        13 => column_exists(conn, "subscriptions", "cancellation_reason"),
        14 => table_exists(conn, "tags"),
        15 => column_exists(conn, "subscriptions", "last_reviewed_at"),
        _ => false,
    }
}

fn table_exists(conn: &Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
        rusqlite::params![table],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or(0)
        > 0
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> bool {
    // Validate table name to prevent SQL injection (PRAGMA does not support parameters)
    if !table.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return false;
    }
    let sql = format!("PRAGMA table_info({})", table);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let rows = match stmt.query_map([], |row| row.get::<_, String>(1)) {
        Ok(r) => r,
        Err(_) => return false,
    };
    for name in rows.flatten() {
        if name == column {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_migrations_run_on_fresh_db() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).unwrap();

        // Verify tables exist
        assert!(table_exists(&conn, "categories"));
        assert!(table_exists(&conn, "subscriptions"));
        assert!(table_exists(&conn, "settings"));
        assert!(table_exists(&conn, "payments"));
        assert!(table_exists(&conn, "payment_cards"));
        assert!(table_exists(&conn, "price_history"));
        assert!(table_exists(&conn, "tags"));
        assert!(table_exists(&conn, "_subby_migrations"));

        // Verify default categories seeded
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM categories WHERE is_default = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 9);

        // Verify settings singleton
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM settings", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_migrations_are_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).unwrap();
        // Running again should be a no-op
        run_migrations(&conn).unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM _subby_migrations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 15);
    }
}
