# How to use the Kessai MCP server

Kessai ships an MCP server in the `kessai-mcp` binary.

This guide shows how to build it, run it, and connect an MCP client.

## 1) Build the binary

```bash
cargo build --release -p kessai-mcp
```

Binary location:

- Linux/macOS: `./target/release/kessai-mcp`
- Windows: `./target/release/kessai-mcp.exe`

## 2) Run server mode locally

`kessai-mcp` runs as an MCP stdio server when no subcommand is provided:

```bash
./target/release/kessai-mcp
```

You can also set a database explicitly:

```bash
./target/release/kessai-mcp --db-path /absolute/path/to/kessai.db
```

Equivalent via environment variable:

```bash
KESSAI_DB_PATH=/absolute/path/to/kessai.db ./target/release/kessai-mcp
```

## 3) Configure your MCP client

Example client config (adapt path for your machine):

```json
{
  "mcpServers": {
    "kessai": {
      "command": "/absolute/path/to/target/release/kessai-mcp"
    }
  }
}
```

If your client expects explicit args, use:

```json
{
  "mcpServers": {
    "kessai": {
      "command": "/absolute/path/to/target/release/kessai-mcp",
      "args": ["--db-path", "/absolute/path/to/kessai.db"]
    }
  }
}
```

## 4) Confirm available capabilities

From `crates/kessai-mcp/src/mcp.rs`, the server exposes:

- Tools like `add_subscription`, `update_subscription`, `mark_payment_paid`, `export_data`, `import_data`
- Resources like `kessai://subscriptions`, `kessai://categories`, `kessai://settings`
- Prompt templates like `subscription_summary`, `spending_analysis`, `upcoming_payments`

## 5) Use CLI mode for quick checks

The same binary also supports direct CLI subcommands:

```bash
./target/release/kessai-mcp list
./target/release/kessai-mcp upcoming --days 14
./target/release/kessai-mcp export --output ./backup.json
```

## See also

- [How to run locally](./run-locally.md)
- [How to troubleshoot](./troubleshoot.md)
- [How to install](./install.md)
- [MCP and CLI](../reference/mcp-cli.md)
