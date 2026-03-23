use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde::Deserialize;
use subby_core::models::{
    BackupData, NewCategory, NewPayment, NewPaymentCard, NewSubscription, NewTag,
    SubscriptionStatus, UpdateCategory, UpdatePayment, UpdatePaymentCard, UpdateSettings,
    UpdateSubscription, UpdateTag,
};

use crate::AppState;

// ── Error handling ──────────────────────────────────────────────────────────

pub struct AppError(anyhow::Error);

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let message = self.0.to_string();
        let status = if message.contains("not found") || message.contains("Not found") {
            StatusCode::NOT_FOUND
        } else if message.contains("Cannot delete default") {
            StatusCode::BAD_REQUEST
        } else if message.contains("Invalid status") {
            StatusCode::BAD_REQUEST
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        };

        (status, Json(serde_json::json!({ "error": message }))).into_response()
    }
}

impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(err: E) -> Self {
        Self(err.into())
    }
}

type Result<T> = std::result::Result<T, AppError>;

// ── Router ──────────────────────────────────────────────────────────────────

pub fn api_router(state: Arc<AppState>) -> Router {
    Router::new()
        // Subscriptions
        .route("/subscriptions", get(list_subscriptions))
        .route("/subscriptions", post(create_subscription))
        .route("/subscriptions/{id}", get(get_subscription))
        .route("/subscriptions/{id}", put(update_subscription))
        .route("/subscriptions/{id}", delete(delete_subscription))
        .route("/subscriptions/{id}/toggle", post(toggle_subscription_active))
        .route("/subscriptions/{id}/status", post(transition_subscription_status))
        // Categories
        .route("/categories", get(list_categories))
        .route("/categories", post(create_category))
        .route("/categories/{id}", put(update_category))
        .route("/categories/{id}", delete(delete_category))
        // Payments
        .route("/payments", get(list_payments))
        .route("/payments", post(create_payment))
        .route("/payments/{id}", put(update_payment))
        .route("/payments/{id}", delete(delete_payment))
        .route("/payments/{year}/{month}", get(list_payments_by_month))
        .route("/payments/{year}/{month}/details", get(list_payments_with_details))
        .route("/payments/mark-paid", post(mark_payment_paid))
        .route("/payments/skip", post(skip_payment))
        .route("/payments/check/{subscription_id}/{due_date}", get(is_payment_recorded))
        // Payment Cards
        .route("/cards", get(list_payment_cards))
        .route("/cards", post(create_payment_card))
        .route("/cards/{id}", put(update_payment_card))
        .route("/cards/{id}", delete(delete_payment_card))
        // Tags
        .route("/tags", get(list_tags))
        .route("/tags", post(create_tag))
        .route("/tags/{id}", put(update_tag))
        .route("/tags/{id}", delete(delete_tag))
        .route("/subscriptions/{id}/tags", get(list_subscription_tags))
        .route("/subscriptions/{id}/tags", post(add_subscription_tag))
        .route("/subscriptions/{id}/tags/{tag_id}", delete(remove_subscription_tag))
        // Settings
        .route("/settings", get(get_settings))
        .route("/settings", put(update_settings))
        // Price History
        .route("/price-history/recent", get(get_recent_price_changes))
        .route("/price-history/{subscription_id}", get(list_price_history))
        // Data Management
        .route("/export", get(export_data))
        .route("/import", post(import_data))
        // Trials
        .route("/trials/expiring", get(get_expiring_trials))
        .with_state(state)
}

// ── Subscription handlers ───────────────────────────────────────────────────

async fn list_subscriptions(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let subs = state.core.subscriptions().list()?;
    Ok(Json(subs))
}

async fn get_subscription(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let sub = state.core.subscriptions().get(&id)?;
    Ok(Json(sub))
}

async fn create_subscription(
    State(state): State<Arc<AppState>>,
    Json(data): Json<NewSubscription>,
) -> Result<impl IntoResponse> {
    let sub = state.core.subscriptions().create(data)?;
    Ok((StatusCode::CREATED, Json(sub)))
}

