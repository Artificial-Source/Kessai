# Web API

The local web server in `crates/kessai-web/src/main.rs` serves the React app and mounts its JSON API under `/api`. The route catalog is defined in `crates/kessai-web/src/routes.rs`, and the frontend mapping lives in `src/lib/api.ts`.

## Runtime characteristics

- Default port: `3000`
- Static frontend: served from `dist/`
- Bind address: `0.0.0.0:<port>`
- CORS: `CorsLayer::permissive()`
- Application error shape: handler-level `AppError` responses return JSON like `{ "error": "..." }`, but framework-level extractor failures may use Axum's default error responses instead.

The web API is a transport adapter around the same `KessaiCore` services used by the desktop app.

## Payload model conventions

- Resource bodies reuse shared Rust DTOs from `kessai_core::models`.
- The frontend mirrors those shapes in `src/types/subscription.ts`, `src/types/payment.ts`, `src/types/category.ts`, `src/types/settings.ts`, and related files.
- Most create endpoints return `201 Created`; most delete endpoints return `204 No Content`.

The web API is adapter-specific (REST), not identical to desktop Tauri invocation:

- Web calls are routed through HTTP methods and paths, while desktop uses `invoke` with command IDs.
- `src/lib/api.ts` maps these logical operations into slightly different request/response envelopes and status-handling behavior.
- `KessaiCore` behavior is shared, but adapter-level behavior (for example automatic price-history capture on update) is implemented in adapter paths rather than core guarantees.

## Subscription routes

| Method | Path | Body or query | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/subscriptions` | none | List subscriptions |
| `POST` | `/api/subscriptions` | `NewSubscription` | Create a subscription |
| `GET` | `/api/subscriptions/{id}` | none | Get one subscription |
| `PUT` | `/api/subscriptions/{id}` | `UpdateSubscription` | Update a subscription |
| `DELETE` | `/api/subscriptions/{id}` | none | Delete a subscription |
| `POST` | `/api/subscriptions/{id}/toggle` | none | Toggle `is_active` |
| `POST` | `/api/subscriptions/{id}/pin` | none | Toggle `is_pinned` |
| `POST` | `/api/subscriptions/{id}/status` | `{ "status": "..." }` | Transition lifecycle status |
| `POST` | `/api/subscriptions/{id}/cancel` | `{ "reason": string \| null }` | Cancel with optional reason |
| `POST` | `/api/subscriptions/{id}/review` | none | Mark a subscription reviewed |
| `GET` | `/api/subscriptions/needs-review?days=30` | optional `days` | List subscriptions needing review |
| `GET` | `/api/trials/expiring?days=7` | optional `days` | List expiring trials |

## Category routes

| Method | Path | Body | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/categories` | none | List categories |
| `POST` | `/api/categories` | `NewCategory` | Create a custom category |
| `PUT` | `/api/categories/{id}` | `UpdateCategory` | Update a category |
| `DELETE` | `/api/categories/{id}` | none | Delete a category |

## Payment routes

| Method | Path | Body or query | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/payments` | none | List payments |
| `POST` | `/api/payments` | `NewPayment` | Create a payment |
| `PUT` | `/api/payments/{id}` | `UpdatePayment` | Update a payment |
| `DELETE` | `/api/payments/{id}` | none | Delete a payment |
| `GET` | `/api/payments/{year}/{month}` | none | List payments for a month |
| `GET` | `/api/payments/{year}/{month}/details` | none | List payments with subscription detail |
| `POST` | `/api/payments/mark-paid` | `{ "subscription_id", "due_date", "amount" }` | Record a paid renewal |
| `POST` | `/api/payments/skip` | `{ "subscription_id", "due_date", "amount" }` | Record a skipped renewal |
| `GET` | `/api/payments/check/{subscription_id}/{due_date}` | none | Return `{ "recorded": boolean }` |

## Payment-card and tag routes

### Payment cards

| Method | Path | Body | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/cards` | none | List payment cards |
| `POST` | `/api/cards` | `NewPaymentCard` | Create a payment card |
| `PUT` | `/api/cards/{id}` | `UpdatePaymentCard` | Update a payment card |
| `DELETE` | `/api/cards/{id}` | none | Delete a payment card |

### Tags

| Method | Path | Body | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/tags` | none | List tags |
| `POST` | `/api/tags` | `NewTag` | Create a tag |
| `PUT` | `/api/tags/{id}` | `UpdateTag` | Update a tag |
| `DELETE` | `/api/tags/{id}` | none | Delete a tag |
| `POST` | `/api/subscriptions/tags/batch` | `string[]` | Return subscription-tag links for many subscriptions |
| `GET` | `/api/subscriptions/{id}/tags` | none | List tags for one subscription |
| `POST` | `/api/subscriptions/{id}/tags` | `{ "tag_id": "..." }` | Attach a tag |
| `DELETE` | `/api/subscriptions/{id}/tags/{tag_id}` | none | Remove a tag |

## Settings and analytics routes

| Method | Path | Body or query | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/settings` | none | Get current settings |
| `PUT` | `/api/settings` | `UpdateSettings` | Update settings |
| `GET` | `/api/analytics/monthly?months=12` | optional `months` | Monthly spending series |
| `GET` | `/api/analytics/year/{year}` | none | Year summary |
| `GET` | `/api/analytics/velocity` | none | Spending velocity |
| `GET` | `/api/analytics/categories?months=6` | optional `months` | Category spending breakdown |

## Price history, import/export, and logo routes

| Method | Path | Body or query | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/price-history/recent?days=90` | optional `days` | Recent price changes |
| `GET` | `/api/price-history/{subscription_id}` | none | Full price history for one subscription |
| `POST` | `/api/price-history/latest` | `string[]` | Latest price change for many subscriptions |
| `GET` | `/api/export` | none | Export a `BackupData` payload |
| `POST` | `/api/import` | `{ "data": BackupData, "clear_existing"?: boolean }` | Import backup data |
| `POST` | `/api/logos/save` | `{ "data": base64OrDataUrl, "subscription_id": "..." }` | Save a logo as WebP |
| `POST` | `/api/logos/fetch` | `{ "name": "...", "domain"?: "..." }` | Fetch a logo from the network |
| `GET` | `/api/logos/{filename}` | none | Return a logo data URL |
| `DELETE` | `/api/logos/{filename}` | none | Delete a logo |

## See also

- [How to run Kessai locally](../how-to/run-locally.md)
- [Desktop commands](./desktop-commands.md)
- [MCP and CLI](./mcp-cli.md)
