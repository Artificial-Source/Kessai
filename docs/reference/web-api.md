# Web API

The local web server in `crates/kessai-web/src/main.rs` serves the React app and mounts its JSON API under `/api`. The route catalog is defined in `crates/kessai-web/src/routes.rs`, and the frontend mapping lives in `src/lib/api.ts`.

## Runtime characteristics

- Default port: `3000`
- Static frontend: served from `dist/`
- Standalone bind address: `127.0.0.1:<port>` by default; `kessai-web --host <IP>` explicitly selects another address. Non-loopback use is advanced and logged as exposing the read/write API to reachable networks.
- Standalone mode is not authenticated. Optional Tailscale-only standalone mode is described below.
- CORS: no permissive CORS middleware is configured.
- Browser security headers are added to route responses and policy rejections.
- Application and JSON/path/query extraction errors use the JSON envelope `{ "error": "..." }`.
- Synchronous core/SQLite, image decoding/encoding, and logo filesystem operations run on Tokio's blocking pool, not async request workers. Authorization and request extraction happen before dispatching blocking work.

The web API is a transport adapter around the same `KessaiCore` services used by the desktop app.

### Error statuses

Core errors are mapped by their typed variant, never by message wording:

| Core error                          | HTTP status                          |
| ----------------------------------- | ------------------------------------ |
| `Validation`, `Import`              | `400 Bad Request`                    |
| `NotFound`                          | `404 Not Found`                      |
| `Conflict`, `CannotDeleteDefault`   | `409 Conflict`                       |
| `Database`, `Pool`, `Serialization` | `500 Internal Server Error` (logged) |

This intentionally corrects validation/import/conflict failures that previously returned `500`; deleting a seeded default category now returns `409` rather than `400`. Unexpected filesystem, image-encoding, and blocking-worker failures also return a logged `500`.

Extractor rejections keep Axum's status while using the same JSON envelope: malformed JSON/path/query values return `400`, JSON values incompatible with a DTO return `422`, a missing JSON content type returns `415`, and an oversized body returns `413`.

## Unauthenticated standalone access policy

Ordinary standalone mode validates request authorities before serving the SPA or API:

- A loopback listener accepts only `localhost`, `127.0.0.1`, and `[::1]`, with any valid port or no explicit port. `--allowed-host` does not widen loopback listeners.
- A non-loopback listener accepts its bound IP literal and hosts explicitly supplied with repeatable `--allowed-host <host>` or comma-separated `KESSAI_WEB_ALLOWED_HOSTS` (the flag also accepts comma-separated values). Entries are hostnames or IP literals, not URLs or host:port pairs; IPv6 literals use brackets. Invalid entries fail startup, and `--allowed-host` conflicts with `--tailscale-only`. With `--host 0.0.0.0` or `--host ::`, configure the actual addresses clients use.
- Non-loopback startup without any configured allowed hosts logs a warning explaining `--allowed-host`; wildcard listeners require the actual client-facing hostname/IP to avoid request rejection.
- `POST`, `PUT`, `DELETE`, and `PATCH` allow a missing `Origin` for non-browser clients. When supplied, it must be an HTTP(S) loopback origin, or an origin for the bound non-loopback IP or a configured allowed host. Any valid port is accepted, preserving loopback development-proxy access.
- Malformed/duplicate authorities or mutation origins, disallowed hosts/origins, and conflicting absolute-URI authorities receive no-store `403` responses. Page/static `GET` and `HEAD` rejections are HTML; API and mutation rejections are JSON `{ "error": "Request rejected by the standalone access policy" }`. Forwarded-host headers do not authorize a standalone request.

This policy mitigates browser DNS rebinding and cross-origin mutations, not access by clients able to choose accepted headers. Standalone mode remains unauthenticated; non-loopback exposure still requires network isolation.

## Tailscale-only standalone mode

