//! Release edge contracts at public core service seams. Raw SQL only arranges
//! legacy/corrupt fixtures; assertions use the same services as application users.
use kessai_core::{models::*, services::DataManagementService, KessaiCore};
use rusqlite::{params, Connection};

fn new_subscription() -> NewSubscription {
    serde_json::from_value(serde_json::json!({
        "name": "Release subscription", "amount": 12.0, "currency": "USD",
        "billing_cycle": "monthly", "next_payment_date": "2026-02-15"
    }))
    .unwrap()
}

/// Truly unparseable rows do not poison read screens, but must block export.
#[test]
fn corrupt_subscription_rows_do_not_poison_list_calendar_or_dashboard() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(file.path()).unwrap();
    let healthy = core.subscriptions().create(new_subscription()).unwrap();
    let conn = Connection::open(file.path()).unwrap();
    let mut unreadable_ids = Vec::new();
    for (index, (column, value)) in [
        ("next_payment_date", "'garbage'"),
        ("next_payment_date", "'2026-02-30'"),
        ("next_payment_date", "''"),
        ("billing_cycle", "'fortnightly'"),
        ("amount", "-1"),
        ("status", "'unknown'"),
        // SQLite maps IEEE NaN to NULL, rejected by NOT NULL. Legacy dynamic
        // typing still permits textual NaN and IEEE infinity in a REAL column.
        ("amount", "'NaN'"),
        ("amount", "1e999"),
    ]
    .into_iter()
    .enumerate()
    {
        let sub = core.subscriptions().create(new_subscription()).unwrap();
        conn.execute(
            &format!("UPDATE subscriptions SET {column} = {value} WHERE id = ?1"),
            [&sub.id],
        )
        .unwrap();
        assert!(!sub.id.is_empty(), "fixture {index}");
        let fetched = core.subscriptions().get(&sub.id);
        if matches!(column, "billing_cycle" | "status") || value == "'NaN'" {
            assert!(fetched.is_err());
        } else {
            assert!(fetched.is_ok(), "repairable fixture {index}");
        }
        unreadable_ids.push(sub.id);
    }
    let mut data = new_subscription();
    data.next_payment_date = None;
    let undated = core.subscriptions().create(data).unwrap();
    let contradictory = core.subscriptions().create(new_subscription()).unwrap();
    conn.execute(
        "UPDATE subscriptions SET status = 'cancelled', is_active = 1 WHERE id = ?1",
        params![contradictory.id],
    )
    .unwrap();

    let listed = core.subscriptions().list().unwrap();
    assert_eq!(listed.len(), 3);
    assert!(listed.iter().any(|row| row.id == undated.id));
    assert!(listed.iter().any(|row| row.id == contradictory.id));
    let month = core.calendar().month(2026, 2).unwrap();
    assert_eq!(month.len(), 1);
    assert_eq!(month[0].subscription_id, healthy.id);
    let summary = core.analytics().dashboard_summary("USD").unwrap();
    assert_eq!(summary.total_count, 3);
    assert_eq!(summary.active_count, 2);
    assert_eq!(summary.total_monthly, 24.0);
    let error = core.data_management().export_data().unwrap_err();
    assert!(matches!(
        error,
        kessai_core::error::KessaiCoreError::Validation(_)
    ));
    let message = error.to_string();
    for id in unreadable_ids {
        assert!(message.contains(&id), "{message}");
    }
}

#[test]
fn corrupt_amount_can_be_repaired_without_creating_an_unrestorable_backup() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(file.path()).unwrap();
    let sub = core.subscriptions().create(new_subscription()).unwrap();
    Connection::open(file.path())
        .unwrap()
        .execute(
            "UPDATE subscriptions SET amount = -1 WHERE id = ?1",
            [&sub.id],
        )
        .unwrap();
    assert_eq!(core.subscriptions().get(&sub.id).unwrap().amount, -1.0);
    let error = core
        .subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                name: Some("Not a repair".into()),
                ..Default::default()
            },
        )
        .unwrap_err();
    assert!(error.to_string().contains("amount"), "{error}");
    assert_eq!(core.subscriptions().get(&sub.id).unwrap().name, sub.name);
    let repaired = core
        .subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                amount: Some(5.0),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(repaired.amount, 5.0);
    let backup = core.data_management().export_data().unwrap();
    DataManagementService::validate_backup(&backup).unwrap();
    assert_eq!(backup.subscriptions[0].amount, 5.0);
    assert!(backup.price_history.is_empty());
    core.data_management().import_data(backup, true).unwrap();
    assert_eq!(core.subscriptions().get(&sub.id).unwrap().amount, 5.0);
}

