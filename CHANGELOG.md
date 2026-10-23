# Changelog

All notable changes to Kessai will be documented in this file.

## [1.0.0](https://github.com/Artificial-Source/Kessai/releases/tag/v1.0.0) (2026-10-23)

First stable release and the first entry of this changelog; earlier 0.x releases are not tracked here. The notes below describe what changed for people upgrading from a 0.6.x install. Every surface (desktop, local web server, CLI/MCP) now shares one set of rules in `kessai-core`, the interface was rebuilt on a documented design system, and the release pipeline publishes only a fully verified artifact set.

### ⚠ Breaking changes

- **Standalone web server on a non-loopback host** (`--host 0.0.0.0`, Docker, LAN): requests are rejected unless the browser's `Host` is the bound IP literal or a value passed with `--allowed-host` / `KESSAI_WEB_ALLOWED_HOSTS`. Loopback use (`localhost`, `127.0.0.1`, `[::1]`, the Vite dev proxy) keeps working. The server logs a warning at startup when no allowed host is configured.
- **HTTP status codes**: validation errors return `400` and conflicts (duplicate names, default-category deletes) `409` instead of `500`/`400`; missing records stay `404`. The `{ "error": "…" }` envelope is unchanged.
- **Restore validates every record** (amounts, dates, currency codes, billing days, colors, lengths, references) before touching the database; a backup that fails validation is rejected whole, with the record and field named. Legacy forms from 0.x backups (timestamp dates, lowercase currencies, `shared_count` 0, contradictory `status`/`is_active`) are normalized, not rejected.
- **Export fails closed**: if a stored row is unreadable it names the row and how to repair it instead of silently omitting it.
- **Desktop filesystem capabilities** are reduced to `fs:allow-write-text-file` (paths scoped by the save dialog) and `dialog:default`; `fs:default`, `fs:allow-app-read/write(-recursive)`, `dialog:allow-open`, `opener:default` and `core:tray:default` are dropped, so the renderer can no longer read or write the app data directory.

### Features

- **Calendar is computed by the core**: `GET /api/payments/calendar/{year}/{month}` and the `list_calendar_payments` desktop command return projected occurrences (weekly every week, quarterly/yearly only in their months, month-end clamping, `next_payment_date` always the first occurrence) plus every recorded payment, including for cancelled subscriptions and with the recorded amount.
- **Paying advances the schedule atomically**: a paid or skipped outcome recorded for the current due date moves `next_payment_date` forward in the same transaction, stepping over dates that already carry a recorded outcome; failed outcomes, historical dates, payments recorded ahead of time and manual payment edits never advance it. Rows that 0.6.2 left stuck on an already-paid date advance on the next "Mark paid".
- **Consistent totals everywhere**: dashboard, subscriptions header, bento and CLI `analytics dashboard` / MCP `analytics_dashboard` all use your share (`amount / shared_count`) of billable subscriptions in the display currency and say what they exclude ("Excludes 2 in EUR, JPY"); the calendar shows the amount charged on each date (recorded or projected) in the display currency with the same exclusion note. Amounts render with each currency's minor units (¥3,200, 1.234,56 €).
- **Design system** (`DESIGN.md`, `PRODUCT.md`): tokens with full light-theme coverage, 11px label floor, visible focus rings, 44px touch targets, shared `Card`/`EmptyState`/`Badge`/`Field` primitives, one color swatch picker, honest loading/empty/error states on every screen.
- **Subscriptions**: responsive rows (stacked on phones, table on desktop) with a visible actions menu, phone Filters dialog, first-run and no-results states, cancelled section that honors filters and offers Reactivate, bento tiles sized by your share.
- **Subscription editor**: Billing / Organize / Appearance sections, sticky footer, field errors wired to inputs with first-invalid focus, named colors with a "Current color" swatch, trials require an end date, amounts of 0 ("Free") allowed, tag sync can be retried without creating a duplicate.
- **Calendar**: contrast-safe cells (names on desktop, logos on tablet, dots on phones), labelled month-over-month comparison, day panel as a dialog on small screens, "Marked 3 of 4 payments as paid" style toasts, skeleton/error/empty states.
- **Settings**: frequency-ordered sections with sticky in-page navigation and deep links (`/settings#data`), inline field errors, built-in categories marked as such, updater collapsed in web mode, OS `prefers-reduced-motion` honored alongside the app setting.
- **Imports**: one RFC 4180 CSV tokenizer (quoted newlines, CRLF, BOM), explicit amount/date format detection with override (`9,99`, `1.234,56`, `1,234.56`, DMY/MDY), per-row outcomes with retry of failed rows only, 10 MiB / 25 MiB pre-read caps, Zod-validated Kessai/Wallos JSON.
- **Shell**: window controls only in the desktop app, docked safe-area-aware phone tab bar, not-found page, complete shortcuts dialog, grouped command palette that finds subscriptions from any route, global subscription dialog (`N`, palette, calendar Edit work everywhere), focus returns to the opener when dialogs close.
- **Reminders now run on the desktop** (runtime detection accepts `__TAURI_INTERNALS__`, which Tauri 2 always injects, instead of requiring `window.__TAURI__`); missed reminders are consolidated into one notification.
- **Private Web Access** sessions use a per-server random token; the access key is never stored in a cookie.

