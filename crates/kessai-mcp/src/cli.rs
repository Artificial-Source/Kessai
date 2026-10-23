//! The clap tree is the source of truth for parsing, help, and machine discovery.
use crate::app::*;
use chrono::NaiveDate;
use clap::{
    builder::{EnumValueParser, TypedValueParser, ValueParser},
    Arg, ArgAction, ArgMatches, Command, ValueEnum,
};
use comfy_table::{presets::UTF8_FULL, Table};
use schemars::JsonSchema;
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    any::TypeId,
    io::IsTerminal,
    path::{Path, PathBuf},
};

pub const SCHEMA_VERSION: &str = "1";
const EXIT_HELP: &str = "Examples:\n  kessai-mcp subscriptions list --json\n  kessai-mcp schema\n\nExit codes: 0 success; 1 internal_error; 2 validation_error; 3 not_found;\n  4 conflict; 5 confirmation_required; 6 io_error.\n\nLegacy commands were removed: list/add/update/remove/toggle/upcoming -> subscriptions\nlist/create/update/delete/update/list; pay/skip -> payments record --status paid/skipped;\nadd-category -> categories create; stats -> analytics dashboard; export/import ->\nbackup export/import; serve-http -> serve --http. Use kessai-mcp schema for discovery.";

// Local ValueEnum wrappers keep clap out of the transport-independent contract.
macro_rules! cli_enum {
    ($name:ident => $target:ident { $($variant:ident),+ $(,)? }) => {
        #[derive(Clone, ValueEnum)]
        #[value(rename_all = "snake_case")]
        enum $name { $($variant),+ }
        impl From<$name> for $target {
            fn from(value: $name) -> Self { match value { $($name::$variant => Self::$variant),+ } }
        }
    };
}
cli_enum!(CycleArg => BillingCycle { Weekly, Monthly, Quarterly, Yearly, Custom });
cli_enum!(StatusArg => SubscriptionStatus { Trial, Active, Paused, PendingCancellation, GracePeriod, Cancelled });
cli_enum!(PaymentStatusArg => PaymentStatus { Paid, Skipped, Pending });
cli_enum!(RecordedStatusArg => PaymentStatus { Paid, Skipped });
cli_enum!(SortArg => SubscriptionSort { NextPaymentDate, Name, AmountDesc, LastReviewedAt, CreatedAtDesc });
cli_enum!(ClearArg => ClearField { BillingDay, CategoryId, CardId, Color, Notes, NextPaymentDate, TrialEndDate });
cli_enum!(PaymentClearArg => PaymentClearField { Notes });
cli_enum!(CardClearArg => CardClearField { LastFour, CreditLimit });
cli_enum!(SettingsClearArg => SettingsClearField { MonthlyBudget });
cli_enum!(CardTypeArg => CardType { Credit, Debit });
cli_enum!(ThemeArg => Theme { Dark, Light, System });
cli_enum!(AnimationArg => AnimationSpeed { Slow, Normal, Fast });
cli_enum!(ImportArg => ImportMode { Merge, Replace });
fn enumeration<E, T>() -> ValueParser
where
    E: ValueEnum + Clone + Send + Sync + 'static,
    T: From<E> + Clone + Send + Sync + 'static,
{
    EnumValueParser::<E>::new().map(T::from).into()
}
fn option(name: &'static str, help: &'static str) -> Arg {
    Arg::new(name).long(name).help(help).value_name("VALUE")
}
fn flag(name: &'static str, help: &'static str) -> Arg {
    option(name, help).action(ArgAction::SetTrue)
}
fn positional(name: &'static str, help: &'static str) -> Arg {
    Arg::new(name).help(help).required(true)
}
fn repeated(arg: Arg) -> Arg {
    arg.action(ArgAction::Append).num_args(1..)
}
fn enum_arg(name: &'static str, help: &'static str, parser: ValueParser) -> Arg {
    option(name, help).value_parser(parser)
}
fn amount(name: &'static str, help: &'static str) -> Arg {
    option(name, help).value_parser(non_negative)
}
fn date(name: &'static str, help: &'static str) -> Arg {
    option(name, help)
        .value_name("YYYY-MM-DD")
        .value_parser(parse_date)
}
fn integer(name: &'static str, help: &'static str, min: i64, max: i64) -> Arg {
    option(name, help).value_parser(clap::value_parser!(i64).range(min..=max))
}
fn boolean(name: &'static str, help: &'static str) -> Arg {
    option(name, help).value_parser(clap::value_parser!(bool))
}
fn leaf(
    name: &'static str,
    about: &'static str,
    long: Option<&'static str>,
    examples: &'static str,
) -> Command {
    let command = Command::new(name).about(about).after_help(examples);
    match long {
        Some(long) => command.long_about(long),
        None => command,
    }
}
fn group(name: &'static str, about: &'static str) -> Command {
    Command::new(name)
        .about(about)
        .disable_help_subcommand(true)
        .subcommand_required(true)
        .arg_required_else_help(true)
}
fn paging(command: Command, default: &'static str, max: u16) -> Command {
    command
        .arg(
            option(
                "limit",
                "Maximum rows per page; follow next_cursor until null",
            )
            .value_parser(clap::value_parser!(u16).range(1..=i64::from(max)))
            .default_value(default),
        )
        .arg(option(
            "cursor",
            "Opaque next_cursor from the same list and filters; default first page",
        ))
}
fn confirmation(command: Command) -> Command {
    command
        .arg(
            flag(
                "dry-run",
                "Preview effects without writing domain data; default false",
            )
            .conflicts_with("yes"),
        )
        .arg(
            flag(
                "yes",
                "Apply after explicit user approval; default false, never prompts",
            )
            .conflicts_with("dry-run"),
        )
}
fn delete_command(examples: &'static str) -> Command {
    confirmation(leaf("delete", "Permanently delete one local record", Some("Permanently deletes the local record and reports cascaded or detached rows. Use --dry-run, show the preview, then --yes after approval. No provider is contacted; a repeated deletion returns not_found."), examples)
        .arg(positional("id", "Opaque target id from the corresponding list command")))
}
fn subscription_fields(command: Command, create: bool) -> Command {
    let command = command
        .arg(
            option(
                "name",
                "Display name, 1–100 characters; omitted on update means unchanged",
            )
            .required(create),
        )
        .arg(
            amount(
                "amount",
                "Finite nonnegative price in decimal major currency units, e.g. 9.99",
            )
            .required(create),
        )
        .arg(
            enum_arg(
                "billing-cycle",
                "Renewal cadence; custom follows the core monthly cadence",
                enumeration::<CycleArg, BillingCycle>(),
            )
            .required(create),
        )
        .arg(option(
            "currency",
            "Three uppercase ISO-4217 letters; create defaults to settings currency",
        ))
        .arg(date(
            "next-payment-date",
            "Next charge date YYYY-MM-DD; create default unknown",
        ))
        .arg(integer(
            "billing-day",
            "Recurrence day 1–31; default unspecified",
            1,
            31,
        ))
        .arg(option(
            "category-id",
            "Opaque category id from categories list; default none",
        ))
        .arg(option(
            "card-id",
            "Opaque card id from cards list; default none",
        ))
        .arg(option(
            "color",
            "Display color #RRGGBB; default unspecified",
        ))
        .arg(option("notes", "Notes up to 500 characters; default none"))
        .arg(enum_arg(
            "status",
            "Desired local lifecycle status; create default active; never contacts providers",
            enumeration::<StatusArg, SubscriptionStatus>(),
        ))
        .arg(date(
            "trial-end-date",
            "Trial end date YYYY-MM-DD; default none",
        ))
        .arg(integer(
            "shared-count",
            "People sharing the full price, at least 1; create default 1",
            1,
            i64::from(i32::MAX),
        ))
        .arg(boolean(
            "pinned",
            "Desired pinned state true/false; create default false",
        ));
    if create {
        command.arg(repeated(option(
            "tag-id",
            "Opaque tag id to attach; repeatable, default none",
        )))
    } else {
        command
            .arg(option(
                "cancellation-reason",
                "Local cancellation notes up to 500 characters; requires status cancelled",
            ))
            .arg(flag(
                "mark-reviewed",
                "Stamp current review time; default false",
            ))
            .arg(repeated(option(
                "add-tag-id",
                "Opaque tag id to attach idempotently; repeatable, default none",
            )))
            .arg(repeated(option(
                "remove-tag-id",
                "Opaque tag id to detach idempotently; repeatable, default none",
            )))
            .arg(repeated(enum_arg(
                "clear",
                "Nullable fields to clear; repeatable; cannot also set the same field",
                enumeration::<ClearArg, ClearField>(),
            )))
    }
}

