# MCP and CLI

Kessai 1.0.0 exposes one local, single-user application contract through MCP and the `kessai-mcp` CLI. Both use the same SQLite database, validation, result DTOs, pagination, and confirmation policy. Nothing contacts banks or providers: cancellation changes only a local record. Contract schema version: `1`.

For installation, client configuration, transports, and token-file security, see [Use the MCP server](../how-to/use-mcp-server.md). This page is the shared contract reference; installed CLI help/schema and MCP `tools/list` describe the installed version.

## CLI grammar and discovery

```text
kessai-mcp [--db-path PATH] [--json] [--no-color] <GROUP> <VERB> [TARGET_ID] [--flags]
```

Global options work throughout the command path: `--db-path PATH`, `--json`, `--no-color`, `-h`/`--help`, and `-V`/`--version`. `NO_COLOR` also disables color. Human output never invokes a pager or asks for interactive input; ANSI is emitted only to an eligible terminal. Running without a command prints help and exits 2. The server starts only with explicit `serve`.

An explicit `--db-path` takes precedence over `KESSAI_DB_PATH`. Otherwise the database is `com.asf.kessai/kessai.db` under the platform data directory, falling back to `./kessai.db` only if that directory cannot be resolved. `info --json` reports `database_path`, `exists`, `size_bytes`, `database_schema_version`, `database_schema_reason`, `binary_version`, and contract `schema_version`. It never creates, migrates, or writes; an existing database file is inspected read-only. A missing file or migration table yields a null database schema version and an explanatory reason. Help and schema discovery do not open the database.

```bash
kessai-mcp info --json
kessai-mcp subscriptions update --help
kessai-mcp schema --json
kessai-mcp schema subscriptions update
```

`schema` always returns JSON. Its root inventory includes `schema_version`, `cli_version`, and command paths with mutation, destruction, idempotency, dry-run, and confirmation metadata. A leaf record includes its summary, positionals, options (types, enums, defaults, repeatability, conflicts), `output_schema`, and `error_codes`. Command flags appear before global options in help; leaf help supplies examples and enum values.

In the grammar table, uppercase targets are positional. All creation fields are named flags; `*` marks required flags. MCP uses the same field names with underscores instead of hyphens; plural/repeated CLI flags map to arrays. Full per-leaf options and JSON Schemas are available through `schema` and the [generated CLI reference](../../skills/kessai/references/cli.md).

<!-- BEGIN CLI GRAMMAR -->

