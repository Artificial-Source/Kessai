use rusqlite::{Connection, Transaction, TransactionBehavior};

use crate::error::{KessaiCoreError, Result};

pub(crate) const SEEDED_CATEGORIES: &[(&str, &str, &str, &str)] = &[
    ("cat-streaming", "Streaming", "#8b5cf6", "play-circle"),
    ("cat-software", "Software", "#3b82f6", "code"),
    ("cat-gaming", "Gaming", "#10b981", "gamepad-2"),
    ("cat-music", "Music", "#f59e0b", "music"),
    ("cat-cloud", "Cloud Storage", "#06b6d4", "cloud"),
    ("cat-productivity", "Productivity", "#ec4899", "briefcase"),
    ("cat-health", "Health & Fitness", "#14b8a6", "heart-pulse"),
    ("cat-news", "News & Reading", "#f97316", "newspaper"),
    ("cat-other", "Other", "#6b7280", "box"),
];

struct Migration {
    version: u32,
    description: &'static str,
    sql: &'static str,
    // (table, column, definition), applied only when the column is absent.
    columns: &'static [(&'static str, &'static str, &'static str)],
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "create_initial_tables",
        columns: &[],
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
        columns: &[],
        sql: r#"
            INSERT OR IGNORE INTO settings (id) VALUES ('singleton');
        "#,
    },
    Migration {
        version: 3,
        description: "create_payments_table",
        columns: &[],
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
        columns: &[
            ("settings", "email", "TEXT"),
            (
                "settings",
                "notification_email_enabled",
                "INTEGER NOT NULL DEFAULT 0",
            ),
            (
                "settings",
                "notification_desktop_enabled",
                "INTEGER NOT NULL DEFAULT 1",
            ),
        ],
        sql: "",
    },
    Migration {
        version: 5,
        description: "create_payment_cards_table",
        columns: &[(
            "subscriptions",
            "card_id",
            "TEXT REFERENCES payment_cards(id)",
        )],
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
        "#,
    },
    Migration {
        version: 6,
        description: "add_lifecycle_states_and_trial_fields",
        columns: &[
            ("subscriptions", "status", "TEXT NOT NULL DEFAULT 'active'"),
            ("subscriptions", "trial_end_date", "TEXT"),
            ("subscriptions", "status_changed_at", "TEXT"),
        ],
        sql: r#"
            CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
            CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end ON subscriptions(trial_end_date) WHERE trial_end_date IS NOT NULL;
        "#,
    },
    Migration {
        version: 7,
        description: "create_price_history_table",
        columns: &[],
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
        columns: &[(
            "subscriptions",
            "shared_count",
            "INTEGER NOT NULL DEFAULT 1",
        )],
        sql: "",
    },
    Migration {
        version: 9,
        description: "add_monthly_budget_setting",
        columns: &[("settings", "monthly_budget", "REAL")],
        sql: "",
    },
    Migration {
        version: 10,
        description: "add_motion_animation_settings",
        columns: &[
            ("settings", "reduce_motion", "INTEGER NOT NULL DEFAULT 0"),
            (
                "settings",
                "enable_transitions",
                "INTEGER NOT NULL DEFAULT 1",
            ),
            (
                "settings",
                "enable_hover_effects",
                "INTEGER NOT NULL DEFAULT 1",
            ),
            (
                "settings",
                "animation_speed",
                "TEXT NOT NULL DEFAULT 'normal'",
            ),
        ],
        sql: "",
    },
    Migration {
        version: 11,
        description: "add_notification_advance_and_time",
        columns: &[
            (
                "settings",
                "notification_advance_days",
                "INTEGER NOT NULL DEFAULT 1",
            ),
            (
                "settings",
                "notification_time",
                "TEXT NOT NULL DEFAULT '09:00'",
            ),
        ],
        sql: "",
    },
    Migration {
        version: 12,
        description: "add_subscription_pinned",
        columns: &[("subscriptions", "is_pinned", "INTEGER NOT NULL DEFAULT 0")],
        sql: "",
    },
    Migration {
        version: 13,
        description: "add_cancellation_tracking",
        columns: &[
            ("subscriptions", "cancellation_reason", "TEXT"),
            ("subscriptions", "cancelled_at", "TEXT"),
        ],
        sql: "",
    },
    Migration {
        version: 14,
        description: "create_tags_tables",
        columns: &[],
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
        columns: &[("subscriptions", "last_reviewed_at", "TEXT")],
        sql: "",
    },
    Migration {
        version: 16,
        description: "add_display_exchange_rates_to_settings",
        columns: &[(
            "settings",
            "display_exchange_rates",
            "TEXT NOT NULL DEFAULT '{}'",
        )],
        sql: "",
    },
    Migration {
        version: 17,
        description: "make_recorded_payment_outcomes_idempotent",
        columns: &[("payments", "recorded_outcome", "INTEGER NOT NULL DEFAULT 0")],
        sql: r#"
            -- Adopt one deterministic legacy paid/skipped row for each due occurrence.
            -- Other legacy rows remain ordinary history and are not removed.
            UPDATE payments
               SET recorded_outcome = 1
             WHERE status IN ('paid', 'skipped')
               AND id = (
                   SELECT MIN(p2.id)
                     FROM payments p2
                    WHERE p2.subscription_id = payments.subscription_id
                      AND p2.due_date = payments.due_date
                      AND p2.status IN ('paid', 'skipped')
               );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_recorded_outcome
                ON payments(subscription_id, due_date)
                WHERE recorded_outcome = 1;
        "#,
    },
    Migration {
        version: 18,
        description: "enforce_unique_category_names",
        columns: &[],
        sql: r#"
            -- Triggers preserve any pre-existing duplicate rows while ensuring all
            -- future writes have the same uniqueness invariant as tags.
            CREATE TRIGGER IF NOT EXISTS categories_name_unique_insert
            BEFORE INSERT ON categories
            WHEN EXISTS (
                SELECT 1 FROM categories
                 WHERE name = NEW.name AND id != NEW.id
            )
            BEGIN
                SELECT RAISE(ABORT, 'category name already exists');
            END;

            CREATE TRIGGER IF NOT EXISTS categories_name_unique_update
            BEFORE UPDATE OF name ON categories
            WHEN EXISTS (
                SELECT 1 FROM categories
                 WHERE name = NEW.name AND id != OLD.id
            )
            BEGIN
                SELECT RAISE(ABORT, 'category name already exists');
            END;
        "#,
    },
];