pub fn command() -> Command {
    let subscriptions = group("subscriptions", "Find and manage local subscription records")
        .subcommand(paging(leaf("list", "Find subscriptions and their opaque ids", None, "Examples:\n  kessai-mcp subscriptions list --query Music --limit 50 --json")
            .arg(option("query", "Case-insensitive name substring; default all names"))
            .arg(repeated(enum_arg("status", "Include any listed lifecycle status; default all statuses", enumeration::<StatusArg, SubscriptionStatus>())))
            .arg(option("category-id", "Filter by opaque category id; default all categories"))
            .arg(option("card-id", "Filter by opaque card id; default all cards"))
            .arg(option("tag-id", "Filter by opaque tag id; default all tags"))
            .arg(date("due-from", "Inclusive earliest next charge YYYY-MM-DD; default unbounded"))
            .arg(date("due-to", "Inclusive latest next charge YYYY-MM-DD; default unbounded"))
            .arg(integer("upcoming-days", "Billable charges due today through today plus 0–366 days", 0, 366))
            .arg(integer("review-overdue-days", "Never reviewed or last reviewed more than 1–3650 days ago", 1, 3650))
            .arg(integer("trial-ending-within-days", "Trials ending today through today plus 0–366 days", 0, 366))
            .arg(enum_arg("sort", "Stable ordering with id as final tiebreaker", enumeration::<SortArg, SubscriptionSort>()).default_value("next_payment_date")), "50", 200))
        .subcommand(leaf("get", "Read full subscription details and linked names", None, "Examples:\n  kessai-mcp subscriptions get <ID> --json").arg(positional("id", "Opaque subscription id from subscriptions list")))
        .subcommand(subscription_fields(leaf("create", "Create a local subscription record", Some("Inserts one local subscription and optional tag links. Repeating creates another record: list by name first when unsure. No provider is contacted. Unknown next charge dates are omitted from calendar projections."), "Examples:\n  kessai-mcp subscriptions create --name Music --amount 9.99 --billing-cycle monthly --json"), true))
        .subcommand(subscription_fields(leaf("update", "Change desired fields on a local subscription", Some("Overwrites only supplied fields; omitted fields remain unchanged. Amount/currency changes append price history. Status cancelled affects the local record only; no provider is contacted. Tag edits are idempotent; --mark-reviewed stamps the current time."), "Examples:\n  kessai-mcp subscriptions update <ID> --status cancelled --cancellation-reason Unused --json")
            .arg(positional("id", "Opaque subscription id from subscriptions list")), false))
        .subcommand(delete_command("Examples:\n  kessai-mcp subscriptions delete <ID> --dry-run --json\n  kessai-mcp subscriptions delete <ID> --yes --json"));
    let payments = group("payments", "Read the ledger and record paid or skipped charges")
        .subcommand(paging(leaf("list", "Read recorded ledger rows, not upcoming projections", None, "Examples:\n  kessai-mcp payments list --month 2026-10 --json")
            .arg(option("subscription-id", "Opaque subscription id; default all subscriptions"))
            .arg(option("month", "Due month YYYY-MM, 1900-01 through 9998-12; default all").value_parser(parse_month))
            .arg(repeated(enum_arg("status", "Include any listed payment status; default all statuses", enumeration::<PaymentStatusArg, PaymentStatus>())))
            .arg(date("due-from", "Inclusive earliest due date YYYY-MM-DD; default unbounded"))
            .arg(date("due-to", "Inclusive latest due date YYYY-MM-DD; default unbounded")), "50", 200))
        .subcommand(leaf("record", "Record a scheduled paid or skipped charge idempotently", Some("Records the scheduled outcome and advances the current schedule to the next unsettled date. Repeating the same date/status/amount returns replayed=true; mismatches conflict. Never contacts banks or providers."), "Examples:\n  kessai-mcp payments record <SUBSCRIPTION_ID> --status paid --json")
            .arg(positional("subscription-id", "Opaque subscription id from subscriptions list"))
            .arg(enum_arg("status", "Scheduled outcome paid or skipped; required", enumeration::<RecordedStatusArg, PaymentStatus>()).required(true))
            .arg(date("due-date", "Charge YYYY-MM-DD; default subscription next_payment_date"))
            .arg(amount("amount", "Nonnegative decimal major units; default subscription price")))
        .subcommand(leaf("create", "Insert a historical or pending ledger row", Some("Inserts a ledger row without advancing the subscription schedule. Repeating creates another row; prefer payments record for scheduled charges."), "Examples:\n  kessai-mcp payments create --subscription-id <ID> --amount 9.99 --due-date 2026-10-01 --status paid --json")
            .arg(option("subscription-id", "Opaque subscription id from subscriptions list; required").required(true))
            .arg(amount("amount", "Nonnegative amount in decimal major currency units; required").required(true))
            .arg(date("due-date", "Due date YYYY-MM-DD; required").required(true))
            .arg(enum_arg("status", "Ledger status; required", enumeration::<PaymentStatusArg, PaymentStatus>()).required(true))
            .arg(option("paid-at", "Paid timestamp RFC 3339; default now").value_parser(parse_timestamp))
            .arg(option("notes", "Notes up to 500 characters; default none")))
        .subcommand(leaf("update", "Correct an existing ledger row", Some("Overwrites supplied payment fields without moving the subscription schedule. Omitted fields remain unchanged; --clear notes removes notes."), "Examples:\n  kessai-mcp payments update <PAYMENT_ID> --amount 10 --json")
            .arg(positional("id", "Opaque payment id from payments list"))
            .arg(amount("amount", "Nonnegative decimal major units; default unchanged"))
            .arg(enum_arg("status", "Replacement ledger status; default unchanged", enumeration::<PaymentStatusArg, PaymentStatus>()))
            .arg(option("paid-at", "Paid timestamp RFC 3339; default unchanged").value_parser(parse_timestamp))
            .arg(option("notes", "Notes up to 500 characters; default unchanged"))
            .arg(repeated(enum_arg("clear", "Nullable fields to clear; cannot also set notes", enumeration::<PaymentClearArg, PaymentClearField>()))))
        .subcommand(delete_command("Examples:\n  kessai-mcp payments delete <PAYMENT_ID> --dry-run --json\n  kessai-mcp payments delete <PAYMENT_ID> --yes --json"));
    let calendar = group(
        "calendar",
        "Project renewals and summarize charges without currency conversion",
    )
    .subcommand(paging(
        leaf(
            "month",
            "Project every charge occurrence in a calendar month",
            None,
            "Examples:\n  kessai-mcp calendar month 2026-10 --limit 200 --json",
        )
        .arg(
            positional(
                "month",
                "Calendar month YYYY-MM, from 1900-01 through 9998-12",
            )
            .value_parser(parse_month),
        ),
        "200",
        500,
    ));
    let categories = reference_group("categories", "Manage local subscription categories", "Examples:\n  kessai-mcp categories list --json", "Examples:\n  kessai-mcp categories create --name Work --color '#336699' --icon briefcase --json", "Examples:\n  kessai-mcp categories update <CATEGORY_ID> --name Work --json", "Examples:\n  kessai-mcp categories delete <CATEGORY_ID> --dry-run --json");
    let tags = reference_group(
        "tags",
        "Manage local subscription tags",
        "Examples:\n  kessai-mcp tags list --json",
        "Examples:\n  kessai-mcp tags create --name Work --color '#336699' --json",
        "Examples:\n  kessai-mcp tags update <TAG_ID> --name Work --json",
        "Examples:\n  kessai-mcp tags delete <TAG_ID> --dry-run --json",
    );
    let cards = reference_group("cards", "Manage card labels; never store full card numbers", "Examples:\n  kessai-mcp cards list --json", "Examples:\n  kessai-mcp cards create --name Visa --card-type credit --last-four 1234 --json", "Examples:\n  kessai-mcp cards update <CARD_ID> --clear last_four --json", "Examples:\n  kessai-mcp cards delete <CARD_ID> --dry-run --json");
    let settings = group("settings", "Read and update display, notification, and budget settings")
        .subcommand(leaf("get", "Read current application settings", None, "Examples:\n  kessai-mcp settings get --json"))
        .subcommand(leaf("update", "Change selected application settings", Some("Overwrites supplied settings; omitted values remain unchanged. Changing display currency changes dashboard inclusion but never converts amounts. --clear monthly_budget removes the budget."), "Examples:\n  kessai-mcp settings update --currency USD --monthly-budget 100 --json")
            .arg(enum_arg("theme", "Desired display theme; default unchanged", enumeration::<ThemeArg, Theme>()))
            .arg(option("currency", "Uppercase ISO-4217 display currency, e.g. USD; default unchanged"))
            .arg(boolean("notification-enabled", "Enable notifications true/false; default unchanged"))
            .arg(repeated(integer("notification-days-before", "Days before charge, each 0–365; repeatable; default unchanged", 0, 365)))
            .arg(integer("notification-advance-days", "Default notice offset 0–365 days; default unchanged", 0, 365))
            .arg(option("notification-time", "Local 24-hour HH:MM notification time; default unchanged"))
            .arg(amount("monthly-budget", "Nonnegative budget in display-currency major units; default unchanged"))
            .arg(boolean("reduce-motion", "Reduce motion true/false; default unchanged"))
            .arg(boolean("enable-transitions", "Enable transitions true/false; default unchanged"))
            .arg(boolean("enable-hover-effects", "Enable hover effects true/false; default unchanged"))
            .arg(enum_arg("animation-speed", "Desired animation speed; default unchanged", enumeration::<AnimationArg, AnimationSpeed>()))
            .arg(repeated(enum_arg("clear", "Nullable settings fields to clear; default none", enumeration::<SettingsClearArg, SettingsClearField>()))));
    let analytics = group(
        "analytics",
        "Summarize current subscriptions and historical ledger spending",
    )
    .subcommand(leaf(
        "dashboard",
        "Summarize subscriptions in the display currency only",
        None,
        "Examples:\n  kessai-mcp analytics dashboard --json",
    ))
    .subcommand(
        leaf(
            "spending",
            "Summarize paid ledger history without currency conversion",
            None,
            "Examples:\n  kessai-mcp analytics spending --months 12 --json",
        )
        .arg(
            integer(
                "months",
                "Trailing months of paid ledger history, 1–60",
                1,
                60,
            )
            .default_value("12"),
        ),
    )
    .subcommand(
        leaf(
            "year",
            "Summarize a ledger year without currency conversion",
            None,
            "Examples:\n  kessai-mcp analytics year 2026 --json",
        )
        .arg(
            positional("year", "Calendar year integer 1900–9998")
                .value_parser(clap::value_parser!(i32).range(1900..=9998)),
        ),
    );
    let history = group(
        "price-history",
        "Read automatically recorded price and currency changes",
    )
    .subcommand(paging(
        leaf(
            "list",
            "List price changes with subscription names",
            None,
            "Examples:\n  kessai-mcp price-history list --since-days 365 --json",
        )
        .arg(option(
            "subscription-id",
            "Opaque subscription id; default all subscriptions",
        ))
        .arg(integer(
            "since-days",
            "Changes within the past 1–3650 days; default all history",
            1,
            3650,
        )),
        "50",
        200,
    ));
    let backup = group("backup", "Export or restore local JSON backup files")
        .subcommand(leaf("export", "Write a full backup file and report counts", Some("Writes a complete JSON backup to PATH on this machine. Existing files are refused unless --overwrite is supplied. Database content is unchanged; repeated exports overwrite only with explicit permission."), "Examples:\n  kessai-mcp backup export <BACKUP_PATH> --overwrite --json")
            .arg(positional("path", "Destination JSON file path, absolute or relative to cwd"))
            .arg(flag("overwrite", "Allow replacing the destination file; default false")))
        .subcommand(confirmation(leaf("import", "Restore a validated backup in one transaction", Some("Reads a local backup file. Merge upserts by id, preserving other records; replace removes existing data first. Replace and merges with overwrite collisions require --yes after a --dry-run preview. Validation precedes all domain writes; the import is atomic."), "Examples:\n  kessai-mcp backup import <BACKUP_PATH> --mode merge --dry-run --json")
            .arg(positional("path", "Source JSON backup path, absolute or relative to cwd"))
            .arg(enum_arg("mode", "Merge upserts ids; replace removes existing domain data first", enumeration::<ImportArg, ImportMode>()).default_value("merge"))));
    let serve = leaf("serve", "Start the stdio or loopback HTTP MCP server", Some("Opens the local database and serves MCP requests; writable tools may modify it unless --read-only is set. HTTP binds loopback only and requires a bearer token from --token-file or KESSAI_MCP_TOKEN. Stdout is reserved for MCP in stdio mode."), "Examples:\n  kessai-mcp serve --read-only\n  kessai-mcp serve --http --port 8742 --read-only")
        .arg(flag("read-only", "Hide and reject all non-read-only MCP tools; default false"))
        .arg(flag("http", "Use token-protected loopback HTTP /mcp instead of stdio; default false"))
        .arg(option("port", "Loopback TCP port, 0 chooses an available port; default 8742").value_parser(clap::value_parser!(u16)).default_value("8742").requires("http"))
        .arg(option("token-file", "Owner-only regular token file; default KESSAI_MCP_TOKEN environment").value_name("PATH").requires("http"));
    let setup = leaf("setup", "Generate or merge a standard project MCP configuration", Some("Emits an explicit serve command, optionally --read-only. With --output, atomically merges only the Kessai server and backs up an existing file. --dry-run never writes files. Without --output, only returns the generated configuration; never opens the database."), "Examples:\n  kessai-mcp setup --read-only --json\n  kessai-mcp setup --output .mcp.json --dry-run --json")
        .arg(option("output", "MCP config path to merge; default return config without writing").value_name("PATH"))
        .arg(flag("dry-run", "Return merged configuration without writing or backing up; default false"))
        .arg(flag("read-only", "Add --read-only to the generated serve command; default false"));
    let schema = leaf(
        "schema",
        "Discover commands, arguments, and output schemas as JSON",
        None,
        "Examples:\n  kessai-mcp schema --json\n  kessai-mcp schema subscriptions update",
    )
    .arg(Arg::new("group").help("Optional command group; default all leaf commands"))
    .arg(
        Arg::new("verb")
            .help("Optional verb within GROUP; default all group leaves")
            .requires("group"),
    );
    let info = leaf(
        "info",
        "Inspect effective paths and versions without initializing the database",
        None,
        "Examples:\n  kessai-mcp info --json",
    );
    Command::new("kessai-mcp")
        .about("Kessai local subscription tracker — CLI and MCP server")
        .version(env!("CARGO_PKG_VERSION"))
        .propagate_version(true)
        .disable_help_subcommand(true)
        .disable_help_flag(true)
        .disable_version_flag(true)
        .after_help(EXIT_HELP)
        .arg(
            option(
                "db-path",
                "Database file path; default KESSAI_DB_PATH or the platform data directory",
            )
            .value_name("PATH")
            .env("KESSAI_DB_PATH")
            .global(true)
            .help_heading("Global options"),
        )
        .arg(
            flag(
                "json",
                "Emit the exact contract DTO as JSON; errors go to stderr; default false",
            )
            .global(true)
            .help_heading("Global options"),
        )
        .arg(
            flag(
                "no-color",
                "Disable ANSI color; also disabled by NO_COLOR or non-TTY stdout",
            )
            .global(true)
            .help_heading("Global options"),
        )
        .arg(
            Arg::new("help")
                .long("help")
                .short('h')
                .help("Print help without opening the database")
                .action(ArgAction::Help)
                .global(true)
                .help_heading("Global options"),
        )
        .arg(
            Arg::new("version")
                .long("version")
                .short('V')
                .help("Print binary version without opening the database")
                .action(ArgAction::Version)
                .global(true)
                .help_heading("Global options"),
        )
        .subcommands([
            subscriptions,
            payments,
            calendar,
            categories,
            tags,
            cards,
            settings,
            analytics,
            history,
            backup,
            serve,
            setup,
            schema,
            info,
        ])
}

