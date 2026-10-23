use kessai_core::{
    error::KessaiCoreError,
    models::{
        BillingCycle, NewPayment, NewSubscription, PaymentStatus, Subscription, SubscriptionStatus,
        UpdatePayment, UpdateSubscription,
    },
    KessaiCore,
};

fn subscription(core: &KessaiCore, cycle: BillingCycle, anchor: &str) -> Subscription {
    core.subscriptions()
        .create(NewSubscription {
            name: "Contract subscription".into(),
            amount: 30.0,
            currency: "USD".into(),
            billing_cycle: cycle,
            billing_day: None,
            category_id: Some("cat-streaming".into()),
            card_id: None,
            color: None,
            logo_url: Some("https://example.com/logo.png".into()),
            notes: None,
            is_active: true,
            next_payment_date: Some(anchor.into()),
            status: SubscriptionStatus::Active,
            trial_end_date: None,
            shared_count: 1,
            is_pinned: false,
        })
        .unwrap()
}

#[test]
fn paid_current_date_advances_exactly_once_and_replay_returns_original_payment() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Monthly, "2024-01-31");

    let payment = core
        .payments()
        .mark_as_paid(&sub.id, "2024-01-31", 30.0)
        .unwrap();
    assert_eq!(
        core.subscriptions()
            .get(&sub.id)
            .unwrap()
            .next_payment_date
            .as_deref(),
        Some("2024-02-29")
    );
    let replay = core
        .payments()
        .mark_as_paid(&sub.id, "2024-01-31", 30.0)
        .unwrap();
    assert_eq!(replay.id, payment.id);
    assert_eq!(
        core.subscriptions()
            .get(&sub.id)
            .unwrap()
            .next_payment_date
            .as_deref(),
        Some("2024-02-29")
    );
    assert!(matches!(
        core.payments().mark_as_paid(&sub.id, "2024-01-31", 31.0),
        Err(KessaiCoreError::Conflict(_))
    ));
    assert_eq!(
        core.payments().list_by_subscription(&sub.id).unwrap().len(),
        1
    );
}

#[test]
fn legacy_paid_current_date_replay_advances_without_duplicating_the_outcome() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Monthly, "2026-01-31");
    let payment = core
        .payments()
        .create(NewPayment {
            subscription_id: sub.id.clone(),
            amount: 30.0,
            paid_at: "2026-01-31T12:00:00Z".into(),
            due_date: "2026-01-31".into(),
            status: PaymentStatus::Paid,
            notes: None,
        })
        .unwrap();

    let replay = core
        .payments()
        .mark_as_paid(&sub.id, "2026-01-31", 30.0)
        .unwrap();
    assert_eq!(replay.id, payment.id);
    let updated = core.subscriptions().get(&sub.id).unwrap();
    assert_eq!(updated.next_payment_date.as_deref(), Some("2026-02-28"));
    assert_eq!(updated.billing_day, Some(31));
    assert_eq!(
        core.payments().list_by_subscription(&sub.id).unwrap().len(),
        1
    );
}

#[test]
fn explicit_billing_day_restores_month_end_after_leap_february() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Monthly, "2024-01-31");
    core.subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                billing_day: Some(Some(31)),
                ..Default::default()
            },
        )
        .unwrap();

    core.payments()
        .mark_as_paid(&sub.id, "2024-01-31", 30.0)
        .unwrap();
    core.payments()
        .mark_as_paid(&sub.id, "2024-02-29", 30.0)
        .unwrap();
    let updated = core.subscriptions().get(&sub.id).unwrap();
    assert_eq!(updated.next_payment_date.as_deref(), Some("2024-03-31"));
    assert_eq!(updated.billing_day, Some(31));
}

