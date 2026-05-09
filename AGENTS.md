# AGENTS.md - Kessai AI Agent Guidelines

> Guidelines for AI agents working on the Kessai codebase.

## Project Overview

Kessai is a local-first subscription tracker built with Tauri 2, React 19, TypeScript, Rust, and SQLite. The repo also includes browser/web and MCP/CLI surfaces through the Cargo workspace.

## Tech Stack

- Desktop: Tauri 2 with Rust commands in `src-tauri/`
- Frontend: React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui-style primitives
- State/forms: Zustand, React Hook Form, Zod
- Dates: dayjs
- Database: SQLite via `rusqlite` in `crates/kessai-core`
- Testing: Vitest, Testing Library, Playwright

## Key Directories

| Path | Purpose |
| --- | --- |
| `src-tauri/` | Desktop shell, Tauri commands, app setup |
| `crates/kessai-core/` | SQLite persistence and shared business logic |
| `crates/kessai-mcp/` | CLI and MCP server |
| `crates/kessai-web/` | Local web/API server |
| `src/components/` | React components |
| `src/components/ui/` | Reusable UI primitives |
| `src/pages/` | Main app pages/routes |
| `src/hooks/` | Shared React hooks |
| `src/stores/` | Zustand stores |
| `src/types/` | TypeScript domain types and schemas |
| `src/lib/` | Frontend utilities and API wrappers |
| `docs/` | Maintainer and user documentation |

## Design System

- Use the ASF Brutalist Glassmorphic direction: dark-first, high contrast, glass cards, crisp edges, and restrained motion.
- Use Space Grotesk, Outfit, and Space Mono. Do not introduce Inter.
- Use centered `Dialog` modals, not Sheet-style side panels.
- Use small/medium brutalist primary buttons rather than oversized rounded CTA patterns.
- Reserve `backdrop-filter` for small fixed or overlay surfaces, not large scrolling content.
- Prefer CSS transitions/animations. Do not add Framer Motion or heavy scroll animation libraries.

## Before Making Changes

1. Check the relevant code and docs before editing.
2. Run `pnpm check` to verify lint, typecheck, and formatting pass.
3. Run `pnpm test:run` when frontend behavior, hooks, stores, or components change.
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
- Use dayjs (not date-fns), Zustand (not Redux), Dialog (not Sheet)
- Use stable React keys; never use array indexes when domain IDs exist
- Avoid `as any`; keep Zod schemas and TypeScript types aligned
- Keep expensive derived values out of render hot paths
- Do not add Framer Motion, Inter, Redux, date-fns, or Sheet-style navigation unless explicitly approved
