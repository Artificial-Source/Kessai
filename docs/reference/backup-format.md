# Backup format

Kessai's full backup is produced and imported by the shared core data-management service. Desktop, web, CLI, and MCP adapters use that service.

Export reads every collection and the settings row through one connection in a single SQLite read transaction. Concurrent writes from other instances do not mix newer payments, links, or settings into an older subscription snapshot.

List, get, calendar, dashboard, and export share subscription decoding and normalization. Legacy `next_payment_date` and `trial_end_date` values containing a `T` timestamp use their valid date part, lowercase currency codes become uppercase, and sharing counts below 1 mean one person. A missing (`null`) due date remains valid. These read-time normalizations do not rewrite the database.

List, review lists, calendar, and dashboard skip truly unreadable persisted subscriptions (unparseable dates, unknown billing cycles/statuses, or nonnumeric, negative, or non-finite amounts), logging a warning with their identity. Single-record get returns decoded, normalized values without the amount/date gate so those fields can be inspected and repaired. Update validates the complete merged record: changing only a name cannot save an invalid amount or date. Repair the affected fields with `kessai-mcp subscriptions update <id> ...`, or preview unwanted-record deletion with `kessai-mcp subscriptions delete <id> --dry-run`, then use `--yes` only after approving its impact. Deletion does not require a readable subscription; invalid enum or SQL value types that prevent decoding can still be deleted.

Export never silently omits a subscription or its payments, price history, or tag links. It validates the same fields, references, timestamps, and collection limits as restore, so every successfully exported backup passes core backup validation. Unreadable or invalid subscription errors name the affected ID, name, and reason. This also rejects invalid currency shapes, billing days, colors, overlong names/notes, and malformed metadata timestamps that a list can still display. Repairing a corrupt amount or currency establishes the first valid price: the core appends price history only when the previous amount and currency were valid, rather than fabricating a historical value or writing an invalid history row.

Legacy contradictory lifecycle flags use one normalization rule on read, export, backup validation, and import: billable status plus `is_active: false` becomes `status: "paused"`; non-billable status plus `is_active: true` becomes inactive. Backup validation and import also apply the subscription date/currency/sharing-count normalizations above before field validation, for all supported schema versions (`1.0.0`, `1.1.0`, and `1.2.0`). `next_payment_date` and `trial_end_date` get timestamp-to-date normalization; other dates and timestamps must satisfy their field's validation rule. Import counts each changed subscription once and appends `Normalized N subscription record(s).` to `ImportResult.message` only when at least one record changed. Reads, validation, and export do not migrate or rewrite stored values, and validation does not mutate the supplied backup.

## Current version

The current exporter writes `version: "1.2.0"`. Version 1.2 adds `payment_cards`, fixing restoration of subscriptions that carry `card_id`.

```json
{
  "version": "1.2.0",
  "exportedAt": "2026-04-18T12:34:56Z",
  "subscriptions": [],
  "categories": [],
  "payments": [],
  "payment_cards": [],
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
    "reduce_motion": false,
    "enable_transitions": true,
    "enable_hover_effects": true,
    "animation_speed": "normal"
  }
}
```

An unset backup `settings.monthly_budget` is omitted by the exporter; import accepts either an omitted key or explicit `null` as no budget. This differs from live settings responses, which always include `monthly_budget: null` when unset. Full restore replaces the settings values even in merge mode: an omitted backup budget clears it, rather than preserving it as an omitted nullable patch would.

## Fields

| Field               | Notes                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `version`           | Backup schema version, not app version                                                       |
| `exportedAt`        | RFC 3339 export timestamp                                                                    |
| `subscriptions`     | Full subscription records, including lifecycle, review, pin, category, and card references   |
| `categories`        | Default and custom categories                                                                |
| `payments`          | Manual history and recorded outcomes                                                         |
| `payment_cards`     | Payment cards; defaults to an empty array when omitted, but 1.2 card references must resolve |
| `price_history`     | Amount/currency changes; optional in older backups                                           |
| `tags`              | Tags; optional in older backups                                                              |
| `subscription_tags` | Subscription/tag links; optional in older backups                                            |
| `settings`          | Singleton settings without its internal database ID                                          |

