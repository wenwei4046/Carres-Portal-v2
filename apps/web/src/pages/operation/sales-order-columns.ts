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
 * THE DEFAULT ROW — re-ruled to EIGHT by the owner, 2026-08-15:
 *   ☐ ▸ SO No · Ordered · Customer Delivery · Customer · Delivery Location ·
 *   Showroom · PO No · DO No
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
import { displayCustomerName } from "@/lib/customer-name";
import type { DeliveryOrderRow, operationOrderListRow } from "@/lib/queries";
import {
  digits,
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
export const NO_DATE_YET = "No delivery date";

/**
 * `Carres Kelana Jaya` → `Kelana Jaya`, for the SHOWROOM column only.
 *
 * Every showroom is ours — the column is headed `Showroom` and all four rows
 * in production read `Carres …` — so the house name distinguishes nothing here
 * and costs the place name its width: at 126px `Carres Maluri Cheras` clipped
 * to `Carres Maluri C…`, hiding the only part that identifies the branch.
 *
 * DISPLAY ONLY, and deliberately NOT applied to `Deliver To`. There the house
 * name is the whole point: `Carres Klang` sits beside `AL Sungai Buloh`, and
 * dropping it would leave `Klang` unable to say whose warehouse it is. Nothing
 * is written back, and every document keeps the outlet's real registered name.
 */
export function showroomShort(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  const tail = n.replace(/^carres\s+/i, "").trim();
  return tail || n;
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
export const MUTED_ABSENCES: ReadonlySet<string> = new Set([NOT_GIVEN, NOT_RECORDED]);

export function conciseLocality(city?: string | null, state?: string | null): string {
  const cleanCity = city?.trim() || "";
  const cleanState = state?.trim() || "";
  if (cleanCity && cleanState && cleanCity.localeCompare(cleanState, undefined, { sensitivity: "accent" }) === 0) {
    return cleanCity;
  }
  return [cleanCity, cleanState].filter(Boolean).join(", ") || NOT_GIVEN;
}

/** One register row: the order, plus every fact already resolved to a string. */
export interface RegisterRow {
  o: operationOrderListRow;
  id: string;
  so: number;
  customer: string;
  phone: string;
  items: string;
  ordered: string;
  customerDelivery: string | null;
  deliveryLocation: string;
  poNumbers: string[];
  /** Every Delivery document produced by this SO. `orders.do_number` is only
   *  the current mirror and may never hide failed, voided or rebooked DOs. */
  deliveryOrders: DeliveryOrderRow[];
  total: MoneyState;
  paid: MoneyState;
  balance: MoneyState;
  needle: string;
  phoneDigits: string;
}

export function buildRegisterRow(
  o: operationOrderListRow,
  deliveryOrders: DeliveryOrderRow[] = [],
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
    items: itemsSummary(o),
    ordered: o.placed_at,
    customerDelivery: o.delivery_date_tbd ? null : (o.delivery_date ?? null),
    deliveryLocation: conciseLocality(o.customer_address_city, o.customer_address_state),
    poNumbers: o.po_numbers ?? [],
    deliveryOrders,
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
  /** Measured ink + 16 for the kit's `px-2`; +2 more where the column may clip. */
  width: string;
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
 * THE CATALOG — the eight owner-ruled defaults in their order, everything else
 * hidden. Hidden columns are sized to their own longest live value plus the
 * kit's `px-2`, and every one of them is off by default, so none of them can
 * widen the sheet an operator did not ask to widen.
 */
export const REGISTER_FIELDS: readonly RegisterField[] = [
  /* The eight owner-ruled defaults, in their governed order. */
  { key: "so", label: "SO No", width: "85px", group: "Document", on: true,
    text: (r) => `SO-${r.so}`, sortBy: (r) => r.so },
  { key: "ordered", label: "Ordered", width: "113px", group: "Dates", on: true,
    text: (r) => fmtDate(r.ordered), sortBy: (r) => r.ordered,
    kind: "date", iso: (r) => r.ordered },
  { key: "customer_delivery", label: "Customer Delivery", width: "148px", group: "Dates", on: true,
    text: (r) => date(r.customerDelivery, NO_DATE_YET), sortBy: (r) => r.customerDelivery ?? "",
    kind: "date", iso: (r) => r.customerDelivery },
  { key: "customer", label: "Customer", width: "190px", group: "Customer", on: true,
    text: (r) => r.customer, sortBy: (r) => r.customer },
  { key: "delivery_location", label: "Delivery Location", width: "280px", group: "Customer", on: true,
    text: (r) => r.deliveryLocation },
  /* Re-ruled to EIGHT defaults, 2026-08-15 (Chai). `Showroom` READS the
     Sales-ownership fact the order already carries (`outlets.name`) — it is
     the same declaration that has always been in this catalog, promoted to a
     default. No new writer, no new query, no new fact. */
  { key: "showroom", label: "Showroom", width: "126px", group: "Sales ownership", on: true,
    text: (r) => showroomShort(r.o.outlets?.name) || NOT_RECORDED },
  { key: "po_number", label: "PO No", width: "170px", group: "Document", on: true,
    text: (r) => r.poNumbers.join(" · ") || NOT_RECORDED },
  { key: "do_number", label: "DO No", width: "150px", group: "Document", on: true,
    text: (r) =>
      r.deliveryOrders.length === 0
        ? "No delivery order yet"
        : r.deliveryOrders.length === 1
          ? r.deliveryOrders[0]!.do_number
          : `${r.deliveryOrders.length} Delivery Orders` },
  { key: "items", label: "Items", width: "300px", group: "Items",
    text: (r) => r.items },
  { key: "total", label: "Total", width: "109px", align: "right", numeric: true,
    group: "Money", text: (r) => moneyText(r.total),
    sortBy: (r) => (r.total.kind === "amount" ? r.total.value : -1),
    kind: "number", num: (r) => (r.total.kind === "amount" ? r.total.value : null),
    footerSum: (r) => amountOf(r.total) },
  /* THE CUSTOMER-MONEY WORD IS `Outstanding` (owner ruling 2026-08-15; already
     CLAUDE.md §7 — what the CUSTOMER owes HQ). The KEY stays `balance`: a
     label is presentation, an identifier is a contract, and renaming it would
     silently reset every saved column layout (01-design-tokens §0). `balance`
     remains the ruled GOODS word for short-delivery quantity elsewhere. */
  { key: "balance", label: "Outstanding", width: "125px", align: "right", numeric: true,
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
     the same fact as `Customer Delivery` (`orders.delivery_date` under the
     same tbd guard), so opening it printed one date twice under two labels —
     ONE customer date column is the law. */
  { key: "dealer", label: "Dealer", width: "160px", group: "Sales ownership",
    text: (r) => r.o.dealers?.name || NOT_RECORDED },

  /* ── DOCUMENT — the papers this order produced, and its references ──────── */
  { key: "source_ref", label: "Customer reference", width: "160px", group: "Document",
    text: (r) => (r.o.source_ref ?? []).filter(Boolean).join(" · ") || NOT_RECORDED },
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

  /* ⭐ PARITY WITH WHAT THE TILL ACTUALLY ASKS (2026-08-24).
     A salesperson fills these at SO creation and the register route already
     SELECTS them — they simply had no column, so a fact the customer was asked
     for could not be read back by the office that has to act on it. Added as
     ordinary optional columns: off by default, in the chooser like every other,
     so the owner-ruled default view is untouched. */
  { key: "race", label: "Race", width: "110px", group: "Customer",
    text: (r) => r.o.customer_race || NOT_GIVEN },
  { key: "gender", label: "Gender", width: "100px", group: "Customer",
    text: (r) => r.o.customer_gender || NOT_GIVEN },
  { key: "birthday", label: "Birthday", width: "120px", group: "Customer",
    text: (r) => r.o.customer_birthday || NOT_GIVEN },
  /* Stair carry is a DELIVERY fact, not a customer one — it sits with Floor and
     Lift, which is where the operator planning the trip looks. */
  { key: "stair_items", label: "Stair carry items", width: "140px", align: "right", numeric: true,
    group: "Delivery",
    text: (r) =>
      r.o.delivery_stair_items == null ? NOT_GIVEN : String(r.o.delivery_stair_items) },

  /* ── SOURCE — who sold it, through which door ───────────────────────────── */
  { key: "salesperson", label: "Salesperson", width: "167px", group: "Sales ownership",
    text: (r) => r.o.salespersons?.name || NOT_RECORDED },
  { key: "channel", label: "Channel", width: "112px", group: "Sales ownership",
    text: (r) => r.o.channel || NOT_RECORDED },
  { key: "source", label: "Order origin", width: "112px", group: "Sales ownership",
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
