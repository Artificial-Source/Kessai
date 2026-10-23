# Install the Kessai agent skill

This directory is the offline skill included in Kessai 1.0.0 CLI release archives. Its entry point is [`SKILL.md`](./SKILL.md); generated [CLI](./references/cli.md) and [MCP](./references/mcp.md) references accompany it.

## Install into an agent environment

```bash
npx skills add Artificial-Source/Kessai --skill kessai
```

For offline installation, copy this entire `kessai` directory into your agent host's skills directory, following that host's installation instructions. Keep `SKILL.md` and `references/` together.

## Install the binary

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/Artificial-Source/Kessai/main/install-cli.sh | sh
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/Artificial-Source/Kessai/main/install-cli.ps1 | iex
```

The installers require no administrator rights and verify release SHA-256 sidecars. Supported targets are Linux x64, macOS x64/arm64, and Windows x64. Alternatively, extract the matching release archive and put its binary on `PATH`.

## Connect the installed server

```bash
kessai-mcp info --json
kessai-mcp setup --output .mcp.json --dry-run
kessai-mcp setup --output .mcp.json
```

Check the database reported by `info`, review the proposed configuration, then write it and reload your MCP client. Use `setup --read-only` when the client should only read data. The skill targets binary version `1.0.0` and contract schema version `1`; installed help and machine schemas remain authoritative.
