# Docs and Publish Gap Register

Date: 2026-02-14
Status: Open

## Critical

1. Missing GitHub automation and templates (`.github/workflows`, issue templates, PR template, CODEOWNERS).
2. Incorrect/misleading paths in docs (notably migration path references).
3. Security contact path needs explicit and actionable reporting channel.

## High

1. Root and docs references are inconsistent (testing stack wording, stale static claims, personal namespace links).
2. Release flow is under-documented and branch config mismatch exists (`.release-it.json` uses `master`).
3. Docs IA is too flat for onboarding, architecture, operations, and release tasks.
4. Namespace migration to ASF is not runbooked in-repo.

## Medium

1. Backup JSON format is undocumented for users and integrators.
2. State management docs omit `payment-card-store`.
3. Command reference is fragmented across multiple files.
4. Cross-platform install and verification guidance needs consolidation.

## Low

1. Additional governance docs can improve OSS clarity (`CODE_OF_CONDUCT.md`, `SUPPORT.md`).
2. Package metadata discoverability fields should be standardized.

## Mapping to Workstreams

- **WS1 Docs Reorganization:** new `docs/getting-started`, `docs/architecture`, `docs/guides`, `docs/reference` trees.
- **WS2 Accuracy Refresh:** root docs and docs hub consistency pass.
- **WS3 Publish Hardening:** GitHub templates/workflows, release runbook, verification checklist.
- **WS4 ASF Migration:** namespace replacement + org transfer runbook.

## Acceptance Criteria

- Critical gaps are closed or have explicit defer reasons and owners.
- Every page linked from `docs/README.md` exists.
- No contradictory technical statements across docs.
- Release path is executable from docs without tribal knowledge.
- ASF migration has a pre-check, cutover, and rollback checklist.
