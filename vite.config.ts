import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/rubic/",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    testTimeout: 30_000,
    // The full 4×4 and 5×5 batches spawn worker threads. One file at a time
    // keeps a small CI runner from oversubscribing and blowing the batch timeout.
    fileParallelism: false,
  },
  build: {
    sourcemap: true,
    target: "es2022",
  },
});
