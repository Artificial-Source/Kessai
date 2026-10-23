use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    process::{Command, Output},
};

fn tempdir() -> tempfile::TempDir {
    let root = Path::new("/tmp/kessai-agentux/wp/AgentUxWp3");
    std::fs::create_dir_all(root).unwrap();
    tempfile::tempdir_in(root).unwrap()
}
fn run(db: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_kessai-mcp"))
        .env("KESSAI_DB_PATH", db)
        .env("NO_COLOR", "1")
        .args(args)
        .output()
        .unwrap()
}
fn data(db: &Path, args: &[&str]) -> Value {
    let mut all = vec!["--json"];
    all.extend_from_slice(args);
    let output = run(db, &all);
    assert!(
        output.status.success(),
        "{args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output.stderr.is_empty());
    serde_json::from_slice(&output.stdout).unwrap()
}
fn leaves(command: &clap::Command, path: Vec<String>, out: &mut Vec<Vec<String>>) {
    if !command.has_subcommands() {
        out.push(path);
        return;
    }
    for child in command.get_subcommands() {
        let mut path = path.clone();
        path.push(child.get_name().into());
        leaves(child, path, out);
    }
}
#[test]
fn help_tree_is_documented_and_never_creates_database() {
    fn walk(command: &clap::Command, path: &mut Vec<String>, db: &Path) {
        let about = command.get_about().expect("command about").to_string();
        assert!(about.chars().count() <= 80, "{path:?}: {about}");
        for arg in command.get_arguments() {
            assert!(arg.get_help().is_some(), "{path:?}: {}", arg.get_id());
        }
        if !command.has_subcommands() {
            assert!(command
                .get_after_help()
                .unwrap()
                .to_string()
                .contains("Examples:"));
            assert!(
                kessai_mcp::cli::output_kind(&path.iter().map(String::as_str).collect::<Vec<_>>())
                    .is_some(),
                "{path:?}"
            );
        }
        let mut args: Vec<_> = path.iter().map(String::as_str).collect();
        args.push("--help");
        let output = run(db, &args);
        assert!(
            output.status.success(),
            "{args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(!db.exists());
        for child in command.get_subcommands() {
            path.push(child.get_name().into());
            walk(child, path, db);
            path.pop();
        }
    }
    let dir = tempdir();
    let db = dir.path().join("absent/contract.db");
    let mut command = kessai_mcp::cli::command();
    command.build();
    walk(&command, &mut Vec::new(), &db);
    assert!(!db.parent().unwrap().exists());
    let bare = run(&db, &[]);
    assert_eq!(bare.status.code(), Some(2));
}

#[test]
fn schema_maps_every_leaf_and_reports_parser_metadata() {
    let dir = tempdir();
    let db = dir.path().join("absent/db.sqlite");
    let all = data(&db, &["schema"]);
    assert_eq!(all["schema_version"], "1");
    let mut command = kessai_mcp::cli::command();
    command.build();
    let mut paths = Vec::new();
    leaves(&command, Vec::new(), &mut paths);
    let commands = all["commands"].as_array().unwrap();
    assert_eq!(commands.len(), paths.len());
    for path in paths {
        let record = commands
            .iter()
            .find(|entry| entry["path"] == json!(path))
            .unwrap();
        assert!(record["output_schema"].is_object());
        if record["mutates"] == true {
            assert!(record["long_summary"]
                .as_str()
                .is_some_and(|value| !value.is_empty()));
        }
    }
    let update = data(&db, &["schema", "subscriptions", "update"]);
    let options = update["options"].as_array().unwrap();
    assert!(options.iter().any(|arg| arg["long"] == "clear"
        && arg["enum"]
            .as_array()
            .unwrap()
            .contains(&json!("category_id"))));
    let delete = data(&db, &["schema", "subscriptions", "delete"]);
    assert!(delete["options"]
        .as_array()
        .unwrap()
        .iter()
        .any(|arg| arg["long"] == "dry-run"
            && arg["conflicts_with"]
                .as_array()
                .unwrap()
                .contains(&json!("yes"))));
    assert!(!db.parent().unwrap().exists());
}

fn create(db: &Path, name: &str) -> Value {
    data(
        db,
        &[
            "subscriptions",
            "create",
            "--name",
            name,
            "--amount",
            "9.99",
            "--billing-cycle",
            "monthly",
            "--currency",
            "USD",
            "--next-payment-date",
            "2026-10-01",
        ],
    )
}

#[tokio::test]
async fn json_stdout_equals_mcp_structured_content() {
    let dir = tempdir();
    let db = dir.path().join("parity.db");
    let subscription = create(&db, "Parity");
    let id = subscription["id"].as_str().unwrap();
    data(
        &db,
        &[
            "payments",
            "record",
            id,
            "--status",
            "paid",
            "--due-date",
            "2026-10-01",
        ],
    );
    let server = kessai_mcp::mcp::KessaiMcp::new(kessai_core::KessaiCore::new(&db).unwrap());
    let cases: Vec<(&str, Vec<&str>, Value)> = vec![
        (
            "subscriptions_list",
            vec!["subscriptions", "list"],
            json!({}),
        ),
        (
            "subscriptions_get",
            vec!["subscriptions", "get", id],
            json!({"id":id}),
        ),
        ("payments_list", vec!["payments", "list"], json!({})),
        (
            "payments_record",
            vec![
                "payments",
                "record",
                id,
                "--status",
                "paid",
                "--due-date",
                "2026-10-01",
            ],
            json!({"subscription_id":id,"status":"paid","due_date":"2026-10-01"}),
        ),
        (
            "calendar_month",
            vec!["calendar", "month", "2026-10"],
            json!({"month":"2026-10"}),
        ),
        ("categories_list", vec!["categories", "list"], json!({})),
        ("tags_list", vec!["tags", "list"], json!({})),
        ("cards_list", vec!["cards", "list"], json!({})),
        ("settings_get", vec!["settings", "get"], json!({})),
        (
            "analytics_dashboard",
            vec!["analytics", "dashboard"],
            json!({}),
        ),
        (
            "analytics_spending",
            vec!["analytics", "spending", "--months", "3"],
            json!({"months":3}),
        ),
        (
            "analytics_year",
            vec!["analytics", "year", "2026"],
            json!({"year":2026}),
        ),
        (
            "price_history_list",
            vec!["price-history", "list"],
            json!({}),
        ),
        (
            "subscriptions_delete",
            vec!["subscriptions", "delete", id, "--dry-run"],
            json!({"id":id,"dry_run":true}),
        ),
    ];
    for (name, args, input) in cases {
        let cli = data(&db, &args);
        let mcp = server.call_tool_named(name, input).await.unwrap();
        assert_ne!(mcp.is_error, Some(true), "{name}: {:?}", mcp.content);
        assert_eq!(Some(cli), mcp.structured_content, "{name}");
    }
}

#[test]
fn cursor_pagination_visits_each_row_once_and_rejects_changed_filters() {
    let dir = tempdir();
    let db = dir.path().join("pages.db");
    for name in ["A", "B", "C"] {
        create(&db, name);
    }
    let mut cursor = None;
    let mut ids = Vec::new();
    loop {
        let mut args = vec!["subscriptions", "list", "--limit", "1", "--sort", "name"];
        if let Some(cursor) = cursor.as_deref() {
            args.extend(["--cursor", cursor]);
        }
        let page = data(&db, &args);
        assert_eq!(page["total"], 3);
        ids.push(page["items"][0]["id"].as_str().unwrap().to_owned());
        cursor = page["next_cursor"].as_str().map(str::to_owned);
        if cursor.is_none() {
            break;
        }
    }
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), 3);
    let first = data(&db, &["subscriptions", "list", "--limit", "1"]);
    let bad = run(
        &db,
        &[
            "--json",
            "subscriptions",
            "list",
            "--query",
            "different",
            "--cursor",
            first["next_cursor"].as_str().unwrap(),
        ],
    );
    assert_eq!(bad.status.code(), Some(2));
    assert!(bad.stdout.is_empty());
    let error: Value = serde_json::from_slice(&bad.stderr).unwrap();
    assert_eq!(error["error"]["field"], "cursor");
}

