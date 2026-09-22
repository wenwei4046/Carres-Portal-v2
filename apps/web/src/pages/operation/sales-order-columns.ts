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
 * THE DEFAULT ROW — owner ruling 2026-09-21 (orders MASTER, THE REGISTER
 * COMPOSITION), exactly and in this order:
 *   ☐ ▸ Proceed Date · SO Doc Date · SO No · Sales Location · Salesperson ·
 *   Customer Requested Delivery Date · Customer Delivery Location · Customer ·
 *   Items · PO No · DO No
 *
 * REQUIRED FACTS PRINT NO ABSENCE WORD. The first nine are required when Sales
 * submits the order, so an empty one is a system error fixed at its source —
 * never dressed as `Not recorded` / `To be confirmed` / `No delivery date`.
 * Only a document that does not exist yet has a word: `No PO yet` · `No DO yet`.
 *
 * EVERY WIDTH IS THE REGISTRY'S (`REGISTER_FIELD_WIDTH`, UI MASTER §6.8). This
 * file types no pixel number.
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
 *   Not recorded   WE never captured it             optional columns only
 *   No price yet / Paid in full                     the money states
 *   No date yet    a promise with no date on it
 */
import { parseEmergencyContact } from "@carres/shared";

import { REGISTER_FIELD_WIDTH as W } from "@/components/register/register-field-widths";
import { fmtDate } from "@/lib/fmt-date";
import { displayCustomerName } from "@/lib/customer-name";
import type { DeliveryOrderRow, operationOrderListRow } from "@/lib/queries";

/** D4 — the register needs exactly ONE fact from a delivery order: its number.
 *  Narrow on purpose. The list read now embeds `ops_delivery_orders(do_number)`
 *  per order, and that shape satisfies this without carrying the delivery
 *  register's whole row; a full `DeliveryOrderRow` still assigns, so the
 *  register's own tests may keep passing complete rows. */
export type RegisterDeliveryOrder = Pick<DeliveryOrderRow, "do_number">;
import {
  digits,
  lineName,
  moneyOfOrder,
  outstandingState,
  searchHaystack,
  valueState,
  type MoneyState,
} from "./sales-order-facts";

/** The dictionary's ONE absence word, so no caller spells it. It and the
 *  locality rule live in the neutral `@/lib/locality` — Purchasing reads them
 *  too, and a Purchasing surface may not import a Sales page file.
 *
 *  This file used to hold TWO words and spend them by hand, 20 cells against
 *  18. Same table, two spellings of empty (YH, 2026-08-29). */
export { NOT_RECORDED, conciseLocality } from "@/lib/locality";
import { NOT_RECORDED, conciseLocality } from "@/lib/locality";
import { DATE_TO_BE_CONFIRMED_CELL } from "./sales-order-guidance";
export const NO_DATE_YET = "No delivery date";

/**
 * ⭐ THE TWO DOCUMENT ABSENCES — owner ruling 2026-09-21 (COPY-STANDARD).
 * A Purchase Order or a Delivery Order that genuinely does not exist yet is
 * the only empty cell on the Register's default row that earns a word. Muted,
 * one line. `Not recorded` would say Carres failed to write a number down.
 */
export const NO_PO_YET = "No PO yet";
export const NO_DO_YET = "No DO yet";

/**
 * `{first item} + {n} more` — the Register's `Items` (COPY-STANDARD, goods
 * summary). The name is the product's, never its SKU, whenever the catalog
 * knows it; the SKU is the honest fallback for a code the catalog does not.
 * Goods lines only: a service sells nothing on its own (Sales Portal gate).
 */
export function registerItemsSummary(
  o: operationOrderListRow,
  nameOf: (sku: string) => string | undefined = () => undefined,
): string {
  const lines = o.order_lines ?? [];
  if (lines.length === 0) return "";
  const first = lines[0]!;
  const name = nameOf(first.sku) ?? lineName(first);
  return lines.length > 1 ? `${name} + ${lines.length - 1} more` : name;
}