#[test]
fn needing_review_skips_corrupt_rows_and_keeps_healthy_subscriptions() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(file.path()).unwrap();
    let healthy = core.subscriptions().create(new_subscription()).unwrap();
    let corrupt = core.subscriptions().create(new_subscription()).unwrap();
    Connection::open(file.path())
        .unwrap()
        .execute(
            "UPDATE subscriptions SET amount = -1 WHERE id = ?1",
            [&corrupt.id],
        )
        .unwrap();
    let review = core.subscriptions().list_needing_review(30).unwrap();
    assert_eq!(review.len(), 1);
    assert_eq!(review[0].id, healthy.id);
}

#[test]
fn export_rejects_every_subscription_and_category_field_that_restore_would_reject() {
    for (column, value) in [
        ("currency", "us".to_string()),
        ("billing_day", "0".to_string()),
        ("color", "red".to_string()),
        ("name", "n".repeat(101)),
        ("notes", "n".repeat(501)),
        ("created_at", "not-a-timestamp".to_string()),
        ("updated_at", "not-a-timestamp".to_string()),
        ("status_changed_at", "not-a-timestamp".to_string()),
        ("cancelled_at", "not-a-timestamp".to_string()),
        ("last_reviewed_at", "not-a-timestamp".to_string()),
    ] {
        let file = tempfile::NamedTempFile::new().unwrap();
        let core = KessaiCore::new(file.path()).unwrap();
        let sub = core.subscriptions().create(new_subscription()).unwrap();
        Connection::open(file.path())
            .unwrap()
            .execute(
                &format!("UPDATE subscriptions SET {column} = ?1 WHERE id = ?2"),
                params![value, sub.id],
            )
            .unwrap();
        assert!(core.subscriptions().get(&sub.id).is_ok());
        assert_eq!(core.subscriptions().list().unwrap().len(), 1);
        let error = core.data_management().export_data().unwrap_err();
        let message = error.to_string();
        assert!(message.contains(&sub.id), "{column}: {message}");
        assert!(message.contains(column), "{column}: {message}");
    }
    for (column, value) in [
        ("name", "n".repeat(101)),
        ("color", "red".to_string()),
        ("icon", String::new()),
        ("icon", "i".repeat(101)),
        ("created_at", "not-a-timestamp".to_string()),
    ] {
        let file = tempfile::NamedTempFile::new().unwrap();
        let core = KessaiCore::new(file.path()).unwrap();
        let category = core
            .categories()
            .create(NewCategory {
                name: "Export parity".into(),
                color: "#123456".into(),
                icon: "tag".into(),
            })
            .unwrap();
        let mut backup = core.data_management().export_data().unwrap();
        let index = backup
            .categories
            .iter()
            .position(|row| row.id == category.id)
            .unwrap();
        let mut corrupt = serde_json::to_value(&backup.categories[index]).unwrap();
        corrupt[column] = serde_json::Value::String(value.clone());
        backup.categories[index] = serde_json::from_value(corrupt).unwrap();
        let validation = DataManagementService::validate_backup(&backup).unwrap_err();
        assert!(matches!(
            validation,
            kessai_core::error::KessaiCoreError::Validation(_)
        ));
        Connection::open(file.path())
            .unwrap()
            .execute(
                &format!("UPDATE categories SET {column} = ?1 WHERE id = ?2"),
                params![value, category.id],
            )
            .unwrap();
        // Renaming the corrupt category can change the export's name ordering.
        let exported_index = core
            .categories()
            .list()
            .unwrap()
            .iter()
            .position(|row| row.id == category.id)
            .unwrap();
        let error = core.data_management().export_data().unwrap_err();
        assert!(matches!(
            error,
            kessai_core::error::KessaiCoreError::Validation(_)
        ));
        assert!(
            error
                .to_string()
                .contains(&format!("categories[{exported_index}].{column}")),
            "{column}: {error}"
        );
    }
}