`kessai-web --tailscale-only` authorizes hosted requests using Tailscale Serve identity, without an access key, cookie, redirect, second login, or credential persistence.

**Identity flow (summary):** a remote browser cannot choose its identity. Tailscale Serve strips caller-supplied identity fields and injects a verified `Tailscale-User-Login`. Kessai then requires one nonempty login, a valid `.ts.net` `Host`/`X-Forwarded-Host`, HTTPS semantics, and an exact HTTPS `Origin` for state-changing methods. Missing/empty/duplicate identity, malformed/duplicate authority, wrong origin, and Funnel requests receive generic no-store `403` responses. Page/static `GET` and `HEAD` receive Kessai's HTML access-required page; `/api` receives JSON. Canonical explanation: [How Tailscale identity reaches Kessai](../explanation/security-and-privacy.md#how-tailscale-identity-reaches-kessai). Official reference: [Tailscale Serve identity headers](https://tailscale.com/docs/features/tailscale-serve#identity-headers).

The default and recommended listener is loopback. Canonical direct `localhost:<port>` and `127.0.0.1:<port>` requests then remain available and report a local connection. A non-loopback listener fails closed unless `--trust-tailscale-proxy` is also explicit; on a non-loopback listener, direct requests are rejected even with that flag. This exception exists for a container listening on `0.0.0.0` internally while its host publishes only `127.0.0.1:<host-port>:<container-port>`.

**Trust boundary:** only software already able to reach the host-local backend can imitate the internal Serve identity headers. Other PCs, uninvited tailnet users, and internet visitors cannot bypass this way. Identity-only mode assumes trusted local workloads and protects against remote LAN/public clients. It must remain behind loopback-published Tailscale Serve. Do not use Funnel and do not expose the listener directly. Kessai does not install, run, or configure Tailscale.

`GET` or `HEAD` `/__kessai/health` returns `204` with no data and is the only identity-free Tailscale-only path. Backup import remains enabled because this standalone process has no desktop server lifecycle race.

## Private-hosted mode

The desktop **Private Web Access** setting runs this same SPA/API in-process, only on `127.0.0.1:<configured-port>`. It has no REST lifecycle endpoint; start, stop, and port changes happen in desktop Settings.

Private-hosted requests are governed by a separate policy:

- Direct requests are accepted only for the canonical `localhost:<port>` or `127.0.0.1:<port>` authority.
- Hosted requests must use a valid `.ts.net` authority and include Tailscale Serve's `Tailscale-User-Login` identity header. Requests from tagged devices without a user identity header are intentionally unsupported.
- State-changing requests, including the access-key form, require a matching `Origin`; no permissive cross-origin access is provided.
- After those checks, every SPA asset and API request requires the host-only access cookie. A missing or nonmatching cookie on `GET` or `HEAD` redirects to the internal `/__kessai/private-access` key page; other unauthenticated requests and malformed/duplicate credential cookies return `401`. The page's size-limited form posts to the same path and sets an HttpOnly, `SameSite=Strict` cookie (`Secure` for `.ts.net`). The value is a random, server-instance session token, not the persistent access key; restarting the private server invalidates it. Authentication and rejection responses are not cached.
- Tailscale Funnel is rejected because it does not carry the required identity header, before Kessai shows the access page. Use private Tailscale Serve only.
- Authenticated `GET /api/export` remains available, but full backup import (`POST /api/import`) returns `409` in private-hosted mode. Stop Private Web Access and restore/import in the desktop app instead.

