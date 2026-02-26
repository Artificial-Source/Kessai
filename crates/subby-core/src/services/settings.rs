use crate::db::DbPool;
use crate::error::Result;
use crate::models::settings::{default_settings, Settings, Theme, UpdateSettings};

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
            "SELECT id, theme, currency, notification_enabled, notification_days_before, monthly_budget
             FROM settings WHERE id = 'singleton'",
            [],
            |row| {
                let notification_days_str: String = row.get(4)?;
                let notification_days: Vec<i32> =
                    serde_json::from_str(&notification_days_str).unwrap_or_else(|_| vec![1, 3, 7]);

                let theme_str: String = row.get(1)?;
                Ok(Settings {
                    id: row.get(0)?,
                    theme: Theme::from_str(&theme_str).unwrap_or(Theme::Dark),
                    currency: row.get(2)?,
                    notification_enabled: row.get::<_, i32>(3)? != 0,
                    notification_days_before: notification_days,
                    monthly_budget: row.get(5)?,
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
    pub fn update(&self, data: UpdateSettings) -> Result<Settings> {
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
