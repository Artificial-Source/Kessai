# Prompt 03: Subscriptions List Page

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

## Specific Prompt: Subscriptions List Page

Create the Subscriptions page where users can view and manage all their tracked subscriptions.

**PAGE HEADER:**

- Title: "Subscriptions" (bold, white, left aligned)
- Subtitle: "12 active subscriptions" (soft gray, showing count)

**TOOLBAR ROW:**

Left side:

- Search input with icon
  - Glass input style
  - Placeholder: "Search subscriptions..."
  - Search icon inside input (left)

Right side:

- Filter dropdown: "All Categories" (glass select)
- View toggle: Grid / List icons (grid active by default)
- "Add Subscription" button
  - Primary style: purple gradient background
  - White text, plus icon
  - Rounded corners (12px)
  - Subtle glow/shadow

**MAIN CONTENT: GRID VIEW (Default)**

Display subscriptions in a responsive card grid (3-4 columns):

Each subscription card contains:

- **Service Logo Area** (top)
  - Circular or rounded square placeholder for logo
  - Background color based on category (fallback if no logo)
- **Service Name** (bold, white)
  - "Netflix", "Spotify", "Adobe Creative Cloud"

- **Price & Cycle**
  - "$15.99/month" (prominent)
  - Or "$119.88/year" for annual

- **Category Badge**
  - Small pill/badge: "Entertainment", "Productivity"
  - Color-coded (purple for entertainment, cyan for productivity, etc.)

- **Next Billing**
  - "Next: Jan 15, 2026" (soft gray, smaller)

- **Quick Actions (on hover)**
  - Edit icon (pencil)
  - Delete icon (trash)
  - Appear with subtle animation hint

Card styling:

- Glass effect background
- 16px border radius
- Subtle border
- Hover: lift effect, slightly brighter border
- Click target is entire card

**ALTERNATIVE: LIST VIEW**

Table-style layout when list view is selected:

Columns:

- Service (logo + name)
- Category (badge)
- Price (amount + cycle)
- Next Payment (date)
- Status (Active/Paused badge)
- Actions (edit, delete icons)

Row styling:

- Alternating subtle background (very subtle)
- Hover highlight
- Glass container around entire table
- Sortable column headers (show sort indicator)

**SAMPLE DATA (Show 8-10 subscriptions):**

1. Netflix - Entertainment - $15.99/mo - Jan 14
2. Spotify - Music - $9.99/mo - Jan 15
3. Adobe Creative Cloud - Productivity - $54.99/mo - Jan 18
4. iCloud+ - Cloud Storage - $2.99/mo - Jan 20
5. Gym Membership - Health - $29.99/mo - Jan 22
6. Disney+ - Entertainment - $13.99/mo - Jan 25
7. GitHub Pro - Development - $4.00/mo - Jan 28
8. YouTube Premium - Entertainment - $13.99/mo - Feb 1
9. Notion - Productivity - $10.00/mo - Feb 3
10. 1Password - Security - $2.99/mo - Feb 5

**CATEGORY COLOR MAPPING:**

- Entertainment: Purple (#8b5cf6)
- Music: Pink (#ec4899)
- Productivity: Cyan (#06b6d4)
- Cloud Storage: Blue (#3b82f6)
- Health: Green (#10b981)
- Development: Orange (#f97316)
- Security: Yellow (#eab308)

**EMPTY STATE:**

If no subscriptions exist, show:

- Centered content area
- Friendly illustration or icon (abstract shapes, credit card icon, etc.)
- Heading: "No subscriptions yet"
- Subtext: "Start tracking your recurring payments to get insights into your spending."
- CTA button: "Add Your First Subscription" (primary purple)

**PAGINATION/LOAD MORE (if many subscriptions):**

- "Showing 12 of 24 subscriptions"
- "Load More" button or infinite scroll hint

**SUMMARY BAR (Optional - Bottom or Top):**

- "Total monthly: $178.98 across 12 subscriptions"
- Quick stat bar with glass background
