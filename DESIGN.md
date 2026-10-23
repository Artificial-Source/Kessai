---
name: Kessai
description: Know where your money flows. A local-first subscription tracker.
colors:
  obsidian: '#0e0e0e'
  graphite: '#131313'
  slate-elevated: '#1f1f1f'
  slate-highest: '#353535'
  glass: 'rgba(31, 31, 31, 0.6)'
  ink-white: '#ffffff'
  ink-muted: '#c6c6c6'
  hairline: 'rgba(255, 255, 255, 0.08)'
  hairline-strong: 'rgba(255, 255, 255, 0.15)'
  field-edge: 'rgba(255, 255, 255, 0.2)'
  focus-ring: 'rgba(255, 255, 255, 0.8)'
  scrim: 'rgba(0, 0, 0, 0.7)'
  paid-green: '#22c55e'
  due-amber: '#f59e0b'
  trial-blue: '#0ea5e9'
  danger-red: '#f87171'
  cancelling-orange: '#f97316'
  paper: '#fafafa'
  paper-ink: '#131313'
  paper-muted: '#585858'
  paper-paid-green: '#166534'
  paper-due-amber: '#92400e'
  paper-trial-blue: '#0369a1'
  paper-danger-red: '#b91c1c'
  paper-cancelling-orange: '#9a3412'
typography:
  display:
    fontFamily: 'Space Grotesk Variable, Space Grotesk, system-ui, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: '-0.025em'
  headline:
    fontFamily: 'Space Grotesk Variable, Space Grotesk, system-ui, sans-serif'
    fontSize: '1.25rem'
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: '-0.025em'
  title:
    fontFamily: 'Space Grotesk Variable, Space Grotesk, system-ui, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: 'Outfit Variable, Outfit, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'Space Mono, ui-monospace, monospace'
    fontSize: '11px'
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: '0.08em'
  data:
    fontFamily: 'Space Mono, ui-monospace, monospace'
    fontSize: '0.75rem'
    fontWeight: 700
    lineHeight: 1.4
rounded:
  sm: '4px'
  md: '8px'
  lg: '12px'
  xl: '16px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '20px'
  xl: '24px'
components:
  button-primary:
    backgroundColor: '{colors.ink-white}'
    textColor: '{colors.graphite}'
    rounded: '{rounded.md}'
    height: '40px'
    padding: '0 16px'
  button-outline:
    backgroundColor: 'transparent'
    textColor: '{colors.ink-white}'
    rounded: '{rounded.md}'
    height: '40px'
    padding: '0 16px'
  button-destructive:
    backgroundColor: '{colors.danger-red}'
    textColor: '#1c0606'
    rounded: '{rounded.md}'
    height: '40px'
  input:
    backgroundColor: 'rgba(255, 255, 255, 0.04)'
    textColor: '{colors.ink-white}'
    rounded: '{rounded.md}'
    height: '40px'
    padding: '8px 12px'
  card:
    backgroundColor: '{colors.glass}'
    rounded: '{rounded.xl}'
    padding: '20px'
  badge:
    textColor: '{colors.ink-white}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    height: '24px'
    padding: '0 8px'
  nav-item-active:
    backgroundColor: '{colors.ink-white}'
    textColor: '{colors.graphite}'
    rounded: '{rounded.md}'
    size: '40px'
---

# Design System: Kessai

## Overview

**Creative North Star: "The Ledger in Obsidian"**

Kessai is a private ledger that lives on the user's own machine: an obsidian ground, white ink, crisp hairlines, and numbers set like entries in a book. The incumbent direction is ASF Brutalist Glassmorphic, and it stays: dark-first, high contrast, glass cards with crisp 1px edges, monochrome ink with color reserved for money states, Space Mono for the data layer. It is an Operate surface opened many times a day for a few seconds, so precision and restraint carry the brand; spectacle does not.

