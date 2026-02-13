# Backend API Reference

This document describes the Rust backend commands and database schema for Subby.

## Tauri Commands

### `save_logo`

Opens an image file, resizes it, and saves it as WebP in the app data directory.

**Signature:**

```rust
#[tauri::command]
fn save_logo(
    app_handle: AppHandle,
    source_path: String,
    subscription_id: String
) -> Result<String, String>
```

**Parameters:**

- `source_path`: Absolute path to the source image file (PNG, JPG, or WebP)
- `subscription_id`: Used as the output filename (`{subscription_id}.webp`)

**Returns:**

- Success: The saved filename (e.g. `"abc123.webp"`)
- Error: Description of what went wrong

**Processing:**

1. Opens and decodes the image from disk
2. Resizes to 256x256 (thumbnail, preserves aspect ratio)
3. Saves as WebP to the logos directory

**Example (Frontend):**

```typescript
import { invoke } from '@tauri-apps/api/core'

const filename = await invoke<string>('save_logo', {
  sourcePath: '/tmp/netflix-logo.png',
  subscriptionId: 'sub-abc123',
})
```

---

### `get_logo_base64`

Reads a logo file and returns it as a base64 data URL.

**Signature:**

```rust
#[tauri::command]
fn get_logo_base64(
    app_handle: AppHandle,
    filename: String
) -> Result<String, String>
```

**Parameters:**

- `filename`: Logo filename (must match `^[a-zA-Z0-9_.-]+\.webp$`, no path traversal)

**Returns:**

- Success: Base64 data URL (e.g. `"data:image/webp;base64,..."`)
- Error: `"Invalid filename"` or read error

---

### `delete_logo`

Deletes a logo file from the logos directory.

**Signature:**

```rust
#[tauri::command]
fn delete_logo(
    app_handle: AppHandle,
    filename: String
) -> Result<(), String>
```

**Parameters:**

- `filename`: Logo filename (validated for safety, same rules as `get_logo_base64`)

**Returns:**