#[test]
fn delete_requires_explicit_confirmation_and_returns_rerun_argv() {
    let dir = tempdir();
    let db = dir.path().join("delete.db");
    let item = create(&db, "Delete");
    let id = item["id"].as_str().unwrap();
    let denied = run(&db, &["--json", "subscriptions", "delete", id]);
    assert_eq!(denied.status.code(), Some(5));
    assert!(denied.stdout.is_empty());
    let error: Value = serde_json::from_slice(&denied.stderr).unwrap();
    let hint = error["error"]["hint"].as_str().unwrap();
    let argv: Vec<String> =
        serde_json::from_str(hint.split("rerun argv: ").nth(1).unwrap()).unwrap();
    assert_eq!(argv.last().unwrap(), "--yes");
    assert!(argv.iter().any(|value| value == id));
    assert_eq!(data(&db, &["subscriptions", "list"])["total"], 1);
    assert_eq!(
        data(&db, &["subscriptions", "delete", id, "--dry-run"])["dry_run"],
        true
    );
    assert_eq!(
        data(&db, &["subscriptions", "delete", id, "--yes"])["deleted"],
        true
    );
    assert_eq!(data(&db, &["subscriptions", "list"])["total"], 0);
}

#[test]
fn typed_usage_errors_do_not_create_database_and_legacy_names_have_hints() {
    assert!(kessai_mcp::cli::command()
        .try_get_matches_from(["kessai-mcp", "serve", "--read-only"])
        .is_ok());
    let dir = tempdir();
    let db = dir.path().join("absent/usage.db");
    for args in [
        vec!["subscriptions", "list", "--limit", "0"],
        vec!["subscriptions", "list", "--limit", "201"],
        vec!["subscriptions", "list", "--due-from", "2026-02-30"],
        vec!["subscriptions", "list", "--status", "Active"],
        vec![
            "subscriptions",
            "create",
            "--name",
            "Bad",
            "--amount",
            "NaN",
            "--billing-cycle",
            "monthly",
        ],
        vec!["calendar", "month", "2026-13"],
        vec!["subscriptions", "delete", "opaque", "--dry-run", "--yes"],
        vec!["serve", "--port", "8742"],
        vec!["list"],
        vec!["serve-http"],
    ] {
        let mut all = vec!["--json"];
        all.extend(args);
        let output = run(&db, &all);
        assert_eq!(output.status.code(), Some(2), "{all:?}");
        assert!(output.stdout.is_empty());
        let error: Value = serde_json::from_slice(&output.stderr).unwrap();
        assert_eq!(error["error"]["code"], "validation_error");
        assert!(error["error"]["hint"].is_string());
    }
    let old = run(&db, &["list"]);
    assert!(String::from_utf8_lossy(&old.stderr).contains("subscriptions list"));
    let old_http = run(&db, &["serve-http"]);
    assert!(String::from_utf8_lossy(&old_http.stderr).contains("serve --http"));
    assert!(!db.parent().unwrap().exists());
}