/// Runs migrations and repairs incomplete historical schema changes atomically.
///
/// `BEGIN IMMEDIATE` acquires the write lock before inspecting the ledger, so
/// independent initializers cannot observe the same pending work. The pool's
/// five-second busy timeout also applies while acquiring this lock.
///
/// Every version's tables, columns, indexes and triggers are checked, including
/// recorded versions. Missing added columns and objects are repaired without
/// changing ledger timestamps. Existing tables missing original columns fail
/// explicitly: rebuilding them could destroy user data. Recorded v2 seed data
/// is never replayed, since users may have edited or deleted those rows.
/// Schema changes, data changes, repairs and ledger writes commit together;
/// any failure rolls the entire initialization back.
pub fn run_migrations(conn: &Connection) -> Result<()> {
    let transaction = Transaction::new_unchecked(conn, TransactionBehavior::Immediate)?;
    let conn = &transaction;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _kessai_migrations (
            version INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );",
    )?;

    let applied: Vec<u32> = {
        let mut stmt = conn.prepare("SELECT version FROM _kessai_migrations ORDER BY version")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect::<std::result::Result<Vec<u32>, _>>()?
    };

    for migration in MIGRATIONS {
        let recorded = applied.contains(&migration.version);
        if recorded && migration.version == 2 {
            continue;
        }

        if !should_skip_migration(conn, migration)? {
            tracing::info!(
                "applying or repairing migration v{}: {}",
                migration.version,
                migration.description
            );
            apply_migration(conn, migration)?;
            if !should_skip_migration(conn, migration)? {
                return Err(KessaiCoreError::Validation(format!(
                    "Migration v{} ({}) did not produce its required schema",
                    migration.version, migration.description
                )));
            }
        }

        if !recorded {
            conn.execute(
                "INSERT INTO _kessai_migrations (version, description) VALUES (?1, ?2)",
                rusqlite::params![migration.version, migration.description],
            )?;
        }
    }

    // Preserve v17's repair even when its column, index and ledger already exist.
    ensure_payment_outcome_index(conn)?;
    transaction.commit()?;
    Ok(())
}