#[test]
fn category_icon_create_and_update_share_backup_validation_limits() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(file.path()).unwrap();
    let category = core
        .categories()
        .create(NewCategory {
            name: "Icon validation".into(),
            color: "#123456".into(),
            icon: "i".repeat(100),
        })
        .unwrap();
    for icon in [String::new(), "i".repeat(101)] {
        assert!(matches!(
            core.categories().create(NewCategory {
                name: "Invalid icon".into(),
                color: "#123456".into(),
                icon: icon.clone(),
            }),
            Err(kessai_core::error::KessaiCoreError::Validation(message))
                if message.contains("category icon")
        ));
        assert!(matches!(
            core.categories().update(&category.id, UpdateCategory {
                icon: Some(icon),
                ..Default::default()
            }),
            Err(kessai_core::error::KessaiCoreError::Validation(message))
                if message.contains("category icon")
        ));
    }
    assert_eq!(
        core.categories().get(&category.id).unwrap().icon,
        "i".repeat(100)
    );
    core.categories()
        .update(
            &category.id,
            UpdateCategory {
                icon: Some("🦀".repeat(100)),
                ..Default::default()
            },
        )
        .unwrap();
    let backup = core.data_management().export_data().unwrap();
    DataManagementService::validate_backup(&backup).unwrap();
    for clear in [false, true] {
        core.data_management()
            .import_data(backup.clone(), clear)
            .unwrap();
        assert_eq!(
            core.categories().get(&category.id).unwrap().icon,
            "🦀".repeat(100)
        );
    }
}

// Coordinate independent callers at the existing toggle diagnostic, as the
// backup snapshot contract does. Only the returned durable state is asserted.
struct ToggleBarrier(std::sync::Arc<std::sync::Barrier>);

impl tracing::Subscriber for ToggleBarrier {
    fn enabled(&self, _: &tracing::Metadata<'_>) -> bool {
        true
    }
    fn new_span(&self, _: &tracing::span::Attributes<'_>) -> tracing::span::Id {
        tracing::span::Id::from_u64(1)
    }
    fn record(&self, _: &tracing::span::Id, _: &tracing::span::Record<'_>) {}
    fn record_follows_from(&self, _: &tracing::span::Id, _: &tracing::span::Id) {}
    fn enter(&self, _: &tracing::span::Id) {}
    fn exit(&self, _: &tracing::span::Id) {}
    fn event(&self, event: &tracing::Event<'_>) {
        if event.metadata().target() == "kessai_core::services::subscription"
            && *event.metadata().level() == tracing::Level::DEBUG
        {
            self.0.wait();
        }
    }
}

#[test]
fn two_simultaneous_pin_toggles_cancel_out_without_losing_an_update() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let first = KessaiCore::new(file.path()).unwrap();
    let second = KessaiCore::new(file.path()).unwrap();
    let sub = first.subscriptions().create(new_subscription()).unwrap();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    std::thread::scope(|scope| {
        for core in [&first, &second] {
            let id = &sub.id;
            let barrier = barrier.clone();
            scope.spawn(move || {
                tracing::subscriber::with_default(ToggleBarrier(barrier), || {
                    core.subscriptions().toggle_pinned(id).unwrap()
                })
            });
        }
    });
    assert!(!first.subscriptions().get(&sub.id).unwrap().is_pinned);
}

#[test]
fn exporting_a_corrupt_parent_errors_without_discarding_any_collections() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(file.path()).unwrap();
    let sub = core.subscriptions().create(new_subscription()).unwrap();
    core.payments()
        .mark_as_paid(&sub.id, "2026-02-15", 12.0)
        .unwrap();
    core.subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                amount: Some(13.0),
                ..Default::default()
            },
        )
        .unwrap();
    let tag = core
        .tags()
        .create(NewTag {
            name: "Legacy".into(),
            color: None,
        })
        .unwrap();
    core.tags().add_to_subscription(&sub.id, &tag.id).unwrap();
    Connection::open(file.path())
        .unwrap()
        .execute(
            "UPDATE subscriptions SET next_payment_date = 'garbage' WHERE id = ?1",
            [&sub.id],
        )
        .unwrap();
    let before = (
        core.payments().list().unwrap().len(),
        core.price_history().list().unwrap().len(),
        core.tags().list().unwrap().len(),
    );
    let error = core.data_management().export_data().unwrap_err();
    assert!(matches!(
        error,
        kessai_core::error::KessaiCoreError::Validation(_)
    ));
    let message = error.to_string();
    for text in [
        sub.id.as_str(),
        "Release subscription",
        "next payment date",
        "kessai-mcp subscriptions update <id>",
        "remove <id>",
    ] {
        assert!(message.contains(text), "{message}");
    }
    assert_eq!(core.payments().list().unwrap().len(), before.0);
    assert_eq!(core.price_history().list().unwrap().len(), before.1);
    assert_eq!(core.tags().list().unwrap().len(), before.2);
}

