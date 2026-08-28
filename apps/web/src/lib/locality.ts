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
 * `Not given` is the governed absence word for a locality nobody recorded
 * (`docs/COPY-STANDARD.md`) — a blank may never carry two meanings.
 */
export const NOT_GIVEN = "Not given";

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
  return [cleanCity, cleanState].filter(Boolean).join(", ") || NOT_GIVEN;
}