#[test]
fn paid_month_end_preserves_anchor_and_matches_calendar_projection() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Monthly, "2023-01-31");
    let projected_march = core.calendar().month(2023, 3).unwrap()[0].due_date.clone();
    core.payments()
        .mark_as_paid(&sub.id, "2023-01-31", 30.0)
        .unwrap();
    let february = core.subscriptions().get(&sub.id).unwrap();
    assert_eq!(february.billing_day, Some(31));
    let advanced = kessai_core::utils::advance_one_period(
        chrono::NaiveDate::from_ymd_opt(2023, 2, 28).unwrap(),
        &february.billing_cycle,
        february.billing_day.map(|day| day as u32),
    );
    assert_eq!(advanced.to_string(), projected_march);
    assert_eq!(
        core.calendar().month(2023, 3).unwrap()[0].due_date,
        projected_march
    );
    core.payments()
        .mark_as_paid(&sub.id, "2023-02-28", 30.0)
        .unwrap();
    let updated = core.subscriptions().get(&sub.id).unwrap();
    assert_eq!(updated.next_payment_date.as_deref(), Some("2023-03-31"));
    assert_eq!(updated.billing_day, Some(31));
    assert_eq!(
        core.calendar().month(2023, 3).unwrap()[0].due_date,
        projected_march
    );
}

#[test]
fn editing_the_next_date_reanchors_a_clamped_paid_schedule() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Monthly, "2026-01-31");
    core.payments()
        .mark_as_paid(&sub.id, "2026-01-31", 30.0)
        .unwrap();
    assert_eq!(
        core.subscriptions().get(&sub.id).unwrap().billing_day,
        Some(31)
    );
    let updated = core
        .subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                next_payment_date: Some(Some("2026-04-15".into())),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(updated.billing_day, None);
    assert_eq!(
        core.calendar().month(2026, 4).unwrap()[0].due_date,
        "2026-04-15"
    );
    core.payments()
        .mark_as_paid(&sub.id, "2026-04-15", 30.0)
        .unwrap();
    assert_eq!(
        core.subscriptions()
            .get(&sub.id)
            .unwrap()
            .next_payment_date
            .as_deref(),
        Some("2026-05-15")
    );
    assert_eq!(
        core.calendar().month(2026, 4).unwrap()[0].due_date,
        "2026-04-15"
    );
}

#[test]
fn explicit_billing_day_changes_later_periods_but_never_the_anchor_occurrence() {
    for cycle in [
        BillingCycle::Monthly,
        BillingCycle::Custom,
        BillingCycle::Quarterly,
        BillingCycle::Yearly,
    ] {
        let database = tempfile::NamedTempFile::new().unwrap();
        let core = KessaiCore::new(database.path()).unwrap();
        let sub = subscription(&core, cycle.clone(), "2026-10-25");
        let updated = core
            .subscriptions()
            .update(
                &sub.id,
                UpdateSubscription {
                    next_payment_date: Some(Some("2026-10-25".into())),
                    billing_day: Some(Some(15)),
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(updated.billing_day, Some(15));
        assert_eq!(
            core.calendar().month(2026, 10).unwrap()[0].due_date,
            "2026-10-25",
            "{cycle:?}"
        );
        let (year, month, next) = match cycle {
            BillingCycle::Quarterly => (2027, 1, "2027-01-15"),
            BillingCycle::Yearly => (2027, 10, "2027-10-15"),
            _ => (2026, 11, "2026-11-15"),
        };
        assert_eq!(
            core.calendar().month(year, month).unwrap()[0].due_date,
            next
        );
        core.payments()
            .mark_as_paid(&sub.id, "2026-10-25", 30.0)
            .unwrap();
        assert_eq!(
            core.subscriptions()
                .get(&sub.id)
                .unwrap()
                .next_payment_date
                .as_deref(),
            Some(next)
        );
    }
}

#[test]
fn historical_and_future_outcomes_never_advance_the_current_due_date() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Monthly, "2026-03-31");
    core.payments()
        .skip_payment(&sub.id, "2026-01-31", 30.0)
        .unwrap();
    core.payments()
        .skip_payment(&sub.id, "2026-05-31", 30.0)
        .unwrap();
    core.payments()
        .mark_as_paid(&sub.id, "2026-02-28", 30.0)
        .unwrap();
    core.payments()
        .mark_as_paid(&sub.id, "2026-04-30", 30.0)
        .unwrap();
    assert_eq!(
        core.subscriptions()
            .get(&sub.id)
            .unwrap()
            .next_payment_date
            .as_deref(),
        Some("2026-03-31")
    );
}

