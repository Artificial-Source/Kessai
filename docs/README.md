# Subby Documentation

Welcome to the Subby documentation. This guide will help you understand the codebase and contribute effectively.

## Quick Links

| Document                                | Description                                  |
| --------------------------------------- | -------------------------------------------- |
| [Architecture](./architecture.md)       | System design, data flow, and tech decisions |
| [Backend API](./backend-api.md)         | Rust commands, database schema, SQL plugin   |
| [Troubleshooting](./troubleshooting.md) | Common issues and solutions                  |

## Getting Started

### For Users

1. Download from [GitHub Releases](https://github.com/g0dxn4/subby/releases) or build from source
2. See [Troubleshooting](./troubleshooting.md) if you encounter issues

### For Developers

1. Read the [Architecture](./architecture.md) overview
2. Set up your environment:
   ```bash
   pnpm install
   pnpm tauri dev
   ```
3. Run tests before submitting PRs:
   ```bash
   pnpm test
   pnpm lint
   pnpm typecheck
   ```

## Project Status

**Version**: 0.1.0 (MVP Complete)

**Test Coverage**: 91%+ (136 tests)

## Additional Resources

- [Discord Bot Setup](../packages/discord-bot/README.md)
- [CLAUDE.md](../CLAUDE.md) — Context for AI assistants