#[test]
fn human_output_has_no_ansi_when_piped_or_no_color_is_set() {
    let dir = tempdir();
    let db = dir.path().join("color.db");
    create(&db, "Color");
    for args in [
        vec!["subscriptions", "list"],
        vec!["settings", "get"],
        vec!["--no-color", "settings", "get"],
    ] {
        let output = run(&db, &args);
        assert!(output.status.success());
        assert!(!output.stdout.contains(&0x1b));
        let piped = Command::new(env!("CARGO_BIN_EXE_kessai-mcp"))
            .env("KESSAI_DB_PATH", &db)
            .env_remove("NO_COLOR")
            .args(&args)
            .output()
            .unwrap();
        assert!(piped.status.success());
        assert!(!piped.stdout.contains(&0x1b));
    }
}

#[test]
fn info_and_setup_do_not_initialize_database_and_setup_honors_json() {
    let dir = tempdir();
    let db = dir.path().join("absent/info.db");
    let info = data(&db, &["info"]);
    assert_eq!(info["database_path"], db.to_string_lossy().as_ref());
    assert_eq!(info["exists"], false);
    assert!(info["database_schema_version"].is_null());
    assert_eq!(info["schema_version"], "1");
    assert!(!db.parent().unwrap().exists());
    let output = dir.path().join(".mcp.json");
    let dry = data(
        &db,
        &[
            "setup",
            "--output",
            output.to_str().unwrap(),
            "--dry-run",
            "--read-only",
        ],
    );
    assert_eq!(dry["written"], false);
    assert!(!output.exists());
    assert!(!db.parent().unwrap().exists());
    assert!(dry["config"]["mcpServers"]["kessai"]["args"]
        .as_array()
        .unwrap()
        .contains(&json!("--read-only")));
    assert!(dry.get("operation").is_none());
    let written = data(&db, &["setup", "--output", output.to_str().unwrap()]);
    assert_eq!(written["written"], true);
    assert!(written["backup_path"].is_null());
    let again = data(&db, &["setup", "--output", output.to_str().unwrap()]);
    assert!(Path::new(again["backup_path"].as_str().unwrap()).exists());
    assert!(!db.parent().unwrap().exists());
    create(&db, "Info");
    let info = data(&db, &["info"]);
    assert_eq!(info["exists"], true);
    assert!(info["database_schema_version"].as_i64().unwrap() > 0);
    assert!(info["size_bytes"].as_u64().unwrap() > 0);
}

