#!/bin/zsh
set -eu
export PATH="/Users/kai/.volta/bin:$PATH"
cd "$(dirname "$0")/.."
PORT=18799
PID=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null | head -1 || true)
[[ -n "$PID" ]] && kill -9 $PID
rm -rf /tmp/vibe3d-e2e && mkdir -p /tmp/vibe3d-e2e
VIBE3D_HOME=/tmp/vibe3d-e2e VIBE3D_TOKEN=e2e-token VIBE3D_RENDERER=auto \
  exec volta run --node 22.23.2 -- node --import tsx packages/daemon/src/index.ts --port $PORT --log-level warn
