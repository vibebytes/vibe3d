# vibe3d

vibe3d is an MCP server for building and rendering 3D scenes. One command starts the protocol server, which launches the local daemon for you.

Requires **Node.js >= 22**.

## Install

```bash
npx -y @vibebyte/vibe3d-mcp
```

Pass the daemon token with the `VIBE3D_TOKEN` environment variable. Do not put the token in the command arguments, because those show up in the process list.

```json
{
  "mcpServers": {
    "vibe3d": {
      "command": "npx",
      "args": ["-y", "@vibebyte/vibe3d-mcp"],
      "env": {
        "VIBE3D_TOKEN": "replace-me"
      }
    }
  }
}
```

If `npx` is not on the Node 22 path, set `command` to the absolute path of that Node binary and keep the same `args`.

### Cursor

Use the JSON block above in `.cursor/mcp.json` or the user MCP config.

### Claude Desktop

The same JSON goes in `claude_desktop_config.json`.

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
| `VIBE3D_TOKEN` | Daemon auth token |
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

From this repository, with Node 22:

```bash
CI=true pnpm install
pnpm --filter @vibebyte/vibe3d-editor build
pnpm --filter @vibebyte/vibe3d-daemon build
pnpm --filter @vibebyte/vibe3d-mcp build
```

`pnpm install` may ask to reinstall `node_modules` from scratch. `CI=true` accepts that prompt.

## 中文

vibe3d 是一个 3D 场景 MCP 服务。`npx -y @vibebyte/vibe3d-mcp` 会拉起协议进程，并自动启动本地 daemon。需要 Node.js 22 或更高版本。令牌放在环境变量 `VIBE3D_TOKEN` 里。渲染依赖系统里的 Chrome / Chromium，不随包下载浏览器；没有浏览器时仍可编辑场景。排障运行 `--doctor --json`。macOS 已验证；Linux 需系统里有 Chrome / Chromium，本次未复测；Windows 尚未验证。