**CLI/MCP agent interface redesigned:** one shared application contract now supplies typed DTOs, cursor pagination, actionable errors, and file-based backups. MCP tools publish schemas and honest annotations with enforced read-only mode. CLI fields use named flags; `schema` discovers the installed contract, while `info` inspects an existing database read-only, never creating, migrating, or writing. The compact skill and generated references teach the same grammar. rmcp remains 1.8. Cancellation is local-only; deletes and destructive imports retain preview/approval/confirmation.

These are breaking adapter changes; update callers rather than relying on aliases:

| Old tools / commands                                                                                                              | New tools / commands                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `query_subscriptions`; flat `list`                                                                                                | `subscriptions_list`; `subscriptions list` with filters and cursor pagination                                                             |
| `get_subscription`, `add_subscription`, `update_subscription`, `remove_subscription`; flat `add`, `update`, `remove`              | `subscriptions_get/create/update/delete`; `subscriptions get/create/update/delete`                                                        |
| Positional `subscriptions create NAME AMOUNT CYCLE --next-date DATE`                                                              | `subscriptions create --name NAME --amount AMOUNT --billing-cycle CYCLE --next-payment-date DATE`                                         |
| `subscription_action`, `toggle_subscription`; `toggle`, `toggle-active`, `toggle-pinned`, `set-status`, `cancel`, `mark-reviewed` | `subscriptions_update`; `subscriptions update ID --status STATUS`, `--pinned BOOL`, `--mark-reviewed`, and other desired-state fields     |
| `subscriptions_needing_review`, `expiring_trials`, `get_upcoming_payments`; `needs-review`, `expiring-trials`, `upcoming`         | `subscriptions_list` filters `review_overdue_days`, `trial_ending_within_days`, `upcoming_days`; corresponding hyphenated CLI flags       |
| `query_payments`; `payments get/details/check-recorded`                                                                           | `payments_list`; `payments list` filters. Upcoming occurrences: `calendar_month` / `calendar month YYYY-MM`                               |
| `manage_payment`, `mark_payment_paid`, `skip_payment`; flat `pay` / `skip` and positional `payments record`                       | `payments_record/create/update`; `payments record ID --status paid\|skipped` (date/amount optional), named flags for direct create/update |
| `query_categories`, `manage_category`, `add_category`, `delete_category`; flat `add-category`                                     | `categories_list/create/update/delete`; `categories list/create/update/delete`                                                            |
| `query_tags`, `manage_tag`, `delete_tag`; `tags get/attach/detach/for-subscription/links`                                         | `tags_list/create/update/delete`; subscription `tag_ids`, `add_tag_ids` / `remove_tag_ids`, CLI `--add-tag-id` / `--remove-tag-id`        |
| `query_cards`, `manage_card`, `delete_card`; `cards get`                                                                          | `cards_list/create/update/delete`; `cards list/create/update/delete`, select one from list results                                        |
| `get_settings`, `update_settings`                                                                                                 | `settings_get/update`; `settings get/update`                                                                                              |
| `analytics(view=...)`, `get_spending_by_category`; `stats`, `analytics monthly/velocity/categories`                               | `analytics_dashboard/spending/year`; `analytics dashboard/spending/year`                                                                  |
| `price_history(view=...)`; `price-history subscription/recent/latest`                                                             | `price_history_list`; `price-history list` with filters                                                                                   |
| `export_data`, `validate_backup`, `import_data`; flat `export/import`, `backup validate`, `--output`, `--clear`                   | `backup_export/import` take file paths; `backup export PATH`, `backup import PATH --mode merge\|replace --dry-run`                        |
| `clear_notes`, `clear_monthly_budget`, CLI field-specific clear flags                                                             | Typed `clear_fields` arrays; repeatable CLI `--clear FIELD` with snake_case names                                                         |
| Bare binary starts MCP; `serve-http`; expanded/hidden-alias discovery flags/environment                                           | Bare binary prints help (exit 2); explicit `serve` or `serve --http`; one tool list, restricted by `--read-only`                          |
| Success transport wrapper; raw config even with JSON mode                                                                         | Direct DTO in CLI stdout / MCP structured content; `setup --json` returns `{path,written,backup_path,config}`                             |
| Data-dumping prompts and unbounded/duplicate resources                                                                            | One data-free `subscription_review` prompt; bounded JSON resources and calendar template                                                  |

