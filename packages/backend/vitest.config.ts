import path from "path";
import { defineConfig } from "vitest/config";

// Analyzer math is time-of-day aware (hour-of-day histograms), so the whole
// suite runs in UTC to keep generated timestamps and the engine's local-hour
// reads aligned and deterministic across machines.
export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    env: { TZ: "UTC" },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@puppy-track/common": path.resolve(__dirname, "../common/src/index.ts"),
      "@puppy-track/db": path.resolve(__dirname, "../db/src/index.ts"),
    },
  },
});
