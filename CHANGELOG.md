# Changelog

All notable changes to Subby will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Redesigned UI with ASF brutalist glassmorphic aesthetic
- New 3-font typography system: Space Grotesk (headings), Outfit (body), Space Mono (labels/data)
- Updated color palette: void black background (#0a0a0a), Plasma Violet accent (#bf5af2), glass card surfaces
- Glass cards with transparent backgrounds and hairline borders (rgba 255,255,255,0.06)
- Brutalist sharp-corner primary buttons (0px radius)
- Sidebar: void black (#050505) with Space Mono nav labels and violet left-border active state
- Subscription and category dialogs changed from slide-out Sheet to centered Dialog modals
- Subscription dialog widened to 672px (max-w-2xl) for better form layout
- Category dialog widened to 512px (max-w-lg)
- Subscription grid cards restructured: logo+badge top, name+cycle middle, price bottom
- Calendar month summary redesigned with explicit dividers and flat layout
- Dashboard layout updated with tighter spacing and structural hierarchy
- Settings page updated with Space Mono labels and improved card layout

## [0.1.0] - 2025-01-19

### Added

- Initial release
- Dashboard with monthly/yearly spending stats
- Category breakdown donut chart
- Spending trend chart with comparison
- Subscription management (add, edit, delete, pause)
- Multiple view modes (grid, list, bento treemap)
- Payment calendar with payment indicators
- Mark payments as paid or skipped
- Payment history tracking in database
- 9 default categories with custom category support
- Data export/import (JSON backup)
- Theme switching (dark/light/system)
- Multi-currency support (USD, EUR, GBP, and more)
- SQLite database for local storage
- Cross-platform support (Windows, macOS, Linux)

### Technical

- Built with Tauri 2, React 19, TypeScript, Vite 7
- Tailwind CSS 4 with shadcn/ui components
- Zustand for state management
- React Hook Form + Zod for form validation
- dayjs for date handling
- 136 unit tests with Vitest
