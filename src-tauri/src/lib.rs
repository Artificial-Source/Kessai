mod private_web_access;

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Arc;

use chrono::NaiveDate;
use serde::Serialize;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::path::BaseDirectory;
use tauri::tray::TrayIconBuilder;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

use kessai_core::error::KessaiCoreError;
use kessai_core::models::{
    BackupData, CalendarOccurrence, CategorySpend, MonthlySpend, NewCategory, NewPayment,
    NewPaymentCard, NewSubscription, NewTag, PaymentWithSubscription, PriceChange,
    SpendingVelocity, SubscriptionStatus, SubscriptionTagLink, Tag, UpdateCategory, UpdatePayment,
    UpdatePaymentCard, UpdateSettings, UpdateSubscription, UpdateTag, YearSummary,
};
use kessai_core::{
    models::{Category, ImportResult, Payment, PaymentCard, Settings, Subscription},
    KessaiCore,
};
use kessai_web::logo::{
    logo_http_client, read_response_limited, safe_fetched_logo_stem, LogoStore,
};
use private_web_access::PrivateWebAccessManager;

/// Global flag to track whether the app should truly quit or just hide to tray.
static QUITTING: AtomicBool = AtomicBool::new(false);
/// Coordinates the initial exit request, asynchronous shutdown, and final exit.
static EXIT_SHUTDOWN_STATE: AtomicU8 = AtomicU8::new(0);
const EXIT_IDLE: u8 = 0;
const EXIT_SHUTTING_DOWN: u8 = 1;
const EXIT_READY: u8 = 2;

fn command_error(error: KessaiCoreError) -> String {
    tracing::error!(%error, "desktop command failed");
    error.to_string()
}

/// Own all captured state so cancellation cannot interrupt blocking work or
/// release the private-web import gate before the restore finishes.
async fn blocking_command<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| {
            tracing::error!(%error, "desktop blocking task failed");
            error.to_string()
        })?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdaterContext {
    executable_path: String,
    bundle_type: Option<String>,
}

/// Only the exact `--hidden` argument requests a hidden login/tray launch.
fn launch_args_request_hidden<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    args.into_iter()
        .any(|argument| argument.as_ref() == std::ffi::OsStr::new("--hidden"))
}

fn show_main_window(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
        let _ = app.set_dock_visibility(true);
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

// ── Logo commands ──────────────────────────────────────────────────────────

/// Resolve on the main thread during setup; logo workers never need an app handle.
struct LogosDir(PathBuf);

#[tauri::command]
async fn save_logo(
    logos_dir: tauri::State<'_, LogosDir>,
    source_path: String,
    subscription_id: String,
) -> Result<String, String> {
    let directory = logos_dir.0.clone();
    blocking_command(move || {
        LogoStore::new(directory)
            .save_file(std::path::Path::new(&source_path), &subscription_id)
            .map_err(|error| error.to_string())
    })
    .await
}

#[tauri::command]
async fn get_logo_base64(
    logos_dir: tauri::State<'_, LogosDir>,
    filename: String,
) -> Result<String, String> {
    let directory = logos_dir.0.clone();
    blocking_command(move || {
        LogoStore::new(directory)
            .read_base64(&filename)
            .map_err(|error| error.to_string())
    })
    .await
}

#[tauri::command]
async fn delete_logo(
    logos_dir: tauri::State<'_, LogosDir>,
    filename: String,
) -> Result<(), String> {
    let directory = logos_dir.0.clone();
    blocking_command(move || {
        LogoStore::new(directory)
            .delete(&filename)
            .map_err(|error| error.to_string())
    })
    .await
}

// ── Logo fetch command ────────────────────────────────────────────────────

#[tauri::command]
async fn fetch_logo(
    logos_dir: tauri::State<'_, LogosDir>,
    name: String,
    domain: Option<String>,
) -> Result<Option<String>, String> {
    tracing::debug!("fetching logo for: {}", name);
    if safe_fetched_logo_stem(&name).is_none() {
        return Ok(None);
    }
    let lookup_name = name.trim().to_lowercase().replace(' ', "");

    let domains = if let Some(d) = domain.filter(|d| !d.trim().is_empty()) {
        vec![d.trim().to_string()]
    } else {
        vec![
            format!("{}.com", lookup_name),
            format!("{}.io", lookup_name),
            format!("{}.app", lookup_name),
        ]
    };

    let client = blocking_command(|| logo_http_client().map_err(|error| error.to_string())).await?;

    for domain in &domains {
        let mut url = reqwest::Url::parse("https://www.google.com/s2/favicons")
            .map_err(|error| error.to_string())?;
        url.query_pairs_mut()
            .append_pair("domain", domain)
            .append_pair("sz", "128");

        match client.get(url).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(bytes) = read_response_limited(resp).await {
                    // Google returns a default 16x16 globe icon for unknown domains.
                    // Real favicons at sz=128 are typically > 1KB.
                    if bytes.len() > 1000 {
                        let directory = logos_dir.0.clone();
                        let service_name = name.clone();
                        if let Ok(filename) = blocking_command(move || {
                            LogoStore::new(directory)
                                .save_fetched(&bytes, &service_name)
                                .map_err(|error| error.to_string())
                        })
                        .await
                        {
                            tracing::info!("fetched logo for: {}", name);
                            return Ok(Some(filename));
                        }
                    }
                }
            }
            _ => continue,
        }
    }

    tracing::debug!("no logo found for: {}", name);
    Ok(None)
}