Two hosts render the same SPA: the Tauri desktop window (primary, frameless, min 900×600, WebKitGTK on Linux with blur, shadows, gradients, and most animation suppressed by the `.tauri-runtime` profile) and a browser via the local web server (secondary; phones over Tailscale). Everything here must read well with the desktop profile's suppressions applied: depth comes from tone and hairlines first, never from blur or shadow alone.

**Key Characteristics:**

- Obsidian ground (`obsidian`) with one stepped neutral per elevation; the sidebar sits one step up (`graphite`).
- Inverted white block = primary action and current location (primary button, active nav item, selected palette row icon).
- Color only for money state: paid, due/paused, trial, cancelling, danger. Never decoration.
- Space Grotesk headings, Outfit body, Space Mono labels and figures.
- Restrained CSS motion (150–300ms, exponential ease-out), fully suppressible.

## Colors

A monochrome ink system on obsidian (dark, default) or paper (light), with five status hues that each mean one thing about money.

### Primary

- **Ink White** (`ink-white`; light: `paper-ink`): text, icons, the primary button fill, the active-nav block, focus ring base. In light theme every role inverts to near-black ink on paper.

### Neutral

- **Obsidian** (`obsidian`; light: `paper`): page ground behind everything.
- **Graphite** (`graphite`): sidebar and mobile tab bar layer, one step above the ground.
- **Slate Elevated** (`slate-elevated`): dialogs, popovers, toasts, command palette.
- **Slate Highest** (`slate-highest`): switch-off track, skeleton blocks (at 60%), secondary hover.
- **Glass** (`glass`): `glass-card` fill for page sections; blur-free by policy.
- **Ink Muted** (`ink-muted`; light: `paper-muted`): secondary text, labels, placeholders. 10.4:1 on glass in dark, 7.05:1 in light.
- **Hairline / Hairline Strong** (`hairline`, `hairline-strong`): card edges, dividers, hover edges, ghost borders.
- **Field Edge** (`field-edge`): resting border of inputs, selects, outline buttons, switch-off track.
- **Focus Ring** (`focus-ring`): the one focus treatment (12:1 against obsidian).
- **Scrim** (`scrim`; light: 35% ink): behind dialogs and the palette.

### Status (text-safe on glass at 12% tint, ≥4.5:1 in both themes)

- **Paid Green** (`paid-green` / `paper-paid-green`): active, paid, under budget.
- **Due Amber** (`due-amber` / `paper-due-amber`): paused, grace period, due soon, warnings.
- **Trial Blue** (`trial-blue` / `paper-trial-blue`): trials and informational notes.
- **Danger Red** (`danger-red` / `paper-danger-red`): cancelled, expired, over budget, destructive actions, field errors. In dark, filled destructive buttons use dark text on the light red (7.2:1).
- **Cancelling Orange** (`cancelling-orange` / `paper-cancelling-orange`): pending cancellation only.

Bento ramps (`--color-bento-*`) are neutral tile fills with light-theme overrides in `src/styles/globals.css`. Category, tag, and subscription hexes come from user data and are shown only as dots, swatches, or logo tiles, never as text color.

### Named Rules

**The Money-Only Color Rule.** Hue appears only to state a money condition (paid, due, trial, cancelling, danger) or to identify user data (a category dot). Never as decoration, never as a background wash for a section.

**The Data Color Is a Dot Rule.** A subscription, category, or tag color is shown as a dot, swatch, or logo tile; the adjacent text stays in ink. Brand colors as text fail contrast (measured 1.0–4.0:1 in the calendar).

## Typography

**Display/Headline Font:** Space Grotesk Variable (self-hosted)
**Body Font:** Outfit Variable (self-hosted)
**Label/Data Font:** Space Mono Regular + Bold (self-hosted)

**Character:** Space Grotesk's squared geometry gives headings an engineered edge; Outfit keeps body copy round and calm; Space Mono makes every figure and label read like a ledger entry. Never Inter.

### Hierarchy

