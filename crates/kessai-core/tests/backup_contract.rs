use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Barrier,
};

use kessai_core::{
    error::KessaiCoreError,
    models::{
        BackupData, BillingCycle, CardType, NewCategory, NewPayment, NewPaymentCard,
        NewSubscription, NewTag, PaymentStatus, SubscriptionStatus, UpdateCategory, UpdateSettings,
        UpdateSubscription,
    },
    services::DataManagementService,
    KessaiCore,
};
use rusqlite::Connection;
use tracing::{span, Event, Metadata, Subscriber};

fn populated_backup(core: &KessaiCore) -> BackupData {
    let category = core
        .categories()
        .create(NewCategory {
            name: "Custom category".into(),
            color: "#123456".into(),
            icon: "box".into(),
        })
        .unwrap();
    let card = core
        .payment_cards()
        .create(NewPaymentCard {
            name: "Backup card".into(),
            card_type: CardType::Credit,
            last_four: Some("1234".into()),
            color: "#abcdef".into(),
            credit_limit: Some(500.0),
        })
        .unwrap();
    let sub = core
        .subscriptions()
        .create(NewSubscription {
            name: "Backup subscription".into(),
            amount: 20.0,
            currency: "USD".into(),
            billing_cycle: BillingCycle::Monthly,
            billing_day: Some(15),
            category_id: Some(category.id),
            card_id: Some(card.id),
            color: Some("#654321".into()),
            logo_url: None,
            notes: Some("Subscription notes".into()),
            is_active: true,
            next_payment_date: Some("2026-10-15".into()),
            status: SubscriptionStatus::Active,
            trial_end_date: None,
            shared_count: 2,
            is_pinned: true,
        })
        .unwrap();
    core.payments()
        .create(NewPayment {
            subscription_id: sub.id.clone(),
            amount: 20.0,
            paid_at: "2026-09-15T09:00:00Z".into(),
            due_date: "2026-09-15".into(),
            status: PaymentStatus::Paid,
            notes: Some("Payment notes".into()),
        })
        .unwrap();
    core.price_history()
        .record(&sub.id, 15.0, 20.0, "EUR", "USD")
        .unwrap();
    let tag = core
        .tags()
        .create(NewTag {
            name: "Backup tag".into(),
            color: Some("#112233".into()),
        })
        .unwrap();
    core.tags().add_to_subscription(&sub.id, &tag.id).unwrap();
    core.settings()
        .update(UpdateSettings {
            monthly_budget: Some(Some(200.0)),
            notification_time: Some("10:30".into()),
            ..Default::default()
        })
        .unwrap();
    core.data_management().export_data().unwrap()
}

// A lossless, order-independent SQL checksum of every durable column, including
// internal outcome markers and settings fields not present in the backup format.
fn database_fingerprint(path: &Path) -> Vec<(String, i64, String)> {
    let conn = Connection::open(path).unwrap();
    let mut tables = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .unwrap();
    let names: Vec<String> = tables
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();
    names
        .into_iter()
        .map(|table| {
            let mut columns = conn
                .prepare("SELECT name FROM pragma_table_info(?1)")
                .unwrap();
            let columns: Vec<String> = columns
                .query_map([&table], |row| row.get(0))
                .unwrap()
                .collect::<rusqlite::Result<_>>()
                .unwrap();
            let quoted = columns
                .iter()
                .map(|name| format!("quote(\"{name}\")"))
                .collect::<Vec<_>>()
                .join(" || '|' || ");
            let sql = format!(
                "SELECT COUNT(*), hex(COALESCE(group_concat(payload, char(10)), '')) \
                 FROM (SELECT {quoted} AS payload FROM \"{table}\" ORDER BY payload)"
            );
            let (count, checksum) = conn
                .query_row(&sql, [], |row| Ok((row.get(0)?, row.get(1)?)))
                .unwrap();
            (table, count, checksum)
        })
        .collect()
}

