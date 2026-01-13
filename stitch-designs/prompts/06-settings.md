# Prompt 06: Settings Page

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

## Specific Prompt: Settings Page

Create the Settings page where users can customize app appearance, preferences, and manage their data.

**PAGE HEADER:**

- Title: "Settings" (bold, white, left aligned)
- Subtitle: "Customize your Subby experience" (soft gray)

**LAYOUT:**

- Single column of stacked settings sections
- Each section is a glass card
- Maximum content width (~700px), centered or left-aligned
- Generous spacing between sections (24-32px)

---

**SECTION 1: Appearance**

Section header:

- Icon: Palette/paintbrush icon
- Title: "Appearance"
- Description: "Customize how Subby looks" (soft gray, smaller)

Content:

**Theme Selection:**

- Label: "Theme"
- Toggle button group: Dark | Light | System
- Dark is selected (show active state with purple accent)
- Each option shows sun/moon/computer icon

**Accent Color:**

- Label: "Accent Color"
- Row of color swatches (6-8 colors):
  - Purple (#8b5cf6) - selected/default
  - Cyan (#06b6d4)
  - Pink (#ec4899)
  - Blue (#3b82f6)
  - Green (#10b981)
  - Orange (#f97316)
- Selected swatch has checkmark or ring indicator
- Colors should feel premium, not childish

**Preview (Optional):**

- Small mock-up showing how accent color affects buttons/links
- "Preview" label

---

**SECTION 2: Currency & Region**

Section header:

- Icon: Globe or dollar sign icon
- Title: "Currency & Region"
- Description: "Set your local preferences"

Content:

**Currency:**

- Label: "Currency"
- Select dropdown
- Options: USD ($), EUR (€), GBP (£), JPY (¥), CAD (C$), AUD (A$), etc.
- Show selected: "USD ($)"
- Glass dropdown styling

**Date Format:**

- Label: "Date Format"
- Select dropdown
- Options:
  - MM/DD/YYYY (US)
  - DD/MM/YYYY (EU)
  - YYYY-MM-DD (ISO)
- Shows preview: "Jan 15, 2026"

**First Day of Week:**

- Label: "Week Starts On"
- Toggle or select: Sunday | Monday
- Affects calendar view

---

**SECTION 3: Notifications** (Coming Soon)

Section header:

- Icon: Bell icon
- Title: "Notifications"
- Badge: "Coming Soon" (small, muted, purple/gray pill)
- Description: "Get reminded about upcoming payments"

Content (all disabled/muted styling):

**Toggle rows:**

- "Payment reminders" - Toggle switch (disabled)
  - Helper: "Get notified before payments are due"
- "Weekly summary" - Toggle switch (disabled)
  - Helper: "Receive a weekly spending summary"
- "Price change alerts" - Toggle switch (disabled)
  - Helper: "Know when subscription prices change"

All toggles grayed out with "Coming in v1.1" or just visually disabled.

---

**SECTION 4: Data Management**

Section header:

- Icon: Database or folder icon
- Title: "Data Management"
- Description: "Export, import, or reset your data"

Content:

**Export Data:**

- Row with icon, label, description, button
- Icon: Download icon
- Label: "Export Data"
- Description: "Download all your subscriptions and settings as JSON"
- Button: "Export" (secondary/outline style)

**Import Data:**

- Row with icon, label, description, button
- Icon: Upload icon
- Label: "Import Data"
- Description: "Restore from a previous backup"
- Button: "Import" (secondary/outline style)

**Last Backup Info:**

- Small text: "Last export: Never" or "Last export: Jan 10, 2026"

**Danger Zone (separated visually):**

- Subtle divider or extra spacing above
- Red-tinted area or warning styling

**Delete All Data:**

- Icon: Trash icon (red tinted)
- Label: "Delete All Data" (red text)
- Description: "Permanently remove all subscriptions and settings. This cannot be undone."
- Button: "Delete Everything" (danger style - red outline or red background)

---

**SECTION 5: Categories**

Section header:

- Icon: Tag icon
- Title: "Categories"
- Description: "Manage subscription categories"

Content:

**Category List:**

- List of existing categories with their colors:
  - 🟣 Entertainment (default)
  - 🩷 Music (default)
  - 🩵 Productivity (default)
  - 🔵 Cloud Storage (default)
  - 🟢 Health & Fitness (default)
  - 🟠 Development (default)
  - 🟡 Security (default)
  - ⚪ Custom Category 1 (user-created)

Default categories show "(Default)" tag - can't be deleted
Custom categories show edit/delete icons on hover

**Add Category:**

- Button at bottom: "+ Add Category"
- Opens inline form or small modal:
  - Name input
  - Color picker
  - Save/Cancel buttons

---

**SECTION 6: About**

Section header:

- Icon: Info icon
- Title: "About Subby"

Content:

**App Info:**

- App name and version: "Subby v0.1.0"
- Small app icon/logo

**Links (as text links or subtle buttons):**

- "View on GitHub" (external link icon)
- "Report a Bug" (external link icon)
- "Release Notes"

**Credits:**

- "Made with ♥ by [Your Name]"
- Or: "Built with Tauri, React, and TypeScript"

---

**OVERALL STYLING:**

- Each section card has consistent padding (24px)
- Clear section headers with icons
- Form elements are well-spaced
- Save happens automatically or show "Saved" toast hint
- The page should feel organized and not overwhelming
