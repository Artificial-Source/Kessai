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

| Path                  | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `src-tauri/`          | Desktop shell, Tauri commands, app setup     |
| `crates/kessai-core/` | SQLite persistence and shared business logic |
| `crates/kessai-mcp/`  | CLI and MCP server                           |
| `crates/kessai-web/`  | Local web/API server                         |
| `src/components/`     | React components                             |
| `src/components/ui/`  | Reusable UI primitives                       |
| `src/pages/`          | Main app pages/routes                        |
| `src/hooks/`          | Shared React hooks                           |
| `src/stores/`         | Zustand stores                               |
| `src/types/`          | TypeScript domain types and schemas          |
| `src/lib/`            | Frontend utilities and API wrappers          |
| `docs/`               | Maintainer and user documentation            |

## Design System

- Follow [PRODUCT.md](PRODUCT.md) for product scope, terminology, and host boundaries, and [DESIGN.md](DESIGN.md) for visual tokens, typography, primitives, responsive behavior, and accessibility rules.
- Reuse the shared UI primitives rather than introducing parallel styles or component conventions.
- Honor both themes, visible keyboard focus, phone touch targets, and reduced motion from either the OS preference or app setting.
- Prefer restrained CSS transitions; reserve expensive blur effects for the small surfaces allowed by the design system.

## Before Making Changes

1. Check the relevant code and docs before editing.
2. Run `pnpm check` to verify lint, typecheck, and formatting pass.
3. Run `pnpm test:run` when frontend behavior, hooks, stores, or components change.
4. For Rust changes, also run `cargo test --locked --workspace`.

## Git Workflow

- Work directly on **`main`** unless a separate branch is explicitly requested.
- Keep history linear, use Conventional Commits, and push validated changes to `main`.
- CI (`.github/workflows/ci.yml`) runs on `main`, `release/**`, and pull requests.

## Release Process

Releases are automated. Do not manually create GitHub Releases or tags.

1. Ensure `main` is clean and CI passes
2. Run `pnpm release` — this bumps versions, generates changelog, creates a `v*` tag, and pushes
3. GitHub Actions builds into a draft, verifies the complete artifact set, then publishes once
4. Installed desktop apps can check for updates through the Tauri updater plugin

Key constraints:

- `release-it` requires a clean working directory and being on `main`
- Version is synced across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` automatically
- Commits should follow [Conventional Commits](https://www.conventionalcommits.org/) for changelog generation

For versions and changelog already committed on a release branch, do not run the normal bump flow. Follow [Releasing a pre-staged version](docs/how-to/build-and-release.md#releasing-a-pre-staged-version-release-branch), including `--no-increment --no-plugins`.

## CI/CD Pipeline

| Workflow      | Trigger                                            | Purpose                                                                         |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ci.yml`      | `main` / `release/**` pushes, PRs, release call    | Frontend gates, installer tests, real-web smoke, Rust format/Clippy/tests/audit |
| `release.yml` | Stable `vX.Y.Z` tags or dispatch with existing tag | Validate tag, run CI, build/sign draft artifacts, verify, then publish          |

## Code Quality Gates

Before pushing or releasing, these must pass:

- `pnpm lint` — ESLint
- `pnpm typecheck` — TypeScript strict mode
- `pnpm format:check` — Prettier for frontend source
- `pnpm test:run` — Vitest unit/component tests
- `cargo test --locked --workspace` — Rust tests
- `pnpm test:e2e:web-smoke` — real-web Playwright smoke suite on an isolated database

`pnpm check` bundles lint, typecheck, and frontend formatting only; tests are separate.

## Key Conventions

- Use Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)
- Components: PascalCase, one per file, kebab-case filenames
- Imports use `@/` path alias
- Use dayjs (not date-fns), Zustand (not Redux), Dialog (not Sheet)
- Use stable React keys; never use array indexes when domain IDs exist
- Avoid `as any`; keep Zod schemas and TypeScript types aligned
- Keep expensive derived values out of render hot paths
- Keep dependency and navigation choices aligned with the documented product and design constraints.
