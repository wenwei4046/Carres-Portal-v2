/**
 * THE REGISTER'S FIELD CATALOG — SO-3 (Loo, 2026-08-09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ ONE DECLARATION PER FACT, AND THE COLUMN CHOOSER IS THAT LIST
 *
 * The card asks for *"ALL real order-owned flat fields (~28), hidden by
 * default"*. A chooser built by hand alongside the columns is two lists that
 * drift; this is ONE list, and the register's defaults are the six entries
 * marked `on: true`.
 *
 * **Every field here is a column on `orders`.** Not a join, not a computation,
 * not another module's record. That boundary is `MIGRATION-MAP.md` §2's — the
 * cross-module facts (Stock · Delivery · Actions · the three dots) were moved
 * OFF this page, and a chooser is exactly the back door they would walk in
 * through. The two exceptions are the two NAME embeds off a single FK
 * (`salespersons.name`, `outlets.name`), which SO-1 already put on the wire
 * because a column of UUIDs is not a fact anyone can read.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `text` IS THE COLUMN. It is what the cell prints, what the column's filter
 * box matches, what a sort compares and what Export writes — one string, four
 * jobs, so a column can never filter on something other than what it shows.
 * Two columns need MARKUP as well (`customer` stacks the phone, the money
 * columns render `Money`); the page owns that, this file owns the string.
 *
 * **No React here on purpose.** The whole catalog is testable without a DOM,
 * which is how the law that every column is filterable and sortable becomes a
 * test rather than a promise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ABSENCE WORDS ARE THE DICTIONARY'S, NEVER A DASH (`COPY-STANDARD.md`).
 *
 *   Not given      the CUSTOMER did not give it     phone · address · email
 *   Not recorded   WE never captured it             salesperson · outlet · a
 *                                                   document that was never cut
 *   No price yet / Paid in full                     the money states
 *   No date yet    a promise with no date on it
 */
import { fmtDate } from "@/lib/fmt-date";
import type { operationOrderListRow } from "@/lib/queries";
import {
  digits,
  itemsSummary,
  moneyOfOrder,
  outstandingState,
  searchHaystack,
  valueState,
  type MoneyState,
} from "./sales-order-facts";

/** The dictionary's two absence words, so no caller spells them. */
export const NOT_GIVEN = "Not given";
export const NOT_RECORDED = "Not recorded";
export const NO_DATE_YET = "No date yet";

/** One register row: the order, plus every fact already resolved to a string. */
export interface RegisterRow {
  o: operationOrderListRow;
  id: string;
  so: number;
  customer: string;
  phone: string;
  items: string;
  promised: string | null;
  ordered: string;
  value: MoneyState;
  paid: MoneyState;
  outstanding: MoneyState;
  needle: string;
  phoneDigits: string;
}

export function buildRegisterRow(o: operationOrderListRow): RegisterRow {
  const money = moneyOfOrder(o);
  const phone = o.customer_phone ?? "";
  return {
    o,
    id: o.id,
    so: o.so,
    customer: o.customer_name,
    phone,
    items: itemsSummary(o),
    promised: o.delivery_date_tbd ? null : (o.delivery_date ?? null),
    ordered: o.placed_at,
    value: valueState(money),
    /* `paid` is never "unpriced": a payment either happened or it did not. */
    paid: money.paid > 0 ? { kind: "amount", value: money.paid } : { kind: "settled" },
    outstanding: outstandingState(money),
    needle: searchHaystack(o),
    phoneDigits: digits(phone),
  };
}

/** What a money cell says when it is not an amount — the dictionary's words. */
export function moneyText(state: MoneyState): string {
  if (state.kind === "amount") return String(state.value);
  return state.kind === "settled" ? "Paid in full" : "No price yet";
}

/** The five groups the chooser stacks its checkboxes under. */
export type FieldGroup = "Order" | "Customer" | "Delivery" | "Money" | "Documents";

export interface RegisterField {
  key: string;
  /** The header word. COPY-STANDARD owns it; this file only carries it. */
  label: string;
  /** Measured ink + 16 for the kit's `px-2`; +2 more where the column may clip. */
  width: string;
  align?: "right";
  numeric?: boolean;
  group: FieldGroup;
  /** On the register by default. Exactly six are, and they are the card's six. */
  on?: true;
  /** The ONE string: printed, filtered, sorted and exported. */
  text: (r: RegisterRow) => string;
  /** A sort key when the printed string sorts wrongly (a number, a date). */
  sortBy?: (r: RegisterRow) => number | string;
}