// ── Subscription commands ──────────────────────────────────────────────────

#[tauri::command]
async fn list_subscriptions(
    core: tauri::State<'_, KessaiCore>,
) -> Result<Vec<Subscription>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("listing subscriptions");
        core.subscriptions().list().map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn get_subscription(
    core: tauri::State<'_, KessaiCore>,
    id: String,
) -> Result<Subscription, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("getting subscription: {}", id);
        core.subscriptions().get(&id).map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn create_subscription(
    core: tauri::State<'_, KessaiCore>,
    data: NewSubscription,
) -> Result<Subscription, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("creating subscription: {}", data.name);
        core.subscriptions().create(data).map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn update_subscription(
    core: tauri::State<'_, KessaiCore>,
    id: String,
    data: UpdateSubscription,
) -> Result<Subscription, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("updating subscription: {}", id);
        core.subscriptions()
            .update(&id, data)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn delete_subscription(core: tauri::State<'_, KessaiCore>, id: String) -> Result<(), String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("deleting subscription: {}", id);
        core.subscriptions().delete(&id).map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn toggle_subscription_active(
    core: tauri::State<'_, KessaiCore>,
    id: String,
) -> Result<Subscription, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("toggling active: {}", id);
        core.subscriptions()
            .toggle_active(&id)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn toggle_subscription_pinned(
    core: tauri::State<'_, KessaiCore>,
    id: String,
) -> Result<Subscription, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("toggling pinned: {}", id);
        core.subscriptions()
            .toggle_pinned(&id)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn cancel_subscription(
    core: tauri::State<'_, KessaiCore>,
    id: String,
    reason: Option<String>,
) -> Result<Subscription, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("cancelling subscription: {}", id);
        core.subscriptions()
            .cancel_with_reason(&id, reason.as_deref())
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn mark_subscription_reviewed(
    core: tauri::State<'_, KessaiCore>,
    id: String,
) -> Result<Subscription, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("marking reviewed: {}", id);
        core.subscriptions()
            .mark_reviewed(&id)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn list_subscriptions_needing_review(
    core: tauri::State<'_, KessaiCore>,
    days: i64,
) -> Result<Vec<Subscription>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("listing subscriptions needing review (days: {})", days);
        core.subscriptions()
            .list_needing_review(days)
            .map_err(command_error)
    })
    .await
}

// ── Category commands ──────────────────────────────────────────────────────

#[tauri::command]
async fn list_categories(core: tauri::State<'_, KessaiCore>) -> Result<Vec<Category>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("listing categories");
        core.categories().list().map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn create_category(
    core: tauri::State<'_, KessaiCore>,
    data: NewCategory,
) -> Result<Category, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("creating category: {}", data.name);
        core.categories().create(data).map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn update_category(
    core: tauri::State<'_, KessaiCore>,
    id: String,
    data: UpdateCategory,
) -> Result<Category, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("updating category: {}", id);
        core.categories().update(&id, data).map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn delete_category(core: tauri::State<'_, KessaiCore>, id: String) -> Result<(), String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("deleting category: {}", id);
        core.categories().delete(&id).map_err(command_error)
    })
    .await
}

// ── Payment commands ───────────────────────────────────────────────────────

