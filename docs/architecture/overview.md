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

## Design System

Subby uses an ASF brutalist glassmorphic design language:

- **Typography**: 3-font system — Space Grotesk (headings), Outfit (body/UI), Space Mono (labels/data)
- **Colors**: Void black (#0a0a0a) background, Plasma Violet (#bf5af2) accent, glass-transparent surfaces
- **Cards**: `rgba(255,255,255,0.02)` background with `rgba(255,255,255,0.06)` hairline borders
- **Modals**: Centered Dialog modals (not slide-out sheets) with size tiers: `max-w-2xl` (forms), `max-w-lg` (medium), `max-w-md` (confirmations)
- **Buttons**: Sharp 0px radius for primary actions (brutalist), rounded for secondary

Fonts are loaded via Google Fonts in `index.html` and mapped to CSS custom properties in `src/styles/globals.css`.

## Related Docs

- Database schema: `docs/architecture/database-schema.md`
- State model: `docs/architecture/state-management.md`
- Security model: `docs/architecture/security.md`
