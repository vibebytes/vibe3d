# @vibebyte/vibe3d-daemon

Local HTTP/WebSocket daemon for [vibe3d](https://github.com/vibebytes/vibe3d): scene rooms, editor UI, and Chromium-backed rendering.

Most users should install the MCP entrypoint instead:

```bash
npx -y @vibebyte/vibe3d-mcp
```

That process starts this daemon automatically.

## Requirements

- Node.js >= 22
- Optional: system Chrome / Chromium / Edge for snapshots (set `VIBE3D_CHROME` if needed)

## Run directly

```bash
npx -y @vibebyte/vibe3d-daemon
# or after install:
vibe3d-daemon
```

Listens on `127.0.0.1` only. Set `VIBE3D_TOKEN` on shared machines.

## Docs

- English: https://github.com/vibebytes/vibe3d/blob/main/README.md
- 中文: https://github.com/vibebytes/vibe3d/blob/main/README_CN.md

## License

Apache-2.0