#[test]
fn invalid_nested_records_are_rejected_before_any_database_changes() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let backup = populated_backup(&core);
    let before = database_fingerprint(database.path());
    let file_before = std::fs::read(database.path()).unwrap();

    for (field, value) in [
        ("amount", serde_json::json!(-10)),
        ("next_payment_date", serde_json::json!("2026-02-30")),
    ] {
        for clear in [false, true] {
            let mut json = serde_json::to_value(&backup).unwrap();
            json["subscriptions"][0][field] = value.clone();
            let invalid: BackupData = serde_json::from_value(json).unwrap();
            let error = core
                .data_management()
                .import_data(invalid, clear)
                .unwrap_err();
            assert!(matches!(error, KessaiCoreError::Validation(_)));
            assert!(
                error
                    .to_string()
                    .contains(&format!("subscriptions[0].{field}")),
                "unexpected error: {error}"
            );
            assert_eq!(database_fingerprint(database.path()), before);
            assert_eq!(std::fs::read(database.path()).unwrap(), file_before);
        }
    }
}

#[test]
fn legacy_lifecycle_rows_export_validate_and_restore_in_both_modes() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let original = populated_backup(&core);
    let id = &original.subscriptions[0].id;
    Connection::open(database.path())
        .unwrap()
        .execute(
            "UPDATE subscriptions SET status = 'active', is_active = 0 WHERE id = ?1",
            [id],
        )
        .unwrap();
    let backup = core.data_management().export_data().unwrap();
    assert_eq!(backup.subscriptions[0].status, SubscriptionStatus::Paused);
    assert!(!backup.subscriptions[0].is_active);
    DataManagementService::validate_backup(&backup).unwrap();
    for clear in [false, true] {
        let target_file = tempfile::NamedTempFile::new().unwrap();
        let target = KessaiCore::new(target_file.path()).unwrap();
        target
            .data_management()
            .import_data(backup.clone(), clear)
            .unwrap();
        let restored = target.subscriptions().get(id).unwrap();
        assert_eq!(restored.status, SubscriptionStatus::Paused);
        assert!(!restored.is_active);
        assert_eq!(target.payments().list().unwrap().len(), 1);
    }
    // Reading/exporting must not rewrite the legacy database.
    let status: String = Connection::open(database.path())
        .unwrap()
        .query_row(
            "SELECT status FROM subscriptions WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(status, "active");
}

#[test]
fn contradictory_imports_are_normalized_and_report_the_record_count() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let original = populated_backup(&core);
    for (status, active, expected) in [
        (
            SubscriptionStatus::Active,
            false,
            SubscriptionStatus::Paused,
        ),
        (
            SubscriptionStatus::Cancelled,
            true,
            SubscriptionStatus::Cancelled,
        ),
    ] {
        for clear in [false, true] {
            let mut backup = original.clone();
            backup.subscriptions[0].status = status.clone();
            backup.subscriptions[0].is_active = active;
            DataManagementService::validate_backup(&backup).unwrap();
            let result = core.data_management().import_data(backup, clear).unwrap();
            assert!(result.message.contains("Normalized 1 subscription"));
            let row = core
                .subscriptions()
                .get(&original.subscriptions[0].id)
                .unwrap();
            assert_eq!(row.status, expected);
            assert!(!row.is_active);
        }
    }
}

#[test]
fn pre_one_point_zero_backup_forms_normalize_before_validation_and_restore() {
    let source_file = tempfile::NamedTempFile::new().unwrap();
    let source = KessaiCore::new(source_file.path()).unwrap();
    let mut legacy = populated_backup(&source);
    legacy.version = "1.0.0".into();
    legacy.subscriptions[0].next_payment_date = Some("2026-11-05T00:00:00.000Z".into());
    legacy.subscriptions[0].currency = "eur".into();
    legacy.subscriptions[0].shared_count = 0;
    legacy.subscriptions[0].is_active = false;
    DataManagementService::validate_backup(&legacy).unwrap();
    assert_eq!(legacy.subscriptions[0].currency, "eur");
    for clear in [false, true] {
        let target_file = tempfile::NamedTempFile::new().unwrap();
        let target = KessaiCore::new(target_file.path()).unwrap();
        let result = target
            .data_management()
            .import_data(legacy.clone(), clear)
            .unwrap();
        assert!(result.message.contains("Normalized 1 subscription record."));
        let restored = target
            .subscriptions()
            .get(&legacy.subscriptions[0].id)
            .unwrap();
        assert_eq!(restored.next_payment_date.as_deref(), Some("2026-11-05"));
        assert_eq!(restored.currency, "EUR");
        assert_eq!(restored.shared_count, 1);
        assert_eq!(restored.status, SubscriptionStatus::Paused);
        assert!(!restored.is_active);
        DataManagementService::validate_backup(&target.data_management().export_data().unwrap())
            .unwrap();
    }
}

