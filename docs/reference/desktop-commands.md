# Desktop commands

The desktop app registers its Tauri IPC commands in `src-tauri/src/lib.rs`. The React app usually reaches them through `src/lib/api.ts`, but this page lists the actual backend command surface.

## How to read this page

- Commands here are **desktop-only** unless a matching web route exists in [Web API](./web-api.md).
- Most data payloads reuse the shared Rust models in `kessai_core::models` and the mirrored frontend types in `src/types/*.ts`. Tables use Rust argument names; top-level JavaScript invocation keys use camelCase (for example, `subscriptionId`), while fields inside a `data` DTO remain snake_case.
- `update_tray_badge`, `get_updater_context`, and the two Private Web Access lifecycle/status commands are desktop-native helpers without web equivalents. The frontend's `get_access_status` describes an HTTP request's access context; it is not a registered desktop IPC command.
- Data, image, and filesystem commands run their synchronous work on Tauri's blocking worker pool; favicon HTTP requests are asynchronous. Command names and JavaScript argument casing are unchanged.
- Core failures remain string rejections and preserve the core error's typed message (for example, `Validation error: ...` or `Not found: ...`).

## Logo commands

| Command           | Purpose                                   | Key inputs                       | Notes                                                                       |
| ----------------- | ----------------------------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| `save_logo`       | Save a logo picked from a local file path | `source_path`, `subscription_id` | Thumbnails within `256x256`, preserving aspect ratio, and stores as `.webp` |
| `get_logo_base64` | Read a stored logo as a data URL          | `filename`                       | Returns `data:image/webp;base64,...`; reads are capped at 8 MiB             |
| `delete_logo`     | Remove a stored logo file                 | `filename`                       | Ignores missing files                                                       |
| `fetch_logo`      | Fetch a favicon-like logo over HTTP       | `name`, optional `domain`        | Tries `name.com`, `name.io`, and `name.app` when no domain is passed        |

