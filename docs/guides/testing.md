# Testing Guide

Subby uses unit/component tests and E2E tests.

## Test Stack

- Unit and component: Vitest + Testing Library
- E2E: Playwright

## Commands

```bash
pnpm test         # watch mode
pnpm test:run     # single run
pnpm test:e2e     # end-to-end suite
pnpm test:coverage
```

## Pre-PR Minimum

Run these before opening a PR:

```bash
pnpm check
pnpm test:run
```

## CI Recommendation

- Required on PR: `pnpm check`, `pnpm test:run`
- Optional: `pnpm test:e2e` on schedule/manual or selected PR labels
