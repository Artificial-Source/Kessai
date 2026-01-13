# Prompt 04: Add/Edit Subscription Modal

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

## Specific Prompt: Add/Edit Subscription Modal

Create a modal dialog for adding a new subscription or editing an existing one.

**BACKDROP:**

- Dark overlay behind modal (60-70% opacity black)
- Subtle blur on backdrop (`backdrop-filter: blur(8px)`)
- Click outside to close hint

**MODAL CONTAINER:**

- Centered on screen
- Width: 480-520px (comfortable form width)
- Glass effect (stronger than cards - more blur, slightly more opaque)
- Border radius: 20px
- Subtle border and shadow
- Smooth scale-in animation hint

**MODAL HEADER:**

- Title: "Add Subscription" (or "Edit Subscription" for edit mode)
- Close button (X icon) in top-right corner
  - Subtle, small, hover shows background
- Subtle divider line below header (optional)

**FORM FIELDS (Vertical Stack):**

Each field should have:

- Label above input (soft gray, small, uppercase or normal)
- Input with glass styling
- Comfortable spacing between fields (20-24px)
- Focus state: purple border/glow

**Field 1: Service Name** (Required)

- Text input
- Placeholder: "e.g., Netflix, Spotify"
- Icon: Tag or service icon (left inside input)

**Field 2: Logo URL** (Optional)

- Text input
- Placeholder: "https://example.com/logo.png"
- Icon: Image icon (left)
- Helper text below: "Optional - paste a logo URL"
- Small preview thumbnail if URL is valid (show example preview)

**Field 3: Price** (Required)

- Number input with currency symbol
- Currency symbol as prefix inside input: "$"
- Placeholder: "9.99"
- Icon: Dollar sign

**Field 4: Billing Cycle** (Required)

- Select dropdown
- Options: Monthly, Yearly, Weekly, Quarterly, Bi-annually
- Default: Monthly
- Icon: Calendar/repeat icon
- Glass dropdown styling

**Field 5: Category** (Required)

- Select dropdown with color indicators
- Options with colored dots:
  - 🟣 Entertainment
  - 🩷 Music
  - 🩵 Productivity
  - 🔵 Cloud Storage
  - 🟢 Health & Fitness
  - 🟠 Development
  - 🟡 Security
  - ⚪ Other
- Show selected category color in input

**Field 6: Start Date / First Billing** (Required)

- Date picker input
- Calendar icon
- Placeholder: "Select date"
- Shows mini calendar on click (or just show input, calendar not required)

**Field 7: Description** (Optional)

- Textarea (2-3 rows)
- Placeholder: "Add notes about this subscription..."
- Character count hint (optional): "0/200"

**Field 8: Custom Color** (Optional)

- Small color picker or preset swatches
- Label: "Card Color (optional)"
- 6-8 color swatches: purple, cyan, pink, blue, green, orange, gray
- Selected swatch has checkmark or ring

**MODAL FOOTER:**

- Subtle divider above footer
- Right-aligned buttons with spacing

Buttons:

- "Cancel" button
  - Ghost/outline style
  - Transparent background
  - White/gray border
  - Hover: subtle background

- "Save Subscription" button (or "Add Subscription")
  - Primary style
  - Purple gradient background
  - White text
  - Icon: Plus or checkmark
  - Hover: brighter/lifted

**FORM STATES TO SHOW:**

1. **Empty State (Add Mode)**
   - All fields empty with placeholders
   - "Add Subscription" title

2. **Filled State (Edit Mode)**
   - Show with sample data filled in:
     - Name: "Netflix"
     - Price: 15.99
     - Cycle: Monthly
     - Category: Entertainment
     - Start Date: Jan 1, 2024
   - "Edit Subscription" title

3. **Error State (Optional)**
   - Name field with red border
   - Error message below: "Service name is required"

**ACCESSIBILITY:**

- Clear focus indicators
- Labels associated with inputs
- Logical tab order
