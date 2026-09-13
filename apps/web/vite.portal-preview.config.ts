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

/* `PORTABLE_FILE=1` builds the classic-script variant that opens from a
   double-clicked file:// URL (browsers refuse ES modules from file://). The
   PDF worker still needs http, so the GRN paper pane renders only when the
   folder is served; everything else works from the file. */
const asFile = process.env.PORTABLE_FILE === "1";

export default mergeConfig(base, {
  base: "./",
  build: {
    outDir: asFile ? "dist-portal-preview-file" : "dist-portal-preview",
    emptyOutDir: true,
    modulePreload: !asFile,
    rollupOptions: {
      input: "portal-shell-preview.html",
      output: asFile ? { format: "iife", inlineDynamicImports: true } : {},
    },
  },
  plugins: asFile
    ? [
        {
          name: "portable-file-html",
          transformIndexHtml: (html: string) => html.replace(/ type="module"/g, " defer").replace(/ crossorigin/g, ""),
        },
      ]
    : [],
});
