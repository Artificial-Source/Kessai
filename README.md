<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Subby Logo" width="80" height="80">
</p>

<h1 align="center">Subby</h1>

<p align="center">
  <strong>Know where your money flows.</strong>
  <br />
  A local-first subscription tracker. No cloud. No accounts. Just you and your data.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-informational" alt="Platform">
  <img src="https://img.shields.io/badge/tests-517%20passed-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/Tauri%202-Rust%20%2B%20React-bf5af2" alt="Tauri 2">
</p>

<br />

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Subby Dashboard" width="90%">
</p>

---

## Features

- **Dashboard** -- Stats, category breakdown, spending trends, budget tracking, price change alerts
- **Subscriptions** -- Grid, list, and bento views. Search, sort, filter by category or tags. Pin favorites
- **Analytics** -- Monthly spending charts, year summaries, spending velocity, category breakdowns
- **Calendar** -- Visual payment schedule. Mark as paid or skip
- **Global Search** -- `Cmd+K` to find anything
- **Multi-Currency** -- 10 currencies with live conversion and cost normalization (daily/weekly/monthly/yearly)
- **Smart Reminders** -- Notifications 1-30 days before renewal. System tray badge
- **Lifecycle Tracking** -- Trials, cancellations with reasons, review nudges for unused subs
- **Data Portability** -- JSON export/import, CSV/bank statement import, diagnostic logs
- **Web + CLI + MCP** -- Browser mode, terminal management, AI assistant integration
- **Dark/Light Themes** -- Glassmorphic UI with keyboard shortcuts throughout

---

## Screenshots

<p align="center">
  <img src="docs/screenshots/subscriptions.png" alt="Subscriptions Grid View" width="49%">
  <img src="docs/screenshots/subscriptions-list.png" alt="Subscriptions List View" width="49%">
</p>

<p align="center">
  <em>Grid and list views with category badges, multi-currency conversion, and price change indicators</em>
</p>

---

## Install

### Download

Grab the latest from [Releases](https://github.com/AI-Strategic-Forum/Subby/releases):

| Platform | Install |
|---|---|
| **Ubuntu/Debian** | `sudo dpkg -i subby_*.deb` |
| **Fedora/RHEL** | `sudo rpm -i subby_*.rpm` |
| **Any Linux** | `chmod +x *.AppImage && ./*.AppImage` |
| **macOS** | Drag `.dmg` to Applications |
| **Windows** | Run the `.exe` installer |

### Build from Source

```bash
git clone https://github.com/AI-Strategic-Forum/Subby.git
cd Subby && pnpm install && pnpm tauri build
```

---

## CLI & MCP

```bash
cargo build --release -p subby-mcp

subby-mcp list                        # List subscriptions
subby-mcp add "Netflix" 15.99 monthly 2026-04-01
subby-mcp stats                       # Dashboard stats
subby-mcp upcoming --days 14          # Upcoming payments
```

**Web mode:** `cargo run -p subby-web -- --port 3000` -- same database, browser access.

**MCP:** AI assistant integration with 10 tools and 5 resources. See [MCP Setup Guide](docs/guides/mcp-setup.md).

---

## Development

```bash
pnpm tauri dev           # Start dev app
pnpm check               # Lint + typecheck + format
pnpm test:run            # 517 frontend tests
cargo test --workspace   # 22 Rust tests
```

**Stack:** Tauri 2 (Rust) + React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + shadcn/ui + Zustand + SQLite + Recharts

**Structure:**
```
src/           React frontend (components, pages, stores, hooks, types)
src-tauri/     Rust backend + Tauri commands
crates/        subby-core (SQLite + business logic), subby-mcp (CLI + MCP server)
packages/      Discord reminder bot
```

---

## Data & Privacy

All data stays on your device. Plain SQLite you can inspect, backup, or migrate.

| Platform | Location |
|---|---|
| Linux | `~/.local/share/com.asf.subby/` |
| macOS | `~/Library/Application Support/com.asf.subby/` |
| Windows | `%APPDATA%/com.asf.subby/` |

Structured logs in `{data_dir}/logs/` for debugging. Frontend logs downloadable from Settings.

---

## License

[MIT](./LICENSE) -- Built by [AI Strategic Forum](https://github.com/AI-Strategic-Forum)
