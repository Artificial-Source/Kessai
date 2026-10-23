use std::sync::Arc;

use axum::extract::{DefaultBodyLimit, Extension, FromRequest, FromRequestParts, Request, State};
use axum::http::{request::Parts, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post, put};
use axum::Router;
use kessai_core::error::KessaiCoreError;
use kessai_core::models::{
    BackupData, NewCategory, NewPayment, NewPaymentCard, NewSubscription, NewTag,
    SubscriptionStatus, SubscriptionTagLink, UpdateCategory, UpdatePayment, UpdatePaymentCard,
    UpdateSettings, UpdateSubscription, UpdateTag,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::logo::{
    logo_http_client, read_response_limited, safe_fetched_logo_stem, LogoError, LogoStore,
};
use crate::{AccessContext, AppState};

const LOGO_JSON_BODY_LIMIT: usize = 7 * 1024 * 1024;
const BACKUP_JSON_BODY_LIMIT: usize = 25 * 1024 * 1024;

// ── Error handling ──────────────────────────────────────────────────────────

pub struct AppError {
    status: StatusCode,
    error: anyhow::Error,
}

impl AppError {
    fn new(status: StatusCode, error: impl Into<anyhow::Error>) -> Self {
        Self {
            status,
            error: error.into(),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        if self.status.is_server_error() {
            tracing::error!(error = ?self.error, "API operation failed");
        }
        (
            self.status,
            axum::Json(serde_json::json!({ "error": self.error.to_string() })),
        )
            .into_response()
    }
}

impl From<KessaiCoreError> for AppError {
    fn from(error: KessaiCoreError) -> Self {
        let status = match &error {
            KessaiCoreError::Validation(_) | KessaiCoreError::Import(_) => StatusCode::BAD_REQUEST,
            KessaiCoreError::NotFound(_) => StatusCode::NOT_FOUND,
            KessaiCoreError::Conflict(_) | KessaiCoreError::CannotDeleteDefault => {
                StatusCode::CONFLICT
            }
            KessaiCoreError::Database(_)
            | KessaiCoreError::Pool(_)
            | KessaiCoreError::Serialization(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        Self::new(status, error)
    }
}

impl From<anyhow::Error> for AppError {
    fn from(error: anyhow::Error) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, error)
    }
}

impl From<LogoError> for AppError {
    fn from(error: LogoError) -> Self {
        let status = match &error {
            LogoError::Invalid(_) => StatusCode::BAD_REQUEST,
            LogoError::NotFound => StatusCode::NOT_FOUND,
            LogoError::Io(_) | LogoError::Encoding(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        Self::new(status, error)
    }
}

type Result<T> = std::result::Result<T, AppError>;

// Preserve Axum's rejection statuses while giving every extractor the API envelope.
struct Json<T>(T);

impl<T: Serialize> IntoResponse for Json<T> {
    fn into_response(self) -> Response {
        axum::Json(self.0).into_response()
    }
}

impl<S: Send + Sync, T: DeserializeOwned> FromRequest<S> for Json<T> {
    type Rejection = AppError;

    async fn from_request(request: Request, state: &S) -> Result<Self> {
        axum::Json::<T>::from_request(request, state)
            .await
            .map(|axum::Json(value)| Self(value))
            .map_err(|error| AppError::new(error.status(), anyhow::anyhow!(error.body_text())))
    }
}

struct Path<T>(T);

impl<S: Send + Sync, T: DeserializeOwned + Send> FromRequestParts<S> for Path<T> {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self> {
        axum::extract::Path::<T>::from_request_parts(parts, state)
            .await
            .map(|axum::extract::Path(value)| Self(value))
            .map_err(|error| AppError::new(error.status(), anyhow::anyhow!(error.body_text())))
    }
}

struct Query<T>(T);

impl<S: Send + Sync, T: DeserializeOwned> FromRequestParts<S> for Query<T> {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self> {
        axum::extract::Query::<T>::from_request_parts(parts, state)
            .await
            .map(|axum::extract::Query(value)| Self(value))
            .map_err(|error| AppError::new(error.status(), anyhow::anyhow!(error.body_text())))
    }
}

async fn blocking<T, F>(state: Arc<AppState>, work: F) -> Result<T>
where
    T: Send + 'static,
    F: FnOnce(&AppState) -> Result<T> + Send + 'static,
{
    tokio::task::spawn_blocking(move || work(&state))
        .await
        .map_err(|error| AppError::from(anyhow::Error::new(error)))?
}

// ── Router ──────────────────────────────────────────────────────────────────

pub(crate) fn api_router(state: Arc<AppState>, allow_import: bool) -> Router {
    let router = Router::new()
        // Subscriptions
        .route("/subscriptions", get(list_subscriptions))
        .route("/subscriptions", post(create_subscription))
        .route("/subscriptions/{id}", get(get_subscription))
        .route("/subscriptions/{id}", put(update_subscription))
        .route("/subscriptions/{id}", delete(delete_subscription))
        .route(
            "/subscriptions/{id}/toggle",
            post(toggle_subscription_active),
        )
        .route("/subscriptions/{id}/pin", post(toggle_subscription_pinned))
        .route(
            "/subscriptions/{id}/status",
            post(transition_subscription_status),
        )
        .route("/subscriptions/{id}/cancel", post(cancel_subscription))
        .route(
            "/subscriptions/{id}/review",
            post(mark_subscription_reviewed),
        )
        .route(
            "/subscriptions/needs-review",
            get(list_subscriptions_needing_review),
        )
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
        .route(
            "/payments/calendar/{year}/{month}",
            get(list_calendar_payments),
        )
        .route("/payments/{year}/{month}", get(list_payments_by_month))
        .route(
            "/payments/{year}/{month}/details",
            get(list_payments_with_details),
        )
        .route("/payments/mark-paid", post(mark_payment_paid))
        .route("/payments/skip", post(skip_payment))
        .route(
            "/payments/check/{subscription_id}/{due_date}",
            get(is_payment_recorded),
        )
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
        .route(
            "/subscriptions/tags/batch",
            post(list_subscription_tags_batch),
        )
        .route("/subscriptions/{id}/tags", get(list_subscription_tags))
        .route("/subscriptions/{id}/tags", post(add_subscription_tag))
        .route(
            "/subscriptions/{id}/tags/{tag_id}",
            delete(remove_subscription_tag),
        )
        // Access and settings
        .route("/access/status", get(get_access_status))
        .route("/settings", get(get_settings))
        .route("/settings", put(update_settings))
        // Price History
        .route("/price-history/recent", get(get_recent_price_changes))
        .route("/price-history/{subscription_id}", get(list_price_history))
        .route("/price-history/latest", post(list_latest_price_history))
        // Data Management
        .route("/export", get(export_data))
        // Analytics
        .route("/analytics/monthly", get(get_monthly_spending))
        .route("/analytics/year/{year}", get(get_year_summary))
        .route("/analytics/velocity", get(get_spending_velocity))
        .route("/analytics/categories", get(get_category_spending))
        // Logos
        .route(
            "/logos/save",
            post(save_logo).layer(DefaultBodyLimit::max(LOGO_JSON_BODY_LIMIT)),
        )
        .route("/logos/fetch", post(fetch_logo))
        .route("/logos/{filename}", get(get_logo_base64))
        .route("/logos/{filename}", delete(delete_logo))
        // Trials
        .route("/trials/expiring", get(get_expiring_trials));

    let router = if allow_import {
        router.route(
            "/import",
            post(import_data).layer(DefaultBodyLimit::max(BACKUP_JSON_BODY_LIMIT)),
        )
    } else {
        router.route("/import", post(private_hosted_import_disabled))
    };

    router.with_state(state).fallback(api_not_found)
}

// ── Subscription handlers ───────────────────────────────────────────────────

async fn list_subscriptions(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let subs = blocking(state, move |state| Ok(state.core.subscriptions().list()?)).await?;
    Ok(Json(subs))
}

async fn get_subscription(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let sub = blocking(state, move |state| {
        Ok(state.core.subscriptions().get(&id)?)
    })
    .await?;
    Ok(Json(sub))
}

async fn create_subscription(
    State(state): State<Arc<AppState>>,
    Json(data): Json<NewSubscription>,
) -> Result<impl IntoResponse> {
    let sub = blocking(state, move |state| {
        Ok(state.core.subscriptions().create(data)?)
    })
    .await?;
    Ok((StatusCode::CREATED, Json(sub)))
}

async fn update_subscription(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(data): Json<UpdateSubscription>,
) -> Result<impl IntoResponse> {
    let sub = blocking(state, move |state| {
        Ok(state.core.subscriptions().update(&id, data)?)
    })
    .await?;
    Ok(Json(sub))
}

async fn delete_subscription(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    blocking(state, move |state| {
        Ok(state.core.subscriptions().delete(&id)?)
    })
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn toggle_subscription_active(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let sub = blocking(state, move |state| {
        Ok(state.core.subscriptions().toggle_active(&id)?)
    })
    .await?;
    Ok(Json(sub))
}

async fn toggle_subscription_pinned(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let sub = blocking(state, move |state| {
        Ok(state.core.subscriptions().toggle_pinned(&id)?)
    })
    .await?;
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
        .ok_or_else(|| KessaiCoreError::Validation(format!("Invalid status: {}", body.status)))?;
    let sub = blocking(state, move |state| {
        Ok(state
            .core
            .subscriptions()
            .transition_status(&id, new_status)?)
    })
    .await?;
    Ok(Json(sub))
}

#[derive(Deserialize)]
struct CancelBody {
    reason: Option<String>,
}

async fn cancel_subscription(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<CancelBody>,
) -> Result<impl IntoResponse> {
    let sub = blocking(state, move |state| {
        Ok(state
            .core
            .subscriptions()
            .cancel_with_reason(&id, body.reason.as_deref())?)
    })
    .await?;
    Ok(Json(sub))
}

async fn mark_subscription_reviewed(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let sub = blocking(state, move |state| {
        Ok(state.core.subscriptions().mark_reviewed(&id)?)
    })
    .await?;
    Ok(Json(sub))
}

#[derive(Deserialize)]
struct NeedsReviewQuery {
    days: Option<i64>,
}

async fn list_subscriptions_needing_review(
    State(state): State<Arc<AppState>>,
    Query(query): Query<NeedsReviewQuery>,
) -> Result<impl IntoResponse> {
    let subs = blocking(state, move |state| {
        Ok(state
            .core
            .subscriptions()
            .list_needing_review(query.days.unwrap_or(30))?)
    })
    .await?;
    Ok(Json(subs))
}

// ── Category handlers ───────────────────────────────────────────────────────

async fn list_categories(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let cats = blocking(state, move |state| Ok(state.core.categories().list()?)).await?;
    Ok(Json(cats))
}

async fn create_category(
    State(state): State<Arc<AppState>>,
    Json(data): Json<NewCategory>,
) -> Result<impl IntoResponse> {
    let cat = blocking(state, move |state| {
        Ok(state.core.categories().create(data)?)
    })
    .await?;
    Ok((StatusCode::CREATED, Json(cat)))
}

async fn update_category(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(data): Json<UpdateCategory>,
) -> Result<impl IntoResponse> {
    let cat = blocking(state, move |state| {
        Ok(state.core.categories().update(&id, data)?)
    })
    .await?;
    Ok(Json(cat))
}

async fn delete_category(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    blocking(state, move |state| {
        Ok(state.core.categories().delete(&id)?)
    })
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Payment handlers ────────────────────────────────────────────────────────

async fn list_payments(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let payments = blocking(state, move |state| Ok(state.core.payments().list()?)).await?;
    Ok(Json(payments))
}

async fn list_calendar_payments(
    State(state): State<Arc<AppState>>,
    Path((year, month)): Path<(i32, u32)>,
) -> Result<impl IntoResponse> {
    let occurrences = blocking(state, move |state| {
        Ok(state.core.calendar().month(year, month)?)
    })
    .await?;
    Ok(Json(occurrences))
}

async fn list_payments_by_month(
    State(state): State<Arc<AppState>>,
    Path((year, month)): Path<(i32, u32)>,
) -> Result<impl IntoResponse> {
    let payments = blocking(state, move |state| {
        Ok(state.core.payments().list_by_month(year, month)?)
    })
    .await?;
    Ok(Json(payments))
}

async fn list_payments_with_details(
    State(state): State<Arc<AppState>>,
    Path((year, month)): Path<(i32, u32)>,
) -> Result<impl IntoResponse> {
    let payments = blocking(state, move |state| {
        Ok(state.core.payments().list_with_details(year, month)?)
    })
    .await?;
    Ok(Json(payments))
}

async fn create_payment(
    State(state): State<Arc<AppState>>,
    Json(data): Json<NewPayment>,
) -> Result<impl IntoResponse> {
    let payment = blocking(state, move |state| {
        Ok(state.core.payments().create(data)?)
    })
    .await?;
    Ok((StatusCode::CREATED, Json(payment)))
}

async fn update_payment(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(data): Json<UpdatePayment>,
) -> Result<impl IntoResponse> {
    let payment = blocking(state, move |state| {
        Ok(state.core.payments().update(&id, data)?)
    })
    .await?;
    Ok(Json(payment))
}

async fn delete_payment(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    blocking(state, move |state| Ok(state.core.payments().delete(&id)?)).await?;
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
    let payment = blocking(state, move |state| {
        Ok(state.core.payments().mark_as_paid(
            &body.subscription_id,
            &body.due_date,
            body.amount,
        )?)
    })
    .await?;
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
    let payment = blocking(state, move |state| {
        Ok(state.core.payments().skip_payment(
            &body.subscription_id,
            &body.due_date,
            body.amount,
        )?)
    })
    .await?;
    Ok((StatusCode::CREATED, Json(payment)))
}

async fn is_payment_recorded(
    State(state): State<Arc<AppState>>,
    Path((subscription_id, due_date)): Path<(String, String)>,
) -> Result<impl IntoResponse> {
    let recorded = blocking(state, move |state| {
        Ok(state
            .core
            .payments()
            .is_recorded(&subscription_id, &due_date)?)
    })
    .await?;
    Ok(Json(serde_json::json!({ "recorded": recorded })))
}

// ── Payment Card handlers ───────────────────────────────────────────────────

async fn list_payment_cards(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let cards = blocking(state, move |state| Ok(state.core.payment_cards().list()?)).await?;
    Ok(Json(cards))
}

async fn create_payment_card(
    State(state): State<Arc<AppState>>,
    Json(data): Json<NewPaymentCard>,
) -> Result<impl IntoResponse> {
    let card = blocking(state, move |state| {
        Ok(state.core.payment_cards().create(data)?)
    })
    .await?;
    Ok((StatusCode::CREATED, Json(card)))
}

async fn update_payment_card(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(data): Json<UpdatePaymentCard>,
) -> Result<impl IntoResponse> {
    let card = blocking(state, move |state| {
        Ok(state.core.payment_cards().update(&id, data)?)
    })
    .await?;
    Ok(Json(card))
}

async fn delete_payment_card(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    blocking(state, move |state| {
        Ok(state.core.payment_cards().delete(&id)?)
    })
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Tag handlers ────────────────────────────────────────────────────────────

async fn list_tags(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let tags = blocking(state, move |state| Ok(state.core.tags().list()?)).await?;
    Ok(Json(tags))
}

async fn create_tag(
    State(state): State<Arc<AppState>>,
    Json(data): Json<NewTag>,
) -> Result<impl IntoResponse> {
    let tag = blocking(state, move |state| Ok(state.core.tags().create(data)?)).await?;
    Ok((StatusCode::CREATED, Json(tag)))
}

async fn update_tag(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(data): Json<UpdateTag>,
) -> Result<impl IntoResponse> {
    let tag = blocking(state, move |state| {
        Ok(state.core.tags().update(&id, data)?)
    })
    .await?;
    Ok(Json(tag))
}

async fn delete_tag(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    blocking(state, move |state| Ok(state.core.tags().delete(&id)?)).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_subscription_tags(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let tags = blocking(state, move |state| {
        Ok(state.core.tags().list_for_subscription(&id)?)
    })
    .await?;
    Ok(Json(tags))
}

async fn list_subscription_tags_batch(
    State(state): State<Arc<AppState>>,
    Json(subscription_ids): Json<Vec<String>>,
) -> Result<impl IntoResponse> {
    let links: Vec<SubscriptionTagLink> = blocking(state, move |state| {
        Ok(state
            .core
            .tags()
            .list_links_for_subscriptions(&subscription_ids)?)
    })
    .await?;
    Ok(Json(links))
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
    blocking(state, move |state| {
        Ok(state.core.tags().add_to_subscription(&id, &body.tag_id)?)
    })
    .await?;
    Ok(StatusCode::CREATED)
}

async fn remove_subscription_tag(
    State(state): State<Arc<AppState>>,
    Path((id, tag_id)): Path<(String, String)>,
) -> Result<impl IntoResponse> {
    blocking(state, move |state| {
        Ok(state.core.tags().remove_from_subscription(&id, &tag_id)?)
    })
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Settings handlers ───────────────────────────────────────────────────────

async fn get_access_status(Extension(access): Extension<AccessContext>) -> Json<AccessContext> {
    Json(access)
}

async fn get_settings(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let settings = blocking(state, move |state| Ok(state.core.settings().get()?)).await?;
    Ok(Json(settings))
}

async fn update_settings(
    State(state): State<Arc<AppState>>,
    Json(data): Json<UpdateSettings>,
) -> Result<impl IntoResponse> {
    let settings = blocking(state, move |state| {
        Ok(state.core.settings().update(data)?)
    })
    .await?;
    Ok(Json(settings))
}

// ── Price History handlers ──────────────────────────────────────────────────

async fn list_price_history(
    State(state): State<Arc<AppState>>,
    Path(subscription_id): Path<String>,
) -> Result<impl IntoResponse> {
    let history = blocking(state, move |state| {
        Ok(state
            .core
            .price_history()
            .list_by_subscription(&subscription_id)?)
    })
    .await?;
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
    let changes = blocking(state, move |state| {
        Ok(state
            .core
            .price_history()
            .list_recent(query.days.unwrap_or(90))?)
    })
    .await?;
    Ok(Json(changes))
}

async fn list_latest_price_history(
    State(state): State<Arc<AppState>>,
    Json(subscription_ids): Json<Vec<String>>,
) -> Result<impl IntoResponse> {
    let changes = blocking(state, move |state| {
        Ok(state
            .core
            .price_history()
            .list_latest_for_subscriptions(&subscription_ids)?)
    })
    .await?;
    Ok(Json(changes))
}

// ── Data Management handlers ────────────────────────────────────────────────

async fn export_data(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let data = blocking(state, move |state| {
        Ok(state.core.data_management().export_data()?)
    })
    .await?;
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
    let result = blocking(state, move |state| {
        Ok(state
            .core
            .data_management()
            .import_data(body.data, body.clear_existing.unwrap_or(false))?)
    })
    .await?;
    Ok(Json(result))
}

async fn private_hosted_import_disabled() -> impl IntoResponse {
    (
        StatusCode::CONFLICT,
        Json(serde_json::json!({
            "error": "Import is unavailable while Private Web Access is running. Stop Private Web Access and restore the backup in the desktop app."
        })),
    )
}

async fn api_not_found() -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({ "error": "API route not found" })),
    )
}

// ── Analytics handlers ───────────────────────────────────────────────────────

#[derive(Deserialize)]
struct MonthsQuery {
    months: Option<i32>,
}

async fn get_monthly_spending(
    State(state): State<Arc<AppState>>,
    Query(query): Query<MonthsQuery>,
) -> Result<impl IntoResponse> {
    let data = blocking(state, move |state| {
        Ok(state
            .core
            .analytics()
            .monthly_spending(query.months.unwrap_or(12))?)
    })
    .await?;
    Ok(Json(data))
}

async fn get_year_summary(
    State(state): State<Arc<AppState>>,
    Path(year): Path<i32>,
) -> Result<impl IntoResponse> {
    let summary = blocking(state, move |state| {
        Ok(state.core.analytics().year_summary(year)?)
    })
    .await?;
    Ok(Json(summary))
}

async fn get_spending_velocity(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse> {
    let velocity = blocking(state, move |state| {
        Ok(state.core.analytics().spending_velocity()?)
    })
    .await?;
    Ok(Json(velocity))
}

async fn get_category_spending(
    State(state): State<Arc<AppState>>,
    Query(query): Query<MonthsQuery>,
) -> Result<impl IntoResponse> {
    let data = blocking(state, move |state| {
        Ok(state
            .core
            .analytics()
            .category_spending(query.months.unwrap_or(6))?)
    })
    .await?;
    Ok(Json(data))
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
    let owned: Vec<_> = blocking(state, move |state| {
        let subs = state.core.subscriptions().list()?;
        let trials = kessai_core::utils::get_expiring_trials(&subs, query.days.unwrap_or(7));
        Ok(trials.into_iter().cloned().collect())
    })
    .await?;
    Ok(Json(owned))
}

// ── Logo handlers ────────────────────────────────────────────────────────────

async fn get_logo_base64(
    State(state): State<Arc<AppState>>,
    Path(filename): Path<String>,
) -> Result<impl IntoResponse> {
    let data = blocking(state, move |state| {
        Ok(LogoStore::new(&state.logos_dir).read_base64(&filename)?)
    })
    .await?;
    Ok(Json(data))
}

#[derive(Deserialize)]
struct SaveLogoBody {
    data: String,
    subscription_id: String,
}

async fn save_logo(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SaveLogoBody>,
) -> Result<impl IntoResponse> {
    let filename = blocking(state, move |state| {
        Ok(LogoStore::new(&state.logos_dir).save_base64(&body.data, &body.subscription_id)?)
    })
    .await?;

    Ok(Json(filename))
}

async fn delete_logo(
    State(state): State<Arc<AppState>>,
    Path(filename): Path<String>,
) -> Result<impl IntoResponse> {
    blocking(state, move |state| {
        Ok(LogoStore::new(&state.logos_dir).delete(&filename)?)
    })
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct FetchLogoBody {
    name: String,
    domain: Option<String>,
}

async fn fetch_logo(
    State(state): State<Arc<AppState>>,
    Json(body): Json<FetchLogoBody>,
) -> Result<impl IntoResponse> {
    if safe_fetched_logo_stem(&body.name).is_none() {
        return Ok(Json(None::<String>));
    }
    let lookup_name = body.name.trim().to_lowercase().replace(' ', "");

    let domains = if let Some(d) = body.domain.filter(|d| !d.trim().is_empty()) {
        vec![d.trim().to_string()]
    } else {
        vec![
            format!("{}.com", lookup_name),
            format!("{}.io", lookup_name),
            format!("{}.app", lookup_name),
        ]
    };

    let client = logo_http_client()
        .map_err(|error| anyhow::anyhow!("Failed to create HTTP client: {error}"))?;

    for domain in &domains {
        let mut url = reqwest::Url::parse("https://www.google.com/s2/favicons")
            .map_err(anyhow::Error::new)?;
        url.query_pairs_mut()
            .append_pair("domain", domain)
            .append_pair("sz", "128");

        match client.get(url).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(bytes) = read_response_limited(resp).await {
                    // Google returns a default 16x16 globe icon for unknown domains.
                    // Real favicons at sz=128 are typically > 1KB.
                    if bytes.len() > 1000 {
                        let name = body.name.clone();
                        let saved = blocking(state.clone(), move |state| {
                            Ok(LogoStore::new(&state.logos_dir).save_fetched(&bytes, &name)?)
                        })
                        .await;
                        match saved {
                            Ok(filename) => return Ok(Json(Some(filename))),
                            Err(error) if error.status == StatusCode::BAD_REQUEST => continue,
                            Err(error) => return Err(error),
                        }
                    }
                }
            }
            _ => continue,
        }
    }

    Ok(Json(None::<String>))
}
