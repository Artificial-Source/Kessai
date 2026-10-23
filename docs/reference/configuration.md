# Configuration

This page covers the checked-in configuration files that define Kessai's runtime behavior, build pipeline, quality gates, and release automation.

## Application and workspace configuration

| File                           | What it controls                        | Highlights                                                                                                |
| ------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Cargo.toml`                   | Workspace membership                    | Declares `kessai-core`, `kessai-mcp`, `kessai-web`, and `src-tauri`                                       |
| `src-tauri/Cargo.toml`         | Desktop Rust crate                      | Tauri plugins, updater support, native dependencies, desktop crate metadata                               |
| `src-tauri/tauri.conf.json`    | Desktop app metadata and runtime config | Product name, identifier, build hooks, window sizing, CSP, bundle assets, updater endpoint and public key |
| `crates/kessai-web/Cargo.toml` | Web server binary                       | Axum, Clap, tower-http, tracing, and shared core dependency                                               |
| `crates/kessai-mcp/Cargo.toml` | Full CLI + MCP binary                   | Clap, RMCP (stdio + Streamable HTTP server), tracing, terminal formatting, and shared core dependency     |

### `src-tauri/tauri.conf.json`

The desktop config is the main source for native runtime behavior:

- `build.beforeDevCommand` is `pnpm dev`; `build.beforeBuildCommand` is `pnpm build && pnpm verify:web-resource`.
- `bundle.resources` maps `../dist/` to `dist/`, so the installed app contains the SPA used by Private Web Access.
- `verify:web-resource` requires `dist/index.html` and that exact resource mapping before an installer build continues.
- The desktop window starts at `1200x800` with `900x600` minimums and `visible: false` so setup can show it for normal launches or keep a `--hidden` login launch in the tray.
- The CSP allowlist explicitly includes the GitHub hosts used by the updater.
- The updater plugin is configured with a checked-in public key and the GitHub `latest.json` endpoint.

### Machine-local Private Web Access config

The desktop data directory's `private-web-access.json` contains `enabled`, `port`, and `access_key`. Kessai generates the high-entropy key, writes the file atomically, and keeps group/other permission bits clear on Unix. Existing files without `access_key` are migrated before an enabled server is considered successfully started.

The key persists across app restarts and port changes. It rotates only when persisted access changes from disabled to enabled. The key bootstraps a host-only, HttpOnly browser cookie containing a random token generated for each server instance, never the persistent key. Restarting the server invalidates sessions even when the key is unchanged. The key is exposed only in desktop Settings while access is enabled and is never added to the Tailscale command or process arguments.

## User preferences and input behavior

Settings sections have stable deep links such as `/settings#data`; **Budget** is separate from **Appearance**. Desktop-only server, autostart, and updater controls are grouped under their host-specific sections.

- **Currency and totals:** `settings.currency` selects the display currency, budget currency, and default for new subscriptions. Dashboard, Subscriptions, bento totals, and CLI/MCP statistics use your share (`amount / shared_count`) of active, billable subscriptions in that currency. Other currencies are not converted and are listed as excluded. Calendar totals instead use the full charge for each recorded or projected occurrence in the display currency and list other currencies as excluded. Bento tiles are sized by monthly share in the display currency; other-currency tiles get a neutral size, and paused/cancelling tiles retain their size but have no percentage share of the total.
- **Amount formatting:** `Intl.NumberFormat` uses each currency's minor units and configured locale, rather than forcing two decimal places (for example, `¥3,200` or `1.234,56 €`). A subscription charge of `0` is allowed and displayed as **Free**; totals retain currency formatting.
- **Subscription editor:** a trial requires an end date, and the next payment date is required. Field validation is shown at the input before saving.
- **Reduced motion:** the effective preference is the OS `prefers-reduced-motion: reduce` **or** the app's **Reduce motion** setting. Either disables animation and hover effects; turning off the app switch does not override the OS preference. Transition, hover, and speed controls otherwise apply through `useMotionSettings()`.
- **Calendar refresh:** payment writes invalidate cached months. Watched months refetch after pending writes settle; cached data remains visible while refreshing, and errors belong to the requested month. Subscription writes invalidate the calendar as well.

See [Configure Kessai](../how-to/configure.md) for the user workflow, and [PRODUCT.md](../../PRODUCT.md) / [DESIGN.md](../../DESIGN.md) for the product and visual rules.

## Frontend and tooling configuration

| File                   | What it controls              | Highlights                                                                                                                                                |
| ---------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite.config.ts`       | Frontend build and dev server | `@` path alias, vendor chunk splitting, `KESSAI_DEV_PORT` (default `1420`), `/api` proxy via `KESSAI_API_PORT` (default `3000`), `TAURI_DEV_HOST` support |
| `tsconfig.json`        | TypeScript compiler behavior  | Strict mode, bundler resolution, `@/*` → `./src/*` alias                                                                                                  |
| `eslint.config.js`     | Lint rules                    | TypeScript, React Hooks, React Refresh, and JSX accessibility rules; ignores `dist` and `src-tauri`                                                       |
| `.prettierrc`          | Formatting defaults           | No semicolons, single quotes, width `100`, Tailwind plugin                                                                                                |
| `playwright.config.ts` | E2E test runner               | `e2e/` directory, separate frontend/backend servers, configurable ports, fresh temporary backend database, CI retries/workers                             |

### `vite.config.ts`

`vite.config.ts` is also the main bridge between desktop and web development:

- Vite uses `KESSAI_DEV_PORT` (default `1420`) with `strictPort: true`.
- `/api` requests are proxied to `http://localhost:<KESSAI_API_PORT>` (default `3000`). The fixed `pnpm dev:web` backend command still binds port `3000`; start frontend/backend separately when overriding the API port.
- When `TAURI_DEV_HOST` is set, Vite enables explicit HMR host and WebSocket settings for Tauri development.
- `src-tauri/**` and `target/**` are excluded from file watching so Rust builds do not trigger frontend reloads.

## Quality-gate and release configuration

| File                            | What it controls                                   | Highlights                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`      | `main` / `release/**` push, PR, and release checks | Runs frontend checks/tests, installer tests, real-web smoke, dependency audits, Rust format/Clippy, and `cargo test --locked --workspace`                             |
| `.github/workflows/release.yml` | Release publishing on `v*` tags                    | Builds desktop installers and packages `kessai-mcp` archives (with `.sha256`, `LICENSE`, and offline `skills/kessai`) for Linux x64, macOS x64/arm64, and Windows x64 |
| `.release-it.json`              | Versioning and changelog flow                      | Requires a clean `main` branch, runs checks before init, syncs versions after bump, writes changelog entries to `CHANGELOG.md`                                        |

### `.release-it.json`

The repo does not use `release-it` to publish a GitHub release directly. Instead:

1. `pnpm release` creates the version bump, changelog update, and `v*` tag.
2. `.github/workflows/release.yml` reacts to that tag.
3. The workflow runs CI on that exact commit, builds the desktop installers and `kessai-mcp` archives into a draft, verifies the inventory, checksums, signatures, and updater manifest, then publishes once. CLI/MCP archives include `LICENSE` and an offline copy of `skills/kessai` for agent installers.

When a release branch already contains the version and curated changelog, use the [pre-staged release flow](../how-to/build-and-release.md#releasing-a-pre-staged-version-release-branch), not a second normal bump.

## See also

- [Commands and scripts](./commands-and-scripts.md)
- [Environment variables](./environment-variables.md)
- [MCP and CLI](./mcp-cli.md)
- [How to build and release](../how-to/build-and-release.md)
- [Design decisions](../explanation/design-decisions.md)
