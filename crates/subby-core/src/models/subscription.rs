use serde::{Deserialize, Serialize};

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
}

fn default_true() -> bool {
    true
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub billing_day: Option<Option<i32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub card_id: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo_url: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_active: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_payment_date: Option<Option<String>>,
}
