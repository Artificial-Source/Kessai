# Troubleshooting Guide

Common issues and solutions for Subby users and developers.

## User Issues

### App Won't Start

**Symptoms**: App crashes on launch or shows blank window.

**Solutions**:

1. **Check system requirements**:
   - Windows: Windows 10 version 1803+ with WebView2
   - macOS: 10.15 Catalina or later
   - Linux: WebKitGTK 4.1+ installed

2. **Reset app data** (last resort):
   - Linux: Delete `~/.local/share/subby/`
   - macOS: Delete `~/Library/Application Support/subby/`
   - Windows: Delete `%APPDATA%/subby/`

3. **Linux users**: Ensure dependencies are installed:
   ```bash
   sudo apt install libgtk-3-0 libwebkit2gtk-4.1-0 libappindicator3-1 librsvg2-2
   ```

### "Unverified Developer" Warning

**macOS**:

1. Right-click the app and select "Open"
2. Click "Open" in the dialog
3. The warning won't appear again

**Windows**:

1. Click "More info" in the SmartScreen dialog
2. Click "Run anyway"

### Data Not Persisting

**Symptoms**: Subscriptions disappear after restart.

**Solutions**:

1. Check if the app has write permissions to its data directory
2. Ensure there's enough disk space
3. Look for errors in the app (Settings → check for error messages)

### Import Failed

**Symptoms**: Error when importing backup file.

**Solutions**:

1. Ensure the file is valid JSON (open in text editor to verify)
2. Check that it's a Subby backup (has `version`, `subscriptions`, `categories` keys)
3. File must be under the size limits:
   - Max 10,000 subscriptions
   - Max 1,000 categories
   - Max 100,000 payments

## Developer Issues

### Build Errors

#### "Cannot find module '@tauri-apps/api'"

```bash
# Reinstall dependencies
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

#### Linux: "Could not find webkit2gtk-4.1"

```bash
sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

#### macOS: "xcrun: error: invalid active developer path"

```bash
xcode-select --install
```

#### Windows: "error: linker `link.exe` not found"

Install Visual Studio Build Tools with "Desktop development with C++" workload.

### Runtime Errors

#### "Failed to open database"

The database couldn't be initialized. Check:

1. App has write permissions to data directory
2. Disk is not full
3. SQLite file isn't locked by another process

#### "Logo upload failed"

Logo validation failed. Ensure:

1. Image is a valid format (PNG, JPG, WebP)
2. Filename contains only alphanumeric characters, dashes, underscores
3. File size is reasonable (under 5MB)

### Test Failures

#### "not wrapped in act(...)" warnings

These are cosmetic warnings in hook tests. The tests still pass. To fix:

```typescript
import { act } from '@testing-library/react'

await act(async () => {
  // your state update here
})
```

#### E2E tests timing out

Playwright tests need the dev server running:

```bash
# Terminal 1
pnpm dev

# Terminal 2
pnpm test:e2e
```

Or let Playwright start the server:

```bash
pnpm test:e2e  # Uses webServer config in playwright.config.ts
```

### Database Issues

#### Reset database (development)

Delete the SQLite file:

```bash
# Linux
rm ~/.local/share/subby/*.db

# macOS
rm ~/Library/Application\ Support/subby/*.db
```

The database will be recreated with default data on next launch.

#### Inspect database

Use any SQLite viewer:

```bash
# Install sqlite3
sudo apt install sqlite3

# Open database
sqlite3 ~/.local/share/subby/subby.db

# Query tables
.tables
SELECT * FROM subscriptions;
```

## Getting Help

1. **Search existing issues**: https://github.com/ASF/Subby/issues
2. **Create new issue** with:
   - OS and version
   - Steps to reproduce
   - Error messages (if any)
   - Screenshots (if applicable)

## Logs

Currently, Subby doesn't write log files. Error messages appear in:

- The app UI (toast notifications)
- Browser console (for web view errors)
- Terminal (when running with `pnpm tauri dev`)