fn reference_group(
    name: &'static str,
    about: &'static str,
    list_example: &'static str,
    create_example: &'static str,
    update_example: &'static str,
    delete_example: &'static str,
) -> Command {
    let mut create = leaf("create", "Create a local reference record", Some("Inserts a local reference record. Repeating creates another record; list first if unsure. Card input accepts only the last four digits, never a full number."), create_example)
        .arg(option("name", "Display name, 1–100 characters; required").required(true))
        .arg(option("color", "Display color #RRGGBB; card default #6b7280; tag default from core").required(name == "categories"));
    let mut update = leaf("update", "Change fields on a local reference record", Some("Overwrites supplied reference fields; omitted fields remain unchanged. Requires at least one change. Repeated identical updates preserve the same desired values."), update_example)
        .arg(positional("id", "Opaque reference id from the corresponding list command"))
        .arg(option("name", "Display name, 1–100 characters; default unchanged"))
        .arg(option("color", "Display color #RRGGBB; default unchanged"));
    if name == "categories" {
        create =
            create.arg(option("icon", "UI icon name, e.g. briefcase; required").required(true));
        update = update.arg(option(
            "icon",
            "Replacement UI icon name; default unchanged",
        ));
    }
    if name == "cards" {
        create = create
            .arg(
                enum_arg(
                    "card-type",
                    "Card label type credit or debit; required",
                    enumeration::<CardTypeArg, CardType>(),
                )
                .required(true),
            )
            .arg(option(
                "last-four",
                "Exactly four digits; never a full card number; default none",
            ))
            .arg(amount(
                "credit-limit",
                "Nonnegative credit limit in decimal major units; default none",
            ));
        update = update
            .arg(enum_arg(
                "card-type",
                "Replacement card label type; default unchanged",
                enumeration::<CardTypeArg, CardType>(),
            ))
            .arg(option(
                "last-four",
                "Exactly four digits; never a full card number; default unchanged",
            ))
            .arg(amount(
                "credit-limit",
                "Nonnegative credit limit in decimal major units; default unchanged",
            ))
            .arg(repeated(enum_arg(
                "clear",
                "Nullable card fields to clear; repeatable; default none",
                enumeration::<CardClearArg, CardClearField>(),
            )));
    }
    group(name, about)
        .subcommand(paging(
            leaf(
                "list",
                "List reference records and subscription counts",
                None,
                list_example,
            ),
            "100",
            200,
        ))
        .subcommand(create)
        .subcommand(update)
        .subcommand(delete_command(delete_example))
}