#[test]
fn legacy_read_forms_keep_subscriptions_and_payments_through_restore() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(file.path()).unwrap();
    let sub = core.subscriptions().create(new_subscription()).unwrap();
    core.payments()
        .create(NewPayment {
            subscription_id: sub.id.clone(),
            amount: 12.0,
            paid_at: "2026-02-15T09:00:00Z".into(),
            due_date: "2026-02-15".into(),
            status: PaymentStatus::Paid,
            notes: None,
        })
        .unwrap();
    Connection::open(file.path())
        .unwrap()
        .execute(
            "UPDATE subscriptions SET next_payment_date = '2026-02-15T00:00:00.000Z',
         currency = 'usd', shared_count = 0 WHERE id = ?1",
            [&sub.id],
        )
        .unwrap();
    let listed = core.subscriptions().list().unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].next_payment_date.as_deref(), Some("2026-02-15"));
    assert_eq!(listed[0].currency, "USD");
    assert_eq!(listed[0].shared_count, 1);
    assert_eq!(
        serde_json::to_value(&listed[0]).unwrap(),
        serde_json::to_value(core.subscriptions().get(&sub.id).unwrap()).unwrap()
    );
    let calendar = core.calendar().month(2026, 2).unwrap();
    assert_eq!(calendar.len(), 1);
    assert!(calendar[0].payment.is_some());
    let backup = core.data_management().export_data().unwrap();
    DataManagementService::validate_backup(&backup).unwrap();
    for clear in [false, true] {
        core.data_management()
            .import_data(backup.clone(), clear)
            .unwrap();
        assert_eq!(core.subscriptions().list().unwrap().len(), 1);
        assert_eq!(core.payments().list().unwrap().len(), 1);
    }
}

