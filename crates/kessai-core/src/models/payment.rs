use serde::{Deserialize, Serialize};

use super::subscription::{BillingCycle, SubscriptionStatus};

#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PaymentStatus {
    Paid,
    Skipped,
    Pending,
}

impl PaymentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            PaymentStatus::Paid => "paid",
            PaymentStatus::Skipped => "skipped",
            PaymentStatus::Pending => "pending",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "paid" => Some(PaymentStatus::Paid),
            "skipped" => Some(PaymentStatus::Skipped),
            "pending" => Some(PaymentStatus::Pending),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payment {
    pub id: String,
    pub subscription_id: String,
    pub amount: f64,
    pub paid_at: String,
    pub due_date: String,
    pub status: PaymentStatus,
    pub notes: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewPayment {
    pub subscription_id: String,
    pub amount: f64,
    pub paid_at: String,
    pub due_date: String,
    #[serde(default = "default_paid")]
    pub status: PaymentStatus,
    #[serde(default)]
    pub notes: Option<String>,
}

fn default_paid() -> PaymentStatus {
    PaymentStatus::Paid
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UpdatePayment {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amount: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paid_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<PaymentStatus>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "super::deserialize_double_option"
    )]
    pub notes: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentWithSubscription {
    pub id: String,
    pub subscription_id: String,
    pub amount: f64,
    pub paid_at: String,
    pub due_date: String,
    pub status: PaymentStatus,
    pub notes: Option<String>,
    pub created_at: Option<String>,
    pub subscription_name: String,
    pub subscription_color: Option<String>,
    pub category_name: Option<String>,
    pub category_color: Option<String>,
}

/// A scheduled renewal or recorded ledger row. A present payment's amount and
/// status are authoritative; projected_amount is the current subscription price.
/// Duplicate historical ledger rows remain separate occurrences.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarOccurrence {
    pub subscription_id: String,
    pub due_date: String,
    pub name: String,
    pub logo_url: Option<String>,
    pub category_id: Option<String>,
    pub currency: String,
    pub billing_cycle: BillingCycle,
    pub status: SubscriptionStatus,
    pub is_active: bool,
    pub projected_amount: f64,
    pub payment: Option<Payment>,
}
