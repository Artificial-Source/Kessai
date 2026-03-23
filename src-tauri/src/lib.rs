use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::{NaiveDate, Utc};
use image::ImageReader;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

use subby_core::models::{
    BackupData, NewCategory, NewPayment, NewPaymentCard, NewSubscription, PaymentWithSubscription,
    PriceChange, SubscriptionStatus, UpdateCategory, UpdatePayment, UpdatePaymentCard,
    UpdateSettings, UpdateSubscription,
};
use subby_core::{
    models::{Category, ImportResult, Payment, PaymentCard, Settings, Subscription},
    SubbyCore,
};

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
    let logos_dir = get_logos_dir(&app_handle);
    let filename = format!("{}.webp", subscription_id);

    // Validate filename to prevent path traversal
    if !is_valid_logo_filename(&filename) {
        return Err("Invalid subscription ID for logo filename".to_string());
    }

    let dest_path = logos_dir.join(&filename);

    let img = ImageReader::open(&source_path)
        .map_err(|e| format!("Failed to open image: {}", e))?
        .decode()
        .map_err(|e| format!("Failed to decode image: {}", e))?;

    let resized = img.thumbnail(256, 256);

    resized
        .save_with_format(&dest_path, image::ImageFormat::WebP)
        .map_err(|e| format!("Failed to save WebP: {}", e))?;

    Ok(filename)
}

#[tauri::command]
fn get_logo_base64(app_handle: tauri::AppHandle, filename: String) -> Result<String, String> {
    if !is_valid_logo_filename(&filename) {
        return Err("Invalid filename".to_string());
    }

    let logos_dir = get_logos_dir(&app_handle);
    let file_path = logos_dir.join(&filename);

    let data = fs::read(&file_path).map_err(|e| format!("Failed to read logo: {}", e))?;

    let base64_data = BASE64.encode(&data);
    Ok(format!("data:image/webp;base64,{}", base64_data))
}

#[tauri::command]
fn delete_logo(app_handle: tauri::AppHandle, filename: String) -> Result<(), String> {
    if !is_valid_logo_filename(&filename) {
        return Err("Invalid filename".to_string());
    }

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
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

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
                                return Ok(Some(filename));
                            }
                        }
                    }
                }
            }
            _ => continue,
        }
    }

    Ok(None)
}

// ── Subscription commands ──────────────────────────────────────────────────

