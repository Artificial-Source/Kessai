# How to install Kessai

Use this page when you want a working install quickly.

## Install the desktop app from releases (recommended)

Download assets from:

- <https://github.com/Artificial-Source/Kessai/releases>

### Desktop packages by platform

| Platform      | Asset       | Install                                             |
| ------------- | ----------- | --------------------------------------------------- |
| Ubuntu/Debian | `.deb`      | `sudo dpkg -i kessai_*.deb`                         |
| Fedora/RHEL   | `.rpm`      | `sudo rpm -i kessai-*.rpm`                          |
| Any Linux     | `.AppImage` | `chmod +x Kessai-*.AppImage && ./Kessai-*.AppImage` |
| macOS         | `.dmg`      | Open DMG, drag app to Applications                  |
| Windows       | `.exe`      | Run installer                                       |

The Linux `./install.sh` release path rejects HTTP download errors, downloads the matching `.sha256` sidecar, verifies its digest, and checks the AppImage ELF/AppImage magic bytes before making it executable. If a release advertises any sidecars, the selected asset's sidecar is required; missing, unavailable, or mismatched checksums abort without falling back to a source build. Only older releases with no sidecars use format-only validation, with a warning.

The verified desktop executable is staged in the destination bin directory and atomically renamed into place, so failed downloads or verification leave the previous installation intact. Checksums detect corruption but are not independent signatures: first installation still trusts GitHub HTTPS and the release publisher. The in-app updater separately verifies Tauri signatures.

If Debian install reports missing dependencies:

```bash
sudo apt-get install -f
```

### macOS Gatekeeper

Release updater bundles are signed for the in-app updater channel. Apple Developer ID code signing and notarization are not part of the current release workflow, so Gatekeeper may still treat a fresh `.dmg` install as an unidentified developer.

If macOS blocks the app:

1. In Finder, locate `Kessai.app` (usually in **Applications**).
2. Control-click (or right-click) the app and choose **Open**.
3. Confirm **Open** in the dialog.

You only need this manual-open path once per install in typical Gatekeeper behavior. If startup still fails, see [Troubleshoot](./troubleshoot.md#installed-desktop-app-wont-start-or-open).

## Update the desktop app

In the installed desktop app, open **Settings → Desktop App → Updates**.

- **Check now** fetches update metadata from GitHub Releases; installation verifies signed updater artifacts.
- When an update is available, install it from Settings; the app restarts into the new version.
- The desktop updater updates the Tauri app only. It does **not** update a separately installed `kessai-mcp` binary — rerun the CLI installer (or replace the binary) for that.

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
git clone https://github.com/Artificial-Source/Kessai.git
cd Kessai
pnpm install --reporter=silent
pnpm start
```

## Install CLI/MCP binary

`kessai-mcp` is the full CLI and MCP server over the same local database as the desktop app.

### One-command installers (recommended)

No admin rights. Installers download a release archive, verify the adjacent `.sha256` sidecar, check archive layout and binary version, and install into a user bin directory. Optional `--mcp-config`/`-McpConfig` runs `kessai-mcp setup --output` afterward. Adjacent checksum sidecars are part of the current release contract.

macOS / Linux (`install-cli.sh`):

```bash
curl -fsSL https://raw.githubusercontent.com/Artificial-Source/Kessai/main/install-cli.sh | sh

# options
./install-cli.sh --help
./install-cli.sh --version X.Y.Z
./install-cli.sh --dry-run
./install-cli.sh --bin-dir "$HOME/bin" --mcp-config .mcp.json
```

Default bin dir: `${XDG_BIN_HOME:-$HOME/.local/bin}`.

Windows PowerShell (`install-cli.ps1`):

```powershell
irm https://raw.githubusercontent.com/Artificial-Source/Kessai/main/install-cli.ps1 | iex

.\install-cli.ps1 -Version X.Y.Z
.\install-cli.ps1 -DryRun
.\install-cli.ps1 -BinDir "$env:USERPROFILE\bin" -McpConfig .mcp.json
```

Default bin dir: `$env:LOCALAPPDATA\Kessai\bin`.

Supported release targets: Linux x64, macOS x64/arm64, Windows x64. Linux arm64 prebuilds are not published yet.

### Manual download or build

Download `kessai-mcp-<version>-<target>.{tar.gz,zip}` plus its `.sha256` from [Releases](https://github.com/Artificial-Source/Kessai/releases). Archives also include `LICENSE` and an offline `skills/kessai` copy.

Or build from source:

```bash
cargo build --release -p kessai-mcp
# ./target/release/kessai-mcp  (.exe on Windows)
```

Wire an MCP client with `kessai-mcp setup` (see [How to use the MCP server](./use-mcp-server.md)). Agent skill: `npx skills add Artificial-Source/Kessai --skill kessai`.

## Verify install

1. Open Kessai.
2. Confirm Dashboard, Subscriptions, and Settings load.
3. Add one test subscription and restart the app.

## See also

- [How to run locally](./run-locally.md)
- [How to configure Kessai](./configure.md)
- [How to troubleshoot](./troubleshoot.md)
- [How to use the MCP server](./use-mcp-server.md)
- [MCP and CLI](../reference/mcp-cli.md)
- [Tutorial: First run](../tutorials/first-run.md)
