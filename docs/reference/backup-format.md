# Backup format

Kessai's full backup export is a versioned JSON document produced by the shared core service in `crates/kessai-core/src/services/data_management.rs`. The desktop IPC command, web API, CLI, and MCP tool all reuse that same export path.

## Current format version

The current exporter writes `version: "1.1.0"` in `crates/kessai-core/src/services/data_management.rs`.

## Top-level structure

```json
{
  "version": "1.1.0",
  "exportedAt": "2026-04-18T12:34:56Z",
  "subscriptions": [],
  "categories": [],
  "payments": [],
  "price_history": [],
  "tags": [],
  "subscription_tags": [],
  "settings": {
    "theme": "dark",
    "currency": "USD",
    "display_exchange_rates": {},
    "notification_enabled": true,
    "notification_days_before": [1, 3, 7],
    "notification_advance_days": 1,
    "notification_time": "09:00",
    "monthly_budget": null,
    "reduce_motion": false,
    "enable_transitions": true,
    "enable_hover_effects": true,
    "animation_speed": "normal"
  }
}
```

## Field notes

| Field | Source | Notes |
| --- | --- | --- |
| `version` | `crates/kessai-core/src/services/data_management.rs` | Backup format version, not the app version |
| `exportedAt` | `crates/kessai-core/src/models/stats.rs` | Serialized from Rust as camelCase via `#[serde(rename = "exportedAt")]` |
| `subscriptions` | `Subscription` records | Includes lifecycle fields such as `status`, `trial_end_date`, `shared_count`, `is_pinned`, and cancellation metadata |
| `categories` | `Category` records | Export contains default and custom categories |
| `payments` | `Payment` records | Full payment history |
| `price_history` | `PriceChange` records | Optional in older backups, present in current exports |
| `tags` | `Tag` records | Exported when tags exist |
| `subscription_tags` | mapping rows | Connects subscriptions to tags |
| `settings` | `BackupSettings` | Stores the singleton settings row without its internal `id` |

## Import behavior

The core import path in `crates/kessai-core/src/services/data_management.rs` validates and imports the backup inside one transaction-like unit.

### Validation limits

| Collection | Limit |
| --- | --- |
| `subscriptions` | `10,000` |
| `categories` | `1,000` |
| `payments` | `100,000` |
| `price_history` | `50,000` |
| `tags` | `1,000` |
| `subscription_tags` | `50,000` |

The frontend preflight validator in `src/lib/data-management.ts` checks the core top-level fields and the first three size limits before a UI-driven restore starts.

### `clear_existing` behavior

When import runs with `clear_existing: true`, the core service deletes, in order:

1. `subscription_tags`
2. `tags`
3. `price_history`
4. `payments`
5. `subscriptions`
6. non-default categories only

That means default seeded categories remain available. The imported backup may still include default categories in its JSON, but the import path only reinserts non-default categories.

### Settings behavior

- Backup settings do not carry the `settings.id` field.
- Import updates the existing singleton row with theme, currency, notification, budget, exchange-rate, and motion settings.
- Invalid or unknown theme strings fall back to `dark` during import.

## Related import paths

Kessai also has structured import flows in the frontend for CSV and external JSON formats, implemented in `src/lib/import-parsers.ts` and the settings import UI. Those are not the same thing as a full backup restore.

## See also

- [Tutorial: Payment Tracking and Backups](../tutorials/payment-tracking-and-backups.md)
- [Filesystem](./filesystem.md)
- [Concepts](../explanation/concepts.md)
