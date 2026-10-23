use kessai_core::error::KessaiCoreError;
use kessai_core::models::*;
use kessai_core::KessaiCore;

fn new_subscription() -> NewSubscription {
    serde_json::from_str(
        r#"{"name":"Service","amount":10.0,"currency":"USD","billing_cycle":"monthly","next_payment_date":"2026-10-21"}"#,
    ).unwrap()
}

fn assert_validation<T: std::fmt::Debug>(result: kessai_core::error::Result<T>) {
    assert!(
        matches!(result, Err(KessaiCoreError::Validation(_))),
        "{result:?}"
    );
}

#[test]
fn nullable_patch_fields_preserve_missing_null_and_value_through_json() {
    macro_rules! check {
        ($model:ty, $field:ident, $value:expr) => {{
            let missing: $model = serde_json::from_str("{}").unwrap();
            assert_eq!(missing.$field, None);
            assert!(serde_json::to_value(&missing)
                .unwrap()
                .get(stringify!($field))
                .is_none());
            let null_json = format!("{{\"{}\":null}}", stringify!($field));
            let clear: $model = serde_json::from_str(&null_json).unwrap();
            assert_eq!(clear.$field, Some(None));
            let clear_again: $model =
                serde_json::from_str(&serde_json::to_string(&clear).unwrap()).unwrap();
            assert_eq!(clear_again.$field, Some(None));
            let value_json = format!("{{\"{}\":{}}}", stringify!($field), $value);
            let set: $model = serde_json::from_str(&value_json).unwrap();
            assert!(matches!(set.$field, Some(Some(_))));
            let set_again: $model =
                serde_json::from_str(&serde_json::to_string(&set).unwrap()).unwrap();
            assert_eq!(set_again.$field, set.$field);
        }};
    }
    check!(UpdateSettings, monthly_budget, "25.0");
    check!(UpdatePaymentCard, last_four, "\"1234\"");
    check!(UpdatePaymentCard, credit_limit, "50.0");
    check!(UpdatePayment, notes, "\"memo\"");
    check!(UpdateSubscription, billing_day, "15");
    check!(UpdateSubscription, category_id, "\"category\"");
    check!(UpdateSubscription, card_id, "\"card\"");
    check!(UpdateSubscription, color, "\"#abcdef\"");
    check!(UpdateSubscription, logo_url, "\"logo.png\"");
    check!(UpdateSubscription, notes, "\"memo\"");
    check!(UpdateSubscription, next_payment_date, "\"2026-10-21\"");
    check!(UpdateSubscription, trial_end_date, "\"2026-10-21\"");
    check!(UpdateSubscription, cancellation_reason, "\"unused\"");
    check!(UpdateSubscription, cancelled_at, "\"2026-10-21T12:00:00Z\"");
    check!(
        UpdateSubscription,
        last_reviewed_at,
        "\"2026-10-21T12:00:00Z\""
    );
}

#[test]
fn direct_core_subscription_writes_reject_invalid_durable_fields() {
    let tmp = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(tmp.path()).unwrap();
    for amount in [-1.0, f64::NAN, f64::INFINITY] {
        let mut data = new_subscription();
        data.amount = amount;
        assert_validation(core.subscriptions().create(data));
    }
    for date in ["2026-02-30", "2026-2-03", "not-a-date"] {
        let mut data = new_subscription();
        data.next_payment_date = Some(date.into());
        assert_validation(core.subscriptions().create(data));
    }
    let mut data = new_subscription();
    data.shared_count = 0;
    assert_validation(core.subscriptions().create(data));
    let mut data = new_subscription();
    data.color = Some("red".into());
    assert_validation(core.subscriptions().create(data));
    let mut data = new_subscription();
    data.name = " ".into();
    assert_validation(core.subscriptions().create(data));
    let sub = core.subscriptions().create(new_subscription()).unwrap();
    for json in [
        r#"{"amount":-1}"#,
        r#"{"next_payment_date":"2026-02-30"}"#,
        r#"{"trial_end_date":"2026-2-03"}"#,
        r#"{"shared_count":0}"#,
        r#"{"color":"red"}"#,
        r#"{"billing_day":32}"#,
        r#"{"currency":"usd"}"#,
        r#"{"name":" "}"#,
        r#"{"cancelled_at":"yesterday"}"#,
        r#"{"last_reviewed_at":"yesterday"}"#,
    ] {
        assert_validation(
            core.subscriptions()
                .update(&sub.id, serde_json::from_str(json).unwrap()),
        );
    }
    assert_eq!(core.subscriptions().get(&sub.id).unwrap().amount, 10.0);
    let mut free = new_subscription();
    free.amount = 0.0;
    assert_eq!(core.subscriptions().create(free).unwrap().amount, 0.0);
}