#[tauri::command]
async fn list_payments(core: tauri::State<'_, KessaiCore>) -> Result<Vec<Payment>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("listing payments");
        core.payments().list().map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn list_payments_by_month(
    core: tauri::State<'_, KessaiCore>,
    year: i32,
    month: u32,
) -> Result<Vec<Payment>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("listing payments for {}-{:02}", year, month);
        core.payments()
            .list_by_month(year, month)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn list_payments_with_details(
    core: tauri::State<'_, KessaiCore>,
    year: i32,
    month: u32,
) -> Result<Vec<PaymentWithSubscription>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("listing payments with details for {}-{:02}", year, month);
        core.payments()
            .list_with_details(year, month)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn list_calendar_payments(
    core: tauri::State<'_, KessaiCore>,
    year: i32,
    month: u32,
) -> Result<Vec<CalendarOccurrence>, String> {
    let core = core.inner().clone();
    blocking_command(move || core.calendar().month(year, month).map_err(command_error)).await
}

#[tauri::command]
async fn create_payment(
    core: tauri::State<'_, KessaiCore>,
    data: NewPayment,
) -> Result<Payment, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!(
            "creating payment for subscription: {}",
            data.subscription_id
        );
        core.payments().create(data).map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn update_payment(
    core: tauri::State<'_, KessaiCore>,
    id: String,
    data: UpdatePayment,
) -> Result<Payment, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("updating payment: {}", id);
        core.payments().update(&id, data).map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn delete_payment(core: tauri::State<'_, KessaiCore>, id: String) -> Result<(), String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("deleting payment: {}", id);
        core.payments().delete(&id).map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn mark_payment_paid(
    core: tauri::State<'_, KessaiCore>,
    subscription_id: String,
    due_date: String,
    amount: f64,
) -> Result<Payment, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("marking payment paid: {} on {}", subscription_id, due_date);
        core.payments()
            .mark_as_paid(&subscription_id, &due_date, amount)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn skip_payment(
    core: tauri::State<'_, KessaiCore>,
    subscription_id: String,
    due_date: String,
    amount: f64,
) -> Result<Payment, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("skipping payment: {} on {}", subscription_id, due_date);
        core.payments()
            .skip_payment(&subscription_id, &due_date, amount)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn is_payment_recorded(
    core: tauri::State<'_, KessaiCore>,
    subscription_id: String,
    due_date: String,
) -> Result<bool, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!(
            "checking payment recorded: {} on {}",
            subscription_id,
            due_date
        );
        core.payments()
            .is_recorded(&subscription_id, &due_date)
            .map_err(command_error)
    })
    .await
}

// ── Payment card commands ──────────────────────────────────────────────────

#[tauri::command]
async fn list_payment_cards(
    core: tauri::State<'_, KessaiCore>,
) -> Result<Vec<PaymentCard>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("listing payment cards");
        core.payment_cards().list().map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn create_payment_card(
    core: tauri::State<'_, KessaiCore>,
    data: NewPaymentCard,
) -> Result<PaymentCard, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("creating payment card: {}", data.name);
        core.payment_cards().create(data).map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn update_payment_card(
    core: tauri::State<'_, KessaiCore>,
    id: String,
    data: UpdatePaymentCard,
) -> Result<PaymentCard, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("updating payment card: {}", id);
        core.payment_cards()
            .update(&id, data)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn delete_payment_card(core: tauri::State<'_, KessaiCore>, id: String) -> Result<(), String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("deleting payment card: {}", id);
        core.payment_cards().delete(&id).map_err(command_error)
    })
    .await
}

// ── Subscription status commands ─────────────────────────────────────

#[tauri::command]
async fn transition_subscription_status(
    core: tauri::State<'_, KessaiCore>,
    id: String,
    status: String,
) -> Result<Subscription, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("transitioning subscription {} to status: {}", id, status);
        let new_status = SubscriptionStatus::from_str(&status).ok_or_else(|| {
            command_error(KessaiCoreError::Validation(format!(
                "Invalid status: {status}"
            )))
        })?;
        core.subscriptions()
            .transition_status(&id, new_status)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn get_expiring_trials(
    core: tauri::State<'_, KessaiCore>,
    days: Option<i64>,
) -> Result<Vec<Subscription>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        let days = days.unwrap_or(7);
        tracing::debug!("getting expiring trials (days: {})", days);
        let subs = core.subscriptions().list().map_err(command_error)?;
        let trials = kessai_core::utils::get_expiring_trials(&subs, days);
        Ok(trials.into_iter().cloned().collect())
    })
    .await
}

// ── Price history commands ──────────────────────────────────────────

#[tauri::command]
async fn list_price_history(
    core: tauri::State<'_, KessaiCore>,
    subscription_id: String,
) -> Result<Vec<PriceChange>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("listing price history for: {}", subscription_id);
        core.price_history()
            .list_by_subscription(&subscription_id)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn get_recent_price_changes(
    core: tauri::State<'_, KessaiCore>,
    days: Option<i64>,
) -> Result<Vec<PriceChange>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        let days = days.unwrap_or(90);
        tracing::debug!("getting recent price changes (days: {})", days);
        core.price_history()
            .list_recent(days)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn list_latest_price_history(
    core: tauri::State<'_, KessaiCore>,
    subscription_ids: Vec<String>,
) -> Result<Vec<PriceChange>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!(
            "getting latest price changes for {} subscriptions",
            subscription_ids.len()
        );
        core.price_history()
            .list_latest_for_subscriptions(&subscription_ids)
            .map_err(command_error)
    })
    .await
}