pub fn parse_date(value: &str) -> std::result::Result<NaiveDate, String> {
    if value.len() != 10
        || value.as_bytes()[4] != b'-'
        || value.as_bytes()[7] != b'-'
        || !value
            .bytes()
            .enumerate()
            .all(|(index, byte)| matches!(index, 4 | 7) || byte.is_ascii_digit())
    {
        return Err("expected a date in YYYY-MM-DD format, e.g. 2026-10-01".into());
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| "expected a valid YYYY-MM-DD date, e.g. 2026-10-01".into())
}
pub fn parse_month(value: &str) -> std::result::Result<YearMonth, String> {
    value
        .parse::<YearMonth>()
        .map_err(|error| error.to_string())
}
pub fn non_negative(value: &str) -> std::result::Result<f64, String> {
    let amount = value.parse::<f64>().map_err(|_| {
        "expected a nonnegative amount in decimal major units, e.g. 9.99".to_string()
    })?;
    if amount.is_finite() && amount >= 0.0 {
        Ok(amount)
    } else {
        Err("amount must be finite and nonnegative, e.g. 9.99".into())
    }
}
fn parse_timestamp(value: &str) -> std::result::Result<String, String> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|_| value.to_owned())
        .map_err(|_| "expected RFC 3339, e.g. 2026-10-01T12:00:00Z".into())
}