#[test]
fn direct_core_entity_and_settings_writes_validate_durable_fields() {
    let tmp = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(tmp.path()).unwrap();
    assert_validation(core.categories().create(NewCategory {
        name: " ".into(),
        color: "#123456".into(),
        icon: "box".into(),
    }));
    assert_validation(core.categories().create(NewCategory {
        name: "Custom".into(),
        color: "red".into(),
        icon: "box".into(),
    }));
    let category = core
        .categories()
        .create(NewCategory {
            name: "Custom".into(),
            color: "#123456".into(),
            icon: "box".into(),
        })
        .unwrap();
    assert_validation(core.categories().update(
        &category.id,
        UpdateCategory {
            name: Some(" ".into()),
            ..Default::default()
        },
    ));
    assert_validation(core.categories().update(
        &category.id,
        UpdateCategory {
            color: Some("red".into()),
            ..Default::default()
        },
    ));
    assert_validation(core.tags().create(NewTag {
        name: " ".into(),
        color: None,
    }));
    assert_validation(core.tags().create(NewTag {
        name: "Tag".into(),
        color: Some("red".into()),
    }));
    let tag = core
        .tags()
        .create(NewTag {
            name: "Tag".into(),
            color: None,
        })
        .unwrap();
    assert_validation(core.tags().update(
        &tag.id,
        UpdateTag {
            name: Some(" ".into()),
            ..Default::default()
        },
    ));
    assert_validation(core.tags().update(
        &tag.id,
        UpdateTag {
            color: Some("red".into()),
            ..Default::default()
        },
    ));
    for json in [
        r#"{"name":" ","card_type":"credit"}"#,
        r#"{"name":"Card","card_type":"credit","color":"red"}"#,
        r#"{"name":"Card","card_type":"credit","credit_limit":-1}"#,
        r#"{"name":"Card","card_type":"credit","last_four":"123x"}"#,
    ] {
        assert_validation(
            core.payment_cards()
                .create(serde_json::from_str(json).unwrap()),
        );
    }
    let card = core
        .payment_cards()
        .create(serde_json::from_str(r#"{"name":"Card","card_type":"credit"}"#).unwrap())
        .unwrap();
    for json in [
        r#"{"name":" "}"#,
        r#"{"color":"red"}"#,
        r#"{"credit_limit":-1}"#,
        r#"{"last_four":"123x"}"#,
    ] {
        assert_validation(
            core.payment_cards()
                .update(&card.id, serde_json::from_str(json).unwrap()),
        );
    }
    for json in [
        r#"{"monthly_budget":-1}"#,
        r#"{"currency":"usd"}"#,
        r#"{"notification_time":"24:00"}"#,
        r#"{"notification_time":"09:60"}"#,
        r#"{"notification_time":"9:00"}"#,
        r#"{"notification_advance_days":-1}"#,
        r#"{"notification_days_before":[-1]}"#,
        r#"{"display_exchange_rates":{"EUR":0}}"#,
        r#"{"display_exchange_rates":{"eur":1}}"#,
    ] {
        assert_validation(core.settings().update(serde_json::from_str(json).unwrap()));
    }
    assert_validation(core.subscriptions().update(
        "missing",
        UpdateSubscription {
            notes: Some(Some("x".repeat(501))),
            ..Default::default()
        },
    ));
}

#[test]
fn subscription_price_and_currency_history_commit_together() {
    let tmp = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(tmp.path()).unwrap();
    let sub = core.subscriptions().create(new_subscription()).unwrap();
    core.subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                currency: Some("EUR".into()),
                ..Default::default()
            },
        )
        .unwrap();
    let history = core.price_history().list_by_subscription(&sub.id).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].old_currency, "USD");
    assert_eq!(history[0].new_currency, "EUR");
    assert_eq!(history[0].old_amount, 10.0);
    assert_eq!(history[0].new_amount, 10.0);
    core.subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                amount: Some(10.0001),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(
        core.price_history()
            .list_by_subscription(&sub.id)
            .unwrap()
            .len(),
        2
    );
    core.subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                amount: Some(10.0001),
                currency: Some("EUR".into()),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(
        core.price_history()
            .list_by_subscription(&sub.id)
            .unwrap()
            .len(),
        2
    );
    let conn = rusqlite::Connection::open(tmp.path()).unwrap();
    conn.execute_batch("DROP TABLE price_history").unwrap();
    assert!(core
        .subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                amount: Some(20.0),
                name: Some("Changed".into()),
                ..Default::default()
            }
        )
        .is_err());
    let after = core.subscriptions().get(&sub.id).unwrap();
    assert_eq!(after.amount, 10.0001);
    assert_eq!(after.name, "Service");
}

