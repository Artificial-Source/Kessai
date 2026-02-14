# ASF Migration Runbook

Date: 2026-02-14

## Recommended Path

Use GitHub repository transfer from personal namespace to `ASF/Subby`.

## Pre-Cutover Checklist

1. Ensure ASF GitHub organization exists and you have owner/admin rights.
2. Ensure repository working tree is clean and changes are merged.
3. Confirm backup exists (local clone + optional mirror clone).
4. Confirm docs/metadata in repo point to `ASF/Subby`.

## Cutover Steps

1. Open repository settings in current namespace.
2. Transfer repository to organization `ASF` with name `Subby`.
3. Accept transfer in org (if required).
4. Update local remote URL:

```bash
git remote set-url origin https://github.com/ASF/Subby.git
git remote -v
```

## Post-Cutover Verification

1. Verify old URL redirects to new URL.
2. Verify issues, PRs, and history are intact.
3. Confirm release links and docs links resolve.
4. Enable branch protections and required checks in repo settings.

## Rollback

If needed, transfer repository back to personal namespace and restore remote URL.

## Important Non-Goal

Do not change Tauri application identifier as part of namespace migration. That requires a separate data-migration strategy.
