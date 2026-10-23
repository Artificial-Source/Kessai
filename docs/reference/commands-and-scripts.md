# Commands and scripts

This page summarizes the commands that are actually wired into `package.json`, the workspace binaries, and the checked-in helper scripts under the repository root.

## Root package scripts

The main command catalog lives in `package.json`.

### Development and build

| Command                               | What it runs                                                                       | Notes                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm start`                          | `tauri dev --config src-tauri/tauri.dev.conf.json`                                 | Desktop dev app as `Kessai Dev` with isolated app identity and data                          |
| `pnpm dev`                            | `vite`                                                                             | Frontend-only dev server; `KESSAI_DEV_PORT` defaults to `1420`                               |
| `pnpm dev:web`                        | `cargo run -p kessai-web -- --dist-dir dist --port 3000` and `pnpm dev`            | Runs the local web API and Vite together                                                     |
| `pnpm build`                          | `tsc && vite build`                                                                | Produces the frontend bundle in `dist/`                                                      |
| `pnpm verify:web-resource`            | `node scripts/verify-web-resource.js`                                              | Requires `dist/index.html` and the Tauri `../dist/` → `dist/` resource map                   |
| `pnpm build:tauri`                    | `tauri build`                                                                      | Alias for a production desktop build                                                         |
| `pnpm preview`                        | `vite preview`                                                                     | Serves the built frontend bundle                                                             |
| `pnpm start:prod-id`                  | `tauri dev`                                                                        | Dev runner with production app identity; use only when testing prod paths                    |
| `pnpm tauri dev` / `pnpm tauri build` | via the `tauri` script                                                             | Raw Tauri commands because `package.json` exposes `"tauri": "tauri"`                         |
| `pnpm serve`                          | `cargo build --release -p kessai-web && pnpm build && ./target/release/kessai-web` | Builds and runs the release web server                                                       |
| `pnpm serve:dev`                      | `cargo run -p kessai-web -- --dist-dir dist --port 3000`                           | Runs only the web backend                                                                    |
| `pnpm serve:smoke`                    | `node scripts/run-web-smoke.js`                                                    | Builds the frontend and starts an isolated web backend; `KESSAI_API_PORT` defaults to `3001` |

Vite's `/api` proxy uses `KESSAI_API_PORT` (default `3000`). That variable does not override the hard-coded `--port 3000` in `dev:web` or `serve:dev`, or the standalone binary's `--port`; it is also consumed by the Playwright server wrappers below.

### Quality and test

| Command                              | What it runs                                        | Notes                                                                                                                                |
| ------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`                          | `eslint src --max-warnings 0`                       | Lints TypeScript and TSX in `src/`                                                                                                   |
| `pnpm lint:fix`                      | `eslint src --fix`                                  | Same scope, with autofix                                                                                                             |
| `pnpm format`                        | `prettier --write "src/**/*.{ts,tsx,css}"`          | Formats source files, not the whole repo                                                                                             |
| `pnpm format:check`                  | `prettier --check "src/**/*.{ts,tsx,css}"`          | Used by `pnpm check`                                                                                                                 |
| `pnpm typecheck`                     | `tsc --noEmit`                                      | Uses the strict settings in `tsconfig.json`                                                                                          |
| `pnpm check`                         | `pnpm lint && pnpm typecheck && pnpm format:check`  | Main frontend quality gate                                                                                                           |
| `pnpm check:tauri-versions`          | `node scripts/check-tauri-dependency-versions.js`   | Ensures installed Tauri JavaScript and Rust packages use matching major/minor versions                                               |
| `pnpm test`                          | `vitest`                                            | Watch mode                                                                                                                           |
| `pnpm test:run`                      | `vitest run`                                        | Single test pass                                                                                                                     |
| `pnpm test:coverage`                 | `vitest run --coverage`                             | Coverage run                                                                                                                         |
| `pnpm test:e2e`                      | `playwright test`                                   | Starts fresh Vite + web-backend servers with an isolated temporary database; ports from `KESSAI_DEV_PORT` / `KESSAI_API_PORT`        |
| `pnpm test:e2e:web-smoke`            | `playwright test -c playwright.web-smoke.config.ts` | Runs both `web-smoke.spec.ts` and `web-mutations.spec.ts` against the built frontend + isolated backend; API port defaults to `3001` |
| `pnpm test:e2e:ui`                   | `playwright test --ui`                              | Interactive Playwright UI                                                                                                            |
| `pnpm test:installer`                | Desktop and CLI installer test scripts              | Smoke-tests desktop installers plus CLI archive, checksum, and install contracts                                                     |
| `bash scripts/test-cli-installer.sh` | (run directly)                                      | Runs the focused no-network CLI installer contract suite                                                                             |

