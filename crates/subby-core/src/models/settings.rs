use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Dark,
    Light,
    System,
}

impl Theme {
    pub fn as_str(&self) -> &'static str {
        match self {
            Theme::Dark => "dark",
            Theme::Light => "light",
            Theme::System => "system",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "dark" => Some(Theme::Dark),
            "light" => Some(Theme::Light),
            "system" => Some(Theme::System),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub id: String,
    pub theme: Theme,
    pub currency: String,
    pub notification_enabled: bool,
    pub notification_days_before: Vec<i32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UpdateSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<Theme>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notification_enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notification_days_before: Option<Vec<i32>>,
}

pub const DEFAULT_SETTINGS: Settings = Settings {
    id: String::new(), // Will be set to "singleton"
    theme: Theme::Dark,
    currency: String::new(), // Will be set to "USD"
    notification_enabled: true,
    notification_days_before: Vec::new(), // Will be set to [1, 3, 7]
};

/// Returns default settings with proper values (const can't hold String/Vec with content)
pub fn default_settings() -> Settings {
    Settings {
        id: "singleton".to_string(),
        theme: Theme::Dark,
        currency: "USD".to_string(),
        notification_enabled: true,
        notification_days_before: vec![1, 3, 7],
    }
}