| Group                                                      | Verbs and targets                    | Main flags                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscriptions`                                            | `list`                               | `--query`, repeatable `--status`, `--category-id`, `--card-id`, `--tag-id`, `--due-from`, `--due-to`, `--upcoming-days`, `--review-overdue-days`, `--trial-ending-within-days`, `--sort`, `--limit`, `--cursor`                                                                                                      |
| `subscriptions`                                            | `get ID`                             | Full detail by opaque ID                                                                                                                                                                                                                                                                                             |
| `subscriptions`                                            | `create`                             | `--name*`, `--amount*`, `--billing-cycle*`, `--currency`, `--next-payment-date`, `--billing-day`, `--category-id`, `--card-id`, `--color`, `--notes`, `--status`, `--trial-end-date`, `--shared-count`, `--pinned BOOL`, repeatable `--tag-id`                                                                       |
| `subscriptions`                                            | `update ID`                          | Creation fields except `--tag-id`, all optional; also `--cancellation-reason`, `--mark-reviewed`, repeatable `--add-tag-id`, `--remove-tag-id`, `--clear`                                                                                                                                                            |
| `subscriptions`, `payments`, `categories`, `tags`, `cards` | `delete ID`                          | `--dry-run` or `--yes`                                                                                                                                                                                                                                                                                               |
| `payments`                                                 | `list`                               | `--subscription-id`, `--month YYYY-MM`, repeatable `--status`, `--due-from`, `--due-to`, `--limit`, `--cursor`                                                                                                                                                                                                       |
| `payments`                                                 | `record SUBSCRIPTION_ID`             | `--status* paid\|skipped`, optional `--due-date`, `--amount`                                                                                                                                                                                                                                                         |
| `payments`                                                 | `create`                             | `--subscription-id*`, `--amount*`, `--due-date*`, `--status*`, optional `--paid-at`, `--notes`                                                                                                                                                                                                                       |
| `payments`                                                 | `update ID`                          | `--amount`, `--status`, `--paid-at`, `--notes`, `--clear notes`                                                                                                                                                                                                                                                      |
| `calendar`                                                 | `month YYYY-MM`                      | `--limit`, `--cursor`                                                                                                                                                                                                                                                                                                |
| `categories`                                               | `list`; `create`; `update ID`        | List: `--limit`, `--cursor`; create: `--name*`, `--color*`, `--icon*`; update: those fields optional                                                                                                                                                                                                                 |
| `tags`                                                     | `list`; `create`; `update ID`        | List: `--limit`, `--cursor`; create: `--name*`, optional `--color`; update: `--name`, `--color`                                                                                                                                                                                                                      |
| `cards`                                                    | `list`; `create`; `update ID`        | List: `--limit`, `--cursor`; create: `--name*`, `--card-type*`, optional `--last-four`, `--color`, `--credit-limit`; update: all optional plus `--clear`                                                                                                                                                             |
| `settings`                                                 | `get`; `update`                      | Update: `--theme`, `--currency`, `--notification-enabled BOOL`, repeatable `--notification-days-before`, `--notification-advance-days`, `--notification-time`, `--monthly-budget`, `--reduce-motion BOOL`, `--enable-transitions BOOL`, `--enable-hover-effects BOOL`, `--animation-speed`, `--clear monthly_budget` |
| `analytics`                                                | `dashboard`; `spending`; `year YEAR` | Spending: `--months` (default 12, range 1–60); year: 1900–9998                                                                                                                                                                                                                                                       |
| `price-history`                                            | `list`                               | `--subscription-id`, `--since-days` (1–3650), `--limit`, `--cursor`                                                                                                                                                                                                                                                  |
| `backup`                                                   | `export PATH`; `import PATH`         | Export: `--overwrite`; import: `--mode merge\|replace`, `--dry-run` or `--yes`                                                                                                                                                                                                                                       |
| `serve`                                                    | No verb                              | `--read-only`, `--http`, `--port` (default 8742), `--token-file`; port/token-file require HTTP                                                                                                                                                                                                                       |
| `setup`                                                    | No verb                              | `--output PATH`, `--dry-run`, `--read-only`; JSON result `{path, written, backup_path, config}`                                                                                                                                                                                                                      |
| `schema`                                                   | `[GROUP [VERB]]`                     | Always JSON; inventory or full command contract                                                                                                                                                                                                                                                                      |
| `info`                                                     | No verb                              | Effective path and versions; existing database files inspected read-only, never created/migrated/written                                                                                                                                                                                                             |

<!-- END CLI GRAMMAR -->

## Values and patch semantics

- IDs are opaque strings returned by list/create results, including seeded category IDs such as `cat-*`. Never construct or reformat them.
- Amounts are finite, non-negative JSON numbers in decimal major currency units (`9.99`, not 999 minor units). `currency` is three uppercase ISO-4217 letters; subscription creation defaults to `settings.currency`. Zero is valid. Names have at most 100 Unicode scalar values; notes and cancellation reasons at most 500.
- Dates are exact, possible `YYYY-MM-DD` dates; timestamps are RFC 3339; month inputs are `YYYY-MM` in 1900-01 through 9998-12. Colors use `#RRGGBB`; billing days are 1–31; `shared_count` is at least 1; card `last_four` is exactly four digits, never a full number. Notification offsets are 0–365 and local notification time is `HH:MM`.
- Subscription list filters combine with AND; a `status` array matches any listed status. Due bounds are inclusive and apply to `next_payment_date`. `upcoming_days` and `trial_ending_within_days` cover today through today plus 0–366 days. `review_overdue_days` (1–3650) selects billable subscriptions never reviewed or reviewed more than that many days ago.
- Omitting an update value preserves it. MCP JSON `null` also means omission, not clearing. Use `clear_fields` / repeatable CLI `--clear` with the exact snake_case names below. A field cannot be set and cleared in one request. Updates require an actual change.

| Update       | Allowed `clear_fields` / `--clear` values                                                        |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Subscription | `billing_day`, `category_id`, `card_id`, `color`, `notes`, `next_payment_date`, `trial_end_date` |
| Payment      | `notes`                                                                                          |
| Card         | `last_four`, `credit_limit`                                                                      |
| Settings     | `monthly_budget`                                                                                 |

