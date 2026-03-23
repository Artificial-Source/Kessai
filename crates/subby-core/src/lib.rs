pub mod db;
pub mod error;
pub mod migrations;
pub mod models;
pub mod services;
pub mod utils;

use std::path::Path;

use db::DbPool;
use error::Result;
use services::{
    CategoryService, DataManagementService, PaymentCardService, PaymentService,
    PriceHistoryService, SettingsService, SubscriptionService, TagService,
};

/// Top-level API for the Subby core library.
///
/// Owns the database connection pool and provides access to all services.
/// Thread-safe — can be shared across threads (e.g., Tauri state, MCP handlers).
#[derive(Clone)]
pub struct SubbyCore {
    pool: DbPool,
}

impl SubbyCore {
    /// Create a new SubbyCore instance.
    ///
    /// - Opens/creates the SQLite database at `db_path`
    /// - Runs all pending migrations
    /// - Returns a ready-to-use instance
    pub fn new(db_path: &Path) -> Result<Self> {
        let pool = db::create_pool(db_path)?;

        // Run migrations on a dedicated connection
        {
            let conn = pool.get()?;
            migrations::run_migrations(&conn)?;
        }

        Ok(Self { pool })
    }

    pub fn subscriptions(&self) -> SubscriptionService {
        SubscriptionService::new(self.pool.clone())
    }

    pub fn categories(&self) -> CategoryService {
        CategoryService::new(self.pool.clone())
    }

    pub fn payments(&self) -> PaymentService {
        PaymentService::new(self.pool.clone())
    }

    pub fn payment_cards(&self) -> PaymentCardService {
        PaymentCardService::new(self.pool.clone())
    }

    pub fn settings(&self) -> SettingsService {
        SettingsService::new(self.pool.clone())
    }

    pub fn price_history(&self) -> PriceHistoryService {
        PriceHistoryService::new(self.pool.clone())
    }

    pub fn tags(&self) -> TagService {
        TagService::new(self.pool.clone())
    }

