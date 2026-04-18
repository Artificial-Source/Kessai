# Architecture

Kessai is one product with three checked-in runtime surfaces built around the same domain core.

## The three entrypoints

| Surface | Entry point | What it owns |
| --- | --- | --- |
| Desktop | `src-tauri/src/main.rs` → `kessai_lib::run()` | Native app shell, tray, updater, notifications, filesystem integration |
| Web | `crates/kessai-web/src/main.rs` | Local Axum server, REST API, static SPA hosting |
| MCP/CLI | `crates/kessai-mcp/src/main.rs` | Terminal commands and stdio MCP server |

All three use `KessaiCore` from `crates/kessai-core`, which is where the SQLite access, migrations, and domain services live.

## Shared core, thin adapters

The workspace layout in `Cargo.toml` makes the architectural boundary explicit:

- `crates/kessai-core/` contains the models, migrations, and service layer.
- `src-tauri/` exposes that core through Tauri commands.
- `crates/kessai-web/` exposes it through Axum routes.
- `crates/kessai-mcp/` exposes it through Clap and RMCP.

This means the same subscription, payment, settings, analytics, tag, and backup logic is implemented once in the core, but each surface exposes a different slice of it:

- desktop and web expose the broadest product surface
- CLI exposes a smaller terminal-oriented command set
- MCP exposes a curated tool, resource, and prompt set rather than full adapter parity

## Frontend structure

The React frontend starts in `src/main.tsx` and renders `App` from `src/App.tsx`.

Inside `App`:

- `BrowserRouter` defines the route set: `/`, `/subscriptions`, `/calendar`, `/analytics`, `/settings`.
- `AppShell` in `src/components/layout/app-shell.tsx` mounts shared UI such as the sidebar, bottom tab bar, keyboard shortcuts, command palette, and notification scheduler.
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
- loads the Tauri updater plugin and exposes updater context to the frontend

### Web

`crates/kessai-web/src/main.rs`:

- resolves the database path from CLI/env/default data dir
- creates sibling `logs/` and `logos/` directories
- nests the REST API under `/api`
- serves the same frontend bundle from `dist/`

### MCP/CLI

`crates/kessai-mcp/src/main.rs`:

- resolves the database path the same way as the web server
- runs as a long-lived stdio MCP service by default
- switches to one-shot CLI mode when a subcommand is provided
- logs to stderr and to a file so stdout stays reserved for MCP transport

## Cross-cutting services

Some behavior spans multiple layers:

- Backups and restore use the shared data-management service, so desktop, web, CLI, and MCP all produce the same JSON shape.
- Price history auto-recording is currently implemented in the desktop and web
  update adapters (`src-tauri/src/lib.rs`, `crates/kessai-web/src/routes.rs`).
  MCP and CLI update flows call core update methods directly and do not use this
  adapter-level pre-step.
- Exchange-rate fetching lives in the shared frontend layer in `src/lib/exchange-rates.ts`.
- Update checks live in the frontend store `src/stores/update-store.ts`, but only the installed desktop app can complete the full Tauri updater flow.
- Renewal notifications are renderer-driven: `useNotificationScheduler()` runs in `AppShell`, checks hourly while the UI process is alive, uses Tauri notification APIs only when available, and deduplicates sends through `localStorage` rather than through a background OS daemon.

## See also

- [Concepts](./concepts.md)
- [Design decisions](./design-decisions.md)
- [Reference overview](../reference/overview.md)
