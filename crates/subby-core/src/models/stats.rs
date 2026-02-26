use serde::{Deserialize, Serialize};

use super::category::Category;
use super::payment::Payment;
use super::settings::Settings;
use super::subscription::Subscription;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorySpending {
    pub id: String,
    pub name: String,
    pub color: String,
    pub amount: f64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_monthly: f64,
    pub total_yearly: f64,
    pub active_count: usize,
    pub total_count: usize,
    pub average_per_subscription: f64,
    pub category_spending: Vec<CategorySpending>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupData {
    pub version: String,
    #[serde(rename = "exportedAt")]
    pub exported_at: String,
    pub subscriptions: Vec<Subscription>,
    pub categories: Vec<Category>,
    pub payments: Vec<Payment>,
    pub settings: BackupSettings,
}

/// Settings as stored in backup (without the 'id' field)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSettings {
    pub theme: String,
    pub currency: String,
    pub notification_enabled: bool,
    pub notification_days_before: Vec<i32>,
}

impl From<&Settings> for BackupSettings {
    fn from(s: &Settings) -> Self {
        BackupSettings {
            theme: s.theme.as_str().to_string(),
            currency: s.currency.clone(),
            notification_enabled: s.notification_enabled,
            notification_days_before: s.notification_days_before.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub success: bool,
    pub message: String,
}
