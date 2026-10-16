#!/usr/bin/env bash
# NeoY stdio entrypoint: load the user's login environment so the compiler
# receives GOOGLE_MAPS_API_KEY without embedding it in MCP config or JSON.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec /bin/zsh -lc 'exec node "$1"' _ "$ROOT/src/mcp/server.mjs"
