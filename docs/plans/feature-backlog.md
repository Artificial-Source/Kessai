# Feature Backlog

> Competitive research conducted 2026-02-26. Prioritized by impact and feasibility for a local-first desktop app (Tauri + SQLite).

## High Impact — Phase 1

### 1. Free Trial Tracking with Countdown
- Add "trial" lifecycle status to subscriptions
- Trial expiry date field with countdown display on cards/dashboard
- Escalating notification schedule: 7 days, 3 days, 1 day, day-of
- Dashboard widget: "Trials expiring soon"
- **Gap**: Almost no competitor does this well. Huge user pain point.

### 2. Price Change History & Detection
- Log price changes over time per subscription
- Price history timeline view in subscription detail
- "Price hikes" summary view — surface subscriptions that increased
- Visual indicator (badge/icon) on cards when price changed
- **Gap**: Only Subtrack (iOS) offers this. Can build on existing `payments` table.

### 3. Shared/Family Subscription Splitting
- "Shared with" field on subscriptions — add members and split %
- Per-person cost calculation displayed on cards
- Dashboard stat: "Your share" vs "Total cost"
- Filter/group view: shared vs personal subscriptions
- **Gap**: No competitor handles this properly.

### 4. Subscription Lifecycle States
- Extend status beyond active/cancelled: Trial → Active → Paused → Pending Cancellation → Grace Period → Cancelled
- Visual state indicators (color-coded badges)
- State transition tracking with dates
- Filter subscriptions by lifecycle state
- **Gap**: Nobody tracks the full lifecycle.

### 5. Budget Ceiling with Visual Tracker
- Set monthly subscription budget target in settings
- Progress bar/gauge on dashboard showing current vs limit
- Alert/warning when approaching threshold (80%, 100%)
- Breakdown: how much budget remains, projected overage
- **Gap**: Rare in manual-entry apps. Subly and PocketGuard do versions.

### 6. Annual Cost Projection & "What If" Simulator
- Projected 12-month cost based on current active subscriptions
- "What if I cancel X?" simulator — select subscriptions to see savings impact
- Compare current year vs projected, year-over-year trend
- **Gap**: Lunch Money does basic projection but nobody does the cancellation simulator.

### 7. Subscription Templates & Logo Library
- Pre-built list of 100+ common services (Netflix, Spotify, etc.)
- Auto-fill name, logo, default category, typical pricing, billing URL
- Search/filter templates during subscription creation
- Community-contributed template suggestions
- **Gap**: Subtrack has 300+ templates, Wallos auto-fetches logos. Dramatically improves onboarding.

## Medium Impact — Phase 2

### 8. ICS Calendar Export
- Generate `.ics` files for subscription renewal dates
- Export all or selected subscriptions
- Import into Google Calendar, Outlook, Apple Calendar
- Re-export on changes (or provide subscribable URL via MCP server)

### 9. Tagging System
- Flexible user-defined tags per subscription
- Preset suggestions: "essential", "can cancel", "tax deductible", "work expense", "shared"
- Filter/group subscriptions by tag
- Tag-based analytics (spending by tag)

### 10. Cancellation Guides
- Per-subscription fields: cancellation URL, method (phone/web/email/chat), notice period, contract end date, notes
- "How to cancel" quick-access button on subscription cards
- Reminder before notice period deadline

### 11. Income/Salary Awareness
- Set income amount and pay dates in settings
- Show subscriptions relative to pay periods
- "Subscription burden" as % of income
- Cash flow view: income in vs subscriptions out per period

### 12. Webhook/External Notifications
- Discord integration (extend existing bot)
- Slack, Telegram webhook support
- Generic webhook for custom integrations
- Weekly digest summary push

### 13. Payment Card Grouping & Analytics
- Build on existing `payment_cards` table
- Subscriptions grouped by card view
- Total spend per card
- "What happens if I cancel this card?" impact view

## Competitive Context

| Dimension | Market Leader | Subby Position |
|-----------|--------------|----------------|
| Auto-detection | Rocket Money, Trim | Manual entry (privacy advantage) |
| Bill negotiation | Rocket Money, Pine AI | Out of scope (local-first) |
| Analytics | Monarch, Copilot | Dashboard with stats, charts |
| Calendar | Monarch, Simplifi | Calendar + mark paid/skip |
| Privacy/local-first | Bobby, Wallos | Full local SQLite |
| Desktop-native | **Nobody** | **Only native desktop app in space** |
| Open source | Wallos | Yes |
