# How to test Kessai

Use this page to run quality checks before pushing changes or cutting a release.

## Run the core frontend quality gate

```bash
pnpm check
```

`pnpm check` runs:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm format:check`

## Run frontend tests

Single run:

```bash
pnpm test:run
```

Watch mode:

```bash
pnpm test
```

Coverage:

```bash
pnpm test:coverage
```

## Run Rust tests

```bash
cargo test --locked --workspace
```

## Run E2E tests

Install Chromium once (Linux may need administrator access for browser system libraries):

```bash
pnpm exec playwright install --with-deps chromium
```

```bash
pnpm test:e2e
```

The full suite starts Vite and an isolated `kessai-web` backend. It never reuses an already-running app server or the normal app database. Desktop-oriented specs mock Tauri IPC and fail if an invoked command has no explicit handler. The `real-web` project exercises the REST backend; its journeys run one at a time because restoring a backup replaces that backend's data. Mocked journeys remain fully parallel.

To avoid ports already in use, set both ports explicitly:

```bash
KESSAI_DEV_PORT=1438 KESSAI_API_PORT=3106 pnpm test:e2e
```

`KESSAI_DEV_PORT` sets Vite's port and Playwright's frontend URL; `KESSAI_API_PORT` sets the test backend port and Vite's `/api` proxy target. The full suite defaults to frontend port `1420` and API port `3000`. These are tooling settings, not standalone `kessai-web` port overrides; the backend CLI uses `--port`.

Set `CI=true` to match CI's `forbidOnly`, two retries, and one worker. Both Playwright configurations test whether `CI` is nonempty, so `CI=false` still enables CI behavior; unset it (or use `CI= pnpm test:e2e` in a POSIX shell) for local behavior.

Without a nonempty `CI`, retries are disabled. The suite covers keyboard-only navigation, a 390×844 mobile journey, and accessibility on every route (including not-found). If `@axe-core/playwright` is already installed it scans routes; otherwise accessibility smoke checks heading counts, accessible control/dialog names, and descriptions for invalid fields without installing anything.

## Run the CI-style web smoke test locally

Install the browser once if needed:

```bash
pnpm exec playwright install --with-deps chromium
```

Then run both dedicated real-web smoke specs:

```bash
pnpm test:e2e:web-smoke
```

What this does:

- builds the frontend bundle
- starts `kessai-web` on `KESSAI_API_PORT` (default `3001`)
- uses an isolated temporary SQLite database instead of your default app database
- runs `e2e/web-smoke.spec.ts` and `e2e/web-mutations.spec.ts` through `playwright.web-smoke.config.ts`
- checks logo persistence, subscription create/edit/payment/skip/cancel/delete, nullable budget clearing, and full-backup refresh of categories, tags, cards, settings, and subscriptions

For example, with a dedicated smoke port and CI behavior:

```bash
KESSAI_API_PORT=3107 CI=true pnpm test:e2e:web-smoke
```

This suite serves the built frontend directly from the Rust server, so it does not start Vite or use `KESSAI_DEV_PORT`. It always uses one worker, with two retries only when `CI` is nonempty, and never reuses an existing server.

If you only want to boot the smoke server without Playwright, run:

```bash
pnpm serve:smoke
```

For the full suite's interactive troubleshooting UI:

```bash
pnpm test:e2e:ui
```

## Recommended pre-push sequence

```bash
pnpm check
pnpm test:run
cargo test --locked --workspace
```

## See also

- [How to run locally](./run-locally.md)
- [How to build and release](./build-and-release.md)
- [How to troubleshoot](./troubleshoot.md)