- **Display** (700, 1.5rem, tracking -0.025em): page titles; exactly one `h1` per route.
- **Headline** (700, 1.25rem): dialog titles, card titles on wide layouts.
- **Title** (700, 1.125rem): section card titles (`CardTitle`).
- **Body** (400, 0.875rem/1.5, Outfit): descriptions and running copy; 16px in form fields on phones so iOS never zooms.
- **Label** (400, 11px, uppercase, 0.08em, Space Mono; utility `type-label`): eyebrows, column headers, stat labels, kbd hints, badge text.
- **Data** (700, 0.75–1rem, Space Mono): amounts, dates, counts; tabular by construction.

### Named Rules

**The 11px Floor Rule.** No functional text below 11px. The detector flagged 200+ instances of 9–10px mono labels on the pre-Stage-2 pages; use `type-label` instead of `font-mono text-[10px] tracking-widest uppercase`.

**The One H1 Rule.** Every route has one `h1` (the page title); cards use `h2`, items inside cards `h3`. No skipped levels.

## Layout

- Shell: 72px sidebar rail (md and up) + scrollable `main` (`max-w-7xl`, padding 16px phone / 24px md+). Below md, a docked bottom tab bar (`--bottom-bar-height: 4rem` + safe-area inset) replaces the rail and `main` reserves that space plus 24px. The desktop window titlebar (36px) renders only in Tauri.
- Spacing rhythm: 4px base; 8 (tight groups), 16 (card internals), 20 (card padding `md`), 24 (between sections). More space above a heading than below it.
- Breakpoints: Tailwind defaults; `md` (768px) switches rail vs tab bar; `lg` (1024px) opens two-column section layouts and the calendar side panel.
- Density: Operate density. Lists and tables over card grids when the user is comparing; card grids only for overviews.
- Touch: on coarse pointers every Button, Input, Select, rail item, and dialog Close is at least 44×44px (`pointer-coarse:` variants in the primitives), matching PRODUCT.md's phone target floor. Compact glyphs stay compact; only the hit box grows. Phone layouts must not depend on hover or horizontal scrolling.

## Elevation & Depth

Tonal layering with hairlines; shadows are a garnish that the desktop profile removes. Depth reads from the stepped neutrals (`obsidian` → `graphite` → `slate-elevated`) and 1px edges. Backdrop blur is allowed only on small fixed or overlay surfaces (dialog panel, command palette, calendar day panel); never on scrolling content, cards, or the tab bar (guarded by `src/styles/__tests__/globals-css.test.ts`).

### Shadow Vocabulary

- **Ambient** (`shadow-ambient`: `0 0 80px -10px` at 4% ink): dialogs and palette only.
- **Ambient Strong** (`shadow-ambient-strong`): hover on the `glow` button.
- **Popover drop** (`0 12px 32px -12px rgba(0,0,0,0.5)`): select menus and the currency menu.

### Named Rules

**The Flat-At-Rest Rule.** Static cards do not react to hover. Only cards that are entirely a control (`Card interactive`) lift 2px and brighten their edge.

## Shapes

Crisp rounded rectangles. Cards 16px (`rounded.xl`), controls 8px (`rounded.md`), compact chips, badges, kbd, and nav indicators 4px (`rounded.sm`). Pills are reserved for status dots, switch tracks, and avatars; badges are not pills. Borders are 1px; dashed borders mean "empty, fill me" (EmptyState only).

## Components

All primitives live in `src/components/ui/`; pages compose them and do not restyle them.

### Buttons

- **Shape:** 8px corners; heights 40px (`default`), 36px (`sm`), 40px/32px squares (`icon`/`icon-sm`); at least 44×44px on coarse pointers, whatever the size or label length. No `lg`/`xl` sizes: Kessai has no oversized CTAs.
- **Primary (`default`)**: inverted ink block. **`glow`**: primary plus ambient glow, for the single page-level create action.
- **Outline / Secondary / Ghost / Link / Destructive**: outline uses the field edge; ghost is text-only until hover; destructive is danger red.
- **States:** 150ms color transition, `translate-y-px` on press, 50% opacity when disabled, `aria-busy` shows a progress cursor; focus uses the global ring. Default `type="button"`; icon sizes require `aria-label` (type-enforced).

