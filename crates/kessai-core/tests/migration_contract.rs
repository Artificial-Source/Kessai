use std::collections::BTreeSet;
use std::sync::{mpsc, Barrier};
use std::thread;
use std::time::Duration;

use kessai_core::{
    db::create_pool, error::KessaiCoreError, migrations::run_migrations, KessaiCore,
};
use rusqlite::Connection;

#[test]
fn migration_completes_interrupted_payment_card_shape() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("interrupted.db");
    drop(KessaiCore::new(&path).unwrap());
    let conn = Connection::open(&path).unwrap();
    // Reproduce interruption after v5's CREATE TABLE, before its ALTER TABLE
    // and ledger write. Later migrations do not depend on card_id.
    conn.execute_batch(
        "ALTER TABLE subscriptions DROP COLUMN card_id;
         DELETE FROM _kessai_migrations WHERE version = 5;",
    )
    .unwrap();

    drop(KessaiCore::new(&path).unwrap());

    let columns: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('subscriptions') WHERE name = 'card_id'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(columns, 1, "v5 must complete the missing ALTER TABLE");
    let recorded: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM _kessai_migrations WHERE version = 5",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(recorded, 1);
}

const TABLE_COLUMNS: &[(&str, &[&str])] = &[
    (
        "_kessai_migrations",
        &["version", "description", "applied_at"],
    ),
    (
        "categories",
        &["id", "name", "color", "icon", "is_default", "created_at"],
    ),
    (
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
            "card_id",
            "status",
            "trial_end_date",
            "status_changed_at",
            "shared_count",
            "is_pinned",
            "cancellation_reason",
            "cancelled_at",
            "last_reviewed_at",
        ],
    ),
    (
        "settings",
        &[
            "id",
            "theme",
            "currency",
            "notification_enabled",
            "notification_days_before",
            "email",
            "notification_email_enabled",
            "notification_desktop_enabled",
            "monthly_budget",
            "reduce_motion",
            "enable_transitions",
            "enable_hover_effects",
            "animation_speed",
            "notification_advance_days",
            "notification_time",
            "display_exchange_rates",
        ],
    ),
    (
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
            "recorded_outcome",
        ],
    ),
    (
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
    ),
    (
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
    ),
    ("tags", &["id", "name", "color", "created_at"]),
    ("subscription_tags", &["subscription_id", "tag_id"]),
];

// Name, table, indexed columns, unique, partial.
const INDEXES: &[(&str, &str, &[&str], bool, bool)] = &[
    (
        "idx_subscriptions_category",
        "subscriptions",
        &["category_id"],
        false,
        false,
    ),
    (
        "idx_subscriptions_next_payment",
        "subscriptions",
        &["next_payment_date"],
        false,
        false,
    ),
    (
        "idx_payments_subscription",
        "payments",
        &["subscription_id"],
        false,
        false,
    ),
    (
        "idx_payments_paid_at",
        "payments",
        &["paid_at"],
        false,
        false,
    ),
    (
        "idx_payments_due_date",
        "payments",
        &["due_date"],
        false,
        false,
    ),
    (
        "idx_subscriptions_status",
        "subscriptions",
        &["status"],
        false,
        false,
    ),
    (
        "idx_subscriptions_trial_end",
        "subscriptions",
        &["trial_end_date"],
        false,
        true,
    ),
    (
        "idx_price_history_subscription",
        "price_history",
        &["subscription_id"],
        false,
        false,
    ),
    (
        "idx_price_history_changed_at",
        "price_history",
        &["changed_at"],
        false,
        false,
    ),
    (
        "idx_subscription_tags_sub",
        "subscription_tags",
        &["subscription_id"],
        false,
        false,
    ),
    (
        "idx_subscription_tags_tag",
        "subscription_tags",
        &["tag_id"],
        false,
        false,
    ),
    (
        "idx_payments_recorded_outcome",
        "payments",
        &["subscription_id", "due_date"],
        true,
        true,
    ),
];

