# How to troubleshoot Kessai

This page covers common problems grounded in current source behavior.

## Installed desktop app won't start or open

Common install/startup cases:

- **macOS (unverified developer / Gatekeeper):** if the app is blocked by
  Gatekeeper, use Finder → open context menu on `Kessai.app` → **Open**,
  then confirm in the dialog.
- **Windows SmartScreen warning:** choose **More info** and **Run anyway** for the
  official installer you downloaded.
- **Linux package confusion:** AppImage, `.deb`, and `.rpm` have different
  install paths and dependencies. If you hit missing shared libs from a downloaded
  AppImage, prefer the distro package for your platform or use package-manager
  fixes first, then retry after a clean re-run of install.

For startup failures after install, check app logs under:

- Linux: `~/.local/share/com.asf.kessai/logs/`
- macOS: `~/Library/Application Support/com.asf.kessai/logs/`
- Windows: `%APPDATA%/com.asf.kessai/logs/`

The desktop UI can also export logs from **Settings → Data & Backup → Download Logs**.

## App in browser mode shows “Web API is not running”

Symptom:

- Banner says web API is unavailable.

Why:

- In web mode, frontend calls `/api/*` and needs `kessai-web` running.

Fix:

```bash
pnpm dev:web
```

If you run only `pnpm dev`, start the backend separately:

```bash
cargo run -p kessai-web -- --port 3000
```

## `pnpm tauri dev` or `pnpm tauri build` fails on Linux

Install Tauri build dependencies (Ubuntu/Debian):

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

Then retry:

```bash
pnpm tauri dev
```

## Import fails with invalid backup data

Backup import is validated before DB write.

Checks include:

- Required top-level keys (`version`, `exportedAt`, `subscriptions`, `categories`, `payments`, `settings`)
- Size limits (for example subscriptions/categories/payments limits in `src/lib/data-management.ts`)

What to do:

1. Confirm file is valid JSON.
2. Confirm file is a Kessai backup export.
3. Retry with an unmodified export file.

Reference:

- [Backup format](../reference/backup-format.md)

## MCP server cannot access expected database

By default, `kessai-mcp` resolves DB path from platform data dir (`com.asf.kessai`) or current directory fallback.

Set DB path explicitly if needed:

```bash
./target/release/kessai-mcp --db-path /absolute/path/to/kessai.db
```

or

```bash
KESSAI_DB_PATH=/absolute/path/to/kessai.db ./target/release/kessai-mcp
```

## Find logs

Kessai writes logs under the app data directory (`logs/` next to the DB).

- Desktop app data root: see [Filesystem](../reference/filesystem.md)
- Web/MCP also create `logs` next to the resolved DB path

From the desktop UI, you can also download logs in **Settings → Data & Backup → Download Logs**.

## Still stuck?

When filing an issue, include:

- OS and version
- Exact command you ran
- Error output
- Whether you were in desktop mode, web mode, or MCP mode

Issue tracker: <https://github.com/Artificial-Source-Foundation/Kessai/issues>

## See also

- [How to run locally](./run-locally.md)
- [How to test](./test.md)
- [How to use MCP server](./use-mcp-server.md)
- [Filesystem](../reference/filesystem.md)