#[test]
fn skipping_current_due_advances_once_and_a_later_paid_replay_conflicts() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Monthly, "2026-11-05");
    let skipped = core
        .payments()
        .skip_payment(&sub.id, "2026-11-05", 30.0)
        .unwrap();
    assert_eq!(skipped.status, PaymentStatus::Skipped);
    let replay = core
        .payments()
        .skip_payment(&sub.id, "2026-11-05", 30.0)
        .unwrap();
    assert_eq!(replay.id, skipped.id);
    assert!(matches!(
        core.payments().mark_as_paid(&sub.id, "2026-11-05", 30.0),
        Err(KessaiCoreError::Conflict(_))
    ));
    assert_eq!(
        core.subscriptions()
            .get(&sub.id)
            .unwrap()
            .next_payment_date
            .as_deref(),
        Some("2026-12-05")
    );
    assert_eq!(
        core.payments().list_by_subscription(&sub.id).unwrap().len(),
        1
    );
}

#[test]
fn paying_current_due_skips_a_paid_ahead_occurrence_and_calendar_stays_consistent() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Monthly, "2026-11-30");
    core.subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                billing_day: Some(Some(31)),
                ..Default::default()
            },
        )
        .unwrap();
    let ahead = core
        .payments()
        .mark_as_paid(&sub.id, "2026-12-31", 30.0)
        .unwrap();
    assert_eq!(
        core.subscriptions()
            .get(&sub.id)
            .unwrap()
            .next_payment_date
            .as_deref(),
        Some("2026-11-30")
    );
    core.payments()
        .mark_as_paid(&sub.id, "2026-11-30", 30.0)
        .unwrap();
    let updated = core.subscriptions().get(&sub.id).unwrap();
    assert_eq!(updated.next_payment_date.as_deref(), Some("2027-01-31"));
    assert_eq!(updated.billing_day, Some(31));
    let december = core.calendar().month(2026, 12).unwrap();
    assert_eq!(december.len(), 1);
    assert_eq!(december[0].due_date, "2026-12-31");
    assert_eq!(december[0].payment.as_ref().unwrap().id, ahead.id);
    assert_eq!(
        december[0].payment.as_ref().unwrap().status,
        PaymentStatus::Paid
    );
    let january = core.calendar().month(2027, 1).unwrap();
    assert_eq!(january.len(), 1);
    assert_eq!(january[0].due_date, "2027-01-31");
    assert!(january[0].payment.is_none());
}

#[test]
fn advancement_keeps_the_anchor_across_settled_clamps_and_persists_only_a_final_clamp() {
    for (settled, expected, billing_day) in [
        (vec!["2026-02-28"], "2026-03-31", None),
        (vec!["2026-02-28", "2026-03-31"], "2026-04-30", Some(31)),
    ] {
        let database = tempfile::NamedTempFile::new().unwrap();
        let core = KessaiCore::new(database.path()).unwrap();
        let sub = subscription(&core, BillingCycle::Monthly, "2026-01-31");
        for date in settled {
            core.payments().skip_payment(&sub.id, date, 30.0).unwrap();
        }
        core.payments()
            .mark_as_paid(&sub.id, "2026-01-31", 30.0)
            .unwrap();
        let updated = core.subscriptions().get(&sub.id).unwrap();
        assert_eq!(updated.next_payment_date.as_deref(), Some(expected));
        assert_eq!(updated.billing_day, billing_day);
        assert_eq!(
            core.calendar().month(2026, 5).unwrap()[0].due_date,
            "2026-05-31"
        );
    }
}

