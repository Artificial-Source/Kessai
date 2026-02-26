# CLAUDE.md — Subby Project Context

> This file provides context for Claude Code and other AI assistants.

## Project Summary

**Subby** is a local-first desktop subscription tracker built with Tauri 2, React, TypeScript, and SQLite. It features a clean, performant UI with light/dark theme support.

**Status**: MVP Complete (v0.1.0)

## Tech Stack Quick Reference

- **Runtime**: Tauri 2.x (Rust backend)
- **Frontend**: React 19 + TypeScript + Vite 7
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **State**: Zustand (with useShallow for optimized selectors)
- **Database**: SQLite via tauri-plugin-sql
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
| `src/pages/`                    | Route-level page components                           |
| `src/hooks/`                    | Custom React hooks                                    |
| `src/stores/`                   | Zustand state stores                                  |
| `src/types/`                    | TypeScript type definitions with Zod                  |
| `src/lib/`                      | Utilities (database, currency, date, data-management) |
| `src/test/`                     | Test setup                                            |
| `crates/subby-core/`            | Shared Rust business logic library                    |
| `crates/subby-mcp/`             | MCP server + CLI binary                               |
| `packages/discord-bot/`         | Discord reminder bot                                  |
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

## Database Tables

- `categories` - Default + custom categories
- `subscriptions` - User subscriptions
- `payments` - Payment history (paid/skipped)
- `settings` - User preferences (theme, currency, notifications)
- `payment_cards` - Payment card tracking

## Design System — ASF Brutalist Glassmorphic

### Typography (3-font system)

- **Headings**: Space Grotesk (600, 700) — `font-[family-name:var(--font-heading)]`
- **Body/UI**: Outfit (400, 500, 600) — `font-[family-name:var(--font-sans)]`
- **Labels/Data**: Space Mono (400, 600) — `font-[family-name:var(--font-mono)]`

### Color Tokens (Dark Mode)

| Token | Value | Usage |
|-------|-------|-------|
| `--color-background` | `#020202` | Page background (deep black) |
| `--color-foreground` | `#f0f0f0` | Primary text |
| `--color-primary` | `#bf5af2` | Accent (Plasma Violet) |
| `--color-card` | `rgba(10,10,10,0.6)` | Glass card surfaces (with blur) |
| `--color-border` | `rgba(255,255,255,0.06)` | Hairline borders |
| `--color-input` | `rgba(255,255,255,0.06)` | Input backgrounds |
| `--color-muted-foreground` | `#888888` | Secondary/tertiary text |
| `--color-destructive` | `#ef4444` | Error/danger states |
| `--color-surface` | `#0a0a0a` | Elevated surface bg |

### UI Patterns

- **Glass cards**: Semi-transparent bg + backdrop-blur(12px) + 1px hairline border + 12px radius
- **Grid background**: 40px grid pattern on main content area (`grid-bg` utility)
- **Sidebar**: Glass morphism bg, 2px violet left-border active state
- **Buttons (primary)**: Sharp 0px radius (brutalist sm/md), solid violet bg
- **Border radius**: sm/md = 0px (brutalist), lg/xl/2xl = 12px (cards)
- **Modals**: Centered Dialog (not Sheet/sidebar) — subscription form uses `max-w-2xl` (672px), category form uses `max-w-lg` (512px), confirmations use `max-w-md` (448px)
- **Badges**: Space Mono 10px uppercase with wide tracking

## Design Principles

1. **Dark-first**: Design for dark mode, ensure light mode works
2. **Glass morphism**: Use `backdrop-filter: blur(12px)` on glass elements
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
cargo build -p subby-mcp  # Build MCP server + CLI
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
import { db } from '@/lib/database'
const results = await db.select<T[]>('SELECT * FROM table')
await db.execute('INSERT INTO table VALUES (?)', [value])
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

## Data Storage

SQLite database stored in Tauri app data directory:

- Linux: `~/.local/share/subby/`
- macOS: `~/Library/Application Support/subby/`
- Windows: `%APPDATA%/subby/`
