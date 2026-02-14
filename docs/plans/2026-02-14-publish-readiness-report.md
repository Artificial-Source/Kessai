# Publish Readiness Report

Date: 2026-02-14
Status: In Progress

## Checklist

- PASS: Docs IA reorganized under `docs/getting-started`, `docs/architecture`, `docs/guides`, `docs/reference`
- PASS: Namespace links updated to `ASF/Subby`
- PASS: Release branch requirement fixed to `main` in `.release-it.json`
- PASS: CI workflow added (`.github/workflows/ci.yml`)
- PASS: Issue templates and PR template added
- PASS: CODEOWNERS added
- PASS: Package metadata expanded for repo discoverability
- PASS: Troubleshooting and security links aligned to ASF namespace
- PASS: Validation completed (`pnpm check` and `pnpm test:run` both pass)
- PARTIAL: Security contact mailbox in `SECURITY.md` depends on repository-maintainer configuration

## Remaining Work

1. Create ASF organization/repository and transfer repository ownership.
2. Configure repository settings after transfer:
   - Branch protection
   - Security features
   - Maintainer contact email visibility/process