#[test]
fn failed_pending_and_unknown_outcomes_never_advance_or_count_as_settled() {
    for raw_status in ["failed", "pending", "unknown"] {
        let database = tempfile::NamedTempFile::new().unwrap();
        let core = KessaiCore::new(database.path()).unwrap();
        let sub = subscription(&core, BillingCycle::Monthly, "2026-11-05");
        let conn = rusqlite::Connection::open(database.path()).unwrap();
        let mut current = None;
        for date in ["2026-11-05", "2026-12-05"] {
            let payment = core
                .payments()
                .create(NewPayment {
                    subscription_id: sub.id.clone(),
                    amount: 30.0,
                    paid_at: "2026-11-05T12:00:00Z".into(),
                    due_date: date.into(),
                    status: PaymentStatus::Paid,
                    notes: None,
                })
                .unwrap();
            // Raw pending/unknown legacy outcomes must not be mistaken for paid.
            conn.execute(
                "UPDATE payments SET status = ?1 WHERE id = ?2",
                rusqlite::params![raw_status, payment.id],
            )
            .unwrap();
            if date == "2026-11-05" {
                current = Some(payment);
            }
        }
        assert_eq!(
            core.subscriptions()
                .get(&sub.id)
                .unwrap()
                .next_payment_date
                .as_deref(),
            Some("2026-11-05")
        );
        assert!(matches!(
            core.payments().mark_as_paid(&sub.id, "2026-11-05", 30.0),
            Err(KessaiCoreError::Conflict(message)) if message.contains(raw_status)
        ));
        assert_eq!(
            core.subscriptions()
                .get(&sub.id)
                .unwrap()
                .next_payment_date
                .as_deref(),
            Some("2026-11-05")
        );
        core.payments().delete(&current.unwrap().id).unwrap();
        core.payments()
            .mark_as_paid(&sub.id, "2026-11-05", 30.0)
            .unwrap();
        assert_eq!(
            core.subscriptions()
                .get(&sub.id)
                .unwrap()
                .next_payment_date
                .as_deref(),
            Some("2026-12-05")
        );
    }
}

#[test]
fn settled_advancement_is_bounded_to_120_periods_and_errors_roll_back_the_transaction() {
    for ahead_count in [119, 121] {
        let database = tempfile::NamedTempFile::new().unwrap();
        let core = KessaiCore::new(database.path()).unwrap();
        let sub = subscription(&core, BillingCycle::Monthly, "2026-11-05");
        let anchor = chrono::NaiveDate::from_ymd_opt(2026, 11, 5).unwrap();
        for period in 1..=ahead_count {
            let due = anchor
                .checked_add_months(chrono::Months::new(period))
                .unwrap();
            core.payments()
                .create(NewPayment {
                    subscription_id: sub.id.clone(),
                    amount: 30.0,
                    paid_at: "2026-11-05T12:00:00Z".into(),
                    due_date: due.to_string(),
                    status: PaymentStatus::Paid,
                    notes: None,
                })
                .unwrap();
        }
        let result = core.payments().mark_as_paid(&sub.id, "2026-11-05", 30.0);
        let updated = core.subscriptions().get(&sub.id).unwrap();
        if ahead_count == 119 {
            result.unwrap();
            assert_eq!(updated.next_payment_date.as_deref(), Some("2036-11-05"));
        } else {
            assert!(
                matches!(&result, Err(KessaiCoreError::Validation(message)) if message.contains("120 billing periods"))
            );
            assert_eq!(updated.next_payment_date, sub.next_payment_date);
            assert_eq!(updated.billing_day, sub.billing_day);
            assert_eq!(updated.updated_at, sub.updated_at);
            assert_eq!(
                core.payments().list_by_subscription(&sub.id).unwrap().len(),
                121
            );
            assert!(!core.payments().is_recorded(&sub.id, "2026-11-05").unwrap());
        }
    }
}

#[test]
fn direct_payment_crud_never_advances_and_notes_can_be_cleared() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Weekly, "2026-04-03");
    let payment = core
        .payments()
        .create(NewPayment {
            subscription_id: sub.id.clone(),
            amount: 20.0,
            paid_at: "2026-04-03T12:00:00Z".into(),
            due_date: "2026-04-03".into(),
            status: PaymentStatus::Paid,
            notes: Some("Receipt".into()),
        })
        .unwrap();
    assert_eq!(
        core.subscriptions()
            .get(&sub.id)
            .unwrap()
            .next_payment_date
            .as_deref(),
        Some("2026-04-03")
    );
    let patch: UpdatePayment = serde_json::from_value(serde_json::json!({
        "amount": 25.0,
        "status": "skipped",
        "notes": null
    }))
    .unwrap();
    let updated = core.payments().update(&payment.id, patch).unwrap();
    assert_eq!(updated.amount, 25.0);
    assert_eq!(updated.status, PaymentStatus::Skipped);
    assert_eq!(updated.notes, None);
    assert_eq!(
        core.subscriptions()
            .get(&sub.id)
            .unwrap()
            .next_payment_date
            .as_deref(),
        Some("2026-04-03")
    );
    core.payments().delete(&payment.id).unwrap();
    assert_eq!(
        core.subscriptions()
            .get(&sub.id)
            .unwrap()
            .next_payment_date
            .as_deref(),
        Some("2026-04-03")
    );
}

