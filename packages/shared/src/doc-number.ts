/**
 * Document numbering — the ONE scheme for every printable Carres document
 * (loan note, receipt, delivery order, invoice …). Locked with Jess 2026-07-19.
 *
 *   FORMAT   PREFIX-DDMMYY-NNNN[-LETTER]
 *     PREFIX   doc type — LN loan note · RC receipt · DO delivery order · INV …
 *     DDMMYY   the document date (day it is issued / handed over)
 *     NNNN     a 4-digit tail derived from a STABLE seed (the ORDER id) — see below
 *     LETTER   optional amendment marker: a corrected re-issue adds -B, then -C …
 *              (the first issue carries no letter)
 *
 * WHY the tail is derived, never a running counter:
 *   A sequential number (LN-0001, LN-0002 …) prints the business volume onto
 *   every paper a customer or competitor holds. A hash of the order's RANDOM id
 *   is uniform and order-independent, so:
 *     · volume stays private — you cannot count cases from the number,
 *     · the SAME seed always yields the SAME number — a reprint matches the
 *       signed original (critical: the paper the customer signed must be
 *       reproducible),
 *     · seeding from the ORDER id means every document of one order shares the
 *       tail (all of SO-1197's papers end -4821), so a customer's papers are
 *       recognisable as a group without leaking anything.
 *   The tail is NOT a unique key — the SO number on the document is. A rare
 *   same-day collision between two different orders is cosmetic (the SO still
 *   tells them apart); 4 digits keeps it near-zero at realistic volume.
 */

/** DDMMYY from an ISO date. Accepts `YYYY-MM-DD` or a longer ISO string; parses
 *  the parts textually (no Date object) so it is timezone-proof. */
function ddmmyy(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return "000000";
  const [, yyyy, mm, dd] = m;
  return `${dd}${mm}${yyyy.slice(2)}`;
}

/** Deterministic N-digit tail from a stable seed (FNV-1a 32-bit → mod 10^digits,
 *  zero-padded). Same seed + digits → same tail, forever. */
export function docTail(seed: string, digits = 4): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const mod = 10 ** digits;
  const n = (h >>> 0) % mod;
  return String(n).padStart(digits, "0");
}

/** Amendment suffix for a revision index: 0 = original (""), 1 = "-B", 2 = "-C",
 *  … capped at "-Z". Doubles as the marker for a rare same-day repeat document. */
export function amendmentSuffix(revision: number): string {
  if (revision <= 0) return "";
  const letter = String.fromCharCode(65 + Math.min(revision, 25)); // 1 → 'B'
  return `-${letter}`;
}

export type DocNumberInput = {
  /** Doc-type prefix, e.g. "LN", "RC", "DO", "INV". */
  prefix: string;
  /** Issue date, ISO (`YYYY-MM-DD` or longer). Becomes the DDMMYY segment. */
  date: string;
  /** Stable grouping seed — the ORDER id (a random uuid). */
  seed: string;
  /** Tail length. Default 4 (Jess 2026-07-19). */
  digits?: number;
  /** 0 = original; 1 → -B, 2 → -C … a corrected re-issue. */
  revision?: number;
};

/** Build a document number per the locked scheme. Pure + deterministic. */
export function docNumber({
  prefix,
  date,
  seed,
  digits = 4,
  revision = 0,
}: DocNumberInput): string {
  return `${prefix}-${ddmmyy(date)}-${docTail(seed, digits)}${amendmentSuffix(revision)}`;
}
