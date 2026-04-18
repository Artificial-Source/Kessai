# CLAUDE.md — Kessai Project Context

> This file provides context for Claude Code and other AI assistants.

## Project Summary

**Kessai** is a local-first desktop subscription tracker built with Tauri 2, React, TypeScript, and SQLite. It features a clean, performant UI with light/dark theme support.

**Status**: Post-MVP (v0.2.0)

## Tech Stack Quick Reference

- **Runtime**: Tauri 2.x (Rust backend)
- **Frontend**: React 19 + TypeScript + Vite 7
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **State**: Zustand (with useShallow for optimized selectors)
- **Database**: SQLite via rusqlite (kessai-core crate)
- **Forms**: React Hook Form + Zod
- **Dates**: dayjs (with plugins: isSameOrBefore, isSameOrAfter, isToday, isTomorrow, weekOfYear, isBetween)
- **Testing**: Vitest + Testing Library + Playwright (E2E)

## Key Directories

| Path                            | Purpose                                               |
| ------------------------------- | ----------------------------------------------------- |
| `src-tauri/`                    | Rust backend, Tauri config, inline database migrations |
| `src/components/`               | React components                                      |
| `src/components/ui/`            | shadcn/ui primitives                                  |
| `src/components/calendar/`      | Calendar page components                              |
| `src/components/dashboard/`     | Dashboard charts and stats                            |
| `src/components/categories/`    | Category management                                   |
| `src/components/subscriptions/` | Subscription CRUD                                     |
| `src/components/settings/`      | Settings components                                   |
| `src/components/layout/`        | Layout components (sidebar, app shell)                |
| `src/pages/`                    | Route-level page components                           |
| `src/hooks/`                    | Custom React hooks                                    |
| `src/stores/`                   | Zustand state stores                                  |
| `src/types/`                    | TypeScript type definitions with Zod                  |
| `src/lib/`                      | Utilities (database, currency, date, data-management) |
| `src/test/`                     | Test setup                                            |
| `crates/kessai-core/`            | Shared Rust business logic library                    |
| `crates/kessai-mcp/`             | MCP server + CLI binary                               |
| `docs/`                         | Project documentation                                 |

## MVP Features (Complete)

- [x] Subscription CRUD with multiple billing cycles
- [x] 9 default categories + custom categories
- [x] Dashboard with stats, donut chart, trend chart
- [x] Calendar with payment tracking (mark paid/skip)
- [x] Payment history in database
- [x] Theme switching (dark/light/system)
- [x] Currency selection (reflects everywhere)
- [x] Data export/import (JSON backup)
- [x] Code splitting (lazy-loaded pages)

## Post-MVP Features

- [x] Price history tracking (price_history table)
- [x] Subscription lifecycle states (trial, active, paused, pending_cancellation, grace_period, cancelled)
- [x] Trial end date tracking
- [x] Shared subscription splitting (shared_count)
- [x] Monthly budget setting
- [x] Payment card management
- [x] Logo management

## Database Tables

- `categories` - Default + custom categories
- `subscriptions` - User subscriptions
- `payments` - Payment history (paid/skipped)
- `settings` - User preferences (theme, currency, notifications)
- `payment_cards` - Payment card tracking
- `price_history` - Subscription price change history

## Design System — ASF Brutalist Glassmorphic

### Typography (3-font system)

- **Headings**: Space Grotesk (600, 700) — `font-[family-name:var(--font-heading)]`
- **Body/UI**: Outfit (400, 500, 600) — `font-[family-name:var(--font-sans)]`
- **Labels/Data**: Space Mono (400, 700) — `font-[family-name:var(--font-mono)]`

### Color Tokens (Dark Mode)

| Token | Value | Usage |
|-------|-------|-------|
| `--color-background` | `#020202` | Page background (deep black) |
| `--color-foreground` | `#f0f0f0` | Primary text |
| `--color-primary` | `#bf5af2` | Accent (Plasma Violet) |
| `--color-card` | `rgba(10,10,10,0.6)` | Card and overlay surfaces |
| `--color-border` | `rgba(255,255,255,0.06)` | Hairline borders |
| `--color-input` | `rgba(255,255,255,0.06)` | Input backgrounds |
| `--color-muted-foreground` | `#888888` | Secondary/tertiary text |
| `--color-destructive` | `#ef4444` | Error/danger states |
| `--color-surface` | `#0a0a0a` | Elevated surface bg |

### UI Patterns