#[test]
fn pending_rows_do_not_count_as_recorded_outcomes() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Monthly, "2026-04-03");
    let pending = core
        .payments()
        .create(NewPayment {
            subscription_id: sub.id.clone(),
            amount: 30.0,
            paid_at: "2026-04-03T12:00:00Z".into(),
            due_date: "2026-04-03".into(),
            status: PaymentStatus::Pending,
            notes: None,
        })
        .unwrap();
    assert!(!core.payments().is_recorded(&sub.id, "2026-04-03").unwrap());
    core.payments()
        .update(
            &pending.id,
            UpdatePayment {
                status: Some(PaymentStatus::Skipped),
                ..Default::default()
            },
        )
        .unwrap();
    assert!(core.payments().is_recorded(&sub.id, "2026-04-03").unwrap());
}

#[test]
fn failed_schedule_update_rolls_back_the_new_paid_outcome() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Monthly, "2026-01-31");
    let conn = rusqlite::Connection::open(database.path()).unwrap();
    conn.execute_batch(
        "CREATE TRIGGER reject_schedule BEFORE UPDATE OF next_payment_date ON subscriptions
         BEGIN SELECT RAISE(ABORT, 'injected schedule update failure'); END;",
    )
    .unwrap();
    assert!(matches!(
        core.payments().mark_as_paid(&sub.id, "2026-01-31", 30.0),
        Err(KessaiCoreError::Database(_))
    ));
    assert!(core
        .payments()
        .list_by_subscription(&sub.id)
        .unwrap()
        .is_empty());
    assert_eq!(
        core.subscriptions()
            .get(&sub.id)
            .unwrap()
            .next_payment_date
            .as_deref(),
        Some("2026-01-31")
    );
    assert_eq!(core.subscriptions().get(&sub.id).unwrap().billing_day, None);
}

#[test]
fn independent_core_instances_can_record_different_subscriptions_concurrently() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let first = KessaiCore::new(database.path()).unwrap();
    let second = KessaiCore::new(database.path()).unwrap();
    let first_sub = subscription(&first, BillingCycle::Monthly, "2026-04-03");
    let second_sub = subscription(&second, BillingCycle::Monthly, "2026-04-03");
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let handles: Vec<_> = [
        (first.clone(), first_sub.id.clone()),
        (second, second_sub.id.clone()),
    ]
    .into_iter()
    .map(|(core, id)| {
        let barrier = barrier.clone();
        std::thread::spawn(move || {
            barrier.wait();
            core.payments().mark_as_paid(&id, "2026-04-03", 30.0)
        })
    })
    .collect();
    for handle in handles {
        assert_eq!(handle.join().unwrap().unwrap().status, PaymentStatus::Paid);
    }
    for sub in [first_sub, second_sub] {
        assert_eq!(
            first
                .subscriptions()
                .get(&sub.id)
                .unwrap()
                .next_payment_date
                .as_deref(),
            Some("2026-05-03")
        );
    }
}

#[test]
fn calendar_shows_every_week_in_the_anchor_month_and_excludes_month_end_boundary() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Weekly, "2026-04-03");
    let april = core.calendar().month(2026, 4).unwrap();
    assert_eq!(
        april
            .iter()
            .map(|occurrence| occurrence.due_date.as_str())
            .collect::<Vec<_>>(),
        ["2026-04-03", "2026-04-10", "2026-04-17", "2026-04-24"]
    );
    assert!(april.iter().all(|occurrence| {
        occurrence.subscription_id == sub.id
            && occurrence.payment.is_none()
            && occurrence.logo_url == sub.logo_url
    }));
    let may = core.calendar().month(2026, 5).unwrap();
    assert_eq!(may.first().unwrap().due_date, "2026-05-01");
}