#[test]
fn mutations_cover_reference_settings_lifecycle_and_backups() {
    let dir = tempdir();
    let db = dir.path().join("mutations.db");
    let category = data(
        &db,
        &[
            "categories",
            "create",
            "--name",
            "Custom",
            "--color",
            "#123456",
            "--icon",
            "box",
        ],
    );
    let tag = data(
        &db,
        &["tags", "create", "--name", "Fixture", "--color", "#654321"],
    );
    let card = data(
        &db,
        &[
            "cards",
            "create",
            "--name",
            "Fixture",
            "--card-type",
            "debit",
            "--last-four",
            "1234",
            "--credit-limit",
            "100",
        ],
    );
    let item = create(&db, "Fixture");
    let id = item["id"].as_str().unwrap();
    let changed = data(
        &db,
        &[
            "subscriptions",
            "update",
            id,
            "--category-id",
            category["id"].as_str().unwrap(),
            "--card-id",
            card["id"].as_str().unwrap(),
            "--add-tag-id",
            tag["id"].as_str().unwrap(),
            "--pinned",
            "true",
            "--mark-reviewed",
        ],
    );
    assert_eq!(changed["is_pinned"], true);
    assert_eq!(changed["tags"].as_array().unwrap().len(), 1);
    assert!(!changed["last_reviewed_at"].is_null());
    let cleared = data(
        &db,
        &[
            "subscriptions",
            "update",
            id,
            "--clear",
            "category_id",
            "card_id",
            "--remove-tag-id",
            tag["id"].as_str().unwrap(),
            "--pinned",
            "false",
        ],
    );
    assert!(cleared["category_id"].is_null());
    assert!(cleared["card_id"].is_null());
    assert_eq!(cleared["tags"], json!([]));
    data(
        &db,
        &[
            "categories",
            "update",
            category["id"].as_str().unwrap(),
            "--icon",
            "briefcase",
        ],
    );
    data(
        &db,
        &[
            "tags",
            "update",
            tag["id"].as_str().unwrap(),
            "--color",
            "#112233",
        ],
    );
    let card = data(
        &db,
        &[
            "cards",
            "update",
            card["id"].as_str().unwrap(),
            "--clear",
            "last_four",
            "credit_limit",
        ],
    );
    assert!(card["last_four"].is_null());
    assert!(card["credit_limit"].is_null());
    data(
        &db,
        &[
            "settings",
            "update",
            "--monthly-budget",
            "100",
            "--theme",
            "dark",
            "--animation-speed",
            "fast",
            "--notification-days-before",
            "1",
            "3",
            "--notification-enabled",
            "false",
        ],
    );
    let settings = data(&db, &["settings", "update", "--clear", "monthly_budget"]);
    assert!(settings["monthly_budget"].is_null());
    assert_eq!(settings["notification_enabled"], false);
    let payment = data(
        &db,
        &[
            "payments",
            "create",
            "--subscription-id",
            id,
            "--amount",
            "5",
            "--status",
            "pending",
            "--due-date",
            "2026-09-01",
            "--notes",
            "Fixture",
        ],
    );
    let payment = data(
        &db,
        &[
            "payments",
            "update",
            payment["id"].as_str().unwrap(),
            "--clear",
            "notes",
            "--status",
            "paid",
        ],
    );
    assert!(payment["notes"].is_null());
    let backup = dir.path().join("backup.json");
    let export = data(&db, &["backup", "export", backup.to_str().unwrap()]);
    assert!(export["bytes"].as_u64().unwrap() > 0);
    let denied = run(
        &db,
        &[
            "--json",
            "backup",
            "import",
            backup.to_str().unwrap(),
            "--mode",
            "replace",
        ],
    );
    assert_eq!(denied.status.code(), Some(5));
    assert!(denied.stdout.is_empty());
    let preview = data(
        &db,
        &[
            "backup",
            "import",
            backup.to_str().unwrap(),
            "--mode",
            "replace",
            "--dry-run",
        ],
    );
    assert_eq!(preview["dry_run"], true);
    assert_eq!(
        data(
            &db,
            &[
                "backup",
                "import",
                backup.to_str().unwrap(),
                "--mode",
                "replace",
                "--yes"
            ]
        )["imported"],
        true
    );
}

