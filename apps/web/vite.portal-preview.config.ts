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
  plugins: [
    /* The Carres lockup names its images by root path ("/carres-logo.png"),
       which is right for the app at its own origin and wrong for a package
       served under a folder or from a file. The packaging step rewrites those
       two references to relative paths in the emitted chunks — reproducible,
       never a hand edit of generated output. */
    {
      name: "portable-relative-lockup",
      generateBundle(_options: unknown, bundle: Record<string, { type: string; code?: string }>) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== "chunk" || !chunk.code) continue;
          chunk.code = chunk.code
            .replace(/"\/carres-logo\.png"/g, '"./carres-logo.png"')
            .replace(/"\/carres-wordmark\.webp"/g, '"./carres-wordmark.webp"');
        }
      },
    },
    ...(asFile
      ? [
          {
            name: "portable-file-html",
            transformIndexHtml: (html: string) => html.replace(/ type="module"/g, " defer").replace(/ crossorigin/g, ""),
          },
        ]
      : []),
  ],
});
