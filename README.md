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
npx -y @vibebyte/vibe3d-mcp@latest
```

The daemon listens on **loopback only** (`127.0.0.1` / `localhost`).

Client config:

```json
{
  "mcpServers": {
    "vibe3d": {
      "command": "npx",
      "args": ["-y", "@vibebyte/vibe3d-mcp@latest"]
    }
  }
}
```

GUI apps (Cursor, Claude Desktop) often do **not** load interactive shell config (`~/.zshrc`, nvm hooks, etc.). A wrapper like `bash -lc "nvm use …"` usually **fails** on macOS: login `bash` does not load zsh’s nvm. Do not put version-manager wrappers in MCP config.

Keep `@latest` in the config: without a version tag `npx` reuses its cache and never picks up new releases, even after you reload the MCP server. A newer MCP also restarts an older local daemon on start.

Make the **default** `node` / `npx` on the PATH those apps actually use **>= 20**, then use the JSON above:

1. Install Node.js 20+ with the [official installer](https://nodejs.org/) or Homebrew so the system `node` is already 20+; or
2. If you use a version manager, set its **default** to 20+ **and** ensure its shims are on the non-interactive PATH the GUI inherits (for example Volta’s `~/.volta/bin`). `nvm alias default 20` alone does not fix Cursor if nvm is only sourced in zsh.

### Cursor

Use the default JSON above in `.cursor/mcp.json` or the user MCP config. If status stays Error, open MCP Output — a Node < 20 message means fix the default Node on the GUI PATH (options above), not the MCP JSON shape.

### Claude Desktop

Same JSON in `claude_desktop_config.json`.

### Claude Code

```bash
claude mcp add vibe3d -- npx -y @vibebyte/vibe3d-mcp@latest
```

### VS Code

```json
{
  "servers": {
    "vibe3d": {
      "command": "npx",
      "args": ["-y", "@vibebyte/vibe3d-mcp@latest"]
    }
  }
}
```

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector --cli npx -y @vibebyte/vibe3d-mcp@latest --method tools/list
```

## Environment

| Variable | Purpose |
| --- | --- |
| `VIBE3D_HOME` | Daemon data directory |
| `VIBE3D_CHROME` | Chrome or Chromium executable used for rendering |
| `VIBE3D_ROOM` | Room bound when the process starts |
| `VIBE3D_MCP_LOG` | Set to `0` to disable `mcp.log` |
| `VIBE3D_RESTART_DAEMON` | Set to `1` (or pass `--restart-daemon`) to restart the local daemon every time the MCP process starts |

When the MCP process starts and finds a local daemon of a different version, it stops that daemon (SIGTERM, data is flushed) and starts a matching one. Restarting the MCP therefore picks up an upgraded daemon. Rooms are stored on disk and survive the restart. `--url` remote daemons are never touched.

Rendering uses a system Chrome, Chromium, or Edge. The package does not download a browser. Without one, scene editing still works and `vibe3d_status` reports that rendering is unavailable.

## Support

| Platform | Status |
| --- | --- |
| macOS | Verified |
| Linux | Expected when Chrome or Chromium is on the default path. Not re-checked here |
| Windows | Not verified. Set `VIBE3D_CHROME` if you try it |

## Tools

The server exposes a small set of grouped tools. Each call passes `op`, for example `vibe3d_room` with `op: "create"`. This keeps `tools/list` small. Unknown tool names come back as tool errors (`isError`) so the model can correct itself. Long renders and exports are jobs: poll `vibe3d_job`.

## Multiple rooms and chats

One MCP process keeps one default room. While it has seen a single room, room tools may omit `room_id`; results marked "implicit" used that default. Once the process has seen a second room (or several chats share it), calls without `room_id` are rejected and list the candidates. Pass the `room_id` returned by your own `create` call on every call. An explicit `room_id` routes only that call and never changes the default. `vibe3d_room {op:"use"}` pins the default room when you know only one chat is active.

## Diagnostics

```bash
npx -y @vibebyte/vibe3d-mcp@latest --doctor --json
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
