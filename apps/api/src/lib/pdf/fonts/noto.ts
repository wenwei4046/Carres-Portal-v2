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
 * Cold-start cost: 1 fetch on the first PDF per Worker isolate (each TTF is
 * ~2.5 MB for the chinese-simplified subset, ~35 KB for the latin subset).
 * Failure mode: if jsdelivr is unreachable, that single PDF render throws; the
 * Worker isolate stays healthy and retries on the next request.
 *
 * Fontsource is the same package family `npm install @fontsource/noto-sans-sc`
 * uses, served via jsdelivr's mirror at predictable paths. Choosing the SC
 * (Simplified Chinese) variant covers Loo's customer-name / address use case.
 *
 * Why not gstatic.com directly: Google Fonts' static URLs are versioned
 * (e.g. /s/notosanssc/v36/...) and rotate without notice — pinning them
 * creates 404s when the version bumps. Fontsource's `@latest` channel is
 * stable.
 */

import { Font } from "@react-pdf/renderer";

export const NOTO_SANS_SC_FAMILY = "Noto Sans SC";

// jsdelivr-hosted Fontsource TTFs. The chinese-simplified subset includes
// CJK glyphs; latin subset covers ASCII / European letters in the same family.
const FONTSOURCE_BASE = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest";
const NOTO_SANS_SC_LATIN_400 = `${FONTSOURCE_BASE}/latin-400-normal.ttf`;
const NOTO_SANS_SC_LATIN_700 = `${FONTSOURCE_BASE}/latin-700-normal.ttf`;
const NOTO_SANS_SC_CJK_400 = `${FONTSOURCE_BASE}/chinese-simplified-400-normal.ttf`;
const NOTO_SANS_SC_CJK_700 = `${FONTSOURCE_BASE}/chinese-simplified-700-normal.ttf`;

let registered = false;

/**
 * Register Noto Sans SC with @react-pdf/renderer.
 *
 * Idempotent — safe to call on every render. The library deduplicates by
 * family name internally, but we add an extra guard to avoid the work.
 *
 * Registers both latin + chinese-simplified subsets at 400 and 700 weights.
 * @react-pdf's internal font shaper picks whichever subset matches each glyph,
 * so the latin file handles ASCII characters while the CJK file handles
 * Chinese characters in customer names / addresses.
 */
export function registerNotoSansSC(): void {
  if (registered) return;
  Font.register({
    family: NOTO_SANS_SC_FAMILY,
    fonts: [
      { src: NOTO_SANS_SC_LATIN_400, fontWeight: 400 },
      { src: NOTO_SANS_SC_LATIN_700, fontWeight: 700 },
      { src: NOTO_SANS_SC_CJK_400, fontWeight: 400 },
      { src: NOTO_SANS_SC_CJK_700, fontWeight: 700 },
    ],
  });
  registered = true;
}