async fn update_subscription(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(data): Json<UpdateSubscription>,
) -> Result<impl IntoResponse> {
    // Auto-detect price changes and record history (matching Tauri behavior)
    if let Some(new_amount) = data.amount {
        if let Ok(existing) = state.core.subscriptions().get(&id) {
            if (existing.amount - new_amount).abs() > 0.001 {
                let new_currency = data
                    .currency
                    .as_deref()
                    .unwrap_or(&existing.currency);
                let _ = state.core.price_history().record(
                    &id,
                    existing.amount,
                    new_amount,
                    &existing.currency,
                    new_currency,
                );
            }
        }
    }

    let sub = state.core.subscriptions().update(&id, data)?;
    Ok(Json(sub))
}

async fn delete_subscription(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    state.core.subscriptions().delete(&id)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn toggle_subscription_active(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let sub = state.core.subscriptions().toggle_active(&id)?;
    Ok(Json(sub))
}

#[derive(Deserialize)]
struct StatusBody {
    status: String,
}

async fn transition_subscription_status(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<StatusBody>,
) -> Result<impl IntoResponse> {
    let new_status = SubscriptionStatus::from_str(&body.status)
        .ok_or_else(|| anyhow::anyhow!("Invalid status: {}", body.status))?;
    let sub = state.core.subscriptions().transition_status(&id, new_status)?;
    Ok(Json(sub))
}

// ── Category handlers ───────────────────────────────────────────────────────

async fn list_categories(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let cats = state.core.categories().list()?;
    Ok(Json(cats))
}

async fn create_category(
    State(state): State<Arc<AppState>>,
    Json(data): Json<NewCategory>,
) -> Result<impl IntoResponse> {
    let cat = state.core.categories().create(data)?;
    Ok((StatusCode::CREATED, Json(cat)))
}

async fn update_category(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(data): Json<UpdateCategory>,
) -> Result<impl IntoResponse> {
    let cat = state.core.categories().update(&id, data)?;
    Ok(Json(cat))
}

async fn delete_category(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    state.core.categories().delete(&id)?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Payment handlers ────────────────────────────────────────────────────────

async fn list_payments(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let payments = state.core.payments().list()?;
    Ok(Json(payments))
}

async fn list_payments_by_month(
    State(state): State<Arc<AppState>>,
    Path((year, month)): Path<(i32, u32)>,
) -> Result<impl IntoResponse> {
    let payments = state.core.payments().list_by_month(year, month)?;
    Ok(Json(payments))
}

async fn list_payments_with_details(
    State(state): State<Arc<AppState>>,
    Path((year, month)): Path<(i32, u32)>,
) -> Result<impl IntoResponse> {
    let payments = state.core.payments().list_with_details(year, month)?;
    Ok(Json(payments))
}

async fn create_payment(
    State(state): State<Arc<AppState>>,
    Json(data): Json<NewPayment>,
) -> Result<impl IntoResponse> {
    let payment = state.core.payments().create(data)?;
    Ok((StatusCode::CREATED, Json(payment)))
}

async fn update_payment(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(data): Json<UpdatePayment>,
) -> Result<impl IntoResponse> {
    let payment = state.core.payments().update(&id, data)?;
    Ok(Json(payment))
}

async fn delete_payment(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    state.core.payments().delete(&id)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct MarkPaidBody {
    subscription_id: String,
    due_date: String,
    amount: f64,
}

async fn mark_payment_paid(
    State(state): State<Arc<AppState>>,
    Json(body): Json<MarkPaidBody>,
) -> Result<impl IntoResponse> {
    let payment = state
        .core
        .payments()
        .mark_as_paid(&body.subscription_id, &body.due_date, body.amount)?;
    Ok((StatusCode::CREATED, Json(payment)))
}

#[derive(Deserialize)]
struct SkipPaymentBody {
    subscription_id: String,
    due_date: String,
    amount: f64,
}

async fn skip_payment(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SkipPaymentBody>,
) -> Result<impl IntoResponse> {
    let payment = state
        .core
        .payments()
        .skip_payment(&body.subscription_id, &body.due_date, body.amount)?;
    Ok((StatusCode::CREATED, Json(payment)))
}

async fn is_payment_recorded(
    State(state): State<Arc<AppState>>,
    Path((subscription_id, due_date)): Path<(String, String)>,
) -> Result<impl IntoResponse> {
    let recorded = state.core.payments().is_recorded(&subscription_id, &due_date)?;
    Ok(Json(serde_json::json!({ "recorded": recorded })))
}

// ── Payment Card handlers ───────────────────────────────────────────────────

async fn list_payment_cards(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let cards = state.core.payment_cards().list()?;
    Ok(Json(cards))
}

async fn create_payment_card(
    State(state): State<Arc<AppState>>,
    Json(data): Json<NewPaymentCard>,
) -> Result<impl IntoResponse> {
    let card = state.core.payment_cards().create(data)?;
    Ok((StatusCode::CREATED, Json(card)))
}

async fn update_payment_card(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(data): Json<UpdatePaymentCard>,
) -> Result<impl IntoResponse> {
    let card = state.core.payment_cards().update(&id, data)?;
    Ok(Json(card))
}

async fn delete_payment_card(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    state.core.payment_cards().delete(&id)?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Tag handlers ────────────────────────────────────────────────────────────

async fn list_tags(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let tags = state.core.tags().list()?;
    Ok(Json(tags))
}

async fn create_tag(
    State(state): State<Arc<AppState>>,
    Json(data): Json<NewTag>,
) -> Result<impl IntoResponse> {
    let tag = state.core.tags().create(data)?;
    Ok((StatusCode::CREATED, Json(tag)))
}

async fn update_tag(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(data): Json<UpdateTag>,
) -> Result<impl IntoResponse> {
    let tag = state.core.tags().update(&id, data)?;
    Ok(Json(tag))
}

async fn delete_tag(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    state.core.tags().delete(&id)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_subscription_tags(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let tags = state.core.tags().list_for_subscription(&id)?;
    Ok(Json(tags))
}

#[derive(Deserialize)]
struct AddTagBody {
    tag_id: String,
}

async fn add_subscription_tag(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<AddTagBody>,
) -> Result<impl IntoResponse> {
    state.core.tags().add_to_subscription(&id, &body.tag_id)?;
    Ok(StatusCode::CREATED)
}

async fn remove_subscription_tag(
    State(state): State<Arc<AppState>>,
    Path((id, tag_id)): Path<(String, String)>,
) -> Result<impl IntoResponse> {
    state.core.tags().remove_from_subscription(&id, &tag_id)?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Settings handlers ───────────────────────────────────────────────────────

async fn get_settings(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let settings = state.core.settings().get()?;
    Ok(Json(settings))
}

async fn update_settings(
    State(state): State<Arc<AppState>>,
    Json(data): Json<UpdateSettings>,
) -> Result<impl IntoResponse> {
    let settings = state.core.settings().update(data)?;
    Ok(Json(settings))
}

// ── Price History handlers ──────────────────────────────────────────────────

async fn list_price_history(
    State(state): State<Arc<AppState>>,
    Path(subscription_id): Path<String>,
) -> Result<impl IntoResponse> {
    let history = state
        .core
        .price_history()
        .list_by_subscription(&subscription_id)?;
    Ok(Json(history))
}

#[derive(Deserialize)]
struct RecentDaysQuery {
    days: Option<i64>,
}

async fn get_recent_price_changes(
    State(state): State<Arc<AppState>>,
    Query(query): Query<RecentDaysQuery>,
) -> Result<impl IntoResponse> {
    let changes = state
        .core
        .price_history()
        .list_recent(query.days.unwrap_or(90))?;
    Ok(Json(changes))
}

// ── Data Management handlers ────────────────────────────────────────────────

async fn export_data(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let data = state.core.data_management().export_data()?;
    Ok(Json(data))
}

#[derive(Deserialize)]
struct ImportBody {
    data: BackupData,
    clear_existing: Option<bool>,
}

async fn import_data(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ImportBody>,
) -> Result<impl IntoResponse> {
    let result = state
        .core
        .data_management()
        .import_data(body.data, body.clear_existing.unwrap_or(false))?;
    Ok(Json(result))
}

// ── Trials handlers ─────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ExpiringDaysQuery {
    days: Option<i64>,
}

async fn get_expiring_trials(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ExpiringDaysQuery>,
) -> Result<impl IntoResponse> {
    let subs = state.core.subscriptions().list()?;
    let days = query.days.unwrap_or(7);
    let trials = subby_core::utils::get_expiring_trials(&subs, days);
    let owned: Vec<_> = trials.into_iter().cloned().collect();
    Ok(Json(owned))
}