Desktop and web commands share `kessai_web::logo::LogoStore`: only non-hidden `.webp` names made of alphanumerics, `-`, `_`, and `.` are accepted; traversal patterns and Windows reserved device basenames are rejected. Source images are capped at 5 MiB and 4096 pixels per dimension. Writes use a temporary file and atomic replacement so failed encoding/writes leave the previous logo intact. Favicon requests use a five-second timeout and at most three HTTPS redirects. See [Web API logo details](./web-api.md#price-history-importexport-and-logo-routes).

The desktop resolves the logo directory once during main-thread setup and shares it as `LogosDir` state. All four logo commands use that path instead of cloning or dropping an `AppHandle` on worker threads.

## Subscription commands

| Command                             | Purpose                                      | Key inputs                       | Notes                                                                                    |
| ----------------------------------- | -------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `list_subscriptions`                | Return readable subscriptions                | none                             | Normalizes legacy values and skips unreadable rows                                       |
| `get_subscription`                  | Return one subscription                      | `id`                             | Bypasses the list's amount/date gate when the row can be decoded                         |
| `create_subscription`               | Create a subscription                        | `data: NewSubscription`          | Includes lifecycle, billing, category/card references; attach tags separately            |
| `update_subscription`               | Update a subscription                        | `id`, `data: UpdateSubscription` | Atomically records amount/currency changes when the previous price is valid              |
| `delete_subscription`               | Delete a subscription                        | `id`                             | Deletes by ID without decoding an unreadable row                                         |
| `toggle_subscription_active`        | Pause or resume a subscription               | `id`                             | Billable states become paused; otherwise resumes active or an unexpired paused trial     |
| `toggle_subscription_pinned`        | Pin or unpin a subscription                  | `id`                             | Controls display priority                                                                |
| `transition_subscription_status`    | Move a subscription to a lifecycle state     | `id`, `status`                   | Accepts `trial`, `active`, `paused`, `pending_cancellation`, `grace_period`, `cancelled` |
| `cancel_subscription`               | Cancel with an optional reason               | `id`, optional `reason`          | Stores cancellation metadata                                                             |
| `mark_subscription_reviewed`        | Mark review nudges as handled                | `id`                             | Updates `last_reviewed_at`                                                               |
| `list_subscriptions_needing_review` | Return subscriptions that should be reviewed | `days`                           | Uses a day threshold in the core service                                                 |
| `get_expiring_trials`               | Return trials ending soon                    | optional `days`                  | Defaults to `7` days                                                                     |

Shared reads normalize timestamp due dates, lowercase subscription currencies, sharing counts below 1, and contradictory activity/status flags without rewriting storage. Lists skip corrupt amount/date values and rows that cannot be decoded. Single-record get can expose decodable invalid fields for repair, but an invalid stored enum or incompatible SQL type can still fail decoding. Update validates the complete merged subscription, so a name-only change cannot save an invalid amount/date. See [Backup format](./backup-format.md) for normalization and repair details.

Nullable updates distinguish an omitted field (unchanged), a value (set), and explicit JSON `null` (clear). In particular, `update_settings` can clear `monthly_budget`, `update_payment_card` can clear `last_four`/`credit_limit`, and `update_payment` can clear `notes`. `UpdateSubscription` uses the same rule for its nullable fields; [Nullable patches](./web-api.md#nullable-patches) lists them. Settings responses always include `monthly_budget`, using `null` when unset.

Setting or clearing `next_payment_date` clears `billing_day` unless the same update explicitly includes `billing_day`. Send both when intentionally retaining a different billing day.

## Category, tag, and card commands

### Categories

| Command           | Purpose                              |
| ----------------- | ------------------------------------ |
| `list_categories` | Return default and custom categories |
| `create_category` | Create a custom category             |
| `update_category` | Update a category by ID              |
| `delete_category` | Delete a category by ID              |

### Tags

| Command                        | Purpose                                 |
| ------------------------------ | --------------------------------------- |
| `list_tags`                    | Return all tags                         |
| `create_tag`                   | Create a tag                            |
| `update_tag`                   | Update a tag                            |
| `delete_tag`                   | Delete a tag                            |
| `add_subscription_tag`         | Attach a tag to a subscription          |
| `remove_subscription_tag`      | Remove a tag from a subscription        |
| `list_subscription_tags`       | Return tags for one subscription        |
| `list_subscription_tags_batch` | Return tag links for many subscriptions |

### Payment cards

| Command               | Purpose                     |
| --------------------- | --------------------------- |
| `list_payment_cards`  | Return stored payment cards |
| `create_payment_card` | Create a payment card       |
| `update_payment_card` | Update a payment card       |
| `delete_payment_card` | Delete a payment card       |

## Payment and price-history commands

| Command                      | Purpose                                                      | Key inputs                              | Notes                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_payments`              | Return all payments                                          | none                                    | Raw payment history                                                                                                                          |
| `list_payments_by_month`     | Return payments for one month                                | `year`, `month`                         | Returns payment rows only                                                                                                                    |
| `list_payments_with_details` | Return payments plus subscription/category detail            | `year`, `month`                         | Recorded payment rows with display metadata                                                                                                  |
| `list_calendar_payments`     | Return canonical scheduled occurrences and recorded payments | `year`, `month`                         | Returns `CalendarOccurrence[]`; accepts years `1900–9998` and months `1–12`; includes recorded payments for inactive/cancelled subscriptions |
| `create_payment`             | Create a payment record                                      | `data: NewPayment`                      | Direct insert path                                                                                                                           |
| `update_payment`             | Update a payment record                                      | `id`, `data: UpdatePayment`             | Edit path                                                                                                                                    |
| `delete_payment`             | Delete a payment record                                      | `id`                                    | Hard delete                                                                                                                                  |
| `mark_payment_paid`          | Record a paid renewal                                        | `subscription_id`, `due_date`, `amount` | Atomically advances the current due date past paid/skipped occurrences; exact replays repair a still-current legacy anchor                   |
| `skip_payment`               | Record a skipped renewal                                     | `subscription_id`, `due_date`, `amount` | Same atomic schedule advancement as `mark_payment_paid`                                                                                      |
| `is_payment_recorded`        | Check whether a due date already has a payment outcome       | `subscription_id`, `due_date`           | Pending-only rows return `false`                                                                                                             |
| `list_price_history`         | Return price changes for one subscription                    | `subscription_id`                       | Historical price tracking                                                                                                                    |
| `get_recent_price_changes`   | Return recent price changes                                  | optional `days`                         | Defaults to `90` days                                                                                                                        |
| `list_latest_price_history`  | Return the latest price change for many subscriptions        | `subscription_ids`                      | Batch helper for list and dashboard views                                                                                                    |

`list_calendar_payments` projects only active, billable subscriptions with a due date: weekly every seven days, monthly/custom every month, quarterly every three months, and yearly every twelve months. Month-based dates clamp to month end. Period zero is exactly the stored `next_payment_date`; `billing_day` affects other periods, including projections before or after the anchor. Each result has subscription display fields, `projected_amount` (the current full price), and `payment` (`null` or the full recorded payment). A recorded payment's amount/status is authoritative; all statuses and duplicate historical rows remain visible. Unreadable subscriptions and their occurrences are skipped. See [Calendar occurrences](./web-api.md#calendar-occurrences) for the full field list.

A paid or skipped outcome at the current due date advances the schedule atomically, skipping dates already settled by paid or skipped outcomes, up to 120 billing periods. Exceeding that bound fails explicitly and rolls back the complete operation. Exact paid/skip retries return the existing payment and can repair a legacy schedule still anchored on that outcome; after advancement the old date no longer matches and cannot advance again. A different amount or conflicting outcome rejects with a core conflict. Historical/non-current due dates, failed outcomes, direct payment creation, and manual payment edits do not advance the schedule. Month-based advancement retains the original recurrence day through intermediate settled dates and atomically persists it in `billing_day` when the final date is clamped.

## Reporting, settings, and data-management commands

| Command                 | Purpose                           | Key inputs                                    | Notes                                                                                                                                   |
| ----------------------- | --------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `get_monthly_spending`  | Return monthly spending series    | optional `months`                             | Defaults to `12`                                                                                                                        |
| `get_year_summary`      | Return a year summary             | `year`                                        | Reporting data                                                                                                                          |
| `get_spending_velocity` | Return velocity metrics           | none                                          | Reporting data                                                                                                                          |
| `get_category_spending` | Return category breakdown         | optional `months`                             | Defaults to `6`                                                                                                                         |
| `get_settings`          | Return the singleton settings row | none                                          | Includes theme, currency, notifications, motion, and budget                                                                             |
| `update_settings`       | Update the singleton settings row | `data: UpdateSettings`                        | Partial update DTO                                                                                                                      |
| `export_data`           | Export a backup JSON structure    | none                                          | Returns `BackupData` from the core service                                                                                              |
| `import_data`           | Import a backup JSON structure    | `data: BackupData`, optional `clear_existing` | Transactional core restore; holds the Private Web Access operation gate for the entire blocking restore, even if the caller disconnects |

The four reporting commands above aggregate recorded `paid` ledger amounts by due date, without user-share division, display-currency filtering, or `excluded_currencies`. They are not the subscription-based dashboard totals. UI totals use the user's share of active, billable subscriptions in the display currency and disclose excluded currencies; CLI `analytics dashboard` and MCP `analytics_dashboard` return the exclusions explicitly. There is no registered desktop dashboard-summary command.

`export_data` reads a single snapshot and rejects unreadable or invalid backup records instead of dropping them. `import_data` defaults to merge (`clear_existing: false`); `true` replaces existing data. Both restore modes normalize supported legacy subscription forms and validate the whole backup before the write transaction, then restore atomically. Desktop import is blocked while Private Web Access is starting, running, or stopping, and has no CLI/MCP-style confirmation or dry-run argument. See [Backup format](./backup-format.md).

### Renderer capabilities

The renderer's only filesystem-plugin grant is `fs:allow-write-text-file`, with no preconfigured path scope. Backup export uses `dialog:allow-save` (included in `dialog:default`); the native save dialog adds only the selected file to the runtime filesystem scope before `writeTextFile` writes it. These identifiers and the selected-file scope behavior are provided by `tauri-plugin-fs` 2.7.1 and `tauri-plugin-dialog` 2.8.3.

There are no `fs:allow-app-*` grants or `fs:default`: the latter also grants recursive application-directory reads and directory creation. Direct renderer calls such as `readTextFile` and `readFile` are therefore not authorized, including for `kessai.db` and `private-web-access.json`. Backend commands still access their required files; this restriction applies to the filesystem plugin, not the application IPC commands.

The complete renderer permission list is:

```text
core:default
notification:default
notification:allow-is-permission-granted
notification:allow-request-permission
notification:allow-notify
fs:allow-write-text-file
dialog:default
process:default
updater:default
autostart:allow-enable
autostart:allow-disable
autostart:allow-is-enabled
core:window:allow-show
core:window:allow-hide
core:window:allow-close
core:window:allow-minimize
core:window:allow-toggle-maximize
core:window:allow-start-dragging
core:window:allow-set-focus
core:window:allow-unminimize
```

There is no renderer `core:tray:default` or `opener:default` grant: Rust owns the tray, and the frontend has no external-link opener (About displays application metadata). `dialog:default` already includes opening the native file chooser for custom logos, so a separate `dialog:allow-open` grant is unnecessary.

The exact permission array is covered by `src/components/__tests__/desktop-capabilities.test.ts`. Run the regression from the repository root:

```sh
pnpm test:run src/components/__tests__/desktop-capabilities.test.ts
```

Regression smoke (use an isolated desktop profile, never the real database):

1. In **Settings → Data & Backup**, export a backup and choose a temporary JSON file in the native save dialog. Confirm that the file exists and contains a valid backup.
2. In the desktop webview's developer console, import the filesystem plugin from the dev server's module URL and call `readTextFile` with the isolated profile's `kessai.db` path. Expect a `fs.read_text_file not allowed` rejection, not file contents or a text-decoding error.
3. Call `writeTextFile` with a different temporary path that was not selected in a dialog. Expect a `forbidden path` rejection and confirm no file is created.

## Private Web Access commands

| Command                         | Purpose                                                      | Key inputs        | Notes                                                               |
| ------------------------------- | ------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------- |
| `get_private_web_access_status` | Read desktop Private Web Access configuration/runtime status | none              | Returns `PrivateWebAccessStatus`                                    |
| `apply_private_web_access`      | Enable/disable Private Web Access or change its port         | `enabled`, `port` | Port must be `1024–65535`; returns status after applying the change |

Both return camelCase fields: `state` (`stopped`, `starting`, `running`, `stopping`, `error`), `enabled`, `port`, and `serveCommand`; optional `error` is omitted when absent, and `accessKey` is included only while enabled. Unlike the secret-free HTTP access context, this desktop status can contain the bootstrap access key. Disabling and re-enabling rotates that key; each new server instance also gets a fresh, unpersisted session token for browser cookies. The server binds to `127.0.0.1`; there is no REST endpoint for starting/stopping it. See [Private-hosted mode](./web-api.md#private-hosted-mode).

## Desktop-native system helpers

| Command               | Purpose                                                       | Notes                                                                   |
| --------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `update_tray_badge`   | Rebuild the tray label and tooltip based on upcoming payments | Used from `src/hooks/use-tray-badge.ts`                                 |
| `get_updater_context` | Return executable path and bundle type                        | Used by `src/stores/update-store.ts` to handle Linux updater edge cases |

Startup storage, database, tray, or builder failures are logged and displayed in a native error dialog with the app-data location; dismissal exits with a nonzero status. Invalid logging filters fall back to a default. Periodic tray refresh failures are warned once per failure type rather than silently replacing a failed database read with a zero count.

## See also

- [Web API](./web-api.md)
- [MCP and CLI](./mcp-cli.md)
- [Backup format](./backup-format.md)