// ── Tag commands ──────────────────────────────────────────────────────────

#[tauri::command]
async fn list_tags(core: tauri::State<'_, KessaiCore>) -> Result<Vec<Tag>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("listing tags");
        core.tags().list().map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn create_tag(core: tauri::State<'_, KessaiCore>, data: NewTag) -> Result<Tag, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("creating tag: {}", data.name);
        core.tags().create(data).map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn update_tag(
    core: tauri::State<'_, KessaiCore>,
    id: String,
    data: UpdateTag,
) -> Result<Tag, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("updating tag: {}", id);
        core.tags().update(&id, data).map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn delete_tag(core: tauri::State<'_, KessaiCore>, id: String) -> Result<(), String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("deleting tag: {}", id);
        core.tags().delete(&id).map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn add_subscription_tag(
    core: tauri::State<'_, KessaiCore>,
    subscription_id: String,
    tag_id: String,
) -> Result<(), String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("adding tag {} to subscription {}", tag_id, subscription_id);
        core.tags()
            .add_to_subscription(&subscription_id, &tag_id)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn remove_subscription_tag(
    core: tauri::State<'_, KessaiCore>,
    subscription_id: String,
    tag_id: String,
) -> Result<(), String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!(
            "removing tag {} from subscription {}",
            tag_id,
            subscription_id
        );
        core.tags()
            .remove_from_subscription(&subscription_id, &tag_id)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn list_subscription_tags(
    core: tauri::State<'_, KessaiCore>,
    subscription_id: String,
) -> Result<Vec<Tag>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("listing tags for subscription: {}", subscription_id);
        core.tags()
            .list_for_subscription(&subscription_id)
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn list_subscription_tags_batch(
    core: tauri::State<'_, KessaiCore>,
    subscription_ids: Vec<String>,
) -> Result<Vec<SubscriptionTagLink>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!(
            "listing tag links for {} subscriptions",
            subscription_ids.len()
        );
        core.tags()
            .list_links_for_subscriptions(&subscription_ids)
            .map_err(command_error)
    })
    .await
}

// ── Analytics commands ─────────────────────────────────────────────────────

#[tauri::command]
async fn get_monthly_spending(
    core: tauri::State<'_, KessaiCore>,
    months: Option<i32>,
) -> Result<Vec<MonthlySpend>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("getting monthly spending");
        core.analytics()
            .monthly_spending(months.unwrap_or(12))
            .map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn get_year_summary(
    core: tauri::State<'_, KessaiCore>,
    year: i32,
) -> Result<YearSummary, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("getting year summary for {}", year);
        core.analytics().year_summary(year).map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn get_spending_velocity(
    core: tauri::State<'_, KessaiCore>,
) -> Result<SpendingVelocity, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("getting spending velocity");
        core.analytics().spending_velocity().map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn get_category_spending(
    core: tauri::State<'_, KessaiCore>,
    months: Option<i32>,
) -> Result<Vec<CategorySpend>, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("getting category spending");
        core.analytics()
            .category_spending(months.unwrap_or(6))
            .map_err(command_error)
    })
    .await
}

// ── Settings commands ──────────────────────────────────────────────────────

#[tauri::command]
async fn get_settings(core: tauri::State<'_, KessaiCore>) -> Result<Settings, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::debug!("getting settings");
        core.settings().get().map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn update_settings(
    core: tauri::State<'_, KessaiCore>,
    data: UpdateSettings,
) -> Result<Settings, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("updating settings");
        core.settings().update(data).map_err(command_error)
    })
    .await
}

// ── Data management commands ───────────────────────────────────────────────

#[tauri::command]
async fn export_data(core: tauri::State<'_, KessaiCore>) -> Result<BackupData, String> {
    let core = core.inner().clone();
    blocking_command(move || {
        tracing::info!("exporting data");
        core.data_management().export_data().map_err(command_error)
    })
    .await
}

#[tauri::command]
async fn import_data(
    core: tauri::State<'_, KessaiCore>,
    private_web_access: tauri::State<'_, PrivateWebAccessManager>,
    data: BackupData,
    clear_existing: Option<bool>,
) -> Result<ImportResult, String> {
    let operation = private_web_access.begin_import().await?;
    let clear_existing = clear_existing.unwrap_or(false);
    tracing::info!("importing data (clear_existing: {})", clear_existing);
    let core = core.inner().clone();
    blocking_command(move || {
        let _operation = operation;
        core.data_management()
            .import_data(data, clear_existing)
            .map_err(command_error)
    })
    .await
}

// ── System tray helpers ─────────────────────────────────────────────────────

