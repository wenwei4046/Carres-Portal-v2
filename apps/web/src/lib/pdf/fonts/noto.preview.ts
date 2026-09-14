/**
 * THE REVIEW PACKAGE'S FONTS — EMBEDDED, NEVER FETCHED.
 *
 * ⭐ THE DEFECT THIS FILE EXISTS TO FIX (owner report 2026-09-14). The hosted
 * review package drew no paper at all: the GRN pane read
 * `The GRN preview could not be drawn — Failed to fetch`, and `Try again`
 * never recovered because nothing about it was transient.
 *
 * The cause is `noto.ts`: it registers the document font by URL
 * (`https://cdn.jsdelivr.net/fontsource/…`), and `@react-pdf/font` resolves a
 * URL source with `fetch()` on the first render. That fetch is exactly right
 * for the portal on its own origin — and impossible in a hosted review
 * package, whose page may load scripts from a CDN but may not open a
 * connection to one. The font never arrived, so the PDF was never built, so
 * the pane had nothing to paint. A retry re-ran the same blocked fetch.
 *
 * `@react-pdf/font` decodes a `data:…;base64,` source with `atob` and makes no
 * request at all (`index.browser.js`: `isDataUrl` → `fontkit.create`), so the
 * fix is to hand it bytes instead of an address. Vite's `?inline` emits each
 * TTF as that data URI at build time.
 *
 * ONLY the portable preview build uses this file — `vite.portal-preview.config.ts`
 * swaps this module in by RESOLVED PATH (`vite.portal-preview.config.ts`). **The portal's own build is untouched**
 * and still fetches the full `chinese-simplified` subset from the CDN, so
 * nothing changes for production paper, including Chinese customer names.
 *
 * WHAT THE PACKAGE THEREFORE SHOWS, stated plainly: the same family at the same
 * four weights, from Fontsource's **latin** subset (4 × ~35 kB, committed under
 * `fonts/offline/`). Latin text — every word the fixture holds — is the same
 * typeface at the same metrics as production. CJK text would render blank in
 * the package and correctly in production; the fixture contains none.
 */
import { Font } from "@react-pdf/renderer";
import latin400 from "./offline/noto-sans-sc-latin-400.ttf?inline";
import latin500 from "./offline/noto-sans-sc-latin-500.ttf?inline";
import latin600 from "./offline/noto-sans-sc-latin-600.ttf?inline";
import latin700 from "./offline/noto-sans-sc-latin-700.ttf?inline";

export const NOTO_SANS_SC_FAMILY = "Noto Sans SC";

let registered = false;

export function registerNotoSansSC(): void {
  if (registered) return;
  Font.register({
    family: NOTO_SANS_SC_FAMILY,
    fonts: [
      { src: latin400, fontWeight: 400 },
      { src: latin500, fontWeight: 500 },
      { src: latin600, fontWeight: 600 },
      { src: latin700, fontWeight: 700 },
    ],
  });
  registered = true;
}
