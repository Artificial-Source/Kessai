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

## Design Principles

1. **Performance first**: No heavy animations, no backdrop-blur
2. **Dark-first**: Design for dark mode, ensure light mode works
3. **CSS animations only**: Use CSS transitions, avoid JS animation libraries
4. **Type safety**: Zod schemas → TypeScript types

## Common Commands

```bash
pnpm tauri dev        # Run app in dev mode
pnpm tauri build      # Build for production
pnpm test             # Run tests
pnpm lint             # Run ESLint
pnpm format           # Run Prettier
pnpm check            # Lint + typecheck + format check
```

## Code Style

- Components: PascalCase, one per file
- Files: kebab-case
- Use `@/` path alias for imports

## Don'ts

- Don't use Framer Motion (removed for performance)
- Don't use backdrop-filter blur (causes lag)
- Don't suppress TypeScript errors with `as any`
- Don't add heavy animations on scroll containers
- Don't use date-fns (use dayjs instead - smaller bundle)
- Don't use array index as React keys (use stable IDs)
- Don't forget useMemo for expensive calculations in hooks

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