Changing or clearing `next_payment_date` without also changing `billing_day` clears the previous billing-day anchor. Supply both fields to intentionally retain a different anchor. `mark_reviewed=true` stamps the review time; tag attachment/removal uses idempotent `add_tag_ids` / `remove_tag_ids` (CLI `--add-tag-id` / `--remove-tag-id`). Local lifecycle and pin changes set desired state, not toggles.

| Enum                  | Values                                                                            |
| --------------------- | --------------------------------------------------------------------------------- |
| `billing_cycle`       | `weekly`, `monthly`, `quarterly`, `yearly`, `custom` (currently monthly cadence)  |
| Subscription `status` | `trial`, `active`, `paused`, `pending_cancellation`, `grace_period`, `cancelled`  |
| Payment `status`      | `paid`, `skipped`, `pending`; recording accepts only `paid` / `skipped`           |
| Subscription `sort`   | `next_payment_date`, `name`, `amount_desc`, `last_reviewed_at`, `created_at_desc` |
| `card_type`           | `credit`, `debit`                                                                 |
| `theme`               | `dark`, `light`, `system`                                                         |
| `animation_speed`     | `slow`, `normal`, `fast`                                                          |
| Import `mode`         | `merge`, `replace`                                                                |

## Success DTOs and streams

CLI `--json` stdout is exactly the result DTO, equivalent to MCP success `structuredContent`; there is no transport-specific success wrapper. Optional output fields are explicit `null`. Each MCP tool declares its success `outputSchema`. For example, an empty subscription list is:

```json
{ "items": [], "total": 0, "next_cursor": null, "warnings": [] }
```

| DTO                  | Fields / meaning                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Page<T>`            | `items`, `total` after filtering and before pagination, `next_cursor` string/null, `warnings` array                                                                                                |
| `SubscriptionItem`   | `id`, `name`, full `amount`, `currency`, `billing_cycle`, `status`, `is_active`, `next_payment_date`, `category_id`, `card_id`, sorted `tag_ids`, `is_pinned`, `shared_count`; no notes/timestamps |
| `SubscriptionDetail` | Full stored subscription fields with explicit nulls; adds `tags:[{id,name,color}]`, `category:{id,name}\|null`, `card:{id,name,last_four}\|null`                                                   |
| `PaymentItem`        | `id`, `subscription_id`, current `subscription_name` and `currency`, recorded `amount`, `status`, `due_date`, `paid_at`, `notes`                                                                   |
| `RecordOutcome`      | `payment:PaymentItem`, `replayed`, `schedule_advanced`, `subscription:{id,name,next_payment_date}`                                                                                                 |
| `CalendarOccurrence` | `subscription_id`, `name`, `due_date`, `currency`, current-price `projected_amount`, lifecycle `status`, `billing_cycle`, `payment:{id,status,amount}\|null`                                       |
| `CalendarMonth`      | `month`, `items`, `total`, `next_cursor`, `totals_by_currency:{CUR:{projected,paid,skipped,pending}}`; totals cover the full month before pagination                                               |
| `RefItem`            | `id`, `name`, `color`, `icon`, `is_default`, `card_type`, `last_four`, `credit_limit`, `subscription_count`; irrelevant category/tag/card fields are null                                          |
| `Settings`           | Display currency/theme, display exchange-rate map, notification preferences, nullable `monthly_budget`, motion/transition/hover preferences, animation speed, singleton ID                         |
| `DashboardStats`     | `display_currency`, `total_monthly`, `total_yearly`, `active_count`, `total_count`, `average_per_subscription`, `category_spending`, `excluded_currencies`                                         |
| `SpendingReport`     | `months`, `monthly:[{month,total,count}]`, `by_category`, `velocity:{current_month,previous_month,change_percent,projected_annual}`                                                                |
| `YearSummary`        | `year`, `total_spent`, `avg_monthly`, `highest_month`, `highest_amount`, `category_breakdown`                                                                                                      |
| `PriceChangeItem`    | `id`, `subscription_id`, `subscription_name`, `old_amount`, `new_amount`, `old_currency`, `new_currency`, `changed_at`                                                                             |
| `DeletePreview`      | `dry_run:true`, `target:{id,name}`, `cascade:{kind:{count,ids}}` (at most 20 example IDs per kind), `requires_confirmation:true`                                                                   |
| `DeleteOutcome`      | `deleted:true`, `target:{id,name}`, `cascade:{kind:{count}}`                                                                                                                                       |
| `ImportPreview`      | `dry_run:true`, `mode`, backup `version`, `incoming` counts, `collisions` counts, `requires_confirmation`                                                                                          |
| `ImportOutcome`      | `imported:true`, `mode`, backup `version`, applied incoming `counts` (not final database totals)                                                                                                   |
| `ExportOutcome`      | Absolute `path`, UTF-8 `bytes` written, backup `version`, exported `counts`                                                                                                                        |

Backup counts have `subscriptions`, `categories`, `cards`, `payments`, `price_history`, `tags`, and `tag_links`. CLI `schema GROUP VERB` and tool `outputSchema` provide complete field types rather than a separate handwritten schema.

## Pagination

| List kind                              | Default limit | Maximum |
| -------------------------------------- | ------------- | ------- |
| Subscriptions, payments, price history | 50            | 200     |
| Categories, tags, cards                | 100           | 200     |
| Calendar occurrences                   | 200           | 500     |

Limits must be positive. Application-level oversized limits clamp to the maximum; CLI typed arguments reject values outside their advertised range. Treat cursors as opaque. Reuse the same filters/sort with a returned cursor; a cursor from different filters is a `validation_error` on `cursor`. Continue until `next_cursor` is null. `total` is never just the current page length, and warnings qualify completeness. Pagination is not a snapshot lock: avoid changing matching rows during a traversal.

Ordering is deterministic with ID tiebreakers. Subscriptions default to next payment date; payments use due date descending; price history uses change time descending; reference rows use name; calendar uses date, name, subscription ID, and payment ID.

## Errors and exit codes

CLI failures leave stdout empty; with `--json`, stderr contains only this `ErrorBody`:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid next payment date",
    "field": "next_payment_date",
    "hint": "Use next_payment_date=2026-10-22",
    "side_effects": "none"
  }
}
```