#[test]
fn lifecycle_writes_keep_status_activity_trial_and_cancellation_consistent() {
    let tmp = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(tmp.path()).unwrap();
    let mut data = new_subscription();
    data.status = SubscriptionStatus::Trial;
    data.trial_end_date = Some("2026-11-01".into());
    let sub = core.subscriptions().create(data).unwrap();
    assert!(sub.is_active);
    let active = core
        .subscriptions()
        .transition_status(&sub.id, SubscriptionStatus::Active)
        .unwrap();
    assert!(active.is_active);
    assert_eq!(active.trial_end_date, None);
    core.subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                status: Some(SubscriptionStatus::Trial),
                trial_end_date: Some(Some("2026-11-02".into())),
                ..Default::default()
            },
        )
        .unwrap();
    let cleared = core
        .subscriptions()
        .update(
            &sub.id,
            serde_json::from_str(r#"{"trial_end_date":null}"#).unwrap(),
        )
        .unwrap();
    assert_eq!(cleared.status, SubscriptionStatus::Active);
    assert_eq!(cleared.trial_end_date, None);
    let cancelled = core
        .subscriptions()
        .cancel_with_reason(&sub.id, Some("Unused"))
        .unwrap();
    assert_eq!(cancelled.status, SubscriptionStatus::Cancelled);
    assert!(!cancelled.is_active);
    assert!(cancelled.cancelled_at.is_some());
    assert_eq!(cancelled.cancellation_reason.as_deref(), Some("Unused"));
    let active = core
        .subscriptions()
        .transition_status(&sub.id, SubscriptionStatus::Active)
        .unwrap();
    assert!(active.is_active);
    assert_eq!(active.cancelled_at, None);
    assert_eq!(active.cancellation_reason, None);
    let paused = core
        .subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                status: Some(SubscriptionStatus::Active),
                is_active: Some(false),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(paused.status, SubscriptionStatus::Paused);
    assert!(!paused.is_active);
    let resumed = core
        .subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                is_active: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(resumed.status, SubscriptionStatus::Active);
    assert!(resumed.is_active);
    let cancelled = core
        .subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                status: Some(SubscriptionStatus::Cancelled),
                is_active: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
    assert!(!cancelled.is_active);
    assert!(cancelled.cancelled_at.is_some());
    for status in [
        SubscriptionStatus::Trial,
        SubscriptionStatus::Active,
        SubscriptionStatus::GracePeriod,
        SubscriptionStatus::Paused,
        SubscriptionStatus::PendingCancellation,
        SubscriptionStatus::Cancelled,
    ] {
        let mut data = new_subscription();
        data.status = status.clone();
        let created = core.subscriptions().create(data).unwrap();
        assert_eq!(created.is_active, status.is_billable());
        assert_eq!(
            created.cancelled_at.is_some(),
            status == SubscriptionStatus::Cancelled
        );
    }
}