#[test]
fn legacy_trial_end_timestamp_normalizes_on_reads_export_and_both_restore_modes_without_read_writes(
) {
    let file = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(file.path()).unwrap();
    let sub = core.subscriptions().create(new_subscription()).unwrap();
    let legacy_date = "2026-02-15T00:00:00.000Z";
    let conn = Connection::open(file.path()).unwrap();
    conn.execute(
        "UPDATE subscriptions SET trial_end_date = ?1 WHERE id = ?2",
        params![legacy_date, sub.id],
    )
    .unwrap();

    let listed = core.subscriptions().list().unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].trial_end_date.as_deref(), Some("2026-02-15"));
    assert_eq!(
        core.subscriptions()
            .get(&sub.id)
            .unwrap()
            .trial_end_date
            .as_deref(),
        Some("2026-02-15")
    );
    let backup = core.data_management().export_data().unwrap();
    assert_eq!(
        backup.subscriptions[0].trial_end_date.as_deref(),
        Some("2026-02-15")
    );
    DataManagementService::validate_backup(&backup).unwrap();
    // Reads and export normalize in memory only; only explicit restore writes.
    let stored: (String, String) = conn
        .query_row(
            "SELECT trial_end_date, updated_at FROM subscriptions WHERE id = ?1",
            [&sub.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(stored, (legacy_date.into(), sub.updated_at));
    for clear in [false, true] {
        core.data_management()
            .import_data(backup.clone(), clear)
            .unwrap();
        assert_eq!(
            core.subscriptions().list().unwrap()[0]
                .trial_end_date
                .as_deref(),
            Some("2026-02-15")
        );
    }
    // A backup whose only legacy field is trial_end_date uses the same
    // normalization in validation/preflight and in merge/replace import.
    let mut legacy_backup = backup;
    legacy_backup.subscriptions[0].trial_end_date = Some(legacy_date.into());
    DataManagementService::validate_backup(&legacy_backup).unwrap();
    for clear in [false, true] {
        core.data_management()
            .import_data(legacy_backup.clone(), clear)
            .unwrap();
        assert_eq!(
            core.data_management().export_data().unwrap().subscriptions[0]
                .trial_end_date
                .as_deref(),
            Some("2026-02-15")
        );
    }
}

#[test]
fn calendar_extreme_years_leap_anchors_and_distant_weekly_projection_are_bounded() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(file.path()).unwrap();
    let mut monthly = new_subscription();
    monthly.next_payment_date = Some("2024-01-31".into());
    monthly.billing_day = Some(31);
    let monthly = core.subscriptions().create(monthly).unwrap();
    for (year, month, expected) in [
        (1900, 1, "1900-01-31"),
        (1900, 2, "1900-02-28"),
        (2024, 2, "2024-02-29"),
        (2025, 2, "2025-02-28"),
        (2026, 12, "2026-12-31"),
        (2027, 1, "2027-01-31"),
        (9998, 12, "9998-12-31"),
    ] {
        assert_eq!(
            core.calendar().month(year, month).unwrap()[0].due_date,
            expected
        );
    }
    let mut yearly = new_subscription();
    yearly.billing_cycle = BillingCycle::Yearly;
    yearly.next_payment_date = Some("2024-02-29".into());
    let yearly = core.subscriptions().create(yearly).unwrap();
    core.payments()
        .mark_as_paid(&yearly.id, "2024-02-29", 12.0)
        .unwrap();
    assert_eq!(
        core.subscriptions()
            .get(&yearly.id)
            .unwrap()
            .next_payment_date
            .as_deref(),
        Some("2025-02-28")
    );
    core.subscriptions().delete(&monthly.id).unwrap();
    core.subscriptions().delete(&yearly.id).unwrap();
    let mut weekly = new_subscription();
    weekly.billing_cycle = BillingCycle::Weekly;
    weekly.next_payment_date = Some("1900-01-01".into());
    let weekly = core.subscriptions().create(weekly).unwrap();
    let started = std::time::Instant::now();
    let far = core.calendar().month(9998, 12).unwrap();
    assert_eq!(
        far.iter()
            .map(|row| row.due_date.as_str())
            .collect::<Vec<_>>(),
        ["9998-12-07", "9998-12-14", "9998-12-21", "9998-12-28"]
    );
    assert!(started.elapsed() < std::time::Duration::from_secs(1));
    core.subscriptions()
        .update(
            &weekly.id,
            UpdateSubscription {
                next_payment_date: Some(Some("9998-12-28".into())),
                ..Default::default()
            },
        )
        .unwrap();
    // Projection is intentionally bidirectional from a stored anchor.
    let before = core.calendar().month(1900, 1).unwrap();
    assert_eq!(
        before
            .iter()
            .map(|row| row.due_date.as_str())
            .collect::<Vec<_>>(),
        [
            "1900-01-01",
            "1900-01-08",
            "1900-01-15",
            "1900-01-22",
            "1900-01-29"
        ]
    );
    let april = core.calendar().month(2026, 4).unwrap();
    assert_eq!(
        april
            .iter()
            .map(|row| row.due_date.as_str())
            .collect::<Vec<_>>(),
        ["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"]
    );
    eprintln!("distant calendar projection: {:?}", started.elapsed());
}

