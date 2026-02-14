# Architecture Overview

Subby is a local-first desktop app built with a Tauri backend and React frontend.

## Stack

- Runtime: Tauri 2 (Rust)
- Frontend: React 19 + TypeScript + Vite
- Styling: Tailwind CSS + shadcn/ui
- State: Zustand
- Data: SQLite via `tauri-plugin-sql`
- Validation: Zod + React Hook Form

## High-Level Flow

1. React UI triggers store actions
2. Stores use typed DB helpers in `src/lib/database.ts`
3. SQL executes through Tauri plugin on local SQLite
4. Dashboard and calendar derive metrics from subscriptions + payments

## Project Layout

- `src/components/`: UI features by domain
- `src/pages/`: route-level pages
- `src/stores/`: Zustand stores
- `src/lib/`: shared utilities and data logic
- `src-tauri/`: Rust app shell and native config

## App Data

- Linux: `~/.local/share/subby/`
- macOS: `~/Library/Application Support/subby/`
- Windows: `%APPDATA%/subby/`

## Related Docs

- Database schema: `docs/architecture/database-schema.md`
- State model: `docs/architecture/state-management.md`
- Security model: `docs/architecture/security.md`
