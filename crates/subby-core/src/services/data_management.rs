use rusqlite::params;

use crate::db::DbPool;
use crate::error::{Result, SubbyCoreError};
use crate::models::settings::Theme;
use crate::models::stats::{BackupData, BackupSettings, ImportResult};
use crate::services::category::CategoryService;
use crate::services::payment::PaymentService;
use crate::services::settings::SettingsService;
use crate::services::subscription::SubscriptionService;

pub struct DataManagementService {
    pool: DbPool,
}

impl DataManagementService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Export all data as a BackupData struct.
    pub fn export_data(&self) -> Result<BackupData> {
        let subs = SubscriptionService::new(self.pool.clone()).list()?;
        let cats = CategoryService::new(self.pool.clone()).list()?;
        let payments = PaymentService::new(self.pool.clone()).list()?;
        let settings = SettingsService::new(self.pool.clone()).get()?;

        Ok(BackupData {
            version: "1.0.0".to_string(),
            exported_at: chrono::Utc::now().to_rfc3339(),
            subscriptions: subs,
            categories: cats,
            payments,
            settings: BackupSettings::from(&settings),
        })
    }

    /// Validate that a BackupData is structurally valid.
    pub fn validate_backup(data: &BackupData) -> bool {
        if data.version.is_empty() || data.exported_at.is_empty() {
            return false;
        }
        // Size limits to prevent DoS
        if data.subscriptions.len() > 10000
            || data.categories.len() > 1000
            || data.payments.len() > 100000
        {
            return false;
        }
        true
    }

    /// Import data from a BackupData struct.
    /// Optionally clears existing data first.
    pub fn import_data(&self, data: BackupData, clear_existing: bool) -> Result<ImportResult> {
        if !Self::validate_backup(&data) {
            return Err(SubbyCoreError::Import(
                "Invalid backup data structure".to_string(),
            ));
        }

        let conn = self.pool.get()?;

        // Use a savepoint for transaction-like behavior within a single connection
        let tx = conn.unchecked_transaction()?;

        let result = (|| -> Result<ImportResult> {
            if clear_existing {
                tx.execute_batch(
                    "DELETE FROM payments;
                     DELETE FROM subscriptions;
                     DELETE FROM categories WHERE is_default = 0;",
                )?;
            }

            // Import categories (skip defaults)
            let non_default_cats: Vec<_> =
                data.categories.iter().filter(|c| !c.is_default).collect();

            for cat in &non_default_cats {
                tx.execute(
                    "INSERT OR REPLACE INTO categories (id, name, color, icon, is_default, created_at)
                     VALUES (?1, ?2, ?3, ?4, 0, ?5)",
                    params![
                        cat.id,
                        cat.name,
                        cat.color,
                        cat.icon,
                        cat.created_at,
                    ],
                )?;
            }

            // Import subscriptions
            for sub in &data.subscriptions {
                tx.execute(
                    "INSERT OR REPLACE INTO subscriptions
                     (id, name, amount, currency, billing_cycle, billing_day, next_payment_date,
                      category_id, color, logo_url, notes, is_active, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                    params![
                        sub.id,
                        sub.name,
                        sub.amount,
                        sub.currency,
                        sub.billing_cycle.as_str(),
                        sub.billing_day,
                        sub.next_payment_date,
                        sub.category_id,
                        sub.color,
                        sub.logo_url,
                        sub.notes,
                        if sub.is_active { 1 } else { 0 },
                        sub.created_at,
                        sub.updated_at,
                    ],
                )?;
            }

            // Import payments
            for payment in &data.payments {
                tx.execute(
                    "INSERT OR REPLACE INTO payments
                     (id, subscription_id, amount, paid_at, due_date, status, notes, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
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

            // Update settings
            let theme = Theme::from_str(&data.settings.theme)
                .unwrap_or(Theme::Dark)
                .as_str()
                .to_string();
            let notification_days = serde_json::to_string(&data.settings.notification_days_before)
                .unwrap_or_else(|_| "[1,3,7]".to_string());

            tx.execute(
                "UPDATE settings SET theme = ?1, currency = ?2, notification_enabled = ?3, notification_days_before = ?4 WHERE id = 'singleton'",
                params![
                    theme,
                    data.settings.currency,
                    if data.settings.notification_enabled { 1 } else { 0 },
                    notification_days,
                ],
            )?;

            let sub_count = data.subscriptions.len();
            let cat_count = non_default_cats.len();
            let pay_count = data.payments.len();

            Ok(ImportResult {
                success: true,
                message: format!(
                    "Imported {sub_count} subscriptions, {cat_count} categories, and {pay_count} payments"
                ),
            })
        })();

        match result {
            Ok(import_result) => {
                tx.commit()?;
                Ok(import_result)
            }
            Err(e) => {
                // tx drops (rolls back) on error
                Err(SubbyCoreError::Import(format!("Import failed: {e}")))
            }
        }
    }
}