/// Limits count Unicode scalar values, including emoji, RTL and zero-width
/// characters; text is preserved, not normalized. Free subscriptions are valid.
#[test]
fn unicode_text_and_zero_amount_round_trip_through_create_update_and_restore() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(file.path()).unwrap();
    for name in [
        "名".repeat(100),
        "🦀".repeat(100),
        "ع".repeat(100),
        format!("A{}", "\u{200b}".repeat(99)),
    ] {
        let mut data = new_subscription();
        data.name = name.clone();
        data.notes = Some("🦀".repeat(500));
        data.amount = 0.0;
        data.shared_count = 99;
        let sub = core.subscriptions().create(data).unwrap();
        assert_eq!(sub.name, name);
        assert_eq!(sub.notes.as_deref(), Some("🦀".repeat(500).as_str()));
        let sub = core
            .subscriptions()
            .update(
                &sub.id,
                UpdateSubscription {
                    amount: Some(0.0),
                    shared_count: Some(1),
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(sub.amount, 0.0);
        assert_eq!(sub.shared_count, 1);
        for patch in [
            serde_json::json!({"name": format!("{name}x")}),
            serde_json::json!({"notes": "🦀".repeat(501)}),
            serde_json::json!({"currency": "usd"}),
            serde_json::json!({"currency": "USDD"}),
            serde_json::json!({"currency": ""}),
        ] {
            assert!(matches!(
                core.subscriptions()
                    .update(&sub.id, serde_json::from_value(patch).unwrap()),
                Err(kessai_core::error::KessaiCoreError::Validation(_))
            ));
        }
    }
    let backup = core.data_management().export_data().unwrap();
    core.data_management()
        .import_data(backup.clone(), true)
        .unwrap();
    assert_eq!(core.subscriptions().list().unwrap().len(), 4);
    assert!(core
        .subscriptions()
        .list()
        .unwrap()
        .iter()
        .all(|sub| sub.amount == 0.0));
    core.data_management()
        .import_data(backup.clone(), false)
        .unwrap();
    core.data_management().import_data(backup, false).unwrap();
    assert_eq!(core.subscriptions().list().unwrap().len(), 4);
}

/// Deleting ledger history does not rewind the schedule; paying that historical
/// occurrence again recreates history without advancing the current due date.
#[test]
fn deleting_and_repaying_an_old_outcome_does_not_advance_schedule_again() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(file.path()).unwrap();
    let sub = core.subscriptions().create(new_subscription()).unwrap();
    let paid = core
        .payments()
        .mark_as_paid(&sub.id, "2026-02-15", 12.0)
        .unwrap();
    core.payments().delete(&paid.id).unwrap();
    let repaid = core
        .payments()
        .mark_as_paid(&sub.id, "2026-02-15", 12.0)
        .unwrap();
    assert_ne!(paid.id, repaid.id);
    assert_eq!(
        core.subscriptions()
            .get(&sub.id)
            .unwrap()
            .next_payment_date
            .as_deref(),
        Some("2026-03-15")
    );
    assert_eq!(
        core.payments().list_by_subscription(&sub.id).unwrap().len(),
        1
    );
}

/// Category identity is exact, case-sensitive text. Near-spellings are distinct
/// rather than silently trimmed or case-folded; exact duplicates conflict.
#[test]
fn category_names_are_exact_case_and_whitespace_sensitive() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(file.path()).unwrap();
    for name in ["Release", "release", " Release "] {
        let created = core
            .categories()
            .create(NewCategory {
                name: name.into(),
                color: "#123456".into(),
                icon: "box".into(),
            })
            .unwrap();
        assert_eq!(created.name, name);
    }
    assert!(matches!(
        core.categories().create(NewCategory {
            name: "Release".into(),
            color: "#123456".into(),
            icon: "box".into()
        }),
        Err(kessai_core::error::KessaiCoreError::Conflict(_))
    ));
}

#[test]
fn restore_tolerates_unknown_keys_and_missing_optional_collections_but_rejects_untrusted_records() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(file.path()).unwrap();
    let sub = core.subscriptions().create(new_subscription()).unwrap();
    let tag = core
        .tags()
        .create(NewTag {
            name: "QA".into(),
            color: None,
        })
        .unwrap();
    core.tags().add_to_subscription(&sub.id, &tag.id).unwrap();
    core.payments()
        .mark_as_paid(&sub.id, "2026-02-15", 12.0)
        .unwrap();
    let backup = core.data_management().export_data().unwrap();
    let mut compatible = serde_json::to_value(&backup).unwrap();
    compatible["futureMetadata"] = serde_json::json!({"ignored": true});
    compatible["subscriptions"][0]["futureField"] = serde_json::json!(42);
    for field in [
        "payment_cards",
        "price_history",
        "tags",
        "subscription_tags",
    ] {
        compatible.as_object_mut().unwrap().remove(field);
    }
    core.data_management()
        .import_data(serde_json::from_value(compatible).unwrap(), false)
        .unwrap();
    for (field, value, expected) in [
        ("version", serde_json::json!("1.3.0"), "version"),
        ("exportedAt", serde_json::json!("garbage"), "exportedAt"),
        (
            "payments",
            serde_json::json!([{
                "id": "orphan", "subscription_id": "missing", "amount": 12,
                "paid_at": "2026-02-15T00:00:00Z", "due_date": "2026-02-15", "status": "paid"
            }]),
            "payments[0].subscription_id",
        ),
        (
            "subscription_tags",
            serde_json::json!([
                {"subscription_id": sub.id, "tag_id": tag.id},
                {"subscription_id": sub.id, "tag_id": tag.id}
            ]),
            "subscription_tags[1].tag_id",
        ),
    ] {
        let mut invalid = serde_json::to_value(&backup).unwrap();
        invalid[field] = value;
        let error = core
            .data_management()
            .import_data(serde_json::from_value(invalid).unwrap(), true)
            .unwrap_err();
        assert!(matches!(
            error,
            kessai_core::error::KessaiCoreError::Validation(_)
        ));
        assert!(error.to_string().contains(expected), "{error}");
        assert_eq!(core.subscriptions().get(&sub.id).unwrap().amount, 12.0);
    }
    let mut invalid = backup;
    invalid.settings.notification_days_before = vec![-1];
    assert!(core
        .data_management()
        .import_data(invalid, true)
        .unwrap_err()
        .to_string()
        .contains("notification_days_before[0]"));
}

