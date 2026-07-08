import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests render videos — long timeout
    testTimeout: 600_000,
    hookTimeout: 600_000,
    // Only run the integration test file
    include: ["tests/render.test.ts"],
    // Don't run in parallel — rendering is resource-intensive
    pool: "forks",
    fileParallelism: false,
    reporters: ["verbose"],
    env: { CI: "true" },
  },
});
