# vibe3d

<p align="center">
  <a href="./README.md">English</a> |
  <a href="./README_CN.md">简体中文</a>
</p>

vibe3d 是一个用于构建与渲染 3D 场景的 MCP 服务。一条命令即可启动协议进程，并由它自动拉起本地 daemon。

需要 **Node.js >= 20**（与 [MCP TypeScript SDK v2](https://github.com/modelcontextprotocol/typescript-sdk) 官方要求一致）。采用 [Apache-2.0](./LICENSE) 开源许可。

<p align="center">
  <img src="./docs/wechat-core-group.jpg" alt="vibe3D核心用户讨论群" width="360"><br>
  <strong>vibe3D核心用户讨论群</strong>
</p>

## 对外身份

| 渠道 | 值 |
| --- | --- |
| GitHub | [github.com/vibebytes/vibe3d](https://github.com/vibebytes/vibe3d) |
| npm | `@vibebyte/vibe3d-mcp`（及其他 `@vibebyte/vibe3d-*` 包） |
| MCP Registry | `io.github.vibebytes/vibe3d` |

## 安装

```bash
npx -y @vibebyte/vibe3d-mcp@latest
```

daemon **只监听本机回环地址**（`127.0.0.1` / `localhost`）。

客户端配置：

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

Cursor / Claude Desktop 等 GUI 往往**不会**加载交互 shell 配置（`~/.zshrc`、nvm 钩子等）。像 `bash -lc "nvm use …"` 这种写法在 macOS 上通常**无效**：登录用的 `bash` 不会加载 zsh 里的 nvm。不要把版本管理器包装进 MCP 配置。

配置里请保留 `@latest`：不带版本号时 `npx` 会一直复用缓存，reload MCP 也拿不到新版本。新版 MCP 启动时会顺带重启旧版本的本地 daemon。

先让 GUI 实际用到的默认 `node` / `npx` **>= 20**，再用上面的 JSON：

1. 用[官网安装包](https://nodejs.org/)或 Homebrew 安装 Node.js 20+，让系统默认 `node` 就是 20+；或
2. 若用版本管理器，把 **default** 设为 20+，并确保其 shim 在 GUI 能继承的非交互 PATH 上（例如 Volta 的 `~/.volta/bin`）。仅执行 `nvm alias default 20` 而 nvm 只在 zsh 里加载时，**不能**修好 Cursor。

### Cursor

把默认 JSON 写入 `.cursor/mcp.json` 或用户级 MCP 配置。若一直 Error，打开 MCP Output：提示 Node < 20 时，应修 GUI PATH 上的默认 Node（见上），而不是改 MCP JSON 形态。

### Claude Desktop

同样写入 `claude_desktop_config.json`。

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

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `VIBE3D_HOME` | daemon 数据目录 |
| `VIBE3D_CHROME` | 用于渲染的 Chrome / Chromium 可执行文件 |
| `VIBE3D_ROOM` | 进程启动时绑定的房间 |
| `VIBE3D_MCP_LOG` | 设为 `0` 可关闭 `mcp.log` |
| `VIBE3D_RESTART_DAEMON` | 设为 `1`（或传 `--restart-daemon`）：每次 MCP 进程启动都重启本地 daemon |

MCP 进程启动时若发现本地 daemon 版本与自己不同，会先停掉它（SIGTERM，数据会落盘）再拉起匹配版本，所以重启 MCP 就能用上升级后的 daemon。房间默认只在 daemon 内存里，除非以 `--persist`（`VIBE3D_PERSIST=1`）运行；重启非持久化 daemon 会丢掉其中的房间。`--url` 指向的远程 daemon 不会被动。

渲染依赖系统里的 Chrome、Chromium 或 Edge，包内不会下载浏览器。没有浏览器时仍可编辑场景，`vibe3d_status` 会报告渲染不可用。

## 平台支持

| 平台 | 状态 |
| --- | --- |
| macOS | 已验证 |
| Linux | 系统默认路径有 Chrome / Chromium 时预期可用；此处未复测 |
| Windows | 尚未验证。可尝试设置 `VIBE3D_CHROME` |

## 工具

服务暴露一组分组工具。每次调用传入 `op`，例如 `vibe3d_room` 配 `op: "create"`，这样 `tools/list` 更小。未知工具名会以工具错误（`isError`）返回，方便模型自我纠正。耗时的渲染与导出走 job：用 `vibe3d_job` 轮询。

## 多房间与多聊天

一个 MCP 进程只有一个默认房间。只接触过一个房间时，房间级工具可省略 `room_id`（结果标「隐式」即用了默认房间）；进程接触第二个房间（或多个聊天共用进程）后，不带 `room_id` 的调用会被拒绝并列出候选。请在每次调用里传自己建房时返回的 `room_id`；显式 `room_id` 只路由这一次调用，不改写默认房间。确认只有一个聊天在用时，可用 `vibe3d_room {op:"use"}` 钉死默认房间。

## 诊断

```bash
npx -y @vibebyte/vibe3d-mcp@latest --doctor --json
```

会打印 Node 版本、daemon 健康、Chrome 发现、schema 文件与版本匹配情况，不会启动 MCP 会话。

## 开发

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。在本仓库、Node 20+ 下：

```bash
CI=true pnpm install
pnpm --filter @vibebyte/vibe3d-editor build
pnpm --filter @vibebyte/vibe3d-daemon build
pnpm --filter @vibebyte/vibe3d-mcp build
```

`pnpm install` 可能提示重建 `node_modules`；`CI=true` 会自动接受该提示。

安全问题请见 [SECURITY.md](./SECURITY.md)。
