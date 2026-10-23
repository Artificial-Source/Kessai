use super::*;
use kessai_core::models as core;

macro_rules! from_core {
    ($name:ident { $($field:ident),+ $(,)? }) => {
        impl From<core::$name> for $name {
            fn from(value: core::$name) -> Self { Self { $($field: value.$field),+ } }
        }
    };
}
from_core!(CategorySpending {
    id,
    name,
    color,
    amount,
    percentage
});
from_core!(MonthlySpend {
    month,
    total,
    count
});
from_core!(CategorySpend {
    category_id,
    category_name,
    total,
    percentage
});
from_core!(SpendingVelocity {
    current_month,
    previous_month,
    change_percent,
    projected_annual
});
impl From<core::YearSummary> for YearSummary {
    fn from(value: core::YearSummary) -> Self {
        Self {
            year: value.year,
            total_spent: value.total_spent,
            avg_monthly: value.avg_monthly,
            highest_month: value.highest_month,
            highest_amount: value.highest_amount,
            category_breakdown: value
                .category_breakdown
                .into_iter()
                .map(Into::into)
                .collect(),
        }
    }
}
impl From<core::Settings> for Settings {
    fn from(value: core::Settings) -> Self {
        Self {
            id: value.id,
            theme: value.theme,
            currency: value.currency,
            display_exchange_rates: value.display_exchange_rates.into_iter().collect(),
            notification_enabled: value.notification_enabled,
            notification_days_before: value.notification_days_before,
            notification_advance_days: value.notification_advance_days,
            notification_time: value.notification_time,
            monthly_budget: value.monthly_budget,
            reduce_motion: value.reduce_motion,
            enable_transitions: value.enable_transitions,
            enable_hover_effects: value.enable_hover_effects,
            animation_speed: value.animation_speed,
        }
    }
}
impl SubscriptionDetail {
    pub(super) fn enrich(
        value: core::Subscription,
        tags: Vec<TagRef>,
        category: Option<NamedRef>,
        card: Option<CardRef>,
    ) -> Self {
        Self {
            id: value.id,
            name: value.name,
            amount: value.amount,
            currency: value.currency,
            billing_cycle: value.billing_cycle,
            billing_day: value.billing_day,
            category_id: value.category_id,
            card_id: value.card_id,
            color: value.color,
            logo_url: value.logo_url,
            notes: value.notes,
            is_active: value.is_active,
            next_payment_date: value.next_payment_date,
            status: value.status,
            trial_end_date: value.trial_end_date,
            status_changed_at: value.status_changed_at.map(timestamp),
            shared_count: value.shared_count,
            is_pinned: value.is_pinned,
            cancellation_reason: value.cancellation_reason,
            cancelled_at: value.cancelled_at.map(timestamp),
            last_reviewed_at: value.last_reviewed_at.map(timestamp),
            created_at: timestamp(value.created_at),
            updated_at: timestamp(value.updated_at),
            tags,
            category,
            card,
        }
    }
}
impl SubscriptionItem {
    pub(super) fn project(value: core::Subscription, tag_ids: Vec<String>) -> Self {
        Self {
            id: value.id,
            name: value.name,
            amount: value.amount,
            currency: value.currency,
            billing_cycle: value.billing_cycle,
            status: value.status,
            is_active: value.is_active,
            next_payment_date: value.next_payment_date,
            category_id: value.category_id,
            card_id: value.card_id,
            tag_ids,
            is_pinned: value.is_pinned,
            shared_count: value.shared_count,
            trial_end_date: value.trial_end_date,
            last_reviewed_at: value.last_reviewed_at,
        }
    }
}
impl PaymentItem {
    pub(super) fn enrich(
        value: core::Payment,
        subscription_name: String,
        currency: String,
    ) -> Self {
        Self {
            id: value.id,
            subscription_id: value.subscription_id,
            subscription_name,
            currency,
            amount: value.amount,
            status: value.status,
            due_date: value.due_date,
            paid_at: value.paid_at,
            notes: value.notes,
        }
    }
}
impl From<core::CalendarOccurrence> for CalendarOccurrence {
    fn from(value: core::CalendarOccurrence) -> Self {
        Self {
            subscription_id: value.subscription_id,
            name: value.name,
            due_date: value.due_date,
            currency: value.currency,
            projected_amount: value.projected_amount,
            status: value.status,
            billing_cycle: value.billing_cycle,
            payment: value.payment.map(|payment| CalendarPayment {
                id: payment.id,
                status: payment.status,
                amount: payment.amount,
            }),
        }
    }
}
impl From<core::Category> for RefItem {
    fn from(value: core::Category) -> Self {
        Self {
            id: value.id,
            name: value.name,
            color: value.color,
            icon: Some(value.icon),
            is_default: Some(value.is_default),
            card_type: None,
            last_four: None,
            credit_limit: None,
            subscription_count: 0,
        }
    }
}
impl From<core::Tag> for RefItem {
    fn from(value: core::Tag) -> Self {
        Self {
            id: value.id,
            name: value.name,
            color: value.color,
            icon: None,
            is_default: None,
            card_type: None,
            last_four: None,
            credit_limit: None,
            subscription_count: 0,
        }
    }
}
impl From<core::PaymentCard> for RefItem {
    fn from(value: core::PaymentCard) -> Self {
        Self {
            id: value.id,
            name: value.name,
            color: value.color,
            icon: None,
            is_default: None,
            card_type: Some(value.card_type),
            last_four: value.last_four,
            credit_limit: value.credit_limit,
            subscription_count: 0,
        }
    }
}
/// Existing SQLite CURRENT_TIMESTAMP metadata is UTC but predates RFC 3339 storage.
fn timestamp(value: String) -> String {
    match chrono::NaiveDateTime::parse_from_str(&value, "%Y-%m-%d %H:%M:%S") {
        Ok(value) => value.and_utc().to_rfc3339(),
        Err(_) => value,
    }
}
