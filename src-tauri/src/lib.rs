use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::NaiveDate;
use image::ImageReader;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

use subby_core::models::{
    BackupData, CategorySpend, MonthlySpend, NewCategory, NewPayment, NewPaymentCard,
    NewSubscription, NewTag, PaymentWithSubscription, PriceChange, SpendingVelocity,
    SubscriptionStatus, Tag, UpdateCategory, UpdatePayment, UpdatePaymentCard, UpdateSettings,
    UpdateSubscription, UpdateTag, YearSummary,
};
use subby_core::{
    models::{Category, ImportResult, Payment, PaymentCard, Settings, Subscription},
    SubbyCore,
};

/// Global flag to track whether the app should truly quit or just hide to tray.
static QUITTING: AtomicBool = AtomicBool::new(false);

// ── Logo commands (unchanged) ──────────────────────────────────────────────

fn get_logos_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    let resource_dir = app_handle
        .path()
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let logos_dir = resource_dir.join("data").join("logos");
    fs::create_dir_all(&logos_dir).ok();
    logos_dir
}

fn is_valid_logo_filename(filename: &str) -> bool {
    let valid_chars = filename
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.');

    valid_chars
        && filename.ends_with(".webp")
        && !filename.contains("..")
        && !filename.contains('/')
        && !filename.contains('\\')
        && !filename.starts_with('.')
}

#[tauri::command]
fn save_logo(
    app_handle: tauri::AppHandle,
    source_path: String,
    subscription_id: String,
) -> Result<String, String> {
    tracing::debug!("saving logo for subscription: {}", subscription_id);
    let logos_dir = get_logos_dir(&app_handle);
    let filename = format!("{}.webp", subscription_id);

    // Validate filename to prevent path traversal
    if !is_valid_logo_filename(&filename) {
        tracing::error!("invalid subscription ID for logo filename: {}", subscription_id);
        return Err("Invalid subscription ID for logo filename".to_string());
    }

    let dest_path = logos_dir.join(&filename);

    let img = ImageReader::open(&source_path)
        .map_err(|e| {
            tracing::error!("failed to open image: {}", e);
            format!("Failed to open image: {}", e)
        })?
        .decode()
        .map_err(|e| {
            tracing::error!("failed to decode image: {}", e);
            format!("Failed to decode image: {}", e)
        })?;

    let resized = img.thumbnail(256, 256);

    resized
        .save_with_format(&dest_path, image::ImageFormat::WebP)
        .map_err(|e| {
            tracing::error!("failed to save WebP: {}", e);
            format!("Failed to save WebP: {}", e)
        })?;

    Ok(filename)
}

#[tauri::command]
fn get_logo_base64(app_handle: tauri::AppHandle, filename: String) -> Result<String, String> {
    if !is_valid_logo_filename(&filename) {
        return Err("Invalid filename".to_string());
    }

    let logos_dir = get_logos_dir(&app_handle);
    let file_path = logos_dir.join(&filename);

    let data = fs::read(&file_path).map_err(|e| {
        tracing::error!("failed to read logo {}: {}", filename, e);
        format!("Failed to read logo: {}", e)
    })?;

    let base64_data = BASE64.encode(&data);
    Ok(format!("data:image/webp;base64,{}", base64_data))
}

#[tauri::command]
fn delete_logo(app_handle: tauri::AppHandle, filename: String) -> Result<(), String> {
    if !is_valid_logo_filename(&filename) {
        return Err("Invalid filename".to_string());
    }

    tracing::info!("deleting logo: {}", filename);
    let logos_dir = get_logos_dir(&app_handle);
    let file_path = logos_dir.join(&filename);
    fs::remove_file(&file_path).ok();
    Ok(())
}

// ── Logo fetch command ────────────────────────────────────────────────────

