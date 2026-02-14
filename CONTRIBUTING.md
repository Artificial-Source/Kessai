# Contributing to Subby

Thank you for your interest in contributing to Subby! This document provides guidelines for contributions.

## Reporting Bugs

1. Check existing [Issues](https://github.com/ASF/Subby/issues) to avoid duplicates
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
git clone https://github.com/ASF/Subby.git
cd subby
pnpm install
pnpm tauri dev
```

See the [Development section](README.md#development) in the README for prerequisites.

### Development Workflow

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run checks:
   ```bash
   pnpm check        # lint + typecheck + format check
   pnpm test:run     # Run tests once
   ```
5. Commit with conventional commits
6. Push and open a PR

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
- Don't add heavy animations (Framer Motion, backdrop-blur)
- Don't use date-fns (use dayjs instead)

## Code Review

PRs should include at least one review when possible. Reviewers will check:

- Code quality and readability
- Test coverage for new features
- No breaking changes without discussion
- Adherence to project conventions

## Questions?

Open a Discussion on GitHub or reach out via Issues.
