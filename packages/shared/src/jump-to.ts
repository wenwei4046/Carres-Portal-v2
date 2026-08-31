/**
 * `Jump to…` — the ONE global navigate-only command surface
 * (`docs/ui/MASTER.md`, APPROVED / LOCKED 2026-08-11).
 *
 * This module holds the PURE half of the contract: what a typed query means,
 * and the shape of a document result. It is shared so the Worker's lookup and
 * the browser's surface can never disagree about which document types exist,
 * how a query is read, or how a number is spelt.
 *
 * The locked result contract, and nothing wider:
 *
 *   1. governed module / destination names   — resolved in the browser from
 *      the portal nav the sidebar already reads, so a destination the operator
 *      may not open cannot appear
 *   2. exact or partial governed document numbers — SO · PO · GRN · INV
 *
 * It never searches table cells, customer phone numbers or product text; the
 * Register's own Search stays page-owned and keeps that job. Widening this set
 * needs a governed cross-module search index and a new architecture decision.
 */

/** The four governed document types, in the order the MASTER names them. */
export const JUMP_DOC_TYPES = ["SO", "PO", "GRN", "INV"] as const;
export type JumpDocType = (typeof JUMP_DOC_TYPES)[number];

/**
 * The human word for each type. It is the DOCUMENT's noun — COPY-STANDARD rule
 * 9's document/act split, which is what makes `GRN` legal here and illegal as
 * a verb.
 */
export const JUMP_DOC_LABEL: Record<JumpDocType, string> = {
  SO: "Sales Order",
  PO: "Purchase Order",
  GRN: "Receiving Record",
  INV: "Invoice",
};

export interface JumpDocumentResult {
  type: JumpDocType;
  /** The governed number exactly as the document prints it — `SO-1307`. */
  number: string;
  /**
   * The smallest useful identifying party: the customer for a document the
   * customer holds, the supplier for one the supplier holds. Null when the
   * record carries no name — never a placeholder that looks like one.
   */
  party: string | null;
  /** The in-app destination that OPENS this document. Navigation only. */
  href: string;
}

export interface JumpSearchResponse {
  documents: JumpDocumentResult[];
}

export interface ParsedJumpQuery {
  /** The typed query, trimmed and upper-cased. Empty when nothing was typed. */
  raw: string;
  /**
   * The types this query can still match. A query that names a prefix narrows
   * to that one type; anything else stays open to all four.
   */
  types: JumpDocType[];
  /**
   * What is left after a recognised prefix is removed — the part that has to
   * match the number's own body. `SO-13` → `13`; `13` → `13`.
   */
  term: string;
  /** `term` reduced to digits. Empty when the operator typed no digits. */
  digits: string;
}

/**
 * Read a typed query.
 *
 * The separator between prefix and body is optional and may be `-`, a space or
 * nothing at all, because an operator reading a number off paper types it the
 * way the paper spells it and an operator typing from memory does not.
 */
export function parseJumpQuery(input: string): ParsedJumpQuery {
  const raw = input.trim().toUpperCase();
  if (raw === "") {
    return { raw, types: [...JUMP_DOC_TYPES], term: "", digits: "" };
  }

  /* Longest prefix first: `INV` must win over nothing, and a bare `I` must not
   * silently claim it. `GRN` and `INV` are three letters, `SO` and `PO` two —
   * sorting by length keeps the match unambiguous whatever order the constant
   * is written in. */
  const byLength = [...JUMP_DOC_TYPES].sort((a, b) => b.length - a.length);
  for (const type of byLength) {
    if (!raw.startsWith(type)) continue;
    const rest = raw.slice(type.length).replace(/^[\s-]+/, "");
    return { raw, types: [type], term: rest, digits: rest.replace(/\D/g, "") };
  }

  return {
    raw,
    types: [...JUMP_DOC_TYPES],
    term: raw,
    digits: raw.replace(/\D/g, ""),
  };
}

/**
 * The half-open ranges that mean "an integer whose decimal spelling STARTS
 * with `prefix`" — the only way to prefix-match `orders.so`, which is an
 * `integer` column and cannot be `ILIKE`d.
 *
 * `13` over four digits is `[1300, 1400)`; over five it is `[13000, 14000)`.
 * One range per possible length, so `13` finds SO-13, SO-130 and SO-1307 in a
 * single indexed query instead of a table scan.
 *
 * `maxDigits` is a bound on the SO numbers that can exist, not a guess about
 * the ones that do: production runs 1203–1320 today (measured 2026-08-15) and
 * every row of it is test data (Constitution §6), so the bound has to survive
 * a clean start rather than describe the current book.
 */
export function numericPrefixRanges(
  prefix: string,
  maxDigits = 7,
): Array<{ gte: number; lt: number }> {
  if (!/^\d+$/.test(prefix)) return [];
  if (prefix.length > maxDigits) return [];
  /* A leading zero cannot start an integer's decimal spelling, so there is
   * nothing to match — returning ranges here would match every number. */
  if (prefix.length > 1 && prefix.startsWith("0")) return [];

  const base = Number(prefix);
  const ranges: Array<{ gte: number; lt: number }> = [];
  for (let len = prefix.length; len <= maxDigits; len++) {
    const scale = 10 ** (len - prefix.length);
    ranges.push({ gte: base * scale, lt: (base + 1) * scale });
  }
  return ranges;
}

/**
 * Normalise exact or partial stored `GRN-YYYYMMDD-RRRR` identity for lookup.
 * The document's posting date never stands in for Goods Received At.
 */
export function grnSearchTerm(term: string): string | null {
  const value = term.trim().toUpperCase();
  if (!/^(?:GRN[- ]?)?[0-9-]*$/.test(value)) return null;
  const body = value.replace(/^GRN[- ]?/, "").replace(/^[- ]+/, "");
  if (!body) return "GRN-";
  return `GRN-${body}`;
}

/** @deprecated Stored GRN identity no longer derives a physical date. */
export function grnDateFromQuery(_term: string): null {
  return null;
}

/**
 * Rank a set of results so an exact number lands first.
 *
 * Sorting here rather than in the query keeps it identical for every type: the
 * four lookups are four different tables and only one of them can be ordered
 * by relevance in SQL at all.
 */
export function rankJumpDocuments(
  documents: JumpDocumentResult[],
  query: string,
): JumpDocumentResult[] {
  const q = query.trim().toUpperCase();
  const score = (d: JumpDocumentResult) => {
    const n = d.number.toUpperCase();
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.replace(/\D/g, "").startsWith(q.replace(/\D/g, "")) && q !== "") return 2;
    return 3;
  };
  return [...documents].sort((a, b) => {
    const d = score(a) - score(b);
    if (d !== 0) return d;
    const t = JUMP_DOC_TYPES.indexOf(a.type) - JUMP_DOC_TYPES.indexOf(b.type);
    if (t !== 0) return t;
    return b.number.localeCompare(a.number);
  });
}