fn project_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn markdown_table(rows: &[Vec<String>]) -> String {
    let widths: Vec<_> = (0..rows[0].len())
        .map(|column| {
            rows.iter()
                .map(|row| row[column].chars().count())
                .max()
                .unwrap()
                .max(3)
        })
        .collect();
    let mut result = String::new();
    for (index, row) in rows.iter().enumerate() {
        result.push('|');
        for (cell, width) in row.iter().zip(&widths) {
            result.push_str(&format!(" {cell:<width$} |"));
        }
        result.push('\n');
        if index == 0 {
            result.push('|');
            for width in &widths {
                result.push_str(&format!(" {} |", "-".repeat(*width)));
            }
            result.push('\n');
        }
    }
    result
}
fn generated_reference(schema: &Value) -> String {
    let mut result = format!("# Kessai CLI reference\n\nGenerated from `kessai-mcp schema --json`; do not edit by hand.\nBinary version: `{}`. Contract schema: `{}`.\nRegenerate: `UPDATE_SKILL_REFS=1 cargo test -p kessai-mcp --test cli_contract generated_cli_reference_matches_schema`.\n\nUse `kessai-mcp schema GROUP VERB` for full argument and output schemas.\nAll ids are opaque; amounts use decimal major units; dates are YYYY-MM-DD.\nGlobal options: `--db-path PATH`, `--json`, `--no-color`, `--version`, `--help`.\n\n",schema["cli_version"].as_str().unwrap(),schema["schema_version"].as_str().unwrap());
    let mut rows = vec![vec![
        "Command".into(),
        "Arguments and command options".into(),
        "Summary".into(),
    ]];
    for command in schema["commands"].as_array().unwrap() {
        let path = command["path"]
            .as_array()
            .unwrap()
            .iter()
            .map(|part| part.as_str().unwrap())
            .collect::<Vec<_>>()
            .join(" ");
        let mut args = Vec::new();
        for arg in command["positionals"].as_array().unwrap() {
            args.push(format!(
                "`{}{}`",
                arg["name"].as_str().unwrap().to_uppercase(),
                if arg["required"] == true { "*" } else { "" }
            ));
        }
        for arg in command["options"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|arg| arg["global"] != true)
        {
            args.push(format!(
                "`--{}{}`",
                arg["long"].as_str().unwrap(),
                if arg["required"] == true { "*" } else { "" }
            ));
        }
        rows.push(vec![
            format!("`{path}`"),
            args.join(" "),
            command["summary"].as_str().unwrap().replace('|', "\\|"),
        ]);
    }
    result.push_str(&markdown_table(&rows));
    result.push_str("\n`*` marks required inputs. Enum values, defaults, repeatability, and conflicts are in installed help/schema.\nLists return `items`, `total`, `next_cursor`, and warnings; follow the cursor until null.\nDeletes and destructive imports require preview, user approval, then `--yes`; there are no prompts.\nJSON successes are exact DTOs; failures leave stdout empty and emit ErrorBody on stderr.\n\n");
    let mut exits = vec![vec!["Exit".into(), "Code".into()]];
    for entry in schema["error_codes"].as_array().unwrap() {
        exits.push(vec![
            entry["exit"].to_string(),
            format!("`{}`", entry["code"].as_str().unwrap()),
        ]);
    }
    result.push_str(&markdown_table(&exits));
    result
}
#[test]
fn generated_cli_reference_matches_schema() {
    let dir = tempdir();
    let db = dir.path().join("unused.db");
    let schema = data(&db, &["schema"]);
    let expected = generated_reference(&schema);
    assert!(expected.lines().count() <= 120);
    let path = project_root().join("skills/kessai/references/cli.md");
    if std::env::var("UPDATE_SKILL_REFS").as_deref() == Ok("1") {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, &expected).unwrap();
    }
    let actual =
        std::fs::read_to_string(&path).expect("generate CLI reference with UPDATE_SKILL_REFS=1");
    assert_eq!(
        actual, expected,
        "CLI reference drift: run with UPDATE_SKILL_REFS=1"
    );
}

