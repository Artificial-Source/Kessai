# Prompt 01: App Shell & Sidebar

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

## Specific Prompt: App Shell & Sidebar

Create the main app shell layout for Subby with a collapsible sidebar navigation.

**OVERALL LAYOUT:**

- Full viewport height, no scroll on shell itself
- Sidebar on left (glass effect)
- Main content area on right (scrollable)
- Subtle background gradient from deep navy to charcoal

**SIDEBAR - EXPANDED STATE (width: 240px):**

Header section:

- Logo/brand: "Subby" text with subtle purple gradient, or a minimal icon + text
- Positioned at top with generous padding

Navigation items (vertical stack):

- Dashboard (grid/home icon)
- Subscriptions (credit card icon)
- Calendar (calendar icon)
- Settings (gear icon)

Each nav item should have:

- Icon on left, label on right
- Padding for comfortable click target
- Default state: soft white/gray text
- Hover state: lighter background, brighter text
- Active state: purple accent (left border or background tint), white text

Footer section:

- Collapse toggle button at bottom
- Small, subtle, icon-only

Glass styling for sidebar:

- Semi-transparent background with blur
- Subtle right border
- Feels like it floats over the background

**SIDEBAR - COLLAPSED STATE (width: 64px):**

- Icons only, centered
- Tooltip hint on hover (optional)
- Logo becomes icon-only
- Same glass effect

**MAIN CONTENT AREA:**

- Clean header bar at top with:
  - Page title (left aligned, bold)
  - Optional action buttons (right aligned)
- Content area below header (scrollable)
- Subtle inner padding (24-32px)

**SHOW BOTH STATES:**
Create two versions side by side or clearly labeled:

1. Sidebar expanded
2. Sidebar collapsed

**ADDITIONAL DETAILS:**

- Add a subtle animated gradient orb or blur in the background (optional, for visual interest)
- The design should feel premium and polished
- Every element should have clear purpose