#[test]
fn quarterly_and_yearly_calendar_projection_preserves_the_due_month() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let quarterly = subscription(&core, BillingCycle::Quarterly, "2026-01-31");
    core.subscriptions()
        .update(
            &quarterly.id,
            UpdateSubscription {
                billing_day: Some(Some(31)),
                ..Default::default()
            },
        )
        .unwrap();
    let yearly = subscription(&core, BillingCycle::Yearly, "2026-06-15");
    assert!(core.calendar().month(2026, 2).unwrap().is_empty());
    let april = core.calendar().month(2026, 4).unwrap();
    assert_eq!(april.len(), 1);
    assert_eq!(april[0].subscription_id, quarterly.id);
    assert_eq!(april[0].due_date, "2026-04-30");
    let next_june = core.calendar().month(2027, 6).unwrap();
    assert_eq!(next_june.len(), 1);
    assert_eq!(next_june[0].subscription_id, yearly.id);
    assert_eq!(next_june[0].due_date, "2027-06-15");
    assert!(core.calendar().month(2027, 5).unwrap().is_empty());
}

#[test]
fn cancelled_subscription_and_historical_amount_remain_on_calendar() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Monthly, "2026-04-03");
    let paid = core
        .payments()
        .mark_as_paid(&sub.id, "2026-04-03", 30.0)
        .unwrap();
    core.subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                amount: Some(90.0),
                status: Some(SubscriptionStatus::Cancelled),
                ..Default::default()
            },
        )
        .unwrap();
    let april = core.calendar().month(2026, 4).unwrap();
    assert_eq!(april.len(), 1);
    assert_eq!(april[0].subscription_id, sub.id);
    assert_eq!(april[0].status, SubscriptionStatus::Cancelled);
    assert!(!april[0].is_active);
    assert_eq!(april[0].projected_amount, 90.0);
    let recorded = april[0].payment.as_ref().unwrap();
    assert_eq!(recorded.id, paid.id);
    assert_eq!(recorded.amount, 30.0);
    assert_eq!(recorded.status, PaymentStatus::Paid);
    assert!(core.calendar().month(2026, 5).unwrap().is_empty());
    let json = serde_json::to_value(&april[0]).unwrap();
    assert!(json.get("subscription_id").is_some());
    assert!(json.get("subscriptionId").is_none());
}

#[test]
fn cancelled_subscription_gets_no_projected_occurrences_beyond_recorded_rows() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    // Weekly anchor inside April: an active subscription would project 4+ weeks.
    let sub = subscription(&core, BillingCycle::Weekly, "2026-04-03");
    core.payments()
        .mark_as_paid(&sub.id, "2026-04-03", 30.0)
        .unwrap();
    core.subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                status: Some(SubscriptionStatus::Cancelled),
                ..Default::default()
            },
        )
        .unwrap();
    let april = core.calendar().month(2026, 4).unwrap();
    assert_eq!(
        april.len(),
        1,
        "only the recorded row may remain: {april:?}"
    );
    assert_eq!(april[0].due_date, "2026-04-03");
    assert!(april[0].payment.is_some());
}

#[test]
fn calendar_retains_every_recorded_row_even_for_non_scheduled_dates_or_missing_anchor() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Yearly, "2026-06-15");
    for status in [PaymentStatus::Pending, PaymentStatus::Paid] {
        core.payments()
            .create(NewPayment {
                subscription_id: sub.id.clone(),
                amount: 12.0,
                paid_at: "2026-04-03T12:00:00Z".into(),
                due_date: "2026-04-03".into(),
                status,
                notes: None,
            })
            .unwrap();
    }
    core.subscriptions()
        .update(
            &sub.id,
            UpdateSubscription {
                next_payment_date: Some(None),
                status: Some(SubscriptionStatus::Cancelled),
                ..Default::default()
            },
        )
        .unwrap();
    let april = core.calendar().month(2026, 4).unwrap();
    assert_eq!(april.len(), 2);
    assert!(april
        .iter()
        .all(|occurrence| occurrence.due_date == "2026-04-03"));
    assert!(april.iter().all(|occurrence| occurrence.payment.is_some()));
    assert!(april
        .iter()
        .any(|occurrence| occurrence.payment.as_ref().unwrap().status == PaymentStatus::Pending));
    assert!(april
        .iter()
        .any(|occurrence| occurrence.payment.as_ref().unwrap().status == PaymentStatus::Paid));
}