Playwright never reuses an existing server. A nonempty `CI` (including `CI=false`) enables `forbidOnly` and two retries in both configurations; use `CI=true` for CI-style runs, or unset/empty it for zero local retries. The full suite limits all workers to one under CI; its `real-web` project and the dedicated web-smoke suite always run serially.

### Release and repo utilities

| Command                                       | What it runs                             | Notes                                                                                                                                                  |
| --------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm release`                                | `release-it`                             | Requires clean `main`; `before:init` runs frontend/Rust checks, audits, installer tests, release self-tests, build/resource checks, and real-web smoke |
| `pnpm release -- --no-increment --no-plugins` | `release-it --no-increment --no-plugins` | Releases already-committed versions/changelog without regenerating them; keeps `before:init` gates, tags the current version on HEAD, and pushes       |
| `pnpm release:dry`                            | `node scripts/release-dry-run.js`        | Runs synthetic release regressions, requires a clean tree, invokes `release-it --ci --dry-run`, and restores release-managed files                     |
| `pnpm sync-versions`                          | `node scripts/sync-versions.js`          | Syncs package, Tauri config, user-facing Rust manifests, and their Cargo.lock entries                                                                  |
| `pnpm prepare`                                | `husky`                                  | Installs Git hooks for local contributors                                                                                                              |

For a pre-staged `release/1.0.0`, fast-forward it into `main` before using the no-increment/no-plugins command. `--no-increment` alone still loads the changelog plugin and prepends a second generated `1.0.0` section. The local dry-run does not rehearse GitHub's draft → artifact verification → publication jobs. See [the release guide](../how-to/build-and-release.md#releasing-a-pre-staged-version-release-branch).

## Rust and workspace binaries

These commands come from the Cargo workspace declared in `Cargo.toml`.

The workspace-root `Cargo.lock` is the single Rust lockfile, including when
building from `src-tauri/`; do not create or commit `src-tauri/Cargo.lock`.
Release builds use `cargo build --locked` (or `cargo build --locked -p kessai`
for desktop only). After refreshing Rust Tauri dependencies, update the matching
`@tauri-apps/*` packages and run `pnpm check:tauri-versions`.

`cargo audit` checks the complete lockfile across platforms. The reviewed
exceptions in [`.cargo/audit.toml`](../../.cargo/audit.toml) include the advisory
ID, upstream dependency constraint, residual risk, and re-check date. New
vulnerabilities, unsoundness notices, and unmaintained dependencies fail the gate.
The current exceptions cover Windows updater ZIP extraction (Tauri 2 still
requires ZIP 4; updates are signature-verified before extraction), the GTK3
`glib` iterator issue, and five upstream maintenance notices. They must not be
treated as patched dependencies or a blanket exemption for future advisories.

| Command                                                                              | What it builds or runs                                                                                                              | Source                           |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `cargo test --locked --workspace`                                                    | Rust tests for `kessai-core`, `kessai-mcp`, `kessai-web`, and `src-tauri`, without changing the lockfile                            | `Cargo.toml`, `.release-it.json` |
| `cargo build --locked --release -p kessai-mcp`                                       | Release CLI + MCP binary                                                                                                            | `crates/kessai-mcp/Cargo.toml`   |
| `cargo build --locked --release -p kessai-web`                                       | Release local web server binary                                                                                                     | `crates/kessai-web/Cargo.toml`   |
| `cargo run -p kessai-web -- --port 3000`                                             | Local web API + SPA server on `127.0.0.1` by default                                                                                | `crates/kessai-web/src/main.rs`  |
| `cargo run -p kessai-web -- --host <IP> --port 3000 --allowed-host <hostname-or-IP>` | Explicit non-loopback listener and allowed request host; exposes the unauthenticated API to reachable clients; not a login boundary | `crates/kessai-web/src/main.rs`  |
| `cargo run -p kessai-mcp -- --help`                                                  | Print command help without opening the database (bare invocation also prints help, exit 2)                                          | `crates/kessai-mcp/src/main.rs`  |
| `cargo run -p kessai-mcp -- serve`                                                   | Explicit stdio MCP server                                                                                                           | `crates/kessai-mcp/src/cli.rs`   |
| `cargo run -p kessai-mcp -- serve --read-only`                                       | MCP server exposing and permitting only read-only tools                                                                             | `crates/kessai-mcp/src/mcp.rs`   |
| `cargo run -p kessai-mcp -- serve --http --token-file PATH`                          | Loopback Streamable HTTP at `/mcp`; Unix owner-only token file; Windows uses `KESSAI_MCP_TOKEN`                                     | `crates/kessai-mcp/src/http.rs`  |
| `cargo run -p kessai-mcp -- setup`                                                   | Print generated MCP configuration; `--json` returns setup result metadata and `config`                                              | `crates/kessai-mcp/src/setup.rs` |
| `cargo run -p kessai-mcp -- --json subscriptions list`                               | One-shot CLI returning the shared paginated DTO                                                                                     | `crates/kessai-mcp/src/cli.rs`   |
| `cargo run -p kessai-mcp -- schema subscriptions update`                             | Machine-readable flags and output schema, without opening the database                                                              | `crates/kessai-mcp/src/cli.rs`   |
| `cargo run -p kessai-mcp -- info --json`                                             | Report effective path/versions; inspect existing files read-only, never create/migrate/write                                        | `crates/kessai-mcp/src/main.rs`  |

Full CLI/MCP taxonomy, safety rules, and HTTP constraints: [MCP and CLI](./mcp-cli.md).

## Helper scripts in the repo root

| File                                         | Purpose                       | Notes                                                                                                                                                                                           |
| -------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install.sh`                                 | Interactive Linux installer   | Downloads a release when possible, or builds from source with `--from-source`                                                                                                                   |
| `uninstall.sh`                               | Linux uninstaller             | Removes local binaries and can optionally purge app data                                                                                                                                        |
| `install-cli.sh`                             | macOS/Linux CLI/MCP installer | No-admin user install; verifies `.sha256`; options `--version`, `--dry-run`, `--bin-dir`, `--mcp-config`                                                                                        |
| `install-cli.ps1`                            | Windows CLI/MCP installer     | Same contract as the shell installer (`-Version`, `-DryRun`, `-BinDir`, `-McpConfig`)                                                                                                           |
| `scripts/kessai`                             | Unified launcher wrapper      | Delegates to `kessai-desktop`, `kessai-mcp`, or `kessai-web`                                                                                                                                    |
| `scripts/check-tauri-dependency-versions.js` | Release compatibility guard   | Fails when installed Tauri JavaScript and desktop Rust package major/minor versions differ                                                                                                      |
| `scripts/release-dry-run.js`                 | Safe release dry-run wrapper  | No arguments: self-tests + clean-tree release-it preview/restoration; `--check [vX.Y.Z]`: read-only product-version/changelog preflight + self-tests; `--self-test`: synthetic regressions only |
| `scripts/run-web-smoke.js`                   | Web smoke server wrapper      | Builds the frontend, starts `kessai-web` on `KESSAI_API_PORT` (default `3001`), and points it at an isolated temporary database                                                                 |
| `scripts/test-installer.sh`                  | Installer smoke test          | Exercises `install.sh --help`, invalid flags, and executable bits                                                                                                                               |
| `scripts/test-cli-installer.sh`              | CLI installer smoke test      | Exercises archive layout, checksum, and install-cli packaging contracts                                                                                                                         |
| `scripts/sync-versions.js`                   | Version sync helper           | Also called by `pnpm sync-versions` and the release flow                                                                                                                                        |
| `scripts/verify-web-resource.js`             | Tauri SPA resource verifier   | Fails unless `dist/index.html` exists and `src-tauri/tauri.conf.json` maps `../dist/` to `dist/`                                                                                                |

The final release job also calls `scripts/release-dry-run.js --desktop-checksums <asset-directory> <tag>` to generate desktop `.sha256` sidecars and `--verify-artifacts <asset-directory> <tag>` to validate the exact release inventory, checksums, and updater manifest/signature agreement. Both require a stable tag whose version matches the product manifests, lockfile, and changelog. These modes are not a signing-key cryptographic verification step.

## Installed binary names

`install.sh` and `scripts/kessai` assume this command layout:

| Binary           | Role                                                             |
| ---------------- | ---------------------------------------------------------------- |
| `kessai`         | Unified launcher                                                 |
| `kessai-desktop` | Desktop app                                                      |
| `kessai-mcp`     | Full CLI + MCP server (explicit `serve`; optional loopback HTTP) |
| `kessai-web`     | Local web server                                                 |

## See also

- [Configuration](./configuration.md)
- [MCP and CLI](./mcp-cli.md)
- [Web API](./web-api.md)
- [How to build and release](../how-to/build-and-release.md)