### Bug fixes

- Price history is written in the same transaction as the subscription update on every surface (previously best-effort and duplicated per adapter).
- JSON `null` clears `monthly_budget`, card `last_four`/`credit_limit` and payment `notes`; a missing key leaves them unchanged. `monthly_budget` is always serialized (as `null` when unset).
- Migrations run under `BEGIN IMMEDIATE`; schema and ledger commit together and partially applied legacy schemas are repaired.
- Category and card deletes clear references and delete atomically; pin toggles are transactional across processes.
- Export reads every collection in one snapshot; the subscription list never loses newer changes when an older request fails (per-entity reconciliation, request generations, queued settings patches).
- Corrupt stored rows no longer break the list, calendar or dashboard; they are skipped on reads, named by export (which fails closed), and can be repaired or deleted.
- Month navigation never shows another month's data or a loaded-but-empty month during a write.
- Desktop: tray rebuilds run on the main thread (previously a reference-count race that could abort or corrupt memory); startup failures show a native error dialog instead of panicking; database, image and file work runs off the UI thread.
- Web: `/api/import` accepts backups up to 25 MiB; logos are written atomically; Windows reserved basenames are rejected; the favicon client allows at most three HTTPS redirects.
- Phone layouts no longer overflow horizontally; the dashboard shows an error state instead of zeros when the API is down; settings never loop fetching categories after a failure.

### Build, release and dependencies

- Release workflow builds every platform into a draft, verifies the complete inventory, checksums, updater manifest and signatures, then publishes once; manual dispatch requires an existing tag; actions pinned to commit SHAs; `cargo build --locked`.
- CI runs on pull requests and `release/**` with `cargo fmt`, `clippy -D warnings`, `cargo audit`, the real-web smoke suite and the installer tests.
- `install.sh` fails on HTTP errors, verifies SHA-256 sidecars and the AppImage header, and replaces the binary atomically.
- Dependencies refreshed: Tauri 2.12, rmcp 1.8, rustls/quinn/quick-xml/webpki updates; `cargo audit` is clean with documented, dated exceptions in `.cargo/audit.toml`; `recharts` removed.
- Playwright runs the web backend on an isolated temporary database (it previously used the real one).

### Documentation

- `SECURITY.md` support matrix and per-surface authentication; `docs/explanation/security-and-privacy.md` reconciled with the code; reference pages for the backup format, desktop commands, web API and CLI/MCP updated for the new behavior.
