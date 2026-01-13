# Prompt 07: Shared Components Showcase

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

## Specific Prompt: Component Showcase / Design System

Create a comprehensive component showcase page displaying all UI components used in Subby. This serves as a visual design system reference.

**PAGE LAYOUT:**

- Full page with dark background
- Organized sections with clear headers
- Components displayed on the page itself (not in a modal)
- This is a showcase/documentation page, not a functional page

---

## SECTION 1: Buttons

**Section Title:** "Buttons"

Show button variants in rows:

**Primary Buttons:**

- Default: Purple gradient background, white text
- Hover: Slightly lifted, brighter
- Active: Pressed state
- Disabled: Faded, no interaction
- Sizes: Small, Medium (default), Large
- With icon: Plus icon + "Add Subscription"

**Secondary Buttons:**

- Default: Glass background, purple text
- Hover: Slightly brighter background
- Active: Pressed
- With icon: Export icon + "Export"

**Ghost Buttons:**

- Default: Transparent, white/gray text
- Hover: Subtle background appears
- Active: Pressed
- Example: "Cancel"

**Danger Buttons:**

- Default: Red tinted outline or subtle red background
- Hover: More prominent red
- Example: "Delete"

**Icon-Only Buttons:**

- Small circular/square buttons with just icons
- Edit (pencil), Delete (trash), Close (X), Settings (gear)
- Show default and hover states

---

## SECTION 2: Form Inputs

**Section Title:** "Form Inputs"

**Text Input:**

- Default state: Glass background, subtle border, placeholder text
- Focused state: Purple border/glow
- Filled state: With value
- Error state: Red border, error message below
- Disabled state: Faded
- With icon: Search input with magnifying glass
- Label above: "Service Name"

**Select Dropdown:**

- Default state: Glass background, dropdown arrow
- Open state: Showing options dropdown
- Selected option highlighted in purple
- With icon: Category select with tag icon

**Textarea:**

- Multi-line input
- Glass background
- Default and focused states
- Character count indicator: "45/200"

**Date Picker Input:**

- Input field with calendar icon
- Shows formatted date: "Jan 15, 2026"
- (Calendar popup optional)

**Number Input:**

- With currency prefix: "$ [input]"
- Increment/decrement buttons (optional)

---

## SECTION 3: Toggle & Selection

**Section Title:** "Toggles & Selection"

**Toggle Switch:**

- Off state: Gray track
- On state: Purple track with white knob
- Sizes: Small, Default
- With label: "Enable notifications"

**Checkbox:**

- Unchecked: Glass box with subtle border
- Checked: Purple background with white checkmark
- Indeterminate state (optional)
- With label: "Remember my choice"

**Radio Buttons:**

- Unselected: Glass circle outline
- Selected: Purple fill with inner white dot
- Group of 3: "Monthly / Yearly / Weekly"

**Toggle Button Group:**

- Segmented control style
- Options: "Grid | List" or "Dark | Light | System"
- Active segment has purple background
- Glass container for whole group

**Color Swatches:**

- Row of selectable color circles
- Selected one has ring or checkmark
- 6-8 colors shown

---

## SECTION 4: Cards

**Section Title:** "Cards"

**Basic Glass Card:**

- Simple container with glass effect
- Rounded corners (16px)
- Some placeholder content inside
- Subtle border

**Elevated Card:**

- Stronger glass effect
- More prominent shadow
- Feels like it floats higher

**Interactive Card:**

- Default state
- Hover state: Lifted, brighter border, subtle glow
- Active/pressed state
- Cursor: pointer hint

**Stat Card:**

- Large number: "$124.97"
- Label: "Monthly Total"
- Trend indicator: "↑ 12%"
- Icon in corner
- Used on dashboard

**Subscription Card:**

- Service logo placeholder
- Service name
- Price: "$9.99/mo"
- Category badge
- Next billing date
- Hover shows actions

---

## SECTION 5: Badges & Pills

**Section Title:** "Badges & Status Indicators"

**Category Badges:**

- Small rounded pills with category color
- Entertainment (purple)
- Music (pink)
- Productivity (cyan)
- Cloud Storage (blue)
- Health (green)
- Development (orange)

**Status Badges:**

- Paid (green background/text)
- Upcoming (purple)
- Overdue (red)
- Skipped (gray)
- Paused (yellow/amber)

**Count Badges:**

- Small circular badge for counts
- "3" notifications style
- Purple background

**Info Badge:**

- "Coming Soon" - muted purple pill
- "New" - bright purple pill
- "Pro" - gradient pill

---

## SECTION 6: Feedback & Overlays

**Section Title:** "Feedback & Dialogs"

**Toast Notifications:**

- Success: Green accent, checkmark icon, "Subscription saved!"
- Error: Red accent, X icon, "Failed to save"
- Info: Blue/cyan accent, info icon, "Tip: You can..."
- Positioned bottom-right
- Glass styling
- Close button

**Confirmation Dialog:**

- Small centered modal
- Glass effect
- Title: "Delete Subscription?"
- Message: "This will permanently remove Netflix from your subscriptions."
- Buttons: "Cancel" (ghost) and "Delete" (danger)

**Loading States:**

- Spinner: Circular, purple accent
- Skeleton: Pulsing placeholder shapes for loading cards
- Button loading: Spinner replacing text

**Empty State:**

- Illustration placeholder (abstract shapes)
- Message: "No subscriptions yet"
- CTA button

---

## SECTION 7: Charts (Preview)

**Section Title:** "Data Visualization"

**Donut Chart:**

- Multi-segment donut with category colors
- Center shows total
- Legend below with color + label + value
- Clean, minimal styling
- No heavy borders

**Line/Area Chart:**

- Smooth curved line
- Purple gradient fill below line
- X-axis labels (months)
- Y-axis labels (dollar amounts)
- Subtle grid lines (very faint)
- Data points with hover indicator

---

## SECTION 8: Typography Scale

**Section Title:** "Typography"

Show text hierarchy:

- **Display/Hero:** "Track Your Subscriptions" - 36px, bold
- **H1:** "Dashboard" - 28px, bold
- **H2:** "Monthly Overview" - 22px, semi-bold
- **H3:** "Upcoming Payments" - 18px, semi-bold
- **Body:** "Your subscription details appear here." - 16px, regular
- **Small/Caption:** "Last updated: Jan 15, 2026" - 14px, muted
- **Label:** "SERVICE NAME" - 12px, uppercase, muted

Show each with appropriate color (white for headings, gray for body/muted).

---

## SECTION 9: Spacing & Radius Reference

**Section Title:** "Spacing & Radius"

**Spacing Scale:**

- 4px, 8px, 12px, 16px, 20px, 24px, 32px, 48px
- Show as visual blocks

**Border Radius:**

- 4px (tiny elements)
- 8px (inputs, small buttons)
- 12px (buttons, badges)
- 16px (cards)
- 20px (modals)
- 9999px (pills, circular)

Show examples of each radius applied.

---

**OVERALL NOTES:**

- This page should feel like a design system documentation page
- Components should be clearly labeled
- Group related components together
- Use consistent section spacing
- Background should show the components clearly
- This is a reference for maintaining design consistency
