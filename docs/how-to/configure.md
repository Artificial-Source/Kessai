# How to configure Kessai

Use this guide to set core preferences in **Settings**.

## Open Settings

In the app sidebar, select **Settings**.

## Configure appearance and currency

In **Appearance**:

1. Set **Theme** (`Dark`, `Light`, `System`).
2. Set **Default currency**.
3. (Optional) In the separate **Budget** section, set **Monthly budget**.

Default currency drives new subscription defaults, budget formatting, and spending totals. Totals include only your share of active, billable subscriptions in that currency and identify other currencies as excluded; Kessai does not convert them. Individual charges keep their own currency and use its standard minor units (for example, yen has no decimal places).

## Configure notifications (desktop behavior)

In **Notifications**:

1. Toggle notifications on/off.
2. Choose reminder lead times (`1, 3, 7, 14, 30` days).
3. Set notification time.
4. Use **Test** to send a test notification.

Reminders require desktop notification permission and a running Kessai renderer; browser mode does not send them. The scheduler checks after startup and hourly after the configured time, so that time is a lower bound rather than exact delivery. Missed lead-time windows are consolidated per renewal instead of generating a reminder for each missed window.

## Configure motion preferences

In **Motion**, adjust **Reduce motion**, page transitions, hover effects, and animation speed. Reduced motion is enabled when either the OS requests `prefers-reduced-motion: reduce` or the app setting is on; switching the app setting off does not override the OS.

## Configure categories, tags, and cards

In Settings:

- Use **Categories** to add/edit custom categories.
- Use **Tags** for tag organization.
- Use **Payment Cards** to manage card records used by subscriptions.

## Custom subscription logos

In the subscription add/edit dialog:

1. Open **Add subscription** or edit an existing one.
2. Choose **Upload custom logo**.
3. Pick a PNG, JPEG, WebP, or GIF image.

Accepted limits (desktop and browser):

- Formats: PNG, JPEG, WebP, GIF only — SVG is excluded
- Maximum file size: 5 MiB
- Maximum dimensions: 4096 px per side
- Stored as a WebP thumbnail next to the database

Validation errors from the picker or API are shown in the dialog. The form can also fetch a network logo from a subscription name or domain when that path is available; uploads use the same size and format limits.

## Choose a hosted access mode

Kessai never installs, runs, or configures the Tailscale daemon. Pick the mode that matches your setup:

| Mode                       | Surface                       | Authorization                                                         | Best for                                                            |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Desktop Private Web Access | Desktop Settings              | Tailscale identity **plus** an access-key-bootstrapped session cookie | Using the desktop app's data from other devices on your tailnet     |
| Standalone Tailscale-only  | `kessai-web --tailscale-only` | Tailscale identity only — no second Kessai login                      | Trusted headless host (Docker, mini PC) behind host Tailscale Serve |

