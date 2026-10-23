# Concepts

This page explains the main ideas Kessai uses in code and in the UI.

## A subscription is the primary record

The central domain object is the subscription defined in `crates/kessai-core/src/models/subscription.rs` and mirrored in `src/types/subscription.ts`.

A subscription carries more than a name and price:

- billing amount and currency
- billing cycle and optional billing day
- next payment date
- category and optional payment card
- lifecycle status and trial information
- shared-cost count
- pinned state, notes, and optional logo

Most screens derive from that record. Dashboard totals, calendar entries, notifications, and upcoming-payment lists all start from the current subscription set.

## Payments record outcomes, not plans

The `payments` table and `Payment` model represent actual recorded outcomes such as `paid` or `skipped`. Planned future renewals still come from the subscription's `next_payment_date` and billing fields.

That split is why Kessai can both:

- show future renewals on the calendar before they happen, and
- keep a historical ledger once you mark a payment paid or skipped.

The core calendar projects every occurrence of the billing cycle, not just one item per subscription per month: weekly renewals repeat weekly, quarterly/yearly renewals appear only in their recurrence months, and month-based cycles clamp to month end. `next_payment_date` is always the anchor occurrence even if an explicit billing day differs. Recorded outcomes stay visible after the subscription is cancelled, with their recorded amount.

Recording a paid outcome for the current due date advances `next_payment_date` by exactly one billing period in the same transaction. Replaying the outcome, recording a historical date, skipping, or manually editing a payment does not advance the schedule.

## `status` and `is_active` are separate concepts

Kessai currently uses both:

- `is_active`: a direct active/paused toggle used by commands like `toggle_subscription_active`
- `status`: a lifecycle enum with `trial`, `active`, `paused`, `pending_cancellation`, `grace_period`, and `cancelled`

The shared core also defines `SubscriptionStatus::is_billable()`, which treats `trial`, `active`, and `grace_period` as billable states for totals. That is why a subscription can be non-cancelled but still not count toward spending if its state is not billable.

Dashboard, Subscriptions, bento totals, and CLI/MCP statistics count only active, billable subscriptions and use your share (`amount / shared_count`) in the display currency. Other currencies are counted as excluded, not added together or converted. Dashboard upcoming-payment totals follow the same rule. Calendar totals answer a different question: the full amount charged on each date, using the recorded payment amount when present or the projected charge otherwise, again excluding other currencies. Calendar occurrences refetch after writes.

## Categories, tags, and cards solve different problems

These related features are intentionally separate:

- **Categories** group subscriptions into broad buckets such as streaming or software.
- **Tags** add flexible secondary labels through the `subscription_tags` join table.
- **Payment cards** track which card a subscription uses without changing its spending category.

You can think of categories as the main taxonomy, tags as lightweight overlays, and cards as payment metadata.

## Currency values are entered as-is

Each subscription stores a billing currency, and the app stores one default currency in `settings.currency` for totals, budgets, and new subscription defaults.

Kessai does not fetch exchange rates or convert mixed-currency subscriptions. Enter each charge in its own billing currency. Spending totals include only the selected display currency and state what they leave out, for example **Excludes 2 in EUR, JPY**. Amounts use each currency's minor units and configured locale through `Intl.NumberFormat`, not a fixed two-decimal format.

The backup/settings schema still accepts the legacy `display_exchange_rates` field for compatibility with older exports, but the frontend no longer exposes exchange-rate controls.

## Backups are full-state snapshots

The backup export is not just a subscription list. It includes:

- subscriptions
- categories
- payments
- payment cards
- price history
- tags and subscription-tag links
- settings

Backup format 1.2 adds `payment_cards` so subscription `card_id` references restore correctly. See [Backup format](../reference/backup-format.md) for supported versions and import behavior. That makes the backup file the main portability boundary between desktop, web, CLI, and MCP surfaces.

Restore normalizes supported legacy subscription forms and validates every record, field, and reference before opening the write transaction. A failed record rejects the entire restore. Export fails rather than silently omitting an unreadable row; ordinary list reads may skip such rows so the remaining data stays usable.

## Web mode and desktop mode share the same frontend

Kessai does not maintain separate desktop and web UIs. The frontend code in `src/` stays the same, and `src/lib/api.ts` switches the transport underneath it.

- Desktop mode sends commands over Tauri IPC.
- Web mode sends JSON over `/api/*`.

The different surfaces are therefore mostly integration boundaries, not separate products.

## MCP is an automation surface, not a second data model

The MCP server in `crates/kessai-mcp/src/mcp.rs` wraps the same core records the app already uses. Its tools, resources, and prompts are another way to operate on the same SQLite-backed data, not a parallel sync system.

## See also

- [Architecture](./architecture.md)
- [Backup format](../reference/backup-format.md)
- [Tutorial: First Run (Desktop)](../tutorials/first-run.md)
