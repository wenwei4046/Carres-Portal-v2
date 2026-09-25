/**
 * THE ONE ANSWER TO "SAVE OR SUBMIT AMENDMENT REQUEST" — owner rulings
 * 2026-09-21 / 2026-09-22 (docs/orders/MASTER.md § VIEW FIRST, EDIT ON PURPOSE
 * and § Commercial change entry).
 *
 * The SYSTEM chooses the commit, never the employee, and never from "is there a
 * PO" alone:
 *
 *   Save                       a permitted correction that changes no
 *                              commercial commitment
 *   Submit amendment request   any change to items, configuration, quantity,
 *                              price, service, the delivery or proceed promise
 *                              or the instalment plan
 *
 * A mixed change goes to review WHOLE — nothing is partly saved behind the
 * employee's back. The server runs this same function on commit (Law D: one
 * rule, two readers), so the button label and what actually happens cannot
 * disagree.
 *
 * Deliberately NOT here: Sales Location · Salesperson · Dealer. They keep
 * their existing governed attribution lane (0329) until that lane is folded
 * into the amendment; this function refuses to classify them.
 */

/** Header facts a whole-page edit may carry. */
export const SALES_ORDER_EDIT_HEADER_KEYS = [
  "customer_name",
  "customer_phone",
  "customer_email",
  "customer_race",
  "customer_gender",
  "customer_birthday",
  "customer_address",
  "customer_address_line1",
  "customer_address_line2",
  "customer_address_city",
  "customer_address_state",
  "customer_address_postcode",
  "customer_address_unknown",
  "customer_emergency",
  "customer_billing",
  "customer_billing_same",
  "entry_fields",
  "delivery_floor",
  "delivery_has_lift",
  "delivery_stair_items",
  "proceed_date",
  "delivery_date",
  "delivery_date_tbd",
] as const;
export type SalesOrderEditHeaderKey = (typeof SALES_ORDER_EDIT_HEADER_KEYS)[number];

/** The promise and the plan — always the amendment lane. */
const ALWAYS_COMMERCIAL: ReadonlySet<string> = new Set(["delivery_date", "delivery_date_tbd"]);
/** Delivery access freezes after Proceed (0415 F-12): after Proceed it moves only by amendment. */
const COMMERCIAL_AFTER_PROCEED: ReadonlySet<string> = new Set([
  "delivery_floor",
  "delivery_has_lift",
  "delivery_stair_items",
]);

export interface ChangeLine {
  id?: string | null;
  sku: string;
  qty: number;
  unit_price: number;
  attrs?: Record<string, unknown> | null;
}
export interface ChangeAddon {
  id?: string | null;
  addon_key: string;
  qty: number;
  unit_price: number;
  attrs?: Record<string, unknown> | null;
}
export interface SalesOrderChangeSide {
  header: Partial<Record<SalesOrderEditHeaderKey, unknown>>;
  lines: ChangeLine[];
  addons: ChangeAddon[];
  installment_months: number | null;
}

export interface SalesOrderChangeClass {
  /** `save` or `submit` — the one commit this change may use. */
  action: "none" | "save" | "submit";
  /** Header keys whose value moved. */
  header: SalesOrderEditHeaderKey[];
  /** Header keys among them that are commercial for this order. */
  commercialHeader: SalesOrderEditHeaderKey[];
  linesChanged: boolean;
  addonsChanged: boolean;
  installmentChanged: boolean;
}

const norm = (v: unknown): unknown => {
  if (v === undefined || v === "") return null;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => [k, norm(x)] as const)
      .filter(([, x]) => x !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    return entries.length ? Object.fromEntries(entries) : null;
  }
  return v;
};
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

const lineKey = (l: ChangeLine) =>
  JSON.stringify([l.id ?? null, l.sku.trim(), Number(l.qty), Number(l.unit_price), norm(l.attrs ?? null)]);
const addonKey = (a: ChangeAddon) =>
  JSON.stringify([a.id ?? null, a.addon_key, Number(a.qty), Number(a.unit_price), norm(a.attrs ?? null)]);

/**
 * Classify a whole-page draft against the current order.
 *
 * `proceedRecorded` — the order already carries a proceed date (a blank may be
 * filled once as a correction, 0391; a recorded date moves only by amendment,
 * owner 2026-09-22). `proceeded` — the order is at Proceed (delivery access
 * freezes, 0415 F-12).
 */
export function classifySalesOrderChange(
  current: SalesOrderChangeSide,
  draft: SalesOrderChangeSide,
  opts: { proceeded: boolean; proceedRecorded: boolean },
): SalesOrderChangeClass {
  const header = SALES_ORDER_EDIT_HEADER_KEYS.filter(
    (k) => k in draft.header && !same(draft.header[k], current.header[k]),
  );
  const commercialHeader = header.filter(
    (k) =>
      ALWAYS_COMMERCIAL.has(k) ||
      (opts.proceeded && COMMERCIAL_AFTER_PROCEED.has(k)) ||
      (k === "proceed_date" && opts.proceedRecorded),
  );
  const linesChanged =
    JSON.stringify(current.lines.map(lineKey)) !== JSON.stringify(draft.lines.map(lineKey));
  const addonsChanged =
    JSON.stringify(current.addons.map(addonKey)) !== JSON.stringify(draft.addons.map(addonKey));
  const installmentChanged = (current.installment_months ?? null) !== (draft.installment_months ?? null);
  const commercial = commercialHeader.length > 0 || linesChanged || addonsChanged || installmentChanged;
  const any = header.length > 0 || commercial;
  return {
    action: !any ? "none" : commercial ? "submit" : "save",
    header,
    commercialHeader,
    linesChanged,
    addonsChanged,
    installmentChanged,
  };
}

/** The words the one commit button wears. Registered in COPY-STANDARD. */
export function salesOrderCommitWord(action: SalesOrderChangeClass["action"]): string {
  return action === "submit" ? "Submit amendment request" : "Save";
}
