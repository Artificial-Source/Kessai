# Stitch Designs

This folder contains Google Stitch prompts and their generated HTML outputs for Subby's UI redesign.

## What is Google Stitch?

[Google Stitch](https://stitch.withgoogle.com/) is an AI-powered UI generator that creates responsive HTML/CSS designs from text prompts. We're using it to prototype the new Liquid Glass UI design before converting to React components.

## Folder Structure

```
stitch-designs/
├── README.md                    # This file
├── prompts/                     # Individual prompt files
│   ├── 01-app-shell.md
│   ├── 02-dashboard.md
│   ├── 03-subscriptions.md
│   ├── 04-subscription-form.md
│   ├── 05-calendar.md
│   ├── 06-settings.md
│   └── 07-components.md
└── outputs/                     # Generated HTML files (paste Stitch output here)
    ├── 01-app-shell.html
    ├── 02-dashboard.html
    ├── 03-subscriptions.html
    ├── 04-subscription-form.html
    ├── 05-calendar.html
    ├── 06-settings.html
    └── 07-components.html
```

## How to Use

### 1. Open a Prompt File

Navigate to `prompts/` and open the prompt you want to generate (start with `01-app-shell.md`).

### 2. Copy to Google Stitch

1. Go to [stitch.withgoogle.com](https://stitch.withgoogle.com/)
2. Copy the entire prompt content
3. Paste into Stitch and generate

### 3. Iterate if Needed

- If the output isn't quite right, use Stitch's refinement feature
- Add specific feedback like "make the sidebar narrower" or "use more purple accents"

### 4. Save the Output

1. Export/copy the HTML from Stitch
2. Save to `outputs/` with the matching filename (e.g., `01-app-shell.html`)

### 5. Continue to Next Prompt

Work through prompts in order (01 → 07). Each builds on the established design language.

## Design System

All prompts follow a consistent design language:

| Element           | Specification                                               |
| ----------------- | ----------------------------------------------------------- |
| **Theme**         | Dark mode (deep navy/charcoal, NOT pure black)              |
| **Style**         | Hybrid Liquid Glass - Apple-minimal meets premium fintech   |
| **Primary Color** | Purple `#8b5cf6`                                            |
| **Accent Color**  | Cyan `#06b6d4`                                              |
| **Glass Effect**  | `backdrop-filter: blur(20px)`, semi-transparent backgrounds |
| **Corners**       | 12-16px for cards, 8px for buttons                          |
| **Typography**    | Clean sans-serif (Inter style), strong hierarchy            |
| **Spacing**       | Generous whitespace, breathable layouts                     |

## Prompt Writing Tips

Based on [Google Stitch best practices](https://dev.to/seifalmotaz/stop-generating-ai-slop-the-developers-guide-to-google-stitch-jen):

1. **Be specific** - Describe exact layouts, colors, and components
2. **Use design vocabulary** - "glassmorphism", "bento grid", "card layout"
3. **Specify tech stack** - Always mention "Tailwind CSS" and "dark mode"
4. **Describe the vibe** - "sleek", "professional", "Apple-minimal"
5. **One section at a time** - Don't try to generate everything at once

## After Generation

Once all HTML files are in `outputs/`, the designs will be converted to React + Tailwind components in the main `src/` directory, maintaining the design language while adding:

- Framer Motion animations
- Interactive states
- Real data bindings
- Accessibility features

## Notes

- These are design prototypes, not production code
- The HTML will be rewritten as React components
- Focus on getting the visual design right; code quality doesn't matter here
