use chrono::{Datelike, Duration, NaiveDate, Utc};

use crate::models::subscription::{BillingCycle, Subscription, SubscriptionStatus};

/// Calculates the next future payment relative to an explicit date.
///
/// Month-based recurrences retain the original start day's anchor when they
/// cross a shorter month. If no later date is representable, returns MAX.
pub fn calculate_next_payment_date_on(
    start_date: NaiveDate,
    cycle: &BillingCycle,
    billing_day: Option<i32>,
    today: NaiveDate,
) -> NaiveDate {
    if start_date > today {
        return start_date;
    }
    let day = billing_day.map(|day| day.clamp(1, 31) as u32);
    let period = period_containing(start_date, cycle, today).max(1);
    match date_at_period(start_date, cycle, day, period) {
        Some(next) if next > today => next,
        _ => date_at_period(start_date, cycle, day, period + 1).unwrap_or(NaiveDate::MAX),
    }
}

/// Advances exactly one period, clamping month-based dates to month end.
///
/// An explicit billing day wins; otherwise the supplied date's day is used.
/// This pure helper cannot retain a day lost to clamping: paid advancement must
/// persist that original billing day in the same transaction. Custom is monthly.
/// At chrono's date boundary, returns the input unchanged.
pub fn advance_one_period(
    date: NaiveDate,
    cycle: &BillingCycle,
    billing_day: Option<u32>,
) -> NaiveDate {
    if billing_day.is_none() {
        if let Some(months) = months_per_period(cycle) {
            return add_months(date, months);
        }
    }
    date_at_period(date, cycle, billing_day, 1).unwrap_or(date)
}

/// Projects a recurrence into a half-open interval, in either direction from
/// its stored anchor. Period zero is always the anchor itself, even when an
/// explicit billing day differs. Other month-based periods use the billing day
/// or original anchor's day, so January 31 does not drift after February.
///
/// Iterations are bounded by periods intersecting the requested interval, not
/// the distance from the anchor. Empty or reversed intervals return no dates.
pub fn occurrences_in_range(
    anchor: NaiveDate,
    cycle: &BillingCycle,
    billing_day: Option<u32>,
    start: NaiveDate,
    end_exclusive: NaiveDate,
) -> Vec<NaiveDate> {
    if start >= end_exclusive {
        return Vec::new();
    }
    let first = period_containing(anchor, cycle, start);
    let last = period_containing(anchor, cycle, end_exclusive);
    (first..=last)
        .filter_map(|period| date_at_period(anchor, cycle, billing_day, period))
        .filter(|date| *date >= start && *date < end_exclusive)
        .collect()
}

fn months_per_period(cycle: &BillingCycle) -> Option<i64> {
    match cycle {
        BillingCycle::Weekly => None,
        BillingCycle::Monthly | BillingCycle::Custom => Some(1),
        BillingCycle::Quarterly => Some(3),
        BillingCycle::Yearly => Some(12),
    }
}

fn period_containing(anchor: NaiveDate, cycle: &BillingCycle, date: NaiveDate) -> i64 {
    match months_per_period(cycle) {
        None => (date - anchor).num_days().div_euclid(7),
        Some(months) => {
            let distance = i64::from(date.year() - anchor.year()) * 12 + i64::from(date.month())
                - i64::from(anchor.month());
            distance.div_euclid(months)
        }
    }
}

fn date_at_period(
    anchor: NaiveDate,
    cycle: &BillingCycle,
    billing_day: Option<u32>,
    period: i64,
) -> Option<NaiveDate> {
    if period == 0 {
        return Some(anchor);
    }
    match months_per_period(cycle) {
        None => anchor.checked_add_signed(Duration::days(period.checked_mul(7)?)),
        Some(months) => date_after_months(
            anchor,
            period.checked_mul(months)?,
            billing_day.unwrap_or(anchor.day()).clamp(1, 31),
        ),
    }
}

/// Adds months without overflowing chrono's supported year range.
fn add_months(date: NaiveDate, months: i64) -> NaiveDate {
    date_after_months(date, months, date.day()).unwrap_or(date)
}

fn date_after_months(date: NaiveDate, months: i64, day: u32) -> Option<NaiveDate> {
    let total_months =
        (i64::from(date.year()) * 12 + i64::from(date.month0())).checked_add(months)?;
    let year = i32::try_from(total_months.div_euclid(12)).ok()?;
    let month = (total_months.rem_euclid(12) + 1) as u32;
    NaiveDate::from_ymd_opt(year, month, day.min(days_in_month(year, month)))
}

/// Returns the number of days without constructing the following year.
fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        4 | 6 | 9 | 11 => 30,
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        _ => 31,
    }
}

