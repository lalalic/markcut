import { defineConfig } from "vitest/config";

// Publish gating runs deterministic tests that do not require local media,
// ffmpeg/ffprobe, live vision services, or a media HTTP server.
// Full coverage remains available with `npm test` and `npm run test:integration`.
export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "tests/render.test.ts",
      "tests/vision.test.ts",
      "tests/vision-candidate.test.ts",
      "tests/mcp-remote-assets.test.ts",
    ],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: "forks",
    fileParallelism: false,
    reporters: ["verbose"],
    env: { CI: "true" },
  },
});