fn assert_schema(conn: &Connection) {
    for &(table, expected) in TABLE_COLUMNS {
        assert_object(conn, "table", table);
        let mut statement = conn
            .prepare("SELECT name FROM pragma_table_info(?1)")
            .unwrap();
        let actual = statement
            .query_map([table], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<Result<BTreeSet<_>, _>>()
            .unwrap();
        assert_eq!(
            actual,
            expected.iter().map(|name| (*name).to_owned()).collect(),
            "columns of {table}",
        );
    }
    for &(index, table, columns, unique, partial) in INDEXES {
        assert_object(conn, "index", index);
        let flags: (bool, bool) = conn
            .query_row(
                "SELECT \"unique\", partial FROM pragma_index_list(?1) WHERE name = ?2",
                [table, index],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(flags, (unique, partial), "flags of {index}");
        let mut statement = conn
            .prepare("SELECT name FROM pragma_index_info(?1) ORDER BY seqno")
            .unwrap();
        let actual = statement
            .query_map([index], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(actual, columns, "columns of {index}");
    }
    assert_object(conn, "trigger", "categories_name_unique_insert");
    assert_object(conn, "trigger", "categories_name_unique_update");
    let mut statement = conn
        .prepare("SELECT version FROM _kessai_migrations ORDER BY version")
        .unwrap();
    let versions = statement
        .query_map([], |row| row.get::<_, u32>(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(versions, (1..=18).collect::<Vec<_>>());
}

fn assert_object(conn: &Connection, kind: &str, name: &str) {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ?1 AND name = ?2)",
            [kind, name],
            |row| row.get(0),
        )
        .unwrap();
    assert!(exists, "missing {kind} {name}");
}

#[test]
fn migration_fresh_database_has_all_eighteen_versions_and_complete_schema() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("fresh.db");
    drop(KessaiCore::new(&path).unwrap());
    let conn = Connection::open(path).unwrap();
    assert_schema(&conn);
    let defaults: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM categories WHERE is_default = 1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(defaults, 9);
    let settings: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM settings WHERE id = 'singleton'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(settings, 1);
}

#[test]
fn migration_rerun_is_a_no_op_and_does_not_reseed_user_data() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("rerun.db");
    drop(KessaiCore::new(&path).unwrap());
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(
        "DELETE FROM categories WHERE id = 'cat-streaming';
         UPDATE settings SET theme = 'light';
         UPDATE _kessai_migrations SET applied_at = '2000-01-01';",
    )
    .unwrap();
    let schema_version: i64 = conn
        .query_row("PRAGMA schema_version", [], |row| row.get(0))
        .unwrap();
    let changes = conn.total_changes();

    run_migrations(&conn).unwrap();
    assert_eq!(
        conn.total_changes(),
        changes,
        "rerun must not write any rows"
    );
    drop(KessaiCore::new(&path).unwrap());

    assert_schema(&conn);
    let current_version: i64 = conn
        .query_row("PRAGMA schema_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(
        current_version, schema_version,
        "rerun must not change the schema"
    );
    let retained: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM _kessai_migrations WHERE applied_at = '2000-01-01'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(retained, 18);
    let deleted: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM categories WHERE id = 'cat-streaming'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(deleted, 0);
    let theme: String = conn
        .query_row("SELECT theme FROM settings", [], |row| row.get(0))
        .unwrap();
    assert_eq!(theme, "light");
}

#[test]
fn migration_repairs_recorded_v14_missing_subscription_tags_index() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("tags.db");
    drop(KessaiCore::new(&path).unwrap());
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(
        "DROP INDEX idx_subscription_tags_tag;
         UPDATE _kessai_migrations SET applied_at = '2000-01-01' WHERE version = 14;",
    )
    .unwrap();

    drop(KessaiCore::new(&path).unwrap());

    assert_schema(&conn);
    let recorded_at: String = conn
        .query_row(
            "SELECT applied_at FROM _kessai_migrations WHERE version = 14",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(recorded_at, "2000-01-01");
}

#[test]
fn migration_repairs_each_added_column_with_or_without_a_ledger_row() {
    let columns = [
        (4, "settings", "email"),
        (4, "settings", "notification_email_enabled"),
        (4, "settings", "notification_desktop_enabled"),
        (5, "subscriptions", "card_id"),
        (6, "subscriptions", "status"),
        (6, "subscriptions", "trial_end_date"),
        (6, "subscriptions", "status_changed_at"),
        (8, "subscriptions", "shared_count"),
        (9, "settings", "monthly_budget"),
        (10, "settings", "reduce_motion"),
        (10, "settings", "enable_transitions"),
        (10, "settings", "enable_hover_effects"),
        (10, "settings", "animation_speed"),
        (11, "settings", "notification_advance_days"),
        (11, "settings", "notification_time"),
        (12, "subscriptions", "is_pinned"),
        (13, "subscriptions", "cancellation_reason"),
        (13, "subscriptions", "cancelled_at"),
        (15, "subscriptions", "last_reviewed_at"),
        (16, "settings", "display_exchange_rates"),
        (17, "payments", "recorded_outcome"),
    ];
    for recorded in [false, true] {
        for (version, table, column) in columns {
            let directory = tempfile::tempdir().unwrap();
            let path = directory.path().join("column.db");
            drop(KessaiCore::new(&path).unwrap());
            let conn = Connection::open(&path).unwrap();
            for &(index, indexed_table, indexed_columns, _, _) in INDEXES {
                // recorded_outcome is used in the partial predicate, not as an
                // indexed key, but SQLite still requires removing its index.
                if indexed_table == table
                    && (indexed_columns.contains(&column)
                        || (index == "idx_payments_recorded_outcome"
                            && column == "recorded_outcome"))
                {
                    conn.execute_batch(&format!("DROP INDEX {index}")).unwrap();
                }
            }
            conn.execute_batch(&format!("ALTER TABLE {table} DROP COLUMN {column}"))
                .unwrap();
            if !recorded {
                conn.execute(
                    "DELETE FROM _kessai_migrations WHERE version = ?1",
                    [version],
                )
                .unwrap();
            }

            KessaiCore::new(&path).unwrap_or_else(|error| {
                panic!("repair {table}.{column}, recorded={recorded}: {error}")
            });

            assert_schema(&conn);
        }
    }
}

#[test]
fn migration_repairs_missing_tables_indexes_and_triggers() {
    let objects = [
        (1, "TABLE", "categories"),
        (1, "TABLE", "subscriptions"),
        (1, "TABLE", "settings"),
        (1, "INDEX", "idx_subscriptions_category"),
        (1, "INDEX", "idx_subscriptions_next_payment"),
        (3, "TABLE", "payments"),
        (3, "INDEX", "idx_payments_subscription"),
        (3, "INDEX", "idx_payments_paid_at"),
        (3, "INDEX", "idx_payments_due_date"),
        (5, "TABLE", "payment_cards"),
        (6, "INDEX", "idx_subscriptions_status"),
        (6, "INDEX", "idx_subscriptions_trial_end"),
        (7, "TABLE", "price_history"),
        (7, "INDEX", "idx_price_history_subscription"),
        (7, "INDEX", "idx_price_history_changed_at"),
        (14, "TABLE", "tags"),
        (14, "TABLE", "subscription_tags"),
        (14, "INDEX", "idx_subscription_tags_sub"),
        (14, "INDEX", "idx_subscription_tags_tag"),
        (17, "INDEX", "idx_payments_recorded_outcome"),
        (18, "TRIGGER", "categories_name_unique_insert"),
        (18, "TRIGGER", "categories_name_unique_update"),
    ];
    for recorded in [false, true] {
        for (version, kind, name) in objects {
            let directory = tempfile::tempdir().unwrap();
            let path = directory.path().join("object.db");
            drop(KessaiCore::new(&path).unwrap());
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(&format!("DROP {kind} {name}")).unwrap();
            if !recorded {
                conn.execute(
                    "DELETE FROM _kessai_migrations WHERE version = ?1",
                    [version],
                )
                .unwrap();
            }

            KessaiCore::new(&path).unwrap_or_else(|error| {
                panic!("repair {kind} {name}, recorded={recorded}: {error}")
            });

            assert_schema(&conn);
        }
    }
}

#[test]
fn migration_missing_original_column_fails_clearly_without_rewriting_data() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("malformed.db");
    drop(KessaiCore::new(&path).unwrap());
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch("ALTER TABLE categories DROP COLUMN icon")
        .unwrap();

    let error = match KessaiCore::new(&path) {
        Ok(_) => panic!("an incomplete original table must not be silently adopted"),
        Err(error) => error,
    };

    assert!(matches!(error, KessaiCoreError::Validation(_)));
    let message = error.to_string();
    assert!(
        message.contains("categories") && message.contains("icon"),
        "{message}"
    );
    let categories: i64 = conn
        .query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))
        .unwrap();
    assert_eq!(categories, 9);
}