fn opt<T: Clone + Send + Sync + 'static>(args: &ArgMatches, name: &str) -> Option<T> {
    args.get_one::<T>(name).cloned()
}
fn many<T: Clone + Send + Sync + 'static>(args: &ArgMatches, name: &str) -> Vec<T> {
    args.get_many::<T>(name)
        .map(|values| values.cloned().collect())
        .unwrap_or_default()
}
fn required<T: Clone + Send + Sync + 'static>(args: &ArgMatches, name: &str) -> T {
    opt(args, name).expect("clap validates required arguments")
}
fn date_value(args: &ArgMatches, name: &str) -> Option<String> {
    args.get_one::<NaiveDate>(name).map(ToString::to_string)
}
fn small_int(args: &ArgMatches, name: &str) -> Option<i32> {
    opt::<i64>(args, name).map(|value| value as i32)
}
fn page_limit(args: &ArgMatches) -> Option<usize> {
    opt::<u16>(args, "limit").map(usize::from)
}
fn serialized<T: Serialize>(result: Result<T>) -> Result<Value> {
    serde_json::to_value(result?)
        .map_err(|error| AppError::new(ErrorKind::Internal, error.to_string()))
}

pub fn run(group: &str, args: &ArgMatches, app: &Application) -> Result<Value> {
    let (verb, args) = args.subcommand().expect("clap validates group verbs");
    match (group, verb) {
        ("subscriptions", "list") => serialized(app.list_subscriptions(SubscriptionFilter {
            query: opt(args, "query"),
            status: many(args, "status"),
            category_id: opt(args, "category-id"),
            card_id: opt(args, "card-id"),
            tag_id: opt(args, "tag-id"),
            due_from: date_value(args, "due-from"),
            due_to: date_value(args, "due-to"),
            upcoming_days: opt(args, "upcoming-days"),
            review_overdue_days: opt(args, "review-overdue-days"),
            trial_ending_within_days: opt(args, "trial-ending-within-days"),
            sort: required(args, "sort"),
            limit: page_limit(args),
            cursor: opt(args, "cursor"),
        })),
        ("subscriptions", "get") => {
            serialized(app.get_subscription(&required::<String>(args, "id")))
        }
        ("subscriptions", "create") => {
            serialized(app.create_subscription(CreateSubscriptionInput {
                name: required(args, "name"),
                amount: required(args, "amount"),
                currency: opt(args, "currency"),
                billing_cycle: required(args, "billing-cycle"),
                billing_day: small_int(args, "billing-day"),
                category_id: opt(args, "category-id"),
                card_id: opt(args, "card-id"),
                color: opt(args, "color"),
                notes: opt(args, "notes"),
                next_payment_date: date_value(args, "next-payment-date"),
                status: opt(args, "status"),
                trial_end_date: date_value(args, "trial-end-date"),
                shared_count: small_int(args, "shared-count"),
                is_pinned: opt(args, "pinned"),
                tag_ids: many(args, "tag-id"),
            }))
        }
        ("subscriptions", "update") => serialized(app.update_subscription(
            &required::<String>(args, "id"),
            UpdateSubscriptionInput {
                name: opt(args, "name"),
                amount: opt(args, "amount"),
                currency: opt(args, "currency"),
                billing_cycle: opt(args, "billing-cycle"),
                billing_day: small_int(args, "billing-day"),
                category_id: opt(args, "category-id"),
                card_id: opt(args, "card-id"),
                color: opt(args, "color"),
                notes: opt(args, "notes"),
                next_payment_date: date_value(args, "next-payment-date"),
                status: opt(args, "status"),
                trial_end_date: date_value(args, "trial-end-date"),
                shared_count: small_int(args, "shared-count"),
                is_pinned: opt(args, "pinned"),
                cancellation_reason: opt(args, "cancellation-reason"),
                mark_reviewed: args.get_flag("mark-reviewed").then_some(true),
                add_tag_ids: many(args, "add-tag-id"),
                remove_tag_ids: many(args, "remove-tag-id"),
                clear_fields: many(args, "clear"),
            },
        )),
        ("payments", "list") => serialized(app.list_payments(PaymentFilter {
            subscription_id: opt(args, "subscription-id"),
            month: args.get_one::<YearMonth>("month").map(ToString::to_string),
            status: many(args, "status"),
            due_from: date_value(args, "due-from"),
            due_to: date_value(args, "due-to"),
            limit: page_limit(args),
            cursor: opt(args, "cursor"),
        })),
        ("payments", "record") => serialized(app.record_outcome(
            &required::<String>(args, "subscription-id"),
            required(args, "status"),
            date_value(args, "due-date"),
            opt(args, "amount"),
        )),
        ("payments", "create") => serialized(app.create_payment(CreatePaymentInput {
            subscription_id: required(args, "subscription-id"),
            amount: required(args, "amount"),
            due_date: date_value(args, "due-date").unwrap(),
            status: required(args, "status"),
            paid_at: opt(args, "paid-at"),
            notes: opt(args, "notes"),
        })),
        ("payments", "update") => serialized(app.update_payment(
            &required::<String>(args, "id"),
            UpdatePaymentInput {
                amount: opt(args, "amount"),
                status: opt(args, "status"),
                paid_at: opt(args, "paid-at"),
                notes: opt(args, "notes"),
                clear_fields: many(args, "clear"),
            },
        )),
        ("calendar", "month") => serialized(app.calendar_month(
            required(args, "month"),
            page_limit(args),
            opt(args, "cursor"),
        )),
        ("categories", "list") => {
            serialized(app.list_categories(page_limit(args), opt(args, "cursor")))
        }
        ("categories", "create") => serialized(app.create_category(
            required(args, "name"),
            required(args, "color"),
            required(args, "icon"),
        )),
        ("categories", "update") => serialized(app.update_category(
            &required::<String>(args, "id"),
            opt(args, "name"),
            opt(args, "color"),
            opt(args, "icon"),
        )),
        ("tags", "list") => serialized(app.list_tags(page_limit(args), opt(args, "cursor"))),
        ("tags", "create") => {
            serialized(app.create_tag(required(args, "name"), opt(args, "color")))
        }
        ("tags", "update") => serialized(app.update_tag(
            &required::<String>(args, "id"),
            opt(args, "name"),
            opt(args, "color"),
        )),
        ("cards", "list") => serialized(app.list_cards(page_limit(args), opt(args, "cursor"))),
        ("cards", "create") => serialized(app.create_card(CreateCardInput {
            name: required(args, "name"),
            card_type: required(args, "card-type"),
            last_four: opt(args, "last-four"),
            color: opt(args, "color"),
            credit_limit: opt(args, "credit-limit"),
        })),
        ("cards", "update") => serialized(app.update_card(
            &required::<String>(args, "id"),
            UpdateCardInput {
                name: opt(args, "name"),
                card_type: opt(args, "card-type"),
                last_four: opt(args, "last-four"),
                color: opt(args, "color"),
                credit_limit: opt(args, "credit-limit"),
                clear_fields: many(args, "clear"),
            },
        )),
        ("subscriptions" | "payments" | "categories" | "tags" | "cards", "delete") => {
            let id = required::<String>(args, "id");
            let confirm = args.get_flag("yes");
            let dry_run = args.get_flag("dry-run");
            serialized(match group {
                "subscriptions" => app.delete_subscription(&id, confirm, dry_run),
                "payments" => app.delete_payment(&id, confirm, dry_run),
                "categories" => app.delete_category(&id, confirm, dry_run),
                "tags" => app.delete_tag(&id, confirm, dry_run),
                _ => app.delete_card(&id, confirm, dry_run),
            })
        }
        ("settings", "get") => serialized(app.settings_get()),
        ("settings", "update") => serialized(
            app.settings_update(UpdateSettingsInput {
                theme: opt(args, "theme"),
                currency: opt(args, "currency"),
                notification_enabled: opt(args, "notification-enabled"),
                notification_days_before: args
                    .get_many::<i64>("notification-days-before")
                    .map(|values| values.map(|value| *value as i32).collect()),
                notification_advance_days: small_int(args, "notification-advance-days"),
                notification_time: opt(args, "notification-time"),
                monthly_budget: opt(args, "monthly-budget"),
                reduce_motion: opt(args, "reduce-motion"),
                enable_transitions: opt(args, "enable-transitions"),
                enable_hover_effects: opt(args, "enable-hover-effects"),
                animation_speed: opt(args, "animation-speed"),
                clear_fields: many(args, "clear"),
            }),
        ),
        ("analytics", "dashboard") => serialized(app.analytics_dashboard()),
        ("analytics", "spending") => {
            serialized(app.analytics_spending(required::<i64>(args, "months") as i32))
        }
        ("analytics", "year") => serialized(app.analytics_year(required(args, "year"))),
        ("price-history", "list") => serialized(app.price_history_list(
            opt(args, "subscription-id"),
            opt(args, "since-days"),
            page_limit(args),
            opt(args, "cursor"),
        )),
        ("backup", "export") => serialized(app.export_backup_to(
            Path::new(args.get_one::<String>("path").unwrap()),
            args.get_flag("overwrite"),
        )),
        ("backup", "import") => serialized(app.import_backup_from(
            Path::new(args.get_one::<String>("path").unwrap()),
            required(args, "mode"),
            args.get_flag("yes"),
            args.get_flag("dry-run"),
        )),
        _ => Err(AppError::new(ErrorKind::Internal, "unmapped CLI operation")),
    }
}

