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

Most screens derive from that record. Dashboard totals, calendar entries, analytics, notifications, and upcoming-payment lists all start from the current subscription set.

## Payments record outcomes, not plans

The `payments` table and `Payment` model represent actual recorded outcomes such as `paid` or `skipped`. Planned future renewals still come from the subscription's `next_payment_date` and billing fields.

That split is why Kessai can both:

- show future renewals on the calendar before they happen, and
- keep a historical ledger once you mark a payment paid or skipped.

## `status` and `is_active` are separate concepts

Kessai currently uses both:

- `is_active`: a direct active/paused toggle used by commands like `toggle_subscription_active`
- `status`: a lifecycle enum with `trial`, `active`, `paused`, `pending_cancellation`, `grace_period`, and `cancelled`

The shared core also defines `SubscriptionStatus::is_billable()`, which treats `trial`, `active`, and `grace_period` as billable states for totals and analytics. That is why a subscription can be non-cancelled but still not count toward spending if its state is not billable.

## Categories, tags, and cards solve different problems

These related features are intentionally separate:

- **Categories** group subscriptions into broad buckets such as streaming or software.
- **Tags** add flexible secondary labels through the `subscription_tags` join table.
- **Payment cards** track which card a subscription uses without changing its spending category.

You can think of categories as the main taxonomy, tags as lightweight overlays, and cards as payment metadata.

## Display currency is not the same as stored currency

Each subscription stores its own billing currency, but the app also stores one display currency in `settings.currency`.

Conversion works in layers in `src/lib/exchange-rates.ts`:

1. manual overrides from `settings.display_exchange_rates`
2. cached or fetched rates from `https://api.frankfurter.app`
3. fallback behavior when no rate is available

That is why one database can hold mixed-currency subscriptions while the dashboard still renders one display total.

## Backups are full-state snapshots

The backup export is not just a subscription list. It includes:

- subscriptions
- categories
- payments
- price history
- tags and subscription-tag links
- settings

That makes the backup file the main portability boundary between desktop, web, CLI, and MCP surfaces.

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
