# Subby — Feature Backlog

> Prioritized based on competitive research (March 2026)

## Quick Wins

- [ ] **Search & Filter** — Search bar + filters on the subscriptions list
- [ ] **Notification Reminders** — System notifications for upcoming renewals via Tauri notifications API (1-day, 3-day, 7-day configurable)
- [ ] **Subscription Sorting** — Sort by price, name, next billing date, category

## Medium Effort

- [ ] **Spending Trends Chart** — Monthly/yearly line chart on dashboard showing spending over time (leverage existing payment history data)
- [ ] **Multi-Currency Support** — Track subscriptions in different currencies with conversion rates (Fixer API or similar)
- [ ] **Keyboard Shortcuts** — `N` new subscription, `/` search, `Esc` close modals, arrow keys to navigate
- [ ] **Free Trial Tracking** — Dedicated trial mode with countdown timer and expiry alerts (~50% of users forget to cancel trials)
- [ ] **Logo Auto-Fetch** — Auto-fetch service logos/favicons when adding a subscription (Wallos and Subs both have this)
- [ ] **Smart Notification Grouping** — Consolidate alerts ("3 subscriptions renew this week") to reduce notification fatigue

## Larger Features

- [ ] **Price Increase Detection** — Track historical price changes per subscription and alert on increases (almost no competitor does this well)
- [ ] **Subscription Health Score** — Computed metric based on cost vs category average, usage frequency, price trend
- [ ] **Household/Family Sharing** — Multi-user support for splitting shared subscriptions (Wallos has this, high community demand)
- [ ] **CSV/JSON Import from Competitors** — Import from Wallos, Bobby, spreadsheets to ease migration
- [ ] **Desktop Widgets** — System tray widget showing next payment and monthly total

## Polish / DX

- [ ] **Onboarding Flow** — First-launch walkthrough for new users
- [ ] **Multi-Language Support** — i18n framework (Wallos supports 21+ languages)
- [ ] **Drag-to-Reorder** — Reorder subscriptions and categories manually
