/**
 * THE REGISTER'S FIELD CATALOG — STAGE 1 (BUILD-QUEUE, 2026-08-09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ ONE DECLARATION PER FACT, AND THE COLUMN CHOOSER IS THAT LIST
 *
 * Every field here is a flat fact the CUSTOMER ORDER itself owns (a column on
 * `orders`, or a NAME embed off a single FK, because a column of UUIDs is not
 * a fact anyone can read). The chooser is this list, GROUPED — Stage 1's own
 * eight: DOCUMENT · CUSTOMER · SOURCE · ITEMS · MONEY · DATES · DELIVERY ·
 * OPERATION. Cross-module records (Stock, live delivery execution, Actions)
 * stay off this page; a chooser is exactly the back door they would walk in
 * through.
 *
 * THE DEFAULT ROW — amended 2026-08-11 under the Production UI Execution Law
 * (`docs/ui/MASTER.md` §1.1: proactive design judgment, asynchronous review):
 *   ☐ ▸ SO No · Customer · Items · Current · Total · Balance · Promised ·
 *   Ordered
 *
 * Stage 1's row ended `… Dealer · Showroom` and carried no lifecycle pointer
 * at all. Two attribution columns held 286px permanently while the register
 * could not say which document an order had reached — so the sheet READ like
 * an export and the operator's own truth was the part that had to be hunted
 * for. `Current` took the row's fourth seat; `Dealer` and `Showroom` kept
 * everything except the default paint. **Operations therefore opens on SIX
 * columns, not seven, and the row got NARROWER while saying MORE.**
 *
 * `text` IS THE COLUMN. It is what the cell prints, what the column's filter
 * box matches, what a sort compares and what Export writes — one string, four
 * jobs. Two columns need MARKUP as well (`customer` rides the phone, the money
 * columns render `Money`); the page owns that, this file owns the string.
 *
 * **No React here on purpose** — the catalog is testable without a DOM.
 *
 * THE ABSENCE WORDS ARE THE DICTIONARY'S (`COPY-STANDARD.md`):
 *   Not given      the CUSTOMER did not give it     phone · address · email
 *   Not recorded   WE never captured it             salesperson · outlet
 *   No price yet / Paid in full                     the money states
 *   No date yet    a promise with no date on it
 */
import { fmtDate } from "@/lib/fmt-date";
import type { operationOrderListRow } from "@/lib/queries";
import {
  digits,
  isDelivered,
  itemsSummary,
  moneyOfOrder,
  outstandingState,
  searchHaystack,
  valueState,
  type MoneyState,
} from "./sales-order-facts";

/** The dictionary's absence words, so no caller spells them. */
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
  total: MoneyState;
  paid: MoneyState;
  balance: MoneyState;
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
    total: valueState(money),
    /* `paid` is never "unpriced" and never "settled": a payment either
     * happened or it did not, and the truthful cell for "it did not" is
     * `RM 0`. */
    paid: { kind: "amount", value: money.paid },
    balance: outstandingState(money),
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
 * `Current` — 2990's lifecycle pointer, SHIPPED AS DERIVED (BUILD-QUEUE §
 * "Current"): *which formal document or stage has this order reached?*
 * `invoice_no ?? do_number ?? the live stage`, and **never a document number
 * that does not exist**. From what the list wire can PROVE today: an invoice,
 * a DO, Delivered, or an issued PO on one of the order's supplier threads.
 * Nothing proven yet → the engine's own empty standard (an em-dash).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 DEFECT REPAIRED 2026-08-11 — `PO issued` WAS ASKING A FIELD NOBODY WRITES,
 * and the column was measured at 1% before anyone read it.
 *
 * The rung asked `order_supplier_threads.some(t => t.po_id)` alone. Measured
 * on the live wire, 2026-08-11, over the 76 non-rental orders the register
 * actually loads:
 *
 * ```
 * order_supplier_threads[].po_id     0 / 76     the field this rung asked
 * po_skus (D1)                      19 / 76     the field D1 built for this
 * order_lines[].source_po           37 / 76     what the AutoCount import writes
 * ──────────────────────────────────────────
 * currentOf as shipped               1 / 76  =  1%
 * currentOf reading all three       57 / 76  = 75%
 * ```
 *
 * **`queries.ts` had already written down the cause** in D1's own comment —
 * *"the list's only PO evidence was `order_lines.source_po`, which ONLY the
 * AutoCount importer writes, so the ladder read every native order as
 * 'nothing ordered'"* — and D1 added `po_skus` to end exactly that. This
 * function was never taught to read it. **Same defect, one field further on.**
 *
 * `undefined` still means *we do not know* and lands on the same blank as
 * *nothing proves it*: the cell never accuses an order of being unbought.
 */
