# vibe3d

<p align="center">
  <a href="./README.md">English</a> |
  <a href="./README_CN.md">简体中文</a>
</p>

vibe3d is an MCP server for building and rendering 3D scenes. One command starts the protocol server, which launches the local daemon for you.

Requires **Node.js >= 20** (same as the [MCP TypeScript SDK v2](https://github.com/modelcontextprotocol/typescript-sdk)). Licensed under [Apache-2.0](./LICENSE).

## Identity

| Surface | Value |
| --- | --- |
| GitHub | [github.com/vibebytes/vibe3d](https://github.com/vibebytes/vibe3d) |
| npm | `@vibebyte/vibe3d-mcp` (and other `@vibebyte/vibe3d-*` packages) |
| MCP Registry | `io.github.vibebytes/vibe3d` |

## Install

```bash
npx -y @vibebyte/vibe3d-mcp
```

The daemon listens on **loopback only** (`127.0.0.1` / `localhost`).

Client config:

```json
{
  "mcpServers": {
    "vibe3d": {
      "command": "npx",
      "args": ["-y", "@vibebyte/vibe3d-mcp"]
    }
  }
}
```

GUI apps (Cursor, Claude Desktop) often do **not** see your interactive-shell Node. Make sure the Node those apps spawn is **>= 20**, then use the JSON above. Practical options (pick one; no machine-specific absolute paths):

1. Install Node.js 20+ as the system default (`node -v` / `npx -v` outside any project already show 20+), via the [official installer](https://nodejs.org/) or Homebrew; or
2. Point your version manager’s **default** at 20+ (`nvm alias default 20`, `fnm default 20`, or Volta’s default Node 20+), then use the JSON above; or
3. If the manager is only available in a login shell, wrap `npx` (examples):

```json
{
  "mcpServers": {
    "vibe3d": {
      "command": "bash",
      "args": ["-lc", "nvm use 20 >/dev/null && npx -y @vibebyte/vibe3d-mcp"]
    }
  }
}
```

```json
{
  "mcpServers": {
    "vibe3d": {
      "command": "bash",
      "args": ["-lc", "volta run --node 20 -- npx -y @vibebyte/vibe3d-mcp"]
    }
  }
}
```

### Cursor

Use the default JSON above in `.cursor/mcp.json` or the user MCP config. If status stays Error, open MCP Output — a Node < 20 message means apply option 1–3.

### Claude Desktop

Same JSON in `claude_desktop_config.json`.

### Claude Code

```bash
claude mcp add vibe3d -- npx -y @vibebyte/vibe3d-mcp
```

### VS Code

```json
{
  "servers": {
    "vibe3d": {
      "command": "npx",
      "args": ["-y", "@vibebyte/vibe3d-mcp"]
    }
  }
}
```

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector --cli npx -y @vibebyte/vibe3d-mcp --method tools/list
```

## Environment

| Variable | Purpose |
| --- | --- |
| `VIBE3D_HOME` | Daemon data directory |
| `VIBE3D_CHROME` | Chrome or Chromium executable used for rendering |
| `VIBE3D_ROOM` | Room bound when the process starts |
| `VIBE3D_MCP_LOG` | Set to `0` to disable `mcp.log` |

Rendering uses a system Chrome, Chromium, or Edge. The package does not download a browser. Without one, scene editing still works and `vibe3d_status` reports that rendering is unavailable.

## Support

| Platform | Status |
| --- | --- |
| macOS | Verified |
| Linux | Expected when Chrome or Chromium is on the default path. Not re-checked here |
| Windows | Not verified. Set `VIBE3D_CHROME` if you try it |

## Tools

The server exposes a small set of grouped tools. Each call passes `op`, for example `vibe3d_room` with `op: "create"`. This keeps `tools/list` small. Unknown tool names come back as tool errors (`isError`) so the model can correct itself. Long renders and exports are jobs: poll `vibe3d_job`.

## Diagnostics

```bash
npx -y @vibebyte/vibe3d-mcp --doctor --json
```

This prints the Node version, daemon health, Chrome discovery, schema file, and version match. It does not start an MCP session.

## Develop

See [CONTRIBUTING.md](./CONTRIBUTING.md). From this repository, with Node 20+:

```bash
CI=true pnpm install
pnpm --filter @vibebyte/vibe3d-editor build
pnpm --filter @vibebyte/vibe3d-daemon build
pnpm --filter @vibebyte/vibe3d-mcp build
```

`pnpm install` may ask to reinstall `node_modules` from scratch. `CI=true` accepts that prompt.

Security reports: [SECURITY.md](./SECURITY.md).
