# Configuration

This page covers the checked-in configuration files that define Kessai's runtime behavior, build pipeline, quality gates, and release automation.

## Application and workspace configuration

| File | What it controls | Highlights |
| --- | --- | --- |
| `Cargo.toml` | Workspace membership | Declares `kessai-core`, `kessai-mcp`, `kessai-web`, and `src-tauri` |
| `src-tauri/Cargo.toml` | Desktop Rust crate | Tauri plugins, updater support, native dependencies, desktop crate metadata |
| `src-tauri/tauri.conf.json` | Desktop app metadata and runtime config | Product name, identifier, build hooks, window sizing, CSP, bundle assets, updater endpoint and public key |
| `crates/kessai-web/Cargo.toml` | Web server binary | Axum, Clap, tower-http, tracing, and shared core dependency |
| `crates/kessai-mcp/Cargo.toml` | CLI + MCP binary | Clap, RMCP, tracing, terminal formatting, and shared core dependency |

### `src-tauri/tauri.conf.json`

The desktop config is the main source for native runtime behavior:

- `build.beforeDevCommand` is `pnpm dev`, and `build.beforeBuildCommand` is `pnpm build`.
- The desktop window starts at `1200x800` with `900x600` minimums.
- The CSP allowlist explicitly includes the GitHub hosts used by the updater.
- The updater plugin is configured with a checked-in public key and the GitHub `latest.json` endpoint.

## Frontend and tooling configuration

| File | What it controls | Highlights |
| --- | --- | --- |
| `vite.config.ts` | Frontend build and dev server | `@` path alias, vendor chunk splitting, port `1420`, `/api` proxy to `http://localhost:3000`, `TAURI_DEV_HOST` support |
| `tsconfig.json` | TypeScript compiler behavior | Strict mode, bundler resolution, `@/*` → `./src/*` alias |
| `eslint.config.js` | Lint rules | TypeScript, React Hooks, React Refresh, and JSX accessibility rules; ignores `dist` and `src-tauri` |
| `.prettierrc` | Formatting defaults | No semicolons, single quotes, width `100`, Tailwind plugin |
| `playwright.config.ts` | E2E test runner | `e2e/` directory, `pnpm dev:web` web server, base URL `http://localhost:1420`, CI retries/workers |

### `vite.config.ts`

`vite.config.ts` is also the main bridge between desktop and web development:

- Vite always runs on port `1420` with `strictPort: true`.
- `/api` requests are proxied to `http://localhost:3000` in browser mode.
- When `TAURI_DEV_HOST` is set, Vite enables explicit HMR host and WebSocket settings for Tauri development.
- `src-tauri/**` is excluded from file watching so Rust changes do not trigger noisy frontend reload behavior.

## Quality-gate and release configuration

| File | What it controls | Highlights |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Pull request and `main` checks | Runs `pnpm check`, `pnpm test:run`, a Playwright readiness pass, and `cargo test --workspace` |
| `.github/workflows/release.yml` | Release publishing on `v*` tags | Builds desktop installers and packages `kessai-mcp` binaries for all supported targets |
| `.release-it.json` | Versioning and changelog flow | Requires a clean `main` branch, runs checks before init, syncs versions after bump, writes changelog entries to `CHANGELOG.md` |

### `.release-it.json`

The repo does not use `release-it` to publish a GitHub release directly. Instead:

1. `pnpm release` creates the version bump, changelog update, and `v*` tag.
2. `.github/workflows/release.yml` reacts to that tag.
3. The workflow builds the desktop installers and `kessai-mcp` archives, and Tauri publishes the desktop release assets.

## See also

- [Commands and scripts](./commands-and-scripts.md)
- [Environment variables](./environment-variables.md)
- [Design decisions](../explanation/design-decisions.md)
