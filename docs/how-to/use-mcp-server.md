# How to use the Kessai MCP server

Connect an agent to the same local database and business rules as the desktop app. Kessai is a single-user tracker: its tools never contact banks or subscription providers. Marking a subscription cancelled changes only your local record.

## Install the binary

The installers need no administrator rights and verify release SHA-256 sidecars.

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/Artificial-Source/Kessai/main/install-cli.sh | sh
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/Artificial-Source/Kessai/main/install-cli.ps1 | iex
```

Supported targets are Linux x64, macOS x64/arm64, and Windows x64. For version pinning, custom installation paths, and manual downloads, see [Install the CLI/MCP binary](./install.md#install-climcp-binary).

To build from source:

```bash
cargo build --locked --release -p kessai-mcp
# binary: target/release/kessai-mcp (.exe on Windows)
```

## Choose the database

```bash
kessai-mcp info --json
kessai-mcp --db-path /absolute/path/to/kessai.db info --json
```

`info` reports the effective database path and versions. It never creates, migrates, or writes; an existing database file is inspected read-only. An explicit `--db-path` wins over `KESSAI_DB_PATH`. With neither, Kessai uses the platform data directory under `com.asf.kessai`, falling back to `./kessai.db` only when no platform data directory is available. Point the server at the desktop app's database to see the same data. Never edit SQLite directly for agent work.

## Generate client configuration

```bash
kessai-mcp setup
kessai-mcp setup --output .mcp.json --dry-run
kessai-mcp setup --output .mcp.json
```

Without `--output`, `setup` prints the generated configuration. With `--output`, it merges only `mcpServers.kessai`, preserves other servers and root keys, backs up an existing file, and writes atomically. Review `--dry-run` before writing: it creates neither a configuration file nor a backup or database. Generated binary and database paths are absolute.

For automation, `setup --json` returns `{path, written, backup_path, config}` rather than unframed configuration. The generated `config` contains this shape:

```json
{
  "mcpServers": {
    "kessai": {
      "command": "/absolute/path/to/kessai-mcp",
      "args": ["--db-path", "/absolute/path/to/kessai.db", "serve"]
    }
  }
}
```

Load that server entry into your client's MCP configuration and reload the client. Claude Code uses project `.mcp.json`; Claude Desktop uses its own MCP configuration file. For an interactive protocol inspection session, MCP Inspector can launch the binary with the same `--db-path` and `serve` arguments. Configuration alone is not proof of host compatibility: verify the connection and run a read tool in your installed client.

## Start stdio MCP

```bash
kessai-mcp serve
```

Explicit `serve` is required. Running the binary without a command prints help and exits 2; it does not start a server. Stdio is the preferred transport. Protocol output stays on stdout and diagnostics go to stderr.

Use your client's `tools/list` discovery to inspect the installed contract. Tool names follow `<resource>_<verb>`, for example `subscriptions_list` and `payments_record`. Successful `structuredContent` is the result DTO itself, identical to CLI `--json` output. Domain errors set `isError: true` and carry an error object in text content, without success-shaped structured content.

Start with a read-only request:

```json
{
  "name": "subscriptions_list",
  "arguments": { "query": "cloud", "status": ["active"], "limit": 20 }
}
```

This is a `tools/call` payload. Take IDs from returned `items` and follow `next_cursor` until null before describing a list as complete. See the [contract reference](../reference/mcp-cli.md) for grammar, DTOs, paging, currencies, errors, and mutation policy rather than inferring inputs from examples.

## Restrict the server to read-only access

```bash
kessai-mcp serve --read-only
kessai-mcp setup --output .mcp.json --read-only --dry-run
kessai-mcp setup --output .mcp.json --read-only
```

Read-only mode lists only read-only tools and rejects calls to all other tool names, even if a client already knows them. It also excludes backup export because export writes a file. Resources and the review prompt remain available. `setup --read-only` records the mode in the generated server arguments; reload the client after changing its configuration.

Tool annotations communicate mutation and retry behavior to hosts. They do not replace user approval. Before deletion or restore, obtain a dry-run preview, show its impact, and request explicit approval before sending confirmation. A local cancellation is a field update, not a provider cancellation.

## Resources and the review prompt

Small JSON resources provide context without embedding the whole database in a prompt:

- `kessai://settings` and `kessai://dashboard`
- `kessai://subscriptions` (bounded compact first page; inspect `total` and page through the list tool when incomplete)
- `kessai://categories`
- `kessai://subscriptions/{id}` for full detail
- `kessai://calendar/{year}/{month}` for a projected calendar month

The `subscription_review` prompt has no arguments and embeds no database records. It asks the agent to discover current currency context, upcoming and overdue-review subscriptions, and price changes, then propose changes without applying them until approved.

## Optional loopback HTTP

Use Streamable HTTP only when a local client requires it. This is not public/remote hosting, is unrelated to Private Web Access, and does not configure Tailscale.

On Unix, create a protected bearer-token file:

```bash
umask 077
mkdir -p ~/.config/kessai
openssl rand -base64 32 > ~/.config/kessai/mcp.token
chmod 600 ~/.config/kessai/mcp.token
kessai-mcp serve --http --port 8742 --token-file ~/.config/kessai/mcp.token
```

The endpoint is `http://127.0.0.1:8742/mcp`. Port 8742 is the default; `--port 0` selects an available port. Both `--port` and `--token-file` require `--http`; `--read-only` works with either transport.

The token must contain at least 32 non-whitespace bytes. An explicit Unix `--token-file` takes precedence over `KESSAI_MCP_TOKEN`; Kessai refuses symlinks and requires a regular file owned by the effective user with no group or other permissions. On Windows, portable ACL validation is unavailable, so `--token-file` is rejected: set `KESSAI_MCP_TOKEN` in the server process environment instead. There is no plaintext token argument; never put the secret in CLI arguments or client configuration committed to source control.

HTTP binds only `127.0.0.1`, requires `Authorization: Bearer <token>`, validates `Host` and `Origin`, and emits no CORS headers. Keep the token secret and do not expose the listener beyond loopback. Prefer stdio unless HTTP is needed.

## Install the agent skill

```bash
npx skills add Artificial-Source/Kessai --skill kessai
```

The [skill](../../skills/kessai/SKILL.md) teaches MCP-first operation with a JSON CLI fallback and executable workflows. An offline copy ships in binary release archives. For one-shot CLI access and installed machine discovery:

```bash
kessai-mcp --json subscriptions list --status active
kessai-mcp --json calendar month 2026-10
kessai-mcp schema subscriptions list
```

See [MCP and CLI](../reference/mcp-cli.md) for the single contract reference and [Environment variables](../reference/environment-variables.md) for runtime configuration.
