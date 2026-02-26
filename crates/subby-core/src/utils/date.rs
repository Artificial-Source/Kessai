use chrono::{Datelike, Duration, NaiveDate, Utc};

use crate::models::subscription::{BillingCycle, Subscription, SubscriptionStatus};

/// Calculates the next payment date from a start date, advancing by billing cycle
/// until the date is in the future (after today).
pub fn calculate_next_payment_date(
    start_date: NaiveDate,
    cycle: &BillingCycle,
    billing_day: Option<i32>,
) -> NaiveDate {
    let today = Utc::now().date_naive();
    let mut next = start_date;

    while next <= today {
        next = advance_by_cycle(next, cycle, billing_day);
    }

    next
}

/// Advances a date by one billing cycle period.
fn advance_by_cycle(date: NaiveDate, cycle: &BillingCycle, billing_day: Option<i32>) -> NaiveDate {
    match cycle {
        BillingCycle::Weekly => date + Duration::weeks(1),
        BillingCycle::Monthly | BillingCycle::Custom => {
            let next = add_months(date, 1);
            if let Some(day) = billing_day {
                let max_day = days_in_month(next.year(), next.month());
                let target_day = day.min(max_day as i32).max(1) as u32;
                NaiveDate::from_ymd_opt(next.year(), next.month(), target_day).unwrap_or(next)
            } else {
                next
            }
        }
        BillingCycle::Quarterly => add_months(date, 3),
        BillingCycle::Yearly => add_months(date, 12),
    }
}

/// Adds N months to a date, clamping to the last day of the target month if needed.
fn add_months(date: NaiveDate, months: u32) -> NaiveDate {
    let total_months = date.year() * 12 + date.month() as i32 - 1 + months as i32;
    let target_year = total_months / 12;
    let target_month = (total_months % 12 + 1) as u32;
    let max_day = days_in_month(target_year, target_month);
    let target_day = date.day().min(max_day);
    NaiveDate::from_ymd_opt(target_year, target_month, target_day)
        .unwrap_or_else(|| NaiveDate::from_ymd_opt(target_year, target_month, 1).unwrap())
}

/// Returns the number of days in a given month/year.
fn days_in_month(year: i32, month: u32) -> u32 {
    // Use the first day of the next month minus one day
    let next_month = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
    };
    next_month
        .map(|d| d.pred_opt().map(|p| p.day()).unwrap_or(28))
        .unwrap_or(28)
}

/// Converts an amount to its monthly equivalent based on billing cycle.
pub fn calculate_monthly_amount(amount: f64, cycle: &BillingCycle) -> f64 {
    calculate_yearly_amount(amount, cycle) / 12.0
}

/// Converts an amount to its yearly equivalent based on billing cycle.
pub fn calculate_yearly_amount(amount: f64, cycle: &BillingCycle) -> f64 {
    amount * cycle.yearly_multiplier()
}

/// Filters subscriptions to those with payment dates within the next N days.
pub fn get_upcoming_subscriptions(subscriptions: &[Subscription], days: i64) -> Vec<&Subscription> {
    let today = Utc::now().date_naive();
    let cutoff = today + Duration::days(days);

    let mut upcoming: Vec<&Subscription> = subscriptions
        .iter()
        .filter(|sub| {
            if let Some(ref date_str) = sub.next_payment_date {
                if let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                    return date >= today && date <= cutoff;
                }
                // Try ISO datetime format
                if let Ok(date) = date_str.parse::<chrono::NaiveDateTime>() {
                    let d = date.date();
                    return d >= today && d <= cutoff;
                }
            }
            false
        })
        .collect();

    upcoming.sort_by(|a, b| {
        a.next_payment_date
            .as_deref()
            .cmp(&b.next_payment_date.as_deref())
    });

    upcoming
}

/// Returns the number of days until a trial ends, or None if no trial_end_date.
pub fn days_until_trial_end(trial_end_date: &str) -> Option<i64> {
    let today = Utc::now().date_naive();
    if let Ok(end) = NaiveDate::parse_from_str(trial_end_date, "%Y-%m-%d") {
        Some((end - today).num_days())
    } else if let Ok(dt) = trial_end_date.parse::<chrono::NaiveDateTime>() {
        Some((dt.date() - today).num_days())
    } else {
        None
    }
}

/// Returns subscriptions that are in trial status with trials expiring within N days.
pub fn get_expiring_trials(subscriptions: &[Subscription], days: i64) -> Vec<&Subscription> {
    let mut trials: Vec<&Subscription> = subscriptions
        .iter()
        .filter(|sub| {
            sub.status == SubscriptionStatus::Trial
                && sub
                    .trial_end_date
                    .as_deref()
                    .and_then(days_until_trial_end)
                    .map(|d| d >= 0 && d <= days)
                    .unwrap_or(false)
        })
        .collect();

    trials.sort_by(|a, b| a.trial_end_date.cmp(&b.trial_end_date));
    trials
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_monthly_amount() {
        assert!((calculate_monthly_amount(10.0, &BillingCycle::Monthly) - 10.0).abs() < 0.01);
        assert!((calculate_monthly_amount(120.0, &BillingCycle::Yearly) - 10.0).abs() < 0.01);
        assert!((calculate_monthly_amount(30.0, &BillingCycle::Quarterly) - 10.0).abs() < 0.01);
        // Weekly: 10 * 52 / 12 ≈ 43.33
        assert!((calculate_monthly_amount(10.0, &BillingCycle::Weekly) - 43.333).abs() < 0.01);
    }

    #[test]
    fn test_calculate_yearly_amount() {
        assert!((calculate_yearly_amount(10.0, &BillingCycle::Monthly) - 120.0).abs() < 0.01);
        assert!((calculate_yearly_amount(100.0, &BillingCycle::Yearly) - 100.0).abs() < 0.01);
        assert!((calculate_yearly_amount(30.0, &BillingCycle::Quarterly) - 120.0).abs() < 0.01);
    }

    #[test]
    fn test_days_in_month() {
        assert_eq!(days_in_month(2024, 2), 29); // Leap year
        assert_eq!(days_in_month(2023, 2), 28);
        assert_eq!(days_in_month(2024, 1), 31);
        assert_eq!(days_in_month(2024, 4), 30);
        assert_eq!(days_in_month(2024, 12), 31);
    }

    #[test]
    fn test_add_months() {
        let jan31 = NaiveDate::from_ymd_opt(2024, 1, 31).unwrap();
        let feb = add_months(jan31, 1);
        assert_eq!(feb, NaiveDate::from_ymd_opt(2024, 2, 29).unwrap()); // Leap year

        let dec = NaiveDate::from_ymd_opt(2024, 12, 15).unwrap();
        let jan_next = add_months(dec, 1);
        assert_eq!(jan_next, NaiveDate::from_ymd_opt(2025, 1, 15).unwrap());
    }
}
