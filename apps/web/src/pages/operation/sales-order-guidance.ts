/**
 * THE ONE MISSING-CUSTOMER-DELIVERY-DATE GUIDANCE, for every surface that
 * shows it (Sales Orders register cell · Sales Order workspace panel).
 *
 * ⭐ `action` IS A CELL-SIZED STRING, AND THAT IS A HARD CONSTRAINT.
 *
 * The register prints it inside the `Customer Delivery` column, which is
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
  /** The FACT — what is true right now. Matches `NO_DATE_YET`. */
  problem: string;
  /** The ACTION, in one clause the 148px cell prints WHOLE. */
  action: string;
  /** The same facts in full, for the cell's `title` hover. Newline-separated:
   *  browsers render a multi-line tooltip and the operator gets who, whose
   *  phone, what to ask and what to write down without leaving the row. */
  detail: string;
  why: string;
  owner: string;
  contact: string;
  ask: string;
  use: string;
  record: string;
  next: string;
}

/** The cell clause. A CONSTANT on purpose: a name interpolated here makes the
 *  string as long as the longest customer name, which is how it started
 *  truncating. The party is named in `detail` and in the workspace panel. */
const CONFIRM_DELIVERY_DATE = "Confirm delivery date";

export function missingDeliveryDateGuidance(input: {
  so: number;
  customer: string;
  salesperson?: string | null;
  phone?: string | null;
}): SalesOrderGuidance {
  const owner = input.salesperson?.trim() || "Sales";
  const phone = input.phone?.trim() || "Phone not recorded";
  const contact = `${input.customer} · ${phone}`;
  const ask = "Ask which delivery date the customer agrees to.";
  const record = "Record the agreed Customer Delivery date.";
  return {
    problem: "No delivery date",
    action: CONFIRM_DELIVERY_DATE,
    detail: `${owner} · ${contact}\n${ask}\n${record}`,
    why: "The customer delivery commitment is not recorded.",
    owner,
    contact,
    ask,
    use: "Use the customer delivery confirmation message.",
    record,
    next: "Delivery can plan from the recorded customer date.",
  };
}
