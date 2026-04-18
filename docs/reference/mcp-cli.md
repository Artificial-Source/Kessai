# MCP and CLI

Kessai ships a separate Rust binary, `kessai-mcp`, defined in `crates/kessai-mcp/Cargo.toml`. Its runtime entrypoint is `crates/kessai-mcp/src/main.rs`, its Clap CLI lives in `crates/kessai-mcp/src/cli.rs`, and its MCP server lives in `crates/kessai-mcp/src/mcp.rs`.

## Modes

| Mode | How it starts | What it does |
| --- | --- | --- |
| MCP server | `kessai-mcp` or `kessai-mcp serve` | Starts a stdio MCP server |
| CLI | `kessai-mcp <subcommand>` | Runs a one-shot terminal command |
| Unified wrapper | `kessai ...` through `scripts/kessai` | Delegates to `kessai-desktop`, `kessai-web`, or `kessai-mcp` |

## Global options

| Option | Source | Purpose |
| --- | --- | --- |
| `--db-path <path>` | `crates/kessai-mcp/src/main.rs` | Override the SQLite database path |
| `KESSAI_DB_PATH` | `crates/kessai-mcp/src/main.rs` | Environment-variable form of `--db-path` |

Without an override, the binary resolves the database to `dirs::data_dir()/com.asf.kessai/kessai.db` and falls back to `./kessai.db` only if no platform data directory is available.

## CLI subcommands

| Subcommand | Key inputs | Purpose |
| --- | --- | --- |
| `serve` | none | Explicit MCP server mode |
| `list` | none | List all subscriptions |
| `add` | `name amount cycle next_date` plus optional `--currency`, `--category`, `--color`, `--notes` | Create a subscription |
| `update` | `id` plus optional `--name`, `--amount`, `--cycle`, `--next-date`, `--currency`, `--category`, `--color`, `--notes` | Update a subscription |
| `remove` | `id` | Delete a subscription |
| `toggle` | `id` | Toggle active/paused |
| `pay` | `sub_id due_date amount` | Record a payment as paid |
| `skip` | `sub_id due_date amount` | Record a skipped payment |
| `categories` | none | List categories |
| `add-category` | `name color icon` | Create a category |
| `upcoming` | optional `--days` | Show upcoming payments, default `7` |
| `stats` | none | Show dashboard-style stats in the terminal |
| `export` | optional `--output <file>` | Export backup JSON to stdout or a file |
| `import` | `file` and optional `--clear` | Import backup JSON |

## MCP server capabilities

The server advertises protocol version `2024-11-05` in `crates/kessai-mcp/src/mcp.rs` and enables tools, resources, and prompts.

### Tools

| Tool | Purpose |
| --- | --- |
| `add_subscription` | Create a subscription |
| `update_subscription` | Update a subscription |
| `remove_subscription` | Delete a subscription |
| `toggle_subscription` | Pause or resume a subscription |
| `mark_payment_paid` | Record a payment as paid |
| `skip_payment` | Record a skipped payment |
| `add_category` | Create a category |
| `get_upcoming_payments` | List upcoming payments |
| `get_spending_by_category` | Return category spending breakdown |
| `export_data` | Export all data as backup JSON |
| `import_data` | Import data from a backup JSON string |

### Resources

| Resource URI | Purpose |
| --- | --- |
| `kessai://subscriptions` | All subscriptions |
| `kessai://categories` | All categories |
| `kessai://settings` | Current settings |
| `kessai://cards` | Payment cards |
| `kessai://stats/dashboard` | Dashboard summary |

### Resource templates

| Template | Purpose |
| --- | --- |
| `kessai://subscriptions/{id}` | Read one subscription |
| `kessai://payments/{year}/{month}` | Read payments with details for a month |

### Prompts

| Prompt | Purpose |
| --- | --- |
| `subscription_summary` | Summarize subscriptions and spending |
| `spending_analysis` | Analyze category spending patterns |
| `upcoming_payments` | Summarize the next 30 days of payments |

## Logging behavior

In server mode, `kessai-mcp` writes protocol output to stdout and sends tracing logs to stderr and to daily log files under `logs/` next to the resolved database path. That separation is deliberate in `crates/kessai-mcp/src/main.rs` so logging does not corrupt the MCP transport.

## See also

- [How to use the Kessai MCP server](../how-to/use-mcp-server.md)
- [Commands and scripts](./commands-and-scripts.md)
- [Filesystem](./filesystem.md)
