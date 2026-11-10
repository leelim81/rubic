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
    // The 5×5 batch uses its own worker threads. Running other files beside it
    // oversubscribes a two-core CI runner and blows the batch timeout.
    fileParallelism: false,
  },
  build: {
    sourcemap: true,
    target: "es2022",
  },
});