#[test]
fn clean_import_messages_do_not_report_zero_normalizations() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let backup = populated_backup(&core);
    for clear in [false, true] {
        let result = core
            .data_management()
            .import_data(backup.clone(), clear)
            .unwrap();
        assert_eq!(
            result.message,
            "Imported 1 subscription, 10 categories, 1 card, 1 payment, 1 price change, and 1 tag.",
        );
    }
}

// Interleave at an existing read-stage diagnostic, without adding an export hook
// or changing production SQL. Only the exporter thread uses this subscriber.
struct AfterSubscriptions {
    barrier: Arc<Barrier>,
    reached: AtomicBool,
}

impl Subscriber for AfterSubscriptions {
    fn enabled(&self, _: &Metadata<'_>) -> bool {
        true
    }

    fn new_span(&self, _: &span::Attributes<'_>) -> span::Id {
        span::Id::from_u64(1)
    }

    fn record(&self, _: &span::Id, _: &span::Record<'_>) {}
    fn record_follows_from(&self, _: &span::Id, _: &span::Id) {}

    fn event(&self, event: &Event<'_>) {
        if event.metadata().target() == "kessai_core::services::subscription"
            && *event.metadata().level() == tracing::Level::DEBUG
            && !self.reached.swap(true, Ordering::SeqCst)
        {
            self.barrier.wait();
            self.barrier.wait();
        }
    }

    fn enter(&self, _: &span::Id) {}
    fn exit(&self, _: &span::Id) {}
}

#[test]
fn export_is_one_snapshot_when_an_independent_writer_inserts_between_collections() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let exporter = KessaiCore::new(database.path()).unwrap();
    let writer = KessaiCore::new(database.path()).unwrap();
    let barrier = Arc::new(Barrier::new(2));
    let writer_barrier = barrier.clone();
    let write = std::thread::spawn(move || {
        writer_barrier.wait();
        let inserted = populated_backup(&writer);
        writer
            .categories()
            .update(
                "cat-streaming",
                UpdateCategory {
                    name: Some("Updated during export".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        writer_barrier.wait();
        inserted
    });

    let backup = tracing::subscriber::with_default(
        AfterSubscriptions {
            barrier,
            reached: AtomicBool::new(false),
        },
        || exporter.data_management().export_data().unwrap(),
    );
    let inserted = write.join().unwrap();
    assert_eq!(inserted.subscriptions.len(), 1);
    assert_eq!(exporter.subscriptions().list().unwrap().len(), 1);
    DataManagementService::validate_backup(&backup).unwrap();
    assert_eq!(backup.version, "1.2.0");
    assert!(backup.subscriptions.is_empty());
    assert!(backup.payments.is_empty());
    assert!(backup.payment_cards.is_empty());
    assert!(backup.price_history.is_empty());
    assert!(backup.tags.is_empty());
    assert!(backup.subscription_tags.is_empty());
    assert_eq!(backup.settings.monthly_budget, None);
    assert_eq!(backup.settings.notification_time, "09:00");
    assert_eq!(backup.categories.len(), 9);
    assert_eq!(
        backup
            .categories
            .iter()
            .find(|category| category.id == "cat-streaming")
            .unwrap()
            .name,
        "Streaming"
    );
}

#[test]
fn customized_default_category_metadata_round_trips_in_merge_and_replace_modes() {
    let source_file = tempfile::NamedTempFile::new().unwrap();
    let source = KessaiCore::new(source_file.path()).unwrap();
    // A former seeded name can belong to another category after customization.
    // Restoring must not depend on the alphabetical export order.
    source
        .categories()
        .update(
            "cat-music",
            UpdateCategory {
                name: Some("Songs".into()),
                ..Default::default()
            },
        )
        .unwrap();
    source
        .categories()
        .update(
            "cat-streaming",
            UpdateCategory {
                name: Some("Music".into()),
                color: Some("#aabbcc".into()),
                icon: Some("tv".into()),
            },
        )
        .unwrap();
    let backup = source.data_management().export_data().unwrap();
    for clear in [false, true] {
        let target_file = tempfile::NamedTempFile::new().unwrap();
        let target = KessaiCore::new(target_file.path()).unwrap();
        let original = target.categories().get("cat-streaming").unwrap();
        target
            .data_management()
            .import_data(backup.clone(), clear)
            .unwrap();
        let restored = target.categories().get("cat-streaming").unwrap();
        assert_eq!(restored.id, original.id);
        assert!(restored.is_default);
        assert_eq!(restored.created_at, original.created_at);
        assert_eq!(restored.name, "Music");
        assert_eq!(restored.color, "#aabbcc");
        assert_eq!(restored.icon, "tv");
        assert_eq!(target.categories().get("cat-music").unwrap().name, "Songs");
        DataManagementService::validate_backup(&target.data_management().export_data().unwrap())
            .unwrap();
    }
}

#[test]
fn merge_preserves_target_only_price_history_payments_and_links() {
    let source_file = tempfile::NamedTempFile::new().unwrap();
    let source = KessaiCore::new(source_file.path()).unwrap();
    let backup = populated_backup(&source);
    let target_file = tempfile::NamedTempFile::new().unwrap();
    let target = KessaiCore::new(target_file.path()).unwrap();
    target
        .data_management()
        .import_data(backup.clone(), true)
        .unwrap();
    let sub_id = &backup.subscriptions[0].id;
    target
        .subscriptions()
        .update(
            sub_id,
            UpdateSubscription {
                amount: Some(25.0),
                ..Default::default()
            },
        )
        .unwrap();
    let target_payment = target
        .payments()
        .mark_as_paid(sub_id, "2026-10-15", 25.0)
        .unwrap();
    let target_tag = target
        .tags()
        .create(NewTag {
            name: "Target only".into(),
            color: Some("#334455".into()),
        })
        .unwrap();
    target
        .tags()
        .add_to_subscription(sub_id, &target_tag.id)
        .unwrap();
    let history_before = target.price_history().list().unwrap();
    target.data_management().import_data(backup, false).unwrap();
    let mut before_ids: Vec<_> = history_before.iter().map(|change| &change.id).collect();
    let history_after = target.price_history().list().unwrap();
    let mut after_ids: Vec<_> = history_after.iter().map(|change| &change.id).collect();
    before_ids.sort();
    after_ids.sort();
    assert_eq!(after_ids, before_ids);
    assert_eq!(history_after.len(), 2);
    assert_eq!(
        target.payments().get(&target_payment.id).unwrap().amount,
        25.0
    );
    assert_eq!(
        target
            .tags()
            .list_for_subscription(&target_payment.subscription_id)
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn replace_rolls_back_deletes_and_prior_restores_when_a_late_write_fails() {
    let source_file = tempfile::NamedTempFile::new().unwrap();
    let source = KessaiCore::new(source_file.path()).unwrap();
    let backup = populated_backup(&source);
    let target_file = tempfile::NamedTempFile::new().unwrap();
    let target = KessaiCore::new(target_file.path()).unwrap();
    populated_backup(&target);
    let conn = Connection::open(target_file.path()).unwrap();
    conn.execute_batch(
        "CREATE TRIGGER reject_restored_settings BEFORE UPDATE ON settings
         BEGIN SELECT RAISE(ABORT, 'injected restore failure'); END;",
    )
    .unwrap();
    let before = database_fingerprint(target_file.path());
    let error = target
        .data_management()
        .import_data(backup, true)
        .unwrap_err();
    assert!(error.to_string().contains("injected restore failure"));
    assert_eq!(database_fingerprint(target_file.path()), before);
}

#[test]
fn every_record_and_setting_uses_shared_validation_with_indexed_errors() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let backup = populated_backup(&core);
    let before = database_fingerprint(database.path());
    let cases = [
        (
            "/subscriptions/0/name",
            serde_json::json!(" "),
            "subscriptions[0].name",
        ),
        (
            "/subscriptions/0/currency",
            serde_json::json!("us"),
            "subscriptions[0].currency",
        ),
        (
            "/subscriptions/0/billing_day",
            serde_json::json!(32),
            "subscriptions[0].billing_day",
        ),
        (
            "/subscriptions/0/color",
            serde_json::json!("red"),
            "subscriptions[0].color",
        ),
        (
            "/subscriptions/0/notes",
            serde_json::json!("x".repeat(501)),
            "subscriptions[0].notes",
        ),
        (
            "/subscriptions/0/cancellation_reason",
            serde_json::json!("x".repeat(501)),
            "subscriptions[0].cancellation_reason",
        ),
        (
            "/subscriptions/0/trial_end_date",
            serde_json::json!("2026-13-01"),
            "subscriptions[0].trial_end_date",
        ),
        (
            "/subscriptions/0/cancelled_at",
            serde_json::json!("not-a-timestamp"),
            "subscriptions[0].cancelled_at",
        ),
        (
            "/subscriptions/0/last_reviewed_at",
            serde_json::json!("2026-10-01"),
            "subscriptions[0].last_reviewed_at",
        ),
        (
            "/subscriptions/0/updated_at",
            serde_json::json!("broken"),
            "subscriptions[0].updated_at",
        ),
        (
            "/categories/0/name",
            serde_json::json!("x".repeat(101)),
            "categories[0].name",
        ),
        (
            "/categories/0/color",
            serde_json::json!("#123"),
            "categories[0].color",
        ),
        (
            "/categories/0/icon",
            serde_json::json!(""),
            "categories[0].icon",
        ),
        (
            "/categories/0/is_default",
            serde_json::json!(false),
            "categories[0].is_default",
        ),
        (
            "/payment_cards/0/name",
            serde_json::json!(""),
            "payment_cards[0].name",
        ),
        (
            "/payment_cards/0/color",
            serde_json::json!("blue"),
            "payment_cards[0].color",
        ),
        (
            "/payment_cards/0/last_four",
            serde_json::json!("12a4"),
            "payment_cards[0].last_four",
        ),
        (
            "/payment_cards/0/credit_limit",
            serde_json::json!(-1),
            "payment_cards[0].credit_limit",
        ),
        (
            "/payments/0/amount",
            serde_json::json!(-1),
            "payments[0].amount",
        ),
        (
            "/payments/0/due_date",
            serde_json::json!("2026-09-31"),
            "payments[0].due_date",
        ),
        (
            "/payments/0/paid_at",
            serde_json::json!("2026-09-15"),
            "payments[0].paid_at",
        ),
        (
            "/payments/0/notes",
            serde_json::json!("x".repeat(501)),
            "payments[0].notes",
        ),
        (
            "/price_history/0/old_amount",
            serde_json::json!(-1),
            "price_history[0].old_amount",
        ),
        (
            "/price_history/0/new_amount",
            serde_json::json!(-1),
            "price_history[0].new_amount",
        ),
        (
            "/price_history/0/old_currency",
            serde_json::json!("EURR"),
            "price_history[0].old_currency",
        ),
        (
            "/price_history/0/new_currency",
            serde_json::json!("eur"),
            "price_history[0].new_currency",
        ),
        (
            "/price_history/0/changed_at",
            serde_json::json!("yesterday"),
            "price_history[0].changed_at",
        ),
        ("/tags/0/name", serde_json::json!(""), "tags[0].name"),
        (
            "/tags/0/color",
            serde_json::json!("#gggggg"),
            "tags[0].color",
        ),
        (
            "/settings/theme",
            serde_json::json!("unknown"),
            "settings[0].theme",
        ),
        (
            "/settings/animation_speed",
            serde_json::json!("unknown"),
            "settings[0].animation_speed",
        ),
        (
            "/settings/currency",
            serde_json::json!("usd"),
            "settings[0].currency",
        ),
        (
            "/settings/monthly_budget",
            serde_json::json!(-1),
            "settings[0].monthly_budget",
        ),
        (
            "/settings/notification_time",
            serde_json::json!("24:00"),
            "settings[0].notification_time",
        ),
        (
            "/settings/notification_advance_days",
            serde_json::json!(-1),
            "settings[0].notification_advance_days",
        ),
        (
            "/settings/notification_days_before/1",
            serde_json::json!(-1),
            "settings[0].notification_days_before[1]",
        ),
        (
            "/settings/display_exchange_rates",
            serde_json::json!({"usd": 1}),
            "settings[0].display_exchange_rates.usd",
        ),
        (
            "/settings/display_exchange_rates",
            serde_json::json!({"EUR": 0}),
            "settings[0].display_exchange_rates.EUR",
        ),
    ];
    for (pointer, value, expected) in cases {
        let mut json = serde_json::to_value(&backup).unwrap();
        if let Some(target) = json.pointer_mut(pointer) {
            *target = value;
        } else {
            // Optional metadata may be omitted by serialization.
            let (parent, field) = pointer.rsplit_once('/').unwrap();
            json.pointer_mut(parent).unwrap()[field] = value;
        }
        let invalid: BackupData = serde_json::from_value(json).unwrap();
        let error = core
            .data_management()
            .import_data(invalid, true)
            .unwrap_err();
        assert!(matches!(error, KessaiCoreError::Validation(_)));
        assert!(error.to_string().contains(expected), "{pointer}: {error}");
        assert_eq!(database_fingerprint(database.path()), before);
    }
    for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let mut invalid = backup.clone();
        invalid.subscriptions[0].amount = value;
        let error = DataManagementService::validate_backup(&invalid).unwrap_err();
        assert!(error.to_string().contains("subscriptions[0].amount"));
    }
}

#[test]
fn restored_outcomes_keep_legacy_duplicates_without_adopting_pending_rows() {
    let source_file = tempfile::NamedTempFile::new().unwrap();
    let source = KessaiCore::new(source_file.path()).unwrap();
    let mut backup = populated_backup(&source);
    backup.payments[0].id = "paid-b".into();
    let mut duplicate = backup.payments[0].clone();
    duplicate.id = "paid-a".into();
    backup.payments.push(duplicate);
    let mut pending = backup.payments[0].clone();
    pending.id = "pending".into();
    pending.due_date = "2026-10-15".into();
    pending.status = PaymentStatus::Pending;
    backup.payments.push(pending);

    for clear in [false, true] {
        let target_file = tempfile::NamedTempFile::new().unwrap();
        let target = KessaiCore::new(target_file.path()).unwrap();
        target
            .data_management()
            .import_data(backup.clone(), clear)
            .unwrap();
        let sub = &backup.subscriptions[0];
        assert_eq!(target.payments().list().unwrap().len(), 3);
        assert!(target
            .payments()
            .is_recorded(&sub.id, "2026-09-15")
            .unwrap());
        assert!(!target
            .payments()
            .is_recorded(&sub.id, "2026-10-15")
            .unwrap());
        assert_eq!(
            target
                .payments()
                .mark_as_paid(&sub.id, "2026-09-15", 20.0)
                .unwrap()
                .id,
            "paid-a"
        );
        assert_eq!(
            target
                .subscriptions()
                .get(&sub.id)
                .unwrap()
                .next_payment_date,
            sub.next_payment_date
        );
        assert!(matches!(
            target.payments().skip_payment(&sub.id, "2026-09-15", 20.0),
            Err(KessaiCoreError::Conflict(_))
        ));
        target
            .payments()
            .mark_as_paid(&sub.id, "2026-10-15", 20.0)
            .unwrap();
        assert_eq!(
            target
                .subscriptions()
                .get(&sub.id)
                .unwrap()
                .next_payment_date
                .as_deref(),
            Some("2026-11-15")
        );
        assert_eq!(target.payments().list().unwrap().len(), 4);
    }
}

#[test]
fn unknown_default_identities_and_current_dangling_references_are_rejected() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let backup = populated_backup(&core);
    for (pointer, value, expected) in [
        (
            "/categories/0/id",
            serde_json::json!("unknown-default"),
            "categories[0].is_default",
        ),
        (
            "/subscriptions/0/category_id",
            serde_json::json!("missing"),
            "subscriptions[0].category_id",
        ),
        (
            "/subscriptions/0/card_id",
            serde_json::json!("missing"),
            "subscriptions[0].card_id",
        ),
        (
            "/payments/0/subscription_id",
            serde_json::json!("missing"),
            "payments[0].subscription_id",
        ),
        (
            "/price_history/0/subscription_id",
            serde_json::json!("missing"),
            "price_history[0].subscription_id",
        ),
        (
            "/subscription_tags/0/subscription_id",
            serde_json::json!("missing"),
            "subscription_tags[0].subscription_id",
        ),
        (
            "/subscription_tags/0/tag_id",
            serde_json::json!("missing"),
            "subscription_tags[0].tag_id",
        ),
        ("/tags/0/id", serde_json::json!(" "), "tags[0].id"),
    ] {
        let mut json = serde_json::to_value(&backup).unwrap();
        *json.pointer_mut(pointer).unwrap() = value;
        let invalid: BackupData = serde_json::from_value(json).unwrap();
        let error = DataManagementService::validate_backup(&invalid).unwrap_err();
        assert!(error.to_string().contains(expected), "{pointer}: {error}");
    }
    let mut duplicate = backup.clone();
    duplicate.tags.push(backup.tags[0].clone());
    let error = DataManagementService::validate_backup(&duplicate).unwrap_err();
    assert!(error.to_string().contains("tags[1].id"));
    let mut duplicate = backup.clone();
    duplicate
        .subscription_tags
        .push(backup.subscription_tags[0].clone());
    let error = DataManagementService::validate_backup(&duplicate).unwrap_err();
    assert!(error.to_string().contains("subscription_tags[1].tag_id"));
    let mut future = backup.clone();
    future.version = "2.0.0".into();
    assert!(DataManagementService::validate_backup(&future).is_err());
    let mut oversized = backup.clone();
    oversized.subscriptions = vec![backup.subscriptions[0].clone(); 10_001];
    assert!(DataManagementService::validate_backup(&oversized)
        .unwrap_err()
        .to_string()
        .contains("collection limits"));
}

const LEGACY_1_0: &str = r##"{
    "version": "1.0.0",
    "exportedAt": "2025-01-01T00:00:00Z",
    "categories": [{
        "id": "cat-streaming", "name": "Legacy streaming", "color": "#123456",
        "icon": "tv", "is_default": true, "created_at": "2024-01-01 00:00:00"
    }],
    "subscriptions": [{
        "id": "legacy-subscription", "name": "Legacy service", "amount": 10,
        "currency": "USD", "billing_cycle": "monthly", "is_active": true,
        "next_payment_date": "2025-02-01", "category_id": "cat-streaming",
        "card_id": "card-not-in-old-format", "status": "active",
        "shared_count": 1, "is_pinned": false,
        "created_at": "2024-01-01 00:00:00", "updated_at": "2024-01-01 00:00:00"
    }],
    "payments": [{
        "id": "legacy-payment", "subscription_id": "legacy-subscription",
        "amount": 10, "paid_at": "2025-01-01T09:00:00Z", "due_date": "2025-01-01",
        "status": "paid", "created_at": "2025-01-01 09:00:00"
    }],
    "settings": {
        "theme": "dark", "currency": "USD", "notification_enabled": true,
        "notification_days_before": [1, 3, 7]
    }
}"##;

const LEGACY_1_1: &str = r##"{
    "version": "1.1.0",
    "exportedAt": "2025-01-01T00:00:00Z",
    "categories": [{
        "id": "cat-streaming", "name": "Legacy streaming", "color": "#123456",
        "icon": "tv", "is_default": true, "created_at": "2024-01-01 00:00:00"
    }],
    "subscriptions": [{
        "id": "legacy-subscription", "name": "Legacy service", "amount": 10,
        "currency": "USD", "billing_cycle": "monthly", "is_active": true,
        "next_payment_date": "2025-02-01", "category_id": "cat-streaming",
        "card_id": "card-not-in-old-format", "status": "active",
        "shared_count": 1, "is_pinned": false,
        "created_at": "2024-01-01 00:00:00", "updated_at": "2024-01-01 00:00:00"
    }],
    "payments": [{
        "id": "legacy-payment", "subscription_id": "legacy-subscription",
        "amount": 10, "paid_at": "2025-01-01T09:00:00Z", "due_date": "2025-01-01",
        "status": "paid", "created_at": "2025-01-01 09:00:00"
    }],
    "price_history": [{
        "id": "legacy-price", "subscription_id": "legacy-subscription",
        "old_amount": 8, "new_amount": 10, "old_currency": "USD",
        "new_currency": "USD", "changed_at": "2024-12-01 00:00:00"
    }],
    "tags": [{
        "id": "legacy-tag", "name": "Legacy tag", "color": "#112233",
        "created_at": "2024-01-01 00:00:00"
    }],
    "subscription_tags": [{"subscription_id": "legacy-subscription", "tag_id": "legacy-tag"}],
    "settings": {
        "theme": "dark", "currency": "USD", "notification_enabled": true,
        "notification_days_before": [1, 3, 7], "monthly_budget": 100
    }
}"##;

