# Security and privacy

Kessai is privacy-oriented, but it is not network-free in every mode. The actual trust boundaries come from the code and config in `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs`, `crates/kessai-web/src/main.rs`, `crates/kessai-mcp/src/main.rs`, and the shared frontend utilities.

## What stays local by default

For normal desktop use, Kessai stores its primary data on-device:

- SQLite database in the app data directory
- saved logos in `logos/`
- desktop, web, and MCP logs in `logs/`
- some browser-side cache and log state in `localStorage`

There is no checked-in account or cloud sync layer. Managed Private Web Access adds the local shared-secret gate described below; it is not an account system.

## Network touchpoints

| Surface or feature        | Network use                                                                                                        | Source                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Desktop updater           | Fetches release metadata and assets from GitHub                                                                    | `src-tauri/tauri.conf.json`, `src/stores/update-store.ts` |
| Logo fetch                | Requests favicon-like images from Google                                                                           | `src-tauri/src/lib.rs`, `crates/kessai-web/src/routes.rs` |
| Standalone web mode       | Opens an HTTP server on `127.0.0.1:<port>` by default; optional Tailscale-only policy can authorize Serve identity | `crates/kessai-web/src/main.rs`                           |
| Private Web Access        | Desktop starts an in-process loopback server only when enabled; the user separately configures Tailscale Serve     | `src-tauri/src/private_web_access.rs`                     |
| MCP stdio (`serve`)       | stdio only; can change the same local database unless `--read-only` is set                                         | `crates/kessai-mcp/src/main.rs`                           |
| MCP HTTP (`serve --http`) | Optional loopback Streamable HTTP on `127.0.0.1` only; bearer token required                                       | `crates/kessai-mcp/src/http.rs`                           |

So the strongest privacy posture is the installed desktop app with no updater or logo fetch at that moment. Web mode, optional MCP HTTP, and network-assisted features widen the boundary.

## Desktop-specific protections

### Content Security Policy

`src-tauri/tauri.conf.json` defines a CSP that keeps scripts self-hosted and restricts network connections to the GitHub hosts needed for updater traffic.

### Updater verification

The Tauri updater config includes a checked-in public key in `src-tauri/tauri.conf.json`, and the release workflow signs updater artifacts with `TAURI_SIGNING_PRIVATE_KEY`. The UI in `src/components/settings/update-settings.tsx` reflects that signed-update model.

### File validation

Desktop and web logo commands reject path traversal patterns and only allow safe `.webp` destination filenames. Their shared decoder accepts only PNG, JPEG, WebP, or GIF magic, caps source bytes at 5 MiB, dimensions at 4096×4096, and decoder allocation before thumbnailing to WebP. Desktop reads selected files through the same byte cap; remote favicon responses are streamed through it. SVG is excluded.

### Renderer filesystem permissions

`src-tauri/capabilities/default.json` grants `fs:allow-write-text-file` for exports and `dialog:default` for file dialogs, not general filesystem access to the app data directory. Database and logo operations go through native commands rather than renderer reads/writes of that directory. Other native permissions (notifications, updater, process, autostart, and window controls) remain separately listed in that capability file.

## Data-integrity protections

| Area                     | Protection                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Forms and frontend input | Zod-backed types in `src/types/*.ts`                                                                                                       |
| Backup restore           | Frontend file caps plus complete core validation of normalized records, dates, currencies, amounts, lengths, and references before writing |
| Import transactionality  | Full restore writes through one `BEGIN IMMEDIATE` transaction; failures roll the operation back                                            |
| Shared domain rules      | Desktop, web, CLI, and MCP all reuse `KessaiCore` instead of duplicating business logic                                                    |

Exports read the collections in one snapshot and fail closed if a row cannot be decoded or validated; they never silently omit that row. Corrupt subscription rows can be deleted by ID without decoding them, or repaired through a valid update. See [Backup format](../reference/backup-format.md).

## MCP HTTP trust boundary

`kessai-mcp serve --http` is an **optional local-agent transport**, not remote hosting and not Private Web Access. It binds only `127.0.0.1` (default port `8742`, endpoint `/mcp`; `--port 0` picks a free port). There is no CORS configuration and no Tailscale integration. Both transports support enforced `--read-only` mode, which hides and rejects all non-read-only tools, including file-writing backup export.

