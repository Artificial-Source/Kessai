# Architecture

Kessai is one product with three checked-in runtime surfaces built around the same domain core.

## The three entrypoints

| Surface | Entry point                                   | What it owns                                                                                  |
| ------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Desktop | `src-tauri/src/main.rs` → `kessai_lib::run()` | Native app shell, tray, updater, notifications, filesystem integration                        |
| Web     | `crates/kessai-web/src/main.rs`               | Local Axum server, REST API, static SPA hosting                                               |
| MCP/CLI | `crates/kessai-mcp/src/main.rs`               | Full terminal CLI, explicit stdio `serve`, optional loopback Streamable HTTP MCP, and `setup` |

All three use `KessaiCore` from `crates/kessai-core`, which is where the SQLite access, migrations, and domain services live. CLI and MCP go through the shared application adapter in `crates/kessai-mcp/src/app.rs` so they stay first-class peers of each other over that core.

## Shared core, thin adapters

The workspace layout in `Cargo.toml` makes the architectural boundary explicit:

- `crates/kessai-core/` contains the models, migrations, and service layer.
- `src-tauri/` exposes that core through Tauri commands.
- `crates/kessai-web/` exposes it through Axum routes.
- `crates/kessai-mcp/` exposes it through Clap (CLI) and RMCP (explicit stdio `serve` or optional loopback Streamable HTTP).

This means the same subscription, payment, settings, analytics, tag, card, price-history, and backup logic is implemented once in the core. Desktop and web expose the broadest product UI; CLI and MCP are equal first-class adapters over the deep `Application` module in `app.rs`, which owns the shared DTOs, validation, pagination, and confirmation policy. MCP additionally publishes bounded resources and a data-free review prompt. All tools are listed; read-only mode filters and rejects non-read-only tools.

## Frontend structure

The React frontend starts in `src/main.tsx` and renders `App` from `src/App.tsx`.

Inside `App`:

- `BrowserRouter` defines `/`, `/subscriptions`, `/calendar`, `/settings`, and a not-found fallback.
- `AppShell` in `src/components/layout/app-shell.tsx` mounts shared UI such as the sidebar, phone tab bar, keyboard shortcuts, command palette, global subscription dialog, and notification scheduler.
- Route-level pages load lazily from `src/pages/`.

State is split into focused Zustand stores under `src/stores/`, while validation lives in `src/types/*.ts` with Zod-backed shapes.

## One UI, two transports

The same frontend bundle runs in both desktop and web mode.

`src/lib/api.ts` is the key adapter:

- In the desktop app, it detects Tauri and calls backend commands with `invoke(...)`.
- In browser mode, it maps those same logical commands onto `/api/*` routes.

That transport switch is why most UI code stays shared across desktop and web even
though one path uses IPC and the other uses HTTP.
The adapter layer does impose payload and response differences (`invoke` calls vs
REST JSON status codes and routing shapes), so full request/response parity is not
guaranteed.

## Storage and background behavior

### Desktop

`src-tauri/src/lib.rs` owns the desktop-only runtime pieces:

- opens `<app_data_dir>/kessai.db`
- creates `logos/` and `logs/`
- registers the tray menu and a five-minute refresh loop
- hides the window to tray on close unless the app is quitting
- starts the main window invisible and shows it for normal launches; exact `--hidden` (login autostart) stays tray-only
- loads the Tauri updater and opt-in OS-login autostart plugins and exposes updater context to the frontend
- owns the optional Private Web Access manager: it reads the machine-local `private-web-access.json`, auto-starts an enabled configuration, and starts the shared Axum SPA/API on `127.0.0.1` only
- keeps that server alive when a window closes to the tray, and gracefully stops it before a true app quit
- resolves the bundled `dist/` resource for the hosted SPA; debug builds can fall back to a locally built `dist/`

The manager shares the desktop core and logo storage with the normal app. It has desktop IPC status/apply controls only; it does not expose REST lifecycle controls, configure Tailscale, or implement a web account/login. Private-hosted request policy is applied by `kessai-web` before the SPA or API route runs. Full backup restore/import is blocked while Private Web Access is starting, running, or stopping; export remains available.

### Web

`crates/kessai-web/src/main.rs`:

- resolves the database path from CLI/env/default data dir
- creates sibling `logs/` and `logos/` directories
- nests the REST API under `/api`
- serves the same frontend bundle from `dist/`
- binds to `127.0.0.1` by default; non-loopback standalone requests accept only the bound IP literal or explicit `--allowed-host` / `KESSAI_WEB_ALLOWED_HOSTS` entries, with a startup warning when none are configured

The web runtime has three `ServerMode` values in `crates/kessai-web/src/lib.rs`:

| Mode              | How it starts                      | Authorization                                                                                        | Import                             |
| ----------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `Standalone`      | Default `kessai-web`               | Unauthenticated local server                                                                         | Enabled                            |
| `PrivateHosted`   | Desktop Private Web Access manager | Tailscale Serve identity **plus** an access-key-bootstrapped, per-server session cookie              | Blocked while the server is active |
| `TailscaleHosted` | `kessai-web --tailscale-only`      | Tailscale Serve identity only; optional trusted-proxy exception for non-loopback container listeners | Enabled                            |

Authenticated `GET /api/access/status` returns a server-generated context after policy validation (`server_mode`, `connection`, optional `tailscale_login`). Browser Settings renders that context so users can see whether the request is local or through Tailscale. Details: [How Tailscale identity reaches Kessai](./security-and-privacy.md#how-tailscale-identity-reaches-kessai) and [Web API access context](../reference/web-api.md#access-context).

### MCP/CLI

`crates/kessai-mcp/src/main.rs`:

- resolves the database path the same way as the web server
- starts a long-lived stdio MCP service only with explicit `serve`; a bare invocation prints help and exits 2
- runs one-shot domain CLI commands, with JSON DTOs matching MCP structured content
- offers `setup` to print or merge standard `.mcp.json` with absolute binary and DB paths
- offers optional `serve --http` for token-protected loopback Streamable HTTP at `/mcp` (local agent clients only; not Private Web Access), with `--read-only` available on both transports
- logs to stderr and to a file so stdout stays reserved for MCP transport

## Cross-cutting services

Some behavior spans multiple layers:

- Backups and restore use the shared data-management service, so desktop, web, CLI, and MCP all produce the same JSON shape.
- Subscription amount or currency changes record price history in the shared core, in the same transaction as the subscription update. Desktop, web, CLI, and MCP use that operation.
- Calendar occurrences come from the core `CalendarService`, exposed through `list_calendar_payments` and `GET /api/payments/calendar/{year}/{month}`. It combines recurring projections with recorded outcomes; the frontend refetches watched months after writes.
- A paid outcome for the current due date advances the schedule in the same core transaction. Replays, historical outcomes, skips, and manual payment edits do not advance it.
- Update checks live in the frontend store `src/stores/update-store.ts`, but only the installed desktop app can complete the full Tauri updater flow.
- Renewal notifications are renderer-driven: `useNotificationScheduler()` runs in `AppShell`, checks hourly while the UI process is alive, uses Tauri notification APIs only when available, and deduplicates sends through `localStorage` rather than through a background OS daemon.

## See also

- [Concepts](./concepts.md)
- [Design decisions](./design-decisions.md)
- [Security and privacy](./security-and-privacy.md)
- [Reference overview](../reference/overview.md)
