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
  Built with Tauri 2, React 19, and SQLite.
</p>

<p align="center">
  <a href="https://github.com/g0dxn4/subby/actions/workflows/ci.yml">
    <img src="https://github.com/g0dxn4/subby/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
  </a>
  <a href="https://github.com/g0dxn4/subby/releases">
    <img src="https://img.shields.io/badge/version-0.1.0-green.svg" alt="Version">
  </a>
  <a href="https://codecov.io/gh/g0dxn4/subby">
    <img src="https://codecov.io/gh/g0dxn4/subby/branch/master/graph/badge.svg" alt="codecov">
  </a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#installation">Installation</a> •
  <a href="#discord-bot">Discord Bot</a> •
  <a href="#development">Development</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Why Subby?

Most subscription trackers are cloud-based, require accounts, and monetize your data. Subby is different:

- **100% Offline** — Your data never leaves your device
- **No Account Required** — Just download and start tracking
- **Open Source** — Audit the code, contribute, or fork it
- **Cross-Platform** — Linux, macOS, and Windows

## Features

| Feature              | Description                                                         |
| -------------------- | ------------------------------------------------------------------- |
| **Dashboard**        | Monthly/yearly spending stats, category donut chart, trend analysis |
| **Subscriptions**    | Add, edit, pause subscriptions with grid/list views                 |
| **Calendar**         | Visual payment calendar, mark payments as paid or skipped           |
| **Categories**       | 9 built-in categories + unlimited custom ones with colors           |
| **Multi-Currency**   | USD, EUR, GBP, JPY, CAD, AUD, MXN support                           |
| **Themes**           | Dark, light, and system theme modes                                 |
| **Data Portability** | Export/import JSON backups anytime                                  |
| **Discord Bot**      | Optional reminder notifications in Discord                          |

## Screenshots

> _Screenshots coming soon_

## Installation

### Linux (Recommended)

One command does everything:

```bash
git clone https://github.com/g0dxn4/subby.git
cd subby
./install.sh
```

The installer will:

- Check and install dependencies
- Build the app
- Install system-wide (.deb, .rpm, or AppImage)
- Optionally set up the Discord reminder bot

To uninstall: `./uninstall.sh`

### macOS & Windows

Download the latest release from [GitHub Releases](https://github.com/g0dxn4/subby/releases).

| Platform | File                                                    |
| -------- | ------------------------------------------------------- |
| macOS    | `Subby_x.x.x_aarch64.dmg` or `Subby_x.x.x_x64.dmg`      |
| Windows  | `Subby_x.x.x_x64-setup.exe`                             |
| Linux    | `subby_x.x.x_amd64.deb` or `subby_x.x.x_amd64.AppImage` |

> **Note**: Unsigned builds may show OS security warnings. See [Troubleshooting](docs/troubleshooting.md).

## Discord Bot

Get subscription reminders directly in Discord! The bot reads your exported Subby data and sends notifications before payments are due.

**Features:**

- Daily reminders (1, 3, 7 days before payment)
- `/upcoming` — View upcoming payments
- `/summary` — Monthly spending breakdown

**Quick Setup:**

```bash
cd packages/discord-bot
./install.sh
```

See the [Discord Bot README](packages/discord-bot/README.md) for detailed setup.

## Tech Stack

| Layer        | Technology                                                                       |
| ------------ | -------------------------------------------------------------------------------- |
| **Runtime**  | [Tauri 2](https://tauri.app/) (Rust backend)                                     |
| **Frontend** | [React 19](https://react.dev/) + TypeScript + [Vite](https://vitejs.dev/)        |
| **Styling**  | [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) |
| **State**    | [Zustand](https://zustand-demo.pmnd.rs/)                                         |
| **Database** | SQLite via [tauri-plugin-sql](https://github.com/tauri-apps/plugins-workspace)   |
| **Forms**    | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/)        |
| **Testing**  | [Vitest](https://vitest.dev/) + [Playwright](https://playwright.dev/)            |

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ (22 recommended)
- [pnpm](https://pnpm.io/) 9+
- [Rust](https://rustup.rs/) (via rustup)

**Linux (Debian/Ubuntu):**

```bash
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

**macOS:** Xcode Command Line Tools (`xcode-select --install`)

**Windows:** [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) + Visual Studio Build Tools

### Run from Source

```bash
git clone https://github.com/g0dxn4/subby.git
cd subby
pnpm install
pnpm tauri dev
```

### Commands

| Command            | Description               |
| ------------------ | ------------------------- |
| `pnpm tauri dev`   | Start development server  |
| `pnpm tauri build` | Build production binaries |
| `pnpm test`        | Run unit tests            |
| `pnpm test:e2e`    | Run E2E tests             |
| `pnpm lint`        | Run ESLint                |
| `pnpm typecheck`   | Run TypeScript checks     |

### Project Structure

```
subby/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # Custom React hooks
│   ├── stores/             # Zustand state stores
│   ├── pages/              # Page components
│   ├── types/              # TypeScript types
│   └── lib/                # Utilities
├── src-tauri/              # Rust backend
│   ├── src/                # Tauri commands
│   └── migrations/         # SQLite migrations
├── packages/
│   └── discord-bot/        # Discord reminder bot
└── docs/                   # Documentation
```

## Data Storage

Your data stays on your device:

| Platform | Location                               |
| -------- | -------------------------------------- |
| Linux    | `~/.local/share/subby/`                |
| macOS    | `~/Library/Application Support/subby/` |
| Windows  | `%APPDATA%/subby/`                     |

## Contributing

Contributions are welcome! Please read the [Architecture](docs/architecture.md) doc to understand the codebase.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Documentation

- [Architecture Overview](docs/architecture.md) — System design and data flow
- [Backend API](docs/backend-api.md) — Rust commands and database schema
- [Troubleshooting](docs/troubleshooting.md) — Common issues and solutions

## License

[MIT](./LICENSE) — feel free to use this for your own projects!

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/g0dxn4">g0dxn4</a>
</p>
