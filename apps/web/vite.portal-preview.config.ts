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
import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
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
    /* ⭐ THE PAPER MUST DRAW WITH NO NETWORK (owner report 2026-09-14).
       `lib/pdf/fonts/noto.ts` registers the document font by CDN URL, and
       `@react-pdf/font` resolves a URL source with `fetch()` — a request a
       hosted review page may not make, which is why every GRN pane read
       `Failed to fetch` and no retry could help. The package build — and ONLY
       the package build — swaps that one module for the sibling that embeds
       the font bytes as `data:` URIs.

       It is matched by RESOLVED PATH, not by specifier: nine templates and
       `render.ts` import it as `./fonts/noto`, so an alias on `@/lib/pdf/...`
       would have silently missed every one of them (it did, in the first cut
       of this fix — the built bundle still carried the jsdelivr URL). */
    /* …and the bytes must be BYTES. Vite 5 emits a `?inline` font as a FILE and
       hands back its URL — measured: the first build of this fix produced
       `assets/noto-sans-sc-latin-400-*.ttf` and a bundle that still called
       `fetch()`, merely at a different address. A same-origin request is not
       the same as no request: the `file://` variant of this package has no
       origin to ask. This plugin reads each font at build time and returns the
       real `data:` URI `@react-pdf/font` decodes with `atob`. */
    {
      name: "portable-inline-fonts",
      enforce: "pre" as const,
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith(".ttf?inline") || !importer) return null;
        return `${resolvePath(dirname(importer), source.slice(0, -"?inline".length))}?inline-font`;
      },
      load(id: string) {
        if (!id.endsWith("?inline-font")) return null;
        const file = id.slice(0, -"?inline-font".length);
        return `export default "data:font/ttf;base64,${readFileSync(file).toString("base64")}";`;
      },
    },
    {
      name: "portable-offline-fonts",
      enforce: "pre" as const,
      async resolveId(this: { resolve: (s: string, i?: string, o?: Record<string, unknown>) => Promise<{ id: string } | null> }, source: string, importer: string | undefined, options: Record<string, unknown>) {
        if (!/(^|\/)fonts\/noto(\.ts)?$/.test(source)) return null;
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        if (!resolved || !resolved.id.replace(/\\/g, "/").endsWith("/src/lib/pdf/fonts/noto.ts")) return null;
        return fileURLToPath(new URL("./src/lib/pdf/fonts/noto.preview.ts", import.meta.url));
      },
    },
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
