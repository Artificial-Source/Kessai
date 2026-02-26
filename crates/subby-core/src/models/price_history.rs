use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceChange {
    pub id: String,
    pub subscription_id: String,
    pub old_amount: f64,
    pub new_amount: f64,
    pub old_currency: String,
    pub new_currency: String,
    pub changed_at: String,
}