/// A complete, explicit output map; transport/setup commands also have schemas.
#[derive(Clone, Copy)]
pub enum OutputKind {
    Subscriptions,
    Subscription,
    Payments,
    Payment,
    Record,
    Calendar,
    References,
    Reference,
    Delete,
    Settings,
    Dashboard,
    Spending,
    Year,
    Prices,
    Export,
    Import,
    Setup,
    Info,
    Discovery,
    Protocol,
}
pub fn output_kind(path: &[&str]) -> Option<OutputKind> {
    use OutputKind::*;
    Some(match path {
        ["subscriptions", "list"] => Subscriptions,
        ["subscriptions", "get" | "create" | "update"] => Subscription,
        ["payments", "list"] => Payments,
        ["payments", "create" | "update"] => Payment,
        ["payments", "record"] => Record,
        ["calendar", "month"] => Calendar,
        ["categories" | "tags" | "cards", "list"] => References,
        ["categories" | "tags" | "cards", "create" | "update"] => Reference,
        ["subscriptions" | "payments" | "categories" | "tags" | "cards", "delete"] => Delete,
        ["settings", "get" | "update"] => Settings,
        ["analytics", "dashboard"] => Dashboard,
        ["analytics", "spending"] => Spending,
        ["analytics", "year"] => Year,
        ["price-history", "list"] => Prices,
        ["backup", "export"] => Export,
        ["backup", "import"] => Import,
        ["setup"] => Setup,
        ["info"] => Info,
        ["schema"] => Discovery,
        ["serve"] => Protocol,
        _ => return None,
    })
}
impl OutputKind {
    pub fn schema(self) -> Value {
        macro_rules! schema {
            ($t:ty) => {
                serde_json::to_value(schemars::schema_for!($t)).expect("JSON schema serializes")
            };
        }
        match self {
            Self::Subscriptions => schema!(Page<SubscriptionItem>),
            Self::Subscription => schema!(SubscriptionDetail),
            Self::Payments => schema!(Page<PaymentItem>),
            Self::Payment => schema!(PaymentItem),
            Self::Record => schema!(RecordOutcome),
            Self::Calendar => schema!(CalendarMonth),
            Self::References => schema!(Page<RefItem>),
            Self::Reference => schema!(RefItem),
            Self::Delete => schema!(DeleteResult),
            Self::Settings => schema!(Settings),
            Self::Dashboard => schema!(DashboardStats),
            Self::Spending => schema!(SpendingReport),
            Self::Year => schema!(YearSummary),
            Self::Prices => schema!(Page<PriceChangeItem>),
            Self::Export => schema!(ExportOutcome),
            Self::Import => schema!(ImportResult),
            Self::Setup => schema!(crate::setup::SetupOutcome),
            Self::Info => schema!(Info),
            Self::Discovery => schema!(DiscoveryOutput),
            Self::Protocol => schema!(()),
        }
    }
}
#[derive(Serialize, JsonSchema)]
#[serde(untagged)]
pub enum DiscoveryOutput {
    Catalog(Discovery),
    Command(Box<CommandSchema>),
}
#[derive(Serialize, JsonSchema)]
pub struct Discovery {
    pub schema_version: String,
    pub cli_version: String,
    pub commands: Vec<CommandSchema>,
    pub error_codes: Vec<ExitStatus>,
}
#[derive(Serialize, JsonSchema)]
pub struct CommandSchema {
    pub path: Vec<String>,
    pub summary: String,
    pub long_summary: Option<String>,
    pub mutates: bool,
    pub destructive: bool,
    pub idempotent: bool,
    pub supports_dry_run: bool,
    pub requires_yes: bool,
    pub positionals: Vec<ArgumentSchema>,
    pub options: Vec<ArgumentSchema>,
    pub output_schema: Value,
    pub error_codes: Vec<ExitStatus>,
    pub examples: String,
}
#[derive(Serialize, JsonSchema)]
pub struct ArgumentSchema {
    pub name: String,
    pub long: Option<String>,
    pub r#type: String,
    pub description: String,
    pub required: bool,
    pub repeatable: bool,
    pub r#enum: Vec<String>,
    pub default: Vec<String>,
    pub conflicts_with: Vec<String>,
    pub global: bool,
}
#[derive(Serialize, JsonSchema)]
pub struct ExitStatus {
    pub exit: u8,
    pub code: String,
}
fn exit_codes() -> Vec<ExitStatus> {
    [
        "success",
        "internal_error",
        "validation_error",
        "not_found",
        "conflict",
        "confirmation_required",
        "io_error",
    ]
    .into_iter()
    .enumerate()
    .map(|(exit, code)| ExitStatus {
        exit: exit as u8,
        code: code.into(),
    })
    .collect()
}
fn argument_schema(command: &Command, arg: &Arg) -> ArgumentSchema {
    let parser = arg.get_value_parser();
    let id = parser.type_id();
    let values = arg
        .get_possible_values()
        .into_iter()
        .filter(|value| !value.is_hide_set())
        .map(|value| value.get_name().to_owned())
        .collect::<Vec<_>>();
    let kind = if matches!(
        arg.get_action(),
        ArgAction::SetTrue | ArgAction::Help | ArgAction::Version
    ) || id == TypeId::of::<bool>()
    {
        "boolean"
    } else if id == TypeId::of::<f64>() {
        "number"
    } else if id == TypeId::of::<u16>() || id == TypeId::of::<i32>() || id == TypeId::of::<i64>() {
        "integer"
    } else if id == TypeId::of::<NaiveDate>() {
        "date"
    } else if id == TypeId::of::<YearMonth>() {
        "month"
    } else {
        "string"
    };
    ArgumentSchema {
        name: arg.get_id().to_string(),
        long: arg.get_long().map(str::to_owned),
        r#type: kind.into(),
        description: arg.get_help().map(ToString::to_string).unwrap_or_default(),
        required: arg.is_required_set(),
        repeatable: matches!(arg.get_action(), ArgAction::Append),
        r#enum: values,
        default: arg
            .get_default_values()
            .iter()
            .map(|value| value.to_string_lossy().into_owned())
            .collect(),
        conflicts_with: command
            .get_arg_conflicts_with(arg)
            .iter()
            .map(|arg| arg.get_id().to_string())
            .collect(),
        global: arg.is_global_set(),
    }
}
fn command_schema(command: &Command, path: &[String]) -> CommandSchema {
    let path_refs = path.iter().map(String::as_str).collect::<Vec<_>>();
    let verb = path.last().map(String::as_str).unwrap_or_default();
    let mutates = matches!(
        verb,
        "create" | "update" | "delete" | "record" | "export" | "import" | "setup" | "serve"
    );
    let destructive = matches!(verb, "update" | "delete" | "import");
    let args: Vec<_> = command.get_arguments().collect();
    CommandSchema {
        path: path.to_vec(),
        summary: command.get_about().unwrap().to_string(),
        long_summary: command.get_long_about().map(ToString::to_string),
        mutates,
        destructive,
        idempotent: !matches!(verb, "create" | "delete" | "setup" | "serve"),
        supports_dry_run: args.iter().any(|arg| arg.get_id() == "dry-run"),
        requires_yes: matches!(verb, "delete" | "import"),
        positionals: args
            .iter()
            .filter(|arg| arg.is_positional())
            .map(|arg| argument_schema(command, arg))
            .collect(),
        options: args
            .iter()
            .filter(|arg| !arg.is_positional())
            .map(|arg| argument_schema(command, arg))
            .collect(),
        output_schema: output_kind(&path_refs)
            .expect("every leaf has an output mapping")
            .schema(),
        error_codes: exit_codes(),
        examples: command.get_after_help().unwrap().to_string(),
    }
}
pub fn schema(group: Option<&str>, verb: Option<&str>) -> Result<Value> {
    fn walk(command: &Command, path: &mut Vec<String>, commands: &mut Vec<CommandSchema>) {
        if !command.has_subcommands() {
            commands.push(command_schema(command, path));
        }
        for child in command.get_subcommands() {
            path.push(child.get_name().into());
            walk(child, path, commands);
            path.pop();
        }
    }
    let mut root = command();
    root.build();
    let mut commands = Vec::new();
    walk(&root, &mut Vec::new(), &mut commands);
    if let Some(group) = group {
        commands.retain(|entry| {
            entry.path[0] == group
                && verb.is_none_or(|verb| entry.path.get(1).is_some_and(|part| part == verb))
        });
        if commands.is_empty() {
            return Err(AppError::validation(
                "group",
                "unknown command group or verb",
                "Run kessai-mcp schema to discover valid paths.",
            ));
        }
        if verb.is_some() || commands[0].path.len() == 1 {
            return serialized(Ok(DiscoveryOutput::Command(Box::new(commands.remove(0)))));
        }
    }
    serialized(Ok(DiscoveryOutput::Catalog(Discovery {
        schema_version: SCHEMA_VERSION.into(),
        cli_version: env!("CARGO_PKG_VERSION").into(),
        commands,
        error_codes: exit_codes(),
    })))
}

