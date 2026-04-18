# Environment variables

Kessai does not require a project `.env` file for normal desktop use. The repo's env-driven behavior is limited and is defined directly in the checked-in code and workflows.

## Runtime and local development

| Variable | Used by | Purpose |
| --- | --- | --- |
| `KESSAI_DB_PATH` | `crates/kessai-web/src/main.rs`, `crates/kessai-mcp/src/main.rs` | Overrides the default SQLite database path for web mode and MCP/CLI mode |
| `TAURI_DEV_HOST` | `vite.config.ts` | Adjusts Vite host and HMR settings for Tauri development |
| `RUST_LOG` | `src-tauri/src/lib.rs`, `crates/kessai-web/src/main.rs`, `crates/kessai-mcp/src/main.rs` through `tracing_subscriber::EnvFilter::try_from_default_env()` | Controls tracing verbosity for the Rust binaries |

### Notes

- The desktop app itself does not define a required user-facing env var in `src-tauri/tauri.conf.json` or `src-tauri/src/lib.rs`.
- `KESSAI_DB_PATH` is a runtime override. Without it, both `kessai-web` and `kessai-mcp` resolve to the platform data directory and fall back to `./kessai.db` only if no data directory is available.
- `RUST_LOG` is not named explicitly in the source because the binaries use the tracing default env filter API, but that is the standard variable the runtime reads.

## CI and release automation

| Variable or secret | Used by | Purpose |
| --- | --- | --- |
| `CI` | `playwright.config.ts` | Enables stricter Playwright behavior: retries, single worker, and `forbidOnly` |
| `GITHUB_TOKEN` | `.github/workflows/release.yml` | Lets the release job publish release assets |
| `TAURI_SIGNING_PRIVATE_KEY` | `.github/workflows/release.yml` | Signs updater artifacts for the desktop release flow |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `.github/workflows/release.yml` | Unlocks the updater signing key when needed |

## Build-provided flags

Some behavior is driven by bundler-provided flags rather than user-managed env vars:

- `import.meta.env.DEV` changes frontend logging defaults in `src/lib/logger.ts`.
- `useUpdateStore` disables updater behavior in development and browser mode in `src/stores/update-store.ts`.

## See also

- [Configuration](./configuration.md)
- [Filesystem](./filesystem.md)
- [How to run Kessai locally](../how-to/run-locally.md)
