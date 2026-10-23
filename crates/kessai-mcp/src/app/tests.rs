use super::*;
use serde_json::{json, Value};

fn fixture() -> (tempfile::TempDir, Application) {
    let dir = tempfile::tempdir().unwrap();
    let app = Application::new(KessaiCore::new(&dir.path().join("test.db")).unwrap());
    (dir, app)
}
fn input(name: &str) -> CreateSubscriptionInput {
    CreateSubscriptionInput {
        name: name.into(),
        amount: 10.0,
        currency: None,
        billing_cycle: BillingCycle::Monthly,
        billing_day: None,
        category_id: None,
        card_id: None,
        color: None,
        notes: None,
        next_payment_date: Some("2026-01-15".into()),
        status: None,
        trial_end_date: None,
        shared_count: None,
        is_pinned: None,
        tag_ids: Vec::new(),
    }
}
fn validation(error: AppError, field: &str) {
    assert_eq!(error.code(), "validation_error");
    assert_eq!(error.field.as_deref(), Some(field));
    assert!(error.hint.as_deref().is_some_and(|hint| !hint.is_empty()));
    assert_eq!(error.json()["error"]["side_effects"], "none");
}
#[test]
fn cursor_round_trip_and_filter_hash_rejection() {
    let filters = json!({"query":"video", "sort":"name"});
    let token = Cursor::new(125, &filters).unwrap().encode();
    assert!(!token.contains(':'));
    assert_eq!(Cursor::decode(&token, &filters).unwrap().offset(), 125);
    validation(
        Cursor::decode(&token, &json!({"query":"music"})).unwrap_err(),
        "cursor",
    );
    for token in ["", "not base64", "MTox", "!!!!"] {
        validation(Cursor::decode(token, &filters).unwrap_err(), "cursor");
    }
}
#[test]
fn page_sizes_default_clamp_and_reject_zero() {
    assert_eq!(clamp_limit(None, ListKind::Standard).unwrap(), 50);
    assert_eq!(clamp_limit(None, ListKind::Reference).unwrap(), 100);
    assert_eq!(clamp_limit(None, ListKind::Calendar).unwrap(), 200);
    assert_eq!(clamp_limit(Some(5000), ListKind::Standard).unwrap(), 200);
    assert_eq!(clamp_limit(Some(5000), ListKind::Calendar).unwrap(), 500);
    validation(
        clamp_limit(Some(0), ListKind::Standard).unwrap_err(),
        "limit",
    );
}
#[test]
fn subscription_paging_has_totals_tag_ids_and_stable_ties() {
    let (_dir, app) = fixture();
    let tag = app.create_tag("video".into(), None).unwrap();
    let mut expected = Vec::new();
    for _ in 0..5 {
        let mut row = input("Same");
        row.tag_ids = vec![tag.id.clone()];
        expected.push(app.create_subscription(row).unwrap().id);
    }
    expected.sort();
    let mut filter = SubscriptionFilter {
        limit: Some(2),
        tag_id: Some(tag.id),
        ..Default::default()
    };
    let mut actual = Vec::new();
    loop {
        let result = app.list_subscriptions(filter.clone()).unwrap();
        assert_eq!(result.total, 5);
        assert!(result.items.iter().all(|row| row.tag_ids.len() == 1));
        actual.extend(result.items.into_iter().map(|row| row.id));
        filter.cursor = result.next_cursor;
        if filter.cursor.is_none() {
            break;
        }
    }
    assert_eq!(actual, expected);
    let page = app
        .list_subscriptions(SubscriptionFilter {
            limit: Some(1),
            ..Default::default()
        })
        .unwrap();
    validation(
        app.list_subscriptions(SubscriptionFilter {
            cursor: page.next_cursor,
            query: Some("different".into()),
            ..Default::default()
        })
        .unwrap_err(),
        "cursor",
    );
}
#[test]
fn review_and_trial_filters_match_existing_core_helpers() {
    let (_dir, app) = fixture();
    let old = app.create_subscription(input("Old review")).unwrap();
    let recent = app.create_subscription(input("Recently reviewed")).unwrap();
    app.update_subscription(
        &recent.id,
        UpdateSubscriptionInput {
            mark_reviewed: Some(true),
            ..Default::default()
        },
    )
    .unwrap();
    let mut trial = input("Trial");
    trial.status = Some(SubscriptionStatus::Trial);
    trial.trial_end_date = Some((Utc::now().date_naive() + chrono::Duration::days(3)).to_string());
    app.create_subscription(trial).unwrap();
    app.update_subscription(
        &old.id,
        UpdateSubscriptionInput {
            status: Some(SubscriptionStatus::Paused),
            ..Default::default()
        },
    )
    .unwrap();
    let old_ids: HashSet<_> = app
        .core
        .subscriptions()
        .list_needing_review(90)
        .unwrap()
        .into_iter()
        .map(|row| row.id)
        .collect();
    let new_ids: HashSet<_> = app
        .list_subscriptions(SubscriptionFilter {
            review_overdue_days: Some(90),
            ..Default::default()
        })
        .unwrap()
        .items
        .into_iter()
        .map(|row| row.id)
        .collect();
    assert_eq!(new_ids, old_ids);
    let all = app.core.subscriptions().list().unwrap();
    let old_ids: HashSet<_> = kessai_core::utils::get_expiring_trials(&all, 7)
        .into_iter()
        .map(|row| row.id.clone())
        .collect();
    let new_ids: HashSet<_> = app
        .list_subscriptions(SubscriptionFilter {
            trial_ending_within_days: Some(7),
            ..Default::default()
        })
        .unwrap()
        .items
        .into_iter()
        .map(|row| row.id)
        .collect();
    assert_eq!(new_ids, old_ids);
    assert_eq!(new_ids.len(), 1);
}
#[test]
fn recording_defaults_advances_once_and_explicit_due_date_replays() {
    let (_dir, app) = fixture();
    let subscription = app.create_subscription(input("Paid subscription")).unwrap();
    let outcome = app
        .record_outcome(&subscription.id, PaymentStatus::Paid, None, None)
        .unwrap();
    assert_eq!(outcome.payment.amount, 10.0);
    assert_eq!(outcome.payment.due_date, "2026-01-15");
    assert_eq!(outcome.payment.currency, "USD");
    assert!(!outcome.replayed);
    assert!(outcome.schedule_advanced);
    assert_eq!(
        outcome.subscription.next_payment_date.as_deref(),
        Some("2026-02-15")
    );
    let replay = app
        .record_outcome(
            &subscription.id,
            PaymentStatus::Paid,
            Some("2026-01-15".into()),
            None,
        )
        .unwrap();
    assert_eq!(replay.payment.id, outcome.payment.id);
    assert!(replay.replayed);
    assert!(!replay.schedule_advanced);
    for (status, amount) in [(PaymentStatus::Paid, 12.0), (PaymentStatus::Skipped, 10.0)] {
        let error = app
            .record_outcome(
                &subscription.id,
                status,
                Some("2026-01-15".into()),
                Some(amount),
            )
            .unwrap_err();
        assert_eq!(error.code(), "conflict");
        assert_eq!(error.json()["error"]["side_effects"], "none");
    }
    validation(
        app.record_outcome(&subscription.id, PaymentStatus::Pending, None, None)
            .unwrap_err(),
        "status",
    );
    let mut unknown = input("Unknown schedule");
    unknown.next_payment_date = None;
    let unknown = app.create_subscription(unknown).unwrap();
    validation(
        app.record_outcome(&unknown.id, PaymentStatus::Paid, None, None)
            .unwrap_err(),
        "due_date",
    );
}
#[test]
fn lifecycle_tag_patches_are_desired_state_and_preflight_is_side_effect_free() {
    let (_dir, app) = fixture();
    let tag = app.create_tag("video".into(), None).unwrap();
    let sub = app.create_subscription(input("Lifecycle")).unwrap();
    let update = UpdateSubscriptionInput {
        status: Some(SubscriptionStatus::Cancelled),
        cancellation_reason: Some("Unused".into()),
        mark_reviewed: Some(true),
        add_tag_ids: vec![tag.id.clone()],
        ..Default::default()
    };
    for _ in 0..2 {
        let detail = app.update_subscription(&sub.id, update.clone()).unwrap();
        assert_eq!(detail.status, SubscriptionStatus::Cancelled);
        assert!(!detail.is_active);
        assert_eq!(detail.cancellation_reason.as_deref(), Some("Unused"));
        assert!(detail.cancelled_at.is_some());
        assert!(detail.last_reviewed_at.is_some());
        assert_eq!(detail.tags.len(), 1);
    }
    for _ in 0..2 {
        assert!(app
            .update_subscription(
                &sub.id,
                UpdateSubscriptionInput {
                    remove_tag_ids: vec![tag.id.clone()],
                    ..Default::default()
                }
            )
            .unwrap()
            .tags
            .is_empty());
    }
    validation(
        app.update_subscription(
            &sub.id,
            UpdateSubscriptionInput {
                status: Some(SubscriptionStatus::Active),
                notes: Some("new".into()),
                clear_fields: vec![ClearField::Notes],
                ..Default::default()
            },
        )
        .unwrap_err(),
        "notes",
    );
    assert_eq!(
        app.get_subscription(&sub.id).unwrap().status,
        SubscriptionStatus::Cancelled
    );
    validation(
        app.update_subscription(
            &sub.id,
            UpdateSubscriptionInput {
                cancellation_reason: Some("bad combination".into()),
                ..Default::default()
            },
        )
        .unwrap_err(),
        "cancellation_reason",
    );
    validation(
        app.update_subscription(
            &sub.id,
            UpdateSubscriptionInput {
                add_tag_ids: vec![tag.id.clone()],
                remove_tag_ids: vec![tag.id],
                ..Default::default()
            },
        )
        .unwrap_err(),
        "add_tag_ids",
    );
}
#[test]
fn null_is_omission_and_only_clear_fields_clear() {
    let (_dir, app) = fixture();
    let mut row = input("Nullable");
    row.notes = Some("keep".into());
    let sub = app.create_subscription(row).unwrap();
    let patch: UpdateSubscriptionInput =
        serde_json::from_value(json!({"notes":null,"is_pinned":true})).unwrap();
    assert_eq!(
        app.update_subscription(&sub.id, patch)
            .unwrap()
            .notes
            .as_deref(),
        Some("keep")
    );
    let detail = app
        .update_subscription(
            &sub.id,
            UpdateSubscriptionInput {
                clear_fields: vec![ClearField::Notes],
                ..Default::default()
            },
        )
        .unwrap();
    let json = serde_json::to_value(detail).unwrap();
    for field in [
        "notes",
        "trial_end_date",
        "cancellation_reason",
        "cancelled_at",
        "last_reviewed_at",
        "category",
        "card",
    ] {
        assert!(json.get(field).unwrap().is_null(), "{field}");
    }
}
#[test]
fn create_uses_settings_currency_and_detail_joins_reference_names() {
    let (_dir, app) = fixture();
    app.settings_update(UpdateSettingsInput {
        currency: Some("EUR".into()),
        ..Default::default()
    })
    .unwrap();
    let tag = app.create_tag("video".into(), None).unwrap();
    let card = app
        .create_card(CreateCardInput {
            name: "Visa".into(),
            card_type: CardType::Credit,
            last_four: Some("1234".into()),
            color: None,
            credit_limit: None,
        })
        .unwrap();
    let mut row = input("Joined");
    row.category_id = Some("cat-streaming".into());
    row.card_id = Some(card.id);
    row.tag_ids = vec![tag.id];
    let detail = app.create_subscription(row).unwrap();
    assert_eq!(detail.currency, "EUR");
    assert_eq!(detail.category.unwrap().name, "Streaming");
    assert_eq!(detail.card.unwrap().last_four.as_deref(), Some("1234"));
    assert_eq!(detail.tags[0].name, "video");
    assert_eq!(
        app.list_tags(None, None).unwrap().items[0].subscription_count,
        1
    );
    assert_eq!(
        app.list_cards(None, None).unwrap().items[0].subscription_count,
        1
    );
}
#[test]
fn payment_crud_filters_clear_notes_and_never_moves_schedule() {
    let (_dir, app) = fixture();
    let sub = app.create_subscription(input("Ledger")).unwrap();
    let row = app
        .create_payment(CreatePaymentInput {
            subscription_id: sub.id.clone(),
            amount: 8.0,
            due_date: "2026-01-15".into(),
            status: PaymentStatus::Pending,
            paid_at: None,
            notes: Some("pending".into()),
        })
        .unwrap();
    assert!(chrono::DateTime::parse_from_rfc3339(&row.paid_at).is_ok());
    assert_eq!(
        app.get_subscription(&sub.id).unwrap().next_payment_date,
        sub.next_payment_date
    );
    let page = app
        .list_payments(PaymentFilter {
            month: Some("2026-01".into()),
            status: vec![PaymentStatus::Pending],
            due_from: Some("2026-01-15".into()),
            due_to: Some("2026-01-15".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].subscription_name, "Ledger");
    assert_eq!(page.items[0].currency, "USD");
    let row = app
        .update_payment(
            &row.id,
            UpdatePaymentInput {
                amount: Some(9.0),
                status: Some(PaymentStatus::Paid),
                clear_fields: vec![PaymentClearField::Notes],
                ..Default::default()
            },
        )
        .unwrap();
    assert!(row.notes.is_none());
    assert_eq!(row.amount, 9.0);
    assert_eq!(
        app.get_subscription(&sub.id).unwrap().next_payment_date,
        sub.next_payment_date
    );
    app.delete_payment(&row.id, true, false).unwrap();
    assert_eq!(
        app.list_payments(PaymentFilter::default()).unwrap().total,
        0
    );
    assert_eq!(
        app.get_subscription(&sub.id).unwrap().next_payment_date,
        sub.next_payment_date
    );
}
#[test]
fn deletion_preview_is_bounded_and_outcome_reports_cascade_counts() {
    let (_dir, app) = fixture();
    let tag = app.create_tag("tag".into(), None).unwrap();
    let mut row = input("Delete me");
    row.tag_ids = vec![tag.id];
    let sub = app.create_subscription(row).unwrap();
    for _ in 0..23 {
        app.create_payment(CreatePaymentInput {
            subscription_id: sub.id.clone(),
            amount: 1.0,
            due_date: "2026-01-01".into(),
            status: PaymentStatus::Pending,
            paid_at: None,
            notes: None,
        })
        .unwrap();
    }
    app.update_subscription(
        &sub.id,
        UpdateSubscriptionInput {
            amount: Some(12.0),
            ..Default::default()
        },
    )
    .unwrap();
    let error = app.delete_subscription(&sub.id, false, false).unwrap_err();
    assert_eq!(error.code(), "confirmation_required");
    assert_eq!(
        error.hint.as_deref(),
        Some("Call again with dry_run=true to preview, then confirm=true after the user approves.")
    );
    let preview =
        serde_json::to_value(app.delete_subscription(&sub.id, false, true).unwrap()).unwrap();
    assert_eq!(preview["dry_run"], true);
    assert_eq!(preview["requires_confirmation"], true);
    assert_eq!(preview["target"]["id"], sub.id);
    assert_eq!(preview["cascade"]["payments"]["count"], 23);
    assert_eq!(
        preview["cascade"]["payments"]["ids"]
            .as_array()
            .unwrap()
            .len(),
        20
    );
    assert_eq!(preview["cascade"]["price_history"]["count"], 1);
    assert_eq!(preview["cascade"]["tag_links"]["count"], 1);
    assert_eq!(
        app.list_subscriptions(SubscriptionFilter::default())
            .unwrap()
            .total,
        1
    );
    let outcome =
        serde_json::to_value(app.delete_subscription(&sub.id, true, false).unwrap()).unwrap();
    assert_eq!(outcome["deleted"], true);
    assert_eq!(outcome["cascade"]["payments"]["count"], 23);
    assert!(outcome["cascade"]["payments"].get("ids").is_none());
    assert_eq!(
        app.list_payments(PaymentFilter::default()).unwrap().total,
        0
    );
}
#[test]
fn reference_deletes_detach_without_deleting_subscriptions() {
    let (_dir, app) = fixture();
    let category = app
        .create_category("Custom".into(), "#123456".into(), "box".into())
        .unwrap();
    let tag = app.create_tag("tag".into(), None).unwrap();
    let card = app
        .create_card(CreateCardInput {
            name: "Card".into(),
            card_type: CardType::Debit,
            last_four: None,
            color: None,
            credit_limit: None,
        })
        .unwrap();
    let mut row = input("Keep me");
    row.category_id = Some(category.id.clone());
    row.card_id = Some(card.id.clone());
    row.tag_ids = vec![tag.id.clone()];
    let sub = app.create_subscription(row).unwrap();
    assert_eq!(
        app.delete_category("cat-other", true, false)
            .unwrap_err()
            .code(),
        "conflict"
    );
    for (id, kind) in [
        (&category.id, "category"),
        (&card.id, "card"),
        (&tag.id, "tag"),
    ] {
        let result = match kind {
            "category" => app.delete_category(id, false, true),
            "card" => app.delete_card(id, false, true),
            _ => app.delete_tag(id, false, true),
        }
        .unwrap();
        assert!(matches!(result, DeleteResult::Preview(_)));
        match kind {
            "category" => app.delete_category(id, true, false),
            "card" => app.delete_card(id, true, false),
            _ => app.delete_tag(id, true, false),
        }
        .unwrap();
    }
    let sub = app.get_subscription(&sub.id).unwrap();
    assert!(sub.category.is_none() && sub.card.is_none() && sub.tags.is_empty());
}
#[test]
fn calendar_totals_are_full_month_per_currency_even_when_paged() {
    let (_dir, app) = fixture();
    let usd = app.create_subscription(input("USD")).unwrap();
    let mut eur = input("EUR");
    eur.currency = Some("EUR".into());
    eur.amount = 20.0;
    app.create_subscription(eur).unwrap();
    app.record_outcome(&usd.id, PaymentStatus::Paid, None, Some(8.0))
        .unwrap();
    let result = app
        .calendar_month("2026-01".parse().unwrap(), Some(1), None)
        .unwrap();
    assert_eq!(result.total, 2);
    assert_eq!(result.items.len(), 1);
    assert!(result.next_cursor.is_some());
    assert_eq!(result.totals_by_currency["USD"].projected, 10.0);
    assert_eq!(result.totals_by_currency["USD"].paid, 8.0);
    assert_eq!(result.totals_by_currency["USD"].pending, 0.0);
    assert_eq!(result.totals_by_currency["EUR"].pending, 20.0);
    let result = app
        .calendar_month("2026-01".parse().unwrap(), Some(1), result.next_cursor)
        .unwrap();
    assert!(result.next_cursor.is_none());
    assert_eq!(result.totals_by_currency["EUR"].projected, 20.0);
}
#[test]
fn backup_preview_confirmation_matrix_and_atomic_export() {
    let (source_dir, source) = fixture();
    source.create_subscription(input("Backup")).unwrap();
    let path = source_dir.path().join("backup.json");
    let exported = source.export_backup_to(&path, false).unwrap();
    assert_eq!(exported.version, "1.2.0");
    assert_eq!(exported.counts.subscriptions, 1);
    assert_eq!(exported.bytes, std::fs::metadata(&path).unwrap().len());
    let original = std::fs::read(&path).unwrap();
    assert_eq!(
        source.export_backup_to(&path, false).unwrap_err().code(),
        "conflict"
    );
    assert_eq!(std::fs::read(&path).unwrap(), original);
    source.export_backup_to(&path, true).unwrap();
    let (_target_dir, target) = fixture();
    for mode in [ImportMode::Merge, ImportMode::Replace] {
        let preview = target.import_backup_from(&path, mode, false, true).unwrap();
        let ImportResult::Preview(preview) = preview else {
            panic!("expected preview")
        };
        assert_eq!(preview.incoming.subscriptions, 1);
        assert_eq!(preview.collisions.categories, 0);
        assert_eq!(preview.requires_confirmation, mode == ImportMode::Replace);
        assert_eq!(
            target
                .list_subscriptions(SubscriptionFilter::default())
                .unwrap()
                .total,
            0
        );
    }
    assert_eq!(
        target
            .import_backup_from(&path, ImportMode::Replace, false, false)
            .unwrap_err()
            .code(),
        "confirmation_required"
    );
    assert!(matches!(
        target
            .import_backup_from(&path, ImportMode::Merge, false, false)
            .unwrap(),
        ImportResult::Imported(_)
    ));
    let ImportResult::Preview(preview) = target
        .import_backup_from(&path, ImportMode::Merge, false, true)
        .unwrap()
    else {
        panic!("expected preview")
    };
    assert!(preview.requires_confirmation);
    assert_eq!(preview.collisions.subscriptions, 1);
    assert_eq!(
        target
            .import_backup_from(&path, ImportMode::Merge, false, false)
            .unwrap_err()
            .code(),
        "confirmation_required"
    );
    assert!(matches!(
        target
            .import_backup_from(&path, ImportMode::Merge, true, false)
            .unwrap(),
        ImportResult::Imported(_)
    ));
    assert!(matches!(
        target
            .import_backup_from(&path, ImportMode::Replace, true, false)
            .unwrap(),
        ImportResult::Imported(_)
    ));
    assert_eq!(
        target
            .list_subscriptions(SubscriptionFilter::default())
            .unwrap()
            .total,
        1
    );
    std::fs::write(&path, "not json").unwrap();
    validation(
        target
            .import_backup_from(&path, ImportMode::Replace, true, false)
            .unwrap_err(),
        "path",
    );
    assert_eq!(
        target
            .list_subscriptions(SubscriptionFilter::default())
            .unwrap()
            .total,
        1
    );
}
#[test]
fn settings_clear_and_analytics_currency_contract() {
    let (_dir, app) = fixture();
    app.create_subscription(input("USD")).unwrap();
    let mut eur = input("EUR");
    eur.currency = Some("EUR".into());
    app.create_subscription(eur).unwrap();
    let dashboard = app.analytics_dashboard().unwrap();
    assert_eq!(dashboard.display_currency, "USD");
    assert_eq!(dashboard.total_monthly, 10.0);
    assert_eq!(dashboard.excluded_currencies["EUR"], 1);
    assert_eq!(
        app.settings_update(UpdateSettingsInput {
            monthly_budget: Some(100.0),
            ..Default::default()
        })
        .unwrap()
        .monthly_budget,
        Some(100.0)
    );
    assert!(app
        .settings_update(UpdateSettingsInput {
            clear_fields: vec![SettingsClearField::MonthlyBudget],
            ..Default::default()
        })
        .unwrap()
        .monthly_budget
        .is_none());
    validation(
        app.settings_update(UpdateSettingsInput {
            monthly_budget: Some(20.0),
            clear_fields: vec![SettingsClearField::MonthlyBudget],
            ..Default::default()
        })
        .unwrap_err(),
        "monthly_budget",
    );
    assert_eq!(app.analytics_spending(12).unwrap().months, 12);
    assert_eq!(app.analytics_year(2026).unwrap().year, 2026);
}
#[test]
fn price_history_is_joined_filtered_and_paginated() {
    let (_dir, app) = fixture();
    let sub = app.create_subscription(input("Prices")).unwrap();
    for amount in [11.0, 12.0] {
        app.update_subscription(
            &sub.id,
            UpdateSubscriptionInput {
                amount: Some(amount),
                ..Default::default()
            },
        )
        .unwrap();
    }
    let result = app
        .price_history_list(Some(sub.id.clone()), Some(365), Some(1), None)
        .unwrap();
    assert_eq!(result.total, 2);
    assert_eq!(result.items[0].subscription_name, "Prices");
    assert_eq!(result.items[0].new_amount, 12.0);
    let next = app
        .price_history_list(Some(sub.id), Some(365), Some(1), result.next_cursor)
        .unwrap();
    assert_eq!(next.items[0].new_amount, 11.0);
    assert!(next.next_cursor.is_none());
}
#[test]
fn validation_errors_identify_fields_and_recovery_examples() {
    let (_dir, app) = fixture();
    for (field, patch) in [
        ("amount", json!({"amount":-1})),
        ("currency", json!({"currency":"usd"})),
        ("billing_day", json!({"billing_day":0})),
        ("color", json!({"color":"red"})),
        ("notes", json!({"notes":"x".repeat(501)})),
        ("name", json!({"name":""})),
        ("shared_count", json!({"shared_count":0})),
        ("next_payment_date", json!({"next_payment_date":"tomorrow"})),
        ("trial_end_date", json!({"trial_end_date":"tomorrow"})),
    ] {
        let mut row = serde_json::to_value(input("valid")).unwrap();
        row.as_object_mut()
            .unwrap()
            .extend(patch.as_object().unwrap().clone());
        validation(
            app.create_subscription(serde_json::from_value(row).unwrap())
                .unwrap_err(),
            field,
        );
    }
    validation(
        app.list_subscriptions(SubscriptionFilter {
            due_from: Some("bad".into()),
            ..Default::default()
        })
        .unwrap_err(),
        "due_from",
    );
    validation(
        app.list_subscriptions(SubscriptionFilter {
            due_from: Some("2026-02-01".into()),
            due_to: Some("2026-01-01".into()),
            ..Default::default()
        })
        .unwrap_err(),
        "due_from",
    );
    for (field, filter) in [
        (
            "upcoming_days",
            SubscriptionFilter {
                upcoming_days: Some(367),
                ..Default::default()
            },
        ),
        (
            "review_overdue_days",
            SubscriptionFilter {
                review_overdue_days: Some(0),
                ..Default::default()
            },
        ),
        (
            "trial_ending_within_days",
            SubscriptionFilter {
                trial_ending_within_days: Some(-1),
                ..Default::default()
            },
        ),
    ] {
        validation(app.list_subscriptions(filter).unwrap_err(), field);
    }
    validation(app.analytics_spending(61).unwrap_err(), "months");
    validation(app.analytics_year(9999).unwrap_err(), "year");
    validation(
        app.price_history_list(None, Some(0), None, None)
            .unwrap_err(),
        "since_days",
    );
    validation(
        app.settings_update(UpdateSettingsInput {
            notification_time: Some("25:00".into()),
            ..Default::default()
        })
        .unwrap_err(),
        "notification_time",
    );
    validation(
        app.settings_update(UpdateSettingsInput {
            notification_days_before: Some(vec![366]),
            ..Default::default()
        })
        .unwrap_err(),
        "notification_days_before",
    );
    validation(
        app.settings_update(UpdateSettingsInput::default())
            .unwrap_err(),
        "input",
    );
    validation(
        app.export_backup_to(std::path::Path::new(""), false)
            .unwrap_err(),
        "path",
    );
    for month in ["2026-1", "2026-13", "1899-01", "9999-01", "2026-01-01"] {
        validation(month.parse::<YearMonth>().unwrap_err(), "month");
    }
    let body = AppError::Internal("unexpected".into()).json();
    assert_eq!(body["error"]["side_effects"], "unknown");
}
#[test]
fn output_dtos_expose_documented_json_schemas() {
    fn documented(schema: &Value) {
        if let Some(properties) = schema.get("properties").and_then(Value::as_object) {
            for (field, property) in properties {
                assert!(
                    property.get("description").is_some(),
                    "missing documentation for {field}: {property}"
                );
            }
        }
        if let Some(definitions) = schema.get("$defs").and_then(Value::as_object) {
            for definition in definitions.values() {
                documented(definition);
            }
        }
    }
    for schema in [
        schemars::schema_for!(SubscriptionDetail),
        schemars::schema_for!(Page<SubscriptionItem>),
        schemars::schema_for!(Page<PaymentItem>),
        schemars::schema_for!(RecordOutcome),
        schemars::schema_for!(CalendarMonth),
        schemars::schema_for!(Page<RefItem>),
        schemars::schema_for!(DeleteResult),
        schemars::schema_for!(ImportResult),
        schemars::schema_for!(ExportOutcome),
        schemars::schema_for!(Settings),
        schemars::schema_for!(DashboardStats),
        schemars::schema_for!(SpendingReport),
        schemars::schema_for!(YearSummary),
        schemars::schema_for!(Page<PriceChangeItem>),
        schemars::schema_for!(ErrorBody),
    ] {
        documented(&serde_json::to_value(schema).unwrap());
    }
}
