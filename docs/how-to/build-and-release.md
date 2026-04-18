# How to build and release

This guide covers local builds and the repository release flow.

## Build locally

### Build frontend bundle

```bash
pnpm build
```

### Build desktop app bundle (Tauri)

```bash
pnpm tauri build
```

(`pnpm build:tauri` is equivalent in `package.json`.)

### Build MCP binary

```bash
cargo build --release -p kessai-mcp
```

### Build web server binary

```bash
cargo build --release -p kessai-web
```

## Run release quality gates

Before a release:

```bash
pnpm check
pnpm test:run
cargo test --workspace
```

## Create a release (maintainers)

Repository release process is automated via `release-it` + GitHub Actions.

Preconditions:

- Clean working tree
- On `main`
- CI passing

Dry run:

```bash
pnpm release:dry
```

Real release:

```bash
pnpm release
```

What this triggers:

1. Version bump + changelog/tag
2. Version sync across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`
3. GitHub `release.yml` builds installers and publishes release artifacts (including updater metadata)

## Important constraints

- Do not manually create release tags or GitHub Releases for normal flow.
- Use Conventional Commit messages for clean changelog generation.

## See also

- [How to test](./test.md)
- [How to install](./install.md)
- [How to run locally](./run-locally.md)
- [Commands and scripts](../reference/commands-and-scripts.md)
- [Configuration](../reference/configuration.md)
