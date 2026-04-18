# Reference overview

Use this section when you need exact names, paths, commands, or payloads. The source of truth is the checked-in code: desktop IPC commands live in `src-tauri/src/lib.rs`, REST routes in `crates/kessai-web/src/routes.rs`, CLI and MCP behavior in `crates/kessai-mcp/src/cli.rs` and `crates/kessai-mcp/src/mcp.rs`, and frontend transport selection in `src/lib/api.ts`.

## What this section covers

| Page | What it answers |
| --- | --- |
| [Commands and scripts](./commands-and-scripts.md) | Which repo commands exist and what they run |
| [Configuration](./configuration.md) | Which checked-in config files shape builds, runtime, quality gates, and releases |
| [Environment variables](./environment-variables.md) | Which env-driven behaviors are currently wired into the repo |
| [Filesystem](./filesystem.md) | Where Kessai stores databases, logos, logs, binaries, and browser-side caches |
| [Desktop commands](./desktop-commands.md) | Which Tauri IPC commands the desktop app exposes |
| [Web API](./web-api.md) | Which `/api/*` endpoints the local web server exposes |
| [MCP and CLI](./mcp-cli.md) | Which `kessai-mcp` modes, subcommands, tools, resources, and prompts exist |
| [Backup format](./backup-format.md) | What the exported JSON backup contains and how import behaves |

## Surface boundaries

| Surface | Entry point | Transport | Use this reference page |
| --- | --- | --- | --- |
| Desktop | `src-tauri/src/main.rs` → `kessai_lib::run()` | Tauri IPC | [Desktop commands](./desktop-commands.md) |
| Web | `crates/kessai-web/src/main.rs` | HTTP + JSON under `/api` | [Web API](./web-api.md) |
| MCP/CLI | `crates/kessai-mcp/src/main.rs` | Clap CLI or stdio MCP | [MCP and CLI](./mcp-cli.md) |

The React app in `src/` is shared between desktop and web. `src/lib/api.ts` decides whether a call goes through Tauri IPC or the REST API, so the UI usually talks to one logical command surface even though the transport differs.

## Practical lookup order

1. Start with [Commands and scripts](./commands-and-scripts.md) if you are running the repo locally.
2. Use [Desktop commands](./desktop-commands.md) or [Web API](./web-api.md) if you are tracing a frontend action into the backend.
3. Use [MCP and CLI](./mcp-cli.md) if you are integrating from a terminal or MCP client.
4. Use [Filesystem](./filesystem.md) and [Backup format](./backup-format.md) for data portability and debugging.

## See also

- [How to run Kessai locally](../how-to/run-locally.md)
- [Architecture](../explanation/architecture.md)
- [Concepts](../explanation/concepts.md)