#[test]
fn ten_thousand_subscriptions_restore_and_repeat_merge_in_under_five_seconds() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(file.path()).unwrap();
    let sub = core.subscriptions().create(new_subscription()).unwrap();
    let mut backup = core.data_management().export_data().unwrap();
    backup.subscriptions = (0..10_000)
        .map(|index| Subscription {
            id: format!("bulk-{index:05}"),
            ..sub.clone()
        })
        .collect();
    for replace in [true, false, false] {
        let started = std::time::Instant::now();
        core.data_management()
            .import_data(backup.clone(), replace)
            .unwrap();
        let elapsed = started.elapsed();
        eprintln!("10k import replace={replace}: {elapsed:?}");
        assert!(elapsed < std::time::Duration::from_secs(5), "{elapsed:?}");
        assert_eq!(core.subscriptions().list().unwrap().len(), 10_000);
    }
}

#[test]
fn independent_instances_serialize_overlapping_updates_and_deletes() {
    use std::sync::Barrier;
    let file = tempfile::NamedTempFile::new().unwrap();
    let first = KessaiCore::new(file.path()).unwrap();
    let second = KessaiCore::new(file.path()).unwrap();
    let barrier = Barrier::new(2);
    let sub = first.subscriptions().create(new_subscription()).unwrap();
    std::thread::scope(|scope| {
        let one = scope.spawn(|| {
            barrier.wait();
            let created = first.subscriptions().create(new_subscription()).unwrap();
            first
                .subscriptions()
                .update(
                    &sub.id,
                    UpdateSubscription {
                        name: Some("Concurrent".into()),
                        ..Default::default()
                    },
                )
                .unwrap();
            first.subscriptions().delete(&created.id).unwrap();
        });
        let two = scope.spawn(|| {
            barrier.wait();
            let created = second.subscriptions().create(new_subscription()).unwrap();
            second
                .subscriptions()
                .update(
                    &sub.id,
                    UpdateSubscription {
                        amount: Some(99.0),
                        ..Default::default()
                    },
                )
                .unwrap();
            second.subscriptions().delete(&created.id).unwrap();
        });
        one.join().unwrap();
        two.join().unwrap();
    });
    let updated = first.subscriptions().get(&sub.id).unwrap();
    assert_eq!(
        (updated.name.as_str(), updated.amount),
        ("Concurrent", 99.0)
    );
    assert_eq!(
        first
            .price_history()
            .list_by_subscription(&sub.id)
            .unwrap()
            .len(),
        1
    );
    let results = std::thread::scope(|scope| {
        let one = scope.spawn(|| {
            barrier.wait();
            first.subscriptions().delete(&sub.id)
        });
        let two = scope.spawn(|| {
            barrier.wait();
            second.subscriptions().delete(&sub.id)
        });
        [one.join().unwrap(), two.join().unwrap()]
    });
    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    assert_eq!(
        results
            .iter()
            .filter(|result| matches!(
                result,
                Err(kessai_core::error::KessaiCoreError::NotFound(_))
            ))
            .count(),
        1
    );
    assert!(first.subscriptions().list().unwrap().is_empty());
}

