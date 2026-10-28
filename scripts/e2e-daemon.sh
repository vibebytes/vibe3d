#!/bin/zsh
set -eu
cd "$(dirname "$0")/.."
if [[ -n "${VOLTA_HOME:-}" ]]; then
  export PATH="$VOLTA_HOME/bin:$PATH"
fi
run() {
  if command -v volta >/dev/null 2>&1; then
    volta run --node 22 -- "$@"
  else
    "$@"
  fi
}
PORT=18799
PID=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null | head -1 || true)
[[ -n "$PID" ]] && kill -9 $PID
rm -rf /tmp/vibe3d-e2e && mkdir -p /tmp/vibe3d-e2e
VIBE3D_HOME=/tmp/vibe3d-e2e VIBE3D_TOKEN=e2e-token VIBE3D_RENDERER=auto \
  exec run node --import tsx packages/daemon/src/index.ts --port $PORT --log-level warn
