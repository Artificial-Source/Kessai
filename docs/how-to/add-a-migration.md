# How to add a migration

Use this for maintainers modifying database schema or seed data.
The source of truth is `crates/kessai-core/src/migrations.rs`.

## Current migration state

`kessai-core` owns schema evolution in `MIGRATIONS` and records applied entries in
`_kessai_migrations`.

- The current list has **18 migrations** (versions `1` to `18`).
- The most recent migration is `18: enforce_unique_category_names`; version `17` makes recorded payment outcomes idempotent.
- Initialization uses `BEGIN IMMEDIATE`: schema changes, repairs, and ledger entries commit together or roll back together.

## 1) Add a new migration entry

In `crates/kessai-core/src/migrations.rs`:

1. Append one `Migration` with the next integer version.
2. Use a clear `description` like `"add_xxx"`.
3. Put new column additions in `columns` as `(table, column, definition)` tuples, and other DDL/DML in `sql`.

Example shape:

```rust
Migration {
    version: 19,
    description: "add_example_feature",
    columns: &[("subscriptions", "example_flag", "INTEGER NOT NULL DEFAULT 0")],
    sql: "",
},
```

## 2) Keep compatibility checks current

`run_migrations` checks schema effects even when a version is already recorded:

- `columns` entries are added only when absent, allowing partially applied legacy schemas to be repaired.
- `should_skip_migration` must verify every table, index, trigger, and required original column for the migration. Existing tables missing original columns fail explicitly rather than risk a destructive rebuild.
- Recorded version `2` seed data is not replayed, so user changes to built-in categories survive.

For a new migration, extend its schema probes and make its SQL safe to apply when some of its effects already exist. `run_migrations` checks the resulting shape before writing the ledger entry; a probe that never recognizes success causes initialization to fail and roll back.

## 3) Update tests

Unit coverage in `crates/kessai-core/src/migrations.rs` includes fresh creation, idempotency, and adoption of legacy duplicate payment outcomes. The ledger-count assertion uses `MIGRATIONS.len()`, not a hard-coded count.

Integration coverage in `crates/kessai-core/tests/migration_contract.rs` checks the complete schema and all 18 versions, interrupted/recorded repairs, rollback, concurrent initialization, busy timeout, and preservation of user seed changes. Update those schema expectations and add the relevant repair/failure cases with a new migration.

## 4) Validate with repo quality gates

For a migration touch, run the following in addition to any surface-specific checks:

```bash
cargo test --locked -p kessai-core migration

pnpm check
```

Then verify the applied rows in a target DB:

```sql
SELECT version, description FROM _kessai_migrations ORDER BY version;
```

You should see a dense sequence up to your newest migration.

## 5) Runtime verification

Desktop and web startup paths call `run_migrations` automatically through shared
core initialization. Runtime checks should use an isolated database, never your everyday data:

```bash
mkdir -p /tmp/kessai-migration-check
KESSAI_DB_PATH=/tmp/kessai-migration-check/kessai.db cargo run -p kessai-web -- --port 3002
```

If startup fails after schema changes, check logs first and verify that all
`MIGRATIONS` SQL is valid for existing user data.
