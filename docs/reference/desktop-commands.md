# Desktop commands

The desktop app registers its Tauri IPC commands in `src-tauri/src/lib.rs`. The React app usually reaches them through `src/lib/api.ts`, but this page lists the actual backend command surface.

## How to read this page

- Commands here are **desktop-only** unless a matching web route exists in [Web API](./web-api.md).
- Most data payloads reuse the shared Rust models in `kessai_core::models` and the mirrored frontend types in `src/types/*.ts`.
- `update_tray_badge` and `get_updater_context` are specifically desktop-native helpers and do not have web equivalents.

## Logo commands

| Command | Purpose | Key inputs | Notes |
| --- | --- | --- | --- |
| `save_logo` | Save a logo picked from a local file path | `source_path`, `subscription_id` | Resizes to `256x256` and stores as `.webp` |
| `get_logo_base64` | Read a stored logo as a data URL | `filename` | Returns `data:image/webp;base64,...` |
| `delete_logo` | Remove a stored logo file | `filename` | Ignores missing files |
| `fetch_logo` | Fetch a favicon-like logo over HTTP | `name`, optional `domain` | Tries `name.com`, `name.io`, and `name.app` when no domain is passed |

The desktop logo helpers validate filenames in `src-tauri/src/lib.rs`: only `.webp` names made of alphanumerics, `-`, `_`, and `.` are accepted, and traversal patterns are rejected.

## Subscription commands

| Command | Purpose | Key inputs | Notes |
| --- | --- | --- | --- |
| `list_subscriptions` | Return all subscriptions | none | Base read command for dashboard, subscriptions, calendar, and analytics |
| `get_subscription` | Return one subscription | `id` | Lookup by subscription ID |
| `create_subscription` | Create a subscription | `data: NewSubscription` | Shared DTO includes lifecycle, tags-by-reference, and billing fields |
| `update_subscription` | Update a subscription | `id`, `data: UpdateSubscription` | Automatically records price history when the amount changes |
| `delete_subscription` | Delete a subscription | `id` | Removes the record from the DB |
| `toggle_subscription_active` | Pause or resume a subscription | `id` | Works with the legacy `is_active` boolean |
| `toggle_subscription_pinned` | Pin or unpin a subscription | `id` | Controls display priority |
| `transition_subscription_status` | Move a subscription to a lifecycle state | `id`, `status` | Accepts `trial`, `active`, `paused`, `pending_cancellation`, `grace_period`, `cancelled` |
| `cancel_subscription` | Cancel with an optional reason | `id`, optional `reason` | Stores cancellation metadata |
| `mark_subscription_reviewed` | Mark review nudges as handled | `id` | Updates `last_reviewed_at` |
| `list_subscriptions_needing_review` | Return subscriptions that should be reviewed | `days` | Uses a day threshold in the core service |
| `get_expiring_trials` | Return trials ending soon | optional `days` | Defaults to `7` days |

## Category, tag, and card commands

### Categories

| Command | Purpose |
| --- | --- |
| `list_categories` | Return default and custom categories |
| `create_category` | Create a custom category |
| `update_category` | Update a category by ID |
| `delete_category` | Delete a category by ID |

### Tags

| Command | Purpose |
| --- | --- |
| `list_tags` | Return all tags |
| `create_tag` | Create a tag |
| `update_tag` | Update a tag |
| `delete_tag` | Delete a tag |
| `add_subscription_tag` | Attach a tag to a subscription |
| `remove_subscription_tag` | Remove a tag from a subscription |
| `list_subscription_tags` | Return tags for one subscription |
| `list_subscription_tags_batch` | Return tag links for many subscriptions |

### Payment cards

| Command | Purpose |
| --- | --- |
| `list_payment_cards` | Return stored payment cards |
| `create_payment_card` | Create a payment card |
| `update_payment_card` | Update a payment card |
| `delete_payment_card` | Delete a payment card |

## Payment and price-history commands

| Command | Purpose | Key inputs | Notes |
| --- | --- | --- | --- |
| `list_payments` | Return all payments | none | Raw payment history |
| `list_payments_by_month` | Return payments for one month | `year`, `month` | Returns payment rows only |
| `list_payments_with_details` | Return payments plus subscription/category detail | `year`, `month` | Used by the calendar day panel |
| `create_payment` | Create a payment record | `data: NewPayment` | Direct insert path |
| `update_payment` | Update a payment record | `id`, `data: UpdatePayment` | Edit path |
| `delete_payment` | Delete a payment record | `id` | Hard delete |
| `mark_payment_paid` | Record a paid renewal | `subscription_id`, `due_date`, `amount` | Convenience command used by calendar and tutorials |
| `skip_payment` | Record a skipped renewal | `subscription_id`, `due_date`, `amount` | Stores a skipped payment record |
| `is_payment_recorded` | Check whether a due date already has a payment outcome | `subscription_id`, `due_date` | Returns a boolean |
| `list_price_history` | Return price changes for one subscription | `subscription_id` | Historical price tracking |
| `get_recent_price_changes` | Return recent price changes | optional `days` | Defaults to `90` days |
| `list_latest_price_history` | Return the latest price change for many subscriptions | `subscription_ids` | Batch helper for list and dashboard views |

## Analytics, settings, and data-management commands

| Command | Purpose | Key inputs | Notes |
| --- | --- | --- | --- |
| `get_monthly_spending` | Return monthly spending series | optional `months` | Defaults to `12` |
| `get_year_summary` | Return a year summary | `year` | Analytics detail view |
| `get_spending_velocity` | Return velocity metrics | none | Used by analytics cards |
| `get_category_spending` | Return category breakdown | optional `months` | Defaults to `6` |
| `get_settings` | Return the singleton settings row | none | Includes theme, currency, notifications, motion, and budget |
| `update_settings` | Update the singleton settings row | `data: UpdateSettings` | Partial update DTO |
| `export_data` | Export a backup JSON structure | none | Returns `BackupData` from the core service |
| `import_data` | Import a backup JSON structure | `data: BackupData`, optional `clear_existing` | Runs through the transactional core import path |

## Desktop-native system helpers

| Command | Purpose | Notes |
| --- | --- | --- |
| `update_tray_badge` | Rebuild the tray label and tooltip based on upcoming payments | Used from `src/hooks/use-tray-badge.ts` |
| `get_updater_context` | Return executable path and bundle type | Used by `src/stores/update-store.ts` to handle Linux updater edge cases |

## See also

- [Web API](./web-api.md)
- [MCP and CLI](./mcp-cli.md)
- [Backup format](./backup-format.md)
