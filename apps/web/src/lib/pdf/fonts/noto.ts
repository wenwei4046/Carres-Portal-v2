/**
 * Noto Sans SC font registration for @react-pdf/renderer.
 *
 * Strategy (M4 Task 4 — Option A): runtime fetch from the Fontsource jsdelivr
 * CDN. This avoids embedding any font bytes in the Workers bundle (the F-11
 * size risk) — Fontsource hosts stable TTF files at predictable URLs that
 * Cloudflare Workers can `fetch()` at request time.
 *
 * `@react-pdf/renderer` accepts an HTTPS URL via `Font.register({ src })` and
 * fetches it on first render; subsequent renders within the same Worker
 * instance reuse the cached glyph data.
 *
 * Cold-start cost: 1 fetch on the first PDF per Worker isolate (~2.5 MB for
 * the chinese-simplified subset). Failure mode: if jsdelivr is unreachable,
 * that single PDF render throws; the Worker isolate stays healthy and retries
 * on the next request.
 *
 * Fontsource is the same package family `npm install @fontsource/noto-sans-sc`
 * uses, served via jsdelivr's mirror at predictable paths. Choosing the SC
 * (Simplified Chinese) variant covers Loo's customer-name / address use case.
 *
 * Why not gstatic.com directly: Google Fonts' static URLs are versioned
 * (e.g. /s/notosanssc/v36/...) and rotate without notice — pinning them
 * creates 404s when the version bumps. Fontsource's `@latest` channel is
 * stable.
 *
 * Why ONLY the chinese-simplified subset (M4.5 fix from M4.4 setup):
 * `@react-pdf/font` does NOT support `unicodeRange` glyph-aware fallback —
 * it picks one source per (family, weight, style) tuple via plain `find()`,
 * so registering both `latin-400` and `chinese-simplified-400` would cause
 * the latin one to win for ALL characters (including CJK), producing
 * garbage glyphs for `王小明`-style customer names. Fortunately Fontsource's
 * chinese-simplified subset contains BOTH ASCII (A-Z, 0-9, +, -, etc.) AND
 * CJK ideographs in a single TTF, so registering only that file gives full
 * coverage for English DO numbers + Chinese customer names alike.
 * Verified via fontkit `glyphsForString` against the actual TTF bytes.
 */

import { Font } from "@react-pdf/renderer";

export const NOTO_SANS_SC_FAMILY = "Noto Sans SC";

// jsdelivr-hosted Fontsource TTF. The chinese-simplified subset of Noto Sans
// SC contains both basic latin glyphs and CJK ideographs — see file header
// comment for why we don't combine separate latin + CJK files.
const FONTSOURCE_BASE = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest";
const NOTO_SANS_SC_400 = `${FONTSOURCE_BASE}/chinese-simplified-400-normal.ttf`;
const NOTO_SANS_SC_700 = `${FONTSOURCE_BASE}/chinese-simplified-700-normal.ttf`;

let registered = false;

/**
 * Register Noto Sans SC with @react-pdf/renderer.
 *
 * Idempotent — safe to call on every render. The library deduplicates by
 * family name internally, but we add an extra guard to avoid the work.
 *
 * Registers chinese-simplified TTFs at 400 and 700 weights — that single
 * subset covers both ASCII and CJK glyphs needed for the DO/PO templates.
 */
export function registerNotoSansSC(): void {
  if (registered) return;
  Font.register({
    family: NOTO_SANS_SC_FAMILY,
    fonts: [
      { src: NOTO_SANS_SC_400, fontWeight: 400 },
      { src: NOTO_SANS_SC_700, fontWeight: 700 },
    ],
  });
  registered = true;
}