/**
 * ⭐ ONE ARITHMETIC FOR `Requested Delivery Date` (Architecture Law D).
 *
 * The date the CUSTOMER is asking Carres to deliver on — Sales Orders owns it
 * and every other surface only reads it. It was derived in three places
 * (this register's row, `delivery-work.ts` and `delivery-orders-register.ts`)
 * with three copies of the same `delivery_date_tbd` guard: three expressions
 * that agreed today and would drift the first time one of them was touched.
 *
 * `tbd` is a SEPARATE fact from an absent date: the customer HAS asked for a
 * delivery and the day is not settled yet, which is not the same as never
 * having named one, so the caller may print the two absences differently.
 */
export function requestedDeliveryOf(o: {
  delivery_date?: string | null;
  delivery_date_tbd?: boolean | null;
}): { iso: string | null; tbd: boolean } {
  const tbd = Boolean(o.delivery_date_tbd);
  return { iso: tbd ? null : o.delivery_date ?? null, tbd };
}

/**
 * ⭐ AND ONE SPELLING OF ITS CELL. Three different things can be true of a
 * requested date — a day, `To be confirmed`, or nothing asked for — and the
 * cell, the search, the per-column filter and the Excel export must say the
 * SAME one. Delivery's two registers each flattened `To be confirmed` into
 * `No delivery date` on the way to the sheet, which told an Excel reader the
 * customer had named no day when the customer had asked for one still being
 * settled.
 */
export function requestedDeliveryText(v: { iso: string | null; tbd: boolean }): string {
  if (v.iso) return fmtDate(v.iso);
  return v.tbd ? DATE_TO_BE_CONFIRMED_CELL : NO_DATE_YET;
}

/**
 * `Sales Location` — where the order was sold (owner ruling 2026-09-21:
 * "showroom is sales location"). The OUTLET, else the DEALER, so it is always
 * filled — the same rule and the same full name the SO PDF prints
 * (`sales-order-template.tsx`, `outletName ?? dealer.name`). Nothing is
 * shortened: one fact prints one way on the page and on the paper.
 */
export function salesLocationOf(o: {
  outlets?: { name?: string | null } | null;
  dealers?: { name?: string | null } | null;
}): string {
  return o.outlets?.name?.trim() || o.dealers?.name?.trim() || "";
}

/**
 * ⭐ AN ABSENCE IS QUIETER THAN A FACT — owner ruling 2026-08-15 (Chai).
 *
 * `Not recorded` and `Not given` are the honest words for an empty cell (a
 * blank may never carry two meanings), but printed in the same ink as a real
 * PO number they compete with it: a `PO No` column of eight `Not recorded`s
 * and two real documents reads as ten facts. They keep their words and lose
 * their weight, rendering in the secondary token.
 *
 * `No delivery date` is deliberately NOT in this set. It is not a quiet
 * absence — it is the head of a governed two-line action, and §0.1 already
 * rules how it paints.
 */
export const MUTED_ABSENCES: ReadonlySet<string> = new Set([NOT_RECORDED, NO_PO_YET, NO_DO_YET]);

/** One register row: the order, plus every fact already resolved to a string. */
export interface RegisterRow {
  o: operationOrderListRow;
  id: string;
  so: number;
  customer: string;
  phone: string;
  items: string;
  /** `Proceed Date` — `orders.proceeded_at`, the actual Sales → Operation handoff. */
  proceeded: string | null;
  ordered: string;
  customerDelivery: string | null;
  deliveryLocation: string;
  poNumbers: string[];
  /** Every Delivery document produced by this SO. `orders.do_number` is only
   *  the current mirror and may never hide failed, voided or rebooked DOs. */
  deliveryOrders: RegisterDeliveryOrder[];
  total: MoneyState;
  paid: MoneyState;
  balance: MoneyState;
  /* ONE COLUMN, THREE FACTS - so the register prints THREE cells.
     `customer_emergency` stores name, phone and relationship joined with a
     dot. The Sales Order page has always split them into three validated
     fields; the register printed the joined string raw, which is the
     dot-separated schema dump COPY-STANDARD bans. Parsed ONCE here, at the
     row, for the same reason `customer` is cased once here. */
  emergency: { name: string; phone: string; relationship: string };
  needle: string;
  phoneDigits: string;
}

