/**
 * CJK detection helpers — pick the right font family for mixed-language text.
 *
 * The HQ operation surfaces (Phase 4 M5) display dealer + customer + warehouse
 * names that often mix Chinese and English (e.g. "Loo 王小明", "Carres 北区仓"),
 * and the proto reserves DM Sans for ASCII while Noto Sans SC carries CJK
 * glyphs cleanly. `cjkClassName(s)` returns the matching Tailwind family token
 * (`font-cjk` vs `font-body`) — see tailwind.config.ts `fontFamily.cjk`.
 *
 * Detection range: U+4E00–U+9FFF (BMP CJK Unified Ideographs). This covers
 * everyday Simplified + Traditional Chinese. Extended ranges (CJK Extension
 * A/B/C/D/E/F, Compatibility Ideographs) are out of scope for v2 — the brand
 * data we ingest doesn't include rare characters.
 */
const CJK_RE = /[一-鿿]/u;

/**
 * Returns true when `s` contains at least one CJK Unified Ideograph.
 * Empty / null / undefined input → false.
 */
export function isCjk(s: string | null | undefined): boolean {
  if (!s) return false;
  return CJK_RE.test(s);
}

/**
 * Picks the Tailwind font family class for `s`:
 *   - any CJK glyph present → `"font-cjk"` (Noto Sans SC chain)
 *   - otherwise            → `"font-body"` (DM Sans chain — same as default body font)
 *
 * Mixed strings always trigger the CJK branch — Noto Sans SC also carries
 * Latin glyphs cleanly, so the ASCII portion still renders correctly.
 */
export function cjkClassName(s: string | null | undefined): string {
  return isCjk(s) ? "font-cjk" : "font-body";
}
