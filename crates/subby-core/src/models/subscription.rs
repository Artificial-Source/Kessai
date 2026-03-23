use serde::{Deserialize, Deserializer, Serialize};

/// Custom deserializer for `Option<Option<T>>` that properly distinguishes between:
/// - Field absent from JSON   -> `None`        (don't update)
/// - Field present as `null`  -> `Some(None)`  (set to NULL)
/// - Field present with value -> `Some(Some(value))`
///
/// Without this, serde's default treats both absent and null as `None`,
/// making it impossible to clear nullable fields via an update.
fn deserialize_double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    // If this function is called, the field was present in the JSON.
    // Deserialize the inner value as Option<T> to handle null vs value.
    Ok(Some(Option::deserialize(deserializer)?))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BillingCycle {
    Weekly,
    Monthly,
    Quarterly,
    Yearly,
    Custom,
}

impl BillingCycle {
    /// Number of billing periods per year
    pub fn yearly_multiplier(&self) -> f64 {
        match self {
            BillingCycle::Weekly => 52.0,
            BillingCycle::Monthly => 12.0,
            BillingCycle::Quarterly => 4.0,
            BillingCycle::Yearly => 1.0,
            BillingCycle::Custom => 12.0,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            BillingCycle::Weekly => "weekly",
            BillingCycle::Monthly => "monthly",
            BillingCycle::Quarterly => "quarterly",
            BillingCycle::Yearly => "yearly",
            BillingCycle::Custom => "custom",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "weekly" => Some(BillingCycle::Weekly),
            "monthly" => Some(BillingCycle::Monthly),
            "quarterly" => Some(BillingCycle::Quarterly),
            "yearly" => Some(BillingCycle::Yearly),
            "custom" => Some(BillingCycle::Custom),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SubscriptionStatus {
    Trial,
    Active,
    Paused,
    PendingCancellation,
    GracePeriod,
    Cancelled,
}

impl SubscriptionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SubscriptionStatus::Trial => "trial",
            SubscriptionStatus::Active => "active",
            SubscriptionStatus::Paused => "paused",
            SubscriptionStatus::PendingCancellation => "pending_cancellation",
            SubscriptionStatus::GracePeriod => "grace_period",
            SubscriptionStatus::Cancelled => "cancelled",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "trial" => Some(SubscriptionStatus::Trial),
            "active" => Some(SubscriptionStatus::Active),
            "paused" => Some(SubscriptionStatus::Paused),
            "pending_cancellation" => Some(SubscriptionStatus::PendingCancellation),
            "grace_period" => Some(SubscriptionStatus::GracePeriod),
            "cancelled" => Some(SubscriptionStatus::Cancelled),
            _ => None,
        }
    }

    /// Whether this status should be counted in billing totals.
    pub fn is_billable(&self) -> bool {
        matches!(
            self,
            SubscriptionStatus::Trial
                | SubscriptionStatus::Active
                | SubscriptionStatus::GracePeriod
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub id: String,
    pub name: String,
    pub amount: f64,
    pub currency: String,
    pub billing_cycle: BillingCycle,
    pub billing_day: Option<i32>,
    pub category_id: Option<String>,
    pub card_id: Option<String>,
    pub color: Option<String>,
    pub logo_url: Option<String>,
    pub notes: Option<String>,
    pub is_active: bool,
    pub next_payment_date: Option<String>,
    pub status: SubscriptionStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trial_end_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_changed_at: Option<String>,
    pub shared_count: i32,
    pub is_pinned: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancellation_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_reviewed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewSubscription {
    pub name: String,
    pub amount: f64,
    pub currency: String,
    pub billing_cycle: BillingCycle,
    #[serde(default)]
    pub billing_day: Option<i32>,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub card_id: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub logo_url: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default = "default_true")]
    pub is_active: bool,
    pub next_payment_date: Option<String>,
    #[serde(default = "default_status")]
    pub status: SubscriptionStatus,
    #[serde(default)]
    pub trial_end_date: Option<String>,
    #[serde(default = "default_shared_count")]
    pub shared_count: i32,
    #[serde(default)]
    pub is_pinned: bool,
}

fn default_true() -> bool {
    true
}

fn default_status() -> SubscriptionStatus {
    SubscriptionStatus::Active
}

fn default_shared_count() -> i32 {
    1
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UpdateSubscription {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amount: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub billing_cycle: Option<BillingCycle>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_double_option")]
    pub billing_day: Option<Option<i32>>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_double_option")]
    pub category_id: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_double_option")]
    pub card_id: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_double_option")]
    pub color: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_double_option")]
    pub logo_url: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_double_option")]
    pub notes: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_active: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_double_option")]
    pub next_payment_date: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<SubscriptionStatus>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_double_option")]
    pub trial_end_date: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shared_count: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_pinned: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_double_option")]
    pub cancellation_reason: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_double_option")]
    pub cancelled_at: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "deserialize_double_option")]
    pub last_reviewed_at: Option<Option<String>>,
}
