#!/usr/bin/env bash
# Rebuild all workspace packages without pnpm (turbo needs a pnpm binary on PATH).
# Usage: scripts/rebuild.sh [package ...]   # default: all
set -euo pipefail

cd "$(dirname "$0")/.."
B=./node_modules/.bin

build_lib() {
  ( cd "packages/$1" && "../../$B/tsup" src/index.ts --format esm --dts --clean )
}

build_tsup() {
  ( cd "packages/$1" && "../../$B/tsup" )
}

build_editor() {
  ( cd packages/editor && ./node_modules/.bin/vite build )
}

targets=("$@")
if [ ${#targets[@]} -eq 0 ]; then
  targets=(protocol scene capabilities client daemon mcp cli editor)
fi

for p in "${targets[@]}"; do
  echo "== $p =="
  case "$p" in
    protocol | scene | capabilities | client) build_lib "$p" ;;
    mcp)
      build_tsup mcp
      ( cd packages/mcp && node dist/schema-cli.js )
      ;;
    daemon | cli) build_tsup "$p" ;;
    editor) build_editor ;;
    *)
      echo "unknown package: $p" >&2
      exit 2
      ;;
  esac
done

echo "BUILD_DONE"