/// Count subscriptions with `next_payment_date` within the next 7 days.
fn count_upcoming_payments(core: &KessaiCore) -> kessai_core::error::Result<usize> {
    let subs = core.subscriptions().list()?;

    let today = chrono::Local::now().date_naive();
    let week_later = today + chrono::Duration::days(7);

    Ok(subs
        .iter()
        .filter(|s| s.is_active)
        .filter_map(|s| {
            s.next_payment_date
                .as_deref()
                .and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        })
        .filter(|date| *date >= today && *date <= week_later)
        .count())
}

/// Build (or rebuild) the tray menu with the current upcoming payment count.
///
/// Only call through [`TrayUpdater`], which runs this on the main thread.
fn build_tray_menu(app: &tauri::AppHandle, count: usize) -> tauri::Result<()> {
    debug_assert_eq!(
        std::thread::current().name(),
        Some("main"),
        "tray handles must only be cloned or dropped on the main thread"
    );
    let upcoming_label = if count == 0 {
        "No upcoming payments".to_string()
    } else {
        format!("Upcoming payments: {}", count)
    };

    let open_item = MenuItemBuilder::with_id("open", "Open Kessai").build(app)?;
    let upcoming_item = MenuItemBuilder::with_id("upcoming", &upcoming_label)
        .enabled(false)
        .build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&open_item)
        .item(&upcoming_item)
        .item(&separator)
        .item(&quit_item)
        .build()?;

    // Update the existing tray icon's menu
    if let Some(tray) = app.tray_by_id("main-tray") {
        let tooltip = if count == 0 {
            "Kessai".to_string()
        } else {
            format!("Kessai — {} upcoming", count)
        };
        tray.set_tooltip(Some(&tooltip))?;
        tray.set_menu(Some(menu))?;
    }

    Ok(())
}

/// Rebuilds the tray menu on the main thread.
///
/// Tauri's tray icon, menu, and app handles are `Send` but wrap non-atomic
/// `Rc` counts that the event loop also uses (the app-handle case is
/// tauri-apps/tauri#15408). Rebuilding the tray on worker threads cloned and
/// dropped them concurrently, freed the tray icon while it was still in use,
/// and aborted debug builds in `Rc::clone`. This handle is cloned once during
/// setup on the main thread and shared through an atomic `Arc`, so other
/// threads only send the payment count.
#[derive(Clone)]
struct TrayUpdater(Arc<tauri::AppHandle>);

impl TrayUpdater {
    /// Create during setup, which runs on the main thread.
    fn new(app: &tauri::AppHandle) -> Self {
        Self(Arc::new(app.clone()))
    }

    /// Rebuild on the main thread and wait for the outcome.
    async fn update(&self, count: usize) -> tauri::Result<()> {
        let (outcome, rebuilt) = tokio::sync::oneshot::channel();
        let app = Arc::clone(&self.0);
        self.0.run_on_main_thread(move || {
            let _ = outcome.send(build_tray_menu(&app, count));
        })?;
        rebuilt
            .await
            .map_err(|_| tauri::Error::FailedToReceiveMessage)?
    }
}

#[tauri::command]
async fn update_tray_badge(
    tray: tauri::State<'_, TrayUpdater>,
    core: tauri::State<'_, KessaiCore>,
) -> Result<(), String> {
    let core = core.inner().clone();
    let count =
        blocking_command(move || count_upcoming_payments(&core).map_err(command_error)).await?;
    tray.update(count).await.map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_updater_context() -> Result<UpdaterContext, String> {
    blocking_command(|| {
        let executable_path = std::env::current_exe()
            .map_err(|error| error.to_string())?
            .display()
            .to_string();
        let bundle_type = tauri::utils::platform::bundle_type()
            .map(|bundle| format!("{bundle:?}").to_lowercase());
        Ok(UpdaterContext {
            executable_path,
            bundle_type,
        })
    })
    .await
}

fn resolve_private_web_dist(app: &tauri::AppHandle) -> tauri::Result<PathBuf> {
    let resource_dist = app.path().resolve("dist", BaseDirectory::Resource)?;
    #[cfg(debug_assertions)]
    if !resource_dist.join("index.html").is_file() {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist"));
    }
    Ok(resource_dist)
}

// ── App setup ──────────────────────────────────────────────────────────────
fn startup_error_message(error: &dyn std::fmt::Display, app_data_path: &str) -> String {
    format!("Kessai could not start.\n\n{error}\n\nApp data: {app_data_path}")
}

fn report_startup_error(message: &str) {
    tracing::error!("{message}");
    // Tracing may not yet be initialized when storage or builder setup fails.
    eprintln!("{message}");
}

fn show_setup_error(app: &tauri::AppHandle, error: &dyn std::fmt::Display) {
    let app_data_path = app
        .path()
        .app_data_dir()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|error| {
            format!(
                "unavailable ({error}); identifier {}",
                app.config().identifier
            )
        });
    let message = startup_error_message(error, &app_data_path);
    report_startup_error(&message);
    let app = app.clone();
    // The plugin dispatches onto the main thread; keep the event loop alive
    // while this worker waits for the native dialog to be dismissed.
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(message)
            .title("Kessai startup error")
            .kind(tauri_plugin_dialog::MessageDialogKind::Error)
            .blocking_show();
        QUITTING.store(true, Ordering::SeqCst);
        app.exit(1);
    });
}

