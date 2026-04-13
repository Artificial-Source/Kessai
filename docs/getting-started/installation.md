# Installation

Kessai ships as a Tauri desktop app and also exposes CLI, MCP, and web entrypoints through the `kessai` command.

## Download Binaries

Download the latest release artifacts from:

- `https://github.com/Artificial-Source-Foundation/Kessai/releases`

Platform artifacts currently produced include Linux (`.deb`, `.rpm`, `.AppImage`), macOS (`.dmg`, `.app.tar.gz`), and Windows (`.msi`, `.exe`).

## Linux Installer Script

Use the bundled installer script if you want guided setup:

```bash
chmod +x install.sh
./install.sh --from-source
```

After installation:

```bash
kessai
kessai list
kessai mcp
kessai web --port 3000
```

Use `./install.sh` without flags if you only want the desktop app from releases.

## Verify Installation

After install, launch Kessai and confirm:

1. Dashboard loads
2. You can add one subscription
3. Data persists after app restart

If anything fails, see `docs/troubleshooting.md`.
