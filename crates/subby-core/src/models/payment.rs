use serde::{Deserialize, Serialize};

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
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
