//! Transport-independent agent contract. Optional output fields are explicit nulls.
pub use kessai_core::models::{
    AnimationSpeed, BillingCycle, CardType, PaymentStatus, SubscriptionStatus, Theme,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct Page<T> {
    /// Rows on this page, in deterministic order.
    pub items: Vec<T>,
    /// Matching rows before pagination.
    pub total: usize,
    /// Opaque continuation token, or null when the list is complete.
    pub next_cursor: Option<String>,
    /// Non-fatal qualifications affecting this result.
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SubscriptionSort {
    #[default]
    NextPaymentDate,
    Name,
    AmountDesc,
    LastReviewedAt,
    CreatedAtDesc,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct SubscriptionFilter {
    /// Case-insensitive substring of the subscription name.
    pub query: Option<String>,
    /// Include any of these lifecycle statuses; an empty array means all.
    pub status: Vec<SubscriptionStatus>,
    /// Category id from categories_list.
    pub category_id: Option<String>,
    /// Card id from cards_list.
    pub card_id: Option<String>,
    /// Tag id from tags_list.
    pub tag_id: Option<String>,
    /// Inclusive earliest next payment date, YYYY-MM-DD.
    pub due_from: Option<String>,
    /// Inclusive latest next payment date, YYYY-MM-DD.
    pub due_to: Option<String>,
    /// Billable charges due today through today plus 0–366 days.
    pub upcoming_days: Option<i64>,
    /// Billable subscriptions never reviewed or reviewed over 1–3650 days ago.
    pub review_overdue_days: Option<i64>,
    /// Trials ending today through today plus 0–366 days.
    pub trial_ending_within_days: Option<i64>,
    /// Ordering, with id as the final tiebreaker; defaults to next_payment_date.
    pub sort: SubscriptionSort,
    /// Page size; default 50, maximum 200.
    pub limit: Option<usize>,
    /// Continuation token from the same filters.
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateSubscriptionInput {
    /// Nonempty name, at most 100 Unicode characters (the durable core limit).
    pub name: String,
    /// Nonnegative finite price in decimal major currency units.
    pub amount: f64,
    /// Three uppercase currency letters; defaults to settings.currency.
    pub currency: Option<String>,
    /// Renewal cadence; custom currently follows the core monthly cadence.
    pub billing_cycle: BillingCycle,
    /// Recurrence day, 1–31.
    pub billing_day: Option<i32>,
    /// Category id from categories_list.
    pub category_id: Option<String>,
    /// Card id from cards_list.
    pub card_id: Option<String>,
    /// Optional #RRGGBB display color.
    pub color: Option<String>,
    /// Notes, at most 500 characters (the durable core limit).
    pub notes: Option<String>,
    /// Next charge date, YYYY-MM-DD; omitted means unknown.
    pub next_payment_date: Option<String>,
    /// Local lifecycle status; defaults to active.
    pub status: Option<SubscriptionStatus>,
    /// Trial end date, YYYY-MM-DD.
    pub trial_end_date: Option<String>,
    /// Number of people sharing the full price, at least one; defaults to one.
    pub shared_count: Option<i32>,
    /// Desired pinned state; defaults to false.
    pub is_pinned: Option<bool>,
    /// Tag ids to attach after creating the subscription.
    #[serde(default)]
    pub tag_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ClearField {
    BillingDay,
    CategoryId,
    CardId,
    Color,
    Notes,
    NextPaymentDate,
    TrialEndDate,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct UpdateSubscriptionInput {
    /// Replacement name, at most 100 characters.
    pub name: Option<String>,
    /// Replacement nonnegative price in decimal major units.
    pub amount: Option<f64>,
    /// Replacement uppercase three-letter currency.
    pub currency: Option<String>,
    /// Desired renewal cadence.
    pub billing_cycle: Option<BillingCycle>,
    /// Recurrence day, 1–31; clear through clear_fields.
    pub billing_day: Option<i32>,
    /// Category id; clear through clear_fields.
    pub category_id: Option<String>,
    /// Card id; clear through clear_fields.
    pub card_id: Option<String>,
    /// Display color in #RRGGBB form; clear through clear_fields.
    pub color: Option<String>,
    /// Notes, at most 500 characters; clear through clear_fields.
    pub notes: Option<String>,
    /// YYYY-MM-DD next charge date; clear through clear_fields.
    pub next_payment_date: Option<String>,
    /// Desired local status; cancelled never contacts the provider.
    pub status: Option<SubscriptionStatus>,
    /// YYYY-MM-DD trial end date; clear through clear_fields.
    pub trial_end_date: Option<String>,
    /// Number sharing the full charge, at least one.
    pub shared_count: Option<i32>,
    /// Desired pinned state.
    pub is_pinned: Option<bool>,
    /// Cancellation notes, only alongside status=cancelled; at most 500 characters.
    pub cancellation_reason: Option<String>,
    /// When true, stamp the current review time.
    pub mark_reviewed: Option<bool>,
    /// Tag ids to add; already-present links are unchanged.
    pub add_tag_ids: Vec<String>,
    /// Tag ids to remove; already-absent links are unchanged.
    pub remove_tag_ids: Vec<String>,
    /// Nullable fields to blank; a field cannot also be set.
    pub clear_fields: Vec<ClearField>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct SubscriptionItem {
    /// Subscription id for follow-up calls.
    pub id: String,
    /// Display name.
    pub name: String,
    /// Full price in decimal major units, before shared_count division.
    pub amount: f64,
    /// Uppercase three-letter currency of amount.
    pub currency: String,
    /// Renewal cadence.
    pub billing_cycle: BillingCycle,
    /// Current local lifecycle status.
    pub status: SubscriptionStatus,
    /// Whether this subscription is currently active.
    pub is_active: bool,
    /// Next charge date, YYYY-MM-DD, or null when unknown.
    pub next_payment_date: Option<String>,
    /// Linked category id or null.
    pub category_id: Option<String>,
    /// Linked card id or null.
    pub card_id: Option<String>,
    /// Attached tag ids, sorted by id.
    pub tag_ids: Vec<String>,
    /// Desired pinned state.
    pub is_pinned: bool,
    /// Number of people sharing the full price.
    pub shared_count: i32,
    /// Trial end date (YYYY-MM-DD) or null.
    pub trial_end_date: Option<String>,
    /// RFC 3339 time of the last review, or null if never reviewed (sort=last_reviewed_at puts never-reviewed first).
    pub last_reviewed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct NamedRef {
    /// Reference entity id.
    pub id: String,
    /// Reference entity display name.
    pub name: String,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct TagRef {
    /// Tag id.
    pub id: String,
    /// Tag display name.
    pub name: String,
    /// Tag #RRGGBB color.
    pub color: String,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct CardRef {
    /// Card id.
    pub id: String,
    /// Card display name.
    pub name: String,
    /// Last four digits or null; never a full card number.
    pub last_four: Option<String>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct SubscriptionDetail {
    /// Subscription id.
    pub id: String,
    /// Display name.
    pub name: String,
    /// Full price in decimal major currency units.
    pub amount: f64,
    /// Currency of amount; no conversion is performed.
    pub currency: String,
    /// Renewal cadence.
    pub billing_cycle: BillingCycle,
    /// Recurrence day, 1–31, or null.
    pub billing_day: Option<i32>,
    /// Category id or null.
    pub category_id: Option<String>,
    /// Card id or null.
    pub card_id: Option<String>,
    /// Display color in #RRGGBB form or null.
    pub color: Option<String>,
    /// Logo URL or null.
    pub logo_url: Option<String>,
    /// Notes or null.
    pub notes: Option<String>,
    /// Whether this subscription is currently active.
    pub is_active: bool,
    /// Next payment YYYY-MM-DD or null.
    pub next_payment_date: Option<String>,
    /// Current local lifecycle status.
    pub status: SubscriptionStatus,
    /// Trial end YYYY-MM-DD or null.
    pub trial_end_date: Option<String>,
    /// Last status change RFC 3339 timestamp or null.
    pub status_changed_at: Option<String>,
    /// Number of people sharing the full price.
    pub shared_count: i32,
    /// Whether pinned in the UI.
    pub is_pinned: bool,
    /// Local cancellation notes or null.
    pub cancellation_reason: Option<String>,
    /// Cancellation RFC 3339 timestamp or null.
    pub cancelled_at: Option<String>,
    /// Last review RFC 3339 timestamp or null.
    pub last_reviewed_at: Option<String>,
    /// Creation RFC 3339 timestamp.
    pub created_at: String,
    /// Last update RFC 3339 timestamp.
    pub updated_at: String,
    /// Attached tags, including names and colors.
    pub tags: Vec<TagRef>,
    /// Linked category summary or null.
    pub category: Option<NamedRef>,
    /// Linked card summary or null.
    pub card: Option<CardRef>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct PaymentFilter {
    /// Subscription id, or all subscriptions when omitted.
    pub subscription_id: Option<String>,
    /// Due-date month, YYYY-MM, from 1900-01 through 9998-12.
    pub month: Option<String>,
    /// Include any of these statuses; an empty array means all.
    pub status: Vec<PaymentStatus>,
    /// Inclusive earliest due date, YYYY-MM-DD.
    pub due_from: Option<String>,
    /// Inclusive latest due date, YYYY-MM-DD.
    pub due_to: Option<String>,
    /// Page size; default 50, maximum 200.
    pub limit: Option<usize>,
    /// Continuation token from the same filters.
    pub cursor: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreatePaymentInput {
    /// Subscription id from subscriptions_list.
    pub subscription_id: String,
    /// Nonnegative amount in decimal major currency units.
    pub amount: f64,
    /// Due date, YYYY-MM-DD.
    pub due_date: String,
    /// Ledger status; creating a row never advances the schedule.
    pub status: PaymentStatus,
    /// RFC 3339 paid timestamp; defaults to now.
    pub paid_at: Option<String>,
    /// Notes, at most 500 characters.
    pub notes: Option<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum PaymentClearField {
    Notes,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct UpdatePaymentInput {
    /// Replacement nonnegative amount in decimal major units.
    pub amount: Option<f64>,
    /// Replacement RFC 3339 paid timestamp.
    pub paid_at: Option<String>,
    /// Replacement ledger status; never changes the subscription schedule.
    pub status: Option<PaymentStatus>,
    /// Replacement notes, at most 500 characters.
    pub notes: Option<String>,
    /// Nullable fields to blank; cannot also be set.
    pub clear_fields: Vec<PaymentClearField>,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct PaymentItem {
    /// Ledger row id.
    pub id: String,
    /// Owning subscription id.
    pub subscription_id: String,
    /// Current subscription display name.
    pub subscription_name: String,
    /// Current subscription currency; ledger amounts are not converted.
    pub currency: String,
    /// Recorded amount in decimal major units.
    pub amount: f64,
    /// Recorded ledger status.
    pub status: PaymentStatus,
    /// Due date, YYYY-MM-DD.
    pub due_date: String,
    /// Paid timestamp, RFC 3339.
    pub paid_at: String,
    /// Notes or null.
    pub notes: Option<String>,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct ScheduleSummary {
    /// Subscription id.
    pub id: String,
    /// Subscription display name.
    pub name: String,
    /// Next unsettled due date, YYYY-MM-DD, or null.
    pub next_payment_date: Option<String>,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct RecordOutcome {
    /// Created or previously recorded ledger row.
    pub payment: PaymentItem,
    /// Whether an existing outcome was returned for the specified due date.
    pub replayed: bool,
    /// Whether next_payment_date changed in this call.
    pub schedule_advanced: bool,
    /// Subscription schedule after recording the outcome.
    pub subscription: ScheduleSummary,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct CalendarPayment {
    /// Recorded ledger row id.
    pub id: String,
    /// Recorded ledger status.
    pub status: PaymentStatus,
    /// Actual recorded amount in decimal major currency units.
    pub amount: f64,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct CalendarOccurrence {
    /// Subscription id.
    pub subscription_id: String,
    /// Subscription display name.
    pub name: String,
    /// Occurrence date, YYYY-MM-DD.
    pub due_date: String,
    /// Currency shared by projected_amount and payment.amount.
    pub currency: String,
    /// Current subscription price; payment.amount is authoritative when present.
    pub projected_amount: f64,
    /// Current subscription lifecycle status.
    pub status: SubscriptionStatus,
    /// Renewal cadence.
    pub billing_cycle: BillingCycle,
    /// Recorded ledger outcome or null for an unrecorded projection.
    pub payment: Option<CalendarPayment>,
}
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct CurrencyTotals {
    /// Sum of current-price projections for every occurrence in the full month.
    pub projected: f64,
    /// Sum of actual paid ledger amounts.
    pub paid: f64,
    /// Sum of actual skipped ledger amounts.
    pub skipped: f64,
    /// Sum of pending ledger amounts plus unrecorded projected amounts.
    pub pending: f64,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct CalendarMonth {
    /// Requested calendar month, YYYY-MM.
    pub month: String,
    /// Occurrences on this page, ordered by date, name, subscription id and payment id.
    pub items: Vec<CalendarOccurrence>,
    /// Number of occurrences before pagination.
    pub total: usize,
    /// Continuation token, or null when complete.
    pub next_cursor: Option<String>,
    /// Full-month totals per currency, before pagination; currencies are never converted.
    pub totals_by_currency: BTreeMap<String, CurrencyTotals>,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct RefItem {
    /// Reference entity id.
    pub id: String,
    /// Display name.
    pub name: String,
    /// Display color in #RRGGBB form.
    pub color: String,
    /// Category icon; null for tags and cards.
    pub icon: Option<String>,
    /// Whether this is a protected default category; null for tags and cards.
    pub is_default: Option<bool>,
    /// Card type; null for categories and tags.
    pub card_type: Option<CardType>,
    /// Last four card digits or null.
    pub last_four: Option<String>,
    /// Credit limit in decimal major units or null.
    pub credit_limit: Option<f64>,
    /// Number of subscriptions referencing this entity.
    pub subscription_count: usize,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateCardInput {
    /// Nonempty display name, at most 100 characters.
    pub name: String,
    /// Credit or debit.
    pub card_type: CardType,
    /// Exactly four digits; never supply a full card number.
    pub last_four: Option<String>,
    /// Display color in #RRGGBB form; defaults to #6b7280.
    pub color: Option<String>,
    /// Nonnegative credit limit in decimal major units.
    pub credit_limit: Option<f64>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CardClearField {
    LastFour,
    CreditLimit,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct UpdateCardInput {
    /// Replacement display name, at most 100 characters.
    pub name: Option<String>,
    /// Desired credit or debit type.
    pub card_type: Option<CardType>,
    /// Exactly four digits; clear through clear_fields.
    pub last_four: Option<String>,
    /// Replacement #RRGGBB color.
    pub color: Option<String>,
    /// Nonnegative credit limit; clear through clear_fields.
    pub credit_limit: Option<f64>,
    /// Nullable card fields to blank; cannot also be set.
    pub clear_fields: Vec<CardClearField>,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct CascadePreview {
    /// Total affected rows, which may exceed the number of preview ids.
    pub count: usize,
    /// Up to twenty affected ids in sorted order.
    pub ids: Vec<String>,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct CascadeCount {
    /// Total affected rows.
    pub count: usize,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct DeletePreview {
    /// Always true; this result made no domain changes.
    pub dry_run: bool,
    /// Entity that would be deleted.
    pub target: NamedRef,
    /// Cascaded or detached rows by kind, with bounded example ids.
    pub cascade: BTreeMap<String, CascadePreview>,
    /// Always true; execute only after explicit user approval.
    pub requires_confirmation: bool,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct DeleteOutcome {
    /// Always true after successful deletion.
    pub deleted: bool,
    /// Deleted entity identity.
    pub target: NamedRef,
    /// Counts of cascaded or detached rows by kind.
    pub cascade: BTreeMap<String, CascadeCount>,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum DeleteResult {
    Preview(DeletePreview),
    Deleted(DeleteOutcome),
}
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ImportMode {
    #[default]
    Merge,
    Replace,
}
#[derive(Debug, Clone, Default, Serialize, JsonSchema)]
pub struct BackupCounts {
    /// Subscription rows.
    pub subscriptions: usize,
    /// Category rows.
    pub categories: usize,
    /// Card rows.
    pub cards: usize,
    /// Payment rows.
    pub payments: usize,
    /// Price history rows.
    pub price_history: usize,
    /// Tag rows.
    pub tags: usize,
    /// Subscription-tag links.
    pub tag_links: usize,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct ImportPreview {
    /// Always true; no domain changes were made.
    pub dry_run: bool,
    /// Merge upserts by id; replace first removes existing data.
    pub mode: ImportMode,
    /// Backup format version.
    pub version: String,
    /// Incoming record counts by collection.
    pub incoming: BackupCounts,
    /// Incoming records whose ids already exist; identical protected defaults are excluded.
    pub collisions: BackupCounts,
    /// Whether applying this import needs explicit approval.
    pub requires_confirmation: bool,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct ImportOutcome {
    /// Always true after the import transaction commits.
    pub imported: bool,
    /// Applied import mode.
    pub mode: ImportMode,
    /// Imported backup format version.
    pub version: String,
    /// Incoming records applied by collection, not resulting database totals.
    pub counts: BackupCounts,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum ImportResult {
    Preview(ImportPreview),
    Imported(ImportOutcome),
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct ExportOutcome {
    /// Absolute destination path on this machine.
    pub path: String,
    /// Number of UTF-8 bytes written.
    pub bytes: u64,
    /// Backup format version.
    pub version: String,
    /// Exported record counts by collection.
    pub counts: BackupCounts,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SettingsClearField {
    MonthlyBudget,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct UpdateSettingsInput {
    /// Desired display theme.
    pub theme: Option<Theme>,
    /// Uppercase three-letter display currency; does not convert existing amounts.
    pub currency: Option<String>,
    /// Whether notifications are enabled.
    pub notification_enabled: Option<bool>,
    /// Notification offsets, each 0–365 days before a charge.
    pub notification_days_before: Option<Vec<i32>>,
    /// Default advance notification days, 0–365.
    pub notification_advance_days: Option<i32>,
    /// Local notification time, HH:MM in 24-hour form.
    pub notification_time: Option<String>,
    /// Nonnegative monthly budget in display-currency major units.
    pub monthly_budget: Option<f64>,
    /// Whether to reduce motion.
    pub reduce_motion: Option<bool>,
    /// Whether transitions are enabled.
    pub enable_transitions: Option<bool>,
    /// Whether hover effects are enabled.
    pub enable_hover_effects: Option<bool>,
    /// Desired animation speed.
    pub animation_speed: Option<AnimationSpeed>,
    /// Nullable settings fields to blank; cannot also be set.
    pub clear_fields: Vec<SettingsClearField>,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct Settings {
    /// Singleton settings identity, not a domain UUID.
    pub id: String,
    /// Display theme.
    pub theme: Theme,
    /// Display currency used by dashboard totals.
    pub currency: String,
    /// Configured display exchange rates; agent analytics never apply them.
    pub display_exchange_rates: BTreeMap<String, f64>,
    /// Whether notifications are enabled.
    pub notification_enabled: bool,
    /// Advance notification offsets in days.
    pub notification_days_before: Vec<i32>,
    /// Default advance notification days.
    pub notification_advance_days: i32,
    /// Local notification time, HH:MM.
    pub notification_time: String,
    /// Monthly budget in display currency or null.
    pub monthly_budget: Option<f64>,
    /// Whether to reduce motion.
    pub reduce_motion: bool,
    /// Whether transitions are enabled.
    pub enable_transitions: bool,
    /// Whether hover effects are enabled.
    pub enable_hover_effects: bool,
    /// Animation speed preference.
    pub animation_speed: AnimationSpeed,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct CategorySpending {
    /// Category id or core's uncategorized identity.
    pub id: String,
    /// Category display name.
    pub name: String,
    /// Category display color.
    pub color: String,
    /// Normalized monthly share in display currency.
    pub amount: f64,
    /// Percentage of included dashboard spending.
    pub percentage: f64,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct DashboardStats {
    /// Currency of all dashboard monetary totals.
    pub display_currency: String,
    /// Normalized monthly cost of the user's share, display currency only.
    pub total_monthly: f64,
    /// Normalized yearly cost of the user's share, display currency only.
    pub total_yearly: f64,
    /// Included active billable subscriptions in display currency.
    pub active_count: usize,
    /// All tracked subscriptions.
    pub total_count: usize,
    /// Mean normalized monthly share among included active subscriptions.
    pub average_per_subscription: f64,
    /// Display-currency monthly share by category.
    pub category_spending: Vec<CategorySpending>,
    /// Active subscriptions excluded from monetary totals, counted by currency.
    pub excluded_currencies: BTreeMap<String, usize>,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct MonthlySpend {
    /// Due-date month, YYYY-MM.
    pub month: String,
    /// Paid ledger amounts summed without currency conversion.
    pub total: f64,
    /// Number of paid ledger rows.
    pub count: i32,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct CategorySpend {
    /// Category id or null for uncategorized rows.
    pub category_id: Option<String>,
    /// Category display name.
    pub category_name: String,
    /// Paid ledger total without currency conversion.
    pub total: f64,
    /// Percentage of paid spending.
    pub percentage: f64,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct SpendingVelocity {
    /// Current month paid total, without conversion.
    pub current_month: f64,
    /// Previous month paid total, without conversion.
    pub previous_month: f64,
    /// Percentage change from the previous month.
    pub change_percent: f64,
    /// Current month annualized, without conversion.
    pub projected_annual: f64,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct SpendingReport {
    /// Number of requested trailing months, 1–60.
    pub months: i32,
    /// Paid ledger monthly series without currency conversion.
    pub monthly: Vec<MonthlySpend>,
    /// Paid ledger category totals without currency conversion.
    pub by_category: Vec<CategorySpend>,
    /// Current and previous month trend, without currency conversion.
    pub velocity: SpendingVelocity,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct YearSummary {
    /// Calendar year, 1900–9998.
    pub year: i32,
    /// Paid ledger total without currency conversion.
    pub total_spent: f64,
    /// Mean monthly paid ledger total, without conversion.
    pub avg_monthly: f64,
    /// Highest-spending month, YYYY-MM.
    pub highest_month: String,
    /// Highest monthly paid total, without conversion.
    pub highest_amount: f64,
    /// Paid spending by category, without conversion.
    pub category_breakdown: Vec<CategorySpend>,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct PriceChangeItem {
    /// Price change id.
    pub id: String,
    /// Owning subscription id.
    pub subscription_id: String,
    /// Current subscription display name.
    pub subscription_name: String,
    /// Previous price in old_currency decimal major units.
    pub old_amount: f64,
    /// New price in new_currency decimal major units.
    pub new_amount: f64,
    /// Previous uppercase three-letter currency.
    pub old_currency: String,
    /// New uppercase three-letter currency.
    pub new_currency: String,
    /// RFC 3339 timestamp of the change.
    pub changed_at: String,
}
