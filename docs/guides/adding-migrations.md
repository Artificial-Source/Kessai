# Adding Migrations

Migrations are defined inline in `src-tauri/src/lib.rs`.

## Process

1. Add a new `Migration` entry at the end of `get_migrations()`.
2. Keep migration SQL idempotent and forward-only.
3. Prefer additive changes for compatibility with existing user databases.

## Validation

1. Start app on a fresh DB and verify schema creation.
2. Start app on an existing DB and verify upgrade path.
3. Run app smoke checks and tests:

```bash
pnpm check
pnpm test:run
pnpm tauri dev
```

## Rollback Guidance

- Do not rely on destructive rollback in production user environments.
- If a migration is incorrect, ship a follow-up migration that repairs state.
