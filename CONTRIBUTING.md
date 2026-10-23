# Contributing to Kessai

Thank you for your interest in contributing to Kessai! This document provides guidelines for contributions.

## Reporting Bugs

1. Check existing [Issues](https://github.com/Artificial-Source/Kessai/issues) to avoid duplicates
2. Use the "bug" label
3. Include:
   - OS and version
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable

## Feature Requests

1. Use GitHub Issues with the "enhancement" label
2. Describe the use case and proposed solution
3. Be open to discussion about alternative approaches

## Pull Requests

### Setup

```bash
git clone https://github.com/Artificial-Source/Kessai.git
cd Kessai
pnpm install
pnpm start
```

See the [Development section](README.md#development) in the README for prerequisites.

### Development Workflow

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run checks:
   ```bash
   pnpm check                    # lint + typecheck + format check
   pnpm test:run                 # Unit tests (once)
   pnpm test:coverage            # Unit tests with coverage
   cargo test --locked --workspace # Rust tests
   pnpm test:e2e                 # Starts Vite + an isolated web backend
   pnpm test:e2e:web-smoke       # Built frontend + real web backend
   ```
5. Commit with conventional commits
6. Push and open a PR

Install the E2E browser once with `pnpm exec playwright install --with-deps chromium`. You do not need to start a dev server yourself: Playwright starts fresh servers and uses an isolated temporary database, never the normal app database. For the full suite, `KESSAI_DEV_PORT` and `KESSAI_API_PORT` override Vite and test-backend ports (defaults `1420` / `3000`). The web-smoke suite needs only `KESSAI_API_PORT` (default `3001`), not Vite. Reserve the selected ports; existing servers are not reused.

For CI-style Playwright behavior, prefix either command with `CI=true`. Any nonempty `CI` value, including `false`, enables `forbidOnly` and two retries; the full suite also limits workers to one, while web smoke always uses one worker. See [How to test](docs/how-to/test.md) for commands and [How to build and release](docs/how-to/build-and-release.md) for the full release gates.

### Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style (formatting, missing semicolons)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `perf:` - Performance improvements
- `chore:` - Maintenance tasks

Examples:

```
feat: add dark mode toggle to settings
fix: correct December payment date calculation
docs: update installation instructions
```

### Code Style

- **Components**: PascalCase, one per file
- **Files**: kebab-case
- **Imports**: Use `@/` path alias
- **Types**: Use Zod schemas for validation, infer TypeScript types

### Don'ts

- Don't use `as any` to suppress TypeScript errors
- Don't use array index as React keys
- Don't add heavy animations or backdrop blur on scrolling content; use restrained CSS motion that honors OS and app reduced-motion settings and the desktop runtime profile (see [DESIGN.md](DESIGN.md#motion) and [PRODUCT.md](PRODUCT.md)).
- Don't use date-fns (use dayjs instead)

## Code Review

PRs should include at least one review when possible. Reviewers will check:

- Code quality and readability
- Test coverage for new features
- No breaking changes without discussion
- Adherence to project conventions

## Questions?

Open a Discussion on GitHub or reach out via Issues.