#[test]
fn v0_6_2_database_migrates_with_a_live_reader_and_preserves_legacy_data() {
    let file = tempfile::NamedTempFile::new().unwrap();
    let legacy = Connection::open(file.path()).unwrap();
    legacy
        .execute_batch(include_str!("fixtures/v0_6_2.sql"))
        .unwrap();
    legacy
        .execute_batch("PRAGMA journal_mode=WAL; BEGIN; SELECT name FROM subscriptions;")
        .unwrap();
    // The legacy reader keeps its snapshot open while another instance repairs
    // the missing index and applies migrations 17/18 in WAL mode.
    let core = std::thread::scope(|scope| {
        scope
            .spawn(|| KessaiCore::new(file.path()).unwrap())
            .join()
            .unwrap()
    });
    let sub = core.subscriptions().get("legacy-sub").unwrap();
    assert_eq!(sub.name, "Legacy subscription");
    assert_eq!(sub.notes.as_deref(), Some("Preserve me"));
    assert!(sub.is_pinned);
    assert_eq!(
        core.categories().get("cat-streaming").unwrap().name,
        "My legacy streaming"
    );
    assert_eq!(core.settings().get().unwrap().monthly_budget, Some(250.0));
    assert_eq!(core.tags().list().unwrap()[0].name, "Legacy tag");
    assert_eq!(core.payments().list().unwrap().len(), 2);
    assert_eq!(
        core.payments()
            .mark_as_paid("legacy-sub", "2026-01-15", 12.0)
            .unwrap()
            .id,
        "legacy-a"
    );
    assert!(matches!(
        core.categories().create(NewCategory {
            name: "My legacy streaming".into(),
            color: "#123456".into(),
            icon: "box".into()
        }),
        Err(kessai_core::error::KessaiCoreError::Conflict(_))
    ));
    legacy.execute_batch("ROLLBACK").unwrap();
    drop(core);
    let reopened = KessaiCore::new(file.path()).unwrap();
    let backup = reopened.data_management().export_data().unwrap();
    assert_eq!(backup.subscription_tags.len(), 1);
    assert_eq!(backup.payments.len(), 2);
    DataManagementService::validate_backup(&backup).unwrap();
}

#[test]
fn a_directory_database_path_returns_a_typed_open_error_without_panicking() {
    let directory = tempfile::tempdir().unwrap();
    let error = match KessaiCore::new(directory.path()) {
        Ok(_) => panic!("a directory cannot be opened as a database"),
        Err(error) => error,
    };
    assert!(matches!(
        error,
        kessai_core::error::KessaiCoreError::Pool(_)
            | kessai_core::error::KessaiCoreError::Database(_)
    ));
}

#[cfg(unix)]
#[test]
fn read_only_database_directory_returns_a_typed_error() {
    use std::os::unix::fs::PermissionsExt;
    let directory = tempfile::tempdir().unwrap();
    std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o555)).unwrap();
    let result = KessaiCore::new(&directory.path().join("blocked.db"));
    std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o755)).unwrap();
    assert!(matches!(
        result,
        Err(kessai_core::error::KessaiCoreError::Pool(_))
            | Err(kessai_core::error::KessaiCoreError::Database(_))
    ));
}

#[test]
fn corrupt_date_and_currency_require_repair_before_other_edits() {
    for (assignment, field, patch) in [
        (
            "next_payment_date = 'garbage'",
            "next_payment_date",
            serde_json::json!({"next_payment_date": "2026-04-15"}),
        ),
        (
            "currency = 'us'",
            "currency",
            serde_json::json!({"currency": "USD"}),
        ),
    ] {
        let file = tempfile::NamedTempFile::new().unwrap();
        let core = KessaiCore::new(file.path()).unwrap();
        let sub = core.subscriptions().create(new_subscription()).unwrap();
        Connection::open(file.path())
            .unwrap()
            .execute(
                &format!("UPDATE subscriptions SET {assignment} WHERE id = ?1"),
                [&sub.id],
            )
            .unwrap();
        assert!(core.subscriptions().get(&sub.id).is_ok());
        let error = core
            .subscriptions()
            .update(
                &sub.id,
                UpdateSubscription {
                    name: Some("Not a repair".into()),
                    ..Default::default()
                },
            )
            .unwrap_err();
        assert!(error.to_string().contains(field), "{error}");
        core.subscriptions()
            .update(&sub.id, serde_json::from_value(patch).unwrap())
            .unwrap();
        let backup = core.data_management().export_data().unwrap();
        DataManagementService::validate_backup(&backup).unwrap();
        assert!(backup.price_history.is_empty());
    }
}
