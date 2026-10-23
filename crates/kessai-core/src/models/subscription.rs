use serde::{Deserialize, Serialize};

use super::deserialize_double_option;

#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
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

#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
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

impl Subscription {
    /// Shared compatibility forms for persisted rows and pre-1.0 backups.
    pub(crate) fn needs_normalization(&self) -> bool {
        self.status.is_billable() != self.is_active
            || self.currency.bytes().any(|byte| byte.is_ascii_lowercase())
            || self.shared_count < 1
            || [&self.next_payment_date, &self.trial_end_date]
                .into_iter()
                .any(|date| date.as_deref().is_some_and(|date| date.contains('T')))
    }

    /// Normalize a record once, counting it once even if several fields change.
    pub(crate) fn normalize_legacy(&mut self) -> bool {
        let mut changed = self.normalize_activity();
        if self.currency.bytes().any(|byte| byte.is_ascii_lowercase()) {
            self.currency.make_ascii_uppercase();
            changed = true;
        }
        if self.shared_count < 1 {
            self.shared_count = 1;
            changed = true;
        }
        for date in [&mut self.next_payment_date, &mut self.trial_end_date]
            .into_iter()
            .flatten()
        {
            if let Some(index) = date.find('T') {
                date.truncate(index);
                changed = true;
            }
        }
        changed
    }

    /// Preserve inactive intent when legacy status and activity flags disagree.
    /// Returns whether the record changed; reading never rewrites persisted rows.
    pub(crate) fn normalize_activity(&mut self) -> bool {
        if self.status.is_billable() && !self.is_active {
            self.status = SubscriptionStatus::Paused;
            true
        } else if !self.status.is_billable() && self.is_active {
            self.is_active = false;
            true
        } else {
            false
        }
    }
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
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_double_option"
    )]
    pub billing_day: Option<Option<i32>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_double_option"
    )]
    pub category_id: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_double_option"
    )]
    pub card_id: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_double_option"
    )]
    pub color: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_double_option"
    )]
    pub logo_url: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_double_option"
    )]
    pub notes: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_active: Option<bool>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_double_option"
    )]
    pub next_payment_date: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<SubscriptionStatus>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_double_option"
    )]
    pub trial_end_date: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shared_count: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_pinned: Option<bool>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_double_option"
    )]
    pub cancellation_reason: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_double_option"
    )]
    pub cancelled_at: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_double_option"
    )]
    pub last_reviewed_at: Option<Option<String>>,
}
