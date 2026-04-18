# How to install Kessai

Use this page when you want a working install quickly.

## Install the desktop app from releases (recommended)

Download assets from:

- <https://github.com/Artificial-Source-Foundation/Kessai/releases>

### Desktop packages by platform

| Platform | Asset | Install |
| --- | --- | --- |
| Ubuntu/Debian | `.deb` | `sudo dpkg -i kessai_*.deb` |
| Fedora/RHEL | `.rpm` | `sudo rpm -i kessai-*.rpm` |
| Any Linux | `.AppImage` | `chmod +x Kessai-*.AppImage && ./Kessai-*.AppImage` |
| macOS | `.dmg` | Open DMG, drag app to Applications |
| Windows | `.exe` | Run installer |

If Debian install reports missing dependencies:

```bash
sudo apt-get install -f
```

## Build from source (developer install)

Prerequisites (as documented in repository README/package scripts):

- Node.js 22+
- pnpm 10+
- Rust stable
- Tauri system dependencies

Ubuntu/Debian build dependencies:

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

Build and run:

```bash
git clone https://github.com/Artificial-Source-Foundation/Kessai.git
cd Kessai
pnpm install --reporter=silent
pnpm tauri dev
```

## Install MCP/CLI binary

Releases also include `kessai-mcp` artifacts, or build it yourself:

```bash
cargo build --release -p kessai-mcp
```

Binary path:

- `./target/release/kessai-mcp` (or `.exe` on Windows)

## Verify install

1. Open Kessai.
2. Confirm Dashboard, Subscriptions, and Settings load.
3. Add one test subscription and restart the app.

## See also

- [How to run locally](./run-locally.md)
- [How to configure Kessai](./configure.md)
- [Tutorial: First run](../tutorials/first-run.md)