#[test]
fn migration_rolls_back_schema_and_ledger_together_on_failure() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("rollback.db");
    drop(KessaiCore::new(&path).unwrap());
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(
        "ALTER TABLE subscriptions DROP COLUMN card_id;
         ALTER TABLE settings DROP COLUMN email;
         DELETE FROM _kessai_migrations WHERE version IN (4, 5);
         CREATE TRIGGER reject_v5 BEFORE INSERT ON _kessai_migrations
         WHEN NEW.version = 5 BEGIN
             SELECT RAISE(ABORT, 'injected ledger failure');
         END;",
    )
    .unwrap();

    let error = match KessaiCore::new(&path) {
        Ok(_) => panic!("ledger failure must abort initialization"),
        Err(error) => error,
    };
    assert!(error.to_string().contains("injected ledger failure"));
    let recorded: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM _kessai_migrations WHERE version IN (4, 5)",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(recorded, 0);
    for (table, column) in [("settings", "email"), ("subscriptions", "card_id")] {
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2)",
                [table, column],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!exists, "{table}.{column} must roll back");
    }
    conn.execute_batch("DROP TRIGGER reject_v5").unwrap();
    drop(KessaiCore::new(&path).unwrap());
    assert_schema(&conn);
}

#[test]
fn migration_concurrent_initializers_both_succeed_on_a_new_file() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("concurrent.db");
    let barrier = Barrier::new(2);
    thread::scope(|scope| {
        let initialize = || {
            barrier.wait();
            KessaiCore::new(&path)
        };
        let first = scope.spawn(initialize);
        let second = scope.spawn(initialize);
        first.join().unwrap().unwrap();
        second.join().unwrap().unwrap();
    });
    assert_schema(&Connection::open(path).unwrap());
}

