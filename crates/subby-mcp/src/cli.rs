use std::collections::HashMap;
use std::path::PathBuf;

use colored::Colorize;
use comfy_table::{modifiers::UTF8_ROUND_CORNERS, presets::UTF8_FULL, Cell, Color, Table};
use subby_core::models::{BillingCycle, NewCategory, NewSubscription, UpdateSubscription};
use subby_core::SubbyCore;

#[derive(clap::Subcommand)]
pub enum Command {
    /// Start the MCP server (default when no subcommand is given)
    Serve,
    /// List all subscriptions
    List,
    /// Add a new subscription
    Add {
        /// Subscription name
        name: String,
        /// Billing amount
        amount: f64,
        /// Billing cycle: weekly, monthly, quarterly, yearly
        cycle: String,
        /// Next payment date (YYYY-MM-DD)
        next_date: String,
        /// Currency code
        #[arg(long, default_value = "USD")]
        currency: String,
        /// Category ID
        #[arg(long)]
        category: Option<String>,
        /// Color hex code
        #[arg(long)]
        color: Option<String>,
        /// Notes
        #[arg(long)]
        notes: Option<String>,
    },
    /// Update an existing subscription
    Update {
        /// Subscription ID
        id: String,
        /// New name
        #[arg(long)]
        name: Option<String>,
        /// New amount
        #[arg(long)]
        amount: Option<f64>,
        /// New billing cycle
        #[arg(long)]
        cycle: Option<String>,
        /// New next payment date
        #[arg(long)]
        next_date: Option<String>,
        /// New currency
        #[arg(long)]
        currency: Option<String>,
        /// New category ID
        #[arg(long)]
        category: Option<String>,
        /// New color
        #[arg(long)]
        color: Option<String>,
        /// New notes
        #[arg(long)]
        notes: Option<String>,
    },
    /// Remove a subscription
    Remove {
        /// Subscription ID
        id: String,
    },
    /// Pause or resume a subscription
    Toggle {
        /// Subscription ID
        id: String,
    },
    /// Record a payment as paid
    Pay {
        /// Subscription ID
        sub_id: String,
        /// Due date (YYYY-MM-DD)
        due_date: String,
        /// Payment amount
        amount: f64,
    },
    /// Skip a payment
    Skip {
        /// Subscription ID
        sub_id: String,
        /// Due date (YYYY-MM-DD)
        due_date: String,
        /// Payment amount
        amount: f64,
    },
    /// List all categories
    Categories,
    /// Add a new category
    AddCategory {
        /// Category name
        name: String,
        /// Hex color (e.g., #ff0000)
        color: String,
        /// Icon name (e.g., play-circle, music, code)
        icon: String,
    },
    /// Show upcoming payments
    Upcoming {
        /// Number of days to look ahead
        #[arg(long, default_value = "7")]
        days: i64,
    },
    /// Show dashboard statistics
    Stats,
    /// Export data as JSON backup
    Export {
        /// Output file path (prints to stdout if omitted)
        #[arg(long)]
        output: Option<PathBuf>,
    },
    /// Import data from JSON backup
    Import {
        /// Path to backup JSON file
        file: PathBuf,
        /// Clear existing data before importing
        #[arg(long)]
        clear: bool,
    },
}

pub fn run(command: Command, core: &SubbyCore) -> anyhow::Result<()> {
    match command {
        Command::Serve => unreachable!("Serve is handled in main"),
        Command::List => cmd_list(core),
        Command::Add {
            name,
            amount,
            cycle,
            next_date,
            currency,
            category,
            color,
            notes,
        } => cmd_add(
            core, name, amount, cycle, next_date, currency, category, color, notes,
        ),
        Command::Update {
            id,
            name,
            amount,
            cycle,
            next_date,
            currency,
            category,
            color,
            notes,
        } => cmd_update(
            core, id, name, amount, cycle, next_date, currency, category, color, notes,
        ),
        Command::Remove { id } => cmd_remove(core, id),
        Command::Toggle { id } => cmd_toggle(core, id),
        Command::Pay {
            sub_id,
            due_date,
            amount,
        } => cmd_pay(core, sub_id, due_date, amount),
        Command::Skip {
            sub_id,
            due_date,
            amount,
        } => cmd_skip(core, sub_id, due_date, amount),
        Command::Categories => cmd_categories(core),
        Command::AddCategory { name, color, icon } => cmd_add_category(core, name, color, icon),
        Command::Upcoming { days } => cmd_upcoming(core, days),
        Command::Stats => cmd_stats(core),
        Command::Export { output } => cmd_export(core, output),
        Command::Import { file, clear } => cmd_import(core, file, clear),
    }
}

