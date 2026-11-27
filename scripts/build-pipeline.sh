#!/bin/bash
# Build the server-side pipeline bundle (descriptive resolve + compile).
# Run from project root: bash scripts/build-pipeline.sh
set -e

cd "$(dirname "$0")/.."
OUT_DIR="src/player"
OUT_FILE="$OUT_DIR/pipeline.mjs"

echo "Building pipeline bundle..."
npx esbuild src/player/pipeline.ts \
  --bundle \
  --outfile="$OUT_FILE" \
  --format=esm \
  --platform=node \
  --target=node18 \
  2>&1

echo "Done → $OUT_FILE ($(wc -c < "$OUT_FILE") bytes)"
