# Release Process

This project uses `release-it` with version sync automation.

## Prerequisites

- Clean working tree
- Branch is `main`
- GitHub auth configured for release creation

## Release Steps

1. Run quality gates:

```bash
pnpm check
pnpm test:run
```

2. Run a dry release:

```bash
pnpm release:dry
```

3. Create release:

```bash
pnpm release
```

## What Happens Automatically

- Version is bumped
- Git tag is created
- Changelog is updated from conventional commits
- `scripts/sync-versions.js` syncs version to:
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Draft GitHub release is created

## Release Verification Checklist

- Confirm version is consistent across manifests
- Confirm artifacts build (`pnpm tauri build`)
- Confirm docs links and install commands are current
- Confirm changelog entry is user-facing and accurate
- Confirm release notes include platform artifact names
