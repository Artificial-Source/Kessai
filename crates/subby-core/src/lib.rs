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
    PriceHistoryService, SettingsService, SubscriptionService,
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
}