Auth is a bearer token of at least 32 non-whitespace bytes from `KESSAI_MCP_TOKEN` or, on Unix, `--token-file` (there is no `--token` CLI flag — avoid putting secrets on the command line). An explicit token file takes precedence, is opened without following symlinks, and must be a regular file owned by the effective user with no group or other permissions (`chmod 600`). Windows rejects `--token-file` because portable ACL validation is not implemented; use `KESSAI_MCP_TOKEN` there. Clients must send `Authorization: Bearer <token>`. The server also validates `Host` (`127.0.0.1:<port>` or `localhost:<port>`) and, when present, matching `Origin`. Prefer stdio MCP unless a client explicitly needs Streamable HTTP. Details: [Loopback HTTP setup](../how-to/use-mcp-server.md#optional-loopback-http).

## How Tailscale identity reaches Kessai

This is the canonical explanation for both desktop **Private Web Access** and standalone **Tailscale-only** hosting. Kessai never installs, runs, configures, or probes the Tailscale daemon. The user (or host) runs Tailscale Serve separately. Kessai only recognizes a request after validating the headers Serve injects.

### Plain request flow

1. A remote browser opens the HTTPS `.ts.net` URL that Tailscale Serve publishes. The browser cannot choose or spoof a Tailscale identity of its own choosing for that path.
2. Tailscale Serve strips caller-supplied identity fields and injects verified identity headers for signed-in user traffic. The important one for Kessai is `Tailscale-User-Login`. See the [Tailscale Serve identity-header documentation](https://tailscale.com/docs/features/tailscale-serve#identity-headers).
3. Serve proxies the request to Kessai's host-local backend (almost always `127.0.0.1:<port>`).
4. Kessai validates the request policy before the SPA or API runs:
   - exactly one nonempty `Tailscale-User-Login`
   - a valid `.ts.net` authority from `Host` / `X-Forwarded-Host`
   - HTTPS semantics for the hosted path
   - an exact matching HTTPS `Origin` on state-changing methods
5. When those checks pass, the request receives a server-generated access context. Authenticated `GET /api/access/status` reports that context (`server_mode`, `connection`, and optional `tailscale_login`) so browser Settings can show whether the request is local or through Tailscale and which login was validated. This is not browser-side Tailscale detection.

Tagged-device traffic does not populate the user identity header, so it is unsupported. Tailscale Funnel also lacks the required identity and is rejected; do not use Funnel.

### Accepted host-trust boundary

Only software that can already reach the host-local backend can imitate the internal Serve identity headers. Other PCs on the LAN, other tailnet users who cannot reach Serve, and internet visitors cannot bypass authorization this way.

That local imitation path is an **accepted host-trust boundary**, not a remote bypass:

- Identity-only Tailscale-hosted mode deliberately trusts host-local workloads and protects against remote LAN/public clients.
- It does **not** protect against a malicious local administrator, root, or malware already able to talk to the loopback-published port.
- A compromised host is a broader compromise of the machine and its data, not a Tailscale-specific failure of Kessai.

Keep the real host publish on `127.0.0.1` and let host Tailscale Serve be the only remote entry point. Non-loopback listeners fail closed unless trusted-proxy mode is explicit (for example a container listening on `0.0.0.0` internally while Docker publishes only `127.0.0.1:8482:3000`). Trusted-proxy mode still rejects direct-form requests.

## Unauthenticated standalone web trust boundary

Without `--tailscale-only`, `kessai-web` is an unauthenticated local API. On a loopback listener, it accepts only `localhost`, `127.0.0.1`, or `[::1]` authorities, with any valid port or no explicit port. This includes Vite's development proxy (`Host: localhost:3000`). On a non-loopback listener, it accepts the bound IP literal and explicitly configured `--allowed-host <host>` entries (repeatable, or comma-separated `KESSAI_WEB_ALLOWED_HOSTS`). Wildcard binding such as `--host 0.0.0.0` does not allow arbitrary request hosts: configure each hostname or IP clients actually use. Loopback listeners cannot be widened with `--allowed-host`.

For `POST`, `PUT`, `DELETE`, and `PATCH`, an `Origin` header, when present, must be an HTTP(S) loopback origin or an origin for the bound non-loopback IP or a configured allowed host. Ports may differ so browser development at `http://localhost:1430` works through the Vite proxy. Malformed or duplicate authorities/origins and disallowed hosts/origins receive a no-store `403` before the API or static files run. Missing `Origin` remains allowed for curl, CLI, and other non-browser clients.

These checks mitigate browser DNS rebinding and cross-origin mutations; they are not authentication. Any process that can reach the listener and choose accepted headers can read and change the database. Explicit non-loopback binding still exposes the unauthenticated read/write API to reachable networks; restrict access at the network boundary.

## Tailscale-only standalone trust boundary

`kessai-web --tailscale-only` is intended for a headless host where host Tailscale Serve is the only remote entry point. It has **no second Kessai login**: no shared secret, cookie, credential store, or account. Authorization is Tailscale identity alone, using the flow above.

A loopback listener also permits canonical direct local requests, which report a local connection. The identity-free `/__kessai/health` path returns only `204` for `GET` or `HEAD` and is the only identity-free Tailscale-only path. Tailscale-only standalone import remains enabled because this process has no desktop server lifecycle race.

## Private Web Access trust boundary

Private Web Access is an opt-in desktop feature, disabled by default. Kessai listens only on `127.0.0.1` and persists the machine-local setting and high-entropy access key in `private-web-access.json`. Atomic writes keep that file owner-only on Unix. The key remains stable across restarts and port changes, but a disabled-to-enabled transition rotates it. Kessai does not install, run, configure, or probe the Tailscale daemon; it does recognize validated Serve requests through the identity flow above. The user runs `tailscale serve --bg http://127.0.0.1:<port>`, and Tailscale retains that configuration until the user resets it.

After the authority, Tailscale identity, and `Origin` checks, every private-hosted SPA/API request also needs the access cookie. A browser without it sees Kessai's server-rendered key page; a correct key creates a host-only, HttpOnly, `SameSite=Strict` cookie (`Secure` on `.ts.net`). The cookie carries a random session token, never the persistent access key. The token is valid only for that server instance; restarting the private server or rotating the key invalidates existing sessions and requires entering the key again.

This is a shared-secret gate, not a web account or full login system. Cookies are host-scoped, not port-scoped: another service on the same loopback hostname can receive the session cookie if the browser visits it and replay that session while the Kessai server instance runs. HttpOnly does not prevent another server from receiving cookies. The separate session token prevents disclosure of the persistent key but does not provide isolation from other local OS principals operating such a service. Prefer the protected HTTPS Tailscale Serve origin rather than direct loopback browser access when that distinction matters; same-user processes remain inside the product threat model.

Tailnet policy determines who may reach the hosted URL. Private-hosted mode allows only canonical direct loopback authorities, requires matching `Origin` for mutations (including the key form), does not use permissive CORS, and adds browser security headers. The separate unauthenticated standalone authority/origin policy above does not add a login.

## Operational caveats

- Browser-side `localStorage` entries such as `kessai-logs` and `kessai-sent-notifications` are convenience storage, not encrypted secret storage.
- Logs may include operational details such as paths, errors, and app state transitions.
- The desktop app is only as private as the local machine account and disk it runs on.
- The desktop manager blocks its full backup restore/import while Private Web Access starts, runs, or stops, and the private-hosted `POST /api/import` route is always disabled; export remains available. This is not a cross-process lock: separately running MCP/CLI processes and standalone web servers are not blocked by the desktop manager.

## Privacy reading by surface

| Surface | Main privacy question                                         | Read next                                |
| ------- | ------------------------------------------------------------- | ---------------------------------------- |
| Desktop | Where is my data and when does it leave the machine?          | [Filesystem](../reference/filesystem.md) |
| Web     | What does the local server expose?                            | [Web API](../reference/web-api.md)       |
| MCP/CLI | What can an automation client do over stdio or loopback HTTP? | [MCP and CLI](../reference/mcp-cli.md)   |

## See also

- [Filesystem](../reference/filesystem.md)
- [Environment variables](../reference/environment-variables.md)
- [Architecture](./architecture.md)
- [Web API](../reference/web-api.md)