#[test]
fn migration_write_lock_uses_the_pools_five_second_busy_timeout() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("locked.db");
    let pool = create_pool(&path).unwrap();
    let connections: Vec<_> = (0..4).map(|_| pool.get().unwrap()).collect();
    for conn in &connections {
        let timeout: i64 = conn
            .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
            .unwrap();
        let foreign_keys: bool = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        let journal: String = conn
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .unwrap();
        assert_eq!(timeout, 5000);
        assert!(foreign_keys);
        assert_eq!(journal, "wal");
    }
    drop(connections);
    let blocker = pool.get().unwrap();
    blocker.execute_batch("BEGIN IMMEDIATE").unwrap();
    let (started_tx, started_rx) = mpsc::channel();
    let (finished_tx, finished_rx) = mpsc::channel();
    thread::scope(|scope| {
        scope.spawn(|| {
            let conn = pool.get().unwrap();
            started_tx.send(()).unwrap();
            finished_tx.send(run_migrations(&conn)).unwrap();
        });
        started_rx.recv().unwrap();
        assert!(
            matches!(
                finished_rx.recv_timeout(Duration::from_millis(100)),
                Err(mpsc::RecvTimeoutError::Timeout)
            ),
            "migration must wait for the other writer, not fail immediately"
        );
        blocker.execute_batch("COMMIT").unwrap();
        finished_rx
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
            .unwrap();
    });
    assert_schema(&blocker);
}

#[test]
fn migration_v17_repairs_duplicate_marks_without_readopting_existing_outcomes() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("outcomes.db");
    drop(KessaiCore::new(&path).unwrap());
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(
        "DROP INDEX idx_payments_recorded_outcome;
         DELETE FROM _kessai_migrations WHERE version = 17;
         INSERT INTO subscriptions (id, name, amount, billing_cycle)
             VALUES ('sub', 'Legacy', 10, 'monthly');
         INSERT INTO payments
             (id, subscription_id, amount, paid_at, due_date, status, recorded_outcome)
             VALUES
             ('a', 'sub', 10, '2026-01-01', '2026-01-01', 'paid', 0),
             ('b', 'sub', 10, '2026-01-01', '2026-01-01', 'paid', 1),
             ('c', 'sub', 10, '2026-01-01', '2026-01-01', 'skipped', 1),
             ('d', 'sub', 10, '2026-02-01', '2026-02-01', 'skipped', 0),
             ('e', 'sub', 10, '2026-02-01', '2026-02-01', 'paid', 0);",
    )
    .unwrap();

    drop(KessaiCore::new(&path).unwrap());
    drop(KessaiCore::new(&path).unwrap());

    assert_schema(&conn);
    let mut statement = conn
        .prepare("SELECT id, recorded_outcome FROM payments ORDER BY id")
        .unwrap();
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, bool>(1)?))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(
        rows,
        vec![
            ("a".into(), false),
            ("b".into(), true),
            ("c".into(), false),
            ("d".into(), true),
            ("e".into(), false),
        ]
    );
}

#[test]
fn migration_adopts_legacy_schema_only_after_completing_seed_data() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("legacy.db");
    drop(KessaiCore::new(&path).unwrap());
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(
        "DROP TABLE _kessai_migrations;
         DELETE FROM settings;
         DELETE FROM categories WHERE id = 'cat-streaming';
         INSERT INTO categories (id, name, color, icon, is_default)
             VALUES ('legacy-custom', 'Custom', '#123456', 'star', 1);
         UPDATE categories SET color = '#abcdef' WHERE id = 'cat-software';",
    )
    .unwrap();

    drop(KessaiCore::new(&path).unwrap());

    assert_schema(&conn);
    let seeded: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM categories WHERE id = 'cat-streaming'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(seeded, 1);
    let singleton: i64 = conn
        .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
        .unwrap();
    assert_eq!(singleton, 1);
    let color: String = conn
        .query_row(
            "SELECT color FROM categories WHERE id = 'cat-software'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(color, "#abcdef", "legacy adoption must retain user edits");
    let custom: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM categories WHERE id = 'legacy-custom'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(custom, 1);
}