export function buildRegisterRow(
  o: operationOrderListRow,
  deliveryOrders: RegisterDeliveryOrder[] = [],
  itemNameOf?: (sku: string) => string | undefined,
): RegisterRow {
  const money = moneyOfOrder(o);
  const phone = o.customer_phone ?? "";
  return {
    o,
    id: o.id,
    so: o.so,
    /* ⭐ CAPITALIZE UP — owner ruling 2026-08-15. Cased ONCE here, at the
       row, so the Customer column, the guidance sentence, the search, the
       filter and the CSV export cannot print the name four ways. Display
       only: `o.customer_name` is untouched and nothing is written back. */
    customer: displayCustomerName(o.customer_name),
    phone,
    items: registerItemsSummary(o, itemNameOf),
    proceeded: o.proceeded_at ?? null,
    ordered: o.placed_at,
    customerDelivery: requestedDeliveryOf(o).iso,
    /* A required fact (2026-09-21): an empty locality prints nothing, never
       the locality helper's `Not recorded`. */
    deliveryLocation:
      o.customer_address_city?.trim() || o.customer_address_state?.trim()
        ? conciseLocality(o.customer_address_city, o.customer_address_state)
        : "",
    poNumbers: o.po_numbers ?? [],
    deliveryOrders,
    total: valueState(money),
    /* `paid` is never "unpriced" and never "settled": a payment either
     * happened or it did not, and the truthful cell for "it did not" is
     * `RM 0`. */
    paid: { kind: "amount", value: money.paid },
    balance: outstandingState(money),
    emergency: parseEmergencyContact(o.customer_emergency),
    needle: searchHaystack(o),
    phoneDigits: digits(phone),
  };
}

/** What a money cell says when it is not an amount — the dictionary's words. */
export function moneyText(state: MoneyState): string {
  if (state.kind === "amount") return String(state.value);
  return state.kind === "settled" ? "Paid in full" : "No price yet";
}

/** Stage 1's eight chooser groups, in the order the card states them. */
export type FieldGroup =
  | "Document"
  | "Customer"
  | "Sales ownership"
  | "Items"
  | "Money"
  | "Dates"
  | "Delivery"
  | "Operation";

