use std::borrow::Cow;
use std::collections::HashSet;

use rusqlite::{params, Connection, TransactionBehavior};

use crate::db::DbPool;
use crate::error::{KessaiCoreError, Result};
use crate::models::settings::{AnimationSpeed, Theme};
use crate::models::stats::{BackupData, BackupSettings, BackupSubscriptionTag, ImportResult};
use crate::services::category::CategoryService;
use crate::services::payment::PaymentService;
use crate::services::payment_card::PaymentCardService;
use crate::services::price_history::PriceHistoryService;
use crate::services::settings::SettingsService;
use crate::services::subscription::SubscriptionService;
use crate::services::tag::TagService;
use crate::validation::{
    validate_amount, validate_color, validate_currency, validate_date, validate_last_four,
    validate_metadata_timestamp, validate_name, validate_notes, validate_notification_time,
    validate_subscription, validate_timestamp,
};

pub struct DataManagementService {
    pool: DbPool,
}

impl DataManagementService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Export all data as a BackupData struct.
    #[tracing::instrument(skip(self))]
    pub fn export_data(&self) -> Result<BackupData> {
        let conn = self.pool.get()?;
        // The first SELECT fixes the WAL snapshot for every subsequent collection,
        // even when a writer using another pool commits while export is running.
        let tx = conn.unchecked_transaction()?;
        let subs = SubscriptionService::export_with_conn(&tx)?;
        let cats = CategoryService::list_with_conn(&tx)?;
        let payments = PaymentService::list_with_conn(&tx)?;
        let payment_cards = PaymentCardService::list_with_conn(&tx)?;
        let price_history = PriceHistoryService::list_with_conn(&tx)?;
        let tags = TagService::list_with_conn(&tx)?;
        let settings = SettingsService::get_with_conn(&tx)?;
        let subscription_tags = Self::export_subscription_tags(&tx)?;
        tx.commit()?;

        let backup = BackupData {
            version: "1.2.0".to_string(),
            exported_at: chrono::Utc::now().to_rfc3339(),
            subscriptions: subs,
            categories: cats,
            payments,
            payment_cards,
            price_history,
            tags,
            subscription_tags,
            settings: BackupSettings::from(&settings),
        };
        Self::validate_backup(&backup).map_err(|error| match error {
            KessaiCoreError::Validation(mut message) => {
                if let Some((index, field)) = message
                    .strip_prefix("subscriptions[")
                    .and_then(|suffix| suffix.split_once("]."))
                    .and_then(|(index, field)| {
                        index.parse::<usize>().ok().map(|index| (index, field))
                    })
                {
                    if let Some(subscription) = backup.subscriptions.get(index) {
                        message = format!("{} ({}).{field}", subscription.id, subscription.name);
                    }
                }
                KessaiCoreError::Validation(format!("Cannot export backup: {message}"))
            }
            other => other,
        })?;
        tracing::info!(
            "exported {} subscriptions, {} categories, {} cards, {} payments, {} price changes, {} tags",
            backup.subscriptions.len(),
            backup.categories.len(),
            backup.payment_cards.len(),
            backup.payments.len(),
            backup.price_history.len(),
            backup.tags.len()
        );
        Ok(backup)
    }

    /// Export all subscription_tags rows.
    fn export_subscription_tags(conn: &Connection) -> Result<Vec<BackupSubscriptionTag>> {
        let mut stmt = conn.prepare("SELECT subscription_id, tag_id FROM subscription_tags")?;
        let rows = stmt.query_map([], |row| {
            Ok(BackupSubscriptionTag {
                subscription_id: row.get(0)?,
                tag_id: row.get(1)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Validate every record, identity, and reference before acquiring an import
    /// transaction. All adapters and direct callers share these durable invariants.
    pub fn validate_backup(data: &BackupData) -> Result<()> {
        if !matches!(data.version.as_str(), "1.0.0" | "1.1.0" | "1.2.0") {
            return Err(KessaiCoreError::Validation(format!(
                "unsupported backup version '{}' (supported: 1.0.0, 1.1.0, 1.2.0)",
                data.version
            )));
        }
        validate_timestamp(&data.exported_at, "backup exportedAt")?;

        if data.subscriptions.len() > 10_000
            || data.categories.len() > 1_000
            || data.payments.len() > 100_000
            || data.payment_cards.len() > 1_000
            || data.price_history.len() > 50_000
            || data.tags.len() > 1_000
            || data.subscription_tags.len() > 50_000
        {
            return Err(KessaiCoreError::Validation(
                "backup collection limits exceeded".into(),
            ));
        }

        validate_records(data)?;

        let category_ids = unique_ids(
            data.categories.iter().map(|row| row.id.as_str()),
            "categories",
        )?;
        let card_ids = unique_ids(
            data.payment_cards.iter().map(|row| row.id.as_str()),
            "payment_cards",
        )?;
        let subscription_ids = unique_ids(
            data.subscriptions.iter().map(|row| row.id.as_str()),
            "subscriptions",
        )?;
        unique_ids(data.payments.iter().map(|row| row.id.as_str()), "payments")?;
        unique_ids(
            data.price_history.iter().map(|row| row.id.as_str()),
            "price_history",
        )?;
        let tag_ids = unique_ids(data.tags.iter().map(|row| row.id.as_str()), "tags")?;

        for (index, subscription) in data.subscriptions.iter().enumerate() {
            if subscription
                .category_id
                .as_deref()
                .is_some_and(|id| !category_ids.contains(id))
            {
                return invalid_field(
                    "subscriptions",
                    index,
                    "category_id",
                    "references missing category",
                );
            }
            if data.version == "1.2.0"
                && subscription
                    .card_id
                    .as_deref()
                    .is_some_and(|id| !card_ids.contains(id))
            {
                return invalid_field(
                    "subscriptions",
                    index,
                    "card_id",
                    "references missing payment card",
                );
            }
        }
        for (index, payment) in data.payments.iter().enumerate() {
            if !subscription_ids.contains(payment.subscription_id.as_str()) {
                return invalid_field(
                    "payments",
                    index,
                    "subscription_id",
                    "references missing subscription",
                );
            }
        }
        for (index, change) in data.price_history.iter().enumerate() {
            if !subscription_ids.contains(change.subscription_id.as_str()) {
                return invalid_field(
                    "price_history",
                    index,
                    "subscription_id",
                    "references missing subscription",
                );
            }
        }

        let mut links = HashSet::with_capacity(data.subscription_tags.len());
        for (index, link) in data.subscription_tags.iter().enumerate() {
            if !subscription_ids.contains(link.subscription_id.as_str()) {
                return invalid_field(
                    "subscription_tags",
                    index,
                    "subscription_id",
                    "references missing subscription",
                );
            }
            if !tag_ids.contains(link.tag_id.as_str()) {
                return invalid_field(
                    "subscription_tags",
                    index,
                    "tag_id",
                    "references missing tag",
                );
            }
            if !links.insert((link.subscription_id.as_str(), link.tag_id.as_str())) {
                return invalid_field(
                    "subscription_tags",
                    index,
                    "tag_id",
                    "duplicates subscription-tag link",
                );
            }
        }

        Ok(())
    }

    /// Import data from a BackupData struct.
    /// Optionally clears existing data first.
    #[tracing::instrument(skip(self, data))]
    pub fn import_data(&self, mut data: BackupData, clear_existing: bool) -> Result<ImportResult> {
        let normalized = data
            .subscriptions
            .iter_mut()
            .fold(0, |count, subscription| {
                count + usize::from(subscription.normalize_legacy())
            });
        Self::validate_backup(&data)?;

        tracing::info!(
            "importing data: {} subscriptions, {} categories, {} payments, {} price changes, {} tags (clear_existing: {})",
            data.subscriptions.len(),
            data.categories.len(),
            data.payments.len(),
            data.price_history.len(),
            data.tags.len(),
            clear_existing
        );

        let mut conn = self.pool.get()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

        let result = (|| -> Result<ImportResult> {
            if clear_existing {
                tx.execute_batch(
                    "DELETE FROM subscription_tags;
                     DELETE FROM tags;
                     DELETE FROM price_history;
                     DELETE FROM payments;
                     DELETE FROM subscriptions;
                     DELETE FROM payment_cards;
                     DELETE FROM categories WHERE is_default = 0;",
                )?;
            }

            // Free names on incoming rows before upserting final metadata. In
            // particular, customized defaults may reuse another seed's old name.
            // Staging is private to this transaction; target-only rows still
            // retain their names and enforce the normal uniqueness constraint.
            for cat in &data.categories {
                let changing_name: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM categories WHERE id = ?1 AND name != ?2)",
                    params![cat.id, cat.name],
                    |row| row.get(0),
                )?;
                if changing_name {
                    let temporary_name = loop {
                        let candidate = format!("backup-{}", uuid::Uuid::new_v4());
                        let exists: bool = tx.query_row(
                            "SELECT EXISTS(SELECT 1 FROM categories WHERE name = ?1)",
                            params![candidate],
                            |row| row.get(0),
                        )?;
                        if !exists && !data.categories.iter().any(|cat| cat.name == candidate) {
                            break candidate;
                        }
                    };
                    tx.execute(
                        "UPDATE categories SET name = ?1 WHERE id = ?2",
                        params![temporary_name, cat.id],
                    )?;
                }
            }

            for cat in &data.categories {
                tx.execute(
                    "INSERT INTO categories (id, name, color, icon, is_default, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                     ON CONFLICT(id) DO UPDATE SET
                         name = excluded.name,
                         color = excluded.color,
                         icon = excluded.icon,
                         created_at = CASE WHEN categories.is_default = 1
                             THEN categories.created_at ELSE excluded.created_at END",
                    params![
                        cat.id,
                        cat.name,
                        cat.color,
                        cat.icon,
                        cat.is_default,
                        cat.created_at
                    ],
                )?;
            }

            for card in &data.payment_cards {
                tx.execute(
                    "INSERT INTO payment_cards
                     (id, name, card_type, last_four, color, credit_limit, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                     ON CONFLICT(id) DO UPDATE SET
                         name = excluded.name,
                         card_type = excluded.card_type,
                         last_four = excluded.last_four,
                         color = excluded.color,
                         credit_limit = excluded.credit_limit,
                         created_at = excluded.created_at",
                    params![
                        card.id,
                        card.name,
                        card.card_type.as_str(),
                        card.last_four,
                        card.color,
                        card.credit_limit,
                        card.created_at,
                    ],
                )?;
            }

            let legacy_backup = matches!(data.version.as_str(), "1.0.0" | "1.1.0");
            for sub in &data.subscriptions {
                let card_id = match sub.card_id.as_deref() {
                    Some(id) if !legacy_backup => Some(id),
                    Some(id)
                        if tx.query_row(
                            "SELECT EXISTS(SELECT 1 FROM payment_cards WHERE id = ?1)",
                            params![id],
                            |row| row.get::<_, bool>(0),
                        )? =>
                    {
                        Some(id)
                    }
                    _ => None,
                };
                tx.execute(
                    "INSERT INTO subscriptions
                     (id, name, amount, currency, billing_cycle, billing_day, next_payment_date,
                      category_id, card_id, color, logo_url, notes, is_active,
                      status, trial_end_date, status_changed_at, shared_count, is_pinned,
                      cancellation_reason, cancelled_at,
                      last_reviewed_at, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)
                     ON CONFLICT(id) DO UPDATE SET
                      name = excluded.name, amount = excluded.amount, currency = excluded.currency,
                      billing_cycle = excluded.billing_cycle, billing_day = excluded.billing_day,
                      next_payment_date = excluded.next_payment_date, category_id = excluded.category_id,
                      card_id = excluded.card_id, color = excluded.color, logo_url = excluded.logo_url,
                      notes = excluded.notes, is_active = excluded.is_active, status = excluded.status,
                      trial_end_date = excluded.trial_end_date,
                      status_changed_at = excluded.status_changed_at, shared_count = excluded.shared_count,
                      is_pinned = excluded.is_pinned, cancellation_reason = excluded.cancellation_reason,
                      cancelled_at = excluded.cancelled_at, last_reviewed_at = excluded.last_reviewed_at,
                      created_at = excluded.created_at, updated_at = excluded.updated_at",
                    params![
                        sub.id,
                        sub.name,
                        sub.amount,
                        sub.currency,
                        sub.billing_cycle.as_str(),
                        sub.billing_day,
                        sub.next_payment_date,
                        sub.category_id,
                        card_id,
                        sub.color,
                        sub.logo_url,
                        sub.notes,
                        if sub.is_active { 1 } else { 0 },
                        sub.status.as_str(),
                        sub.trial_end_date,
                        sub.status_changed_at,
                        sub.shared_count,
                        if sub.is_pinned { 1i32 } else { 0 },
                        sub.cancellation_reason,
                        sub.cancelled_at,
                        sub.last_reviewed_at,
                        sub.created_at,
                        sub.updated_at,
                    ],
                )?;
            }

            for payment in &data.payments {
                tx.execute(
                    "INSERT INTO payments
                     (id, subscription_id, amount, paid_at, due_date, status, notes, created_at, recorded_outcome)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)
                     ON CONFLICT(id) DO UPDATE SET
                         subscription_id = excluded.subscription_id,
                         amount = excluded.amount,
                         paid_at = excluded.paid_at,
                         due_date = excluded.due_date,
                         status = excluded.status,
                         notes = excluded.notes,
                         created_at = excluded.created_at,
                         recorded_outcome = 0",
                    params![
                        payment.id,
                        payment.subscription_id,
                        payment.amount,
                        payment.paid_at,
                        payment.due_date,
                        payment.status.as_str(),
                        payment.notes,
                        payment.created_at,
                    ],
                )?;
            }

            // A backup format predates the marker. Keep legacy duplicate rows, but
            // deterministically adopt one paid/skipped row per due occurrence.
            tx.execute_batch(
                "UPDATE payments
                    SET recorded_outcome = 0
                  WHERE status = 'pending' AND recorded_outcome = 1;
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
                    );",
            )?;

            for change in &data.price_history {
                tx.execute(
                    "INSERT INTO price_history
                     (id, subscription_id, old_amount, new_amount, old_currency, new_currency, changed_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                     ON CONFLICT(id) DO UPDATE SET
                         subscription_id = excluded.subscription_id,
                         old_amount = excluded.old_amount,
                         new_amount = excluded.new_amount,
                         old_currency = excluded.old_currency,
                         new_currency = excluded.new_currency,
                         changed_at = excluded.changed_at",
                    params![
                        change.id,
                        change.subscription_id,
                        change.old_amount,
                        change.new_amount,
                        change.old_currency,
                        change.new_currency,
                        change.changed_at,
                    ],
                )?;
            }

            for tag in &data.tags {
                tx.execute(
                    "INSERT INTO tags (id, name, color, created_at)
                     VALUES (?1, ?2, ?3, ?4)
                     ON CONFLICT(id) DO UPDATE SET
                         name = excluded.name,
                         color = excluded.color,
                         created_at = excluded.created_at",
                    params![tag.id, tag.name, tag.color, tag.created_at],
                )?;
            }

            for link in &data.subscription_tags {
                tx.execute(
                    "INSERT INTO subscription_tags (subscription_id, tag_id)
                     VALUES (?1, ?2)
                     ON CONFLICT(subscription_id, tag_id) DO NOTHING",
                    params![link.subscription_id, link.tag_id],
                )?;
            }

            let notification_days = serde_json::to_string(&data.settings.notification_days_before)?;
            let display_exchange_rates =
                serde_json::to_string(&data.settings.display_exchange_rates)?;

            tx.execute(
                "UPDATE settings SET theme = ?1, currency = ?2, display_exchange_rates = ?3, notification_enabled = ?4, notification_days_before = ?5, monthly_budget = ?6, notification_advance_days = ?7, notification_time = ?8, reduce_motion = ?9, enable_transitions = ?10, enable_hover_effects = ?11, animation_speed = ?12 WHERE id = 'singleton'",
                params![
                    data.settings.theme,
                    data.settings.currency,
                    display_exchange_rates,
                    if data.settings.notification_enabled { 1 } else { 0 },
                    notification_days,
                    data.settings.monthly_budget,
                    data.settings.notification_advance_days,
                    data.settings.notification_time,
                    if data.settings.reduce_motion { 1 } else { 0 },
                    if data.settings.enable_transitions { 1 } else { 0 },
                    if data.settings.enable_hover_effects { 1 } else { 0 },
                    data.settings.animation_speed,
                ],
            )?;

            let mut message = format!(
                "Imported {}, {}, {}, {}, {}, and {}.",
                count_noun(data.subscriptions.len(), "subscription"),
                count_noun(data.categories.len(), "category"),
                count_noun(data.payment_cards.len(), "card"),
                count_noun(data.payments.len(), "payment"),
                count_noun(data.price_history.len(), "price change"),
                count_noun(data.tags.len(), "tag"),
            );
            if normalized > 0 {
                message.push_str(&format!(
                    " Normalized {}.",
                    count_noun(normalized, "subscription record")
                ));
            }

            Ok(ImportResult {
                success: true,
                message,
            })
        })();

        match result {
            Ok(import_result) => {
                tx.commit()?;
                tracing::info!("import completed: {}", import_result.message);
                Ok(import_result)
            }
            Err(error) => {
                tracing::error!("import failed: {}", error);
                Err(KessaiCoreError::Import(format!("Import failed: {error}")))
            }
        }
    }
}

/// "1 card" / "2 cards" / "1 category" / "2 categories".
fn count_noun(count: usize, noun: &str) -> String {
    if count == 1 {
        return format!("1 {noun}");
    }
    match noun.strip_suffix('y') {
        Some(stem) if !noun.ends_with("ay") && !noun.ends_with("ey") => {
            format!("{count} {stem}ies")
        }
        _ => format!("{count} {noun}s"),
    }
}

fn unique_ids<'a>(
    ids: impl Iterator<Item = &'a str>,
    collection: &str,
) -> Result<HashSet<&'a str>> {
    let mut unique = HashSet::with_capacity(ids.size_hint().0);
    for (index, id) in ids.enumerate() {
        if id.trim().is_empty() {
            return invalid_field(collection, index, "id", "must not be empty");
        }
        if !unique.insert(id) {
            return invalid_field(collection, index, "id", "duplicates an earlier record ID");
        }
    }
    Ok(unique)
}

