# Subby Architecture

This document provides an overview of Subby's technical architecture for contributors.

## Overview

Subby is a desktop application built with Tauri 2, which combines a Rust backend with a React frontend. All data is stored locally in SQLite.

```
┌─────────────────────────────────────────────────────────┐
│                    Desktop Window                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │              React Frontend (WebView)              │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │ │
│  │  │  Zustand │  │  React   │  │  Radix UI +      │ │ │
│  │  │  Stores  │  │  Router  │  │  Tailwind CSS    │ │ │
│  │  └────┬─────┘  └──────────┘  └──────────────────┘ │ │
│  │       │                                            │ │
│  │       ▼ Tauri IPC                                 │ │
│  └───────┼────────────────────────────────────────────┘ │
│          │                                              │
│  ┌───────┴────────────────────────────────────────────┐ │
│  │              Rust Backend (Tauri Core)             │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │ │
│  │  │  Tauri   │  │  SQLite  │  │  Image           │ │ │
│  │  │  Plugins │  │  via SQL │  │  Processing      │ │ │
│  │  │          │  │  Plugin  │  │  (Rust)          │ │ │
│  │  └──────────┘  └──────────┘  └──────────────────┘ │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Frontend Stack

### Core Technologies

| Layer         | Technology            | Purpose                        |
| ------------- | --------------------- | ------------------------------ |
| Runtime       | Tauri WebView         | Native window with web content |
| Framework     | React 19              | UI components and state        |
| State         | Zustand               | Global state management        |
| Routing       | React Router 7        | Page navigation                |
| Styling       | Tailwind CSS 4        | Utility-first CSS              |
| UI Components | Radix UI + shadcn/ui  | Accessible primitives          |
| Forms         | React Hook Form + Zod | Form handling & validation     |

### Directory Structure

```
src/
├── components/           # React components
│   ├── ui/              # shadcn/ui primitives (Button, Dialog, etc.)
│   ├── calendar/        # Calendar page components
│   ├── dashboard/       # Dashboard charts and stats
│   ├── subscriptions/   # Subscription CRUD components
│   ├── categories/      # Category management
│   ├── settings/        # Settings page components
│   └── layout/          # App shell and sidebar
├── hooks/               # Custom React hooks
├── stores/              # Zustand state stores
├── pages/               # Page-level components
├── types/               # TypeScript types + Zod schemas
└── lib/                 # Utilities (database, currency, dates)
```

### State Management

Zustand stores manage global state:

- **`subscription-store`**: Subscriptions CRUD with optimistic updates
- **`category-store`**: Category management
- **`payment-store`**: Payment history tracking
- **`settings-store`**: User preferences (theme, currency)
- **`ui-store`**: UI state (dialogs, modals)

Each store follows a consistent pattern:

```typescript
interface Store {
  data: T[]
  isLoading: boolean
  error: string | null
  fetch: () => Promise<void>
  add: (item: T) => Promise<void>
  update: (id: string, updates: Partial<T>) => Promise<void>
  remove: (id: string) => Promise<void>
}
```

## Backend Stack

### Tauri Plugins

| Plugin                      | Purpose                |
| --------------------------- | ---------------------- |
| `tauri-plugin-sql`          | SQLite database access |
| `tauri-plugin-fs`           | File system operations |
| `tauri-plugin-dialog`       | Native file dialogs    |
| `tauri-plugin-notification` | Desktop notifications  |
| `tauri-plugin-opener`       | URL/file opening       |

### Custom Commands

The Rust backend exposes custom commands for logo management:

- `save_logo` — Opens an image, resizes to 256x256, saves as WebP
- `get_logo_base64` — Reads a logo file and returns it as a base64 data URL
- `delete_logo` — Deletes a logo file by filename

See [Backend API](./backend-api.md) for full command documentation.

### Database Schema

SQLite with 4 main tables:

```sql
-- Core data
subscriptions    -- User subscriptions
categories       -- Default + custom categories
payments         -- Payment history (paid/skipped)
settings         -- User preferences (singleton row)
payment_cards    -- Payment card tracking
```

## Data Flow

### Subscription CRUD

```
User Action
    │
    ▼
React Component
    │
    ▼
Zustand Store (optimistic update)
    │
    ▼
Tauri IPC → SQL Plugin → SQLite
    │
    ▼
Rollback on error / Confirm on success
```

### Theme Switching

```
User clicks theme button
    │
    ▼
settings-store.setTheme()
    │
    ▼
ThemeProvider updates DOM class
    │
    ▼
CSS variables switch colors
    │
    ▼
SQLite persists preference
```

## Performance Optimizations

1. **Code Splitting**: Lazy-loaded pages via `React.lazy()`
2. **Memoization**: `React.memo()` on frequently re-rendered components
3. **Optimized Selectors**: Zustand `useShallow` for store subscriptions
4. **Database Indices**: On `next_payment_date`, `category_id`
5. **No Heavy Animations**: CSS transitions only, no Framer Motion

## Security Model

- **Local-first**: All data stored on user's device
- **No telemetry**: Zero data collection
- **Content Security Policy**: Restricts resource loading
- **Input validation**: Zod schemas on all user input
- **File validation**: Strict filename validation for logo uploads

## Testing Strategy

| Type      | Tool            | Scope                    |
| --------- | --------------- | ------------------------ |
| Unit      | Vitest          | Utilities, stores, hooks |
| Component | Testing Library | React components         |
| E2E       | Playwright      | Full user flows          |

## Build & Release

- **Dev**: `pnpm tauri dev` — Hot-reloading development
- **Build**: `pnpm tauri build` — Production binaries
- **Release**: Tag with `v*` and build locally, or set up CI/CD as needed
