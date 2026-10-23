//! Durable write invariants shared by core services and import/protocol boundaries.
//!
//! Names are limited to 100 Unicode characters and notes to 500. Dates require
//! the exact ISO calendar form, currencies three uppercase ASCII letters, and
//! colors `#RRGGBB`. Validation never silently clamps or rewrites user input.

use crate::error::{KessaiCoreError, Result};

pub const MAX_NAME_LENGTH: usize = 100;
pub const MAX_NOTES_LENGTH: usize = 500;

pub fn validate_amount(value: f64, field: &str) -> Result<()> {
    if !value.is_finite() || value < 0.0 {
        return Err(KessaiCoreError::Validation(format!(
            "{field} must be finite and greater than or equal to zero"
        )));
    }
    Ok(())
}

pub fn validate_name(value: &str, field: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(KessaiCoreError::Validation(format!(
            "{field} must not be empty"
        )));
    }
    if value.chars().count() > MAX_NAME_LENGTH {
        return Err(KessaiCoreError::Validation(format!(
            "{field} must be at most {MAX_NAME_LENGTH} characters"
        )));
    }
    Ok(())
}

pub fn validate_date(value: &str, field: &str) -> Result<()> {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !bytes
            .iter()
            .enumerate()
            .all(|(i, b)| i == 4 || i == 7 || b.is_ascii_digit())
        || chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_err()
    {
        return Err(KessaiCoreError::Validation(format!(
            "{field} must be a valid YYYY-MM-DD date"
        )));
    }
    Ok(())
}

pub fn validate_currency(value: &str) -> Result<()> {
    if value.len() != 3 || !value.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err(KessaiCoreError::Validation(
            "currency must be a 3-letter uppercase code".into(),
        ));
    }
    Ok(())
}

pub fn validate_billing_day(value: i32) -> Result<()> {
    if !(1..=31).contains(&value) {
        return Err(KessaiCoreError::Validation(
            "billing day must be from 1 to 31".into(),
        ));
    }
    Ok(())
}

pub fn validate_shared_count(value: i32) -> Result<()> {
    if value < 1 {
        return Err(KessaiCoreError::Validation(
            "shared count must be at least 1".into(),
        ));
    }
    Ok(())
}

pub fn validate_color(value: &str) -> Result<()> {
    let bytes = value.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' || !bytes[1..].iter().all(u8::is_ascii_hexdigit) {
        return Err(KessaiCoreError::Validation(
            "color must be a #RRGGBB hex value".into(),
        ));
    }
    Ok(())
}

pub fn validate_notes(value: &str) -> Result<()> {
    if value.chars().count() > MAX_NOTES_LENGTH {
        return Err(KessaiCoreError::Validation(format!(
            "notes must be at most {MAX_NOTES_LENGTH} characters"
        )));
    }
    Ok(())
}

pub fn validate_notification_time(value: &str) -> Result<()> {
    let bytes = value.as_bytes();
    if bytes.len() != 5
        || bytes[2] != b':'
        || !bytes
            .iter()
            .enumerate()
            .all(|(i, b)| i == 2 || b.is_ascii_digit())
        || chrono::NaiveTime::parse_from_str(value, "%H:%M").is_err()
    {
        return Err(KessaiCoreError::Validation(
            "notification time must be HH:MM".into(),
        ));
    }
    Ok(())
}

pub fn validate_timestamp(value: &str, field: &str) -> Result<()> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|_| ())
        .map_err(|_| KessaiCoreError::Validation(format!("{field} must be an RFC 3339 timestamp")))
}

// SQLite's original CURRENT_TIMESTAMP defaults are part of existing records.
// Payment paid_at still requires RFC 3339 rather than this metadata-only form.
pub(crate) fn validate_metadata_timestamp(value: &str) -> Result<()> {
    if value.len() == 19
        && chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S").is_ok()
    {
        return Ok(());
    }
    validate_timestamp(value, "timestamp")
}

/// Full durable record validation shared by merged updates and backup records.
/// Field prefixes let backup validation add the collection/index without
/// maintaining a different set of subscription invariants.
pub(crate) fn validate_subscription(
    subscription: &crate::models::subscription::Subscription,
) -> Result<()> {
    let field = |name: &str, result: Result<()>| {
        result.map_err(|error| match error {
            KessaiCoreError::Validation(message) => {
                KessaiCoreError::Validation(format!("{name}: {message}"))
            }
            other => other,
        })
    };
    field("name", validate_name(&subscription.name, "name"))?;
    field("amount", validate_amount(subscription.amount, "amount"))?;
    field("currency", validate_currency(&subscription.currency))?;
    field(
        "shared_count",
        validate_shared_count(subscription.shared_count),
    )?;
    if let Some(day) = subscription.billing_day {
        field("billing_day", validate_billing_day(day))?;
    }
    if let Some(color) = &subscription.color {
        field("color", validate_color(color))?;
    }
    if let Some(notes) = &subscription.notes {
        field("notes", validate_notes(notes))?;
    }
    if let Some(reason) = &subscription.cancellation_reason {
        field("cancellation_reason", validate_notes(reason))?;
    }
    if let Some(date) = &subscription.next_payment_date {
        field(
            "next_payment_date",
            validate_date(date, "next payment date"),
        )?;
    }
    if let Some(date) = &subscription.trial_end_date {
        field("trial_end_date", validate_date(date, "trial end date"))?;
    }
    for (name, timestamp) in [
        ("status_changed_at", &subscription.status_changed_at),
        ("cancelled_at", &subscription.cancelled_at),
        ("last_reviewed_at", &subscription.last_reviewed_at),
    ] {
        if let Some(timestamp) = timestamp {
            field(name, validate_metadata_timestamp(timestamp))?;
        }
    }
    field(
        "created_at",
        validate_metadata_timestamp(&subscription.created_at),
    )?;
    field(
        "updated_at",
        validate_metadata_timestamp(&subscription.updated_at),
    )
}

pub fn validate_last_four(value: &str) -> Result<()> {
    if value.len() != 4 || !value.bytes().all(|b| b.is_ascii_digit()) {
        return Err(KessaiCoreError::Validation(
            "last four must contain exactly four digits".into(),
        ));
    }
    Ok(())
}

/// Day windows match the existing CLI/MCP range and avoid date-duration overflow.
pub fn validate_days(value: i64) -> Result<()> {
    if !(0..=36_500).contains(&value) {
        return Err(KessaiCoreError::Validation(
            "days must be from 0 to 36500".into(),
        ));
    }
    Ok(())
}
