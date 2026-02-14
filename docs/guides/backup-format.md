# Backup Format

Exported backups use JSON with versioned metadata.

## Top-Level Schema

```json
{
  "version": "1.0.0",
  "exportedAt": "2026-02-14T12:34:56.000Z",
  "subscriptions": [],
  "categories": [],
  "payments": [],
  "settings": {}
}
```

## Notes

- `version` is backup format version, not app version.
- `settings` excludes DB-only primary key fields.
- Import runs in a DB transaction for atomicity.

## Import Validation Limits

- Max subscriptions: `10,000`
- Max categories: `1,000`
- Max payments: `100,000`

## Source of Truth

- Type and logic: `src/lib/data-management.ts`
