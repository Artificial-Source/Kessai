# How to add a migration

Use this for maintainers modifying database schema or seed data.
The source of truth is `crates/kessai-core/src/migrations.rs`.

## Current migration state

`kessai-core` owns schema evolution in `MIGRATIONS` and records applied entries in
`_kessai_migrations`.

- The current list has **16 migrations** (versions `1` to `16`).
- The most recent migration is:

  - `16: add_display_exchange_rates_to_settings`

## 1) Add a new migration entry

In `crates/kessai-core/src/migrations.rs`:

1. Append one `Migration` with the next integer version.
2. Use a clear `description` like `"add_xxx"`.
3. Put the DDL/DML into `sql` as SQL text.

Example shape:

```rust
Migration {
    version: 17,
    description: "add_example_feature",
    sql: r#"
        ALTER TABLE subscriptions ADD COLUMN example_flag INTEGER NOT NULL DEFAULT 0;
    "#,
},
```

## 2) Keep compatibility checks current

`run_migrations` includes a legacy guard:

- `should_skip_migration` checks if migration effects already exist, so older
  `tauri-plugin-sql`-created databases can be marked as already applied.

If a new migration should be considered “already present” in old environments,
extend `should_skip_migration` with a concrete probe (`table_exists` or
`column_exists`).

If no probe is safe or available, leave it unhandled so migration runs normally.

## 3) Update tests

`crates/kessai-core/src/migrations.rs` has two migration tests:

- `test_migrations_run_on_fresh_db`
- `test_migrations_are_idempotent`

After adding a new migration, update the final expected count in
`test_migrations_are_idempotent` (currently asserted to `16`).

## 4) Validate with repo quality gates

For a migration touch, run the following in addition to any surface-specific checks:

```bash
cargo test -p kessai-core test_migrations_run_on_fresh_db test_migrations_are_idempotent

pnpm check
```

Then verify the applied rows in a target DB:

```sql
SELECT version, description FROM _kessai_migrations ORDER BY version;
```

You should see a dense sequence up to your newest migration.

## 5) Runtime verification

Desktop and web startup paths call `run_migrations` automatically through shared
core initialization, so you can also validate by starting the intended surface:

- `pnpm tauri dev` (desktop)
- `cargo run -p kessai-web -- --port 3000` (web server)

If startup fails after schema changes, check logs first and verify that all
`MIGRATIONS` SQL is valid for existing user data.
