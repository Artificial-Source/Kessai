//! Shared agent interface: validation, pagination, policy and output shaping live here.
//! Adapters translate transport only. All operations affect local data, never providers.
mod backup;
mod convert;
mod dto;
mod error;
mod pagination;
mod references;
use chrono::Utc;
pub use dto::*;
pub use error::*;
use kessai_core::{models as core, validation, KessaiCore};
use pagination::page;
pub use pagination::{clamp_limit, Cursor, ListKind, YearMonth};
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Clone)]
pub struct Application {
    core: KessaiCore,
}
impl Application {
    pub fn new(core: KessaiCore) -> Self {
        Self { core }
    }
    /// Keep synchronous SQLite and filesystem work off long-lived async executors.
    pub async fn run_blocking<T, F>(&self, task: F) -> Result<T>
    where
        T: Send + 'static,
        F: FnOnce(Self) -> T + Send + 'static,
    {
        let app = self.clone();
        tokio::task::spawn_blocking(move || task(app))
            .await
            .map_err(|error| {
                AppError::Internal(format!("blocking application task failed: {error}"))
            })
    }
    pub fn list_subscriptions(
        &self,
        mut filter: SubscriptionFilter,
    ) -> Result<Page<SubscriptionItem>> {
        let limit = clamp_limit(filter.limit.take(), ListKind::Standard)?;
        let cursor = filter.cursor.take();
        let (from, to) = date_range(filter.due_from.as_deref(), filter.due_to.as_deref())?;
        if let Some(days) = filter.upcoming_days {
            range(days, 0, 366, "upcoming_days")?;
        }
        if let Some(days) = filter.review_overdue_days {
            range(days, 1, 3650, "review_overdue_days")?;
        }
        if let Some(days) = filter.trial_ending_within_days {
            range(days, 0, 366, "trial_ending_within_days")?;
        }
        self.validate_refs(
            filter.category_id.as_deref(),
            filter.card_id.as_deref(),
            &[],
        )?;
        if let Some(id) = &filter.tag_id {
            self.core.tags().get(id)?;
        }
        let mut rows = self.core.subscriptions().list()?;
        if let Some(days) = filter.upcoming_days {
            let ids: HashSet<_> = kessai_core::utils::get_upcoming_subscriptions(&rows, days)
                .into_iter()
                .map(|row| row.id.clone())
                .collect();
            rows.retain(|row| ids.contains(&row.id));
        }
        if let Some(days) = filter.review_overdue_days {
            let ids: HashSet<_> = self
                .core
                .subscriptions()
                .list_needing_review(days)?
                .into_iter()
                .map(|row| row.id)
                .collect();
            rows.retain(|row| row.status.is_billable() && ids.contains(&row.id));
        }
        if let Some(days) = filter.trial_ending_within_days {
            let ids: HashSet<_> = kessai_core::utils::get_expiring_trials(&rows, days)
                .into_iter()
                .map(|row| row.id.clone())
                .collect();
            rows.retain(|row| ids.contains(&row.id));
        }
        let query = filter.query.as_ref().map(|query| query.to_lowercase());
        rows.retain(|row| {
            query
                .as_ref()
                .is_none_or(|query| row.name.to_lowercase().contains(query))
                && (filter.status.is_empty() || filter.status.contains(&row.status))
                && filter
                    .category_id
                    .as_ref()
                    .is_none_or(|id| row.category_id.as_ref() == Some(id))
                && filter
                    .card_id
                    .as_ref()
                    .is_none_or(|id| row.card_id.as_ref() == Some(id))
                && from.is_none_or(|from| {
                    row.next_payment_date
                        .as_deref()
                        .is_some_and(|date| date >= from)
                })
                && to.is_none_or(|to| {
                    row.next_payment_date
                        .as_deref()
                        .is_some_and(|date| date <= to)
                })
        });
        let ids: Vec<_> = rows.iter().map(|row| row.id.clone()).collect();
        let mut tags: HashMap<String, Vec<String>> = HashMap::new();
        for link in self.core.tags().list_links_for_subscriptions(&ids)? {
            tags.entry(link.subscription_id)
                .or_default()
                .push(link.tag_id);
        }
        if let Some(tag_id) = &filter.tag_id {
            rows.retain(|row| tags.get(&row.id).is_some_and(|tags| tags.contains(tag_id)));
        }
        rows.sort_by(|a, b| {
            let order = match filter.sort {
                SubscriptionSort::NextPaymentDate => {
                    optional_order(&a.next_payment_date, &b.next_payment_date)
                }
                SubscriptionSort::Name => a.name.cmp(&b.name),
                SubscriptionSort::AmountDesc => b.amount.total_cmp(&a.amount),
                SubscriptionSort::LastReviewedAt => a.last_reviewed_at.cmp(&b.last_reviewed_at),
                SubscriptionSort::CreatedAtDesc => b.created_at.cmp(&a.created_at),
            };
            order.then_with(|| a.id.cmp(&b.id))
        });
        let rows = rows
            .into_iter()
            .map(|row| {
                let ids = tags.remove(&row.id).unwrap_or_default();
                SubscriptionItem::project(row, ids)
            })
            .collect();
        page(rows, limit, cursor.as_deref(), &("subscriptions", filter))
    }
    pub fn get_subscription(&self, id: &str) -> Result<SubscriptionDetail> {
        let value = self.core.subscriptions().get(id)?;
        let tags = self
            .core
            .tags()
            .list_for_subscription(id)?
            .into_iter()
            .map(|tag| TagRef {
                id: tag.id,
                name: tag.name,
                color: tag.color,
            })
            .collect();
        let category = value
            .category_id
            .as_deref()
            .map(|id| {
                self.core.categories().get(id).map(|category| NamedRef {
                    id: category.id,
                    name: category.name,
                })
            })
            .transpose()?;
        let card = value
            .card_id
            .as_deref()
            .map(|id| {
                self.core.payment_cards().get(id).map(|card| CardRef {
                    id: card.id,
                    name: card.name,
                    last_four: card.last_four,
                })
            })
            .transpose()?;
        Ok(SubscriptionDetail::enrich(value, tags, category, card))
    }
    pub fn create_subscription(
        &self,
        input: CreateSubscriptionInput,
    ) -> Result<SubscriptionDetail> {
        validate_subscription_fields(
            Some(&input.name),
            Some(input.amount),
            input.currency.as_deref(),
            input.billing_day,
            input.color.as_deref(),
            input.notes.as_deref(),
            input.next_payment_date.as_deref(),
            input.trial_end_date.as_deref(),
            input.shared_count,
        )?;
        self.validate_refs(
            input.category_id.as_deref(),
            input.card_id.as_deref(),
            &input.tag_ids,
        )?;
        let currency = match input.currency {
            Some(currency) => currency,
            None => self.core.settings().get()?.currency,
        };
        let status = input.status.unwrap_or(SubscriptionStatus::Active);
        let row = self.core.subscriptions().create(core::NewSubscription {
            name: input.name,
            amount: input.amount,
            currency,
            billing_cycle: input.billing_cycle,
            billing_day: input.billing_day,
            category_id: input.category_id,
            card_id: input.card_id,
            color: input.color,
            logo_url: None,
            notes: input.notes,
            is_active: status.is_billable(),
            next_payment_date: input.next_payment_date,
            status,
            trial_end_date: input.trial_end_date,
            shared_count: input.shared_count.unwrap_or(1),
            is_pinned: input.is_pinned.unwrap_or(false),
        })?;
        for tag_id in input.tag_ids {
            self.core
                .tags()
                .add_to_subscription(&row.id, &tag_id)
                .map_err(applied)?;
        }
        self.get_subscription(&row.id).map_err(applied)
    }
    pub fn update_subscription(
        &self,
        id: &str,
        input: UpdateSubscriptionInput,
    ) -> Result<SubscriptionDetail> {
        for (field, set, clear) in [
            (
                "billing_day",
                input.billing_day.is_some(),
                ClearField::BillingDay,
            ),
            (
                "category_id",
                input.category_id.is_some(),
                ClearField::CategoryId,
            ),
            ("card_id", input.card_id.is_some(), ClearField::CardId),
            ("color", input.color.is_some(), ClearField::Color),
            ("notes", input.notes.is_some(), ClearField::Notes),
            (
                "next_payment_date",
                input.next_payment_date.is_some(),
                ClearField::NextPaymentDate,
            ),
            (
                "trial_end_date",
                input.trial_end_date.is_some(),
                ClearField::TrialEndDate,
            ),
        ] {
            set_clear(field, set, input.clear_fields.contains(&clear))?;
        }
        let has_fields = input.name.is_some()
            || input.amount.is_some()
            || input.currency.is_some()
            || input.billing_cycle.is_some()
            || input.billing_day.is_some()
            || input.category_id.is_some()
            || input.card_id.is_some()
            || input.color.is_some()
            || input.notes.is_some()
            || input.next_payment_date.is_some()
            || input.status.is_some()
            || input.trial_end_date.is_some()
            || input.shared_count.is_some()
            || input.is_pinned.is_some()
            || input.cancellation_reason.is_some()
            || input.mark_reviewed == Some(true)
            || !input.clear_fields.is_empty();
        require_change(
            has_fields || !input.add_tag_ids.is_empty() || !input.remove_tag_ids.is_empty(),
        )?;
        if input.cancellation_reason.is_some()
            && input.status != Some(SubscriptionStatus::Cancelled)
        {
            return Err(AppError::validation(
                "cancellation_reason",
                "cancellation_reason requires status=cancelled",
                "Use status=cancelled with cancellation_reason=No longer needed.",
            ));
        }
        if input
            .add_tag_ids
            .iter()
            .any(|id| input.remove_tag_ids.contains(id))
        {
            return Err(AppError::validation(
                "add_tag_ids",
                "a tag cannot be both added and removed",
                "Use add_tag_ids=[one tag id] and remove_tag_ids=[] to attach it.",
            ));
        }
        validate_subscription_fields(
            input.name.as_deref(),
            input.amount,
            input.currency.as_deref(),
            input.billing_day,
            input.color.as_deref(),
            input.notes.as_deref(),
            input.next_payment_date.as_deref(),
            input.trial_end_date.as_deref(),
            input.shared_count,
        )?;
        if let Some(reason) = &input.cancellation_reason {
            check("cancellation_reason", validation::validate_notes(reason))?;
        }
        self.core.subscriptions().get(id)?;
        self.validate_refs(
            input.category_id.as_deref(),
            input.card_id.as_deref(),
            &input.add_tag_ids,
        )?;
        self.validate_refs(None, None, &input.remove_tag_ids)?;
        let clear = |field| input.clear_fields.contains(&field);
        // transition_status, cancel_with_reason and mark_reviewed are wrappers of
        // core update. Combine their patches here for one atomic lifecycle+field write.
        if has_fields {
            self.core.subscriptions().update(
                id,
                core::UpdateSubscription {
                    name: input.name,
                    amount: input.amount,
                    currency: input.currency,
                    billing_cycle: input.billing_cycle,
                    billing_day: nullable_patch(input.billing_day, clear(ClearField::BillingDay)),
                    category_id: nullable_patch(input.category_id, clear(ClearField::CategoryId)),
                    card_id: nullable_patch(input.card_id, clear(ClearField::CardId)),
                    color: nullable_patch(input.color, clear(ClearField::Color)),
                    notes: nullable_patch(input.notes, clear(ClearField::Notes)),
                    next_payment_date: nullable_patch(
                        input.next_payment_date,
                        clear(ClearField::NextPaymentDate),
                    ),
                    trial_end_date: nullable_patch(
                        input.trial_end_date,
                        clear(ClearField::TrialEndDate),
                    ),
                    status: input.status,
                    shared_count: input.shared_count,
                    is_pinned: input.is_pinned,
                    cancellation_reason: input.cancellation_reason.map(Some),
                    last_reviewed_at: (input.mark_reviewed == Some(true))
                        .then(|| Some(Utc::now().to_rfc3339())),
                    ..Default::default()
                },
            )?;
        }
        let mut changed = has_fields;
        for (ids, add) in [(input.add_tag_ids, true), (input.remove_tag_ids, false)] {
            for tag_id in ids {
                let result = if add {
                    self.core.tags().add_to_subscription(id, &tag_id)
                } else {
                    self.core.tags().remove_from_subscription(id, &tag_id)
                };
                result.map_err(|error| {
                    if changed {
                        applied(error)
                    } else {
                        error.into()
                    }
                })?;
                changed = true;
            }
        }
        self.get_subscription(id).map_err(|error| {
            if changed {
                error.with_side_effects(SideEffects::Applied)
            } else {
                error
            }
        })
    }
    fn validate_refs(
        &self,
        category: Option<&str>,
        card: Option<&str>,
        tags: &[String],
    ) -> Result<()> {
        if let Some(id) = category {
            self.core.categories().get(id)?;
        }
        if let Some(id) = card {
            self.core.payment_cards().get(id)?;
        }
        for id in tags {
            self.core.tags().get(id)?;
        }
        Ok(())
    }
    pub fn list_payments(&self, mut filter: PaymentFilter) -> Result<Page<PaymentItem>> {
        let limit = clamp_limit(filter.limit.take(), ListKind::Standard)?;
        let cursor = filter.cursor.take();
        let (from, to) = date_range(filter.due_from.as_deref(), filter.due_to.as_deref())?;
        let month = filter
            .month
            .as_deref()
            .map(str::parse::<YearMonth>)
            .transpose()?;
        if let Some(id) = &filter.subscription_id {
            self.core.subscriptions().get(id)?;
        }
        let mut rows = if let Some(month) = month {
            self.core
                .payments()
                .list_by_month(month.year(), month.month())?
        } else if let Some(id) = &filter.subscription_id {
            self.core.payments().list_by_subscription(id)?
        } else {
            self.core.payments().list()?
        };
        rows.retain(|row| {
            filter
                .subscription_id
                .as_ref()
                .is_none_or(|id| id == &row.subscription_id)
                && (filter.status.is_empty() || filter.status.contains(&row.status))
                && from.is_none_or(|from| row.due_date.as_str() >= from)
                && to.is_none_or(|to| row.due_date.as_str() <= to)
        });
        rows.sort_by(|a, b| b.due_date.cmp(&a.due_date).then_with(|| a.id.cmp(&b.id)));
        let page = page(rows, limit, cursor.as_deref(), &("payments", filter))?;
        let mut names = HashMap::new();
        let items = page
            .items
            .into_iter()
            .map(|payment| {
                if !names.contains_key(&payment.subscription_id) {
                    let subscription = self.core.subscriptions().get(&payment.subscription_id)?;
                    names.insert(
                        payment.subscription_id.clone(),
                        (subscription.name, subscription.currency),
                    );
                }
                let (name, currency) = &names[&payment.subscription_id];
                Ok(PaymentItem::enrich(payment, name.clone(), currency.clone()))
            })
            .collect::<Result<_>>()?;
        Ok(Page {
            items,
            total: page.total,
            next_cursor: page.next_cursor,
            warnings: page.warnings,
        })
    }
    pub fn record_outcome(
        &self,
        subscription_id: &str,
        status: PaymentStatus,
        due_date: Option<String>,
        amount: Option<f64>,
    ) -> Result<RecordOutcome> {
        if status == PaymentStatus::Pending {
            return Err(AppError::validation(
                "status",
                "recorded outcome must be paid or skipped",
                "Use status=paid or status=skipped; use payments_create for pending rows.",
            ));
        }
        let before = self.core.subscriptions().get(subscription_id)?;
        let due_date = due_date
            .or_else(|| before.next_payment_date.clone())
            .ok_or_else(|| {
                AppError::validation(
                    "due_date",
                    "subscription has no next payment date",
                    "Provide due_date=2026-01-01, or set next_payment_date first.",
                )
            })?;
        date(&due_date, "due_date")?;
        let amount = amount.unwrap_or(before.amount);
        check("amount", validation::validate_amount(amount, "amount"))?;
        let replayed = self
            .core
            .payments()
            .is_recorded(subscription_id, &due_date)?;
        let payment = match status {
            PaymentStatus::Paid => {
                self.core
                    .payments()
                    .mark_as_paid(subscription_id, &due_date, amount)?
            }
            PaymentStatus::Skipped => {
                self.core
                    .payments()
                    .skip_payment(subscription_id, &due_date, amount)?
            }
            PaymentStatus::Pending => unreachable!("validated outcome status"),
        };
        let after = self
            .core
            .subscriptions()
            .get(subscription_id)
            .map_err(applied)?;
        Ok(RecordOutcome {
            payment: PaymentItem::enrich(payment, before.name, before.currency),
            replayed,
            schedule_advanced: before.next_payment_date != after.next_payment_date,
            subscription: ScheduleSummary {
                id: after.id,
                name: after.name,
                next_payment_date: after.next_payment_date,
            },
        })
    }
    pub fn create_payment(&self, input: CreatePaymentInput) -> Result<PaymentItem> {
        check(
            "amount",
            validation::validate_amount(input.amount, "amount"),
        )?;
        date(&input.due_date, "due_date")?;
        if let Some(notes) = &input.notes {
            check("notes", validation::validate_notes(notes))?;
        }
        let paid_at = input.paid_at.unwrap_or_else(|| Utc::now().to_rfc3339());
        check(
            "paid_at",
            validation::validate_timestamp(&paid_at, "paid_at"),
        )?;
        let sub = self.core.subscriptions().get(&input.subscription_id)?;
        let payment = self.core.payments().create(core::NewPayment {
            subscription_id: input.subscription_id,
            amount: input.amount,
            paid_at,
            due_date: input.due_date,
            status: input.status,
            notes: input.notes,
        })?;
        Ok(PaymentItem::enrich(payment, sub.name, sub.currency))
    }
    pub fn update_payment(&self, id: &str, input: UpdatePaymentInput) -> Result<PaymentItem> {
        let clear_notes = input.clear_fields.contains(&PaymentClearField::Notes);
        set_clear("notes", input.notes.is_some(), clear_notes)?;
        require_change(
            input.amount.is_some()
                || input.status.is_some()
                || input.paid_at.is_some()
                || input.notes.is_some()
                || clear_notes,
        )?;
        if let Some(amount) = input.amount {
            check("amount", validation::validate_amount(amount, "amount"))?;
        }
        if let Some(paid_at) = &input.paid_at {
            check(
                "paid_at",
                validation::validate_timestamp(paid_at, "paid_at"),
            )?;
        }
        if let Some(notes) = &input.notes {
            check("notes", validation::validate_notes(notes))?;
        }
        let previous = self.core.payments().get(id)?;
        let sub = self.core.subscriptions().get(&previous.subscription_id)?;
        let payment = self.core.payments().update(
            id,
            core::UpdatePayment {
                amount: input.amount,
                paid_at: input.paid_at,
                status: input.status,
                notes: nullable_patch(input.notes, clear_notes),
            },
        )?;
        Ok(PaymentItem::enrich(payment, sub.name, sub.currency))
    }
    pub fn calendar_month(
        &self,
        month: YearMonth,
        limit: Option<usize>,
        cursor: Option<String>,
    ) -> Result<CalendarMonth> {
        let limit = clamp_limit(limit, ListKind::Calendar)?;
        let mut rows: Vec<CalendarOccurrence> = self
            .core
            .calendar()
            .month(month.year(), month.month())?
            .into_iter()
            .map(Into::into)
            .collect();
        rows.sort_by(|a, b| {
            (
                &a.due_date,
                &a.name,
                &a.subscription_id,
                a.payment.as_ref().map(|p| &p.id),
            )
                .cmp(&(
                    &b.due_date,
                    &b.name,
                    &b.subscription_id,
                    b.payment.as_ref().map(|p| &p.id),
                ))
        });
        let mut totals: BTreeMap<String, CurrencyTotals> = BTreeMap::new();
        for row in &rows {
            let total = totals.entry(row.currency.clone()).or_default();
            total.projected += row.projected_amount;
            match &row.payment {
                Some(payment) => match payment.status {
                    PaymentStatus::Paid => total.paid += payment.amount,
                    PaymentStatus::Skipped => total.skipped += payment.amount,
                    PaymentStatus::Pending => total.pending += payment.amount,
                },
                None => total.pending += row.projected_amount,
            }
        }
        let page = page(rows, limit, cursor.as_deref(), &("calendar", month))?;
        Ok(CalendarMonth {
            month: month.to_string(),
            items: page.items,
            total: page.total,
            next_cursor: page.next_cursor,
            totals_by_currency: totals,
        })
    }
    pub fn settings_get(&self) -> Result<Settings> {
        Ok(self.core.settings().get()?.into())
    }
    pub fn settings_update(&self, input: UpdateSettingsInput) -> Result<Settings> {
        let clear_budget = input
            .clear_fields
            .contains(&SettingsClearField::MonthlyBudget);
        set_clear(
            "monthly_budget",
            input.monthly_budget.is_some(),
            clear_budget,
        )?;
        require_change(
            input.theme.is_some()
                || input.currency.is_some()
                || input.notification_enabled.is_some()
                || input.notification_days_before.is_some()
                || input.notification_advance_days.is_some()
                || input.notification_time.is_some()
                || input.monthly_budget.is_some()
                || input.reduce_motion.is_some()
                || input.enable_transitions.is_some()
                || input.enable_hover_effects.is_some()
                || input.animation_speed.is_some()
                || clear_budget,
        )?;
        if let Some(currency) = &input.currency {
            check("currency", validation::validate_currency(currency))?;
        }
        if let Some(time) = &input.notification_time {
            check(
                "notification_time",
                validation::validate_notification_time(time),
            )?;
        }
        if let Some(budget) = input.monthly_budget {
            check(
                "monthly_budget",
                validation::validate_amount(budget, "monthly_budget"),
            )?;
        }
        if let Some(days) = &input.notification_days_before {
            for day in days {
                range(i64::from(*day), 0, 365, "notification_days_before")?;
            }
        }
        if let Some(days) = input.notification_advance_days {
            range(i64::from(days), 0, 365, "notification_advance_days")?;
        }
        Ok(self
            .core
            .settings()
            .update(core::UpdateSettings {
                theme: input.theme,
                currency: input.currency,
                display_exchange_rates: None,
                notification_enabled: input.notification_enabled,
                notification_days_before: input.notification_days_before,
                notification_advance_days: input.notification_advance_days,
                notification_time: input.notification_time,
                monthly_budget: nullable_patch(input.monthly_budget, clear_budget),
                reduce_motion: input.reduce_motion,
                enable_transitions: input.enable_transitions,
                enable_hover_effects: input.enable_hover_effects,
                animation_speed: input.animation_speed,
            })?
            .into())
    }
    pub fn analytics_dashboard(&self) -> Result<DashboardStats> {
        let currency = self.core.settings().get()?.currency;
        let value = self.core.analytics().dashboard_summary(&currency)?;
        Ok(DashboardStats {
            display_currency: currency,
            total_monthly: value.total_monthly,
            total_yearly: value.total_yearly,
            active_count: value.active_count,
            total_count: value.total_count,
            average_per_subscription: value.average_per_subscription,
            category_spending: value
                .category_spending
                .into_iter()
                .map(Into::into)
                .collect(),
            excluded_currencies: value.excluded_currencies,
        })
    }
    pub fn analytics_spending(&self, months: i32) -> Result<SpendingReport> {
        range(i64::from(months), 1, 60, "months")?;
        Ok(SpendingReport {
            months,
            monthly: self
                .core
                .analytics()
                .monthly_spending(months)?
                .into_iter()
                .map(Into::into)
                .collect(),
            by_category: self
                .core
                .analytics()
                .category_spending(months)?
                .into_iter()
                .map(Into::into)
                .collect(),
            velocity: self.core.analytics().spending_velocity()?.into(),
        })
    }
    pub fn analytics_year(&self, year: i32) -> Result<YearSummary> {
        range(i64::from(year), 1900, 9998, "year")?;
        Ok(self.core.analytics().year_summary(year)?.into())
    }
    pub fn price_history_list(
        &self,
        subscription_id: Option<String>,
        since_days: Option<i64>,
        limit: Option<usize>,
        cursor: Option<String>,
    ) -> Result<Page<PriceChangeItem>> {
        let limit = clamp_limit(limit, ListKind::Standard)?;
        if let Some(days) = since_days {
            range(days, 1, 3650, "since_days")?;
        }
        let mut rows = if let Some(id) = &subscription_id {
            self.core.subscriptions().get(id)?;
            self.core.price_history().list_by_subscription(id)?
        } else if let Some(days) = since_days {
            self.core.price_history().list_recent(days)?
        } else {
            self.core.price_history().list()?
        };
        if let Some(days) = since_days {
            let threshold = Utc::now() - chrono::Duration::days(days);
            rows.retain(|row| {
                chrono::DateTime::parse_from_rfc3339(&row.changed_at)
                    .is_ok_and(|date| date >= threshold)
            });
        }
        rows.sort_by(|a, b| {
            b.changed_at
                .cmp(&a.changed_at)
                .then_with(|| a.id.cmp(&b.id))
        });
        let page = page(
            rows,
            limit,
            cursor.as_deref(),
            &("price_history", &subscription_id, since_days),
        )?;
        let mut names = HashMap::new();
        let items = page
            .items
            .into_iter()
            .map(|row| {
                if !names.contains_key(&row.subscription_id) {
                    names.insert(
                        row.subscription_id.clone(),
                        self.core.subscriptions().get(&row.subscription_id)?.name,
                    );
                }
                Ok(PriceChangeItem {
                    subscription_name: names[&row.subscription_id].clone(),
                    id: row.id,
                    subscription_id: row.subscription_id,
                    old_amount: row.old_amount,
                    new_amount: row.new_amount,
                    old_currency: row.old_currency,
                    new_currency: row.new_currency,
                    changed_at: row.changed_at,
                })
            })
            .collect::<Result<_>>()?;
        Ok(Page {
            items,
            total: page.total,
            next_cursor: page.next_cursor,
            warnings: page.warnings,
        })
    }
}
fn applied(error: impl Into<AppError>) -> AppError {
    error.into().with_side_effects(SideEffects::Applied)
}
fn optional_order(a: &Option<String>, b: &Option<String>) -> std::cmp::Ordering {
    match (a, b) {
        (Some(a), Some(b)) => a.cmp(b),
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, None) => std::cmp::Ordering::Equal,
    }
}
fn check(field: &str, result: kessai_core::error::Result<()>) -> Result<()> {
    result.map_err(|error| {
        AppError::from(error)
            .with_field(field)
            .with_hint(error::example_hint(field))
    })
}
fn range(value: i64, minimum: i64, maximum: i64, field: &str) -> Result<()> {
    if !(minimum..=maximum).contains(&value) {
        return Err(AppError::validation(
            field,
            format!("{field} must be from {minimum} to {maximum}"),
            format!("Use {field}={minimum}, within {minimum}–{maximum}."),
        ));
    }
    Ok(())
}
fn date(value: &str, field: &str) -> Result<()> {
    check(field, validation::validate_date(value, field))
}
fn date_range<'a>(
    from: Option<&'a str>,
    to: Option<&'a str>,
) -> Result<(Option<&'a str>, Option<&'a str>)> {
    if let Some(from) = from {
        date(from, "due_from")?;
    }
    if let Some(to) = to {
        date(to, "due_to")?;
    }
    if from.zip(to).is_some_and(|(from, to)| from > to) {
        return Err(AppError::validation(
            "due_from",
            "due_from must not be after due_to",
            "Use due_from=2026-01-01 and due_to=2026-01-31.",
        ));
    }
    Ok((from, to))
}
fn set_clear(field: &str, set: bool, clear: bool) -> Result<()> {
    if set && clear {
        return Err(AppError::validation(
            field,
            format!("cannot set and clear {field} together"),
            format!("To clear {field}, omit its value and use clear_fields=[\"{field}\"]."),
        ));
    }
    Ok(())
}
fn require_change(changed: bool) -> Result<()> {
    if changed {
        Ok(())
    } else {
        Err(AppError::validation("input", "at least one update field is required", "Provide a documented change, for example amount=9.99 for subscriptions/payments, name=Netflix for reference entities, or monthly_budget=100 for settings."))
    }
}
/// Translate explicit clear lists into the core's nullable patch representation.
pub fn nullable_patch<T>(value: Option<T>, clear: bool) -> Option<Option<T>> {
    if clear {
        Some(None)
    } else {
        value.map(Some)
    }
}
#[allow(clippy::too_many_arguments)]
fn validate_subscription_fields(
    name: Option<&str>,
    amount: Option<f64>,
    currency: Option<&str>,
    day: Option<i32>,
    color: Option<&str>,
    notes: Option<&str>,
    next: Option<&str>,
    trial: Option<&str>,
    shared: Option<i32>,
) -> Result<()> {
    if let Some(name) = name {
        check("name", validation::validate_name(name, "name"))?;
    }
    if let Some(amount) = amount {
        check("amount", validation::validate_amount(amount, "amount"))?;
    }
    if let Some(currency) = currency {
        check("currency", validation::validate_currency(currency))?;
    }
    if let Some(day) = day {
        check("billing_day", validation::validate_billing_day(day))?;
    }
    if let Some(color) = color {
        check("color", validation::validate_color(color))?;
    }
    if let Some(notes) = notes {
        check("notes", validation::validate_notes(notes))?;
    }
    if let Some(next) = next {
        date(next, "next_payment_date")?;
    }
    if let Some(trial) = trial {
        date(trial, "trial_end_date")?;
    }
    if let Some(shared) = shared {
        check("shared_count", validation::validate_shared_count(shared))?;
    }
    Ok(())
}
fn require_confirmation(confirm: bool) -> Result<()> {
    if confirm {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorKind::Confirmation,
            "this operation requires explicit confirmation",
        )
        .with_hint(
            "Call again with dry_run=true to preview, then confirm=true after the user approves.",
        ))
    }
}

#[cfg(test)]
mod tests;
