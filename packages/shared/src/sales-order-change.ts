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

/* ═══ CONCURRENT EDITING — owner-approved 2026-10-01 (orders/MASTER §0.0
 * "Approved handoff scopes": "Two editors cannot silently overwrite one
 * another; conflict keeps the draft and exposes what changed; same amendment
 * entry, no new draft engine").
 *
 * The whole-page edit sends back EVERY field it shows, so a commit computed
 * from an older read would quietly put a colleague's newer value back. The
 * page therefore keeps the order exactly as it opened it — this baseline — and
 * the commit carries it. The database compares it with the order under the
 * order's own lock before anything is written (`sales_order_commit_staff_change`)
 * and refuses with `order_edit_stale` when they differ.
 *
 * ONE builder (Law D): the API's GET answer, the API's pre-check and the test
 * of the database's own copy (`_sales_order_edit_baseline`) all call this.
 * Its shape is the database's shape key for key: header values or null,
 * `entry_fields` an object, lines and services ordered by id with exactly
 * id · sku/addon_key · qty · unit_price · attrs. ═══ */

export interface SalesOrderEditBaselineLine {
  id: string;
  sku: string;
  qty: number;
  unit_price: number;
  attrs: Record<string, unknown> | null;
}
export interface SalesOrderEditBaselineAddon {
  id: string;
  addon_key: string;
  qty: number;
  unit_price: number;
  attrs: Record<string, unknown> | null;
}
export interface SalesOrderEditBaseline {
  status: string;
  header: Record<SalesOrderEditHeaderKey, unknown>;
  lines: SalesOrderEditBaselineLine[];
  addons: SalesOrderEditBaselineAddon[];
  installment_months: number | null;
}

const plainObject = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
/** Byte order, never locale order — the database orders by `id::text collate "C"`. */
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function salesOrderEditBaseline(
  order: Record<string, unknown> & { status?: unknown; entry_data?: unknown; installment_months?: unknown },
  lines: ReadonlyArray<{ id?: unknown; sku?: unknown; qty?: unknown; unit_price?: unknown; attrs?: unknown }>,
  addons: ReadonlyArray<{ id?: unknown; addon_key?: unknown; qty?: unknown; unit_price?: unknown; attrs?: unknown }>,
): SalesOrderEditBaseline {
  const header = {} as Record<SalesOrderEditHeaderKey, unknown>;
  for (const k of SALES_ORDER_EDIT_HEADER_KEYS) {
    header[k] = k === "entry_fields"
      ? (plainObject(plainObject(order.entry_data)?.fields) ?? {})
      : (order[k] ?? null);
  }
  return {
    status: String(order.status ?? ""),
    header,
    lines: lines
      .map((l) => ({ id: String(l.id), sku: String(l.sku), qty: Number(l.qty), unit_price: Number(l.unit_price), attrs: plainObject(l.attrs) }))
      .sort(byId),
    addons: addons
      .map((a) => ({ id: String(a.id), addon_key: String(a.addon_key), qty: Number(a.qty), unit_price: Number(a.unit_price), attrs: plainObject(a.attrs) }))
      .sort(byId),
    installment_months: order.installment_months == null ? null : Number(order.installment_months),
  };
}

/** Key-order independent, like the database's `jsonb` equality. */
const canonical = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
};
export function sameSalesOrderEditBaseline(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** What moved on the order between the baseline the editor opened and now:
 *  header keys, then `lines` · `addons` · `installment_months` · `status`. */
export function salesOrderChangedSinceOpened(
  opened: SalesOrderEditBaseline,
  current: SalesOrderEditBaseline,
): string[] {
  const out: string[] = SALES_ORDER_EDIT_HEADER_KEYS.filter(
    (k) => !sameSalesOrderEditBaseline(opened.header?.[k] ?? null, current.header[k] ?? null),
  );
  if (!sameSalesOrderEditBaseline(opened.lines ?? [], current.lines)) out.push("lines");
  if (!sameSalesOrderEditBaseline(opened.addons ?? [], current.addons)) out.push("addons");
  if ((opened.installment_months ?? null) !== current.installment_months) out.push("installment_months");
  if (opened.status !== current.status) out.push("status");
  return out;
}
