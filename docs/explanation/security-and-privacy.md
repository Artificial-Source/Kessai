# Security and privacy

Kessai is privacy-oriented, but it is not network-free in every mode. The actual trust boundaries come from the code and config in `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs`, `crates/kessai-web/src/main.rs`, `crates/kessai-mcp/src/main.rs`, and the shared frontend utilities.

## What stays local by default

For normal desktop use, Kessai stores its primary data on-device:

- SQLite database in the app data directory
- saved logos in `logos/`
- desktop, web, and MCP logs in `logs/`
- some browser-side cache and log state in `localStorage`

There is no checked-in account, authentication, or cloud sync layer in the repository.

## Network touchpoints

| Surface or feature | Network use | Source |
| --- | --- | --- |
| Desktop updater | Fetches release metadata and assets from GitHub | `src-tauri/tauri.conf.json`, `src/stores/update-store.ts` |
| Logo fetch | Requests favicon-like images from Google | `src-tauri/src/lib.rs`, `crates/kessai-web/src/routes.rs` |
| Exchange rates | Requests rates from `https://api.frankfurter.app` | `src/lib/exchange-rates.ts` |
| Web mode | Opens an HTTP server on `0.0.0.0:<port>` | `crates/kessai-web/src/main.rs` |
| MCP server | Uses stdio, not HTTP, but can change the same local database | `crates/kessai-mcp/src/main.rs` |

So the strongest privacy posture is the installed desktop app with no updater, logo fetch, or exchange-rate use at that moment. Web mode and network-assisted features widen the boundary.

## Desktop-specific protections

### Content Security Policy

`src-tauri/tauri.conf.json` defines a CSP that keeps scripts self-hosted and restricts network connections to the GitHub hosts needed for updater traffic.

### Updater verification

The Tauri updater config includes a checked-in public key in `src-tauri/tauri.conf.json`, and the release workflow signs updater artifacts with `TAURI_SIGNING_PRIVATE_KEY`. The UI in `src/components/settings/update-settings.tsx` reflects that signed-update model.

### File validation

Desktop logo commands in `src-tauri/src/lib.rs` reject path traversal patterns and only allow safe `.webp` filenames.

## Data-integrity protections

| Area | Protection |
| --- | --- |
| Forms and frontend input | Zod-backed types in `src/types/*.ts` |
| Backup restore | Size limits in `src/lib/data-management.ts` and `crates/kessai-core/src/services/data_management.rs` |
| Import transactionality | Full restore runs inside one database transaction-like unit in the core service |
| Shared domain rules | Desktop, web, CLI, and MCP all reuse `KessaiCore` instead of duplicating business logic |

## Operational caveats

- `kessai-web` binds to `0.0.0.0`, so running it exposes the API on the chosen port to whatever can reach that machine unless your firewall blocks access.
- Browser-side `localStorage` entries such as `kessai-exchange-rates`, `kessai-logs`, and `kessai-sent-notifications` are convenience storage, not encrypted secret storage.
- Logs may include operational details such as paths, errors, and app state transitions.
- The desktop app is only as private as the local machine account and disk it runs on.

## Privacy reading by surface

| Surface | Main privacy question | Read next |
| --- | --- | --- |
| Desktop | Where is my data and when does it leave the machine? | [Filesystem](../reference/filesystem.md) |
| Web | What does the local server expose? | [Web API](../reference/web-api.md) |
| MCP/CLI | What can an automation client do? | [MCP and CLI](../reference/mcp-cli.md) |

## See also

- [Filesystem](../reference/filesystem.md)
- [Environment variables](../reference/environment-variables.md)
- [Architecture](./architecture.md)