export function currentOf(o: operationOrderListRow): string {
  if (o.invoice_no) return `INV ${o.invoice_no}`;
  if (o.do_number) return `DO ${o.do_number}`;
  if (isDelivered(o)) return "Delivered";
  const onPo =
    (o.order_supplier_threads ?? []).some((t) => t.po_id) ||
    (o.po_skus ?? []).length > 0 ||
    (o.order_lines ?? []).some((l) => l.source_po);
  return onPo ? "PO issued" : "";
}

/** Stage 1's eight chooser groups, in the order the card states them. */
export type FieldGroup =
  | "Document"
  | "Customer"
  | "Source"
  | "Items"
  | "Money"
  | "Dates"
  | "Delivery"
  | "Operation";

export interface RegisterField {
  key: string;
  /** The header word. COPY-STANDARD / BUILD-QUEUE own it; this file carries it. */
  label: string;
  /** Measured ink + 16 for the kit's `px-2`; +2 more where the column may clip. */
  width: string;
  align?: "right";
  numeric?: boolean;
  group: FieldGroup;
  /** On the register by default. Exactly nine are, and they are Stage 1's nine. */
  on?: true;
  /** The ONE string: printed, filtered, sorted and exported. */
  text: (r: RegisterRow) => string;
  /** A sort key when the printed string sorts wrongly (a number, a date). */
  sortBy?: (r: RegisterRow) => number | string;
  /** Which of 2990's three ▼ shapes this column gets. Absent = value list. */
  kind?: "date" | "number";
  /** The raw ISO date behind a `kind: "date"` column. `null` = no date. */
  iso?: (r: RegisterRow) => string | null;
  /** The raw number behind a `kind: "number"` column. `null` = no figure. */
  num?: (r: RegisterRow) => number | null;
  /** MONEY columns sum in the engine's footer over the FILTERED list. */
  footerSum?: (r: RegisterRow) => number;
}

const date = (v: string | null | undefined, absent: string) => (v ? fmtDate(v) : absent);

const amountOf = (s: MoneyState): number => (s.kind === "amount" ? s.value : 0);

/**
 * THE CATALOG — nine defaults (Stage 1's row, in its order), everything else
 * hidden. Hidden columns are sized to their own longest live value plus the
 * kit's `px-2`, and every one of them is off by default, so none of them can
 * widen the sheet an operator did not ask to widen.
 */