#[test]
fn failed_category_and_card_deletion_preserves_subscription_references() {
    let tmp = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(tmp.path()).unwrap();
    let category = core
        .categories()
        .create(NewCategory {
            name: "Custom".into(),
            color: "#123456".into(),
            icon: "box".into(),
        })
        .unwrap();
    let card = core
        .payment_cards()
        .create(serde_json::from_str(r#"{"name":"Card","card_type":"credit"}"#).unwrap())
        .unwrap();
    let mut data = new_subscription();
    data.category_id = Some(category.id.clone());
    data.card_id = Some(card.id.clone());
    let sub = core.subscriptions().create(data).unwrap();
    let conn = rusqlite::Connection::open(tmp.path()).unwrap();
    conn.execute_batch(
        "CREATE TRIGGER reject_category_delete BEFORE DELETE ON categories BEGIN SELECT RAISE(ABORT, 'injected failure'); END;
         CREATE TRIGGER reject_card_delete BEFORE DELETE ON payment_cards BEGIN SELECT RAISE(ABORT, 'injected failure'); END;"
    ).unwrap();
    assert!(core.categories().delete(&category.id).is_err());
    assert!(core.payment_cards().delete(&card.id).is_err());
    let after = core.subscriptions().get(&sub.id).unwrap();
    assert_eq!(after.category_id.as_deref(), Some(category.id.as_str()));
    assert_eq!(after.card_id.as_deref(), Some(card.id.as_str()));
    assert!(core.categories().get(&category.id).is_ok());
    assert!(core.payment_cards().get(&card.id).is_ok());
}

#[test]
fn eight_concurrent_writers_share_four_connections_without_nested_checkouts() {
    use std::sync::{Arc, Barrier};
    let tmp = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(tmp.path()).unwrap();
    let barrier = Arc::new(Barrier::new(8));
    let handles: Vec<_> = (0..8)
        .map(|worker| {
            let core = core.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                for iteration in 0..8 {
                    let sub = core.subscriptions().create(new_subscription())?;
                    let updated = core.subscriptions().update(
                        &sub.id,
                        UpdateSubscription {
                            name: Some(format!("Service {worker}-{iteration}")),
                            amount: Some(12.0),
                            ..Default::default()
                        },
                    )?;
                    assert_eq!(updated.amount, 12.0);
                }
                Ok::<(), KessaiCoreError>(())
            })
        })
        .collect();
    for handle in handles {
        handle.join().unwrap().unwrap();
    }
    assert_eq!(core.subscriptions().list().unwrap().len(), 64);
    assert_eq!(core.price_history().list().unwrap().len(), 64);
}

#[test]
fn paused_subscriptions_resume_active_or_their_unexpired_trial() {
    let tmp = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(tmp.path()).unwrap();
    let active = core.subscriptions().create(new_subscription()).unwrap();
    let paused = core.subscriptions().toggle_active(&active.id).unwrap();
    assert_eq!(paused.status, SubscriptionStatus::Paused);
    assert!(!paused.is_active);
    let resumed = core.subscriptions().toggle_active(&active.id).unwrap();
    assert_eq!(resumed.status, SubscriptionStatus::Active);
    assert!(resumed.is_active);

    let future = (chrono::Utc::now().date_naive() + chrono::Duration::days(5)).to_string();
    let mut data = new_subscription();
    data.status = SubscriptionStatus::Trial;
    data.trial_end_date = Some(future.clone());
    let trial = core.subscriptions().create(data).unwrap();
    let paused = core.subscriptions().toggle_active(&trial.id).unwrap();
    assert_eq!(paused.status, SubscriptionStatus::Paused);
    assert_eq!(paused.trial_end_date.as_deref(), Some(future.as_str()));
    let resumed = core.subscriptions().toggle_active(&trial.id).unwrap();
    assert_eq!(resumed.status, SubscriptionStatus::Trial);
    assert!(resumed.is_active);
    assert_eq!(resumed.trial_end_date.as_deref(), Some(future.as_str()));

    let mut data = new_subscription();
    data.status = SubscriptionStatus::Trial;
    data.trial_end_date = Some("2000-01-01".into());
    let ended_trial = core.subscriptions().create(data).unwrap();
    core.subscriptions().toggle_active(&ended_trial.id).unwrap();
    let resumed = core.subscriptions().toggle_active(&ended_trial.id).unwrap();
    assert_eq!(resumed.status, SubscriptionStatus::Active);
    assert_eq!(resumed.trial_end_date, None);
}

