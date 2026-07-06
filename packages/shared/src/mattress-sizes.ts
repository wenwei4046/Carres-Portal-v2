/**
 * The canonical Malaysian mattress / bedframe size table — one place that
 * agrees on the SHORT code (used in the SKU code suffix, e.g. `MAT-001-K`) and
 * the FULL name (shown as the SIZE, e.g. `King`).
 *
 * Why this exists: the `mattress_size` / `bedframe_size` option pools store the
 * code (`value`) + a feet/cm dimension label, but NOT the human name. Without a
 * mapping, auto-generating SKUs from the size chips stamped the raw code (`K`)
 * as the variant, so the SKU list showed `K / Q / S / SS` instead of
 * `King / Queen / Single / Super Single`. Every size-generation path resolves
 * through here so the code stays short and the SIZE reads as the full name.
 */

export interface CanonicalSize {
  /** Short code for the SKU code suffix (`MAT-001-K`). */
  code: string;
  /** Full name shown as the SIZE column / POS size label (`King`). */
  name: string;
}

/** Standard MY sizes, in display order (single → super king). */
export const CANONICAL_SIZES: readonly CanonicalSize[] = [
  { code: "S", name: "Single" },
  { code: "SS", name: "Super Single" },
  { code: "Q", name: "Queen" },
  { code: "K", name: "King" },
  { code: "SK", name: "Super King" },
] as const;

// Normalize any spelling to a lookup key: lowercase, strip every non-alphanumeric
// char. So "Super Single", "super-single", "SS", "ss" all collapse to a common key.
function sizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Both the code and the name (plus their normalized forms) resolve to the entry.
const BY_KEY = new Map<string, CanonicalSize>();
for (const size of CANONICAL_SIZES) {
  BY_KEY.set(sizeKey(size.code), size);
  BY_KEY.set(sizeKey(size.name), size);
}

/**
 * Resolve a raw size token (a pool code, a full name, or a common spelling) to
 * its canonical `{ code, name }`. Case- and separator-insensitive.
 *
 * Unknown tokens (a non-standard size the principal typed) pass through
 * unchanged — trimmed, but never dropped or silently renamed — so custom sizes
 * still work; they simply don't get an expanded name. Idempotent: feeding a
 * name back in returns the same entry.
 */
export function canonicalSize(input: string): CanonicalSize {
  const trimmed = input.trim();
  return BY_KEY.get(sizeKey(trimmed)) ?? { code: trimmed, name: trimmed };
}

/** Convenience: just the full name for a raw size token. */
export function sizeName(input: string): string {
  return canonicalSize(input).name;
}
