# Kessai documentation

Kessai is a local-first subscription tracker built around a Tauri desktop app, a shared Rust core, an optional local web server, and an MCP/CLI binary. The checked-in entrypoints are `src-tauri/src/main.rs` for desktop, `crates/kessai-web/src/main.rs` for web mode, `crates/kessai-mcp/src/main.rs` for MCP/CLI, and `src/main.tsx` for the React frontend.

This docs set is organized with a Diataxis split so each page answers a different kind of question.

## Who these docs are for

- **People using Kessai**: start with the tutorials and task-focused how-to pages.
- **Contributors and maintainers**: use the reference and explanation sections to line up docs with current source.
- **Integrators**: use the reference pages for the desktop IPC surface, the web API, and the MCP/CLI binary.

## How the docs are organized

| Section | Use it when you want to... | Start here |
| --- | --- | --- |
| Tutorials | learn the product by doing a complete workflow | [First run](./tutorials/first-run.md) |
| How-to | complete a specific task | [Install Kessai](./how-to/install.md) |
| Reference | look up exact commands, endpoints, files, or settings | [Reference overview](./reference/overview.md) |
| Explanation | understand how and why the system is shaped this way | [Architecture](./explanation/architecture.md) |

## Recommended reading order

1. Read one tutorial: [First run](./tutorials/first-run.md).
2. Use the relevant task page in [How-to](#how-to-guides).
3. Use [Reference overview](./reference/overview.md) when you need exact names, paths, or payloads.
4. Read the explanation pages once you want the bigger picture behind the current codebase.

## Surface map

| Surface | What it is | Primary docs |
| --- | --- | --- |
| Desktop | Installed Tauri app with native dialogs, tray, notifications, updater, and local SQLite storage | [Install](./how-to/install.md), [Desktop commands](./reference/desktop-commands.md) |
| Web | Local Axum server that serves the same frontend plus a REST API under `/api` | [Run locally](./how-to/run-locally.md), [Web API](./reference/web-api.md) |
| MCP/CLI | `kessai-mcp` binary for terminal commands and stdio MCP server mode | [Use MCP server](./how-to/use-mcp-server.md), [MCP and CLI reference](./reference/mcp-cli.md) |

## Tutorials

- [Tutorial: First Run (Desktop)](./tutorials/first-run.md)
- [Tutorial: Payment Tracking and Backups](./tutorials/payment-tracking-and-backups.md)

## How-to guides

- [How to install Kessai](./how-to/install.md)
- [How to configure Kessai](./how-to/configure.md)
- [How to run Kessai locally](./how-to/run-locally.md)
- [How to test Kessai](./how-to/test.md)
- [How to use the Kessai MCP server](./how-to/use-mcp-server.md)
- [How to troubleshoot Kessai](./how-to/troubleshoot.md)
- [How to build and release](./how-to/build-and-release.md)
- [How to add a migration](./how-to/add-a-migration.md)

## Reference

- [Reference overview](./reference/overview.md)
- [Commands and scripts](./reference/commands-and-scripts.md)
- [Configuration](./reference/configuration.md)
- [Environment variables](./reference/environment-variables.md)
- [Filesystem](./reference/filesystem.md)
- [Desktop commands](./reference/desktop-commands.md)
- [Web API](./reference/web-api.md)
- [MCP and CLI](./reference/mcp-cli.md)
- [Backup format](./reference/backup-format.md)

## Explanation

- [Architecture](./explanation/architecture.md)
- [Concepts](./explanation/concepts.md)
- [Design decisions](./explanation/design-decisions.md)
- [Security and privacy](./explanation/security-and-privacy.md)

## See also

- [Repository README](../README.md)
- [Docs manifest](./_meta.md)