/// Supported query years leave room for a four-digit exclusive end year.
pub(crate) fn month_date_range(
    year: i32,
    month: u32,
) -> crate::error::Result<(NaiveDate, NaiveDate)> {
    use crate::error::KessaiCoreError;

    if !(1900..=9998).contains(&year) {
        return Err(KessaiCoreError::Validation(
            "year must be from 1900 to 9998".into(),
        ));
    }
    let start = NaiveDate::from_ymd_opt(year, month, 1)
        .ok_or_else(|| KessaiCoreError::Validation("month must be from 1 to 12".into()))?;
    Ok((start, add_months(start, 1)))
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

    fn date(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn monthly_projections_keep_the_original_anchor_across_short_months() {
        for (year, february) in [(2023, "2023-02-28"), (2024, "2024-02-29")] {
            let anchor = date(&format!("{year}-01-31"));
            let dates = occurrences_in_range(
                anchor,
                &BillingCycle::Monthly,
                None,
                date(&format!("{year}-01-01")),
                date(&format!("{year}-04-01")),
            );
            assert_eq!(
                dates,
                [anchor, date(february), date(&format!("{year}-03-31")),]
            );
        }
    }

    #[test]
    fn one_period_uses_explicit_day_or_the_supplied_stored_anchor() {
        assert_eq!(
            advance_one_period(date("2023-02-28"), &BillingCycle::Monthly, None),
            date("2023-03-28")
        );
        assert_eq!(
            advance_one_period(date("2023-02-28"), &BillingCycle::Monthly, Some(31)),
            date("2023-03-31")
        );
        assert_eq!(
            advance_one_period(date("2024-02-29"), &BillingCycle::Yearly, Some(31)),
            date("2025-02-28")
        );
        assert_eq!(
            advance_one_period(date("2026-01-30"), &BillingCycle::Quarterly, Some(15)),
            date("2026-04-15")
        );
        assert_eq!(
            advance_one_period(date("2026-01-30"), &BillingCycle::Weekly, Some(15)),
            date("2026-02-06")
        );
        assert_eq!(
            advance_one_period(date("2026-01-31"), &BillingCycle::Custom, None),
            date("2026-02-28")
        );
    }

    #[test]
    fn weekly_projection_covers_both_sides_of_an_anchor_inside_the_month() {
        assert_eq!(
            occurrences_in_range(
                date("2026-04-17"),
                &BillingCycle::Weekly,
                None,
                date("2026-04-01"),
                date("2026-05-01"),
            ),
            ["2026-04-03", "2026-04-10", "2026-04-17", "2026-04-24"].map(date)
        );
    }

    #[test]
    fn quarterly_and_yearly_projection_do_not_invent_off_months() {
        assert!(occurrences_in_range(
            date("2026-01-31"),
            &BillingCycle::Quarterly,
            Some(31),
            date("2026-02-01"),
            date("2026-03-01")
        )
        .is_empty());
        assert_eq!(
            occurrences_in_range(
                date("2026-01-31"),
                &BillingCycle::Quarterly,
                Some(31),
                date("2025-10-01"),
                date("2025-11-01")
            ),
            [date("2025-10-31")]
        );
        assert!(occurrences_in_range(
            date("2026-06-15"),
            &BillingCycle::Yearly,
            Some(15),
            date("2027-05-01"),
            date("2027-06-01")
        )
        .is_empty());
        assert_eq!(
            occurrences_in_range(
                date("2024-02-29"),
                &BillingCycle::Yearly,
                None,
                date("2028-02-01"),
                date("2028-03-01")
            ),
            [date("2028-02-29")]
        );
    }

    #[test]
    fn occurrences_use_half_open_bounds_and_handle_empty_ranges() {
        let anchor = date("2026-04-03");
        assert_eq!(
            occurrences_in_range(
                anchor,
                &BillingCycle::Weekly,
                None,
                anchor,
                date("2026-04-10")
            ),
            [anchor]
        );
        assert!(
            occurrences_in_range(anchor, &BillingCycle::Weekly, None, anchor, anchor).is_empty()
        );
        assert!(occurrences_in_range(
            anchor,
            &BillingCycle::Weekly,
            None,
            date("2026-04-10"),
            anchor
        )
        .is_empty());
    }

    #[test]
    fn next_payment_calculation_uses_an_explicit_today_without_anchor_drift() {
        assert_eq!(
            calculate_next_payment_date_on(
                date("2023-01-31"),
                &BillingCycle::Monthly,
                None,
                date("2023-03-01")
            ),
            date("2023-03-31")
        );
        assert_eq!(
            calculate_next_payment_date_on(
                date("2026-04-03"),
                &BillingCycle::Weekly,
                None,
                date("2026-04-10")
            ),
            date("2026-04-17")
        );
    }

    #[test]
    fn chrono_boundaries_do_not_overflow_or_loop() {
        assert_eq!(add_months(NaiveDate::MAX, 1), NaiveDate::MAX);
        assert_eq!(add_months(NaiveDate::MIN, -1), NaiveDate::MIN);
        for cycle in [
            BillingCycle::Weekly,
            BillingCycle::Monthly,
            BillingCycle::Quarterly,
            BillingCycle::Yearly,
        ] {
            assert_eq!(
                advance_one_period(NaiveDate::MAX, &cycle, None),
                NaiveDate::MAX
            );
            assert_eq!(
                calculate_next_payment_date_on(NaiveDate::MIN, &cycle, None, NaiveDate::MAX),
                NaiveDate::MAX
            );
            let dates = occurrences_in_range(
                NaiveDate::MIN,
                &cycle,
                None,
                NaiveDate::MAX.pred_opt().unwrap(),
                NaiveDate::MAX,
            );
            assert!(dates.len() <= 1);
        }
    }
}
