# Security Model

Subby desktop app is local-first and keeps user data on-device.

## Security Characteristics

- Data is stored in local SQLite.
- No account system or password storage.
- No telemetry or analytics in desktop app runtime.
- Strict file validation for logo filenames in backend commands.

## CSP

Configured in `src-tauri/tauri.conf.json`:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self'
```

## Input and File Validation

- Frontend form validation uses Zod schemas.
- SQL queries use parameterized statements.
- Backend logo file APIs allow only safe `.webp` filenames and reject traversal patterns.

## Scope Note

This model describes the desktop app (`src/` + `src-tauri/`). The optional Discord bot package is networked by design.