fn cmd_list(core: &SubbyCore) -> anyhow::Result<()> {
    let subs = core.subscriptions().list()?;

    if subs.is_empty() {
        println!("{}", "No subscriptions found.".dimmed());
        return Ok(());
    }

    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL)
        .apply_modifier(UTF8_ROUND_CORNERS)
        .set_header(vec!["Name", "Amount", "Cycle", "Next Payment", "Status"]);

    for sub in &subs {
        let status = if sub.is_active { "Active" } else { "Paused" };
        let status_color = if sub.is_active {
            Color::Green
        } else {
            Color::DarkYellow
        };
        let next = sub
            .next_payment_date
            .as_deref()
            .unwrap_or("-");

        table.add_row(vec![
            Cell::new(&sub.name),
            Cell::new(format!("{:.2} {}", sub.amount, sub.currency)),
            Cell::new(sub.billing_cycle.as_str()),
            Cell::new(next),
            Cell::new(status).fg(status_color),
        ]);
    }

    println!("{table}");
    println!(
        "\n{} subscription(s) total",
        subs.len().to_string().bold()
    );
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn cmd_add(
    core: &SubbyCore,
    name: String,
    amount: f64,
    cycle: String,
    next_date: String,
    currency: String,
    category: Option<String>,
    color: Option<String>,
    notes: Option<String>,
) -> anyhow::Result<()> {
    let billing_cycle = BillingCycle::from_str(&cycle)
        .ok_or_else(|| anyhow::anyhow!("Invalid billing cycle: {cycle}"))?;

    let sub = core.subscriptions().create(NewSubscription {
        name: name.clone(),
        amount,
        currency,
        billing_cycle,
        billing_day: None,
        category_id: category,
        card_id: None,
        color,
        logo_url: None,
        notes,
        is_active: true,
        next_payment_date: Some(next_date),
        status: subby_core::models::SubscriptionStatus::Active,
        trial_end_date: None,
        shared_count: 1,
        is_pinned: false,
    })?;

    println!(
        "{} Added subscription: {} ({})",
        "✓".green().bold(),
        sub.name.bold(),
        sub.id.dimmed()
    );
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn cmd_update(
    core: &SubbyCore,
    id: String,
    name: Option<String>,
    amount: Option<f64>,
    cycle: Option<String>,
    next_date: Option<String>,
    currency: Option<String>,
    category: Option<String>,
    color: Option<String>,
    notes: Option<String>,
) -> anyhow::Result<()> {
    let billing_cycle = cycle.and_then(|s| BillingCycle::from_str(&s));

    let sub = core.subscriptions().update(
        &id,
        UpdateSubscription {
            name,
            amount,
            currency,
            billing_cycle,
            billing_day: None,
            category_id: category.map(Some),
            card_id: None,
            color: color.map(Some),
            logo_url: None,
            notes: notes.map(Some),
            is_active: None,
            next_payment_date: next_date.map(Some),
            status: None,
            trial_end_date: None,
            shared_count: None,
            is_pinned: None,
            cancellation_reason: None,
            cancelled_at: None,
            last_reviewed_at: None,
        },
    )?;

    println!(
        "{} Updated subscription: {}",
        "✓".green().bold(),
        sub.name.bold()
    );
    Ok(())
}

fn cmd_remove(core: &SubbyCore, id: String) -> anyhow::Result<()> {
    let sub = core.subscriptions().get(&id)?;
    core.subscriptions().delete(&id)?;
    println!(
        "{} Removed subscription: {}",
        "✓".green().bold(),
        sub.name.bold()
    );
    Ok(())
}

fn cmd_toggle(core: &SubbyCore, id: String) -> anyhow::Result<()> {
    let sub = core.subscriptions().toggle_active(&id)?;
    let status = if sub.is_active { "active" } else { "paused" };
    println!(
        "{} {} is now {}",
        "✓".green().bold(),
        sub.name.bold(),
        status.bold()
    );
    Ok(())
}

fn cmd_pay(core: &SubbyCore, sub_id: String, due_date: String, amount: f64) -> anyhow::Result<()> {
    let sub = core.subscriptions().get(&sub_id)?;
    core.payments().mark_as_paid(&sub_id, &due_date, amount)?;
    println!(
        "{} Recorded payment for {} ({:.2} on {})",
        "✓".green().bold(),
        sub.name.bold(),
        amount,
        due_date
    );
    Ok(())
}

fn cmd_skip(
    core: &SubbyCore,
    sub_id: String,
    due_date: String,
    amount: f64,
) -> anyhow::Result<()> {
    let sub = core.subscriptions().get(&sub_id)?;
    core.payments().skip_payment(&sub_id, &due_date, amount)?;
    println!(
        "{} Skipped payment for {} ({} on {})",
        "✓".green().bold(),
        sub.name.bold(),
        format!("{:.2}", amount).dimmed(),
        due_date
    );
    Ok(())
}

fn cmd_categories(core: &SubbyCore) -> anyhow::Result<()> {
    let cats = core.categories().list()?;

    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL)
        .apply_modifier(UTF8_ROUND_CORNERS)
        .set_header(vec!["Name", "Icon", "Color", "Type"]);

    for cat in &cats {
        let kind = if cat.is_default { "Default" } else { "Custom" };
        table.add_row(vec![
            Cell::new(&cat.name),
            Cell::new(&cat.icon),
            Cell::new(&cat.color),
            Cell::new(kind),
        ]);
    }

    println!("{table}");
    Ok(())
}

