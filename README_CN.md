# vibe3d

<p align="center">
  <a href="./README.md">English</a> |
  <a href="./README_CN.md">简体中文</a>
</p>

vibe3d 是一个用于构建与渲染 3D 场景的 MCP 服务。一条命令即可启动协议进程，并由它自动拉起本地 daemon。

需要 **Node.js >= 22**。采用 [Apache-2.0](./LICENSE) 开源许可。

## 对外身份

| 渠道 | 值 |
| --- | --- |
| GitHub | [github.com/vibebytes/vibe3d](https://github.com/vibebytes/vibe3d) |
| npm | `@vibebyte/vibe3d-mcp`（及其他 `@vibebyte/vibe3d-*` 包） |
| MCP Registry | `io.github.vibebytes/vibe3d` |

## 安装

```bash
npx -y @vibebyte/vibe3d-mcp
```

### 鉴权与绑定

daemon **只监听本机回环地址**（`127.0.0.1` / `localhost`）。单机单用户可以不设令牌；共享机器或任何超出本机回环的场景，请设置 `VIBE3D_TOKEN`。

令牌请放在环境变量 `VIBE3D_TOKEN` 中，不要写进命令行参数（会出现在进程列表里）。

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

若 `npx` 不在 Node 22 的 PATH 上，把 `command` 设为该 Node 可执行文件的绝对路径，`args` 保持不变。

### Cursor

把上面的 JSON 写入 `.cursor/mcp.json` 或用户级 MCP 配置。

### Claude Desktop

同样写入 `claude_desktop_config.json`。

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

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `VIBE3D_TOKEN` | daemon 鉴权令牌（共享环境建议开启） |
| `VIBE3D_HOME` | daemon 数据目录 |
| `VIBE3D_CHROME` | 用于渲染的 Chrome / Chromium 可执行文件 |
| `VIBE3D_ROOM` | 进程启动时绑定的房间 |
| `VIBE3D_MCP_LOG` | 设为 `0` 可关闭 `mcp.log` |

渲染依赖系统里的 Chrome、Chromium 或 Edge，包内不会下载浏览器。没有浏览器时仍可编辑场景，`vibe3d_status` 会报告渲染不可用。

## 平台支持

| 平台 | 状态 |
| --- | --- |
| macOS | 已验证 |
| Linux | 系统默认路径有 Chrome / Chromium 时预期可用；此处未复测 |
| Windows | 尚未验证。可尝试设置 `VIBE3D_CHROME` |

## 工具

服务暴露一组分组工具。每次调用传入 `op`，例如 `vibe3d_room` 配 `op: "create"`，这样 `tools/list` 更小。未知工具名会以工具错误（`isError`）返回，方便模型自我纠正。耗时的渲染与导出走 job：用 `vibe3d_job` 轮询。

## 诊断

```bash
npx -y @vibebyte/vibe3d-mcp --doctor --json
```

会打印 Node 版本、daemon 健康、Chrome 发现、schema 文件与版本匹配情况，不会启动 MCP 会话。

## 开发

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。在本仓库、Node 22 下：

```bash
CI=true pnpm install
pnpm --filter @vibebyte/vibe3d-editor build
pnpm --filter @vibebyte/vibe3d-daemon build
pnpm --filter @vibebyte/vibe3d-mcp build
```

`pnpm install` 可能提示重建 `node_modules`；`CI=true` 会自动接受该提示。

安全问题请见 [SECURITY.md](./SECURITY.md)。