fn invalid_field<T>(collection: &str, index: usize, field: &str, message: &str) -> Result<T> {
    Err(KessaiCoreError::Validation(format!(
        "{collection}[{index}].{field}: {message}"
    )))
}

fn validate_field(collection: &str, index: usize, field: &str, result: Result<()>) -> Result<()> {
    result.map_err(|error| match error {
        KessaiCoreError::Validation(message) => {
            KessaiCoreError::Validation(format!("{collection}[{index}].{field}: {message}"))
        }
        other => other,
    })
}

fn validate_records(data: &BackupData) -> Result<()> {
    for (index, category) in data.categories.iter().enumerate() {
        let field = |name, result| validate_field("categories", index, name, result);
        field("name", validate_name(&category.name, "name"))?;
        field("color", validate_color(&category.color))?;
        field("icon", validate_name(&category.icon, "icon"))?;
        field(
            "created_at",
            validate_metadata_timestamp(&category.created_at),
        )?;
        let seeded = crate::migrations::SEEDED_CATEGORIES
            .iter()
            .any(|&(id, _, _, _)| id == category.id);
        if category.is_default != seeded {
            return invalid_field(
                "categories",
                index,
                "is_default",
                "must match the seeded default category ID",
            );
        }
    }
    for (index, card) in data.payment_cards.iter().enumerate() {
        let field = |name, result| validate_field("payment_cards", index, name, result);
        field("name", validate_name(&card.name, "name"))?;
        field("color", validate_color(&card.color))?;
        if let Some(digits) = &card.last_four {
            field("last_four", validate_last_four(digits))?;
        }
        if let Some(limit) = card.credit_limit {
            field("credit_limit", validate_amount(limit, "credit limit"))?;
        }
        if let Some(timestamp) = &card.created_at {
            field("created_at", validate_metadata_timestamp(timestamp))?;
        }
    }
    for (index, subscription) in data.subscriptions.iter().enumerate() {
        // Validation/preflight accepts exactly the same legacy forms as import,
        // without cloning already-normalized records or mutating the caller.
        let subscription = if subscription.needs_normalization() {
            let mut normalized = subscription.clone();
            normalized.normalize_legacy();
            Cow::Owned(normalized)
        } else {
            Cow::Borrowed(subscription)
        };
        validate_subscription(&subscription).map_err(|error| match error {
            KessaiCoreError::Validation(message) => {
                KessaiCoreError::Validation(format!("subscriptions[{index}].{message}"))
            }
            other => other,
        })?;
    }
    for (index, payment) in data.payments.iter().enumerate() {
        let field = |name, result| validate_field("payments", index, name, result);
        field("amount", validate_amount(payment.amount, "amount"))?;
        field("paid_at", validate_timestamp(&payment.paid_at, "timestamp"))?;
        field("due_date", validate_date(&payment.due_date, "date"))?;
        if let Some(notes) = &payment.notes {
            field("notes", validate_notes(notes))?;
        }
        if let Some(timestamp) = &payment.created_at {
            field("created_at", validate_metadata_timestamp(timestamp))?;
        }
    }
    for (index, change) in data.price_history.iter().enumerate() {
        let field = |name, result| validate_field("price_history", index, name, result);
        field("old_amount", validate_amount(change.old_amount, "amount"))?;
        field("new_amount", validate_amount(change.new_amount, "amount"))?;
        field("old_currency", validate_currency(&change.old_currency))?;
        field("new_currency", validate_currency(&change.new_currency))?;
        field(
            "changed_at",
            validate_metadata_timestamp(&change.changed_at),
        )?;
    }
    for (index, tag) in data.tags.iter().enumerate() {
        let field = |name, result| validate_field("tags", index, name, result);
        field("name", validate_name(&tag.name, "name"))?;
        field("color", validate_color(&tag.color))?;
        field("created_at", validate_metadata_timestamp(&tag.created_at))?;
    }

    let settings = &data.settings;
    let field = |name, result| validate_field("settings", 0, name, result);
    field("currency", validate_currency(&settings.currency))?;
    field(
        "notification_time",
        validate_notification_time(&settings.notification_time),
    )?;
    if Theme::from_str(&settings.theme).is_none() {
        return invalid_field("settings", 0, "theme", "must be dark, light, or system");
    }
    if AnimationSpeed::from_str(&settings.animation_speed).is_none() {
        return invalid_field(
            "settings",
            0,
            "animation_speed",
            "must be slow, normal, or fast",
        );
    }
    if settings.notification_advance_days < 0 {
        return invalid_field(
            "settings",
            0,
            "notification_advance_days",
            "must be non-negative",
        );
    }
    for (index, days) in settings.notification_days_before.iter().enumerate() {
        if *days < 0 {
            return invalid_field(
                "settings",
                0,
                &format!("notification_days_before[{index}]"),
                "must be non-negative",
            );
        }
    }
    if let Some(budget) = settings.monthly_budget {
        field("monthly_budget", validate_amount(budget, "amount"))?;
    }
    for (currency, rate) in &settings.display_exchange_rates {
        let result =
            validate_currency(currency).and_then(|()| validate_amount(*rate, "exchange rate"));
        if let Err(error) = result {
            return validate_field(
                "settings",
                0,
                &format!("display_exchange_rates.{currency}"),
                Err(error),
            );
        }
        if *rate == 0.0 {
            return invalid_field(
                "settings",
                0,
                &format!("display_exchange_rates.{currency}"),
                "must be greater than zero",
            );
        }
    }
    Ok(())
}