### Cards / Containers

- **`Card`**: glass fill, 1px hairline, 16px corners, padding `sm` 16 / `md` 20 / `lg` 24; `tone` info/warning/danger tints the edge and fill; `asChild` for `section`/`button`/`a`. `CardHeader` (title, description, `action` slot), `CardTitle` (`h2`), `CardDescription`.
- **Never nest cards.** Inside a card, group with dividers (`divide-y`) or spacing.

### Inputs / Fields

- **`Input`, `Textarea`, `SelectTrigger`, `CurrencySelect`** share `fieldClassName`: filled well, field-edge border, hover to hairline-strong, global focus ring.
- **Error:** set `aria-invalid` on the control and `aria-describedby` to a `FieldError` (`role="alert"`, danger text); helper copy in `FieldHint`. Labels sit above controls via `Label`.
- **Disabled:** 50% opacity, not-allowed cursor.

### Switch

44×24 track with a 44px-tall hit area. Off: slate-highest track, muted thumb. On: inverted ink track, contrasting thumb. Always named (`aria-label` or `Label htmlFor`).

### Badges

Space Mono 11px uppercase, 4px corners, 1px tinted edge on a 12% tint. Tones: `default`, `secondary`, `outline`, `success`, `warning`, `danger`, `info`, `caution`. Status mapping: trial → info, active → success, paused/grace → warning, cancelling → caution, cancelled/expired → danger. Data colors use `dot` + `dotColor` on a neutral badge.

### Dialogs

Centered `Dialog` only (never side sheets). Panel: slate-elevated at 90% with blur, 16px corners, 24px padding, 20px gap, max height `100dvh - 2rem` with internal scroll, inset 16px from phone edges. Header left-aligned (title in Space Grotesk 20px, muted description), close button top-right: 36px on fine pointers, 44px on coarse pointers with the 16px glyph in the same place. `DialogFooter` stacks on phone (primary on top) and right-aligns on wider screens; callers must not add gap utilities. `ConfirmDialog` for destructive confirmation; the confirm button keeps its label and adds a spinner while busy.

### Empty, Loading, Error

- **`EmptyState`**: icon tile (4px-cornered square, not a circle), title, one-to-two sentence description, at most one primary and one secondary action; `surface` (dashed glass) or `plain`; `compact` inside cards; `tone="danger"` for crash and failure states. No emoji, no perpetual float.
- **`Skeleton`**: slate-highest blocks shaped like the real content; group under `role="status"` with an sr-only label.
- **Failure is not emptiness:** when data failed to load, render a danger `EmptyState` with a retry action, never zeros or "All caught up".
- **Toasts (Sonner):** slate-elevated surface, hairline-strong edge, 8px corners, status-tinted icon, title 500 weight + muted description; lifted above the mobile tab bar.

### Navigation

- **Sidebar rail (md+):** logo, search (opens the palette), four destinations, keyboard-shortcuts button at the foot. Active = inverted ink block (`aria-current="page"`); hover/focus reveals a label tooltip with the shortcut.
- **Bottom tab bar (below md):** docked, opaque graphite, hairline top edge, four equal columns ≥64px tall; active item shows an inverted chip behind the icon and an ink label.
- **Command palette:** centered at 16vh, combobox + grouped listbox (Subscriptions, Pages, Actions), empty-result state, keyboard footer, close button on phones.
- **Keyboard:** every shortcut is listed in the shortcuts dialog; `Kbd` renders keys with the platform modifier (⌘ or Ctrl).

### Dashboard

The home route is a renewal ledger, not a KPI grid. It answers "what charges next, and what should I decide before it does?" (`src/pages/dashboard.tsx`, `src/components/dashboard/`).

