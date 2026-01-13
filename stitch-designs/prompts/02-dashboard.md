# Prompt 02: Dashboard Page

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

## Specific Prompt: Dashboard Page

Create the main dashboard page for Subby - this is the first thing users see after opening the app. It should give an instant overview of their subscription spending.

**PAGE HEADER:**

- Title: "Dashboard" (bold, white, left aligned)
- Subtitle or welcome message: "Here's your subscription overview" (soft gray, smaller)
- Optional: Current month/date indicator on the right

**SECTION 1: Stats Cards Row (Top)**

Four glass cards in a horizontal row, equal width:

1. **Monthly Total** (most prominent)
   - Large dollar amount: "$124.97"
   - Label below: "This Month"
   - Subtle purple accent/glow
   - Small trend indicator: "↑ 12% from last month" (green for up, red for down)

2. **Active Subscriptions**
   - Large number: "12"
   - Label: "Active Subscriptions"
   - Cyan accent
   - Small detail: "2 paused"

3. **Upcoming This Week**
   - Number: "3"
   - Label: "Due This Week"
   - Amount preview: "$34.97 total"

4. **Yearly Projection**
   - Amount: "$1,499.64"
   - Label: "Yearly Estimate"
   - Based on current subscriptions

Card styling:

- Glass effect (blur, semi-transparent)
- Rounded corners (16px)
- Subtle hover lift effect hint
- Icon in top-right corner of each card (optional)

**SECTION 2: Charts Row (Middle)**

Two-column layout with equal-width glass cards:

**Left: Category Breakdown (Donut Chart)**

- Title: "Spending by Category"
- Donut/pie chart showing distribution:
  - Entertainment (purple) - 35%
  - Productivity (cyan) - 25%
  - Music (pink) - 20%
  - Cloud Storage (blue) - 15%
  - Other (gray) - 5%
- Total amount in center of donut: "$124.97"
- Legend below or beside the chart with category names and amounts
- Clean, minimal chart styling with smooth segments

**Right: Monthly Trend (Area/Line Chart)**

- Title: "Monthly Spending"
- 6-month trend line showing spending over time
- Smooth curved line (not angular)
- Gradient fill under the line (purple fading to transparent)
- X-axis: Month labels (Aug, Sep, Oct, Nov, Dec, Jan)
- Y-axis: Dollar amounts
- Current month highlighted
- Subtle grid lines (very low opacity)

**SECTION 3: Bottom Row**

Two-column layout:

**Left: Upcoming Payments (List)**

- Title: "Upcoming Payments"
- "View All" link on the right
- List of next 5 payments:
  - Each row: Service icon/logo placeholder, Service name, Amount, Due date
  - Example rows:
    - Netflix | $15.99 | Tomorrow
    - Spotify | $9.99 | Jan 15
    - Adobe CC | $54.99 | Jan 18
    - iCloud | $2.99 | Jan 20
    - Gym | $29.99 | Jan 22
- Subtle dividers between rows
- Row hover state hint
- Glass card container

**Right: Quick Insights**

- Title: "Insights"
- Glass card with helpful stats:
  - "Average per subscription: $10.42"
  - "Most expensive: Adobe Creative Cloud ($54.99/mo)"
  - "Longest subscription: Netflix (3 years)"
  - "Potential savings: $24.99/mo from unused services" (with a subtle alert icon)
- Each insight on its own line with an icon
- Friendly, helpful tone

**OVERALL PAGE LAYOUT:**

- Assume sidebar is visible on the left (don't include it, just account for the space)
- Generous padding around all sections
- Clear visual hierarchy: Stats → Charts → Details
- Everything should be scannable at a glance
- The page should feel alive and informative, not cluttered

**EMPTY STATE (Optional - If Time):**

- Show what dashboard looks like with no data
- Friendly message: "No subscriptions yet"
- CTA button: "Add Your First Subscription"