const date = (v: string | null | undefined, absent: string) =>
  v ? fmtDate(v) : absent;

/**
 * THE CATALOG — six defaults, twenty-eight hidden.
 *
 * Widths carry SO-1's measurements unchanged for the six it measured; the
 * hidden columns are sized to their own longest live value plus the kit's
 * `px-2`, and every one of them is off by default, so none of them can widen
 * the sheet an operator did not ask to widen.
 */
export const REGISTER_FIELDS: readonly RegisterField[] = [
  /* ── The six the card names ─────────────────────────────────────────────── */
  { key: "so", label: "SO No", width: "85px", group: "Order", on: true,
    text: (r) => `SO-${r.so}`, sortBy: (r) => r.so },
  /* 188 → 200: SO-3 stacks the phone under the name, and `012-345 6789` at
     `text-meta` is 86.4px of ink — comfortably inside the name's own width, so
     the column grows only by the 12px the two-line block wants for breathing. */
  { key: "customer", label: "Customer", width: "200px", group: "Customer", on: true,
    text: (r) => (r.phone ? `${r.customer} · ${r.phone}` : r.customer),
    sortBy: (r) => r.customer },
  { key: "items", label: "Items", width: "361px", group: "Order", on: true,
    text: (r) => r.items },
  { key: "value", label: "Value", width: "109px", align: "right", numeric: true,
    group: "Money", on: true, text: (r) => moneyText(r.value),
    sortBy: (r) => (r.value.kind === "amount" ? r.value.value : -1) },
  { key: "promised", label: "Promised", width: "113px", group: "Delivery", on: true,
    text: (r) => date(r.promised, NO_DATE_YET), sortBy: (r) => r.promised ?? "" },
  { key: "ordered", label: "Ordered", width: "113px", group: "Order", on: true,
    text: (r) => fmtDate(r.ordered), sortBy: (r) => r.ordered },

  /* ── The customer's own facts ───────────────────────────────────────────── */
  { key: "phone", label: "Phone", width: "103px", group: "Customer",
    text: (r) => r.phone || NOT_GIVEN },
  { key: "email", label: "Email", width: "200px", group: "Customer",
    text: (r) => r.o.customer_email || NOT_GIVEN },
  { key: "address", label: "Address", width: "280px", group: "Customer",
    text: (r) => r.o.customer_address || NOT_GIVEN },
  { key: "address_line1", label: "Address line 1", width: "200px", group: "Customer",
    text: (r) => r.o.customer_address_line1 || NOT_GIVEN },
  { key: "address_line2", label: "Address line 2", width: "200px", group: "Customer",
    text: (r) => r.o.customer_address_line2 || NOT_GIVEN },
  { key: "city", label: "City", width: "140px", group: "Customer",
    text: (r) => r.o.customer_address_city || NOT_GIVEN },
  { key: "state", label: "State", width: "140px", group: "Customer",
    text: (r) => r.o.customer_address_state || NOT_GIVEN },
  { key: "postcode", label: "Postcode", width: "96px", group: "Customer",
    text: (r) => r.o.customer_address_postcode || NOT_GIVEN },
  { key: "emergency", label: "Emergency contact", width: "200px", group: "Customer",
    text: (r) => r.o.customer_emergency || NOT_GIVEN },
  { key: "billing", label: "Billing address", width: "220px", group: "Customer",
    text: (r) => r.o.customer_billing || NOT_GIVEN },

  /* ── Who sold it ────────────────────────────────────────────────────────── */
  { key: "salesperson", label: "Salesperson", width: "167px", group: "Order",
    text: (r) => r.o.salespersons?.name || NOT_RECORDED },
  { key: "outlet", label: "Outlet", width: "126px", group: "Order",
    text: (r) => r.o.outlets?.name || NOT_RECORDED },
  { key: "dealer", label: "Dealer", width: "167px", group: "Order",
    text: (r) => r.o.dealers?.name || NOT_RECORDED },
  { key: "channel", label: "Channel", width: "112px", group: "Order",
    text: (r) => r.o.channel || NOT_RECORDED },
  { key: "source", label: "Source", width: "112px", group: "Order",
    text: (r) => r.o.source_system || NOT_RECORDED },
  { key: "source_ref", label: "Customer reference", width: "160px", group: "Order",
    text: (r) => (r.o.source_ref ?? []).filter(Boolean).join(" · ") || NOT_RECORDED },

  /* ── What the delivery has to cope with ─────────────────────────────────── */
  { key: "floor", label: "Floor", width: "80px", align: "right", numeric: true,
    group: "Delivery",
    text: (r) => (r.o.delivery_floor == null ? NOT_RECORDED : String(r.o.delivery_floor)),
    sortBy: (r) => r.o.delivery_floor ?? -1 },
  { key: "lift", label: "Lift", width: "80px", group: "Delivery",
    text: (r) => (r.o.delivery_has_lift == null ? NOT_RECORDED : r.o.delivery_has_lift ? "Yes" : "No") },
  { key: "proceed_date", label: "Proceed date", width: "113px", group: "Delivery",
    text: (r) => date(r.o.proceed_date, NOT_RECORDED), sortBy: (r) => r.o.proceed_date ?? "" },
  { key: "dispatched", label: "Dispatched", width: "113px", group: "Delivery",
    text: (r) => date(r.o.dispatched_at, NOT_RECORDED), sortBy: (r) => r.o.dispatched_at ?? "" },
  { key: "delivered", label: "Delivered", width: "113px", group: "Delivery",
    text: (r) => date(r.o.delivered_at, NOT_RECORDED), sortBy: (r) => r.o.delivered_at ?? "" },

  /* ── The documents the order produced ───────────────────────────────────── */
  { key: "do_number", label: "DO No", width: "120px", group: "Documents",
    text: (r) => r.o.do_number || NOT_RECORDED },
  { key: "invoice_no", label: "Invoice No", width: "130px", group: "Documents",
    text: (r) => r.o.invoice_no || NOT_RECORDED },
  { key: "invoiced", label: "Invoiced", width: "113px", group: "Documents",
    text: (r) => date(r.o.invoiced_at, NOT_RECORDED), sortBy: (r) => r.o.invoiced_at ?? "" },

  /* ── The money the order carries ────────────────────────────────────────── */
  { key: "paid", label: "Paid", width: "109px", align: "right", numeric: true,
    group: "Money", text: (r) => moneyText(r.paid),
    sortBy: (r) => (r.paid.kind === "amount" ? r.paid.value : 0) },
  { key: "outstanding", label: "Outstanding", width: "109px", align: "right",
    numeric: true, group: "Money", text: (r) => moneyText(r.outstanding),
    sortBy: (r) => (r.outstanding.kind === "amount" ? r.outstanding.value : -1) },
  { key: "payment_method", label: "Payment method", width: "150px", group: "Money",
    text: (r) => r.o.payment_method || NOT_RECORDED },
  { key: "installments", label: "Instalment months", width: "140px", align: "right",
    numeric: true, group: "Money",
    text: (r) => (r.o.installment_months == null ? NOT_RECORDED : String(r.o.installment_months)),
    sortBy: (r) => r.o.installment_months ?? -1 },
] as const;

