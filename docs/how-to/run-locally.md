# How to run Kessai locally

Use this page for local development in desktop mode or browser mode.

## Prerequisites

- Node.js and pnpm installed
- Rust toolchain installed
- Dependencies installed:

```bash
pnpm install --reporter=silent
```

## Run desktop app (Tauri)

```bash
pnpm start
```

This is the primary local app experience (React frontend + Tauri backend). It launches as `Kessai Dev` with the `com.asf.kessai.dev` app identity, so it can run alongside an installed production `Kessai` app without single-instance or app-data collisions.

If you intentionally need to test development code with the production app identity and data path, run:

```bash
pnpm start:prod-id
```

## Run browser mode (web + API)

```bash
pnpm dev:web
```

What this does (from `package.json`):

- Starts `kessai-web` on port `3000`
- Starts Vite dev server (`pnpm dev`) on port `1420`
- Uses Vite `/api` proxy to `http://localhost:3000`

If you run only `pnpm dev`, API calls fail unless a backend is running.

## Run web server directly

```bash
cargo run -p kessai-web -- --port 3000 --dist-dir dist
```

Optional database override:

```bash
KESSAI_DB_PATH=/absolute/path/to/kessai.db cargo run -p kessai-web -- --port 3000
```

## Reproduce the CI web smoke flow locally

```bash
pnpm test:e2e:web-smoke
```

That command uses `pnpm serve:smoke`, which:

- builds `dist/`
- starts `kessai-web` on port `3001`
- passes an isolated temporary `--db-path` so your normal app database is not touched

If you want the server without Playwright, run:

```bash
pnpm serve:smoke
```

## Run MCP/CLI locally

CLI examples:

```bash
cargo run -p kessai-mcp -- list
cargo run -p kessai-mcp -- stats
```

Start MCP server mode (default when no subcommand is provided):

```bash
cargo run -p kessai-mcp
```

## See also

- [How to install](./install.md)
- [How to test](./test.md)
- [How to use MCP server](./use-mcp-server.md)
- [Web API](../reference/web-api.md)
- [MCP and CLI](../reference/mcp-cli.md)
