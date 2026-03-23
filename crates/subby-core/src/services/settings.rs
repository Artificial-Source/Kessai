use crate::db::DbPool;
use crate::error::Result;
use crate::models::settings::{default_settings, AnimationSpeed, Settings, Theme, UpdateSettings};

pub struct SettingsService {
    pool: DbPool,
}

impl SettingsService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Get the singleton settings row.
    /// Returns default settings if no row exists.
    pub fn get(&self) -> Result<Settings> {
        let conn = self.pool.get()?;
        let result = conn.query_row(
            "SELECT id, theme, currency, notification_enabled, notification_days_before, monthly_budget,
                    reduce_motion, enable_transitions, enable_hover_effects, animation_speed,
                    notification_advance_days, notification_time
             FROM settings WHERE id = 'singleton'",
            [],
            |row| {
                let notification_days_str: String = row.get(4)?;
                let notification_days: Vec<i32> =
                    serde_json::from_str(&notification_days_str).unwrap_or_else(|_| vec![1, 3, 7]);

                let theme_str: String = row.get(1)?;
                let animation_speed_str: String = row.get(9)?;
                Ok(Settings {
                    id: row.get(0)?,
                    theme: Theme::from_str(&theme_str).unwrap_or(Theme::Dark),
                    currency: row.get(2)?,
                    notification_enabled: row.get::<_, i32>(3)? != 0,
                    notification_days_before: notification_days,
                    notification_advance_days: row.get::<_, i32>(10).unwrap_or(1),
                    notification_time: row.get::<_, String>(11).unwrap_or_else(|_| "09:00".to_string()),
                    monthly_budget: row.get(5)?,
                    reduce_motion: row.get::<_, i32>(6)? != 0,
                    enable_transitions: row.get::<_, i32>(7)? != 0,
                    enable_hover_effects: row.get::<_, i32>(8)? != 0,
                    animation_speed: AnimationSpeed::from_str(&animation_speed_str)
                        .unwrap_or(AnimationSpeed::Normal),
                })
            },
        );

        match result {
            Ok(settings) => Ok(settings),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(default_settings()),
            Err(e) => Err(e.into()),
        }
    }

    /// Update settings. Only provided fields are modified.
    #[tracing::instrument(skip(self, data))]
    pub fn update(&self, data: UpdateSettings) -> Result<Settings> {
        tracing::info!("updating settings");
        let conn = self.pool.get()?;

        let mut sets = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref theme) = data.theme {
            sets.push("theme = ?");
            values.push(Box::new(theme.as_str().to_string()));
        }
        if let Some(ref currency) = data.currency {
            sets.push("currency = ?");
            values.push(Box::new(currency.clone()));
        }
        if let Some(enabled) = data.notification_enabled {
            sets.push("notification_enabled = ?");
            values.push(Box::new(if enabled { 1i32 } else { 0 }));
        }
        if let Some(ref days) = data.notification_days_before {
            sets.push("notification_days_before = ?");
            values.push(Box::new(serde_json::to_string(days)?));
        }
        if let Some(ref budget) = data.monthly_budget {
            sets.push("monthly_budget = ?");
            values.push(Box::new(*budget));
        }
        if let Some(reduce_motion) = data.reduce_motion {
            sets.push("reduce_motion = ?");
            values.push(Box::new(if reduce_motion { 1i32 } else { 0 }));
        }
        if let Some(enable_transitions) = data.enable_transitions {
            sets.push("enable_transitions = ?");
            values.push(Box::new(if enable_transitions { 1i32 } else { 0 }));
        }
        if let Some(enable_hover_effects) = data.enable_hover_effects {
            sets.push("enable_hover_effects = ?");
            values.push(Box::new(if enable_hover_effects { 1i32 } else { 0 }));
        }
        if let Some(ref speed) = data.animation_speed {
            sets.push("animation_speed = ?");
            values.push(Box::new(speed.as_str().to_string()));
        }
        if let Some(advance_days) = data.notification_advance_days {
            sets.push("notification_advance_days = ?");
            values.push(Box::new(advance_days));
        }
        if let Some(ref time) = data.notification_time {
            sets.push("notification_time = ?");
            values.push(Box::new(time.clone()));
        }

        if sets.is_empty() {
            return self.get();
        }

        values.push(Box::new("singleton".to_string()));

        let sql = format!("UPDATE settings SET {} WHERE id = ?", sets.join(", "));

        let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&sql, params.as_slice())?;

        self.get()
    }
}
