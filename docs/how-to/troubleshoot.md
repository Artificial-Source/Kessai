# How to troubleshoot Kessai

This page covers common problems grounded in current source behavior.

## Installed desktop app won't start or open

Common install/startup cases:

- **macOS (unverified developer / Gatekeeper):** updater bundles are signed, but Apple Developer ID code signing and notarization are not configured yet. If Gatekeeper blocks the app, use Finder → open context menu on `Kessai.app` → **Open**, then confirm in the dialog. See [Install](./install.md#macos-gatekeeper).
- **Windows SmartScreen warning:** choose **More info** and **Run anyway** for the
  official installer you downloaded.
- **Linux package confusion:** AppImage, `.deb`, and `.rpm` have different
  install paths and dependencies. If you hit missing shared libs from a downloaded
  AppImage, prefer the distro package for your platform or use package-manager
  fixes first, then retry after a clean re-run of install.

For startup failures after install, check app logs under:

- Linux: `${XDG_DATA_HOME:-~/.local/share}/com.asf.kessai/logs/`
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

If a non-loopback standalone server returns `403`, configure the actual hostname/IP with repeatable `--allowed-host` or comma-separated `KESSAI_WEB_ALLOWED_HOSTS`. A wildcard bind does not allow arbitrary `Host` values; this check does not add authentication. See [Run the web server directly](./run-locally.md#run-web-server-directly).

## Hosted web access

Hosted access has two modes. Identify which one you are using before debugging:

| Mode                        | How it starts                             | Authorization                                                         |
| --------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| Standalone Tailscale-hosted | `kessai-web --tailscale-only`             | Tailscale identity only — no username, password, or access key        |
| Desktop Private Web Access  | Desktop **Settings → Private Web Access** | Tailscale identity **plus** an access-key-bootstrapped session cookie |

Canonical identity flow: [How Tailscale identity reaches Kessai](../explanation/security-and-privacy.md#how-tailscale-identity-reaches-kessai).

### Tailscale URL, identity, or ACL problems (both modes)

- Open the HTTPS `.ts.net` URL printed by `tailscale serve`, not a manually constructed URL or a direct non-loopback address.
- Confirm you are signed in to Tailscale as a user (not only a tagged device). Tagged-device traffic does not populate `Tailscale-User-Login`, so Kessai rejects it.
- Do not use Tailscale Funnel. Funnel lacks the required identity header and is rejected before the app loads.
- Check tailnet ACL policy if the intended user still cannot reach the Serve URL.
- Verify the active Serve configuration with `tailscale serve status`.

### Tailscale-only standalone (identity only)

- There is **no** Kessai username, password, or access key in this mode. If the browser shows a native Basic Auth prompt, that comes from an external reverse proxy (or similar), not from Kessai.
- In trusted-proxy container setups, direct requests to the container listener or its published localhost API without Serve identity return `403` on purpose. The no-data health path exists only in this standalone mode; verify it separately with:

  ```bash
  curl -I http://127.0.0.1:8482/__kessai/health
  # HTTP 204 No Content
  ```

- Confirm the host publish is loopback-only (`127.0.0.1:<host-port>:...`) and that host Tailscale Serve points at that port.
- Settings connection status comes from validated request context after policy checks, not from browser-side Tailscale detection.

### Desktop Private Web Access (identity + access key)

#### Port is occupied

If enabling Private Web Access reports that Kessai could not bind `127.0.0.1:<port>`, another process is using that port. Choose another port from `1024` through `65535`, apply the setting again, then run the updated Tailscale Serve command shown in Settings.

#### Missing `dist/` while developing the desktop app

A debug desktop build can start before the frontend bundle exists. If you then enable Private Web Access, Kessai needs `dist/index.html` and reports that you must run `pnpm build`. Run it from the repository root, then retry enabling access. Production Tauri builds verify this resource automatically.

#### Access key is rejected or the browser asks again

Copy the current **Access key** from desktop **Settings → Private Web Access** and paste it without spaces. The key is not part of the Serve command or cookie: the cookie contains a random token valid only for the current private server instance. Restarting the server requires entering the same key again; disabling and re-enabling access also rotates the key. Clearing site cookies makes the browser ask again.

#### Serve still points at Kessai after quitting

Quitting Kessai stops its local server but does not change the Tailscale configuration. To remove the persisted Serve configuration, run:

```bash
tailscale serve reset
```

To use it again, start Kessai Private Web Access and run the command shown in Settings.

## Custom logo upload fails

- Supported formats: PNG, JPEG, WebP, GIF only. SVG is excluded.
- Maximum size: 5 MiB. Maximum dimensions: 4096 px per side.
- Desktop and browser both use the same limits; the image is stored as a WebP thumbnail.
- If the file picker rejects the file or the API returns a validation error, fix the image — do not blame Tailscale or hosted access policy for a local picker/API failure.
- Network logo fetch is a separate path and can fail for DNS or remote-host reasons even when custom upload works.

## `pnpm start` or `pnpm tauri build` fails on Linux

Install Tauri build dependencies (Ubuntu/Debian):

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

Then retry:

```bash
pnpm start
```

## Import fails with invalid backup data

Backup import is validated before DB write.

Checks include:

- Required top-level keys (`version`, `exportedAt`, `subscriptions`, `categories`, `payments`, `settings`)
- Size limits (for example subscriptions/categories/payments limits in `src/lib/data-management.ts`)
- Core validation checks every record's amount, dates, currency, billing day, colors, lengths, and cross-record references after supported legacy normalizations. An invalid record rejects the whole restore before writing; the error identifies its collection/record and field.
- Full backup restore/import is blocked while desktop Private Web Access is starting, running, or stopping — stop Private Web Access first. Standalone Tailscale-hosted import remains enabled.

What to do:

1. Confirm file is valid JSON.
2. Confirm file is a Kessai backup export.
3. Retry with an unmodified export file.
4. If an export names an unreadable stored subscription, repair its invalid fields or delete it by ID before retrying. Export intentionally fails rather than producing a backup that omits that row.

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

Issue tracker: <https://github.com/Artificial-Source/Kessai/issues>

## See also

- [How to run locally](./run-locally.md)
- [How to configure](./configure.md)
- [How to test](./test.md)
- [How to use MCP server](./use-mcp-server.md)
- [Security and privacy](../explanation/security-and-privacy.md)
- [Filesystem](../reference/filesystem.md)
