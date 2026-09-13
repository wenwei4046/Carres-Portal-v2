/**
 * PORTABLE REVIEW PACKAGE — the Receiving destination inside the REAL Portal
 * shell, built from `portal-shell-preview.html` alone, with relative asset
 * paths so the folder runs from any static host (or a claude.ai artifact)
 * without this repository's dev server, Worker or database. The fixture stub
 * in `src/dev/receiving-fixture.ts` answers every API call.
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:8888 VITE_PREVIEW_SHA=$(git rev-parse --short HEAD) \
 *     pnpm --filter @carres/web exec vite build --config vite.portal-preview.config.ts
 *
 * Output: apps/web/dist-portal-preview/ (not committed).
 */
import { mergeConfig } from "vite";
import base from "./vite.config";

export default mergeConfig(base, {
  base: "./",
  build: {
    outDir: "dist-portal-preview",
    emptyOutDir: true,
    rollupOptions: { input: "portal-shell-preview.html" },
  },
});