#[test]
fn legacy_1_0_and_1_1_fixtures_import_with_card_normalization_and_setting_defaults() {
    for fixture in [LEGACY_1_0, LEGACY_1_1] {
        for clear in [false, true] {
            let database = tempfile::NamedTempFile::new().unwrap();
            let core = KessaiCore::new(database.path()).unwrap();
            let backup: BackupData = serde_json::from_str(fixture).unwrap();
            DataManagementService::validate_backup(&backup).unwrap();
            let has_tags = backup.version == "1.1.0";
            core.data_management().import_data(backup, clear).unwrap();
            let subscription = core.subscriptions().get("legacy-subscription").unwrap();
            assert_eq!(subscription.card_id, None);
            assert_eq!(subscription.amount, 10.0);
            assert_eq!(
                core.categories().get("cat-streaming").unwrap().name,
                "Legacy streaming"
            );
            assert_eq!(core.payments().list().unwrap().len(), 1);
            assert_eq!(
                core.price_history().list().unwrap().len(),
                usize::from(has_tags)
            );
            assert_eq!(core.tags().list().unwrap().len(), usize::from(has_tags));
            assert_eq!(core.settings().get().unwrap().notification_time, "09:00");
            assert!(core.settings().get().unwrap().enable_transitions);
            assert_eq!(
                core.payments()
                    .mark_as_paid("legacy-subscription", "2025-01-01", 10.0)
                    .unwrap()
                    .id,
                "legacy-payment"
            );
            DataManagementService::validate_backup(&core.data_management().export_data().unwrap())
                .unwrap();
        }
    }
}

