# Filesystem

This page describes where Kessai stores data and support files for each surface. The authoritative path logic lives in `src-tauri/src/lib.rs`, `crates/kessai-web/src/main.rs`, `crates/kessai-mcp/src/main.rs`, and the checked-in installer scripts.

## Desktop app storage

The desktop app uses Tauri's app data directory via `app_handle.path().app_data_dir()` in `src-tauri/src/lib.rs`.

### Typical root paths

| Platform | Root directory |
| --- | --- |
| Linux | `~/.local/share/com.asf.kessai/` |
| macOS | `~/Library/Application Support/com.asf.kessai/` |
| Windows | `%APPDATA%/com.asf.kessai/` |

### Files and subdirectories under the desktop root

| Path | Purpose |
| --- | --- |
| `kessai.db` | Main SQLite database |
| `logos/` | Saved and fetched subscription logos as `.webp` files |
| `logs/` | Daily-rolled desktop logs written by tracing |

## Web server storage

`crates/kessai-web/src/main.rs` resolves its database path like this:

1. `--db-path` or `KESSAI_DB_PATH` if provided.
2. `dirs::data_dir()/com.asf.kessai/kessai.db`.
3. `./kessai.db` if no platform data directory is available.

Once the database path is resolved, the web server creates sibling directories next to it:

| Path relative to the resolved DB | Purpose |
| --- | --- |
| `logs/` | Daily-rolled `kessai-web.log` files |
| `logos/` | REST-served logo files |

## MCP and CLI storage

`crates/kessai-mcp/src/main.rs` uses the same database resolution order as `kessai-web`:

1. `--db-path` or `KESSAI_DB_PATH`.
2. `dirs::data_dir()/com.asf.kessai/kessai.db`.
3. `./kessai.db` as a fallback.

In server mode it also creates:

| Path relative to the resolved DB | Purpose |
| --- | --- |
| `logs/` | Daily-rolled `kessai-mcp.log` files |

The MCP binary does not create a logo directory because it does not expose logo storage helpers.

## Browser-side persisted storage

The shared frontend also keeps a few non-database values in browser storage when it runs in a browser or web harness.

| Key | Source file | Purpose |
| --- | --- | --- |
| `kessai-exchange-rates` | `src/lib/exchange-rates.ts` | Cached exchange-rate responses |
| `kessai-logs` | `src/lib/logger.ts` | Persisted warn/error frontend logs |
| `kessai-sent-notifications` | `src/hooks/use-notification-scheduler.ts` | Deduplication record for desktop renewal notifications |

That notification key is not an OS scheduler. It is part of an in-app polling model: the reminder hook runs while the frontend is active, checks hourly, and uses `localStorage` to avoid duplicate sends.

## Local installer paths

`install.sh`, `uninstall.sh`, and `scripts/kessai` assume a Linux local install layout under `$HOME`.

| Path | Purpose |
| --- | --- |
| `~/.local/bin/kessai` | Unified launcher |
| `~/.local/bin/kessai-desktop` | Desktop binary |
| `~/.local/bin/kessai-mcp` | CLI + MCP binary |
| `~/.local/bin/kessai-web` | Web server binary |
| `~/.local/share/applications/kessai.desktop` | Desktop launcher entry |
| `~/.local/share/icons/hicolor/128x128/apps/kessai.png` | Installed app icon |

## See also

- [Environment variables](./environment-variables.md)
- [Backup format](./backup-format.md)
- [Security and privacy](../explanation/security-and-privacy.md)
