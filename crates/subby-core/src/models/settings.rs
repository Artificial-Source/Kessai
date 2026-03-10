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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AnimationSpeed {
    Slow,
    Normal,
    Fast,
}

impl AnimationSpeed {
    pub fn as_str(&self) -> &'static str {
        match self {
            AnimationSpeed::Slow => "slow",
            AnimationSpeed::Normal => "normal",
            AnimationSpeed::Fast => "fast",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "slow" => Some(AnimationSpeed::Slow),
            "normal" => Some(AnimationSpeed::Normal),
            "fast" => Some(AnimationSpeed::Fast),
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
    pub notification_advance_days: i32,
    pub notification_time: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub monthly_budget: Option<f64>,
    pub reduce_motion: bool,
    pub enable_transitions: bool,
    pub enable_hover_effects: bool,
    pub animation_speed: AnimationSpeed,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notification_advance_days: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notification_time: Option<String>,
    /// Use `Some(Some(value))` to set, `Some(None)` to clear.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub monthly_budget: Option<Option<f64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reduce_motion: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enable_transitions: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enable_hover_effects: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub animation_speed: Option<AnimationSpeed>,
}

pub const DEFAULT_SETTINGS: Settings = Settings {
    id: String::new(), // Will be set to "singleton"
    theme: Theme::Dark,
    currency: String::new(), // Will be set to "USD"
    notification_enabled: true,
    notification_days_before: Vec::new(), // Will be set to [1, 3, 7]
    notification_advance_days: 1,
    notification_time: String::new(), // Will be set to "09:00"
    monthly_budget: None,
    reduce_motion: false,
    enable_transitions: true,
    enable_hover_effects: true,
    animation_speed: AnimationSpeed::Normal,
};

/// Returns default settings with proper values (const can't hold String/Vec with content)
pub fn default_settings() -> Settings {
    Settings {
        id: "singleton".to_string(),
        theme: Theme::Dark,
        currency: "USD".to_string(),
        notification_enabled: true,
        notification_days_before: vec![1, 3, 7],
        notification_advance_days: 1,
        notification_time: "09:00".to_string(),
        monthly_budget: None,
        reduce_motion: false,
        enable_transitions: true,
        enable_hover_effects: true,
        animation_speed: AnimationSpeed::Normal,
    }
}
