use serde::{Deserialize, Serialize};

use super::category::Category;
use super::payment::Payment;
use super::price_history::PriceChange;
use super::settings::Settings;
use super::subscription::Subscription;
use super::tag::Tag;

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
    #[serde(default)]
    pub price_history: Vec<PriceChange>,
    #[serde(default)]
    pub tags: Vec<Tag>,
    #[serde(default)]
    pub subscription_tags: Vec<BackupSubscriptionTag>,
    pub settings: BackupSettings,
}

/// A subscription-tag mapping as stored in backup.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSubscriptionTag {
    pub subscription_id: String,
    pub tag_id: String,
}

/// Settings as stored in backup (without the 'id' field)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSettings {
    pub theme: String,
    pub currency: String,
    pub notification_enabled: bool,
    pub notification_days_before: Vec<i32>,
    #[serde(default = "default_notification_advance_days")]
    pub notification_advance_days: i32,
    #[serde(default = "default_notification_time")]
    pub notification_time: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub monthly_budget: Option<f64>,
    #[serde(default)]
    pub reduce_motion: bool,
    #[serde(default = "default_true")]
    pub enable_transitions: bool,
    #[serde(default = "default_true")]
    pub enable_hover_effects: bool,
    #[serde(default = "default_animation_speed")]
    pub animation_speed: String,
}

fn default_notification_advance_days() -> i32 {
    1
}
fn default_notification_time() -> String {
    "09:00".to_string()
}
fn default_true() -> bool {
    true
}
fn default_animation_speed() -> String {
    "normal".to_string()
}

impl From<&Settings> for BackupSettings {
    fn from(s: &Settings) -> Self {
        BackupSettings {
            theme: s.theme.as_str().to_string(),
            currency: s.currency.clone(),
            notification_enabled: s.notification_enabled,
            notification_days_before: s.notification_days_before.clone(),
            notification_advance_days: s.notification_advance_days,
            notification_time: s.notification_time.clone(),
            monthly_budget: s.monthly_budget,
            reduce_motion: s.reduce_motion,
            enable_transitions: s.enable_transitions,
            enable_hover_effects: s.enable_hover_effects,
            animation_speed: s.animation_speed.as_str().to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub success: bool,
    pub message: String,
}