`field` and `hint` are optional; shared validation errors identify the field and valid input guidance. `side_effects` is always `none`, `applied`, or `unknown`: reconcile current state before retrying an applied/unknown result. Do not infer rollback from an error code alone. CLI syntax errors in JSON mode use the same body, exit 2, and point to help.

MCP domain errors are tool results with `isError:true`, JSON `ErrorBody` in text content, and no `structuredContent`. Unknown tools or malformed protocol arguments are protocol errors, not successful DTOs. Resource read failures use `resource_not_found` rather than a success-shaped body.

| Exit | Error code              | Meaning / next step                                                           | Usual side effects |
| ---- | ----------------------- | ----------------------------------------------------------------------------- | ------------------ |
| 0    | —                       | Success, including an empty list                                              | As reported        |
| 1    | `internal_error`        | Unexpected failure; inspect state before retrying                             | `unknown`          |
| 2    | `validation_error`      | Bad usage, value, or cursor; fix the named field                              | `none`             |
| 3    | `not_found`             | Missing ID/path; re-list or check database/path                               | `none`             |
| 4    | `conflict`              | Business-rule, replay-mismatch, or overwrite conflict; inspect existing state | `none`             |
| 5    | `confirmation_required` | Preview and obtain approval before confirming                                 | `none`             |
| 6    | `io_error`              | Database/file I/O failure; check path/permissions                             | Inspect body       |

## Mutation, confirmation, and retries

