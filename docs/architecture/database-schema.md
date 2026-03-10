# Database Schema

Subby stores all app data in local SQLite.

## Tables

- `categories`: default and custom categories
- `subscriptions`: recurring subscriptions with billing details
- `payments`: payment history (paid/skipped entries)
- `settings`: singleton preferences row
- `payment_cards`: payment card metadata
- `price_history`: subscription price change history

## Migration Model

Migrations are defined inline in Rust (`crates/subby-core/src/migrations.rs`) using `MigrationKind::Up` entries.

Current migration sequence:

1. Initial schema (`categories`, `subscriptions`, `settings`)
2. Seed default categories and settings row
3. Add `payments`
4. Add notification fields to settings
5. Add `payment_cards` and `subscriptions.card_id`
6. Add `price_history`

## Notes

- There is no `src-tauri/migrations/` folder in this project.
- Run migration additions using the process in `docs/guides/adding-migrations.md`.