#[test]
fn export_keeps_one_complete_snapshot_when_replace_import_commits_mid_export() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let exporter = KessaiCore::new(file.path()).unwrap();
    let original = populated_backup(&exporter);
    let importer = KessaiCore::new(file.path()).unwrap();
    let mut replacement = original.clone();
    replacement.subscriptions[0].name = "Replacement name".into();
    replacement.subscriptions[0].amount = 42.0;
    replacement.payments.clear();
    replacement.price_history.clear();
    replacement.tags.clear();
    replacement.subscription_tags.clear();
    replacement.settings.monthly_budget = Some(999.0);
    let barrier = Arc::new(Barrier::new(2));
    let write_barrier = barrier.clone();
    let writer = std::thread::spawn(move || {
        write_barrier.wait();
        importer
            .data_management()
            .import_data(replacement, true)
            .unwrap();
        write_barrier.wait();
    });
    let exported = tracing::subscriber::with_default(
        AfterSubscriptions {
            barrier,
            reached: AtomicBool::new(false),
        },
        || exporter.data_management().export_data().unwrap(),
    );
    writer.join().unwrap();
    DataManagementService::validate_backup(&exported).unwrap();
    assert_eq!(
        exported.subscriptions[0].name,
        original.subscriptions[0].name
    );
    assert_eq!(exported.subscriptions[0].amount, 20.0);
    assert_eq!(exported.payments.len(), 1);
    assert_eq!(exported.price_history.len(), 1);
    assert_eq!(exported.subscription_tags.len(), 1);
    assert_eq!(exported.settings.monthly_budget, Some(200.0));
    let current = exporter.data_management().export_data().unwrap();
    assert_eq!(current.subscriptions[0].name, "Replacement name");
    assert!(current.payments.is_empty());
    assert_eq!(current.settings.monthly_budget, Some(999.0));
}