The importer explicitly supports versions `1.0.0`, `1.1.0`, and `1.2.0`; malformed, unsupported, and future versions are rejected. Versions 1.0/1.1 omitted cards, so only those supported legacy backups may have an unavailable subscription card reference normalized to `card_id: null`. In a 1.2 backup every referenced card must be present in that same backup.

Unknown top-level and record keys are ignored for additive compatibility. This does not permit a future format version: `1.3.0`, for example, is rejected. Optional card/history/tag/link collections default to empty when absent; subscriptions, categories, payments, and settings remain required.

## Validation and import

The core enforces collection-size limits:

| Collection             | Maximum |
| ---------------------- | ------: |
| subscriptions          |  10,000 |
| categories             |   1,000 |
| payment cards          |   1,000 |
| payments               | 100,000 |
| price history          |  50,000 |
| tags                   |   1,000 |
| subscription/tag links |  50,000 |

The core validates every backup before acquiring the import transaction: exact supported version, RFC 3339 `exportedAt`, nonempty and unique record IDs, duplicate tag-link pairs, all required references, and seeded default-category identities. Every adapter, including CLI/MCP, uses the same durable field checks:

- Names and category icons are nonempty and at most 100 characters; subscription/payment notes and cancellation reasons are at most 500 characters.
- Amounts, budgets, and card limits are finite and non-negative; zero is valid for a free subscription in create, update, and full-backup restore. Generic subscription CSV import uses the same non-negative rule. Bank-statement recurring-charge detection is different: it requires a nonzero charge and normalizes debit signs. Currency codes contain three uppercase ASCII letters; exchange rates are finite and strictly positive.
- Billing days are 1–31, sharing counts are at least 1, and colors use `#RRGGBB`. Optional card digits contain exactly four ASCII digits.
- Calendar dates are valid `YYYY-MM-DD` values. Payment `paid_at` is RFC 3339. Record metadata timestamps also accept the original SQLite `YYYY-MM-DD HH:MM:SS` form so existing backups remain importable.
- Contradictory subscription activity/status flags are normalized using the inactive-intent rule above rather than rejected.
- Settings use recognized theme/animation values, non-negative notification day offsets, and a valid `HH:MM` notification time.

Record errors identify the collection, zero-based index, and field (for example, `subscriptions[0].amount`; the singleton settings record uses `settings[0]`). Use CLI `kessai-mcp backup import FILE --dry-run` or MCP `backup_import` with `{"path":"FILE","dry_run":true}` for preflight. Both adapters read a file on the CLI/server machine rather than accepting inline backup JSON.

Dry-run paths accept the same legacy subscription forms as actual import; normalization is not a reason to reject an otherwise valid supported backup. Legacy `next_payment_date` and `trial_end_date` timestamps are truncated at `T` to their `YYYY-MM-DD` date in reads, export, and restore. Reads and export do not rewrite stored rows. Validation checks the backup itself, not every constraint against the target database: for example, a tag name collision can still cause the import transaction to fail. Such failures roll back the complete restore.

Import is transactional. It restores categories and cards before subscriptions, payments, price history, tags, links, and settings.

The backup format does not expose the internal payment-outcome marker. Restore retains duplicate legacy history rows, adopts one deterministic paid/skipped row per due occurrence when no existing marked outcome exists, and never treats pending-only rows as recorded outcomes. Restoring history does not advance subscription schedules.

A replace import clears links, tags, price history, payments, subscriptions, cards, and non-default categories in dependency-safe order. Default categories keep their seeded identities, but matching backup records restore their customized names, colors, and icons. Records with inconsistent default-category identities are rejected. CLI replace requires `--yes`; MCP replace requires `confirm: true`. Both support a no-write dry run.

Merge import uses true SQLite upserts keyed by record ID; it updates colliding rows without deleting their parent row, so target-only payment history, price history, and tag links survive. A merge that would overwrite colliding record IDs requires CLI `--yes` or MCP `confirm: true`. Agent-interface dry runs report merge/replace mode, incoming counts, collision counts by domain, and whether confirmation is required before execution.

Desktop `import_data` defaults to merge and is blocked while Private Web Access is starting, running, or stopping. The private-hosted web API also rejects `POST /api/import` with `409`; standalone and Tailscale-only standalone imports remain enabled. See [Desktop commands](./desktop-commands.md) and [Web API](./web-api.md).
