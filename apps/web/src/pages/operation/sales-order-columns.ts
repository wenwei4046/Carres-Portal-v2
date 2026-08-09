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
    /* `paid` is never "unpriced" and never "settled": a payment either
     * happened or it did not, and the truthful cell for "it did not" is
     * `RM 0` — SO-3 mapped zero to `settled`, which printed `Paid in full`
     * on an order nobody had paid a sen on. Found by SO-4 while wiring the
     * number filter; a filter on the RAW figure cannot share a cell with a
     * sentence that contradicts it. */
    paid: { kind: "amount", value: money.paid },
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

/**
 * The four groups the chooser stacks its checkboxes under — SO-5's own list
 * (*"grouped: Order / Customer / Money / Dates"*). Every date stamp lives under
 * `Dates` regardless of which act produced it; the documents an order cut
 * (`DO No`, `Invoice No`) are the ORDER's facts and sit under `Order`.
 */
export type FieldGroup = "Order" | "Customer" | "Money" | "Dates";

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
  /**
   * SO-4 — which of 2990's three ▼ shapes this column gets. Absent = the
   * value checklist. `date` filters on `iso`, `number` on `num` — the RAW
   * fact, because `Sat, 29 Aug 26` compares wrongly as a string and
   * `Paid in full` is not a number.
   */
  kind?: "date" | "number";
  /** The raw ISO date behind a `kind: "date"` column. `null` = no date. */
  iso?: (r: RegisterRow) => string | null;
  /** The raw number behind a `kind: "number"` column. `null` = no figure. */
  num?: (r: RegisterRow) => number | null;
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
  /* ── The five defaults ───────────────────────────────────────────────────
   * `Value` left the default row on the owner's SO-5 card and lives in the
   * chooser under Money. The Customer STRING is the name alone — RG-2 rides
   * the phone on the same cell (gray, one line) as page markup, so the ▼
   * filter, the sort and the name half of Export still work on this string;
   * the phone stays its own optional column and the search matches it. */
  { key: "so", label: "SO No", width: "85px", group: "Order", on: true,
    text: (r) => `SO-${r.so}`, sortBy: (r) => r.so },
  { key: "customer", label: "Customer", width: "200px", group: "Customer", on: true,
    text: (r) => r.customer, sortBy: (r) => r.customer },
  { key: "items", label: "Items", width: "361px", group: "Order", on: true,
    text: (r) => r.items },
  /* SO-5's dictionary: the column is `Promised Delivery`, never bare
   * `Promised` — the word says WHAT was promised. Width carries the header,
   * which is now the widest thing in the column (118.8px of ink + px-2). */
  { key: "promised", label: "Promised Delivery", width: "137px", group: "Dates", on: true,
    text: (r) => date(r.promised, NO_DATE_YET), sortBy: (r) => r.promised ?? "",
    kind: "date", iso: (r) => r.promised },
  { key: "ordered", label: "Ordered", width: "113px", group: "Dates", on: true,
    text: (r) => fmtDate(r.ordered), sortBy: (r) => r.ordered,
    kind: "date", iso: (r) => r.ordered },

  /* ── The money the order carries (chooser, default off) ─────────────────── */
  { key: "value", label: "Value", width: "109px", align: "right", numeric: true,
    group: "Money", text: (r) => moneyText(r.value),
    sortBy: (r) => (r.value.kind === "amount" ? r.value.value : -1),
    kind: "number", num: (r) => (r.value.kind === "amount" ? r.value.value : null) },

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

  /* ── What the delivery has to cope with — the customer's building ───────── */
  { key: "floor", label: "Floor", width: "80px", align: "right", numeric: true,
    group: "Customer",
    text: (r) => (r.o.delivery_floor == null ? NOT_RECORDED : String(r.o.delivery_floor)),
    sortBy: (r) => r.o.delivery_floor ?? -1,
    kind: "number", num: (r) => r.o.delivery_floor ?? null },
  { key: "lift", label: "Lift", width: "80px", group: "Customer",
    text: (r) => (r.o.delivery_has_lift == null ? NOT_RECORDED : r.o.delivery_has_lift ? "Yes" : "No") },

  /* ── The date stamps — every one under `Dates`, whatever act produced it ── */
  { key: "proceed_date", label: "Proceed date", width: "113px", group: "Dates",
    text: (r) => date(r.o.proceed_date, NOT_RECORDED), sortBy: (r) => r.o.proceed_date ?? "",
    kind: "date", iso: (r) => r.o.proceed_date ?? null },
  { key: "dispatched", label: "Dispatched", width: "113px", group: "Dates",
    text: (r) => date(r.o.dispatched_at, NOT_RECORDED), sortBy: (r) => r.o.dispatched_at ?? "",
    kind: "date", iso: (r) => r.o.dispatched_at ?? null },
  { key: "delivered", label: "Delivered", width: "113px", group: "Dates",
    text: (r) => date(r.o.delivered_at, NOT_RECORDED), sortBy: (r) => r.o.delivered_at ?? "",
    kind: "date", iso: (r) => r.o.delivered_at ?? null },
  { key: "invoiced", label: "Invoiced", width: "113px", group: "Dates",
    text: (r) => date(r.o.invoiced_at, NOT_RECORDED), sortBy: (r) => r.o.invoiced_at ?? "",
    kind: "date", iso: (r) => r.o.invoiced_at ?? null },

  /* ── The documents the order produced — the ORDER's own facts ───────────── */
  { key: "do_number", label: "DO No", width: "120px", group: "Order",
    text: (r) => r.o.do_number || NOT_RECORDED },
  { key: "invoice_no", label: "Invoice No", width: "130px", group: "Order",
    text: (r) => r.o.invoice_no || NOT_RECORDED },

  /* ── The rest of the money ──────────────────────────────────────────────── */
  { key: "paid", label: "Paid", width: "109px", align: "right", numeric: true,
    group: "Money", text: (r) => moneyText(r.paid),
    sortBy: (r) => (r.paid.kind === "amount" ? r.paid.value : 0),
    kind: "number", num: (r) => (r.paid.kind === "amount" ? r.paid.value : 0) },
  { key: "outstanding", label: "Outstanding", width: "109px", align: "right",
    numeric: true, group: "Money", text: (r) => moneyText(r.outstanding),
    sortBy: (r) => (r.outstanding.kind === "amount" ? r.outstanding.value : -1),
    kind: "number",
    /* `Paid in full` IS zero outstanding — a min/max of 0 must catch it. An
     * unpriced order has NO figure and is excluded, exactly as 2990 excludes
     * a NaN. */
    num: (r) =>
      r.outstanding.kind === "amount" ? r.outstanding.value
      : r.outstanding.kind === "settled" ? 0
      : null },
  { key: "payment_method", label: "Payment method", width: "150px", group: "Money",
    text: (r) => r.o.payment_method || NOT_RECORDED },
  { key: "installments", label: "Instalment months", width: "140px", align: "right",
    numeric: true, group: "Money",
    text: (r) => (r.o.installment_months == null ? NOT_RECORDED : String(r.o.installment_months)),
    sortBy: (r) => r.o.installment_months ?? -1,
    kind: "number", num: (r) => r.o.installment_months ?? null },
] as const;

/** SO-5's five, and the ONE place the register's default shape is stated. */
export const DEFAULT_COLUMNS: readonly string[] = REGISTER_FIELDS.filter((f) => f.on).map(
  (f) => f.key,
);

/* ─────────────────────────────────────────────────────────────────────────────
 * RG-2 — the machinery that used to live below (the ▼ filter model, the URL
 * params, the CSV writer, the chooser sanitiser) is DELETED, not moved: the
 * Register Engine (`components/register/DataGrid`) owns filtering, layout
 * persistence and Export Excel now, and a second implementation of any of
 * them is exactly the drift Law D exists to stop. This file is the CATALOG —
 * the facts, their strings, and their raw values — and nothing else.
 * ──────────────────────────────────────────────────────────────────────────── */
