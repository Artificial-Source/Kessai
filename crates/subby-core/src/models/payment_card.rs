use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CardType {
    Credit,
    Debit,
}

impl CardType {
    pub fn as_str(&self) -> &'static str {
        match self {
            CardType::Credit => "credit",
            CardType::Debit => "debit",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "credit" => Some(CardType::Credit),
            "debit" => Some(CardType::Debit),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentCard {
    pub id: String,
    pub name: String,
    pub card_type: CardType,
    pub last_four: Option<String>,
    pub color: String,
    pub credit_limit: Option<f64>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewPaymentCard {
    pub name: String,
    pub card_type: CardType,
    #[serde(default)]
    pub last_four: Option<String>,
    #[serde(default = "default_card_color")]
    pub color: String,
    #[serde(default)]
    pub credit_limit: Option<f64>,
}

fn default_card_color() -> String {
    "#6b7280".to_string()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UpdatePaymentCard {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub card_type: Option<CardType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_four: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credit_limit: Option<Option<f64>>,
}
