# Contributing

## Requirements

- Node.js **>= 22**
- [pnpm](https://pnpm.io) 9 (`packageManager` field in root `package.json`)

## Setup

```bash
CI=true pnpm install
pnpm --filter @vibebyte/vibe3d-editor build
pnpm --filter @vibebyte/vibe3d-daemon build
pnpm --filter @vibebyte/vibe3d-mcp build
pnpm test
```

`CI=true` accepts pnpm's reinstall prompt in clean checkouts.

## Checks

```bash
pnpm check          # typecheck + lint + generated artifact gate
pnpm test           # unit tests
pnpm smoke          # optional local smoke (needs Chrome for render checks)
```

## Project layout

| Package | Role |
| --- | --- |
| `@vibebyte/vibe3d-mcp` | MCP stdio server (npm entry for agents) |
| `@vibebyte/vibe3d-daemon` | Local HTTP/WS daemon + editor assets |
| `@vibebyte/vibe3d-editor` | Editor UI (private; packed into daemon) |
| other `@vibebyte/vibe3d-*` | protocol, scene, client, CLI, capabilities |

## Identity

| Surface | Value |
| --- | --- |
| GitHub | `https://github.com/vibebytes/vibe3d` |
| npm scope | `@vibebyte` |
| MCP Registry | `io.github.vibebytes/vibe3d` |

Please keep these three names consistent in docs and metadata.

## Pull requests

- Prefer small, focused commits with English messages.
- Do not commit `.devhome/`, tokens, or machine-local paths.
- Add or update tests when changing protocol or MCP behavior.