- **Commitment summary:** one glass section. **Monthly equivalent** (user share, display currency, Space Grotesk figure 30–36px that steps down a size for long amounts and never wraps mid-number), the count of billable subscriptions it covers (trials included at their recorded price), and the optional **Monthly target** as a linear meter scaled to the larger amount: neutral fill, a target marker, red only for the part above it, with the exact variance ("$80.53 above target", "At target"). One currency-scope note for the whole section; yearly equivalent and categories (neutral bars, category color as a dot) fold under **Breakdown**. Never call the equivalent "spent".
- **Upcoming charges:** the next 30 days (today through today + 29), from the same calendar month projections as Calendar, so weekly plans appear once per due date. Groups Today / Next 7 days / Later; paid and skipped occurrences leave the list. Rows show the full charge in its own currency (code beside foreign amounts) and "Your share … · split N ways" on its own line; the subtotal is labeled "USD full charges" and names the currencies it leaves out (all-foreign periods say so instead of showing $0). First 6 rows, then **View all N charges**; **Open calendar** beside it. Unrecorded earlier dates of the current month fold into "Earlier this month · no payment recorded" and never count as coming charges.
- **Row actions:** visible **Mark paid** and **Skip** with a More menu (Edit subscription) from 640px; below that, Mark paid plus a 44px More menu that holds Skip. Rows are two lines in narrow containers, one line from 36rem, with a date column from 46rem (container queries). Writes show a spinner and `aria-busy`, then a "Marked paid"/"Skipped" badge until the refreshed schedule drops the row; failures stay inline (`role="alert"`) and in a toast. Focus stays on the row's name, then moves to the row that took its place.
- **Decisions rail** (right third from lg, under the ledger below it): **Decisions** (trials ending within 7 days or ended, with recorded price and next payment, "Check dates" when the next payment precedes the trial end; grace periods; recorded price increases or currency changes newer than the last review) with Review (the subscription dialog) and Keep / Mark reviewed; **Worth reviewing** (not reviewed for 30 days, counted from `last_reviewed_at ?? created_at`, pending cancellations first), three shown with **Review all N**; and **{Month} records** (marked paid / not recorded yet / skipped by due date, full charges). An empty Decisions list is one line ("No decisions due in the next 7 days"), never an empty card.
- **Below lg:** order is summary, a one-line preview of the most urgent decision (two from md) with "show all", then the ledger, then the rail. On phones the summary keeps the figure, the variance and the scope note; count and target links move into Breakdown.
- **States:** no subscriptions → the shared first-run empty state alone (no zero cards, no header Add); subscription load failure → danger empty state with Retry; schedule failure → its own Retry inside Upcoming charges while the summary stays; settings failure → the target is not shown and the summary says which currency it fell back to.

### Motion

Durations come from `--animation-duration` (0.3s) and `--transition-duration` (0.2s), rescaled by the user's speed setting. Easing `--ease-emphasized` (exponential out). Entrances: `animate-fade-in-up` on page roots, `stagger-children` on overview grids (max 240ms total delay). Reduced motion (OS preference until settings load, then the in-app switch) zeroes animations and transitions except spinners, which are status.

## Do's and Don'ts

### Do:

- **Do** compose pages from `Card`, `EmptyState`, `Badge`, `Button`, `Input`/`Textarea`/`FieldError`, `Skeleton`, `Kbd`, and `Dialog`; reach for `type-label` for every mono eyebrow.
- **Do** keep amounts in the display currency and state what is excluded ("2 in other currencies not included") at body size next to the figure.
- **Do** give every icon-only control an `aria-label` that names the object ("Delete Netflix").
- **Do** show the same information in place on phones: stacked rows, visible actions, 44px targets.
- **Do** test every surface in dark and light, at 1280, 820, and 390 widths.

### Don't:

- **Don't** put backdrop blur on cards, lists, the tab bar, or any scrolling surface.
- **Don't** use brand or category colors as text; use a dot or tile beside ink text.
- **Don't** use emoji or Unicode glyphs as icons; Lucide only.
- **Don't** set functional text below 11px or nest cards.
- **Don't** hide row actions behind hover or rely on horizontal scrolling on phones.
- **Don't** present a failed load as zero data or a celebratory empty state.
- **Don't** add Framer Motion, Inter, side sheets, or oversized rounded CTAs.
