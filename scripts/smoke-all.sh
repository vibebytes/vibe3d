#!/bin/zsh
set -u
set -o pipefail
cd "$(dirname "$0")/.." || exit 1

# Prefer Node on PATH (requires >=22). Optional: VOLTA_HOME if you use Volta.
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

PORTS=(18788 18790)
PIDS=()
FAILED=0

port_pid() { lsof -nP -iTCP:$1 -sTCP:LISTEN -t 2>/dev/null | head -1; }

free_ports() {
  for p in $PORTS; do
    local pid=$(port_pid $p)
    [[ -n "$pid" ]] && kill -9 $pid 2>/dev/null
  done
  pkill -f 'vibe3d-chrome-' 2>/dev/null
  for i in {1..40}; do
    local busy=0
    for p in $PORTS; do [[ -n "$(port_pid $p)" ]] && busy=1; done
    (( busy == 0 )) && return 0
    sleep 0.25
  done
  echo "!! 端口未释放: $PORTS" >&2
  return 1
}

chrome_left() { pgrep -f 'vibe3d-chrome-' 2>/dev/null | wc -l | tr -d ' '; }

cleanup() {
  for pid in $PIDS; do kill -TERM $pid 2>/dev/null; done
  sleep 2
  for pid in $PIDS; do kill -9 $pid 2>/dev/null; done
  pkill -f 'vibe3d-chrome-' 2>/dev/null
  for p in $PORTS; do
    local pid=$(port_pid $p)
    [[ -n "$pid" ]] && kill -9 $pid 2>/dev/null
  done
}
trap cleanup EXIT

start_daemon() {
  local home=$1 port=$2 log=$3
  VIBE3D_HOME=$home VIBE3D_TOKEN=${4} VIBE3D_RENDERER=auto \
    run node --import tsx packages/daemon/src/index.ts --port $port --log-level warn > $log 2>&1 &
  for i in {1..120}; do
    curl -sf -m 1 http://127.0.0.1:$port/health >/dev/null && break
    sleep 0.5
  done
  local pid=$(port_pid $port)
  if [[ -z "$pid" ]]; then
    echo "!! daemon 启动失败（端口 $port）" >&2
    tail -5 $log >&2
    return 1
  fi
  PIDS+=($pid)
  echo "== health$port: $(curl -s -m 2 http://127.0.0.1:$port/health) pid=$pid"
}

free_ports || exit 1
rm -rf /tmp/vibe3d-smoke /tmp/vibe3d-smoke2
mkdir -p /tmp/vibe3d-smoke /tmp/vibe3d-smoke2

start_daemon /tmp/vibe3d-smoke 18788 /tmp/v3d.log smoke-token-123 || exit 1
echo "== smoke-render"
VIBE3D_BASE=http://127.0.0.1:18788 VIBE3D_TOKEN=smoke-token-123 run node scripts/smoke-render.mjs 2>&1 | tail -4
st=($pipestatus)
echo "render_exit=$st[1]"
[[ $st[1] -eq 0 ]] || FAILED=1
echo "== smoke-daemon"
VIBE3D_BASE=http://127.0.0.1:18788 VIBE3D_TOKEN=smoke-token-123 run node scripts/smoke-daemon.mjs 2>&1 | tail -3
st=($pipestatus)
echo "daemon_exit=$st[1]"
[[ $st[1] -eq 0 ]] || FAILED=1

kill -TERM $PIDS[1] 2>/dev/null; sleep 2; PIDS=(${PIDS[2,-1]})
echo "== chrome left after shutdown: $(chrome_left)"

start_daemon /tmp/vibe3d-smoke2 18790 /tmp/v3d-mcp.log testtoken123456 || exit 1
echo "== smoke-mcp"
VIBE3D_URL=http://127.0.0.1:18790 VIBE3D_TOKEN=testtoken123456 run node scripts/smoke-mcp.mjs 2>&1 | grep -E '^(ok|FAIL|smoke-mcp)'
st=($pipestatus)
echo "mcp_exit=$st[1]"
[[ $st[1] -eq 0 ]] || FAILED=1

for pid in $PIDS; do kill -TERM $pid 2>/dev/null; done
PIDS=()
for i in {1..20}; do [[ "$(chrome_left)" == "0" ]] && break; sleep 0.25; done
echo "== chrome left final: $(chrome_left)"

if [[ $FAILED -ne 0 ]]; then
  echo "!! smoke 存在失败项" >&2
  exit 1
fi
echo "== smoke all ok"
