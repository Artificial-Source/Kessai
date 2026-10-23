---
name: kessai
description: Track local subscriptions, renewals, payments, budgets, and backups through connected Kessai MCP tools or the JSON CLI. Use for finding, reviewing, creating, updating, or deleting records and recording paid or skipped charges.
metadata: { kessai_mcp_version: '1.0.0', contract_schema_version: '1' }
---

# Kessai

Local, single-user subscription tracking. Nothing contacts banks or providers.
Never open or edit SQLite directly; use the validated tools or CLI.

## Pick a surface

Prefer connected MCP tools; otherwise use the CLI with `--json`.
Both return the same DTOs: `subscriptions_update` maps to CLI `subscriptions update`.
For installation, see [README.md](README.md).

## Discover the installed contract

```bash
kessai-mcp info --json
kessai-mcp --help
kessai-mcp subscriptions update --help
kessai-mcp schema subscriptions update
```

Check the effective database and versions first. Installed help/schema and MCP `tools/list` win over this file. Use `--db-path` only for an intentionally selected database.

## Ten rules

1. Resolve opaque IDs with list tools; inspect before changing a record.
2. Follow `next_cursor` until null before claiming completeness; report warnings.
3. Amounts are decimal major units; always keep the accompanying currency.
4. Dates are `YYYY-MM-DD`, months `YYYY-MM`, timestamps RFC 3339.
5. Omission or JSON null preserves a field. Clear with `clear_fields` / `--clear`; never set and clear together.
6. `status="cancelled"` changes only the local record, never the provider.
7. Delete/import preview → show impact → obtain user approval → `confirm:true` / `--yes`. Never confirm on the user's behalf.
8. `payments_record` replays the same due date safely. Preserve its original date and amount when retrying; defaults resolve again after schedule advancement.
9. Creates can duplicate. After an unknown outcome, list first; do not blindly retry.
10. Totals never convert currencies. Explain dashboard exclusions; use calendar totals per currency.

## Five workflows

Replace `<ID>` with the selected subscription's ID and `<BACKUP_PATH>` with a local file path. Each block shows CLI followed by MCP `tools/call` payloads; arrays mean sequential calls, not JSON-RPC batches. Inspect each result before continuing.

### Find → inspect → update one approved field

```text
kessai-mcp --json subscriptions list --query Netflix
kessai-mcp --json subscriptions get <ID>
kessai-mcp --json subscriptions update <ID> --notes Reviewed
[{"name":"subscriptions_list","arguments":{"query":"Netflix"}},{"name":"subscriptions_get","arguments":{"id":"<ID>"}},{"name":"subscriptions_update","arguments":{"id":"<ID>","notes":"Reviewed"}}]
```

### “I paid this subscription”

```text
kessai-mcp --json payments record <ID> --status paid
{"name":"payments_record","arguments":{"subscription_id":"<ID>","status":"paid"}}
```

Defaults use the current due date and price; inspect `replayed`, `schedule_advanced`, and the returned next date. Use `payments_create` only for direct ledger/backfill writes.

### What's due this month, per currency?

```text
kessai-mcp --json calendar month 2026-10
{"name":"calendar_month","arguments":{"month":"2026-10"}}
```

Substitute the requested month. Page through occurrences; `totals_by_currency` already covers the whole month.

### Preview deletion, then stop

```text
kessai-mcp --json subscriptions delete <ID> --dry-run
{"name":"subscriptions_delete","arguments":{"id":"<ID>","dry_run":true}}
```

Show cascade counts and wait for explicit approval. To stop tracking without deleting history, propose a local status update instead.

### Export a backup; preview restoring it

```text
kessai-mcp --json backup export <BACKUP_PATH>
kessai-mcp --json backup import <BACKUP_PATH> --mode merge --dry-run
[{"name":"backup_export","arguments":{"path":"<BACKUP_PATH>"}},{"name":"backup_import","arguments":{"path":"<BACKUP_PATH>","mode":"merge","dry_run":true}}]
```

Paths are on the CLI/server machine. Export refuses overwrite by default. Imports validate before writing; replace and colliding merges require confirmation. Stop after the preview.

## Errors → next step

| Code                    | Next step                                                       |
| ----------------------- | --------------------------------------------------------------- |
| `validation_error`      | Fix `field` using `hint`; consult installed schema.             |
| `not_found`             | List again; check the effective database or file path.          |
| `conflict`              | Inspect existing state; correct it rather than duplicate/force. |
| `confirmation_required` | Preview, show impact, ask approval; only then confirm.          |
| `io_error`              | Check path, ownership, and permissions; inspect `side_effects`. |
| `internal_error`        | Inspect `side_effects`; reconcile state before any retry.       |

CLI failures leave stdout empty and write the error JSON to stderr. MCP domain failures set `isError`; read the text error. `side_effects` is `none`, `applied`, or `unknown`.

## References

- [CLI grammar](references/cli.md), generated from the installed command schema.
- [MCP tools](references/mcp.md), generated from `tools/list`.
