# Environment variables

Kessai does not require a project `.env` file for normal desktop use. The repo's env-driven behavior is limited and is defined directly in the checked-in code and workflows.

## Runtime and local development

| Variable                           | Used by                                                                                                                                                  | Purpose                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `KESSAI_DB_PATH`                   | `crates/kessai-web/src/main.rs`, `crates/kessai-mcp/src/main.rs`                                                                                         | Overrides the default SQLite database path for web mode and MCP/CLI mode                                                                   |
| `KESSAI_DEV_PORT`                  | `vite.config.ts`, `playwright.config.ts`                                                                                                                 | Vite listener and full-suite Playwright frontend URL; defaults to `1420`; not used by the dedicated web-smoke suite                        |
| `KESSAI_API_PORT`                  | `vite.config.ts`, both Playwright configs, `scripts/run-web-smoke.js`                                                                                    | Vite API proxy and full-suite test backend port (default `3000`), or dedicated smoke backend port/base URL (default `3001`)                |
| `KESSAI_WEB_ALLOWED_HOSTS`         | `crates/kessai-web/src/main.rs`                                                                                                                          | Comma-separated allowed request hostnames/IP literals, without scheme or port (same as repeatable `--allowed-host`); standalone mode only  |
| `KESSAI_WEB_TAILSCALE_ONLY`        | `crates/kessai-web/src/main.rs`                                                                                                                          | Enables Tailscale-only hosted policy (same as `--tailscale-only`)                                                                          |
| `KESSAI_WEB_TRUST_TAILSCALE_PROXY` | `crates/kessai-web/src/main.rs`                                                                                                                          | Allows a non-loopback internal listener in Tailscale-only mode; use only with a loopback host publish and trusted local workloads          |
| `KESSAI_MCP_TOKEN`                 | `crates/kessai-mcp serve --http`                                                                                                                         | Bearer token for loopback Streamable HTTP MCP (≥ 32 non-whitespace bytes); required on Windows and used when Unix `--token-file` is absent |
| `NO_COLOR`                         | `crates/kessai-mcp/src/cli.rs`                                                                                                                           | Disables ANSI color for human CLI output; equivalent to `--no-color`; JSON output is always uncolored                                      |
| `TAURI_DEV_HOST`                   | `vite.config.ts`                                                                                                                                         | Adjusts Vite host and HMR settings for Tauri development                                                                                   |
| `RUST_LOG`                         | `src-tauri/src/lib.rs`, `crates/kessai-web/src/main.rs`, `crates/kessai-mcp/src/main.rs` through `tracing_subscriber::EnvFilter::try_from_default_env()` | Controls tracing verbosity for the Rust binaries                                                                                           |

### Notes

- The desktop app itself does not define a required user-facing env var in `src-tauri/tauri.conf.json` or `src-tauri/src/lib.rs`.
- `KESSAI_DB_PATH` is a runtime override. Without it, both `kessai-web` and `kessai-mcp` resolve to the platform data directory and fall back to `./kessai.db` only if no data directory is available.
- `KESSAI_DEV_PORT` and `KESSAI_API_PORT` configure development/test tooling, not runtime database paths. The full Playwright suite forces a fresh temporary `KESSAI_DB_PATH`; the dedicated smoke runner passes its own temporary `--db-path`, overriding any inherited database environment setting.
- `KESSAI_API_PORT` does not change `kessai-web`'s standalone listener; use `--port`. The `dev:web` and `serve:dev` package scripts explicitly pass `--port 3000`, so changing only this variable changes Vite's proxy target, not those backends. For alternate full-suite E2E ports, use `KESSAI_DEV_PORT=1438 KESSAI_API_PORT=3106 pnpm test:e2e`; for dedicated smoke use only `KESSAI_API_PORT=3107 pnpm test:e2e:web-smoke`.
- `KESSAI_WEB_ALLOWED_HOSTS` conflicts with Tailscale-only mode and does not widen a loopback listener's host policy. Non-loopback standalone requests must use the bound IP literal or an explicitly allowed host; this host check is not user authentication.
- `KESSAI_WEB_TRUST_TAILSCALE_PROXY` requires `KESSAI_WEB_TAILSCALE_ONLY`. Identity headers remain forgeable by every caller able to reach the listener; the trusted-proxy option is for `0.0.0.0` inside a container whose host publish is loopback-only, never for direct LAN/public exposure.
- `KESSAI_MCP_TOKEN` is only for optional `serve --http`. On Unix, an explicit `--token-file` takes precedence and must be a regular file owned by the effective user with no group or other permissions; symlinks are rejected. On Windows, `--token-file` is unavailable because portable ACL validation is not implemented, so set this environment variable instead. There is no `--token` CLI flag; never put the bearer token in CLI arguments.
- `RUST_LOG` is not named explicitly in the source because the binaries use the tracing default env filter API, but that is the standard variable the runtime reads.

## CI and release automation

| Variable or secret                   | Used by                                                  | Purpose                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `CI`                                 | `playwright.config.ts`, `playwright.web-smoke.config.ts` | Any nonempty value enables `forbidOnly` and two retries; the full suite also limits workers to one; web smoke always uses one worker |
| `GITHUB_TOKEN`                       | `.github/workflows/release.yml`                          | Allows release actions to upload assets; exposed as `GH_TOKEN` for draft management and final verification/publication via `gh`      |
| `TAURI_SIGNING_PRIVATE_KEY`          | `.github/workflows/release.yml`                          | Signs updater artifacts for the desktop release flow                                                                                 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `.github/workflows/release.yml`                          | Unlocks the updater signing key when needed                                                                                          |
| `GITHUB_REPOSITORY`                  | `scripts/release-dry-run.js --verify-artifacts`          | Expected updater-asset repository in GitHub download URLs; defaults to `Artificial-Source/Kessai` outside Actions                    |

Use `CI=true` for CI-style browser behavior. `CI=false` still enables it because these configurations check string truthiness; unset `CI` or set it to an empty value for zero local retries.

## Build-provided flags

Some behavior is driven by bundler-provided flags rather than user-managed env vars:

- `import.meta.env.DEV` changes frontend logging defaults in `src/lib/logger.ts`.
- `useUpdateStore` disables updater behavior in development and browser mode in `src/stores/update-store.ts`.

## See also

- [Configuration](./configuration.md)
- [MCP and CLI](./mcp-cli.md)
- [Filesystem](./filesystem.md)
- [How to run Kessai locally](../how-to/run-locally.md)
