/**
 * THE ONE CONCISE-LOCALITY RULE — extracted from `sales-order-columns.ts` with
 * CARD 02-B (2026-08-27), not rewritten.
 *
 * Sales Orders, Delivery and now the SO Batch Purchase Register all print a
 * customer's delivery locality as `City, State` — `Petaling Jaya, Selangor` —
 * collapsing to one word when the city IS the state (`Kuala Lumpur`). Three
 * pages, one algorithm (Law D): a Purchasing surface importing a Sales page
 * file to reach it would tie the modules together, and a second spelling of
 * the rule is how two registers start printing two localities for one order.
 * So the rule lives here, neutrally, and the pages import it.
 *
 * ⭐ ONE ABSENCE WORD (YH, 2026-08-29). The register printed TWO — `Not given`
 * for what a customer never told us, `Not recorded` for what Carres never
 * wrote down. The distinction is real and it is invisible: an operator reading
 * one table sees two spellings of "empty" and has to work out whether they
 * mean different things. They do not, for anything the reader can act on.
 *
 * `Not recorded` is the survivor because it is honest about EVERY column.
 * Nobody "gives" us an invoice number or a showroom — we record them, or we
 * do not. `Not given` only ever fitted the customer-supplied half.
 *
 * ⛔ The old comment here claimed `Not given` was "the governed absence word
 * (docs/COPY-STANDARD.md)". It was not: NEITHER word appeared in that file, so
 * the citation was to a rule nobody had written. It is registered now.
 */
export const NOT_RECORDED = "Not recorded";

export function conciseLocality(city?: string | null, state?: string | null): string {
  const cleanCity = city?.trim() || "";
  const cleanState = state?.trim() || "";
  if (
    cleanCity &&
    cleanState &&
    cleanCity.localeCompare(cleanState, undefined, { sensitivity: "accent" }) === 0
  ) {
    return cleanCity;
  }
  return [cleanCity, cleanState].filter(Boolean).join(", ") || NOT_RECORDED;
}