- Hard deletes require `dry_run:true` / `--dry-run` first, user review, then `confirm:true` / `--yes` after approval. Without confirmation an execution attempt fails with `confirmation_required`. Dry-run never changes domain data; `--yes` is not a validation bypass. CLI dry-run and yes flags conflict. The preview describes current impact, not a reservation against concurrent changes.
- Subscription deletion cascades to payments, price history, and tag links. Category/card deletion detaches subscriptions without deleting them; default categories return `conflict`. Tag deletion removes links, not subscriptions. Payment deletion does not rewind the schedule. Consider `subscriptions_update(status="cancelled")` instead of losing history; this never cancels with a provider.
- Creates and ordinary updates do not require a separate confirmation flag. Updates honestly advertise overwriting behavior to MCP hosts; host approval policies still apply. Creates are not safe to replay blindly. If a create result is lost, list before retrying.
- `payments_record` defaults to the subscription's current due date and amount. Recording paid/skipped at the current date atomically advances to the next unsettled period. `RecordOutcome` reports replay and advancement. The same subscription/date/status/amount returns the existing row; a different status or amount conflicts. For a retry, preserve the original due date and amount: repeating a defaults-only request after advancement targets a new period. Direct payment create/update and historical outcomes do not move the schedule.
- Changing a valid subscription price/currency appends price history atomically. Tag additions/removals use desired-state idempotent links. Re-stamping review time is an observable timestamp update.
- Backup paths are absolute or working-directory-relative paths on the CLI/server machine, not client uploads. Export writes [backup format 1.2.0](./backup-format.md), returning metadata rather than database contents in the conversation. It refuses to overwrite unless `overwrite:true` / `--overwrite` is supplied and fails closed on unreadable subscriptions.
- Import preflight validates before writing; import commits in one transaction. Merge (default) upserts by ID and keeps unrelated data. Replace deletes existing data first. Replace and merges with overwrite collisions require confirmation; a collision-free merge can execute without it. Use dry-run for validation and counts regardless. See the [backup format](./backup-format.md) for accepted versions and legacy normalization.
- `serve --read-only` hides and rejects every non-read-only tool, including backup export (it writes a file). It is an enforced server-side restriction, not just an approval hint.

## Currency and calendar semantics

No analytics convert currencies. Dashboard totals normalize the user's share (`amount / shared_count`) of active, billable subscriptions in `settings.currency`; billable statuses are `trial`, `active`, and `grace_period`. `display_currency` identifies the totals' unit and `excluded_currencies` counts omitted currencies. Changing display currency changes inclusion, not stored amounts.

Spending/year analytics sum paid ledger amounts by due date across currencies without conversion; mixed-currency sums must be described as such, not presented as one currency. Calendar totals are separated by currency: `projected` sums current-price occurrences, `paid` and `skipped` sum recorded amounts, and `pending` includes pending rows plus unrecorded projections. A present `payment.amount` is authoritative for the recorded outcome. Calendar occurrences include recurring billable charges and recorded rows, including history for cancelled subscriptions; an unknown next date is absent from upcoming projections.

## MCP tools

Tool names are `<plural_resource>_<verb>`; there are no hidden callable aliases. Every tool publishes closed input schemas, field descriptions, success `outputSchema`, and all four annotations. `openWorldHint` is false: tools operate locally. Read-only tools are non-destructive/idempotent; creates are additive/non-idempotent; updates overwrite and are generally idempotent; deletes are destructive/non-idempotent. `payments_record` is additive/idempotent for a fixed date, and backup export is non-read-only because it writes a file.

The source of truth for the tool table is the [generated MCP reference](../../skills/kessai/references/mcp.md), checked against `tools/list` by the contract tests. In read-only mode only its read-only rows are advertised and callable.

<!-- BEGIN GENERATED MCP TOOL TABLE: paste the table from skills/kessai/references/mcp.md -->
<!-- END GENERATED MCP TOOL TABLE -->

## MCP resources and prompt

All resources are JSON using the same DTOs as tools. Static resources: `kessai://settings`, `kessai://dashboard`, `kessai://subscriptions` (first 200 compact items plus `total`), and `kessai://categories`. Templates: `kessai://subscriptions/{id}` and `kessai://calendar/{year}/{month}`. Use list tools and cursors for complete traversal rather than assuming a bounded resource contains everything.

The sole prompt, `subscription_review`, takes no arguments and embeds no records. It directs currency-context reads, upcoming and overdue-review lists, and recent price history, followed by proposals with IDs and no mutation until the user approves. The server advertises tools, resources, and prompts; protocol negotiation uses the SDK's latest supported version and negotiates down for clients.

## See also

- [Use the MCP server](../how-to/use-mcp-server.md)
- [Environment variables](./environment-variables.md)
- [Filesystem](./filesystem.md)
- [Backup format](./backup-format.md)
- [Security and privacy](../explanation/security-and-privacy.md)