export const REGISTER_FIELDS: readonly RegisterField[] = [
  /* ── The nine defaults, in Stage 1's order ─────────────────────────────── */
  { key: "so", label: "SO No", width: "85px", group: "Document", on: true,
    text: (r) => `SO-${r.so}`, sortBy: (r) => r.so },
  { key: "customer", label: "Customer", width: "190px", group: "Customer", on: true,
    text: (r) => r.customer, sortBy: (r) => r.customer },
  { key: "items", label: "Items", width: "300px", group: "Items", on: true,
    text: (r) => r.items },
  /* AMENDMENT 2026-08-11 · `Current` JOINS THE DEFAULT ROW, and it is the one
   * column that turns an export sheet into an operating register: WHICH
   * FORMAL DOCUMENT OR STAGE HAS THIS ORDER REACHED. It is derived from the
   * order's OWN papers (`currentOf`) — a record fact, never an instruction —
   * so the REGISTER LAW holds and Work still owns what to do about it.
   *
   * FIX 2's substance is untouched: `Current` is a DOCUMENT-group field, not
   * an OPERATION one. Only its position moved, because a DEFAULT column leads
   * its group — it now reads fourth on the row, right where the eye lands
   * after Items. */
  { key: "current", label: "Current", width: "140px", group: "Document", on: true,
    text: (r) => currentOf(r.o) },
  { key: "total", label: "Total", width: "109px", align: "right", numeric: true,
    group: "Money", on: true, text: (r) => moneyText(r.total),
    sortBy: (r) => (r.total.kind === "amount" ? r.total.value : -1),
    kind: "number", num: (r) => (r.total.kind === "amount" ? r.total.value : null),
    footerSum: (r) => amountOf(r.total) },
  { key: "balance", label: "Balance", width: "109px", align: "right", numeric: true,
    group: "Money", on: true, text: (r) => moneyText(r.balance),
    sortBy: (r) => (r.balance.kind === "amount" ? r.balance.value : -1),
    kind: "number",
    /* `Paid in full` IS zero balance — a min/max of 0 must catch it. An
     * unpriced order has NO figure and is excluded, exactly as 2990 excludes
     * a NaN. */
    num: (r) =>
      r.balance.kind === "amount" ? r.balance.value
      : r.balance.kind === "settled" ? 0
      : null,
    footerSum: (r) => amountOf(r.balance) },
  { key: "promised", label: "Promised", width: "113px", group: "Dates", on: true,
    text: (r) => date(r.promised, NO_DATE_YET), sortBy: (r) => r.promised ?? "",
    kind: "date", iso: (r) => r.promised },
  { key: "ordered", label: "Ordered", width: "113px", group: "Dates", on: true,
    text: (r) => fmtDate(r.ordered), sortBy: (r) => r.ordered,
    kind: "date", iso: (r) => r.ordered },
  /* AMENDMENT 2026-08-11 · `Dealer` + `Showroom` LEAVE THE DEFAULT ROW.
   *
   * They were 286px — a QUARTER of the operator's whole default row — spent
   * permanently on ATTRIBUTION: who sold it and through which door. That is a
   * question asked once, when somebody is reporting; it is never the question
   * asked while an order is being run. **Permanent screen space is earned by
   * operator frequency and decision value** (CLAUDE.md §2), and these two
   * columns lost that test to the one fact the register was hiding from
   * itself, `Current`.
   *
   * NOTHING WAS DELETED. Both keep their catalog entry, their width, their
   * filter and their SOURCE group, one click away in Columns — which is what
   * a chooser is FOR. A register that shows every fact permanently is a
   * database export, and that is the exact defect this amendment answers. */
  { key: "dealer", label: "Dealer", width: "160px", group: "Source",
    text: (r) => r.o.dealers?.name || NOT_RECORDED },
  { key: "showroom", label: "Showroom", width: "126px", group: "Source",
    text: (r) => r.o.outlets?.name || NOT_RECORDED },

  /* ── DOCUMENT — the papers this order produced, and its references ──────── */
  { key: "source_ref", label: "Customer reference", width: "160px", group: "Document",
    text: (r) => (r.o.source_ref ?? []).filter(Boolean).join(" · ") || NOT_RECORDED },
  { key: "do_number", label: "DO No", width: "120px", group: "Document",
    text: (r) => r.o.do_number || NOT_RECORDED },
  { key: "invoice_no", label: "Invoice No", width: "130px", group: "Document",
    text: (r) => r.o.invoice_no || NOT_RECORDED },

  /* ── CUSTOMER — the customer's own facts (BUILD-QUEUE "STRUCTURED ADDRESS":
     raw fallback + the five structured parts + Building Type) ─────────────── */
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
  { key: "building_type", label: "Building type", width: "130px", group: "Customer",
    text: (r) => r.o.building_type || NOT_GIVEN },
  { key: "emergency", label: "Emergency contact", width: "200px", group: "Customer",
    text: (r) => r.o.customer_emergency || NOT_GIVEN },
  { key: "billing", label: "Billing address", width: "220px", group: "Customer",
    text: (r) => r.o.customer_billing || NOT_GIVEN },

  /* ── SOURCE — who sold it, through which door ───────────────────────────── */
  { key: "salesperson", label: "Salesperson", width: "167px", group: "Source",
    text: (r) => r.o.salespersons?.name || NOT_RECORDED },
  { key: "channel", label: "Channel", width: "112px", group: "Source",
    text: (r) => r.o.channel || NOT_RECORDED },
  { key: "source", label: "Source", width: "112px", group: "Source",
    text: (r) => r.o.source_system || NOT_RECORDED },

  /* ── MONEY — the rest ───────────────────────────────────────────────────── */
  { key: "paid", label: "Paid", width: "109px", align: "right", numeric: true,
    group: "Money", text: (r) => moneyText(r.paid),
    sortBy: (r) => (r.paid.kind === "amount" ? r.paid.value : 0),
    kind: "number", num: (r) => (r.paid.kind === "amount" ? r.paid.value : 0),
    footerSum: (r) => amountOf(r.paid) },
  { key: "payment_method", label: "Payment method", width: "150px", group: "Money",
    text: (r) => r.o.payment_method || NOT_RECORDED },
  { key: "installments", label: "Instalment months", width: "140px", align: "right",
    numeric: true, group: "Money",
    text: (r) => (r.o.installment_months == null ? NOT_RECORDED : String(r.o.installment_months)),
    sortBy: (r) => r.o.installment_months ?? -1,
    kind: "number", num: (r) => r.o.installment_months ?? null },

  /* ── DATES — every stamp, whatever act produced it ──────────────────────── */
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

  /* ── DELIVERY — what the trip has to cope with (facts the ORDER carries) ── */
  { key: "floor", label: "Floor", width: "80px", align: "right", numeric: true,
    group: "Delivery",
    text: (r) => (r.o.delivery_floor == null ? NOT_RECORDED : String(r.o.delivery_floor)),
    sortBy: (r) => r.o.delivery_floor ?? -1,
    kind: "number", num: (r) => r.o.delivery_floor ?? null },
  { key: "lift", label: "Lift", width: "80px", group: "Delivery",
    text: (r) => (r.o.delivery_has_lift == null ? NOT_RECORDED : r.o.delivery_has_lift ? "Yes" : "No") },

  /* ── OPERATION — currently empty on purpose. `Current` moved to DOCUMENT
   * (FIX 2): it points at a document/lifecycle, it does not command work.
   * The group stays declared in the chooser order so the day a real
   * operation-owned FACT earns a column it has its place — and nothing
   * operational may enter through any other door. ─────────────────────────── */
] as const;

/** Stage 1's nine, and the ONE place the register's default shape is stated. */
export const DEFAULT_COLUMNS: readonly string[] = REGISTER_FIELDS.filter((f) => f.on).map(
  (f) => f.key,
);

/**
 * ROLE DEFAULTS (Stage 1): Operations opens with money hidden (openable);
 * Finance opens with money visible. **defaultHidden is NOT permission** — it
 * decides nothing but the first paint; the chooser opens every column either
 * way. A fact a role may not see is removed from the API response, never
 * merely hidden here.
 */
export function defaultOnFor(f: RegisterField, role: string | null): boolean {
  if (!f.on) return false;
  if (f.group === "Money" && role !== "finance" && role !== "principal") return false;
  return true;
}