The key page is a shared-secret bootstrap, not an account or full login system. Disabling and re-enabling Private Web Access rotates the key and invalidates browser cookies. Cookies are scoped by host, not port: another service on the same loopback hostname can receive and replay the session token while that server instance runs, although it no longer learns the persistent key. See the [Private Web Access trust boundary](../explanation/security-and-privacy.md#private-web-access-trust-boundary). Tailscale still supplies identity (same Serve flow as Tailscale-only mode) and tailnet policy controls who may reach the hosted URL; the access cookie is the extra local gate. Ordinary standalone mode uses the separate unauthenticated authority/origin policy above. See [Configure Private Web Access](../how-to/configure.md#configure-private-web-access-via-tailscale) for the user flow and [How Tailscale identity reaches Kessai](../explanation/security-and-privacy.md#how-tailscale-identity-reaches-kessai) for the identity model.

## Access context

Policy-authorized `GET /api/access/status` (frontend command `get_access_status`) returns stable snake_case JSON without secrets. Standalone access does not require authentication; private-hosted access also requires its session cookie. The payload is a **server-generated context after policy validation**, not browser-side Tailscale detection:

```json
{
  "server_mode": "tailscale_hosted",
  "connection": "tailscale",
  "tailscale_login": "alice@example.com"
}
```

`server_mode` is `standalone`, `private_hosted`, or `tailscale_hosted`; `connection` is `local` or `tailscale`; `tailscale_login` is a string only for a validated Tailscale request and otherwise `null`. Browser Settings renders this status with normal React text escaping.

## Payload model conventions

- Resource bodies reuse shared Rust DTOs from `kessai_core::models`.
- The frontend mirrors those shapes in `src/types/subscription.ts`, `src/types/payment.ts`, `src/types/category.ts`, `src/types/settings.ts`, and related files.
- Most create endpoints return `201 Created`; most delete endpoints return `204 No Content`.

The web API is adapter-specific (REST), not identical to desktop Tauri invocation:

- Web calls are routed through HTTP methods and paths, while desktop uses `invoke` with command IDs.
- `src/lib/api.ts` maps these logical operations into slightly different request/response envelopes and status-handling behavior.
- `KessaiCore` guarantees shared money/date validation, transactional price-history capture on subscription updates, and paid-renewal schedule advancement; HTTP routing and response envelopes remain adapter-specific.

### Nullable patches

`PUT` update bodies are partial updates: omitting a nullable field leaves it unchanged, a non-null value sets it, and explicit JSON `null` clears it. This applies to:

| Update DTO           | Nullable patch fields                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UpdateSettings`     | `monthly_budget`                                                                                                                                                        |
| `UpdatePaymentCard`  | `last_four`, `credit_limit`                                                                                                                                             |
| `UpdatePayment`      | `notes`                                                                                                                                                                 |
| `UpdateSubscription` | `billing_day`, `category_id`, `card_id`, `color`, `logo_url`, `notes`, `next_payment_date`, `trial_end_date`, `cancellation_reason`, `cancelled_at`, `last_reviewed_at` |

For example, `PUT /api/settings` with `{ "monthly_budget": null }` clears the budget; `{}` preserves it. Settings responses always include `monthly_budget`, using `null` when unset. Full backup settings are restore data, not this patch DTO; see [Backup format](./backup-format.md).

## Subscription routes

| Method   | Path                                      | Body or query                  | Purpose                           |
| -------- | ----------------------------------------- | ------------------------------ | --------------------------------- |
| `GET`    | `/api/subscriptions`                      | none                           | List subscriptions                |
| `POST`   | `/api/subscriptions`                      | `NewSubscription`              | Create a subscription             |
| `GET`    | `/api/subscriptions/{id}`                 | none                           | Get one subscription              |
| `PUT`    | `/api/subscriptions/{id}`                 | `UpdateSubscription`           | Update a subscription             |
| `DELETE` | `/api/subscriptions/{id}`                 | none                           | Delete a subscription             |
| `POST`   | `/api/subscriptions/{id}/toggle`          | none                           | Pause or resume lifecycle status  |
| `POST`   | `/api/subscriptions/{id}/pin`             | none                           | Toggle `is_pinned`                |
| `POST`   | `/api/subscriptions/{id}/status`          | `{ "status": "..." }`          | Transition lifecycle status       |
| `POST`   | `/api/subscriptions/{id}/cancel`          | `{ "reason": string \| null }` | Cancel with optional reason       |
| `POST`   | `/api/subscriptions/{id}/review`          | none                           | Mark a subscription reviewed      |
| `GET`    | `/api/subscriptions/needs-review?days=30` | optional `days`                | List subscriptions needing review |
| `GET`    | `/api/trials/expiring?days=7`             | optional `days`                | List expiring trials              |

List and review-list routes skip unreadable subscriptions, including corrupt amount/date values, unknown stored lifecycle/billing-cycle values, and incompatible SQL types. Shared reads normalize subscription timestamp due dates to their date part, lowercase currencies to uppercase, sharing counts below 1 to 1, and contradictory activity/status flags to preserve inactive intent, without rewriting storage; see [Backup format](./backup-format.md).

The single-record GET bypasses the amount/date gate for rows it can decode, allowing those fields to be inspected and repaired; unknown enum values or incompatible SQL types can still prevent decoding. PUT validates the complete merged subscription, so repairing an invalid amount succeeds only if the rest of the merged record is valid; a name-only edit of that row returns `400` naming the invalid field. DELETE does not decode the row and can remove an unreadable subscription.

Explicitly setting or clearing `next_payment_date` in an update clears `billing_day` unless the same payload includes `billing_day`. Send both fields when retaining a different billing day is intentional.

## Category routes

| Method   | Path                   | Body             | Purpose                  |
| -------- | ---------------------- | ---------------- | ------------------------ |
| `GET`    | `/api/categories`      | none             | List categories          |
| `POST`   | `/api/categories`      | `NewCategory`    | Create a custom category |
| `PUT`    | `/api/categories/{id}` | `UpdateCategory` | Update a category        |
| `DELETE` | `/api/categories/{id}` | none             | Delete a category        |

## Payment routes

| Method   | Path                                               | Body or query                                 | Purpose                                          |
| -------- | -------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| `GET`    | `/api/payments`                                    | none                                          | List payments                                    |
| `POST`   | `/api/payments`                                    | `NewPayment`                                  | Create a payment                                 |
| `PUT`    | `/api/payments/{id}`                               | `UpdatePayment`                               | Update a payment                                 |
| `DELETE` | `/api/payments/{id}`                               | none                                          | Delete a payment                                 |
| `GET`    | `/api/payments/calendar/{year}/{month}`            | none                                          | List projected and recorded calendar occurrences |
| `GET`    | `/api/payments/{year}/{month}`                     | none                                          | List payments for a month                        |
| `GET`    | `/api/payments/{year}/{month}/details`             | none                                          | List payments with subscription detail           |
| `POST`   | `/api/payments/mark-paid`                          | `{ "subscription_id", "due_date", "amount" }` | Record a paid renewal                            |
| `POST`   | `/api/payments/skip`                               | `{ "subscription_id", "due_date", "amount" }` | Record a skipped renewal                         |
| `GET`    | `/api/payments/check/{subscription_id}/{due_date}` | none                                          | Return `{ "recorded": boolean }`                 |

A paid or skipped outcome at the subscription's current `next_payment_date` advances the schedule in the same transaction; dates already settled by paid or skipped outcomes are skipped over, up to 120 billing periods. Exceeding that bound fails explicitly and rolls back the complete operation. Exact retries return the existing payment and can advance a legacy schedule still anchored on that outcome; once the schedule moves, replaying the old date cannot advance it again. A different amount or outcome for the same subscription and due date returns `409`. Historical or other non-current due dates, failed outcomes, and direct payment create/update operations do not advance the schedule. Pending-only rows do not make the payment check return `recorded: true`. The paid/skip endpoints return `201` even for an exact replay.

When the final date of a month-based advancement without `billing_day` would lose an anchor day above 28 through clamping, the original day is persisted atomically with advancement (January 31 → February 28 → March 31). Intermediate settled dates retain the same recurrence day even when clamped. Calendar projection and later paid or skipped renewals therefore retain that day.

### Calendar occurrences

`GET /api/payments/calendar/2026/10` returns a JSON array of shared core `CalendarOccurrence` objects with snake_case fields: `subscription_id`, `due_date`, `name`, `logo_url`, `category_id`, `currency`, `billing_cycle`, `status`, `is_active`, `projected_amount`, and `payment`.

`payment` is either `null` for a projected renewal or the full recorded `Payment` object. When present, its `amount` and `status` are authoritative; `projected_amount` is the subscription's current full price, not its divided user share. Recorded payments of every status, including duplicate historical rows, remain separate occurrences even when the next renewal has moved forward or the subscription is now cancelled/inactive. Unreadable subscriptions are skipped, together with their calendar occurrences. The existing monthly ledger routes remain unchanged.

Only currently active, billable subscriptions (`trial`, `active`, `grace_period`) with a due date receive projections. Weekly cycles recur every seven days; monthly and custom cycles every month; quarterly and yearly cycles only in their recurrence months. The requested month can be before or after the stored anchor.

The stored `next_payment_date` is always period zero exactly; `billing_day` only sets the day for other month-based periods, with month-end clamping. An October 25 anchor with billing day 15 therefore projects October 25 and November 15, and paying October 25 advances to November 15.

Years must be `1900`–`9998` and months `1`–`12`; invalid ranges return `400` with the standard error envelope.

## Payment-card and tag routes

### Payment cards

| Method   | Path              | Body                | Purpose               |
| -------- | ----------------- | ------------------- | --------------------- |
| `GET`    | `/api/cards`      | none                | List payment cards    |
| `POST`   | `/api/cards`      | `NewPaymentCard`    | Create a payment card |
| `PUT`    | `/api/cards/{id}` | `UpdatePaymentCard` | Update a payment card |
| `DELETE` | `/api/cards/{id}` | none                | Delete a payment card |

### Tags

| Method   | Path                                    | Body                  | Purpose                                              |
| -------- | --------------------------------------- | --------------------- | ---------------------------------------------------- |
| `GET`    | `/api/tags`                             | none                  | List tags                                            |
| `POST`   | `/api/tags`                             | `NewTag`              | Create a tag                                         |
| `PUT`    | `/api/tags/{id}`                        | `UpdateTag`           | Update a tag                                         |
| `DELETE` | `/api/tags/{id}`                        | none                  | Delete a tag                                         |
| `POST`   | `/api/subscriptions/tags/batch`         | `string[]`            | Return subscription-tag links for many subscriptions |
| `GET`    | `/api/subscriptions/{id}/tags`          | none                  | List tags for one subscription                       |
| `POST`   | `/api/subscriptions/{id}/tags`          | `{ "tag_id": "..." }` | Attach a tag                                         |
| `DELETE` | `/api/subscriptions/{id}/tags/{tag_id}` | none                  | Remove a tag                                         |

## Settings and analytics routes

| Method | Path                                 | Body or query     | Purpose                                                         |
| ------ | ------------------------------------ | ----------------- | --------------------------------------------------------------- |
| `GET`  | `/api/access/status`                 | none              | Report policy-authorized server/connection context (no secrets) |
| `GET`  | `/api/settings`                      | none              | Get current settings                                            |
| `PUT`  | `/api/settings`                      | `UpdateSettings`  | Update settings                                                 |
| `GET`  | `/api/analytics/monthly?months=12`   | optional `months` | Monthly spending series                                         |
| `GET`  | `/api/analytics/year/{year}`         | none              | Year summary                                                    |
| `GET`  | `/api/analytics/velocity`            | none              | Spending velocity                                               |
| `GET`  | `/api/analytics/categories?months=6` | optional `months` | Category spending breakdown                                     |

The four analytics routes sum recorded `paid` payment amounts by `due_date`; they do not divide by `shared_count`, filter to the settings currency, or return currency-exclusion metadata. Do not treat these ledger reports as the subscription-based dashboard totals. The UI's display totals use the user's share of active, billable subscriptions in the display currency and disclose excluded currencies; CLI `analytics dashboard` and MCP `analytics_dashboard` report those exclusions as `excluded_currencies`. There is no `/api/stats` route.

## Price history, import/export, and logo routes

| Method   | Path                                   | Body or query                                           | Purpose                                                                        |
| -------- | -------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET`    | `/api/price-history/recent?days=90`    | optional `days`                                         | Recent price changes                                                           |
| `GET`    | `/api/price-history/{subscription_id}` | none                                                    | Full price history for one subscription                                        |
| `POST`   | `/api/price-history/latest`            | `string[]`                                              | Latest price change for many subscriptions                                     |
| `GET`    | `/api/export`                          | none                                                    | Export a `BackupData` payload                                                  |
| `POST`   | `/api/import`                          | `{ "data": BackupData, "clear_existing"?: boolean }`    | Import backup data                                                             |
| `POST`   | `/api/logos/save`                      | `{ "data": base64OrDataUrl, "subscription_id": "..." }` | Validate PNG/JPEG/WebP/GIF (5 MiB, 4096×4096 max), thumbnail, and save as WebP |
| `POST`   | `/api/logos/fetch`                     | `{ "name": "...", "domain"?: "..." }`                   | Fetch a logo from the network                                                  |
| `GET`    | `/api/logos/{filename}`                | none                                                    | Return a logo data URL                                                         |
| `DELETE` | `/api/logos/{filename}`                | none                                                    | Delete a logo                                                                  |

`POST /api/import` accepts a JSON request body up to **25 MiB**, matching the frontend backup-file cap; larger bodies return `413`. Core backup collection/field limits still apply. This route-specific limit does not widen other API routes.

Import defaults to merge (`clear_existing: false`); `true` replaces existing data. Both use the core's strict whole-backup validation and legacy normalization before writing, then apply the restore in one transaction. Export reads all collections in one snapshot and fails rather than silently omitting an unreadable/invalid subscription. See [Backup format](./backup-format.md) for field limits, compatibility forms, references, and merge/replace semantics. Unlike CLI/MCP, this HTTP body has no confirmation or dry-run field.

Logo storage is shared with the desktop adapter. Filenames must be safe non-hidden `.webp` names without traversal or path separators, and must not use case-insensitive Windows device basenames (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, or the superscript forms `COM¹`–`COM³`/`LPT¹`–`LPT³`), including before extra extensions. Encoded replacements are written to a temporary file in the logo directory and atomically renamed over the destination; failed encoding/writes leave an existing logo intact, and readers see either the old or new complete image. Reads are capped at 8 MiB (`400` when exceeded; a missing logo is `404`). Deleting an absent logo is idempotent (`204`), while genuine filesystem failures return `500`.

On Windows, file-sharing conditions may transiently prevent the final rename; the save then reports an I/O error rather than overwriting the previous logo, and can be retried. A process crash during encoding can leave a hidden temporary file in the logo directory. Such files are not servable through the logo API because leading-dot filenames are rejected.

Logo fetches start at the fixed `https://www.google.com/s2/favicons` endpoint; the supplied domain is only a query value. The client has a five-second timeout and an explicit redirect policy: follow at most three redirects, only to HTTPS targets (Google may redirect to its favicon CDN). Non-HTTPS redirects are not followed. Downloaded bodies remain capped at 5 MiB before bounded raster decoding.

## See also

- [How to run Kessai locally](../how-to/run-locally.md)
- [How to configure hosted access](../how-to/configure.md#choose-a-hosted-access-mode)
- [Security and privacy](../explanation/security-and-privacy.md#how-tailscale-identity-reaches-kessai)
- [Desktop commands](./desktop-commands.md)
- [MCP and CLI](./mcp-cli.md)