export interface RegisterField {
  key: string;
  /** The header word. COPY-STANDARD / BUILD-QUEUE own it; this file carries it. */
  label: string;
  /** Always a `REGISTER_FIELD_WIDTH` entry (UI MASTER §6.8) — never a number typed here. */
  width: number;
  align?: "right";
  numeric?: boolean;
  group: FieldGroup;
  /** On the register by default. Exactly eight are, in the owner-ruled order. */
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
 * THE CATALOG — the eleven owner-ruled defaults in their order (2026-09-21),
 * everything else hidden and openable from Columns.
 *
 * WIDTHS COME ONLY FROM THE SHARED REGISTRY (UI MASTER §6.8), and the default
 * row was re-measured for this order in the rendered portal shell (orders
 * MASTER records the numbers). One line per cell at the page's 40px row: a value
 * longer than its column ends in `…` and opens whole on hover and keyboard
 * focus (engine `overflowText`), and the column can be widened. Dates and the
 * three document numbers are sized so they never cut.
 *
 * THE KEYS STAY WHAT THEY WERE (`ordered`, `customer_delivery`, …): a label is
 * presentation, an identifier is a contract. The saved-layout key moved
 * instead (v6), which is what retires the old order.
 */
export const REGISTER_FIELDS: readonly RegisterField[] = [
  /* ── THE DEFAULT ROW — owner ruling 2026-09-21, exactly this order ──────── */
  /* `Proceed Date` leads: the ACTUAL handoff (`orders.proceeded_at`, the same
     fact and word as SO Batch Purchase) — never the planned `proceed_date`. */
  { key: "proceeded", label: "Proceed Date", width: W.date, group: "Dates", on: true,
    text: (r) => (r.proceeded ? fmtDate(r.proceeded) : ""), sortBy: (r) => r.proceeded ?? "",
    kind: "date", iso: (r) => r.proceeded },
  /* `SO Doc Date` replaces the retired word `SO Date` for the Sales Order
     document date (`orders.placed_at`) — one meaning, one word. */
  { key: "ordered", label: "SO Doc Date", width: W.date, group: "Dates", on: true,
    text: (r) => fmtDate(r.ordered), sortBy: (r) => r.ordered,
    kind: "date", iso: (r) => r.ordered },
  { key: "so", label: "SO No", width: W.soNo, group: "Document", on: true,
    text: (r) => `SO-${r.so}`, sortBy: (r) => r.so },
  /* `Sales Location` is read with the identity: where it was sold. */
  { key: "sales_location", label: "Sales Location", width: W.salesLocation, group: "Sales ownership", on: true,
    text: (r) => salesLocationOf(r.o) },
  /* `Salesperson` names who SOLD the order — never an action owner. */
  { key: "salesperson", label: "Salesperson", width: W.salesperson, group: "Sales ownership", on: true,
    text: (r) => r.o.salespersons?.name ?? "" },
  /* A required fact: a date, never `To be confirmed` / `No delivery date`. */
  { key: "customer_delivery", label: "Customer Requested Delivery Date", width: W.customerRequestedDeliveryDate,
    group: "Dates", on: true,
    text: (r) => (r.customerDelivery ? fmtDate(r.customerDelivery) : ""),
    sortBy: (r) => r.customerDelivery ?? "",
    kind: "date", iso: (r) => r.customerDelivery },
  { key: "delivery_location", label: "Customer Delivery Location", width: W.customerDeliveryLocation,
    group: "Customer", on: true,
    text: (r) => r.deliveryLocation },
  { key: "customer", label: "Customer", width: W.customer, group: "Customer", on: true,
    text: (r) => r.customer, sortBy: (r) => r.customer },
  { key: "items", label: "Items", width: W.items, group: "Items", on: true,
    text: (r) => r.items },
  { key: "po_number", label: "PO No", width: W.documentNo, group: "Document", on: true,
    text: (r) => r.poNumbers.join(" · ") || NO_PO_YET },
  { key: "do_number", label: "DO No", width: W.documentNo, group: "Document", on: true,
    text: (r) =>
      r.deliveryOrders.length === 0
        ? NO_DO_YET
        : r.deliveryOrders.length === 1
          ? r.deliveryOrders[0]!.do_number
          : `${r.deliveryOrders.length} Delivery Orders` },

  /* ── OPTIONAL — hidden by default, openable from Columns ────────────────── */
  { key: "total", label: "Total", width: W.amount, align: "right", numeric: true,
    group: "Money", text: (r) => moneyText(r.total),
    sortBy: (r) => (r.total.kind === "amount" ? r.total.value : -1),
    kind: "number", num: (r) => (r.total.kind === "amount" ? r.total.value : null),
    footerSum: (r) => amountOf(r.total) },
  /* THE CUSTOMER-MONEY WORD IS `Outstanding` (owner ruling 2026-08-15; already
     CLAUDE.md §7 — what the CUSTOMER owes HQ). The KEY stays `balance`: a
     label is presentation, an identifier is a contract, and renaming it would
     silently reset every saved column layout (01-design-tokens §0). `balance`
     remains the ruled GOODS word for short-delivery quantity elsewhere. */
  { key: "balance", label: "Outstanding", width: W.amount, align: "right", numeric: true,
    group: "Money", text: (r) => moneyText(r.balance),
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
  /* `Promised` is DELETED (owner ruling 2026-08-18): it derived from exactly
     the same fact as `Requested Delivery Date` (`orders.delivery_date` under the
     same tbd guard), so opening it printed one date twice under two labels —
     ONE customer date column is the law. */
  { key: "dealer", label: "Dealer", width: W.partyName, group: "Sales ownership",
    text: (r) => r.o.dealers?.name || NOT_RECORDED },

  /* ── DOCUMENT — the papers this order produced, and its references ──────── */
  { key: "source_ref", label: "Customer reference", width: W.reference, group: "Document",
    text: (r) => (r.o.source_ref ?? []).filter(Boolean).join(" · ") || NOT_RECORDED },
  { key: "invoice_no", label: "Invoice No", width: W.reference, group: "Document",
    text: (r) => r.o.invoice_no || NOT_RECORDED },

  /* ── CUSTOMER — the customer's own facts (BUILD-QUEUE "STRUCTURED ADDRESS":
     raw fallback + the five structured parts + Building Type) ─────────────── */
  { key: "phone", label: "Phone", width: W.phone, group: "Customer",
    text: (r) => r.phone || NOT_RECORDED },
  { key: "email", label: "Email", width: W.email, group: "Customer",
    text: (r) => r.o.customer_email || NOT_RECORDED },
  { key: "address", label: "Address", width: W.address, group: "Customer",
    text: (r) => r.o.customer_address || NOT_RECORDED },
  { key: "address_line1", label: "Address line 1", width: W.address, group: "Customer",
    text: (r) => r.o.customer_address_line1 || NOT_RECORDED },
  { key: "address_line2", label: "Address line 2", width: W.address, group: "Customer",
    text: (r) => r.o.customer_address_line2 || NOT_RECORDED },
  { key: "city", label: "City", width: W.placeWord, group: "Customer",
    text: (r) => r.o.customer_address_city || NOT_RECORDED },
  { key: "state", label: "State", width: W.placeWord, group: "Customer",
    text: (r) => r.o.customer_address_state || NOT_RECORDED },
  { key: "postcode", label: "Postcode", width: W.shortFact, group: "Customer",
    text: (r) => r.o.customer_address_postcode || NOT_RECORDED },
  { key: "building_type", label: "Building type", width: W.placeWord, group: "Customer",
    text: (r) => r.o.building_type || NOT_RECORDED },
  /* THREE FACTS, THREE COLUMNS. `RegisterField.text` is "the ONE string:
     printed, filtered, sorted and exported", so a cell cannot carry a second
     line - and it should not: an operator filtering by relationship or sorting
     by emergency phone could do neither while all three shared one cell.
     A legacy/imported string that `composeEmergencyContact` never wrote lands
     wholly in `name` (see `parseEmergencyContact`), so nothing is lost and the
     other two read `Not given`. */
  { key: "emergency", label: "Emergency contact", width: W.customer, group: "Customer",
    text: (r) => r.emergency.name || NOT_RECORDED },
  { key: "emergency_phone", label: "Emergency phone", width: W.phone, group: "Customer",
    text: (r) => r.emergency.phone || NOT_RECORDED },
  { key: "emergency_relationship", label: "Emergency relationship", width: W.placeWord, group: "Customer",
    text: (r) => r.emergency.relationship || NOT_RECORDED },
  /* "SAME AS DELIVERY" IS AN ANSWER, NOT A BLANK.
     `customer_billing` is empty BY DESIGN whenever the customer ticked
     `Billing address same as delivery` - the detail row type says so in its own
     comment: "only meaningful when customer_billing_same is false". The column
     printed `Not recorded` on every one of those orders, which reads as "nobody
     asked" when the truth is "asked, and the answer was: the same address".

     So the cell prints the address we would actually bill. It prints the ADDRESS
     rather than the sentence `Billing address same as delivery` because
     `RegisterField.text` is the one string that is also FILTERED, SORTED and
     EXPORTED - a column of identical sentences can be none of those. Deriving a
     displayed value from a sibling column is the same thing `Delivery Location`
     already does from city + state.

     An order with the flag set and no delivery address either (the governed
     `Address not given yet` case) still reads `Not recorded`, because then
     nothing IS recorded. */
  { key: "billing", label: "Billing address", width: W.address, group: "Customer",
    text: (r) =>
      (r.o.customer_billing_same ? r.o.customer_address : r.o.customer_billing) ||
      NOT_RECORDED },

  /* ⭐ PARITY WITH WHAT THE TILL ACTUALLY ASKS (2026-08-24).
     A salesperson fills these at SO creation and the register route already
     SELECTS them — they simply had no column, so a fact the customer was asked
     for could not be read back by the office that has to act on it. Added as
     ordinary optional columns: off by default, in the chooser like every other,
     so the owner-ruled default view is untouched. */
  { key: "race", label: "Race", width: W.shortFact, group: "Customer",
    text: (r) => r.o.customer_race || NOT_RECORDED },
  { key: "gender", label: "Gender", width: W.shortFact, group: "Customer",
    text: (r) => r.o.customer_gender || NOT_RECORDED },
  { key: "birthday", label: "Birthday", width: W.date, group: "Customer",
    text: (r) => r.o.customer_birthday || NOT_RECORDED },
  /* Stair carry is a DELIVERY fact, not a customer one — it sits with Floor and
     Lift, which is where the operator planning the trip looks. */
  { key: "stair_items", label: "Stair carry items", width: W.smallCount, align: "right", numeric: true,
    group: "Delivery",
    text: (r) =>
      r.o.delivery_stair_items == null ? NOT_RECORDED : String(r.o.delivery_stair_items) },

  /* ── SOURCE — who sold it, through which door ───────────────────────────── */
  { key: "channel", label: "Channel", width: W.partyName, group: "Sales ownership",
    text: (r) => r.o.channel || NOT_RECORDED },
  { key: "source", label: "Order origin", width: W.partyName, group: "Sales ownership",
    text: (r) => r.o.source_system || NOT_RECORDED },

  /* ── MONEY — the rest ───────────────────────────────────────────────────── */
  { key: "paid", label: "Paid", width: W.amount, align: "right", numeric: true,
    group: "Money", text: (r) => moneyText(r.paid),
    sortBy: (r) => (r.paid.kind === "amount" ? r.paid.value : 0),
    kind: "number", num: (r) => (r.paid.kind === "amount" ? r.paid.value : 0),
    footerSum: (r) => amountOf(r.paid) },
  { key: "payment_method", label: "Payment method", width: W.reference, group: "Money",
    text: (r) => r.o.payment_method || NOT_RECORDED },
  { key: "installments", label: "Instalment months", width: W.smallCount, align: "right",
    numeric: true, group: "Money",
    text: (r) => (r.o.installment_months == null ? NOT_RECORDED : String(r.o.installment_months)),
    sortBy: (r) => r.o.installment_months ?? -1,
    kind: "number", num: (r) => r.o.installment_months ?? null },

  /* ── DATES — every stamp, whatever act produced it ──────────────────────── */
  { key: "proceed_date", label: "Proceed date", width: W.date, group: "Dates",
    text: (r) => date(r.o.proceed_date, NOT_RECORDED), sortBy: (r) => r.o.proceed_date ?? "",
    kind: "date", iso: (r) => r.o.proceed_date ?? null },
  { key: "dispatched", label: "Dispatched", width: W.date, group: "Dates",
    text: (r) => date(r.o.dispatched_at, NOT_RECORDED), sortBy: (r) => r.o.dispatched_at ?? "",
    kind: "date", iso: (r) => r.o.dispatched_at ?? null },
  { key: "delivered", label: "Delivered", width: W.date, group: "Dates",
    text: (r) => date(r.o.delivered_at, NOT_RECORDED), sortBy: (r) => r.o.delivered_at ?? "",
    kind: "date", iso: (r) => r.o.delivered_at ?? null },
  { key: "invoiced", label: "Invoiced", width: W.date, group: "Dates",
    text: (r) => date(r.o.invoiced_at, NOT_RECORDED), sortBy: (r) => r.o.invoiced_at ?? "",
    kind: "date", iso: (r) => r.o.invoiced_at ?? null },

  /* ── DELIVERY — what the trip has to cope with (facts the ORDER carries) ── */
  { key: "floor", label: "Floor", width: W.shortFact, align: "right", numeric: true,
    group: "Delivery",
    text: (r) => (r.o.delivery_floor == null ? NOT_RECORDED : String(r.o.delivery_floor)),
    sortBy: (r) => r.o.delivery_floor ?? -1,
    kind: "number", num: (r) => r.o.delivery_floor ?? null },
  { key: "lift", label: "Lift", width: W.shortFact, group: "Delivery",
    text: (r) => (r.o.delivery_has_lift == null ? NOT_RECORDED : r.o.delivery_has_lift ? "Yes" : "No") },

  /* ── OPERATION — currently empty on purpose. `Current` moved to DOCUMENT
   * (FIX 2): it points at a document/lifecycle, it does not command work.
   * The group stays declared in the chooser order so the day a real
   * operation-owned FACT earns a column it has its place — and nothing
   * operational may enter through any other door. ─────────────────────────── */
] as const;

/** The owner-ruled eight, and the ONE place the register's default shape is stated. */
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
