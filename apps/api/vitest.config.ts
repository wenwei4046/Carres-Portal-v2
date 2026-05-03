import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// React plugin so .tsx (PDF templates) compiles in vitest. The api itself ships
// to Cloudflare Workers via Wrangler/esbuild — esbuild handles JSX natively, so
// no plugin is needed at deploy time.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@carres/shared": fileURLToPath(new URL("../../packages/shared/src", import.meta.url)),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
