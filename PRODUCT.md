# Product

<!-- impeccable:product-schema 1 -->

<!-- Written by an autonomous design agent from the release brief, README, AGENTS.md, and the codebase. No live interview took place; facts below come from those sources. Items marked [inferred] are reasonable readings that a maintainer should confirm. -->

## Platform

web

The visual surface is one React SPA rendered in two hosts: the Tauri 2 desktop app (primary; frameless window with a custom titlebar, minimum 900×600) and a browser pointed at Kessai's local web server (secondary; standalone on the same machine, or remotely over a private Tailscale tailnet, which includes phones). The CLI and MCP server are not visual surfaces.

## Users

Privacy-conscious individuals and households who pay for a handful to a few dozen recurring subscriptions and want one honest place to see them. They open Kessai to check what is due, to log a payment, to catch a free trial before it bills, or to decide what to cancel. Sessions are short and task-shaped; the same person may check renewals from their phone over Tailscale and do bulk cleanup on the desktop. [inferred: households share one machine or one tailnet rather than separate accounts; there are no accounts.]

## Product Purpose

Kessai (決済, "payment") answers "Know where your money flows." It tracks recurring subscriptions locally, shows monthly and yearly spend against an optional budget, lays renewals out on a calendar, and warns before trials and renewals bill. Success means the user can answer "what am I paying, what's next, and is anything about to surprise me" in seconds, and can act on the answer (mark paid, skip, pause, cancel) without leaving the screen they are on.

## Positioning

Local-first by construction: no cloud, no accounts, no telemetry; the data is a SQLite file on the user's machine that they can export, back up, and restore. Remote access is opt-in and private (loopback server exposed only through the user's own Tailscale tailnet with an access key). Kessai never converts currencies with live FX; totals use the display currency and say so.

## Operating Context

- Desktop: a small always-available window, often half-screen; keyboard shortcuts (`Cmd/Ctrl+K` palette, `N` new, `1`–`4` navigation, `?` help, calendar month keys) and a system-tray badge for due items. Native notifications remind before renewals.
- Browser: same UI served by `kessai-web`; touch-first on phones (390px), tablet around 820px.
- Rituals: monthly review of upcoming renewals, logging paid/skipped payments from the calendar or list, importing a bank statement or a Wallos/Kessai JSON export, periodic backups.

## Capabilities and Constraints

- Subscriptions: name, amount, currency, billing cycle (weekly, monthly, quarterly, yearly, custom), next payment date, category, tags, payment card, logo (upload or fetched), notes, shared-cost split, pin.
- Lifecycle: trial, active, paused, pending cancellation, grace period, cancelled (with reason); trials show a countdown.
- Payments: mark paid or skip per occurrence, from the calendar day panel or the subscription list.
- Organization: categories (color + icon), tags, payment cards.
- Views: dashboard (totals, budget, trials, category breakdown, upcoming), subscriptions (grid, list, bento; search, sort, category/tag filters, cancelled section), calendar (month grid + day panel), settings.
- Data: CSV / bank statement import wizard, Kessai JSON and Wallos import, JSON export/backup and restore, diagnostic logs.
- Settings: theme (dark default, light, system), display currency, monthly budget, motion (reduce motion, transitions, hover effects, speed), reminders (days before, time, preview, test), private web access, autostart (desktop), updates (desktop), about.
- Constraints: Tauri 2 + React 19 + TypeScript strict + Tailwind 4; Zustand stores and hook APIs are a stable contract; no new UI libraries, no Framer Motion, no Inter, no side-sheet navigation; desktop runtime (WebKitGTK on Linux) disables blur, shadows, gradients, and most animation for performance.
- Terminology: "subscription", "renewal", "payment", "trial", "billing cycle", "display currency". Kessai does not convert currencies; amounts in other currencies are labeled, not converted.

## Brand Commitments

- Name: Kessai, with the kanji 決済 as provenance, and the tagline "Know where your money flows."
- Identity: the ASF Brutalist Glassmorphic direction already shipped in the app (dark-first, high contrast, glass cards, crisp edges, restrained motion), the Kessai logo mark in `src/assets/kessai-logo.svg`, and self-hosted Space Grotesk, Outfit, and Space Mono.
- Voice: plain, factual, calm about money. States what is true ("Kessai does not convert currencies") rather than reassuring or upselling.

## Evidence on Hand

- README feature list and screenshots in `docs/screenshots/`.
- Subscription templates with real service names and logos in `src/data/subscription-templates.ts` and `public/`.
- No testimonials, user counts, press, benchmarks, or pricing exist. Kessai is free and MIT-licensed; do not invent social proof.

## Product Principles

1. Truth over comfort: totals, budgets, and currency notes must be exactly right and say what they exclude.
2. Act where you look: every view that shows a due payment lets you resolve it in place.
3. Local and private by default: nothing implies a cloud, an account, or sync that does not exist.
4. Fast to scan, quiet to live with: the app is opened many times for a few seconds each; density and calm beat spectacle.
5. One product across hosts: desktop and browser render the same UI; host-only controls (window buttons, autostart, updater) appear only where they work.

## Accessibility & Inclusion

Target WCAG 2.2 AA in both themes: text contrast ≥4.5:1 on glass surfaces, visible focus on every interactive element, full keyboard operation (shortcuts are accelerators, never the only path), touch targets ≥44px on phone layouts, and motion that honors both the OS reduced-motion preference and Kessai's own motion settings.
