# Kessai docs manifest

This file is the public docs manifest for the final Diataxis set under `docs/`. Every page below is part of the intended public documentation surface.

## Landing page

| Page | Why it exists |
| --- | --- |
| [`docs/index.md`](./index.md) | Top-level navigation for the public docs site, including audience guidance, Diataxis split, and reading order |
| [`docs/_meta.md`](./_meta.md) | This manifest: a quick inventory of the final docs set and the purpose of each page |

## Tutorials

| Page | Why it exists |
| --- | --- |
| [`docs/tutorials/first-run.md`](./tutorials/first-run.md) | Walks a new user through the first complete desktop session |
| [`docs/tutorials/payment-tracking-and-backups.md`](./tutorials/payment-tracking-and-backups.md) | Teaches the recurring workflow of tracking payments, exporting, and restoring data |

## How-to guides

| Page | Why it exists |
| --- | --- |
| [`docs/how-to/install.md`](./how-to/install.md) | Fast path to a working install for desktop and MCP/CLI users |
| [`docs/how-to/configure.md`](./how-to/configure.md) | Task guide for settings, notifications, cards, tags, and backup controls |
| [`docs/how-to/run-locally.md`](./how-to/run-locally.md) | Task guide for desktop dev mode, browser mode, web backend, and local CLI/MCP runs |
| [`docs/how-to/test.md`](./how-to/test.md) | Task guide for quality gates and test commands |
| [`docs/how-to/use-mcp-server.md`](./how-to/use-mcp-server.md) | Task guide for building, running, and wiring the MCP server into a client |
| [`docs/how-to/troubleshoot.md`](./how-to/troubleshoot.md) | Task guide for the most common local problems across desktop, web, and MCP modes |
| [`docs/how-to/build-and-release.md`](./how-to/build-and-release.md) | Task guide for local builds and the checked-in release flow |
| [`docs/how-to/add-a-migration.md`](./how-to/add-a-migration.md) | Maintainer guide for adding and validating migrations in `kessai-core` |

## Reference

| Page | Why it exists |
| --- | --- |
| [`docs/reference/overview.md`](./reference/overview.md) | Entry page for factual lookup docs and surface boundaries |
| [`docs/reference/commands-and-scripts.md`](./reference/commands-and-scripts.md) | Lists confirmed package scripts, Cargo commands, and helper scripts |
| [`docs/reference/configuration.md`](./reference/configuration.md) | Summarizes the checked-in config files that shape runtime and release behavior |
| [`docs/reference/environment-variables.md`](./reference/environment-variables.md) | Lists the repo's real env-driven behavior and removes stale legacy references |
| [`docs/reference/filesystem.md`](./reference/filesystem.md) | Documents where desktop, web, MCP, and browser-side data is stored |
| [`docs/reference/desktop-commands.md`](./reference/desktop-commands.md) | Complete grouped reference for the desktop Tauri IPC surface |
| [`docs/reference/web-api.md`](./reference/web-api.md) | Complete grouped reference for the local web server's `/api/*` routes |
| [`docs/reference/mcp-cli.md`](./reference/mcp-cli.md) | Reference for `kessai-mcp` CLI mode, MCP server mode, tools, resources, and prompts |
| [`docs/reference/backup-format.md`](./reference/backup-format.md) | Source-grounded description of the versioned backup JSON format and import behavior |

## Explanation

| Page | Why it exists |
| --- | --- |
| [`docs/explanation/architecture.md`](./explanation/architecture.md) | Explains how the desktop app, web server, MCP/CLI binary, shared core, and frontend fit together |
| [`docs/explanation/concepts.md`](./explanation/concepts.md) | Explains the key domain concepts used across the codebase and UI |
| [`docs/explanation/design-decisions.md`](./explanation/design-decisions.md) | Explains why the repo is structured around a shared core, one frontend, local-first storage, and GitHub-based releases |
| [`docs/explanation/security-and-privacy.md`](./explanation/security-and-privacy.md) | Explains actual trust boundaries, local storage behavior, and the repo's real network touchpoints |

## Non-page assets kept on purpose

| Path | Why it exists |
| --- | --- |
| `docs/screenshots/` | Shared screenshots and assets used by the public docs and repository README |

## Cleanup policy applied for this milestone

Legacy entrypoints, stale reference pages, old architecture/reference splits, and internal planning files were removed from `docs/` so the public docs tree now centers on:

- tutorials
- how-to guides
- reference
- explanation
- this manifest and the docs index