fn cmd_add_category(
    core: &SubbyCore,
    name: String,
    color: String,
    icon: String,
) -> anyhow::Result<()> {
    let cat = core.categories().create(NewCategory {
        name: name.clone(),
        color,
        icon,
    })?;

    println!(
        "{} Added category: {} ({})",
        "✓".green().bold(),
        cat.name.bold(),
        cat.id.dimmed()
    );
    Ok(())
}

fn cmd_upcoming(core: &SubbyCore, days: i64) -> anyhow::Result<()> {
    let subs = core.subscriptions().list()?;
    let upcoming = subby_core::utils::get_upcoming_subscriptions(&subs, days);

    if upcoming.is_empty() {
        println!("{}", format!("No upcoming payments in the next {days} days.").dimmed());
        return Ok(());
    }

    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL)
        .apply_modifier(UTF8_ROUND_CORNERS)
        .set_header(vec!["Name", "Amount", "Next Payment", "Cycle"]);

    let mut total = 0.0;
    for sub in &upcoming {
        let next = sub
            .next_payment_date
            .as_deref()
            .unwrap_or("-");
        table.add_row(vec![
            Cell::new(&sub.name),
            Cell::new(format!("{:.2} {}", sub.amount, sub.currency)),
            Cell::new(next),
            Cell::new(sub.billing_cycle.as_str()),
        ]);
        total += sub.amount;
    }

    println!("{table}");
    println!(
        "\n{} payment(s) in the next {} days, totaling {:.2}",
        upcoming.len().to_string().bold(),
        days,
        total
    );
    Ok(())
}

fn cmd_stats(core: &SubbyCore) -> anyhow::Result<()> {
    let subs = core.subscriptions().list()?;
    let cats = core.categories().list()?;
    let settings = core.settings().get()?;

    let active: Vec<_> = subs.iter().filter(|s| s.is_active).collect();
    let total_monthly: f64 = active
        .iter()
        .map(|s| subby_core::utils::calculate_monthly_amount(s.amount, &s.billing_cycle))
        .sum();

    println!("{}", "Dashboard Stats".bold().underline());
    println!();
    println!(
        "  Monthly spend:  {:.2} {}",
        total_monthly, settings.currency
    );
    println!(
        "  Yearly spend:   {:.2} {}",
        total_monthly * 12.0,
        settings.currency
    );
    println!(
        "  Active:         {} / {}",
        active.len(),
        subs.len()
    );
    if !active.is_empty() {
        println!(
            "  Avg per sub:    {:.2} {}",
            total_monthly / active.len() as f64,
            settings.currency
        );
    }

    // Category breakdown
    let mut spending: HashMap<String, (String, f64)> = HashMap::new();
    for sub in &active {
        let monthly = subby_core::utils::calculate_monthly_amount(sub.amount, &sub.billing_cycle);
        let key = sub
            .category_id
            .clone()
            .unwrap_or_else(|| "uncategorized".to_string());
        let cat = sub
            .category_id
            .as_ref()
            .and_then(|cid| cats.iter().find(|c| &c.id == cid));
        let name = cat
            .map(|c| c.name.clone())
            .unwrap_or_else(|| "Uncategorized".to_string());

        let entry = spending.entry(key).or_insert((name, 0.0));
        entry.1 += monthly;
    }

    if !spending.is_empty() {
        println!();
        println!("{}", "Spending by Category".bold().underline());
        println!();

        let mut sorted: Vec<_> = spending.into_values().collect();
        sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        let mut table = Table::new();
        table
            .load_preset(UTF8_FULL)
            .apply_modifier(UTF8_ROUND_CORNERS)
            .set_header(vec!["Category", "Monthly", "% of Total"]);

        for (name, amount) in &sorted {
            let pct = if total_monthly > 0.0 {
                amount / total_monthly * 100.0
            } else {
                0.0
            };
            table.add_row(vec![
                Cell::new(name),
                Cell::new(format!("{:.2} {}", amount, settings.currency)),
                Cell::new(format!("{:.1}%", pct)),
            ]);
        }

        println!("{table}");
    }

    Ok(())
}

fn cmd_export(core: &SubbyCore, output: Option<PathBuf>) -> anyhow::Result<()> {
    let backup = core.data_management().export_data()?;
    let json = serde_json::to_string_pretty(&backup)?;

    if let Some(path) = output {
        std::fs::write(&path, &json)?;
        println!(
            "{} Exported to {}",
            "✓".green().bold(),
            path.display().to_string().bold()
        );
    } else {
        println!("{json}");
    }
    Ok(())
}

fn cmd_import(core: &SubbyCore, file: PathBuf, clear: bool) -> anyhow::Result<()> {
    let content = std::fs::read_to_string(&file)?;
    let backup: subby_core::models::BackupData = serde_json::from_str(&content)?;

    let result = core.data_management().import_data(backup, clear)?;

    if result.success {
        println!("{} {}", "✓".green().bold(), result.message);
    } else {
        println!("{} {}", "✗".red().bold(), result.message);
    }
    Ok(())
}
