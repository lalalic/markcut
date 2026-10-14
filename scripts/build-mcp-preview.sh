#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
./node_modules/.bin/esbuild src/mcp/remotion-app.tsx \
  --bundle --minify --format=iife --platform=browser --target=es2020 \
  --define:process.env.NODE_ENV='"production"' \
  --outfile=src/mcp/remotion-app.bundle.js
