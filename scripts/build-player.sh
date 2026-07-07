#!/bin/bash
# Build the browser player bundle.
# Run from project root: bash scripts/build-player.sh
set -e

cd "$(dirname "$0")/.."
OUT_DIR="src/player/bundle"
mkdir -p "$OUT_DIR"

echo "Building browser player..."
npx esbuild src/player/browser.tsx \
  --bundle \
  --outfile="$OUT_DIR/player.js" \
  --format=esm \
  --platform=browser \
  --target=es2020 \
  --define:process.env.NODE_ENV='"production"' \
  2>&1

echo "Done → $OUT_DIR/player.js ($(wc -c < "$OUT_DIR/player.js") bytes)"