Canonical identity flow and host-trust boundary: [How Tailscale identity reaches Kessai](../explanation/security-and-privacy.md#how-tailscale-identity-reaches-kessai). API contracts: [Tailscale-only standalone mode](../reference/web-api.md#tailscale-only-standalone-mode) and [Private-hosted mode](../reference/web-api.md#private-hosted-mode).

## Configure standalone Tailscale-only hosting

Use this mode for a headless `kessai-web` process (for example, a Mac Mini running Docker) when Tailscale identity should be the only remote authorization step.

1. Bind the host-published service only to loopback.
2. Start `kessai-web` with `--tailscale-only`.
3. Point Tailscale Serve at that loopback port:

   ```bash
   kessai-web --tailscale-only --host 127.0.0.1 --port 8482 --dist-dir dist
   tailscale serve --bg http://127.0.0.1:8482
   ```

4. Open the HTTPS `.ts.net` URL. Settings shows whether the current request is local or connected through Tailscale and displays the validated Tailscale login. That status comes from server-generated request context after policy validation (`GET /api/access/status`), not from browser-side Tailscale detection.

This mode has no Kessai key, cookie, credential store, or account. It requires a single nonempty `Tailscale-User-Login`, a valid `.ts.net` authority, and exact HTTPS `Origin` on mutations. Tailscale Funnel is rejected because it does not provide the required identity.

**Identity in plain language:** a remote browser cannot choose its identity. Tailscale Serve strips caller-supplied identity fields, injects a verified `Tailscale-User-Login`, and proxies to Kessai. Kessai validates that login plus `.ts.net` authority and HTTPS Origin. Only software already able to reach the host-local backend can imitate those internal headers; that is an accepted host-trust boundary for identity-only mode, not a remote bypass. Full detail: [Security and privacy](../explanation/security-and-privacy.md#how-tailscale-identity-reaches-kessai).

Never publish the port on `0.0.0.0` at the host. A container may listen on `0.0.0.0:3000` internally only when both `--tailscale-only` and `--trust-tailscale-proxy` are set and Docker publishes it as `127.0.0.1:8482:3000`; then run `tailscale serve --bg http://127.0.0.1:8482` on the host. Persist `/data` (with `--db-path /data/kessai.db`) so the database, sibling logos, and logs survive recreation — see [Run Tailscale-only standalone hosting](./run-locally.md#run-tailscale-only-standalone-hosting). The unauthenticated `GET` or `HEAD` `/__kessai/health` returns `204` with no data for container health checks.

## Configure Private Web Access via Tailscale

Use this desktop-only setting to reach Kessai privately from devices in your tailnet. It is disabled by default.

### Prerequisites

- Install Tailscale and sign in on the Kessai host and every device that will access it.
- Ensure your tailnet policy allows the intended people and devices.
- Choose an unused local port from `1024` through `65535` (the default is `3000`).

### Start access

1. In **Settings → Private Web Access**, turn on **Enable private local server**.
2. Enter the local port and select **Apply changes**.
3. Confirm **Kessai local server status** is **Running**. `Stopped` means it is disabled, `Starting` or `Stopping` means a change is in progress, and `Error` shows why Kessai could not run the server.
4. Copy the **Access key** shown in Settings. Keep it private; it is not included in the Serve command.
5. On the Kessai host, run the exact command shown in Settings. For the default port it is:

   ```bash
   tailscale serve --bg http://127.0.0.1:3000
   ```

6. Open the HTTPS `.ts.net` URL printed by Tailscale.
7. Paste the key into the Kessai access page. The browser receives a host-only, HttpOnly cookie containing a random session token, not the key.

The key prompt is not an account or full login system. Kessai stores the stable key in its machine-local Private Web Access config (owner-only on Unix). Changing the port or restarting Kessai preserves the key, but starting a new private server creates a new session token and browsers must enter the key again. Disabling and re-enabling access also rotates the key and revokes sessions.

Kessai listens only on `127.0.0.1`. It does not install, run, configure, or probe the Tailscale daemon, but it does recognize a request through validated Serve headers. Tailscale Serve and your tailnet policy control who reaches the access page, while the key protects the SPA and API. Do not use Tailscale Funnel: Kessai rejects it before showing the key page.

### Keep it running or stop it

Closing the Kessai window hides it to the tray and leaves Private Web Access running. **Quit** gracefully stops Kessai's local server. The background Tailscale Serve configuration remains after Kessai quits; run `tailscale serve reset` yourself when you no longer want that configuration.

Full backup restore/import is blocked while Private Web Access is starting, running, or stopping. Export remains available. Stop Private Web Access before restoring or importing a backup.

## Launch Kessai at login

Desktop Settings includes an opt-in **Launch Kessai at login** control in **Desktop App**. It is off by default and reads the real OS autostart state.

When enabled:

- Kessai starts hidden in the tray after your OS user login (not as a pre-login service).
- Normal app setup still runs, so enabled Private Web Access auto-starts with it.
- Explicit **Quit** stops Kessai and its local server.

Kessai does not install, run, configure, or probe the Tailscale daemon for this setting. Keep using the Serve command shown under Private Web Access when you want tailnet access.

## Configure backup defaults

In **Data & Backup**:

- Run **Export Backup** to create a baseline JSON snapshot.
- Use **Import Data** when restoring or importing external data.

Restore validates every record and reference before writing, normalizing supported legacy forms first; invalid data rejects the entire restore. See [Backup format](../reference/backup-format.md).

## See also

- [Tutorial: First run](../tutorials/first-run.md)
- [Hosted access troubleshooting](./troubleshoot.md#hosted-web-access)
- [Web API: Tailscale-only standalone mode](../reference/web-api.md#tailscale-only-standalone-mode)
- [Web API: Private-hosted mode](../reference/web-api.md#private-hosted-mode)
- [Security and privacy](../explanation/security-and-privacy.md)