fn shell_words(line: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut word = String::new();
    let mut quote = None;
    let mut escaped = false;
    for ch in line.chars() {
        if escaped {
            word.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' && quote != Some('\'') {
            escaped = true;
            continue;
        }
        if let Some(active) = quote {
            if ch == active {
                quote = None;
            } else {
                word.push(ch);
            }
        } else if ch == '\'' || ch == '"' {
            quote = Some(ch);
        } else if ch.is_whitespace() {
            if !word.is_empty() {
                words.push(std::mem::take(&mut word));
            }
        } else {
            word.push(ch);
        }
    }
    assert!(
        quote.is_none() && !escaped,
        "unsupported incomplete shell example: {line}"
    );
    if !word.is_empty() {
        words.push(word);
    }
    words
}
#[test]
fn skill_fenced_cli_examples_execute_against_an_isolated_fixture() {
    for relative in ["skills/kessai/SKILL.md", "skills/kessai/references/cli.md"] {
        let path = project_root().join(relative);
        let source = match std::fs::read_to_string(&path) {
            Ok(value) => value,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => panic!("{error}"),
        };
        let dir = tempdir();
        let db = dir.path().join("examples.db");
        let backup = dir.path().join("backup.json");
        let item = create(&db, "Netflix");
        let id = item["id"].as_str().unwrap();
        let mut fenced = false;
        for (number, line) in source.lines().enumerate() {
            if line.starts_with("```") {
                fenced = !fenced;
                continue;
            }
            if !fenced || !line.starts_with("kessai-mcp") {
                continue;
            }
            let (line, expected) = match line.split_once("# exit: ") {
                Some((line, code)) => (line, code.trim().parse::<i32>().unwrap()),
                None => (line, 0),
            };
            let expanded = line
                .replace("<SUBSCRIPTION_ID>", id)
                .replace("<ID>", id)
                .replace("<BACKUP_PATH>", backup.to_str().unwrap());
            assert!(
                !expanded.contains('<'),
                "unresolved fixture placeholder: {expanded}"
            );
            let words = shell_words(&expanded);
            assert!(
                !words.iter().any(|word| word == "serve")
                    || words.iter().any(|word| word == "--help"),
                "server examples must not block"
            );
            let args = words.iter().skip(1).map(String::as_str).collect::<Vec<_>>();
            let output = run(&db, &args);
            assert_eq!(
                output.status.code(),
                Some(expected),
                "{relative}:{} {expanded}\n{}",
                number + 1,
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }
}
