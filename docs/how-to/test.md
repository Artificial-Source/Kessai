# How to test Kessai

Use this page to run quality checks before opening a PR or cutting a release.

## Run the core frontend quality gate

```bash
pnpm check
```

`pnpm check` runs:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm format:check`

## Run frontend tests

Single run:

```bash
pnpm test:run
```

Watch mode:

```bash
pnpm test
```

Coverage:

```bash
pnpm test:coverage
```

## Run Rust tests

```bash
cargo test --workspace
```

## Run E2E tests

```bash
pnpm test:e2e
```

For interactive troubleshooting UI:

```bash
pnpm test:e2e:ui
```

## Recommended pre-PR sequence

```bash
pnpm check
pnpm test:run
cargo test --workspace
```

## See also

- [How to run locally](./run-locally.md)
- [How to build and release](./build-and-release.md)
- [How to troubleshoot](./troubleshoot.md)