#[test]
fn month_and_analytics_windows_are_validated_at_the_service_boundary() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    for month in [0, 13, u32::MAX] {
        assert!(matches!(
            core.calendar().month(2026, month),
            Err(KessaiCoreError::Validation(_))
        ));
        assert!(matches!(
            core.payments().list_by_month(2026, month),
            Err(KessaiCoreError::Validation(_))
        ));
        assert!(matches!(
            core.payments().list_with_details(2026, month),
            Err(KessaiCoreError::Validation(_))
        ));
    }
    for year in [i32::MIN, 1899, 10000, i32::MAX] {
        assert!(matches!(
            core.calendar().month(year, 1),
            Err(KessaiCoreError::Validation(_))
        ));
        assert!(matches!(
            core.analytics().year_summary(year),
            Err(KessaiCoreError::Validation(_))
        ));
    }
    for months in [-1, 0, 121, i32::MAX] {
        assert!(matches!(
            core.analytics().monthly_spending(months),
            Err(KessaiCoreError::Validation(_))
        ));
        assert!(matches!(
            core.analytics().category_spending(months),
            Err(KessaiCoreError::Validation(_))
        ));
    }
    assert!(core.analytics().monthly_spending(1).unwrap().is_empty());
    assert!(core.analytics().category_spending(120).unwrap().is_empty());
    let empty = core.analytics().year_summary(2026).unwrap();
    assert_eq!(empty.highest_month, "");
    assert_eq!(empty.highest_amount, 0.0);
}

#[test]
fn dashboard_summary_uses_billable_user_shares_for_totals_and_categories() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let monthly = subscription(&core, BillingCycle::Monthly, "2026-04-03");
    core.subscriptions()
        .update(
            &monthly.id,
            UpdateSubscription {
                shared_count: Some(3),
                ..Default::default()
            },
        )
        .unwrap();
    let yearly = subscription(&core, BillingCycle::Yearly, "2026-04-03");
    core.subscriptions()
        .update(
            &yearly.id,
            UpdateSubscription {
                amount: Some(240.0),
                shared_count: Some(2),
                category_id: Some(None),
                status: Some(SubscriptionStatus::GracePeriod),
                ..Default::default()
            },
        )
        .unwrap();
    let trial = subscription(&core, BillingCycle::Quarterly, "2026-04-03");
    core.subscriptions()
        .update(
            &trial.id,
            UpdateSubscription {
                amount: Some(90.0),
                shared_count: Some(3),
                status: Some(SubscriptionStatus::Trial),
                ..Default::default()
            },
        )
        .unwrap();
    for status in [
        SubscriptionStatus::Paused,
        SubscriptionStatus::PendingCancellation,
        SubscriptionStatus::Cancelled,
    ] {
        let sub = subscription(&core, BillingCycle::Monthly, "2026-04-03");
        core.subscriptions()
            .update(
                &sub.id,
                UpdateSubscription {
                    status: Some(status),
                    ..Default::default()
                },
            )
            .unwrap();
    }
    // Retain legacy contradictory rows without rewriting data, but do not bill them.
    let inactive = subscription(&core, BillingCycle::Monthly, "2026-04-03");
    let conn = rusqlite::Connection::open(database.path()).unwrap();
    conn.execute(
        "UPDATE subscriptions SET is_active = 0 WHERE id = ?1",
        [&inactive.id],
    )
    .unwrap();
    let summary = core.analytics().dashboard_summary("USD").unwrap();
    assert_eq!(summary.total_count, 7);
    assert_eq!(summary.active_count, 3);
    assert_eq!(summary.total_monthly, 30.0);
    assert_eq!(summary.total_yearly, 360.0);
    assert_eq!(summary.average_per_subscription, 10.0);
    assert_eq!(summary.category_spending.len(), 2);
    assert_eq!(summary.category_spending[0].id, "cat-streaming");
    assert_eq!(summary.category_spending[0].amount, 20.0);
    assert!((summary.category_spending[0].percentage - 66.6666666667).abs() < 1e-8);
    assert_eq!(summary.category_spending[1].id, "uncategorized");
    assert_eq!(summary.category_spending[1].amount, 10.0);
    assert!(core.payments().list().unwrap().is_empty());
}

