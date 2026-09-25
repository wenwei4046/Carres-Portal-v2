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
import { classifyState, detectState, postcodeIn, postTownForPostcode, postTownOf } from "./region";

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
/* ══ THE ONE DELIVERY ADDRESS INTERPRETATION — owner correction 2026-09-14 ══
 *
 * ⭐ ONE ADDRESS, ONE READING. Delivery read the customer's address THREE
 * different ways on one screen, and on SO-1217 / TCF0541 all three printed at
 * once:
 *
 * ```
 * Delivery Location   conciseLocality(city, state)   →  Not recorded
 * State               detectState(customer_address)  →  Selangor
 * Delivery Status     customer_address_state empty   →  State not recorded
 * expanded brief      customer_address               →  a full Puchong address
 * ```
 *
 * The row said it had no location, named the state it was going to, warned
 * that the state was not recorded, and then showed the address — four answers
 * to one question. The operator cannot act on that, and the two that read
 * `Not recorded` were simply FALSE: the address is there, Operations can read
 * it, and it says Puchong, Selangor.
 *
 * **Measured on production 2026-09-14 (99 open scopes):** 43 carry the
 * structured `customer_address_state`; 46 carry only a written address and no
 * structured state; 10 carry no address at all (those never enter Monitor
 * under the entry rule). So the broken half was not an edge case — it was
 * every AutoCount and rental order on the workspace, 46 of the 89 addressed
 * ones, each of them warning about a state its own State column was printing.
 *
 * ── THE RULE, AND IT NEVER WRITES ANYTHING BACK ────────────────────────────
 *
 * Each half of the locality is resolved on its own, and the RECORDED column
 * always wins — a structured value is what somebody explicitly chose, and a
 * written address never overrides it even when the two disagree.
 *
 * ```
 * STATE   1  customer_address_state, exactly as recorded
 *         2  the state NAMED in the written address, or its exact 5-digit
 *            postcode in the national dataset
 *         ✗  a coarse 2-digit postcode range — a guess, so nothing resolves
 *            and `State not recorded` stays true
 *
 * CITY    1  customer_address_city, exactly as recorded
 *         2  the segment the written address puts immediately before its
 *            trailing state, WHEN that segment is an official post town of
 *            the resolved state (`…, 43300 PUCHONG,SELANGOR, Puchong,
 *            Selangor` → `Puchong`)
 *         3  the post town of the address's exact 5-digit postcode
 *         ✗  otherwise nothing — the label prints the state alone
 * ```
 *
 * Rung 2 sits above rung 3 deliberately. SO-1217 writes `Puchong` twice and
 * carries the postcode `43300`, which the dataset files under Seri Kembangan;
 * the town the customer wrote about their own home outranks a postcode
 * lookup, and the whole reading stays inside what the record already says.
 *
 * **NOTHING IS INFERRED INTO THE DATABASE.** This is a READER. No caller may
 * write its answer back onto the order — fixing an address is Sales work,
 * through `Open Sales Order to change`.
 */
export interface DeliveryLocality {
  /** The town, or null when the record does not name a resolvable one. */
  city: string | null;
  /** The state AS IT WILL PRINT — the recorded column verbatim when there is
   *  one, so an explicit value is never rewritten. */
  state: string | null;
  /** The same state canonicalised for BUCKETING (`KL` → `Kuala Lumpur`): the
   *  rail row, the `State` filter and any count read this one, so a filter and
   *  a label can never disagree about which state a row is in. */
  stateKey: string | null;
  /** `Puchong, Selangor`, collapsed when the town IS the state. Falls back to
   *  the written address when no locality resolves but an address exists, and
   *  is `Not recorded` only when there is genuinely nothing. */
  label: string;
  /** The written address exactly as recorded — never re-composed. */
  writtenAddress: string | null;
}

export interface LocalityFields {
  customer_address?: string | null;
  customer_address_line1?: string | null;
  customer_address_city?: string | null;
  customer_address_state?: string | null;
  customer_address_postcode?: string | null;
}

/** The segment a comma list puts immediately before its trailing state, when
 *  the state really is written in that last segment. */
function townBeforeTrailingState(address: string, state: string): string | null {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1]!.toLowerCase();
  /* The state must be what the address ENDS with; `…, Kuala Lumpur, Federal
     Territory` ends with something else, so it offers no town here. */
  if (!last.includes(state.toLowerCase())) return null;
  return postTownOf(state, parts[parts.length - 2]!);
}

export function resolveDeliveryLocality(o: LocalityFields): DeliveryLocality {
  const recordedCity = o.customer_address_city?.trim() || null;
  const recordedState = o.customer_address_state?.trim() || null;
  const written = o.customer_address?.trim() || null;

  /* THE STATE. A recorded value is used as written; otherwise the address is
     READ, and only when it actually names a state or carries a postcode the
     dataset knows. */
  const fromAddress = recordedState ? null : classifyState(written);
  const readState = fromAddress && fromAddress.basis !== "approximate" ? fromAddress.state : null;
  const state = recordedState ?? readState;
  const stateKey = state ? detectState(state) ?? readState : null;

  /* THE TOWN. Same order, same refusal to invent one. */
  const city =
    recordedCity ??
    (state && written ? townBeforeTrailingState(written, state) : null) ??
    postTownForPostcode(o.customer_address_postcode ?? postcodeIn(written), state);

  const locality = conciseLocality(city, state);
  /* An address nobody can read a locality out of is still an address. Printing
     `Not recorded` over it is the false absence this whole rule exists to end;
     the `State not recorded` warning is what flags the data problem. */
  const label =
    locality !== NOT_RECORDED
      ? locality
      : written ?? o.customer_address_line1?.trim() ?? NOT_RECORDED;

  return { city, state, stateKey, label, writtenAddress: written };
}
