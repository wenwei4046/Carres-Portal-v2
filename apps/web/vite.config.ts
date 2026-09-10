import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  define: {
    // The bundle knows which commit it IS, so a long-open tab can tell the
    // operator its running version and compare it with the served
    // `__carres_deploy.json` — the same proof `scripts/verify-production.mjs`
    // polls. `local` in dev, the deploy SHA in CI (write-deploy-proof.mjs
    // reads the same variables).
    __CARRES_BUILD__: JSON.stringify({
      commit: process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local",
      builtAt: new Date().toISOString(),
    }),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // Honour a harness-assigned port (Claude Code preview autoPort) so
    // parallel chats never fight over one port; default stays 5173.
    port: Number(process.env.PORT) || 5173,
    open: false,
  },
});