    pub fn data_management(&self) -> DataManagementService {
        DataManagementService::new(self.pool.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_subby_core_creates_and_initializes() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        // Should have 9 default categories
        let categories = core.categories().list().unwrap();
        assert_eq!(categories.len(), 9);

        // Should have default settings
        let settings = core.settings().get().unwrap();
        assert_eq!(settings.currency, "USD");

        // Should have no subscriptions initially
        let subs = core.subscriptions().list().unwrap();
        assert!(subs.is_empty());
    }

    #[test]
    fn test_subscription_crud() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        // Create
        let sub = core
            .subscriptions()
            .create(models::NewSubscription {
                name: "Netflix".to_string(),
                amount: 15.99,
                currency: "USD".to_string(),
                billing_cycle: models::BillingCycle::Monthly,
                billing_day: Some(15),
                category_id: Some("cat-streaming".to_string()),
                card_id: None,
                color: Some("#e50914".to_string()),
                logo_url: None,
                notes: None,
                is_active: true,
                next_payment_date: Some("2026-03-15".to_string()),
                status: models::SubscriptionStatus::Active,
                trial_end_date: None,
                shared_count: 1,
                is_pinned: false,
            })
            .unwrap();

        assert_eq!(sub.name, "Netflix");
        assert_eq!(sub.amount, 15.99);
        assert!(sub.is_active);
        assert_eq!(sub.status, models::SubscriptionStatus::Active);
        assert_eq!(sub.shared_count, 1);

        // Read
        let fetched = core.subscriptions().get(&sub.id).unwrap();
        assert_eq!(fetched.name, "Netflix");

        // Update
        let updated = core
            .subscriptions()
            .update(
                &sub.id,
                models::UpdateSubscription {
                    amount: Some(17.99),
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(updated.amount, 17.99);

        // Toggle active (Active → Paused)
        let toggled = core.subscriptions().toggle_active(&sub.id).unwrap();
        assert!(!toggled.is_active);
        assert_eq!(toggled.status, models::SubscriptionStatus::Paused);

        // Toggle active again (Paused → Active)
        let toggled2 = core.subscriptions().toggle_active(&sub.id).unwrap();
        assert!(toggled2.is_active);
        assert_eq!(toggled2.status, models::SubscriptionStatus::Active);

        // Delete
        core.subscriptions().delete(&sub.id).unwrap();
        assert!(core.subscriptions().get(&sub.id).is_err());
    }

    #[test]
    fn test_category_crud() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        // Create custom category
        let cat = core
            .categories()
            .create(models::NewCategory {
                name: "Education".to_string(),
                color: "#4f46e5".to_string(),
                icon: "book".to_string(),
            })
            .unwrap();

        assert_eq!(cat.name, "Education");
        assert!(!cat.is_default);

        // Update
        let updated = core
            .categories()
            .update(
                &cat.id,
                models::UpdateCategory {
                    name: Some("Learning".to_string()),
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(updated.name, "Learning");

        // Delete custom category
        core.categories().delete(&cat.id).unwrap();

        // Cannot delete default category
        let err = core.categories().delete("cat-streaming");
        assert!(err.is_err());
    }

    #[test]
    fn test_payment_flow() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        // Create a subscription first
        let sub = core
            .subscriptions()
            .create(models::NewSubscription {
                name: "Spotify".to_string(),
                amount: 9.99,
                currency: "USD".to_string(),
                billing_cycle: models::BillingCycle::Monthly,
                billing_day: None,
                category_id: Some("cat-music".to_string()),
                card_id: None,
                color: None,
                logo_url: None,
                notes: None,
                is_active: true,
                next_payment_date: Some("2026-03-01".to_string()),
                status: models::SubscriptionStatus::Active,
                trial_end_date: None,
                shared_count: 1,
                is_pinned: false,
            })
            .unwrap();

        // Mark as paid
        let payment = core
            .payments()
            .mark_as_paid(&sub.id, "2026-03-01", 9.99)
            .unwrap();
        assert_eq!(payment.status, models::PaymentStatus::Paid);

        // Check is_recorded
        assert!(core.payments().is_recorded(&sub.id, "2026-03-01").unwrap());
        assert!(!core.payments().is_recorded(&sub.id, "2026-04-01").unwrap());

        // Skip a payment
        let skipped = core
            .payments()
            .skip_payment(&sub.id, "2026-04-01", 9.99)
            .unwrap();
        assert_eq!(skipped.status, models::PaymentStatus::Skipped);

        // List by month
        let march_payments = core.payments().list_by_month(2026, 3).unwrap();
        assert_eq!(march_payments.len(), 1);
    }

    #[test]
    fn test_payment_card_crud() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        let card = core
            .payment_cards()
            .create(models::NewPaymentCard {
                name: "Chase Sapphire".to_string(),
                card_type: models::CardType::Credit,
                last_four: Some("4242".to_string()),
                color: "#003087".to_string(),
                credit_limit: Some(10000.0),
            })
            .unwrap();

        assert_eq!(card.name, "Chase Sapphire");

        // Create subscription with card
        let sub = core
            .subscriptions()
            .create(models::NewSubscription {
                name: "Netflix".to_string(),
                amount: 15.99,
                currency: "USD".to_string(),
                billing_cycle: models::BillingCycle::Monthly,
                billing_day: None,
                category_id: None,
                card_id: Some(card.id.clone()),
                color: None,
                logo_url: None,
                notes: None,
                is_active: true,
                next_payment_date: None,
                status: models::SubscriptionStatus::Active,
                trial_end_date: None,
                shared_count: 1,
                is_pinned: false,
            })
            .unwrap();

        // Delete card should cascade (set card_id = NULL on subscriptions)
        core.payment_cards().delete(&card.id).unwrap();
        let sub_after = core.subscriptions().get(&sub.id).unwrap();
        assert!(sub_after.card_id.is_none());
    }

    #[test]
    fn test_settings() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        let settings = core.settings().get().unwrap();
        assert_eq!(settings.currency, "USD");

        let updated = core
            .settings()
            .update(models::UpdateSettings {
                currency: Some("EUR".to_string()),
                theme: Some(models::Theme::Light),
                ..Default::default()
            })
            .unwrap();

        assert_eq!(updated.currency, "EUR");
        assert_eq!(updated.theme, models::Theme::Light);
    }

    #[test]
    fn test_data_export_import() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        // Create some data
        core.subscriptions()
            .create(models::NewSubscription {
                name: "Test Sub".to_string(),
                amount: 10.0,
                currency: "USD".to_string(),
                billing_cycle: models::BillingCycle::Monthly,
                billing_day: None,
                category_id: None,
                card_id: None,
                color: None,
                logo_url: None,
                notes: None,
                is_active: true,
                next_payment_date: None,
                status: models::SubscriptionStatus::Active,
                trial_end_date: None,
                shared_count: 1,
                is_pinned: false,
            })
            .unwrap();

        // Export
        let backup = core.data_management().export_data().unwrap();
        assert_eq!(backup.subscriptions.len(), 1);
        assert_eq!(backup.categories.len(), 9);

        // Import into fresh DB
        let tmp2 = tempfile::NamedTempFile::new().unwrap();
        let core2 = SubbyCore::new(tmp2.path()).unwrap();

        let result = core2.data_management().import_data(backup, true).unwrap();
        assert!(result.success);

