import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/test/**/*.test.ts"],
    // Bitta test bazasi — fayllar ketma-ket
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