- **Glass cards**: Semi-transparent bg + 1px hairline border + 12px radius
- **Grid background**: 40px grid pattern on main content area (`grid-bg` utility)
- **Sidebar**: Glass morphism bg, 2px violet left-border active state
- **Buttons (primary)**: Sharp 0px radius (brutalist sm/md), solid violet bg
- **Border radius**: sm/md = 0px (brutalist), lg/xl/2xl = 12px (cards)
- **Modals**: Centered Dialog (not Sheet/sidebar) — subscription form uses `max-w-2xl` (672px), category form uses `max-w-lg` (512px), confirmations use `max-w-md` (448px)
- **Badges**: Space Mono 10px uppercase with wide tracking

## Design Principles

1. **Dark-first**: Design for dark mode, ensure light mode works
2. **Glass morphism**: Reserve `backdrop-filter` for small fixed or overlay surfaces, not scrolling content
3. **CSS animations only**: Use CSS transitions, avoid JS animation libraries
4. **Type safety**: Zod schemas → TypeScript types

## Common Commands

```bash
pnpm tauri dev          # Run app in dev mode
pnpm tauri build        # Build for production
pnpm test               # Run tests
pnpm test:run           # Run tests once
pnpm test:coverage      # Run tests with coverage
pnpm lint               # Run ESLint
pnpm format             # Run Prettier
pnpm check              # Lint + typecheck + format check
cargo test --workspace  # Run Rust tests
cargo build -p kessai-mcp  # Build MCP server + CLI
pnpm test:e2e           # Run Playwright E2E tests
pnpm typecheck          # Run TypeScript type checking
pnpm start              # Alias for tauri dev
pnpm lint:fix           # Run ESLint with auto-fix
pnpm release            # Bump version, tag, push (triggers release build)
```

## Code Style

- Components: PascalCase, one per file
- Files: kebab-case
- Use `@/` path alias for imports

## Don'ts

- Don't use Framer Motion (removed for performance)
- Don't suppress TypeScript errors with `as any`
- Don't add heavy animations on scroll containers
- Don't use date-fns (use dayjs instead - smaller bundle)
- Don't use array index as React keys (use stable IDs)
- Don't forget useMemo for expensive calculations in hooks
- Don't use Sheet (slide-out sidebar) for dialogs — use centered Dialog modals
- Don't use Inter font — use the 3-font system (Space Grotesk / Outfit / Space Mono)

## Key Patterns

### Database Operations

```typescript
import { invoke } from '@tauri-apps/api/core'
const results = await invoke<T[]>('list_subscriptions')
await invoke('create_subscription', { data: newSub })
```

### Zustand Stores

```typescript
const { subscriptions, addSubscription } = useSubscriptionStore()
```

### Forms (React Hook Form + Zod)

```typescript
const form = useForm<SubscriptionFormData>({
  resolver: zodResolver(subscriptionFormSchema),
})
```

## Branching & Release Strategy

### Branch Model

- **`main`** — stable, always releasable. All PRs merge here. CI runs on every push and PR.
- **Feature branches** — short-lived branches for development. Create a PR to `main`, CI validates.

### Release & Auto-Update Flow

The app uses **Tauri's updater plugin** to deliver updates to installed instances via GitHub Releases.

1. `pnpm release` — runs quality gates (`pnpm check` + `pnpm test:run`), bumps version across `package.json` / `tauri.conf.json` / `Cargo.toml`, generates changelog, creates a `v*` tag, and pushes
2. GitHub Actions (`.github/workflows/release.yml`) detects the tag → builds signed installers for Linux, Windows, macOS (x86 + ARM) → **auto-publishes** a GitHub Release with updater artifacts
3. Installed apps check `https://github.com/Artificial-Source-Foundation/Kessai/releases/latest/download/latest.json` → detect new version → download & install

### Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Quality gates on PRs and `main` pushes |
| `.github/workflows/release.yml` | Multi-platform build + auto-publish on `v*` tags |
| `.release-it.json` | Version bumping, changelog, tag config |
| `scripts/sync-versions.js` | Keeps version in sync across package.json, tauri.conf.json, Cargo.toml |
| `src/stores/update-store.ts` | Frontend update state management |
| `src/components/settings/update-settings.tsx` | Update UI in settings |

### Required GitHub Secrets

- `TAURI_SIGNING_PRIVATE_KEY` — signs updater artifacts (required)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — key password (required)
- `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` — macOS code signing (optional)

## Data Storage

SQLite database stored in Tauri app data directory:

- Linux: `~/.local/share/com.asf.kessai/`
- macOS: `~/Library/Application Support/com.asf.kessai/`
- Windows: `%APPDATA%/com.asf.kessai/`