#[derive(Serialize, JsonSchema)]
pub struct Info {
    /// Effective absolute database path, without creating it.
    pub database_path: String,
    pub exists: bool,
    pub size_bytes: Option<u64>,
    /// Last recorded core migration, or null if no file/table exists.
    pub database_schema_version: Option<i64>,
    pub database_schema_reason: Option<String>,
    pub binary_version: String,
    pub schema_version: String,
}
pub fn resolve_db_path(path: Option<PathBuf>) -> Result<PathBuf> {
    let path = path.unwrap_or_else(|| {
        dirs::data_dir()
            .map(|dir| dir.join("com.asf.kessai/kessai.db"))
            .unwrap_or_else(|| PathBuf::from("kessai.db"))
    });
    if path.is_absolute() {
        Ok(path)
    } else {
        Ok(std::env::current_dir()?.join(path))
    }
}
pub fn ensure_parent(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}
pub fn info(path: &Path) -> Result<Info> {
    let metadata = match std::fs::metadata(path) {
        Ok(value) => Some(value),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.into()),
    };
    let (version, reason) = if metadata.is_some() {
        let conn = rusqlite::Connection::open_with_flags(
            path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|error| AppError::new(ErrorKind::Io, error.to_string()))?;
        let exists: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='_kessai_migrations')", [], |row| row.get(0))
            .map_err(|error| AppError::new(ErrorKind::Io,error.to_string()))?;
        if exists {
            (
                conn.query_row("SELECT max(version) FROM _kessai_migrations", [], |row| {
                    row.get::<_, Option<i64>>(0)
                })
                .map_err(|error| AppError::new(ErrorKind::Io, error.to_string()))?,
                None,
            )
        } else {
            (None, Some("Migration table is absent.".into()))
        }
    } else {
        (None, Some("Database file does not exist.".into()))
    };
    Ok(Info {
        database_path: path.to_string_lossy().into_owned(),
        exists: metadata.is_some(),
        size_bytes: metadata.map(|value| value.len()),
        database_schema_version: version,
        database_schema_reason: reason,
        binary_version: env!("CARGO_PKG_VERSION").into(),
        schema_version: SCHEMA_VERSION.into(),
    })
}
pub fn emit(value: &Value, json_mode: bool, no_color: bool) {
    if json_mode {
        println!("{value}");
        return;
    }
    let color =
        !no_color && std::env::var_os("NO_COLOR").is_none() && std::io::stdout().is_terminal();
    if let Some(items) = value.get("items").and_then(Value::as_array) {
        let mut table = Table::new();
        table.load_preset(UTF8_FULL);
        if let Some(first) = items.first().and_then(Value::as_object) {
            let columns = first.keys().collect::<Vec<_>>();
            table.set_header(&columns);
            for item in items {
                table.add_row(columns.iter().map(|column| display_value(&item[*column])));
            }
            println!("{table}");
        } else {
            println!("No matching records.");
        }
        for key in ["total", "next_cursor", "warnings", "totals_by_currency"] {
            if let Some(value) = value.get(key) {
                println!("{key}: {}", display_value(value));
            }
        }
    } else if let Some(object) = value.as_object() {
        for (key, value) in object {
            if color {
                print!("\x1b[1m{key}\x1b[0m: ");
            } else {
                print!("{key}: ");
            }
            println!("{}", display_value(value));
        }
    } else {
        println!("{}", display_value(value));
    }
}
fn display_value(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        _ => value.to_string(),
    }
}

