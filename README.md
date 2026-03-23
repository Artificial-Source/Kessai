<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Subby Logo" width="80" height="80">
</p>

<h1 align="center">Subby</h1>

<p align="center">
  <strong>Know where your money flows</strong>
</p>

<p align="center">
  A beautiful, local-first desktop app to track your subscriptions and recurring payments.
  <br />
  No cloud. No accounts. No tracking. Just you and your data.
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
  </a>
  <a href="https://github.com/AI-Strategic-Forum/Subby/releases">
    <img src="https://img.shields.io/github/v/release/AI-Strategic-Forum/Subby?display_name=tag&color=bf5af2" alt="Latest Release">
  </a>
  <a href="https://github.com/AI-Strategic-Forum/Subby/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/AI-Strategic-Forum/Subby/ci.yml?branch=main&label=CI" alt="CI">
  </a>
  <img src="https://img.shields.io/badge/coverage-95%25-brightgreen" alt="Test Coverage">
  <img src="https://img.shields.io/badge/tests-516%20passed-brightgreen" alt="Tests">
  <a href="https://github.com/AI-Strategic-Forum/Subby">
    <img src="https://img.shields.io/github/stars/AI-Strategic-Forum/Subby?style=social" alt="GitHub Stars">
  </a>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#screenshots">Screenshots</a> &bull;
  <a href="#installation">Installation</a> &bull;
  <a href="#cli-usage">CLI</a> &bull;
  <a href="#ai-integration-mcp">MCP</a> &bull;
  <a href="#development">Development</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

---

## Why Subby?

Most subscription trackers are cloud-based, require accounts, and monetize your financial data. Subby takes a different approach:

|                           |         Subby         | Cloud Trackers |
| ------------------------- | :-------------------: | :------------: |
| **Works offline**         |          Yes          |       No       |
| **No account needed**     |          Yes          |       No       |
| **Open source**           |          Yes          |     Rarely     |
| **Your data stays local** |          Yes          |       No       |
| **Free forever**          |          Yes          |    Freemium    |
| **Cross-platform**        | Linux, macOS, Windows |    Web only    |

---

## Features

- **Dashboard** — Monthly/yearly spending stats, category breakdown, trend charts, budget tracking, and spending insights at a glance
- **Subscription Management** — Add, edit, pause/resume subscriptions with grid, list, and treemap bento views. 100+ service templates with logos
- **Payment Calendar** — Visual monthly calendar with payment indicators. Mark as paid, skip, or view details per day
- **Smart Categories** — 9 built-in categories + unlimited custom ones with colors and icons
- **Multi-Currency** — 10 currencies (USD, EUR, GBP, JPY, CAD, AUD, MXN, CNY, INR, BRL) with live conversion display
- **Free Trial Tracking** — Track trials with countdown timers, expiry alerts, and dashboard warnings
- **Price History** — Automatic detection of price changes with timeline and percentage tracking
- **Shared Subscriptions** — Split costs with family or friends, track your share
- **Monthly Budget** — Set spending limits with progress bar and over-budget alerts
- **Payment Cards** — Manage cards and assign them to subscriptions
- **Themes** — Dark, light, and system theme modes with glassmorphic design
- **Motion Controls** — Configurable animations, transitions, and hover effects (respects prefers-reduced-motion)
- **Desktop Auto-Updates** — Installed builds can check GitHub Releases and install signed updates in-app
- **Keyboard Shortcuts** — `N` new subscription, `/` search, `?` shortcuts dialog, `1-4` navigate
- **Data Portability** — Export/import JSON backups. Import from Wallos, Bobby, or CSV
- **Discord Bot** — Daily payment reminders and spending summaries
- **CLI + MCP** — Manage subscriptions from the terminal or through AI assistants like Claude

---

## Screenshots

<!--
  To add screenshots, take them from the running Tauri app and save to docs/screenshots/:
  - dashboard-dark.png, dashboard-light.png
  - subscriptions-dark.png, subscriptions-light.png
  - calendar-dark.png, calendar-light.png
  - settings-dark.png, settings-light.png
-->

<p align="center">
  <img src="docs/screenshots/dashboard-dark.png" alt="Dashboard — Dark Mode" width="48%">
  <img src="docs/screenshots/subscriptions-dark.png" alt="Subscriptions — Dark Mode" width="48%">
</p>
<p align="center">
  <img src="docs/screenshots/calendar-dark.png" alt="Calendar — Dark Mode" width="48%">
  <img src="docs/screenshots/settings-dark.png" alt="Settings — Dark Mode" width="48%">
</p>

