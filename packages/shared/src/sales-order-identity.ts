/**
 * SALES ORDER IDENTITY — what a `/operation/orders/so/:orderId` param names.
 *
 * 【DELIVERY】 CARD 19 (2026-09-13). The object page used to hand its raw URL
 * param to ten read doors that only know an id, so a link carrying the
 * operator's own document word (`SO-1362`) reached the database as
 * `invalid input syntax for type uuid` and the page printed an empty Order
 * Route. ONE resolver (Architecture Law D) classifies the param; the web
 * resolves a number to the id through the one by-number door and then reads
 * everything by the id, so no second fan-in exists.
 *
 * PURE: no I/O.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `SO-1362` · `so-1362` · `SO1362` · `1362` — the document word with or
 *  without its prefix; whitespace around it is tolerated, nothing else is. */
const NUMBER_RE = /^(?:so-?)?(\d{1,9})$/i;

export type SalesOrderParam =
  | { kind: "id"; id: string }
  | { kind: "number"; so: number }
  | { kind: "reference"; reference: string }
  | { kind: "invalid"; raw: string };

export function salesOrderParamOf(param: string | null | undefined): SalesOrderParam {
  const raw = (param ?? "").trim();
  if (UUID_RE.test(raw)) return { kind: "id", id: raw.toLowerCase() };
  const reference = customerOrderReferenceOf(raw);
  if (reference) return { kind: "reference", reference };
  const m = NUMBER_RE.exec(raw);
  if (m) {
    const so = Number(m[1]);
    if (Number.isInteger(so) && so > 0) return { kind: "number", so };
  }
  return { kind: "invalid", raw };
}

/** The document word the portal prints for a number (`SO No`). */
export function salesOrderNumberWord(so: number): string {
  return `SO-${so}`;
}

/** Stored customer-facing identity. Never derive a public number from UUID, SO integer or revision. */
const PUBLIC_REFERENCE = /^(SO(?:\d{2})(?:0[1-9]|1[0-2])-\d{4}|SUB(?:\d{2})(?:0[1-9]|1[0-2])-\d{5})(?:\(([1-9]\d*)\))?$/i;

/** Accept the approved external series and optional printed revision; resolve by the base identity. */
export function customerOrderReferenceOf(value: string | null | undefined): string | null {
  return PUBLIC_REFERENCE.exec((value ?? "").trim())?.[1]?.toUpperCase() ?? null;
}

/** Preserve stored historical identity verbatim. New public references must already exist in storage. */
export function customerOrderReferenceWord(input: {
  publicReference?: string | null;
  legacyReference?: string | null;
  so: number;
}): string {
  return input.publicReference || input.legacyReference || `SO-${input.so}`;
}