#[tauri::command]
fn list_subscriptions(core: tauri::State<'_, SubbyCore>) -> Result<Vec<Subscription>, String> {
    core.subscriptions().list().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_subscription(core: tauri::State<'_, SubbyCore>, id: String) -> Result<Subscription, String> {
    core.subscriptions().get(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_subscription(
    core: tauri::State<'_, SubbyCore>,
    data: NewSubscription,
) -> Result<Subscription, String> {
    core.subscriptions().create(data).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_subscription(
    core: tauri::State<'_, SubbyCore>,
    id: String,
    data: UpdateSubscription,
) -> Result<Subscription, String> {
    // Auto-detect price changes and record history
    if let Some(new_amount) = data.amount {
        if let Ok(existing) = core.subscriptions().get(&id) {
            if (existing.amount - new_amount).abs() > 0.001 {
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
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_subscription(core: tauri::State<'_, SubbyCore>, id: String) -> Result<(), String> {
    core.subscriptions().delete(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_subscription_active(
    core: tauri::State<'_, SubbyCore>,
    id: String,
) -> Result<Subscription, String> {
    core.subscriptions()
        .toggle_active(&id)
        .map_err(|e| e.to_string())
}

// ── Category commands ──────────────────────────────────────────────────────

#[tauri::command]
fn list_categories(core: tauri::State<'_, SubbyCore>) -> Result<Vec<Category>, String> {
    core.categories().list().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_category(
    core: tauri::State<'_, SubbyCore>,
    data: NewCategory,
) -> Result<Category, String> {
    core.categories().create(data).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_category(
    core: tauri::State<'_, SubbyCore>,
    id: String,
    data: UpdateCategory,
) -> Result<Category, String> {
    core.categories()
        .update(&id, data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_category(core: tauri::State<'_, SubbyCore>, id: String) -> Result<(), String> {
    core.categories().delete(&id).map_err(|e| e.to_string())
}

// ── Payment commands ───────────────────────────────────────────────────────

#[tauri::command]
fn list_payments(core: tauri::State<'_, SubbyCore>) -> Result<Vec<Payment>, String> {
    core.payments().list().map_err(|e| e.to_string())
}

#[tauri::command]
fn list_payments_by_month(
    core: tauri::State<'_, SubbyCore>,
    year: i32,
    month: u32,
) -> Result<Vec<Payment>, String> {
    core.payments()
        .list_by_month(year, month)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_payments_with_details(
    core: tauri::State<'_, SubbyCore>,
    year: i32,
    month: u32,
) -> Result<Vec<PaymentWithSubscription>, String> {
    core.payments()
        .list_with_details(year, month)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_payment(core: tauri::State<'_, SubbyCore>, data: NewPayment) -> Result<Payment, String> {
    core.payments().create(data).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_payment(
    core: tauri::State<'_, SubbyCore>,
    id: String,
    data: UpdatePayment,
) -> Result<Payment, String> {
    core.payments().update(&id, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_payment(core: tauri::State<'_, SubbyCore>, id: String) -> Result<(), String> {
    core.payments().delete(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn mark_payment_paid(
    core: tauri::State<'_, SubbyCore>,
    subscription_id: String,
    due_date: String,
    amount: f64,
) -> Result<Payment, String> {
    core.payments()
        .mark_as_paid(&subscription_id, &due_date, amount)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn skip_payment(
    core: tauri::State<'_, SubbyCore>,
    subscription_id: String,
    due_date: String,
    amount: f64,
) -> Result<Payment, String> {
    core.payments()
        .skip_payment(&subscription_id, &due_date, amount)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn is_payment_recorded(
    core: tauri::State<'_, SubbyCore>,
    subscription_id: String,
    due_date: String,
) -> Result<bool, String> {
    core.payments()
        .is_recorded(&subscription_id, &due_date)
        .map_err(|e| e.to_string())
}

// ── Payment card commands ──────────────────────────────────────────────────

#[tauri::command]
fn list_payment_cards(core: tauri::State<'_, SubbyCore>) -> Result<Vec<PaymentCard>, String> {
    core.payment_cards().list().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_payment_card(
    core: tauri::State<'_, SubbyCore>,
    data: NewPaymentCard,
) -> Result<PaymentCard, String> {
    core.payment_cards().create(data).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_payment_card(
    core: tauri::State<'_, SubbyCore>,
    id: String,
    data: UpdatePaymentCard,
) -> Result<PaymentCard, String> {
    core.payment_cards()
        .update(&id, data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_payment_card(core: tauri::State<'_, SubbyCore>, id: String) -> Result<(), String> {
    core.payment_cards().delete(&id).map_err(|e| e.to_string())
}

// ── Subscription status commands ─────────────────────────────────────

#[tauri::command]
fn transition_subscription_status(
    core: tauri::State<'_, SubbyCore>,
    id: String,
    status: String,
) -> Result<Subscription, String> {
    let new_status = SubscriptionStatus::from_str(&status)
        .ok_or_else(|| format!("Invalid status: {status}"))?;
    core.subscriptions()
        .transition_status(&id, new_status)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_expiring_trials(
    core: tauri::State<'_, SubbyCore>,
    days: Option<i64>,
) -> Result<Vec<Subscription>, String> {
    let subs = core.subscriptions().list().map_err(|e| e.to_string())?;
    let days = days.unwrap_or(7);
    let trials = subby_core::utils::get_expiring_trials(&subs, days);
    Ok(trials.into_iter().cloned().collect())
}

// ── Price history commands ──────────────────────────────────────────

#[tauri::command]
fn list_price_history(
    core: tauri::State<'_, SubbyCore>,
    subscription_id: String,
) -> Result<Vec<PriceChange>, String> {
    core.price_history()
        .list_by_subscription(&subscription_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_recent_price_changes(
    core: tauri::State<'_, SubbyCore>,
    days: Option<i64>,
) -> Result<Vec<PriceChange>, String> {
    core.price_history()
        .list_recent(days.unwrap_or(90))
        .map_err(|e| e.to_string())
}

// ── Settings commands ──────────────────────────────────────────────────────

#[tauri::command]
fn get_settings(core: tauri::State<'_, SubbyCore>) -> Result<Settings, String> {
    core.settings().get().map_err(|e| e.to_string())
}

#[tauri::command]
fn update_settings(
    core: tauri::State<'_, SubbyCore>,
    data: UpdateSettings,
) -> Result<Settings, String> {
    core.settings().update(data).map_err(|e| e.to_string())
}

// ── Data management commands ───────────────────────────────────────────────

#[tauri::command]
fn export_data(core: tauri::State<'_, SubbyCore>) -> Result<BackupData, String> {
    core.data_management()
        .export_data()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn import_data(
    core: tauri::State<'_, SubbyCore>,
    data: BackupData,
    clear_existing: Option<bool>,
) -> Result<ImportResult, String> {
    core.data_management()
        .import_data(data, clear_existing.unwrap_or(false))
        .map_err(|e| e.to_string())
}

// ── System tray helpers ─────────────────────────────────────────────────────

/// Count subscriptions with next_payment_date within the next 7 days.
fn count_upcoming_payments(core: &SubbyCore) -> usize {
    let subs = match core.subscriptions().list() {
        Ok(s) => s,
        Err(_) => return 0,
    };

    let today = Utc::now().date_naive();
    let horizon = today + chrono::Duration::days(7);

    subs.iter()
        .filter(|s| s.is_active)
        .filter(|s| {
            s.next_payment_date
                .as_deref()
                .and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
                .is_some_and(|date| date >= today && date <= horizon)
        })
        .count()
}

/// Refresh the tray menu with the current upcoming payment count.
fn refresh_tray_menu(app: &tauri::AppHandle) {
    let core: tauri::State<'_, SubbyCore> = app.state();
    let count = count_upcoming_payments(core.inner());

    let open_item = MenuItemBuilder::with_id("open", "Open Subby").build(app).unwrap();
    let upcoming_label = format!("Upcoming Payments: {}", count);
    let upcoming_item = MenuItemBuilder::with_id("upcoming", &upcoming_label)
        .enabled(false)
        .build(app)
        .unwrap();
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app).unwrap();

    let menu = MenuBuilder::new(app)
        .item(&open_item)
        .item(&upcoming_item)
        .separator()
        .item(&quit_item)
        .build()
        .unwrap();

    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu)).ok();
        if count > 0 {
            tray.set_tooltip(Some(&format!("Subby — {} upcoming", count))).ok();
        } else {
            tray.set_tooltip(Some("Subby — no upcoming payments")).ok();
        }
    }
}

// ── Tray command ────────────────────────────────────────────────────────────

#[tauri::command]
fn update_tray_badge(app_handle: tauri::AppHandle) -> Result<(), String> {
    refresh_tray_menu(&app_handle);
    Ok(())
}

// ── App setup ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Flag to distinguish "close to tray" vs "quit for real"
    let should_exit = Arc::new(AtomicBool::new(false));
    let should_exit_setup = should_exit.clone();

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
            let db_path = app_data_dir.join("subby.db");

            let core = SubbyCore::new(&db_path).expect("Failed to initialize SubbyCore database");
            app.manage(core);

            // ── Build system tray ──────────────────────────────────────
            let handle = app.handle().clone();
            let should_exit_tray = should_exit_setup.clone();

            // Initial menu (will be refreshed immediately after)
            let open_item = MenuItemBuilder::with_id("open", "Open Subby")
                .build(&handle)
                .expect("failed to build menu item");
            let upcoming_item = MenuItemBuilder::with_id("upcoming", "Upcoming Payments: ...")
                .enabled(false)
                .build(&handle)
                .expect("failed to build menu item");
            let quit_item = MenuItemBuilder::with_id("quit", "Quit")
                .build(&handle)
                .expect("failed to build menu item");

            let menu = MenuBuilder::new(&handle)
                .item(&open_item)
                .item(&upcoming_item)
                .separator()
                .item(&quit_item)
                .build()
                .expect("failed to build tray menu");

            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().expect("no app icon"))
                .menu(&menu)
                .tooltip("Subby")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "open" => {
                            if let Some(w) = app.get_webview_window("main") {
                                w.show().ok();
                                w.set_focus().ok();
                            }
                        }
                        "quit" => {
                            should_exit_tray.store(true, Ordering::SeqCst);
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            w.show().ok();
                            w.set_focus().ok();
                        }
                    }
                })
                .build(&handle)
                .expect("failed to build tray icon");

            // Refresh menu with real data
            refresh_tray_menu(&handle);

            // ── Periodic refresh (every 5 minutes) ─────────────────────
            let periodic_handle = handle.clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(300));
                    refresh_tray_menu(&periodic_handle);
                }
            });

            Ok(())
        })
        .on_window_event(move |window, event| {
            // Close-to-tray: hide window instead of quitting
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !should_exit.load(Ordering::SeqCst) {
                    api.prevent_close();
                    window.hide().ok();
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
            transition_subscription_status,
            get_expiring_trials,
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
            // Payment cards
            list_payment_cards,
            create_payment_card,
            update_payment_card,
            delete_payment_card,
            // Settings
            get_settings,
            update_settings,
            // Data management
            export_data,
            import_data,
            // Tray
            update_tray_badge,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