#[test]
fn serialized_nullable_patches_clear_persisted_budget_card_and_payment_fields() {
    let tmp = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(tmp.path()).unwrap();
    let settings = core
        .settings()
        .update(serde_json::from_str(r#"{"monthly_budget":25}"#).unwrap())
        .unwrap();
    assert_eq!(settings.monthly_budget, Some(25.0));
    assert_eq!(
        core.settings()
            .update(serde_json::from_str("{}").unwrap())
            .unwrap()
            .monthly_budget,
        Some(25.0)
    );
    assert_eq!(
        core.settings()
            .update(serde_json::from_str(r#"{"monthly_budget":null}"#).unwrap())
            .unwrap()
            .monthly_budget,
        None
    );
    let card = core
        .payment_cards()
        .create(
            serde_json::from_str(
                r#"{"name":"Card","card_type":"credit","last_four":"1234","credit_limit":50}"#,
            )
            .unwrap(),
        )
        .unwrap();
    let unchanged = core
        .payment_cards()
        .update(&card.id, serde_json::from_str("{}").unwrap())
        .unwrap();
    assert_eq!(unchanged.last_four.as_deref(), Some("1234"));
    assert_eq!(unchanged.credit_limit, Some(50.0));
    let clear = core
        .payment_cards()
        .update(
            &card.id,
            serde_json::from_str(r#"{"last_four":null,"credit_limit":null}"#).unwrap(),
        )
        .unwrap();
    assert_eq!(clear.last_four, None);
    assert_eq!(clear.credit_limit, None);
    let subscription = core.subscriptions().create(new_subscription()).unwrap();
    let payment = core
        .payments()
        .create(NewPayment {
            subscription_id: subscription.id,
            amount: 10.0,
            paid_at: "2026-10-21T12:00:00Z".into(),
            due_date: "2026-10-21".into(),
            status: PaymentStatus::Paid,
            notes: Some("Memo".into()),
        })
        .unwrap();
    assert_eq!(
        core.payments()
            .update(&payment.id, serde_json::from_str("{}").unwrap())
            .unwrap()
            .notes
            .as_deref(),
        Some("Memo")
    );
    assert_eq!(
        core.payments()
            .update(
                &payment.id,
                serde_json::from_str(r#"{"notes":null}"#).unwrap()
            )
            .unwrap()
            .notes,
        None
    );
}

#[test]
fn core_writes_enforce_character_limits_without_rejecting_valid_boundaries() {
    let tmp = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(tmp.path()).unwrap();
    let mut data = new_subscription();
    data.name = "名".repeat(100);
    data.notes = Some("語".repeat(500));
    data.shared_count = 100;
    data.billing_day = Some(31);
    data.color = Some("#ABCdef".into());
    let sub = core.subscriptions().create(data).unwrap();
    assert_eq!(sub.shared_count, 100);
    assert_validation(core.subscriptions().update(
        &sub.id,
        UpdateSubscription {
            name: Some("名".repeat(101)),
            ..Default::default()
        },
    ));
    assert_validation(core.subscriptions().update(
        &sub.id,
        UpdateSubscription {
            notes: Some(Some("語".repeat(501))),
            ..Default::default()
        },
    ));
    let mut data = new_subscription();
    data.notes = Some("x".repeat(501));
    assert_validation(core.subscriptions().create(data));
    let mut data = new_subscription();
    data.billing_day = Some(0);
    assert_validation(core.subscriptions().create(data));
    let mut data = new_subscription();
    data.currency = "usd".into();
    assert_validation(core.subscriptions().create(data));
    let settings = core.settings().update(serde_json::from_str(r#"{"monthly_budget":0,"notification_time":"23:59","notification_days_before":[0],"notification_advance_days":0}"#).unwrap()).unwrap();
    assert_eq!(settings.monthly_budget, Some(0.0));
    assert_eq!(settings.notification_time, "23:59");
}

#[test]
fn core_day_windows_reject_negative_and_overflowing_ranges() {
    let tmp = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(tmp.path()).unwrap();
    for days in [-1, 36_501, i64::MAX] {
        assert_validation(core.subscriptions().list_needing_review(days));
        assert_validation(core.price_history().list_recent(days));
    }
    assert!(core.subscriptions().list_needing_review(0).is_ok());
    assert!(core.subscriptions().list_needing_review(36_500).is_ok());
    assert!(core.price_history().list_recent(0).is_ok());
    assert!(core.price_history().list_recent(36_500).is_ok());
}
