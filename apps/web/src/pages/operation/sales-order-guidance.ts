/**
 * THE ONE MISSING-CUSTOMER-DELIVERY-DATE GUIDANCE, for every surface that
 * shows it (Sales Orders register cell · Sales Order workspace panel).
 *
 * ⭐ `action` IS A CELL-SIZED STRING, AND THAT IS A HARD CONSTRAINT.
 *
 * The register prints it inside the `Requested Delivery Date` column, which is
 * 148px wide by governed default (`sales-order-columns.ts`) — 132px of ink
 * after the engine's 8px padding. Measured in the browser at the governed
 * `text-meta` size (12px Inter): `Confirm delivery date` is 122.4px and
 * renders whole. The sentence this used to hold — owner, customer and the
 * record step joined with ` · ` — measured 55–70 characters and was cut
 * mid-word four different ways on four different rows. **An operator with
 * low English reads nothing from `Confirm t…`.**
 *
 * So the split is: ONE complete governed clause in the cell, and every
 * remaining fact in `detail` (the cell's hover) and in the workspace panel's
 * own list, which already prints all seven of them. Widening the column is
 * not the fix — the seven default widths are governed, and an optional column
 * may not squeeze them.
 *
 * `Confirm delivery date` is the dictionary's own string
 * (`COPY-STANDARD.md`, ORDERS + DELIVERY), and the rule it satisfies is
 * "never show generic `Contact Customer` or `Follow Up`; name the purpose".
 */
export interface SalesOrderGuidance {
  /** The FACT — what is true right now. Matches `NO_DATE_YET`. Since the
   *  owner ruling of 2026-08-18 this is the ONLY thing a register cell
   *  prints: registers list documents, and the action lives in My Work /
   *  Team Work / the Order Route. The workspace's seven-answer banner was
   *  DELETED by the same ruling (it lectured instead of working), so the
   *  seven per-field strings left with it. */
  problem: string;
  /** Who · whose phone · what to ask · what to record — the cell's `title`
   *  hover. Newline-separated: browsers render a multi-line tooltip. */
  detail: string;
}


/**
 * The customer WAS asked and answered *not yet*. That is a different fact from
 * nobody having asked, and printing the same `Confirm delivery date` on both
 * sends the operator to chase a customer who already replied — measured on
 * production 2026-08-15 as 8 of the 11 dateless orders.
 * (`docs/orders/MASTER.md` — THE THREE DELIVERY DATES.)
 *
 * The governed string is `Delivery date to be confirmed` (`COPY-STANDARD.md`
 * :1161), which is also the label on the checkbox that sets this flag. In the
 * `Requested Delivery Date` column the first two words are the column header, and the
 * locked two-line grammar forbids repeating context the row already supplies —
 * so the cell prints the tail and the hover carries the whole sentence.
 */
export const DATE_TO_BE_CONFIRMED_CELL = "To be confirmed";
export const DATE_TO_BE_CONFIRMED_FULL = "Delivery date to be confirmed";

/** The customer answered `not yet`. NOT work to do — no action clause, and no
 *  warning colour: nothing here is wrong or late. */
export function deliveryDateToBeConfirmedGuidance(input: {
  customer: string;
  salesperson?: string | null;
  phone?: string | null;
}): { fact: string; detail: string } {
  const owner = input.salesperson?.trim() || "Sales";
  const phone = input.phone?.trim() || "Phone not recorded";
  return {
    fact: DATE_TO_BE_CONFIRMED_CELL,
    detail:
      `${DATE_TO_BE_CONFIRMED_FULL}\n` +
      `${input.customer} · ${phone} · ${owner}\n` +
      "The customer has been asked and has not fixed a date yet.",
  };
}

export function missingDeliveryDateGuidance(input: {
  so: number;
  customer: string;
  salesperson?: string | null;
  phone?: string | null;
}): SalesOrderGuidance {
  const owner = input.salesperson?.trim() || "Sales";
  const phone = input.phone?.trim() || "Phone not recorded";
  const ask = "Ask which delivery date the customer agrees to.";
  const record = "Record the agreed Requested Delivery Date.";
  return {
    problem: "No delivery date",
    detail: `${owner} · ${input.customer} · ${phone}\n${ask}\n${record}`,
  };
}
