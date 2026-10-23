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

A debug desktop app can start without a built `dist/` directory. Build it with `pnpm build` before enabling **Settings → Private Web Access**, because that feature must serve `dist/index.html`.

## Run browser mode (web + API)

```bash
pnpm dev:web
```

What this does (from `package.json`):

- Starts `kessai-web` on port `3000` (using the normal database unless overridden)
- Starts Vite dev server (`pnpm dev`) on `KESSAI_DEV_PORT` (default `1420`)
- Uses Vite's `/api` proxy to `http://localhost:<KESSAI_API_PORT>` (default `3000`)

If you run only `pnpm dev`, API calls fail unless a backend is running.

For isolated development on other ports, start the processes in separate terminals. For example, after creating a writable temporary directory:

```bash
KESSAI_DB_PATH=/tmp/kessai-dev/kessai.db cargo run -p kessai-web -- --port 3002
```

```bash
KESSAI_DEV_PORT=1430 KESSAI_API_PORT=3002 pnpm dev
```

`KESSAI_API_PORT` changes the Vite proxy and test servers, not the fixed backend port in `pnpm dev:web`. Desktop development also needs a matching Tauri `build.devUrl` override if its Vite port changes.

## Run web server directly

```bash
cargo run -p kessai-web -- --port 3000 --dist-dir dist
```

The standalone server binds to `127.0.0.1` by default and is **not authenticated**. Loopback requests must use `localhost`, `127.0.0.1`, or `[::1]` as the host (any valid port). Browser mutation origins may use any loopback port, so the Vite proxy continues to work.

An explicit non-loopback bind is advanced and exposes its read/write API to reachable networks. The server accepts the bound IP literal plus explicitly allowed request hosts; a wildcard bind does not permit arbitrary hosts. For example, if clients use `kessai.home` or `192.168.1.20`:

```bash
cargo run -p kessai-web -- --host 0.0.0.0 --port 3000 --dist-dir dist \
  --allowed-host kessai.home --allowed-host 192.168.1.20
```

`--allowed-host <host>` is repeatable; alternatively set `KESSAI_WEB_ALLOWED_HOSTS=kessai.home,192.168.1.20`. Supply hostnames or IP literals without a scheme or port (bracket IPv6 literals). It applies only to ordinary standalone mode and cannot widen a loopback listener. Browser `POST`, `PUT`, `DELETE`, and `PATCH` requests must have a loopback or allowed-host HTTP(S) origin when `Origin` is present; non-browser requests without `Origin` remain allowed. These checks do not authenticate clients: use network isolation for non-loopback hosting. The Tailscale-only container flow below keeps its existing, separate policy and does not need `--allowed-host`.

Optional database override:

```bash
KESSAI_DB_PATH=/absolute/path/to/kessai.db cargo run -p kessai-web -- --port 3000
```

## Run Tailscale-only standalone hosting

Build the frontend, start the server on host loopback, and configure Tailscale Serve:

```bash
pnpm build
cargo run -p kessai-web -- \
  --tailscale-only \
  --host 127.0.0.1 \
  --port 8482 \
  --dist-dir dist
tailscale serve --bg http://127.0.0.1:8482
```

`--tailscale-only` also reads `KESSAI_WEB_TAILSCALE_ONLY`; `--trust-tailscale-proxy` reads `KESSAI_WEB_TRUST_TAILSCALE_PROXY` and requires Tailscale-only mode. A non-loopback listener fails before startup unless proxy trust is explicit. Do not enable trust for ordinary direct hosting.

Container example (there is no official Kessai image). Persist `/data` so the database, sibling `logos/`, and `logs/` survive recreation; your image must make `/data` writable:

```bash
docker run --rm \
  -p 127.0.0.1:8482:3000 \
  -v kessai-data:/data \
  <your-kessai-image> \
  kessai-web --tailscale-only --trust-tailscale-proxy \
    --host 0.0.0.0 --port 3000 \
    --db-path /data/kessai.db \
    --dist-dir dist
tailscale serve --bg http://127.0.0.1:8482
```

Here `0.0.0.0` is inside the container only; the host publish must remain exactly loopback-scoped. Health checks should use the no-data path `GET` or `HEAD` `/__kessai/health` (`204`). Never use Tailscale Funnel.

**Header trust in plain language:** a remote browser cannot choose its Tailscale identity. Serve strips caller-supplied identity fields and injects a verified `Tailscale-User-Login`; Kessai validates that identity plus `.ts.net` authority and HTTPS Origin. Only software already able to reach the host-local backend can imitate those internal headers. That is an accepted host-trust boundary for identity-only mode — it stops remote LAN/public clients, not malicious local workloads. Canonical explanation: [How Tailscale identity reaches Kessai](../explanation/security-and-privacy.md#how-tailscale-identity-reaches-kessai). The startup warning repeats this boundary.

## Reproduce the CI web smoke flow locally

```bash
pnpm test:e2e:web-smoke
```

That command uses `pnpm serve:smoke`, which:

- builds `dist/`
- starts `kessai-web` on `KESSAI_API_PORT` (default `3001`)
- passes an isolated temporary `--db-path` so your normal app database is not touched

If you want the server without Playwright, run:

```bash
pnpm serve:smoke
```

The main `pnpm test:e2e` configuration also creates a fresh temporary database, starts frontend/backend processes on `KESSAI_DEV_PORT` / `KESSAI_API_PORT` (defaults `1420` / `3000`), and refuses to reuse existing servers. Choose free ports rather than pointing tests at an app you already run; see [How to test](./test.md).

## Run MCP/CLI locally

CLI examples (add `--json` for the shared machine-readable result DTOs):

```bash
cargo run -p kessai-mcp -- subscriptions list
cargo run -p kessai-mcp -- subscriptions create --name Netflix --amount 15.99 --billing-cycle monthly --next-payment-date 2026-10-25
cargo run -p kessai-mcp -- analytics dashboard
cargo run -p kessai-mcp -- setup --dry-run
```

Start stdio MCP server mode explicitly (a bare invocation prints help and exits 2):

```bash
cargo run -p kessai-mcp -- serve
# Read-only access: cargo run -p kessai-mcp -- serve --read-only
```

Optional loopback HTTP MCP is documented in [How to use the MCP server](./use-mcp-server.md#optional-loopback-http).

## See also

- [How to install](./install.md)
- [How to configure](./configure.md)
- [How to test](./test.md)
- [How to use the MCP server](./use-mcp-server.md)
- [Web API](../reference/web-api.md)
- [Security and privacy](../explanation/security-and-privacy.md)
- [MCP and CLI](../reference/mcp-cli.md)