<details>
<summary><strong>Light Mode</strong></summary>
<p align="center">
  <img src="docs/screenshots/dashboard-light.png" alt="Dashboard — Light Mode" width="48%">
  <img src="docs/screenshots/subscriptions-light.png" alt="Subscriptions — Light Mode" width="48%">
</p>
</details>

---

## Installation

### Download Pre-built Binaries

Grab the latest release from [GitHub Releases](https://github.com/AI-Strategic-Forum/Subby/releases):

| Platform                  | File                         | Install                               |
| ------------------------- | ---------------------------- | ------------------------------------- |
| **Ubuntu/Debian**         | `subby_x.x.x_amd64.deb`      | `sudo dpkg -i subby_*.deb`            |
| **Fedora/RHEL**           | `subby_x.x.x_amd64.rpm`      | `sudo rpm -i subby_*.rpm`             |
| **Any Linux**             | `subby_x.x.x_amd64.AppImage` | `chmod +x *.AppImage && ./*.AppImage` |
| **macOS (Apple Silicon)** | `Subby_x.x.x_aarch64.dmg`    | Double-click, drag to Applications    |
| **macOS (Intel)**         | `Subby_x.x.x_x64.dmg`        | Double-click, drag to Applications    |
| **Windows**               | `Subby_x.x.x_x64-setup.exe`  | Double-click, follow installer        |

> **Note:** Unsigned builds may show OS security warnings. Click "More info" > "Run anyway" (Windows) or right-click > "Open" (macOS).

Installed builds can check for new releases from Settings and apply signed updates automatically.

### Install from Source (Linux)

```bash
git clone https://github.com/AI-Strategic-Forum/Subby.git
cd subby
./install.sh
```

<details>
<summary><strong>What does install.sh do?</strong></summary>

The installer gives you three options:

1. **Desktop app only** — Builds and installs the Tauri app
2. **Desktop app + Discord bot** — Both components with systemd service
3. **Discord bot only** — Just the reminder bot

Run `./install.sh --dry-run` to preview without making changes. Use `--app`, `--bot`, or `--all` for non-interactive installs.

</details>

### Uninstall

```bash
./uninstall.sh            # If installed via install.sh
sudo dpkg -r subby        # If installed via .deb
sudo rpm -e subby         # If installed via .rpm
```

---

## Discord Bot

Get subscription reminders directly in Discord. The bot reads your Subby backup and sends notifications before payments are due.

- `/upcoming` — View upcoming payments
- `/summary` — Monthly spending breakdown
- Daily reminders: 1, 3, and 7 days before payment

```bash
cd packages/discord-bot && ./install.sh
```

See the [Discord Bot README](packages/discord-bot/README.md) for setup details.

---

## Tech Stack

| Layer        | Technology                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Runtime**  | [Tauri 2](https://tauri.app/) (Rust backend)                                                                            |
| **Frontend** | [React 19](https://react.dev/) + TypeScript + [Vite 7](https://vitejs.dev/)                                             |
| **Styling**  | [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)                                        |
| **State**    | [Zustand](https://zustand-demo.pmnd.rs/)                                                                                |
| **Database** | SQLite via [rusqlite](https://github.com/rusqlite/rusqlite)                                                             |
| **Forms**    | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/)                                               |
| **Testing**  | [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) + [Playwright](https://playwright.dev/) |

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ (22 recommended)
- [pnpm](https://pnpm.io/) 9+
- [Rust](https://rustup.rs/) (via rustup)
- **Linux:** `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
- **macOS:** `xcode-select --install`
- **Windows:** [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) + Visual Studio Build Tools

### Quick Start

```bash
git clone https://github.com/AI-Strategic-Forum/Subby.git
cd subby
pnpm install
pnpm tauri dev
```

### Commands

| Command                    | Description                     |
| -------------------------- | ------------------------------- |
| `pnpm tauri dev`           | Start development app           |
| `pnpm tauri build`         | Build production binaries       |
| `pnpm test`                | Run tests in watch mode         |
| `pnpm test:run`            | Run tests once                  |
| `pnpm test:coverage`       | Run tests with coverage report  |
| `pnpm test:e2e`            | Run Playwright E2E tests        |
| `pnpm lint`                | Run ESLint                      |
| `pnpm typecheck`           | Run TypeScript checks           |
| `pnpm check`               | Lint + typecheck + format check |
| `cargo test --workspace`   | Run Rust tests                  |
| `cargo clippy --workspace` | Run Rust linter                 |

### Project Structure

```
subby/
├── src/                    # React frontend
│   ├── components/         # UI components (shadcn + custom)
│   ├── hooks/              # Custom React hooks
│   ├── stores/             # Zustand state stores
│   ├── pages/              # Route-level page components
│   ├── types/              # TypeScript types + Zod schemas
│   ├── lib/                # Utilities (currency, dates, etc.)
│   ├── data/               # Static data (102 subscription templates)
│   └── styles/             # Global CSS + design tokens
├── src-tauri/              # Rust backend (Tauri commands)
├── crates/
│   ├── subby-core/         # Shared Rust business logic + SQLite
│   └── subby-mcp/          # MCP server + CLI binary
├── packages/
│   └── discord-bot/        # Discord reminder bot
├── public/
│   └── logos/templates/    # 93 bundled service logos
└── docs/                   # Documentation
```

---

## CLI Usage

Subby includes a CLI for managing subscriptions from the terminal:

```bash
cargo build --release -p subby-mcp

subby-mcp list                              # List all subscriptions
subby-mcp add "Netflix" 15.99 monthly       # Add subscription
subby-mcp update <id> --amount 17.99        # Update price
subby-mcp remove <id>                       # Delete
subby-mcp toggle <id>                       # Pause/resume
subby-mcp upcoming --days 14                # Upcoming payments
subby-mcp stats                             # Dashboard statistics
subby-mcp export --output backup.json       # Export data
subby-mcp import backup.json --clear        # Import data
```

The CLI shares the same SQLite database as the desktop app.

---

## AI Integration (MCP)

Subby includes an [MCP](https://modelcontextprotocol.io/) server that lets AI assistants like Claude manage your subscriptions conversationally.

### Claude Desktop Setup

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "subby": {
      "command": "/path/to/subby-mcp",
      "args": []
    }
  }
}
```

### Available Tools

| Tool                          | Description                     |
| ----------------------------- | ------------------------------- |
| `add_subscription`            | Add a new subscription          |
| `update_subscription`         | Update an existing subscription |
| `remove_subscription`         | Delete a subscription           |
| `toggle_subscription`         | Pause/resume a subscription     |
| `mark_payment_paid`           | Record a payment as paid        |
| `skip_payment`                | Skip a payment                  |
| `add_category`                | Create a new category           |
| `get_upcoming_payments`       | Upcoming payments within N days |
| `get_spending_by_category`    | Spending breakdown              |
| `export_data` / `import_data` | Backup and restore              |

### Available Resources

| URI                               | Description       |
| --------------------------------- | ----------------- |
| `subby://subscriptions`           | All subscriptions |
| `subby://categories`              | All categories    |
| `subby://settings`                | Current settings  |
| `subby://stats/dashboard`         | Spending totals   |
| `subby://payments/{year}/{month}` | Monthly payments  |

See the [MCP Setup Guide](docs/guides/mcp-setup.md) for detailed configuration.

---

## Data Storage & Privacy

Your data stays on your device. No cloud, no telemetry, no analytics.

| Platform | Location                               |
| -------- | -------------------------------------- |
| Linux    | `~/.local/share/subby/`                |
| macOS    | `~/Library/Application Support/subby/` |
| Windows  | `%APPDATA%/subby/`                     |

Data is stored in a plain SQLite database. You can inspect, backup, or migrate it with any SQLite tool.

---

## Contributing

Contributions are welcome! Whether it's bug fixes, features, or documentation.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run checks: `pnpm check && pnpm test:run && cargo test --workspace`
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines and [CLAUDE.md](CLAUDE.md) for code conventions.

---

## Documentation

| Doc                                                     | Description                  |
| ------------------------------------------------------- | ---------------------------- |
| [Docs Index](docs/README.md)                            | Full documentation map       |
| [Getting Started](docs/getting-started/installation.md) | Installation and setup       |
| [Architecture](docs/architecture/overview.md)           | System design and data flow  |
| [Database Schema](docs/architecture/database-schema.md) | Tables and migrations        |
| [MCP Setup](docs/guides/mcp-setup.md)                   | AI integration configuration |
| [Release Process](docs/guides/release-process.md)       | Versioning and releases      |
| [Troubleshooting](docs/troubleshooting.md)              | Common issues and solutions  |

---

## License

[MIT](./LICENSE) — free to use, modify, and distribute.

---

<p align="center">
  Built with care by <a href="https://github.com/AI-Strategic-Forum">AI Strategic Forum</a>
  <br/><br/>
  <a href="https://github.com/AI-Strategic-Forum/Subby">GitHub</a> &bull;
  <a href="https://github.com/AI-Strategic-Forum/Subby/issues">Issues</a> &bull;
  <a href="https://github.com/AI-Strategic-Forum/Subby/discussions">Discussions</a>
</p>
