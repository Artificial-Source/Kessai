# Docs, Publish, and ASF Migration Execution

Date: 2026-02-14
Branch: `docs/publish-asf-readiness`

## Baseline Snapshot

- Product: Subby desktop app (Tauri 2 + React + TypeScript) with optional Discord bot package.
- Current app version across manifests: `0.1.0`.
- Release flow tooling: `release-it` + `scripts/sync-versions.js`.
- Database migrations are inline in `src-tauri/src/lib.rs` (`get_migrations()`), not in a `src-tauri/migrations/` folder.
- Active Zustand stores: `subscription`, `category`, `payment`, `settings`, `payment-card`, `ui`.
- Existing docs before reorg: `docs/README.md`, `docs/architecture.md`, `docs/backend-api.md`, `docs/troubleshooting.md`.

## Source of Truth Rules

- **Versioning:** `package.json` is the canonical source; `sync-versions.js` propagates to `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
- **Backend behavior/schema:** `src-tauri/src/lib.rs` and runtime DB schema are canonical.
- **Data export/import format:** `src/lib/data-management.ts` is canonical.
- **Commands:** `package.json` scripts are canonical.

## Scope Guardrails

- This execution pass prioritizes documentation architecture and correctness.
- No product behavior changes unless needed to keep documentation truthful.
- ASF org migration is planned and documented; namespace cutover updates will be performed in subsequent tasks.