#[test]
fn dashboard_excludes_other_currencies_and_counts_only_billable_user_shares() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let usd = subscription(&core, BillingCycle::Monthly, "2026-04-03");
    core.subscriptions()
        .update(
            &usd.id,
            UpdateSubscription {
                shared_count: Some(3),
                ..Default::default()
            },
        )
        .unwrap();
    for (currency, status) in [
        ("EUR", SubscriptionStatus::Active),
        ("EUR", SubscriptionStatus::Trial),
        ("JPY", SubscriptionStatus::GracePeriod),
        ("GBP", SubscriptionStatus::Cancelled),
    ] {
        let sub = subscription(&core, BillingCycle::Monthly, "2026-04-03");
        core.subscriptions()
            .update(
                &sub.id,
                UpdateSubscription {
                    currency: Some(currency.into()),
                    status: Some(status),
                    ..Default::default()
                },
            )
            .unwrap();
    }
    let stats = core.analytics().dashboard_summary("USD").unwrap();
    assert_eq!(stats.total_monthly, 10.0);
    assert_eq!(stats.total_yearly, 120.0);
    assert_eq!(stats.active_count, 1);
    assert_eq!(stats.total_count, 5);
    assert_eq!(stats.average_per_subscription, 10.0);
    assert_eq!(stats.category_spending[0].amount, 10.0);
    assert_eq!(
        stats.excluded_currencies,
        std::collections::BTreeMap::from([("EUR".into(), 2), ("JPY".into(), 1),])
    );
    let eur = core.analytics().dashboard_summary("EUR").unwrap();
    assert_eq!(eur.total_monthly, 60.0);
    assert_eq!(eur.active_count, 2);
}

#[test]
fn year_summary_propagates_a_real_highest_month_query_error() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Monthly, "2026-04-03");
    let payment = core
        .payments()
        .mark_as_paid(&sub.id, "2026-04-03", 30.0)
        .unwrap();
    // Simulate a malformed legacy row: totals remain queryable, but strftime
    // returns NULL for the winning month. It must not masquerade as no history.
    let conn = rusqlite::Connection::open(database.path()).unwrap();
    conn.execute(
        "UPDATE payments SET due_date = '2026-01-99' WHERE id = ?1",
        [&payment.id],
    )
    .unwrap();
    assert!(matches!(
        core.analytics().year_summary(2026),
        Err(KessaiCoreError::Database(_))
    ));
}

#[test]
fn payment_boundaries_reject_invalid_amounts_dates_timestamps_and_references() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Monthly, "2026-04-03");
    for amount in [-1.0, f64::NAN, f64::INFINITY] {
        assert!(matches!(
            core.payments().mark_as_paid(&sub.id, "2026-04-03", amount),
            Err(KessaiCoreError::Validation(_))
        ));
        assert!(matches!(
            core.payments().skip_payment(&sub.id, "2026-04-03", amount),
            Err(KessaiCoreError::Validation(_))
        ));
    }
    assert!(matches!(
        core.payments().mark_as_paid(&sub.id, "2026-02-30", 30.0),
        Err(KessaiCoreError::Validation(_))
    ));
    assert!(matches!(
        core.payments().mark_as_paid("missing", "2026-04-03", 30.0),
        Err(KessaiCoreError::NotFound(_))
    ));
    assert!(matches!(
        core.payments().create(NewPayment {
            subscription_id: sub.id.clone(),
            amount: 30.0,
            paid_at: "not-a-timestamp".into(),
            due_date: "2026-04-03".into(),
            status: PaymentStatus::Paid,
            notes: None,
        }),
        Err(KessaiCoreError::Validation(_))
    ));
    assert!(core
        .payments()
        .list_by_subscription(&sub.id)
        .unwrap()
        .is_empty());
}

#[test]
fn month_queries_share_the_same_half_open_december_rollover() {
    let database = tempfile::NamedTempFile::new().unwrap();
    let core = KessaiCore::new(database.path()).unwrap();
    let sub = subscription(&core, BillingCycle::Monthly, "2026-12-31");
    core.payments()
        .mark_as_paid(&sub.id, "2026-12-31", 30.0)
        .unwrap();
    core.payments()
        .mark_as_paid(&sub.id, "2027-01-01", 30.0)
        .unwrap();
    for (year, month, due) in [(2026, 12, "2026-12-31"), (2027, 1, "2027-01-01")] {
        let payments = core.payments().list_by_month(year, month).unwrap();
        let details = core.payments().list_with_details(year, month).unwrap();
        assert_eq!(payments.len(), 1);
        assert_eq!(details.len(), 1);
        assert_eq!(payments[0].due_date, due);
        assert_eq!(details[0].due_date, due);
        assert_eq!(payments[0].id, details[0].id);
    }
}