#[tauri::command]
async fn fetch_logo(
    app_handle: tauri::AppHandle,
    name: String,
    domain: Option<String>,
) -> Result<Option<String>, String> {
    tracing::debug!("fetching logo for: {}", name);
    let clean_name = name.trim().to_lowercase().replace(' ', "");
    if clean_name.is_empty() {
        return Ok(None);
    }

    let domains = if let Some(d) = domain.filter(|d| !d.trim().is_empty()) {
        vec![d.trim().to_string()]
    } else {
        vec![
            format!("{}.com", clean_name),
            format!("{}.io", clean_name),
            format!("{}.app", clean_name),
        ]
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| {
            tracing::error!("failed to create HTTP client: {}", e);
            format!("Failed to create HTTP client: {}", e)
        })?;

    for domain in &domains {
        let url = format!(
            "https://www.google.com/s2/favicons?domain={}&sz=128",
            domain
        );

        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(bytes) = resp.bytes().await {
                    // Google returns a default 16x16 globe icon for unknown domains.
                    // Real favicons at sz=128 are typically > 1KB.
                    if bytes.len() > 1000 {
                        let logos_dir = get_logos_dir(&app_handle);
                        let filename = format!("fetched-{}.webp", clean_name);
                        let dest_path = logos_dir.join(&filename);

                        // Decode the fetched PNG into an image and save as WebP
                        if let Ok(img) = image::load_from_memory(&bytes) {
                            let resized = img.thumbnail(128, 128);
                            if resized
                                .save_with_format(&dest_path, image::ImageFormat::WebP)
                                .is_ok()
                            {
                                tracing::info!("fetched logo for: {}", name);
                                return Ok(Some(filename));
                            }
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
fn list_subscriptions(core: tauri::State<'_, SubbyCore>) -> Result<Vec<Subscription>, String> {
    tracing::debug!("listing subscriptions");
    core.subscriptions().list().map_err(|e| {
        tracing::error!("failed to list subscriptions: {}", e);
        e.to_string()
    })
}

#[tauri::command]
fn get_subscription(core: tauri::State<'_, SubbyCore>, id: String) -> Result<Subscription, String> {
    tracing::debug!("getting subscription: {}", id);
    core.subscriptions().get(&id).map_err(|e| {
        tracing::error!("failed to get subscription {}: {}", id, e);
        e.to_string()
    })
}

#[tauri::command]
fn create_subscription(
    core: tauri::State<'_, SubbyCore>,
    data: NewSubscription,
) -> Result<Subscription, String> {
    tracing::info!("creating subscription: {}", data.name);
    core.subscriptions().create(data).map_err(|e| {
        tracing::error!("failed to create subscription: {}", e);
        e.to_string()
    })
}

#[tauri::command]
fn update_subscription(
    core: tauri::State<'_, SubbyCore>,
    id: String,
    data: UpdateSubscription,
) -> Result<Subscription, String> {
    tracing::info!("updating subscription: {}", id);
    // Auto-detect price changes and record history
    if let Some(new_amount) = data.amount {
        if let Ok(existing) = core.subscriptions().get(&id) {
            if (existing.amount - new_amount).abs() > 0.001 {
                tracing::info!(
                    "price change detected for {}: {} -> {}",
                    id,
                    existing.amount,
                    new_amount
                );
                let new_currency = data
                    .currency
                    .as_deref()
                    .unwrap_or(&existing.currency);
                let _ = core.price_history().record(
                    &id,
                    existing.amount,
                    new_amount,
                    &existing.currency,
                    new_currency,
                );
            }
        }
    }

    core.subscriptions()
        .update(&id, data)
        .map_err(|e| {
            tracing::error!("failed to update subscription {}: {}", id, e);
            e.to_string()
        })
}

#[tauri::command]
fn delete_subscription(core: tauri::State<'_, SubbyCore>, id: String) -> Result<(), String> {
    tracing::info!("deleting subscription: {}", id);
    core.subscriptions().delete(&id).map_err(|e| {
        tracing::error!("failed to delete subscription {}: {}", id, e);
        e.to_string()
    })
}

#[tauri::command]
fn toggle_subscription_active(
    core: tauri::State<'_, SubbyCore>,
    id: String,
) -> Result<Subscription, String> {
    tracing::info!("toggling active: {}", id);
    core.subscriptions()
        .toggle_active(&id)
        .map_err(|e| {
            tracing::error!("failed to toggle active {}: {}", id, e);
            e.to_string()
        })
}

#[tauri::command]
fn toggle_subscription_pinned(
    core: tauri::State<'_, SubbyCore>,
    id: String,
) -> Result<Subscription, String> {
    tracing::debug!("toggling pinned: {}", id);
    core.subscriptions()
        .toggle_pinned(&id)
        .map_err(|e| {
            tracing::error!("failed to toggle pinned {}: {}", id, e);
            e.to_string()
        })
}

#[tauri::command]
fn cancel_subscription(
    core: tauri::State<'_, SubbyCore>,
    id: String,
    reason: Option<String>,
) -> Result<Subscription, String> {
    tracing::info!("cancelling subscription: {}", id);
    core.subscriptions()
        .cancel_with_reason(&id, reason.as_deref())
        .map_err(|e| {
            tracing::error!("failed to cancel subscription {}: {}", id, e);
            e.to_string()
        })
}

#[tauri::command]
fn mark_subscription_reviewed(
    core: tauri::State<'_, SubbyCore>,
    id: String,
) -> Result<Subscription, String> {
    tracing::debug!("marking reviewed: {}", id);
    core.subscriptions()
        .mark_reviewed(&id)
        .map_err(|e| {
            tracing::error!("failed to mark reviewed {}: {}", id, e);
            e.to_string()
        })
}

#[tauri::command]
fn list_subscriptions_needing_review(
    core: tauri::State<'_, SubbyCore>,
    days: i64,
) -> Result<Vec<Subscription>, String> {
    tracing::debug!("listing subscriptions needing review (days: {})", days);
    core.subscriptions()
        .list_needing_review(days)
        .map_err(|e| {
            tracing::error!("failed to list subscriptions needing review: {}", e);
            e.to_string()
        })
}


// ── Category commands ──────────────────────────────────────────────────────

#[tauri::command]
fn list_categories(core: tauri::State<'_, SubbyCore>) -> Result<Vec<Category>, String> {
    tracing::debug!("listing categories");
    core.categories().list().map_err(|e| {
        tracing::error!("failed to list categories: {}", e);
        e.to_string()
    })
}

#[tauri::command]
fn create_category(
    core: tauri::State<'_, SubbyCore>,
    data: NewCategory,
) -> Result<Category, String> {
    tracing::info!("creating category: {}", data.name);
    core.categories().create(data).map_err(|e| {
        tracing::error!("failed to create category: {}", e);
        e.to_string()
    })
}

#[tauri::command]
fn update_category(
    core: tauri::State<'_, SubbyCore>,
    id: String,
    data: UpdateCategory,
) -> Result<Category, String> {
    tracing::info!("updating category: {}", id);
    core.categories()
        .update(&id, data)
        .map_err(|e| {
            tracing::error!("failed to update category {}: {}", id, e);
            e.to_string()
        })
}

#[tauri::command]
fn delete_category(core: tauri::State<'_, SubbyCore>, id: String) -> Result<(), String> {
    tracing::info!("deleting category: {}", id);
    core.categories().delete(&id).map_err(|e| {
        tracing::error!("failed to delete category {}: {}", id, e);
        e.to_string()
    })
}

// ── Payment commands ───────────────────────────────────────────────────────

#[tauri::command]
fn list_payments(core: tauri::State<'_, SubbyCore>) -> Result<Vec<Payment>, String> {
    tracing::debug!("listing payments");
    core.payments().list().map_err(|e| {
        tracing::error!("failed to list payments: {}", e);
        e.to_string()
    })
}

#[tauri::command]
fn list_payments_by_month(
    core: tauri::State<'_, SubbyCore>,
    year: i32,
    month: u32,
) -> Result<Vec<Payment>, String> {
    tracing::debug!("listing payments for {}-{:02}", year, month);
    core.payments()
        .list_by_month(year, month)
        .map_err(|e| {
            tracing::error!("failed to list payments by month: {}", e);
            e.to_string()
        })
}

#[tauri::command]
fn list_payments_with_details(
    core: tauri::State<'_, SubbyCore>,
    year: i32,
    month: u32,
) -> Result<Vec<PaymentWithSubscription>, String> {
    tracing::debug!("listing payments with details for {}-{:02}", year, month);
    core.payments()
        .list_with_details(year, month)
        .map_err(|e| {
            tracing::error!("failed to list payments with details: {}", e);
            e.to_string()
        })
}

#[tauri::command]
fn create_payment(core: tauri::State<'_, SubbyCore>, data: NewPayment) -> Result<Payment, String> {
    tracing::info!("creating payment for subscription: {}", data.subscription_id);
    core.payments().create(data).map_err(|e| {
        tracing::error!("failed to create payment: {}", e);
        e.to_string()
    })
}

#[tauri::command]
fn update_payment(
    core: tauri::State<'_, SubbyCore>,
    id: String,
    data: UpdatePayment,
) -> Result<Payment, String> {
    tracing::info!("updating payment: {}", id);
    core.payments().update(&id, data).map_err(|e| {
        tracing::error!("failed to update payment {}: {}", id, e);
        e.to_string()
    })
}

#[tauri::command]
fn delete_payment(core: tauri::State<'_, SubbyCore>, id: String) -> Result<(), String> {
    tracing::info!("deleting payment: {}", id);
    core.payments().delete(&id).map_err(|e| {
        tracing::error!("failed to delete payment {}: {}", id, e);
        e.to_string()
    })
}

#[tauri::command]
fn mark_payment_paid(
    core: tauri::State<'_, SubbyCore>,
    subscription_id: String,
    due_date: String,
    amount: f64,
) -> Result<Payment, String> {
    tracing::info!("marking payment paid: {} on {}", subscription_id, due_date);
    core.payments()
        .mark_as_paid(&subscription_id, &due_date, amount)
        .map_err(|e| {
            tracing::error!("failed to mark payment paid: {}", e);
            e.to_string()
        })
}

#[tauri::command]
fn skip_payment(
    core: tauri::State<'_, SubbyCore>,
    subscription_id: String,
    due_date: String,
    amount: f64,
) -> Result<Payment, String> {
    tracing::info!("skipping payment: {} on {}", subscription_id, due_date);
    core.payments()
        .skip_payment(&subscription_id, &due_date, amount)
        .map_err(|e| {
            tracing::error!("failed to skip payment: {}", e);
            e.to_string()
        })
}

#[tauri::command]
fn is_payment_recorded(
    core: tauri::State<'_, SubbyCore>,
    subscription_id: String,
    due_date: String,
) -> Result<bool, String> {
    tracing::debug!("checking payment recorded: {} on {}", subscription_id, due_date);
    core.payments()
        .is_recorded(&subscription_id, &due_date)
        .map_err(|e| {
            tracing::error!("failed to check payment recorded: {}", e);
            e.to_string()
        })
}

// ── Payment card commands ──────────────────────────────────────────────────

#[tauri::command]
fn list_payment_cards(core: tauri::State<'_, SubbyCore>) -> Result<Vec<PaymentCard>, String> {
    tracing::debug!("listing payment cards");
    core.payment_cards().list().map_err(|e| {
        tracing::error!("failed to list payment cards: {}", e);
        e.to_string()
    })
}

#[tauri::command]
fn create_payment_card(
    core: tauri::State<'_, SubbyCore>,
    data: NewPaymentCard,
) -> Result<PaymentCard, String> {
    tracing::info!("creating payment card: {}", data.name);
    core.payment_cards().create(data).map_err(|e| {
        tracing::error!("failed to create payment card: {}", e);
        e.to_string()
    })
}

#[tauri::command]
fn update_payment_card(
    core: tauri::State<'_, SubbyCore>,
    id: String,
    data: UpdatePaymentCard,
) -> Result<PaymentCard, String> {
    tracing::info!("updating payment card: {}", id);
    core.payment_cards()
        .update(&id, data)
        .map_err(|e| {
            tracing::error!("failed to update payment card {}: {}", id, e);
            e.to_string()
        })
}

#[tauri::command]
fn delete_payment_card(core: tauri::State<'_, SubbyCore>, id: String) -> Result<(), String> {
    tracing::info!("deleting payment card: {}", id);
    core.payment_cards().delete(&id).map_err(|e| {
        tracing::error!("failed to delete payment card {}: {}", id, e);
        e.to_string()
    })
}

// ── Subscription status commands ─────────────────────────────────────

#[tauri::command]
fn transition_subscription_status(
    core: tauri::State<'_, SubbyCore>,
    id: String,
    status: String,
) -> Result<Subscription, String> {
    tracing::info!("transitioning subscription {} to status: {}", id, status);
    let new_status = SubscriptionStatus::from_str(&status)
        .ok_or_else(|| format!("Invalid status: {status}"))?;
    core.subscriptions()
        .transition_status(&id, new_status)
        .map_err(|e| {
            tracing::error!("failed to transition subscription status {}: {}", id, e);
            e.to_string()
        })
}

#[tauri::command]
fn get_expiring_trials(
    core: tauri::State<'_, SubbyCore>,
    days: Option<i64>,
) -> Result<Vec<Subscription>, String> {
    let days = days.unwrap_or(7);
    tracing::debug!("getting expiring trials (days: {})", days);
    let subs = core.subscriptions().list().map_err(|e| {
        tracing::error!("failed to list subscriptions for expiring trials: {}", e);
        e.to_string()
    })?;
    let trials = subby_core::utils::get_expiring_trials(&subs, days);
    Ok(trials.into_iter().cloned().collect())
}

// ── Price history commands ──────────────────────────────────────────

#[tauri::command]
fn list_price_history(
    core: tauri::State<'_, SubbyCore>,
    subscription_id: String,
) -> Result<Vec<PriceChange>, String> {
    tracing::debug!("listing price history for: {}", subscription_id);
    core.price_history()
        .list_by_subscription(&subscription_id)
        .map_err(|e| {
            tracing::error!("failed to list price history: {}", e);
            e.to_string()
        })
}

#[tauri::command]
fn get_recent_price_changes(
    core: tauri::State<'_, SubbyCore>,
    days: Option<i64>,
) -> Result<Vec<PriceChange>, String> {
    let days = days.unwrap_or(90);
    tracing::debug!("getting recent price changes (days: {})", days);
    core.price_history()
        .list_recent(days)
        .map_err(|e| {
            tracing::error!("failed to get recent price changes: {}", e);
            e.to_string()
        })
}

// ── Tag commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn list_tags(core: tauri::State<'_, SubbyCore>) -> Result<Vec<Tag>, String> {
    tracing::debug!("listing tags");
    core.tags().list().map_err(|e| {
        tracing::error!("failed to list tags: {}", e);
        e.to_string()
    })
}

#[tauri::command]
fn create_tag(core: tauri::State<'_, SubbyCore>, data: NewTag) -> Result<Tag, String> {
    tracing::info!("creating tag: {}", data.name);
    core.tags().create(data).map_err(|e| {
        tracing::error!("failed to create tag: {}", e);
        e.to_string()
    })
}

#[tauri::command]
fn update_tag(
    core: tauri::State<'_, SubbyCore>,
    id: String,
    data: UpdateTag,
) -> Result<Tag, String> {
    tracing::info!("updating tag: {}", id);
    core.tags().update(&id, data).map_err(|e| {
        tracing::error!("failed to update tag {}: {}", id, e);
        e.to_string()
    })
}

#[tauri::command]
fn delete_tag(core: tauri::State<'_, SubbyCore>, id: String) -> Result<(), String> {
    tracing::info!("deleting tag: {}", id);
    core.tags().delete(&id).map_err(|e| {
        tracing::error!("failed to delete tag {}: {}", id, e);
        e.to_string()
    })
}

#[tauri::command]
fn add_subscription_tag(
    core: tauri::State<'_, SubbyCore>,
    subscription_id: String,
    tag_id: String,
) -> Result<(), String> {
    tracing::info!("adding tag {} to subscription {}", tag_id, subscription_id);
    core.tags()
        .add_to_subscription(&subscription_id, &tag_id)
        .map_err(|e| {
            tracing::error!("failed to add tag to subscription: {}", e);
            e.to_string()
        })
}

#[tauri::command]
fn remove_subscription_tag(
    core: tauri::State<'_, SubbyCore>,
    subscription_id: String,
    tag_id: String,
) -> Result<(), String> {
    tracing::info!("removing tag {} from subscription {}", tag_id, subscription_id);
    core.tags()
        .remove_from_subscription(&subscription_id, &tag_id)
        .map_err(|e| {
            tracing::error!("failed to remove tag from subscription: {}", e);
            e.to_string()
        })
}

#[tauri::command]
fn list_subscription_tags(
    core: tauri::State<'_, SubbyCore>,
    subscription_id: String,
) -> Result<Vec<Tag>, String> {
    tracing::debug!("listing tags for subscription: {}", subscription_id);
    core.tags()
        .list_for_subscription(&subscription_id)
        .map_err(|e| {
            tracing::error!("failed to list subscription tags: {}", e);
            e.to_string()
        })
}

// ── Analytics commands ─────────────────────────────────────────────────────

#[tauri::command]
fn get_monthly_spending(
    core: tauri::State<'_, SubbyCore>,
    months: Option<i32>,
) -> Result<Vec<MonthlySpend>, String> {
    tracing::debug!("getting monthly spending");
    core.analytics()
        .monthly_spending(months.unwrap_or(12))
        .map_err(|e| {
            tracing::error!("failed to get monthly spending: {}", e);
            e.to_string()
        })
}

#[tauri::command]
fn get_year_summary(
    core: tauri::State<'_, SubbyCore>,
    year: i32,
) -> Result<YearSummary, String> {
    tracing::debug!("getting year summary for {}", year);
    core.analytics()
        .year_summary(year)
        .map_err(|e| {
            tracing::error!("failed to get year summary: {}", e);
            e.to_string()
        })
}

#[tauri::command]
fn get_spending_velocity(
    core: tauri::State<'_, SubbyCore>,
) -> Result<SpendingVelocity, String> {
    tracing::debug!("getting spending velocity");
    core.analytics()
        .spending_velocity()
        .map_err(|e| {
            tracing::error!("failed to get spending velocity: {}", e);
            e.to_string()
        })
}

#[tauri::command]
fn get_category_spending(
    core: tauri::State<'_, SubbyCore>,
    months: Option<i32>,
) -> Result<Vec<CategorySpend>, String> {
    tracing::debug!("getting category spending");
    core.analytics()
        .category_spending(months.unwrap_or(6))
        .map_err(|e| {
            tracing::error!("failed to get category spending: {}", e);
            e.to_string()
        })
}


// ── Settings commands ──────────────────────────────────────────────────────

#[tauri::command]
fn get_settings(core: tauri::State<'_, SubbyCore>) -> Result<Settings, String> {
    tracing::debug!("getting settings");
    core.settings().get().map_err(|e| {
        tracing::error!("failed to get settings: {}", e);
        e.to_string()
    })
}

#[tauri::command]
fn update_settings(
    core: tauri::State<'_, SubbyCore>,
    data: UpdateSettings,
) -> Result<Settings, String> {
    tracing::info!("updating settings");
    core.settings().update(data).map_err(|e| {
        tracing::error!("failed to update settings: {}", e);
        e.to_string()
    })
}

// ── Data management commands ───────────────────────────────────────────────

#[tauri::command]
fn export_data(core: tauri::State<'_, SubbyCore>) -> Result<BackupData, String> {
    tracing::info!("exporting data");
    core.data_management()
        .export_data()
        .map_err(|e| {
            tracing::error!("failed to export data: {}", e);
            e.to_string()
        })
}

#[tauri::command]
fn import_data(
    core: tauri::State<'_, SubbyCore>,
    data: BackupData,
    clear_existing: Option<bool>,
) -> Result<ImportResult, String> {
    tracing::info!("importing data (clear_existing: {})", clear_existing.unwrap_or(false));
    core.data_management()
        .import_data(data, clear_existing.unwrap_or(false))
        .map_err(|e| {
            tracing::error!("failed to import data: {}", e);
            e.to_string()
        })
}

// ── System tray helpers ─────────────────────────────────────────────────────

/// Count subscriptions with `next_payment_date` within the next 7 days.
fn count_upcoming_payments(core: &SubbyCore) -> usize {
    let subs = match core.subscriptions().list() {
        Ok(s) => s,
        Err(_) => return 0,
    };

    let today = chrono::Local::now().date_naive();
    let week_later = today + chrono::Duration::days(7);

    subs.iter()
        .filter(|s| s.is_active)
        .filter_map(|s| {
            s.next_payment_date
                .as_deref()
                .and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        })
        .filter(|date| *date >= today && *date <= week_later)
        .count()
}

/// Build (or rebuild) the tray menu with the current upcoming payment count.
fn build_tray_menu(app: &tauri::AppHandle, count: usize) -> tauri::Result<()> {
    let upcoming_label = if count == 0 {
        "No upcoming payments".to_string()
    } else {
        format!("Upcoming payments: {}", count)
    };

    let open_item = MenuItemBuilder::with_id("open", "Open Subby").build(app)?;
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
        tray.set_menu(Some(menu))?;
        let tooltip = if count == 0 {
            "Subby".to_string()
        } else {
            format!("Subby — {} upcoming", count)
        };
        tray.set_tooltip(Some(&tooltip))?;
    }

    Ok(())
}

#[tauri::command]
fn update_tray_badge(app: tauri::AppHandle, core: tauri::State<'_, SubbyCore>) -> Result<(), String> {
    let count = count_upcoming_payments(&core);
    build_tray_menu(&app, count).map_err(|e| e.to_string())
}

// ── App setup ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");

            // ── Logging setup ────────────────────────────────────────────
            let logs_dir = app_data_dir.join("logs");
            fs::create_dir_all(&logs_dir).expect("Failed to create logs dir");

            let file_appender = tracing_appender::rolling::daily(&logs_dir, "subby.log");
            let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

            // Keep the guard alive for the lifetime of the app
            // by leaking it (it's a singleton that lives forever anyway)
            std::mem::forget(_guard);

            let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| {
                    tracing_subscriber::EnvFilter::new("info")
                        .add_directive("subby_lib=debug".parse().unwrap())
                        .add_directive("subby_core=debug".parse().unwrap())
                });

            use tracing_subscriber::layer::SubscriberExt;
            use tracing_subscriber::util::SubscriberInitExt;

            tracing_subscriber::registry()
                .with(env_filter)
                .with(
                    tracing_subscriber::fmt::layer()
                        .with_writer(std::io::stderr)
                )
                .with(
                    tracing_subscriber::fmt::layer()
                        .with_writer(non_blocking)
                        .with_ansi(false)
                )
                .init();

            tracing::info!("Subby starting up");
            tracing::info!("Logs directory: {}", logs_dir.display());

            let db_path = app_data_dir.join("subby.db");
            tracing::info!("Opening database at: {}", db_path.display());

            let core = SubbyCore::new(&db_path).expect("Failed to initialize SubbyCore database");
            let upcoming_count = count_upcoming_payments(&core);

            app.manage(core);

            // ── System tray setup ──────────────────────────────────────────
            let handle = app.handle().clone();

            // Build the initial tray menu
            let upcoming_label = if upcoming_count == 0 {
                "No upcoming payments".to_string()
            } else {
                format!("Upcoming payments: {}", upcoming_count)
            };

            let open_item = MenuItemBuilder::with_id("open", "Open Subby")
                .build(&handle)?;
            let upcoming_item = MenuItemBuilder::with_id("upcoming", &upcoming_label)
                .enabled(false)
                .build(&handle)?;
            let separator = PredefinedMenuItem::separator(&handle)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit")
                .build(&handle)?;

            let menu = MenuBuilder::new(&handle)
                .item(&open_item)
                .item(&upcoming_item)
                .item(&separator)
                .item(&quit_item)
                .build()?;

            let tooltip = if upcoming_count == 0 {
                "Subby".to_string()
            } else {
                format!("Subby — {} upcoming", upcoming_count)
            };

            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip(&tooltip)
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
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
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // ── Periodic tray badge refresh (every 5 minutes) ──────────────
            let periodic_handle = app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(300));
                    if let Some(core) = periodic_handle.try_state::<SubbyCore>() {
                        let count = count_upcoming_payments(&core);
                        let _ = build_tray_menu(&periodic_handle, count);
                    }
                }
            });

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
            create_payment,
            update_payment,
            delete_payment,
            mark_payment_paid,
            skip_payment,
            is_payment_recorded,
            // Price history
            list_price_history,
            get_recent_price_changes,
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
            // Settings
            get_settings,
            update_settings,
            // Data management
            export_data,
            import_data,
            // System tray
            update_tray_badge,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
