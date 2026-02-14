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
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
  </a>
  <a href="https://github.com/ASF/Subby/releases">
    <img src="https://img.shields.io/github/v/release/ASF/Subby?display_name=tag" alt="Latest Release">
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

- **100% Offline Desktop App** — Your data never leaves your device
- **No Account Required** — Just download and start tracking
- **Open Source** — Audit the code, contribute, or fork it
- **Cross-Platform** — Linux, macOS, and Windows

## Features

| Feature              | Description                                                         |
| -------------------- | ------------------------------------------------------------------- |
| **Dashboard**        | Monthly/yearly spending stats, category donut chart, trend analysis |
| **Subscriptions**    | Add, edit, pause subscriptions with list/grid/bento views           |
| **Calendar**         | Visual payment calendar, mark payments as paid or skipped           |
| **Categories**       | 9 built-in categories + unlimited custom ones with colors           |
| **Multi-Currency**   | 10 currencies (USD, EUR, GBP, JPY, CAD, AUD, MXN, CNY, INR, BRL)   |
| **Themes**           | Dark, light, and system theme modes                                 |
| **Payment Cards**    | Manage cards and assign them to subscriptions                       |
| **Data Portability** | Export/import JSON backups anytime                                  |
| **Discord Bot**      | Optional reminder notifications in Discord                          |

## Screenshots

See release assets and media in the GitHub Releases page.

## Installation

### Quick Install (Linux)

**Step 1:** Install the prerequisites

```bash
# Install Node.js (if you don't have it)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
npm install -g pnpm

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Install Tauri dependencies (Ubuntu/Debian)
sudo apt install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

**Step 2:** Clone and install

```bash
git clone https://github.com/ASF/Subby.git
cd subby
./install.sh
```

> **Tip:** Run `./install.sh --help` to see all options, or `./install.sh --dry-run` to preview what will happen without making changes.

**Step 3:** Choose what to install

```
What would you like to install?

  1) Subby desktop app only
  2) Subby desktop app + Discord bot
  3) Discord bot only

Choose [1-3]: 1
```

**Non-interactive install** (for scripts/automation):

```bash
./install.sh --app      # Install desktop app only
./install.sh --bot      # Install Discord bot only
./install.sh --all      # Install everything
```

<details>
<summary><strong>Why does the installer need sudo?</strong></summary>

The installer uses `sudo` for:

- **apt install**: To install Tauri build dependencies (libwebkit2gtk, etc.)
- **dpkg -i / rpm -i**: To install the .deb/.rpm package system-wide to `/usr`
- **systemctl**: To set up the Discord bot as a background service

If you're on a distro that uses AppImage (not .deb/.rpm), **no sudo is needed** for the app itself.

You can always run `./install.sh --dry-run` first to see exactly what commands will be executed.

</details>

**Step 4:** Launch Subby!

Find "Subby" in your application menu, or run `subby` from the terminal.

---

### Download Pre-built Binaries

If you don't want to build from source, download from [GitHub Releases](https://github.com/ASF/Subby/releases):

| Platform                  | File                         | How to Install                        |
| ------------------------- | ---------------------------- | ------------------------------------- |
| **Ubuntu/Debian**         | `subby_x.x.x_amd64.deb`      | `sudo dpkg -i subby_*.deb`            |
| **Fedora/RHEL**           | `subby_x.x.x_amd64.rpm`      | `sudo rpm -i subby_*.rpm`             |
| **Any Linux**             | `subby_x.x.x_amd64.AppImage` | `chmod +x *.AppImage && ./*.AppImage` |
| **macOS (Apple Silicon)** | `Subby_x.x.x_aarch64.dmg`    | Double-click, drag to Applications    |
| **macOS (Intel)**         | `Subby_x.x.x_x64.dmg`        | Double-click, drag to Applications    |
| **Windows**               | `Subby_x.x.x_x64-setup.exe`  | Double-click, follow installer        |

> **Note**: Unsigned builds may show OS security warnings. Click "More info" → "Run anyway" (Windows) or right-click → "Open" (macOS). See [Troubleshooting](docs/troubleshooting.md).

---

### Uninstall

```bash
# If installed via install.sh
./uninstall.sh

# If installed via .deb
sudo dpkg -r subby

# If installed via .rpm
sudo rpm -e subby
```

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
| **Testing**  | [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) + [Playwright](https://playwright.dev/) |

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
git clone https://github.com/ASF/Subby.git
cd subby
pnpm install
pnpm tauri dev
```

### Commands

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `pnpm tauri dev`    | Start development app                        |
| `pnpm tauri build`  | Build production binaries                    |
| `pnpm test`         | Run tests in watch mode                      |
| `pnpm test:run`     | Run tests once                               |
| `pnpm test:coverage`| Run tests with coverage report               |
| `pnpm test:e2e`     | Run E2E tests                                |
| `pnpm lint`         | Run ESLint                                   |
| `pnpm typecheck`    | Run TypeScript checks                        |
| `pnpm format`       | Format frontend files                        |
| `pnpm format:check` | Check formatting                             |
| `pnpm check`        | Lint + typecheck + format check              |
| `pnpm start`        | Alias for Tauri dev                          |

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
│   ├── src/                # Tauri commands and inline migrations
│   └── tauri.conf.json     # App config and bundling
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

Contributions are welcome! Please read the [Contributing](CONTRIBUTING.md) guide and docs index first.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Documentation

- [Docs Index](docs/README.md) — Full documentation map
- [Getting Started](docs/getting-started/installation.md) — Installation and setup
- [Architecture Overview](docs/architecture/overview.md) — System design and data flow
- [Release Process](docs/guides/release-process.md) — Versioning and release checklist
- [Troubleshooting](docs/troubleshooting.md) — Common issues and solutions

## License

[MIT](./LICENSE) — feel free to use this for your own projects!

---

<p align="center">
  Maintained by <a href="https://github.com/ASF">ASF</a>
</p>