fn apply_migration(conn: &Connection, migration: &Migration) -> Result<()> {
    if migration.version == 2 {
        let mut statement = conn.prepare(
            "INSERT OR IGNORE INTO categories (id, name, color, icon, is_default)
             VALUES (?1, ?2, ?3, ?4, 1)",
        )?;
        for &(id, name, color, icon) in SEEDED_CATEGORIES {
            statement.execute(rusqlite::params![id, name, color, icon])?;
        }
    }
    // A pre-existing v17 column may contain adopted outcomes that are not the
    // minimum legacy ID. Preserve them using the existing repair, not backfill.
    let repair_outcomes =
        migration.version == 17 && column_exists(conn, "payments", "recorded_outcome")?;
    for &(table, column, definition) in migration.columns {
        if !column_exists(conn, table, column)? {
            // All identifiers/definitions come from the static migration list.
            // SQLite allows v5's nullable FK before payment_cards is created.
            conn.execute_batch(&format!(
                "ALTER TABLE {table} ADD COLUMN {column} {definition};"
            ))?;
        }
    }
    if repair_outcomes {
        ensure_payment_outcome_index(conn)?;
    } else {
        conn.execute_batch(migration.sql)?;
    }
    Ok(())
}

fn ensure_payment_outcome_index(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "UPDATE payments
            SET recorded_outcome = 0
          WHERE recorded_outcome = 1
            AND id != (
                SELECT MIN(marked.id) FROM payments marked
                 WHERE marked.subscription_id = payments.subscription_id
                   AND marked.due_date = payments.due_date
                   AND marked.recorded_outcome = 1
            );
         UPDATE payments
            SET recorded_outcome = 1
          WHERE status IN ('paid', 'skipped')
            AND recorded_outcome = 0
            AND NOT EXISTS (
                SELECT 1 FROM payments marked
                 WHERE marked.subscription_id = payments.subscription_id
                   AND marked.due_date = payments.due_date
                   AND marked.recorded_outcome = 1
            )
            AND id = (
                SELECT MIN(candidate.id) FROM payments candidate
                 WHERE candidate.subscription_id = payments.subscription_id
                   AND candidate.due_date = payments.due_date
                   AND candidate.status IN ('paid', 'skipped')
                   AND candidate.recorded_outcome = 0
            );
         CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_recorded_outcome
             ON payments(subscription_id, due_date)
             WHERE recorded_outcome = 1;",
    )?;
    Ok(())
}

/// Legacy adoption requires every object, not just a representative sentinel.
fn should_skip_migration(conn: &Connection, migration: &Migration) -> Result<bool> {
    for &(table, column, _) in migration.columns {
        if !column_exists(conn, table, column)? {
            return Ok(false);
        }
    }
    Ok(match migration.version {
        1 => {
            table_has_columns(
                conn,
                "categories",
                &["id", "name", "color", "icon", "is_default", "created_at"],
            )? && table_has_columns(
                conn,
                "subscriptions",
                &[
                    "id",
                    "name",
                    "amount",
                    "currency",
                    "billing_cycle",
                    "billing_day",
                    "category_id",
                    "color",
                    "logo_url",
                    "notes",
                    "is_active",
                    "next_payment_date",
                    "created_at",
                    "updated_at",
                ],
            )? && table_has_columns(
                conn,
                "settings",
                &[
                    "id",
                    "theme",
                    "currency",
                    "notification_enabled",
                    "notification_days_before",
                ],
            )? && object_exists(conn, "index", "idx_subscriptions_category")?
                && object_exists(conn, "index", "idx_subscriptions_next_payment")?
        }
        2 => {
            let mut statement =
                conn.prepare("SELECT EXISTS(SELECT 1 FROM categories WHERE id = ?1)")?;
            for &(id, _, _, _) in SEEDED_CATEGORIES {
                if !statement.query_row([id], |row| row.get::<_, bool>(0))? {
                    return Ok(false);
                }
            }
            conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM settings WHERE id = 'singleton')",
                [],
                |row| row.get(0),
            )?
        }
        3 => {
            table_has_columns(
                conn,
                "payments",
                &[
                    "id",
                    "subscription_id",
                    "amount",
                    "paid_at",
                    "due_date",
                    "status",
                    "notes",
                    "created_at",
                ],
            )? && object_exists(conn, "index", "idx_payments_subscription")?
                && object_exists(conn, "index", "idx_payments_paid_at")?
                && object_exists(conn, "index", "idx_payments_due_date")?
        }
        5 => table_has_columns(
            conn,
            "payment_cards",
            &[
                "id",
                "name",
                "card_type",
                "last_four",
                "color",
                "credit_limit",
                "created_at",
            ],
        )?,
        6 => {
            object_exists(conn, "index", "idx_subscriptions_status")?
                && object_exists(conn, "index", "idx_subscriptions_trial_end")?
        }
        7 => {
            table_has_columns(
                conn,
                "price_history",
                &[
                    "id",
                    "subscription_id",
                    "old_amount",
                    "new_amount",
                    "old_currency",
                    "new_currency",
                    "changed_at",
                ],
            )? && object_exists(conn, "index", "idx_price_history_subscription")?
                && object_exists(conn, "index", "idx_price_history_changed_at")?
        }
        14 => {
            table_has_columns(conn, "tags", &["id", "name", "color", "created_at"])?
                && table_has_columns(conn, "subscription_tags", &["subscription_id", "tag_id"])?
                && object_exists(conn, "index", "idx_subscription_tags_sub")?
                && object_exists(conn, "index", "idx_subscription_tags_tag")?
        }
        17 => object_exists(conn, "index", "idx_payments_recorded_outcome")?,
        18 => {
            object_exists(conn, "trigger", "categories_name_unique_insert")?
                && object_exists(conn, "trigger", "categories_name_unique_update")?
        }
        // These migrations only add the columns checked above.
        4 | 8 | 9 | 10 | 11 | 12 | 13 | 15 | 16 => true,
        _ => false,
    })
}

