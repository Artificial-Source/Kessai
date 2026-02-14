# Installation

Subby ships as a Tauri desktop app and can also be installed from source.

## Download Binaries

Download the latest release artifacts from:

- `https://github.com/ASF/Subby/releases`

Platform artifacts currently produced include Linux (`.deb`, `.rpm`, `.AppImage`), macOS (`.dmg`, `.app.tar.gz`), and Windows (`.msi`, `.exe`).

## Linux Installer Script

Use the bundled installer script if you want guided setup:

```bash
chmod +x install.sh
./install.sh
```

Non-interactive modes are also supported:

```bash
./install.sh --app
./install.sh --bot
./install.sh --all
```

## Verify Installation

After install, launch Subby and confirm:

1. Dashboard loads
2. You can add one subscription
3. Data persists after app restart

If anything fails, see `docs/troubleshooting.md`.