fn pre_runtime_app_data_path(identifier: &str) -> String {
    #[cfg(target_os = "windows")]
    let base = std::env::var_os("APPDATA").map(PathBuf::from);
    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME")
        .map(|home| PathBuf::from(home).join("Library/Application Support"));
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")));
    base.map(|path| path.join(identifier).display().to_string())
        .unwrap_or_else(|| format!("unavailable; identifier {identifier}"))
}

fn logging_filter(directives: &str) -> tracing_subscriber::EnvFilter {
    tracing_subscriber::EnvFilter::try_new(directives)
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
                // A second-instance launch with exact `--hidden` stays in the tray.
                if !launch_args_request_hidden(args) {
                    show_main_window(app);
                }
            }))
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--hidden"]),
            ));
    }

    let context = tauri::generate_context!();
    let app_data_path = pre_runtime_app_data_path(&context.config().identifier);
    let app = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let setup_result = (|| -> Result<(), Box<dyn std::error::Error>> {
            let hidden_launch = launch_args_request_hidden(std::env::args_os());

            #[cfg(target_os = "macos")]
            if hidden_launch {
                app.handle()
                    .set_activation_policy(tauri::ActivationPolicy::Accessory)?;
                app.handle().set_dock_visibility(false)?;
            }

            let app_data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data_dir)
                .map_err(|error| std::io::Error::new(error.kind(), format!("Failed to create app data directory {}: {error}", app_data_dir.display())))?;

            // ── Logging setup ────────────────────────────────────────────
            let logs_dir = app_data_dir.join("logs");
            fs::create_dir_all(&logs_dir)
                .map_err(|error| std::io::Error::new(error.kind(), format!("Failed to create logs directory {}: {error}", logs_dir.display())))?;

            let file_appender = tracing_appender::rolling::Builder::new()
                .rotation(tracing_appender::rolling::Rotation::DAILY)
                .filename_prefix("kessai.log")
                .build(&logs_dir)?;
            let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

            // Keep the guard alive for the lifetime of the app
            // by leaking it (it's a singleton that lives forever anyway)
            std::mem::forget(_guard);

            let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| logging_filter("info,kessai_lib=debug,kessai_core=debug"));

            use tracing_subscriber::layer::SubscriberExt;
            use tracing_subscriber::util::SubscriberInitExt;

            tracing_subscriber::registry()
                .with(env_filter)
                .with(tracing_subscriber::fmt::layer().with_writer(std::io::stderr))
                .with(
                    tracing_subscriber::fmt::layer()
                        .with_writer(non_blocking)
                        .with_ansi(false),
                )
                .try_init()
                .map_err(|error| std::io::Error::other(error.to_string()))?;

            tracing::info!("Kessai starting up");
            tracing::info!("Logs directory: {}", logs_dir.display());

            let db_path = app_data_dir.join("kessai.db");
            tracing::info!("Opening database at: {}", db_path.display());

            let core = KessaiCore::new(&db_path)
                .map_err(|error| std::io::Error::other(format!("Failed to initialize database {}: {error}", db_path.display())))?;
            let upcoming_count = count_upcoming_payments(&core)?;
            let handle = app.handle().clone();
            let logos_dir = app_data_dir.join("logos");
            let private_web_access = PrivateWebAccessManager::new(
                app_data_dir.join("private-web-access.json"),
                resolve_private_web_dist(&handle)?,
                core.clone(),
                logos_dir.clone(),
            );
            let private_web_access_startup = private_web_access.clone();

            app.manage(core);
            app.manage(private_web_access);
            tauri::async_runtime::spawn(async move {
                private_web_access_startup.auto_start().await;
            });

            // ── System tray setup ──────────────────────────────────────────

            // Build the initial tray menu
            let upcoming_label = if upcoming_count == 0 {
                "No upcoming payments".to_string()
            } else {
                format!("Upcoming payments: {}", upcoming_count)
            };

            let open_item = MenuItemBuilder::with_id("open", "Open Kessai").build(&handle)?;
            let upcoming_item = MenuItemBuilder::with_id("upcoming", &upcoming_label)
                .enabled(false)
                .build(&handle)?;
            let separator = PredefinedMenuItem::separator(&handle)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(&handle)?;

            let menu = MenuBuilder::new(&handle)
                .item(&open_item)
                .item(&upcoming_item)
                .item(&separator)
                .item(&quit_item)
                .build()?;

            let tooltip = if upcoming_count == 0 {
                "Kessai".to_string()
            } else {
                format!("Kessai — {} upcoming", upcoming_count)
            };

            let icon = app.default_window_icon()
                .ok_or_else(|| std::io::Error::other("The default tray icon is missing"))?;
            TrayIconBuilder::with_id("main-tray")
                .icon(icon.clone())
                .tooltip(&tooltip)
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "open" => {
                        show_main_window(app);
                    }
                    "quit" => {
                        QUITTING.store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        show_main_window(app);
                    }
                })
                .build(app)?;
            let tray_updater = TrayUpdater::new(app.handle());
            app.manage(tray_updater.clone());
            app.manage(LogosDir(logos_dir));

            // ── Periodic tray badge refresh (every 5 minutes) ──────────────
            let periodic_handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut warned_database = false;
                let mut warned_tray = false;
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(300));
                    if let Some(core) = periodic_handle.try_state::<KessaiCore>() {
                        let count = match count_upcoming_payments(&core) {
                            Ok(count) => count,
                            Err(error) => {
                                if !warned_database {
                                    tracing::warn!(%error, "tray refresh could not read payments; keeping previous badge");
                                    warned_database = true;
                                }
                                continue;
                            }
                        };
                        if let Err(error) =
                            tauri::async_runtime::block_on(tray_updater.update(count))
                        {
                            if !warned_tray {
                                tracing::warn!(%error, "tray refresh could not update native tray");
                                warned_tray = true;
                            }
                        }
                    }
                }
            });

            // Main window starts invisible to avoid a flash on hidden login launch.
            // Normal startups explicitly show/focus it after setup completes.
            if !hidden_launch {
                show_main_window(app.handle());
            }

            Ok(())
            })();
            if let Err(error) = setup_result {
                show_setup_error(app.handle(), &error);
            }
            // Returning an error makes Tauri panic before displaying diagnostics.
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !QUITTING.load(Ordering::SeqCst) {
                    // Hide to tray instead of quitting
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Logo
            save_logo,
            get_logo_base64,
            delete_logo,
            fetch_logo,
            // Subscriptions
            list_subscriptions,
            get_subscription,
            create_subscription,
            update_subscription,
            delete_subscription,
            toggle_subscription_active,
            toggle_subscription_pinned,
            transition_subscription_status,
            cancel_subscription,
            get_expiring_trials,
            mark_subscription_reviewed,
            list_subscriptions_needing_review,
            // Categories
            list_categories,
            create_category,
            update_category,
            delete_category,
            // Payments
            list_payments,
            list_payments_by_month,
            list_payments_with_details,
            list_calendar_payments,
            create_payment,
            update_payment,
            delete_payment,
            mark_payment_paid,
            skip_payment,
            is_payment_recorded,
            // Price history
            list_price_history,
            get_recent_price_changes,
            list_latest_price_history,
            // Analytics
            get_monthly_spending,
            get_year_summary,
            get_spending_velocity,
            get_category_spending,
            // Payment cards
            list_payment_cards,
            create_payment_card,
            update_payment_card,
            delete_payment_card,
            // Tags
            list_tags,
            create_tag,
            update_tag,
            delete_tag,
            add_subscription_tag,
            remove_subscription_tag,
            list_subscription_tags,
            list_subscription_tags_batch,
            // Settings
            get_settings,
            update_settings,
            // Data management
            export_data,
            import_data,
            // System tray
            update_tray_badge,
            // Updater
            get_updater_context,
            // Private Web Access
            private_web_access::get_private_web_access_status,
            private_web_access::apply_private_web_access,
        ])
        .build(context);
    let app = match app {
        Ok(app) => app,
        Err(error) => {
            let message = startup_error_message(&error, &app_data_path);
            report_startup_error(&message);
            rfd::MessageDialog::new()
                .set_title("Kessai startup error")
                .set_description(message)
                .set_level(rfd::MessageLevel::Error)
                .show();
            std::process::exit(1);
        }
    };
    app.run(|app, event| match event {
        tauri::RunEvent::ExitRequested { code, api, .. } => {
            if EXIT_SHUTDOWN_STATE.load(Ordering::SeqCst) == EXIT_READY {
                return;
            }

            api.prevent_exit();
            QUITTING.store(true, Ordering::SeqCst);
            if EXIT_SHUTDOWN_STATE
                .compare_exchange(
                    EXIT_IDLE,
                    EXIT_SHUTTING_DOWN,
                    Ordering::SeqCst,
                    Ordering::SeqCst,
                )
                .is_ok()
            {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(manager) = handle.try_state::<PrivateWebAccessManager>() {
                        manager.shutdown_for_exit().await;
                    }
                    EXIT_SHUTDOWN_STATE.store(EXIT_READY, Ordering::SeqCst);
                    handle.exit(code.unwrap_or(0));
                });
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } => {
            if !has_visible_windows {
                show_main_window(app);
            }
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_errors_preserve_typed_messages() {
        for (error, expected) in [
            (
                KessaiCoreError::Validation("invalid month".into()),
                "Validation error: invalid month",
            ),
            (
                KessaiCoreError::NotFound("subscription".into()),
                "Not found: subscription",
            ),
            (
                KessaiCoreError::Conflict("already paid".into()),
                "Conflict: already paid",
            ),
            (
                KessaiCoreError::CannotDeleteDefault,
                "Cannot delete default category",
            ),
            (
                KessaiCoreError::Import("invalid backup".into()),
                "Import error: invalid backup",
            ),
        ] {
            assert_eq!(command_error(error), expected);
        }
    }

    #[tokio::test]
    async fn calendar_command_rejects_out_of_range_arguments() {
        let directory = tempfile::tempdir().unwrap();
        let core = KessaiCore::new(&directory.path().join("calendar.db")).unwrap();
        let app = tauri::test::mock_builder()
            .manage(core)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        for (year, month, expected) in [
            (2026, 0, "Validation error: month must be from 1 to 12"),
            (2026, 13, "Validation error: month must be from 1 to 12"),
            (1899, 1, "Validation error: year must be from 1900 to 9998"),
            (9999, 1, "Validation error: year must be from 1900 to 9998"),
        ] {
            assert_eq!(
                list_calendar_payments(app.state(), year, month)
                    .await
                    .unwrap_err(),
                expected
            );
        }
        assert!(list_calendar_payments(app.state(), 2026, 10)
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn subscription_command_records_each_price_change_once() {
        let directory = tempfile::tempdir().unwrap();
        let core = KessaiCore::new(&directory.path().join("history.db")).unwrap();
        let app = tauri::test::mock_builder()
            .manage(core)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let data = serde_json::from_str(
            r#"{"name":"Service","amount":10,"currency":"USD","billing_cycle":"monthly"}"#,
        )
        .unwrap();
        let subscription = create_subscription(app.state(), data).await.unwrap();
        for data in [
            UpdateSubscription {
                amount: Some(20.0),
                ..Default::default()
            },
            UpdateSubscription {
                currency: Some("EUR".into()),
                ..Default::default()
            },
        ] {
            update_subscription(app.state(), subscription.id.clone(), data)
                .await
                .unwrap();
        }
        let history = list_price_history(app.state(), subscription.id.clone())
            .await
            .unwrap();
        assert_eq!(history.len(), 2);
        update_subscription(
            app.state(),
            subscription.id.clone(),
            UpdateSubscription::default(),
        )
        .await
        .unwrap();
        assert_eq!(
            list_price_history(app.state(), subscription.id)
                .await
                .unwrap()
                .len(),
            2
        );
    }

    #[tokio::test]
    async fn blocking_commands_run_off_the_callers_thread() {
        let caller = std::thread::current().id();
        let worker = blocking_command(|| Ok(std::thread::current().id()))
            .await
            .unwrap();
        assert_ne!(worker, caller);
    }

    #[test]
    fn tray_query_failure_does_not_become_a_zero_badge() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("tray.db");
        let core = KessaiCore::new(&path).unwrap();
        assert_eq!(count_upcoming_payments(&core).unwrap(), 0);
        kessai_core::db::create_pool(&path)
            .unwrap()
            .get()
            .unwrap()
            .execute_batch("DROP TABLE subscriptions")
            .unwrap();
        assert!(count_upcoming_payments(&core).is_err());
    }

    #[test]
    fn malformed_logging_directives_fall_back_without_panicking() {
        assert_eq!(logging_filter("kessai=not-a-level").to_string(), "info");
    }

    #[test]
    fn startup_diagnostics_include_the_error_and_storage_path() {
        assert_eq!(
            startup_error_message(&"Permission denied", "/tmp/kessai-data"),
            "Kessai could not start.\n\nPermission denied\n\nApp data: /tmp/kessai-data"
        );
    }

    #[test]
    fn only_the_exact_autostart_argument_requests_hidden_launch() {
        assert!(launch_args_request_hidden(["kessai", "--hidden"]));
        assert!(!launch_args_request_hidden(["kessai"]));
        assert!(!launch_args_request_hidden(["kessai", "--hidden=true"]));
        assert!(!launch_args_request_hidden(["kessai", "--Hidden"]));
    }
}