fn table_has_columns(conn: &Connection, table: &str, columns: &[&str]) -> Result<bool> {
    if !table_exists(conn, table)? {
        return Ok(false);
    }
    for column in columns {
        if !column_exists(conn, table, column)? {
            return Err(KessaiCoreError::Validation(format!(
                "Cannot adopt migration schema: table '{table}' is missing original column \
                 '{column}'; automatic repair only supports added columns and missing objects"
            )));
        }
    }
    Ok(true)
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool> {
    object_exists(conn, "table", table)
}

fn object_exists(conn: &Connection, kind: &str, name: &str) -> Result<bool> {
    Ok(conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ?1 AND name = ?2)",
        rusqlite::params![kind, name],
        |row| row.get(0),
    )?)
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    Ok(conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2)",
        rusqlite::params![table, column],
        |row| row.get(0),
    )?)
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
        assert!(table_exists(&conn, "categories").unwrap());
        assert!(table_exists(&conn, "subscriptions").unwrap());
        assert!(table_exists(&conn, "settings").unwrap());
        assert!(table_exists(&conn, "payments").unwrap());
        assert!(table_exists(&conn, "payment_cards").unwrap());
        assert!(table_exists(&conn, "price_history").unwrap());
        assert!(table_exists(&conn, "tags").unwrap());
        assert!(table_exists(&conn, "_kessai_migrations").unwrap());

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
    fn payment_outcome_migration_tolerates_legacy_duplicates() {
        let conn = Connection::open_in_memory().unwrap();
        // Use the full pre-v17 schema: recorded versions are now verified too.
        for migration in &MIGRATIONS[..16] {
            apply_migration(&conn, migration).unwrap();
        }
        conn.execute_batch(
            "CREATE TABLE _kessai_migrations (
                version INTEGER PRIMARY KEY,
                description TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
             );
             INSERT INTO subscriptions (id, name, amount, billing_cycle)
                VALUES ('sub', 'Legacy', 10, 'monthly');
             INSERT INTO payments (id, subscription_id, amount, paid_at, due_date, status) VALUES
                ('a', 'sub', 10, '2026-01-01T00:00:00Z', '2026-01-01', 'paid'),
                ('b', 'sub', 10, '2026-01-01T00:00:00Z', '2026-01-01', 'paid'),
                ('c', 'sub', 10, '2026-01-01T00:00:00Z', '2026-01-01', 'skipped');",
        )
        .unwrap();
        for version in 1..=16 {
            conn.execute(
                "INSERT INTO _kessai_migrations (version, description) VALUES (?1, 'legacy')",
                rusqlite::params![version],
            )
            .unwrap();
        }

        run_migrations(&conn).unwrap();
        let (rows, adopted): (i64, i64) = conn
            .query_row(
                "SELECT COUNT(*), SUM(recorded_outcome) FROM payments",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(rows, 3);
        assert_eq!(adopted, 1);
    }

    #[test]
    fn test_migrations_are_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).unwrap();
        // Running again should be a no-op
        run_migrations(&conn).unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM _kessai_migrations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count as usize, MIGRATIONS.len());
    }
}
