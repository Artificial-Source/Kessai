# AGENTS.md - Kessai AI Agent Guidelines

> Guidelines for AI agents working on the Kessai codebase.

## Project Overview

Kessai is a local-first subscription tracker built with Tauri 2, React 19, TypeScript, Rust, and SQLite. It also includes browser/web and MCP/CLI surfaces through the Cargo workspace.

## Tech Stack

- **Runtime**: Tauri 2.x desktop app with Rust backend
- **Frontend**: React 19 + TypeScript + Vite 7
- **Styling**: Tailwind CSS 4 + shadcn/ui-style primitives
- **State**: Zustand
- **Database**: SQLite via `rusqlite` in `crates/kessai-core`
- **Forms**: React Hook Form + Zod
- **Dates**: dayjs
- **Testing**: Vitest + Testing Library + Playwright

## Key Directories

| Path | Purpose |
| --- | --- |
| `src-tauri/` | Tauri desktop backend, config, and app integration |
| `crates/kessai-core/` | Shared Rust business logic and persistence |
| `crates/kessai-mcp/` | MCP server and CLI binary |
| `crates/kessai-web/` | Local web API and SPA server |
| `src/components/` | React components |
| `src/components/ui/` | UI primitives |
| `src/pages/` | Route-level pages |
| `src/hooks/` | Custom React hooks |
| `src/stores/` | Zustand stores |
| `src/types/` | TypeScript types and Zod schemas |
| `src/lib/` | Frontend utilities and API wrappers |
| `docs/` | Public documentation |

## Design System

Use the ASF Brutalist Glassmorphic direction already present in the app.

- Design dark-first and verify light mode still works.
- Use the 3-font system: Space Grotesk for headings, Outfit for body/UI, Space Mono for labels and data.
- Prefer glass cards with semi-transparent surfaces, hairline borders, and 12px card radius.
- Keep small/medium primary buttons sharp and brutalist where the existing UI does so.
- Use centered Dialog modals, not Sheet/slide-out dialogs.
- Reserve `backdrop-filter` for small fixed or overlay surfaces, not scrolling content.
- Use CSS transitions and animations; do not add JS animation libraries.

## Before Making Changes

1. Check the relevant code and docs before editing.
2. Run `pnpm check` to verify lint, typecheck, and formatting pass.
3. Run `pnpm test:run` to ensure tests pass.
4. For Rust changes, also run `cargo test --workspace`.

## Branching & Workflow

- **`main`** is the stable branch. All work merges here via PRs.
- Create feature branches from `main` for any non-trivial work.
- CI (`.github/workflows/ci.yml`) runs automatically on PRs and `main` pushes.
- Never push directly to `main` without CI passing.

## Release Process

Releases are automated. Do not manually create GitHub Releases or tags.

1. Ensure `main` is clean and CI passes
2. Run `pnpm release` — this bumps versions, generates changelog, creates a `v*` tag, and pushes
3. GitHub Actions builds multi-platform installers and auto-publishes a GitHub Release
4. Installed apps auto-update via the Tauri updater plugin

Key constraints:
- `release-it` requires a clean working directory and being on `main`
- Version is synced across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` automatically
- Commits should follow [Conventional Commits](https://www.conventionalcommits.org/) for changelog generation

## CI/CD Pipeline

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | PRs, `main` pushes | Lint, typecheck, format, tests, audit |
| `release.yml` | `v*` tags | Build + sign + publish installers for all platforms |

## Code Quality Gates

Before any PR or release, these must pass:
- `pnpm lint` — ESLint
- `pnpm typecheck` — TypeScript strict mode
- `pnpm format --check` — Prettier
- `pnpm test:run` — Vitest unit/component tests
- `cargo test --workspace` — Rust tests

All of the above (except Rust) are bundled in `pnpm check`.

## Key Conventions

- Use Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)
- Components: PascalCase, one per file, kebab-case filenames
- Imports use `@/` path alias
- Use dayjs, not date-fns
- Use Zustand, not Redux
- Use stable IDs for React keys, not array indexes
- Avoid `as any`; model unknown data with schemas or narrower types
- Keep expensive derived values out of render hot paths
- Do not use Framer Motion or heavy animations on scroll containers
- Do not use Inter; keep the Space Grotesk / Outfit / Space Mono font system