- Success: `()` (silently succeeds even if file doesn't exist)
- Error: `"Invalid filename"` if validation fails

---

## Database Schema

### Tables Overview

| Table            | Purpose                 | Key Fields                                         |
| ---------------- | ----------------------- | -------------------------------------------------- |
| `categories`     | Subscription categories | id, name, color, icon, is_default                  |
| `subscriptions`  | User subscriptions      | id, name, amount, billing_cycle, next_payment_date |
| `settings`       | User preferences        | id (singleton), theme, currency                    |
| `payments`       | Payment history         | id, subscription_id, amount, status, due_date      |
| `payment_cards`  | Payment card tracking   | id, name, card_type, last_four, color              |

### `categories`

```sql
CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,          -- Hex: '#8b5cf6'
    icon TEXT NOT NULL,           -- Lucide icon name: 'play-circle'
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Default Categories (seeded on first run):**

| Name             | Color   | Icon        |
| ---------------- | ------- | ----------- |
| Streaming        | #8b5cf6 | play-circle |
| Software         | #3b82f6 | code        |
| Gaming           | #10b981 | gamepad-2   |
| Music            | #f59e0b | music       |
| Cloud Storage    | #06b6d4 | cloud       |
| Productivity     | #ec4899 | briefcase   |
| Health & Fitness | #14b8a6 | heart-pulse |
| News & Reading   | #f97316 | newspaper   |
| Other            | #6b7280 | box         |

### `subscriptions`

```sql
CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    billing_cycle TEXT NOT NULL,  -- 'weekly'|'monthly'|'quarterly'|'yearly'|'custom'
    billing_day INTEGER,          -- 1-31 for specific day of month
    category_id TEXT REFERENCES categories(id),
    card_id TEXT REFERENCES payment_cards(id),
    color TEXT,                   -- Hex: '#8b5cf6'
    logo_url TEXT,                -- Logo filename (e.g. 'sub-abc123.webp')
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    next_payment_date TEXT,       -- ISO date: '2024-02-15'
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscriptions_category ON subscriptions(category_id);
CREATE INDEX idx_subscriptions_next_payment ON subscriptions(next_payment_date);
```

### `payments`

```sql
CREATE TABLE payments (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    amount REAL NOT NULL,
    paid_at TEXT NOT NULL,        -- ISO datetime
    due_date TEXT NOT NULL,       -- ISO date
    status TEXT NOT NULL DEFAULT 'paid',  -- 'paid'|'skipped'
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

CREATE INDEX idx_payments_subscription ON payments(subscription_id);
CREATE INDEX idx_payments_paid_at ON payments(paid_at);
CREATE INDEX idx_payments_due_date ON payments(due_date);
```

### `settings`

```sql
CREATE TABLE settings (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    theme TEXT NOT NULL DEFAULT 'dark',
    currency TEXT NOT NULL DEFAULT 'USD',
    notification_enabled INTEGER NOT NULL DEFAULT 1,
    notification_days_before TEXT NOT NULL DEFAULT '[1,3,7]',  -- JSON array
    email TEXT,
    notification_email_enabled INTEGER NOT NULL DEFAULT 0,
    notification_desktop_enabled INTEGER NOT NULL DEFAULT 1
);
```

### `payment_cards`

```sql
CREATE TABLE payment_cards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    card_type TEXT NOT NULL DEFAULT 'debit',
    last_four TEXT,
    color TEXT NOT NULL DEFAULT '#6b7280',
    credit_limit REAL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## Database Migrations

Migrations are defined inline in `src-tauri/src/lib.rs` and run automatically on app start via `tauri-plugin-sql`.

**Migration Order:**

1. `create_initial_tables` — Create categories, subscriptions, and settings tables
2. `seed_default_data` — Seed 9 default categories and singleton settings row
3. `create_payments_table` — Add payment tracking
4. `add_notification_settings` — Add email and desktop notification columns to settings
5. `create_payment_cards_table` — Add payment card support and `card_id` FK on subscriptions

**Adding a New Migration:**

1. Add a new `Migration` struct to the `get_migrations()` function in `src-tauri/src/lib.rs`
2. Increment the version number
3. Write the SQL in the `sql` field

---

## SQL Plugin Usage

The frontend accesses the database via `tauri-plugin-sql`:

```typescript
import Database from '@tauri-apps/plugin-sql'

// Get database instance (singleton)
const db = await Database.load('sqlite:subby.db')

// Query
const rows = await db.select<Subscription[]>('SELECT * FROM subscriptions WHERE is_active = ?', [1])

// Execute
await db.execute('INSERT INTO subscriptions (id, name, amount) VALUES (?, ?, ?)', [
  id,
  name,
  amount,
])
```

**Important:** Always use parameterized queries to prevent SQL injection.

---

## File Storage

### Logo Storage

Logos are stored in the app resource directory under `data/logos/`:

| Platform | Path                                         |
| -------- | -------------------------------------------- |
| Linux    | `{resource_dir}/data/logos/`                 |
| macOS    | `{resource_dir}/data/logos/`                 |
| Windows  | `{resource_dir}/data/logos/`                 |

**File Format:** WebP (converted from any input format)
**Max Size:** 256x256 pixels

### Database Location

| Platform | Path                                           |
| -------- | ---------------------------------------------- |
| Linux    | `~/.local/share/subby/subby.db`                |
| macOS    | `~/Library/Application Support/subby/subby.db` |
| Windows  | `%APPDATA%/subby/subby.db`                     |

---

## Content Security Policy

Defined in `src-tauri/tauri.conf.json`:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self'
```

This restricts:

- Scripts to same origin only
- Styles allow inline (required for Tailwind)
- Images allow data URLs and blobs (for logo previews)
- No external resources

---

## Error Handling

Backend errors are returned as strings and should be caught on the frontend:

```typescript
try {
  await invoke('save_logo', { sourcePath, subscriptionId })
} catch (error) {
  // error is a string describing what went wrong
  console.error('Logo processing failed:', error)
  toast.error('Failed to upload logo')
}
```

Common error messages:

- `"Invalid filename"` — Filename validation failed
- `"Failed to open image: ..."` — Source file not found or unreadable
- `"Failed to decode image: ..."` — Image data is corrupt
- `"Failed to save WebP: ..."` — File system write error
- `"Failed to read logo: ..."` — Logo file not found