/** The card's six, and the ONE place the register's default shape is stated. */
export const DEFAULT_COLUMNS: readonly string[] = REGISTER_FIELDS.filter((f) => f.on).map(
  (f) => f.key,
);

/** The two the card pins: an operator scrolling right never loses WHOSE row. */
export const FROZEN_COLUMNS = 2;

export const FIELD_GROUPS: readonly FieldGroup[] = [
  "Order",
  "Customer",
  "Delivery",
  "Money",
  "Documents",
];

export function fieldByKey(key: string): RegisterField | undefined {
  return REGISTER_FIELDS.find((f) => f.key === key);
}

/**
 * A column's own filter box, applied. Case-insensitive substring against the
 * SAME string the cell prints — so a filter can never disagree with the screen,
 * which is the failure a separate filter accessor invites.
 */
export function passesColumnFilters(
  row: RegisterRow,
  filters: ReadonlyMap<string, string>,
): boolean {
  for (const [key, raw] of filters) {
    const needle = raw.trim().toLowerCase();
    if (!needle) continue;
    const field = fieldByKey(key);
    if (!field) continue;
    if (!field.text(row).toLowerCase().includes(needle)) return false;
  }
  return true;
}

/**
 * Export — the rows on screen, the columns on screen, in the order they are on
 * screen. RFC 4180 quoting, because a customer's address carries commas and a
 * register that exports a broken file is worse than one that exports none.
 */
export function toCsv(
  keys: readonly string[],
  rows: readonly RegisterRow[],
): string {
  const fields = keys.map(fieldByKey).filter((f): f is RegisterField => f != null);
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [fields.map((f) => cell(f.label)).join(",")];
  for (const r of rows) lines.push(fields.map((f) => cell(f.text(r))).join(","));
  return lines.join("\r\n");
}
