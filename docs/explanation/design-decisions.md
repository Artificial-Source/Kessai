# Design decisions

This page explains the main design choices that show up repeatedly in the current repository structure.

## Local-first storage

The desktop app opens a SQLite database in the app data directory in `src-tauri/src/lib.rs`, and both `kessai-web` and `kessai-mcp` default to the same `com.asf.kessai/kessai.db` location in their `main.rs` files.

That choice gives Kessai these properties:

- no web-account system; desktop Private Web Access uses a local shared-secret gate rather than accounts
- plain local backups through JSON export/import
- shared access from desktop, web, CLI, and MCP as long as they point at the same database

## Shared core before surface-specific logic

The workspace puts most business logic in `crates/kessai-core` and then adapts it outward. That is visible in the way desktop commands, REST handlers, and CLI/MCP tools all call into `KessaiCore` services instead of reimplementing domain rules.

The practical result is one canonical implementation of:

- migrations
- CRUD behavior
- backup import/export
- lifecycle rules and transactional price-history capture
- core-computed calendar occurrences and atomic paid-schedule advancement

Spending totals use your share of billable charges in the display currency and disclose excluded currencies. The calendar instead displays full occurrence charges. This distinction keeps a household's budgeting share separate from the amount actually charged on a date.

## One frontend for desktop and web

Instead of keeping separate frontends, Kessai keeps one React app in `src/` and switches transport in `src/lib/api.ts`.

That design keeps action intent aligned because the same routes, components, stores,
and validation logic can run:

- inside Tauri with IPC, or
- in browser mode with REST.

Transport is adapter-specific:

- desktop uses invoke + command IDs,
- web uses REST routes and HTTP status/error semantics,
- MCP/CLI expose a differently shaped control surface (domain-complete CLI groups and MCP tools/resources/prompts) rather than the full desktop UI.

## JSON backup as a first-class boundary

The backup format is implemented in the shared core and exposed through all major surfaces. That makes the backup file more than a convenience export: it is the common interchange format for restore flows, CLI export/import, and MCP automation.

The versioned `BackupData` structure in `crates/kessai-core/src/models/stats.rs` shows that this boundary is meant to be durable.

Restore validates the full normalized snapshot before writing, and export fails closed on unreadable or invalid rows instead of producing an incomplete backup.

## Desktop-first native features, with browser fallback where practical

The repository clearly treats the desktop app as the fullest runtime:

- tray integration is registered in `src-tauri/src/lib.rs`
- notifications rely on Tauri plugins and `useNotificationScheduler()`
- update installation is handled through the Tauri updater plugin and `src/stores/update-store.ts`

Browser mode is still useful, but the code makes the distinction explicit with guards such as `WebBackendBanner`, `isTauri()` checks, and updater support states like `browser` and `development`.

Notification behavior follows the same rule: `useNotificationScheduler()` uses runtime detection for the desktop and runs only while the renderer is active, checking after startup and hourly. It catches up missed lead-time windows per renewal and deduplicates deliveries in `localStorage`, rather than relying on an OS background service.

Automatic price-history capture lives in the core subscription update transaction. Amount and currency changes either save together with their history or roll back together, regardless of which adapter made the request.

## A documented product and design system

[PRODUCT.md](../../PRODUCT.md) defines product scope, terminology, and host boundaries. [DESIGN.md](../../DESIGN.md) defines the shared tokens, typography, primitives, responsive behavior, and accessibility rules. UI changes should use those sources rather than establish a second visual convention; reduced motion honors either the OS preference or the app setting.

## GitHub Releases as the release channel

The updater endpoint in `src-tauri/tauri.conf.json`, the UI copy in `src/components/settings/update-settings.tsx`, `.release-it.json`, and `.github/workflows/release.yml` all line up around one distribution path:

1. tag a version from the repo
2. publish artifacts through GitHub Actions
3. let installed desktop apps check GitHub for `latest.json`

That keeps release automation in checked-in config instead of ad hoc manual steps.

## See also

- [Architecture](./architecture.md)
- [Security and privacy](./security-and-privacy.md)
- [Commands and scripts](../reference/commands-and-scripts.md)