        let subs = core2.subscriptions().list().unwrap();
        assert_eq!(subs.len(), 1);
        assert_eq!(subs[0].name, "Test Sub");
    }

    #[test]
    fn test_delete_nonexistent_subscription_returns_error() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        let result = core.subscriptions().delete("nonexistent-id");
        assert!(result.is_err());
    }

    #[test]
    fn test_data_import_merge_without_clear() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        // Create a subscription in source DB
        core.subscriptions()
            .create(models::NewSubscription {
                name: "Source Sub".to_string(),
                amount: 5.0,
                currency: "USD".to_string(),
                billing_cycle: models::BillingCycle::Monthly,
                billing_day: None,
                category_id: None,
                card_id: None,
                color: None,
                logo_url: None,
                notes: None,
                is_active: true,
                next_payment_date: None,
                status: models::SubscriptionStatus::Active,
                trial_end_date: None,
                shared_count: 1,
                is_pinned: false,
            })
            .unwrap();

        let backup = core.data_management().export_data().unwrap();

        // Create target DB with its own subscription
        let tmp2 = tempfile::NamedTempFile::new().unwrap();
        let core2 = SubbyCore::new(tmp2.path()).unwrap();

        core2
            .subscriptions()
            .create(models::NewSubscription {
                name: "Existing Sub".to_string(),
                amount: 20.0,
                currency: "USD".to_string(),
                billing_cycle: models::BillingCycle::Monthly,
                billing_day: None,
                category_id: None,
                card_id: None,
                color: None,
                logo_url: None,
                notes: None,
                is_active: true,
                next_payment_date: None,
                status: models::SubscriptionStatus::Active,
                trial_end_date: None,
                shared_count: 1,
                is_pinned: false,
            })
            .unwrap();

        // Import WITHOUT clearing — should merge
        let result = core2.data_management().import_data(backup, false).unwrap();
        assert!(result.success);

        let subs = core2.subscriptions().list().unwrap();
        // Should have both: existing + imported
        assert_eq!(subs.len(), 2);
    }

    #[test]
    fn test_data_export_produces_valid_structure() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        let backup = core.data_management().export_data().unwrap();

        assert_eq!(backup.version, "1.1.0");
        assert!(!backup.exported_at.is_empty());
        assert_eq!(backup.categories.len(), 9); // default categories
        assert!(backup.subscriptions.is_empty());
        assert!(backup.payments.is_empty());
        assert_eq!(backup.settings.currency, "USD");
    }

    #[test]
    fn test_price_history_record_and_list() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        // Create a subscription first
        let sub = core
            .subscriptions()
            .create(models::NewSubscription {
                name: "Netflix".to_string(),
                amount: 15.99,
                currency: "USD".to_string(),
                billing_cycle: models::BillingCycle::Monthly,
                billing_day: None,
                category_id: None,
                card_id: None,
                color: None,
                logo_url: None,
                notes: None,
                is_active: true,
                next_payment_date: None,
                status: models::SubscriptionStatus::Active,
                trial_end_date: None,
                shared_count: 1,
                is_pinned: false,
            })
            .unwrap();

        // Record a price change
        let change = core
            .price_history()
            .record(&sub.id, 15.99, 17.99, "USD", "USD")
            .unwrap();

        assert_eq!(change.old_amount, 15.99);
        assert_eq!(change.new_amount, 17.99);
        assert_eq!(change.subscription_id, sub.id);

        // Record another
        core.price_history()
            .record(&sub.id, 17.99, 19.99, "USD", "USD")
            .unwrap();

        // List by subscription
        let history = core.price_history().list_by_subscription(&sub.id).unwrap();
        assert_eq!(history.len(), 2);
        // Most recent first
        assert_eq!(history[0].new_amount, 19.99);
        assert_eq!(history[1].new_amount, 17.99);

        // List recent (within 90 days)
        let recent = core.price_history().list_recent(90).unwrap();
        assert_eq!(recent.len(), 2);

        // List all
        let all = core.price_history().list().unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_price_history_empty_for_no_changes() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        let history = core
            .price_history()
            .list_by_subscription("nonexistent")
            .unwrap();
        assert!(history.is_empty());

        let recent = core.price_history().list_recent(90).unwrap();
        assert!(recent.is_empty());
    }

    #[test]
    fn test_expiring_trials() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        // Create a trial subscription expiring in 3 days
        let future_date = (chrono::Utc::now() + chrono::Duration::days(3))
            .format("%Y-%m-%d")
            .to_string();
        let sub = core
            .subscriptions()
            .create(models::NewSubscription {
                name: "Trial App".to_string(),
                amount: 9.99,
                currency: "USD".to_string(),
                billing_cycle: models::BillingCycle::Monthly,
                billing_day: None,
                category_id: None,
                card_id: None,
                color: None,
                logo_url: None,
                notes: None,
                is_active: true,
                next_payment_date: None,
                status: models::SubscriptionStatus::Trial,
                trial_end_date: Some(future_date),
                shared_count: 1,
                is_pinned: false,
            })
            .unwrap();

        assert_eq!(sub.status, models::SubscriptionStatus::Trial);

        // Get expiring trials within 7 days
        let subs = core.subscriptions().list().unwrap();
        let expiring = utils::get_expiring_trials(&subs, 7);
        assert_eq!(expiring.len(), 1);
        assert_eq!(expiring[0].name, "Trial App");

        // Within 1 day should not include this (3 days away)
        let expiring_1d = utils::get_expiring_trials(&subs, 1);
        assert!(expiring_1d.is_empty());
    }

    #[test]
    fn test_settings_export_import_preserves_all_fields() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        // Update settings with non-default values
        core.settings()
            .update(models::UpdateSettings {
                currency: Some("EUR".to_string()),
                reduce_motion: Some(true),
                enable_transitions: Some(false),
                enable_hover_effects: Some(false),
                animation_speed: Some(models::AnimationSpeed::Slow),
                notification_advance_days: Some(3),
                notification_time: Some("14:30".to_string()),
                monthly_budget: Some(Some(150.0)),
                ..Default::default()
            })
            .unwrap();

        // Export
        let backup = core.data_management().export_data().unwrap();
        assert_eq!(backup.settings.currency, "EUR");
        assert!(backup.settings.reduce_motion);
        assert!(!backup.settings.enable_transitions);
        assert!(!backup.settings.enable_hover_effects);
        assert_eq!(backup.settings.animation_speed, "slow");
        assert_eq!(backup.settings.notification_advance_days, 3);
        assert_eq!(backup.settings.notification_time, "14:30");
        assert_eq!(backup.settings.monthly_budget, Some(150.0));

        // Import into fresh DB
        let tmp2 = tempfile::NamedTempFile::new().unwrap();
        let core2 = SubbyCore::new(tmp2.path()).unwrap();

        let result = core2.data_management().import_data(backup, true).unwrap();
        assert!(result.success);

        // Verify all settings are restored
        let settings = core2.settings().get().unwrap();
        assert_eq!(settings.currency, "EUR");
        assert!(settings.reduce_motion);
        assert!(!settings.enable_transitions);
        assert!(!settings.enable_hover_effects);
        assert_eq!(settings.animation_speed, models::AnimationSpeed::Slow);
        assert_eq!(settings.notification_advance_days, 3);
        assert_eq!(settings.notification_time, "14:30");
        assert_eq!(settings.monthly_budget, Some(150.0));
    }

    #[test]
    fn test_subscription_status_transitions() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        let sub = core
            .subscriptions()
            .create(models::NewSubscription {
                name: "Test".to_string(),
                amount: 10.0,
                currency: "USD".to_string(),
                billing_cycle: models::BillingCycle::Monthly,
                billing_day: None,
                category_id: None,
                card_id: None,
                color: None,
                logo_url: None,
                notes: None,
                is_active: true,
                next_payment_date: None,
                status: models::SubscriptionStatus::Active,
                trial_end_date: None,
                shared_count: 1,
                is_pinned: false,
            })
            .unwrap();

        // Active → PendingCancellation
        let updated = core
            .subscriptions()
            .transition_status(&sub.id, models::SubscriptionStatus::PendingCancellation)
            .unwrap();
        assert_eq!(updated.status, models::SubscriptionStatus::PendingCancellation);

        // PendingCancellation → Cancelled
        let cancelled = core
            .subscriptions()
            .transition_status(&sub.id, models::SubscriptionStatus::Cancelled)
            .unwrap();
        assert_eq!(cancelled.status, models::SubscriptionStatus::Cancelled);
        assert!(!cancelled.is_active);
    }

    #[test]
    fn test_price_history_included_in_export() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let core = SubbyCore::new(tmp.path()).unwrap();

        let sub = core
            .subscriptions()
            .create(models::NewSubscription {
                name: "Spotify".to_string(),
                amount: 9.99,
                currency: "USD".to_string(),
                billing_cycle: models::BillingCycle::Monthly,
                billing_day: None,
                category_id: None,
                card_id: None,
                color: None,
                logo_url: None,
                notes: None,
                is_active: true,
                next_payment_date: None,
                status: models::SubscriptionStatus::Active,
                trial_end_date: None,
                shared_count: 1,
                is_pinned: false,
            })
            .unwrap();

        core.price_history()
            .record(&sub.id, 9.99, 10.99, "USD", "USD")
            .unwrap();

        let backup = core.data_management().export_data().unwrap();
        assert_eq!(backup.price_history.len(), 1);
        assert_eq!(backup.price_history[0].old_amount, 9.99);
        assert_eq!(backup.price_history[0].new_amount, 10.99);
    }
}