pub fn usage_hint(args: &[String]) -> String {
    let mut tokens = args.iter().skip(1);
    let root = loop {
        match tokens.next().map(String::as_str) {
            Some("--db-path") => {
                tokens.next();
            }
            Some(arg) if arg.starts_with('-') => {}
            value => break value,
        }
    };
    let replacement = match root {
        Some("list") => Some("subscriptions list"),
        Some("add") => Some("subscriptions create"),
        Some("update") => Some("subscriptions update"),
        Some("remove") => Some("subscriptions delete"),
        Some("toggle") => Some("subscriptions update --status"),
        Some("pay") => Some("payments record --status paid"),
        Some("skip") => Some("payments record --status skipped"),
        Some("add-category") => Some("categories create"),
        Some("upcoming") => Some("subscriptions list --upcoming-days"),
        Some("stats") => Some("analytics dashboard"),
        Some("export") => Some("backup export"),
        Some("import") => Some("backup import"),
        Some("serve-http") => Some("serve --http"),
        _ => None,
    };
    if let Some(replacement) = replacement {
        return format!("Legacy flat commands were removed; use kessai-mcp {replacement}. Run kessai-mcp --help.");
    }
    let mut tree = command();
    let mut path = Vec::new();
    if let Some(root) = root {
        if let Some(group) = tree.find_subcommand_mut(root) {
            path.push(root);
            if let Some(verb) = tokens.next().map(String::as_str) {
                if group.find_subcommand(verb).is_some() {
                    path.push(verb);
                }
            }
        }
    }
    if path.is_empty() {
        "Run kessai-mcp --help or kessai-mcp schema for valid commands and arguments.".into()
    } else {
        format!(
            "Run kessai-mcp {} --help for valid arguments.",
            path.join(" ")
        )
    }
}
/// AppError.hint is a string; embed an argv JSON array, never a shell command.
pub fn confirmation_hint(args: &[String]) -> String {
    let mut rerun = args.to_vec();
    rerun.push("--yes".into());
    format!(
        "Preview with --dry-run, then after approval rerun argv: {}",
        json!(rerun)
    )
}
