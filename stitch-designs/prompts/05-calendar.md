# Prompt 05: Calendar Page

## Design Context (Include in Every Prompt)

Design a desktop app UI for "Subby" - a subscription tracker that helps users manage their recurring payments.

**CONTEXT:**

- Target user: Young professionals who want to track Netflix, Spotify, gym memberships, etc.
- Platform: Desktop app (Tauri) - design for 1280-1440px wide viewport
- Purpose: Personal finance tool that feels trustworthy yet approachable

**AESTHETIC:**

- Style: Hybrid Liquid Glass - Apple-minimal meets premium fintech
- Vibe: Sleek and professional, yet soft and friendly. Not cold or intimidating.
- Inspiration: macOS native apps, iOS 26 Liquid Glass, modern banking apps

**COLOR PALETTE (Dark Theme):**

- Background: Deep navy/charcoal gradients (`#0f0f1a` to `#1a1a2e`), NOT pure black
- Primary: Purple (`#8b5cf6`) for accents, buttons, active states
- Secondary: Cyan (`#06b6d4`) for highlights, charts, secondary actions
- Text: Pure white (`#ffffff`) for headings, soft gray (`#a1a1aa`) for body
- Glass: White at 5-10% opacity with blur for glass surfaces
- Borders: White at 10-15% opacity for subtle definition

**GLASS EFFECT (Liquid Glass):**

- Use `backdrop-filter: blur(20px)` on floating elements
- Semi-transparent backgrounds: `rgba(255, 255, 255, 0.05)` to `rgba(255, 255, 255, 0.1)`
- Subtle borders: `1px solid rgba(255, 255, 255, 0.1)`
- Soft layered shadows for depth
- Highlight edge on top of glass elements (subtle white gradient)

**TYPOGRAPHY:**

- Font: Inter or system sans-serif
- Headings: Bold, white, generous size
- Body: Regular weight, soft gray
- Numbers/stats: Semi-bold, slightly larger

**SPACING & LAYOUT:**

- Generous whitespace - let the design breathe
- Border radius: 16px for cards/modals, 12px for buttons, 8px for inputs
- Consistent 16px/24px/32px spacing scale

**INTERACTIONS (Show Visual Hints):**

- Hover states on all clickable elements
- Subtle lift/glow on card hover
- Active states with purple accent
- Smooth transitions implied through design

**TECH STACK:**

- Use Tailwind CSS classes
- Dark mode only
- Responsive but desktop-first

---

## Specific Prompt: Calendar Page

Create the Calendar page where users can see their payment schedule visually and manage payment status.

**PAGE HEADER:**

- Title: "Calendar" (bold, white, left aligned)
- Subtitle: "Track your payment schedule" (soft gray)

**CALENDAR TOOLBAR:**

Left side:

- Month navigation: < Previous | "January 2026" | Next >
  - Arrows are subtle icon buttons
  - Month/year is bold, clickable (could open month picker)
- "Today" button (ghost style, brings to current date)

Right side:

- View toggle buttons: Month | Week (Month active by default)
- Both should be styled as toggle group

**MONTH SUMMARY BAR:**

- Glass card spanning width, below toolbar
- Shows:
  - "January 2026: $178.98 total"
  - "Paid: $45.98 (3)" with green indicator
  - "Upcoming: $133.00 (8)" with purple indicator
  - "Skipped: $0.00 (0)" with gray indicator
- Compact, single row

**MAIN CALENDAR GRID:**

Container: Glass card with padding

**Day Headers Row:**

- Sun | Mon | Tue | Wed | Thu | Fri | Sat
- Soft gray text, uppercase small
- Centered in each column

**Calendar Grid:**

- 6 rows x 7 columns of day cells
- Each cell represents one day

**Day Cell Design:**

Cell structure:

- Date number in top-left corner
  - Current month: white
  - Other months (overflow): very faint gray
  - Today: purple background circle/pill behind number
- Payment indicators below date number

Payment indicators (when payments exist on that day):

- Small pills/chips showing subscriptions due
- Format: "Netflix $15.99" or just colored dot + name
- Color-coded by category
- Maximum 2-3 visible, then "+2 more" indicator
- Click to see all

Cell states:

- Default: subtle background
- Hover: slightly brighter, pointer cursor
- Today: highlighted border or subtle glow
- Selected: purple border/accent
- Days with payments: subtle indicator even at a glance

**SAMPLE DATA (January 2026):**

- Jan 5: Gym ($29.99) - Paid ✓
- Jan 7: Netflix ($15.99) - Paid ✓
- Jan 10: Spotify ($9.99)
- Jan 14: Disney+ ($13.99)
- Jan 15: Adobe CC ($54.99), iCloud ($2.99)
- Jan 20: YouTube Premium ($13.99)
- Jan 22: GitHub Pro ($4.00)
- Jan 25: Notion ($10.00)
- Jan 28: 1Password ($2.99)

Show paid items with a subtle checkmark or different styling.

**DAY DETAIL PANEL (Right Sidebar or Popup):**

When a day is clicked, show details:

Panel styling:

- Glass card
- Either: right sidebar (fixed width ~280px) OR popup near clicked cell

Panel content:

- Date header: "Wednesday, January 15, 2026"
- List of payments for that day:

Each payment item:

- Service logo placeholder (colored circle)
- Service name (bold)
- Amount
- Status badge: "Upcoming" (purple), "Paid" (green), "Skipped" (gray)
- Action buttons:
  - "Mark Paid" (primary, if upcoming)
  - "Skip" (ghost/secondary)
  - "Undo" (if already marked)

If no payments that day:

- "No payments scheduled"
- Soft, friendly message

**WEEK VIEW (Alternative - Optional):**

If showing week view toggle:

- Show 7 columns for days
- Each column has full day name and date
- Payments listed vertically in each column
- More detail visible per payment

**NAVIGATION HINTS:**

- Arrow keys to navigate days
- Click and drag hint (optional)
- Smooth transitions between months

**EMPTY STATE:**
If no subscriptions exist:

- Calendar still renders (empty cells)
- Overlay message: "No payments to track"
- "Add subscriptions to see them on your calendar"
- CTA: "Add Subscription" button
