import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@carres/shared": fileURLToPath(new URL("../../packages/shared/src", import.meta.url)),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
