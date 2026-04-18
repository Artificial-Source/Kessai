# Commands and scripts

This page summarizes the commands that are actually wired into `package.json`, the workspace binaries, and the checked-in helper scripts under the repository root.

## Root package scripts

The main command catalog lives in `package.json`.

### Development and build

| Command | What it runs | Notes |
| --- | --- | --- |
| `pnpm start` | `tauri dev` | Convenience alias for the desktop dev app |
| `pnpm dev` | `vite` | Frontend-only dev server on port `1420` from `vite.config.ts` |
| `pnpm dev:web` | `cargo run -p kessai-web -- --dist-dir dist --port 3000` and `pnpm dev` | Runs the local web API and Vite together |
| `pnpm build` | `tsc && vite build` | Produces the frontend bundle in `dist/` |
| `pnpm build:tauri` | `tauri build` | Alias for a production desktop build |
| `pnpm preview` | `vite preview` | Serves the built frontend bundle |
| `pnpm tauri dev` / `pnpm tauri build` | via the `tauri` script | Common desktop commands because `package.json` exposes `"tauri": "tauri"` |
| `pnpm serve` | `cargo build --release -p kessai-web && pnpm build && ./target/release/kessai-web` | Builds and runs the release web server |
| `pnpm serve:dev` | `cargo run -p kessai-web -- --dist-dir dist --port 3000` | Runs only the web backend |

### Quality and test

| Command | What it runs | Notes |
| --- | --- | --- |
| `pnpm lint` | `eslint src --max-warnings 0` | Lints TypeScript and TSX in `src/` |
| `pnpm lint:fix` | `eslint src --fix` | Same scope, with autofix |
| `pnpm format` | `prettier --write "src/**/*.{ts,tsx,css}"` | Formats source files, not the whole repo |
| `pnpm format:check` | `prettier --check "src/**/*.{ts,tsx,css}"` | Used by `pnpm check` |
| `pnpm typecheck` | `tsc --noEmit` | Uses the strict settings in `tsconfig.json` |
| `pnpm check` | `pnpm lint && pnpm typecheck && pnpm format:check` | Main frontend quality gate |
| `pnpm test` | `vitest` | Watch mode |
| `pnpm test:run` | `vitest run` | Single test pass |
| `pnpm test:coverage` | `vitest run --coverage` | Coverage run |
| `pnpm test:e2e` | `playwright test` | Uses the `playwright.config.ts` web server wrapper |
| `pnpm test:e2e:ui` | `playwright test --ui` | Interactive Playwright UI |
| `pnpm test:installer` | `bash scripts/test-installer.sh` | Smoke-tests `install.sh` and `uninstall.sh` |

### Release and repo utilities

| Command | What it runs | Notes |
| --- | --- | --- |
| `pnpm release` | `release-it` | Requires a clean `main` branch per `.release-it.json` |
| `pnpm release:dry` | `release-it --dry-run` | Preview release steps |
| `pnpm sync-versions` | `node scripts/sync-versions.js` | Syncs `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` |
| `pnpm prepare` | `husky` | Installs Git hooks for local contributors |

## Rust and workspace binaries

These commands come from the Cargo workspace declared in `Cargo.toml`.

| Command | What it builds or runs | Source |
| --- | --- | --- |
| `cargo test --workspace` | Rust tests for `kessai-core`, `kessai-mcp`, `kessai-web`, and `src-tauri` | `Cargo.toml`, `AGENTS.md` |
| `cargo build --release -p kessai-mcp` | Release CLI + MCP binary | `crates/kessai-mcp/Cargo.toml` |
| `cargo build --release -p kessai-web` | Release local web server binary | `crates/kessai-web/Cargo.toml` |
| `cargo run -p kessai-web -- --port 3000` | Local web API + SPA server | `crates/kessai-web/src/main.rs` |
| `cargo run -p kessai-mcp` | MCP server mode | `crates/kessai-mcp/src/main.rs` |
| `cargo run -p kessai-mcp -- list` | CLI mode example | `crates/kessai-mcp/src/cli.rs` |

## Helper scripts in the repo root

| File | Purpose | Notes |
| --- | --- | --- |
| `install.sh` | Interactive Linux installer | Downloads a release when possible, or builds from source with `--from-source` |
| `uninstall.sh` | Linux uninstaller | Removes local binaries and can optionally purge app data |
| `scripts/kessai` | Unified launcher wrapper | Delegates to `kessai-desktop`, `kessai-mcp`, or `kessai-web` |
| `scripts/test-installer.sh` | Installer smoke test | Exercises `install.sh --help`, invalid flags, and executable bits |
| `scripts/sync-versions.js` | Version sync helper | Also called by `pnpm sync-versions` and the release flow |

## Installed binary names

`install.sh` and `scripts/kessai` assume this command layout:

| Binary | Role |
| --- | --- |
| `kessai` | Unified launcher |
| `kessai-desktop` | Desktop app |
| `kessai-mcp` | CLI + MCP server |
| `kessai-web` | Local web server |

## See also

- [Configuration](./configuration.md)
- [MCP and CLI](./mcp-cli.md)
- [Web API](./web-api.md)
- [How to build and release](../how-to/build-and-release.md)
