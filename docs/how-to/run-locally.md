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
pnpm tauri dev
```

This is the primary local app experience (React frontend + Tauri backend).

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
