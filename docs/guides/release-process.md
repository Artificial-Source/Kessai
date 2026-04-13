# Release Process

This project uses `release-it` with version sync automation.

Desktop binaries and auto-update manifests are built by GitHub Actions from version tags.

## Prerequisites

- Clean working tree
- Branch is `main`
- Git remote push access configured
- `TAURI_SIGNING_PRIVATE_KEY` GitHub secret set from your updater private key

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

4. Wait for the `Release` workflow to finish building installers for each platform and publish the GitHub release assets.

5. Verify the attached assets and release notes.

## What Happens Automatically

- Version is bumped
- Git tag is created
- Changelog is updated from conventional commits
- `scripts/sync-versions.js` syncs version to:
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Git tag is pushed so the `Release` workflow can publish a GitHub release
- `.github/workflows/release.yml` builds installers and updater artifacts from the tag
- `latest.json` is uploaded to GitHub Releases for in-app auto-updates

## Updater Signing Setup

Generate a Tauri updater keypair once on your machine:

```bash
pnpm tauri signer generate --ci -w ~/.tauri/kessai-updater.key -p ""
```

Then add these GitHub repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY` - contents of `~/.tauri/kessai-updater.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - leave empty if you generated the key without a password

Optional macOS signing/notarization secrets for smoother installs:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

## Release Verification Checklist

- Confirm version is consistent across manifests
- Confirm artifacts build (`pnpm tauri build`)
- Confirm the release includes `latest.json` and signed updater archives
- Confirm docs links and install commands are current
- Confirm changelog entry is user-facing and accurate
- Confirm release notes include platform artifact names
