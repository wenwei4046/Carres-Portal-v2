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
  /* ── SO-5's five defaults ────────────────────────────────────────────────
   * `Value` left the default row on the owner's SO-5 card and lives in the
   * chooser under Money. The Customer cell is the NAME ALONE, one line — the
   * phone is its own optional column, the global search still matches it, and
   * the panel header says it out loud. */
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

/** The two the card pins: SO No + Customer keep every row named. */
export const FROZEN_COLUMNS = 2;

export const FIELD_GROUPS: readonly FieldGroup[] = [
  "Order",
  "Customer",
  "Money",
  "Dates",
];

export function fieldByKey(key: string): RegisterField | undefined {
  return REGISTER_FIELDS.find((f) => f.key === key);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * SO-4 · THE ▼'S FILTER MODEL — 2990's four shapes, ported not invented
 * (`2990s/apps/backend/src/components/DataGrid.tsx:344-460`, shipped and
 * measured). One column may carry any of: a VALUE set, a date PRESET, a date
 * RANGE, a NUMBER range — and they AND together, exactly as 2990 applies them.
 * ──────────────────────────────────────────────────────────────────────────── */

export type DatePreset =
  | "today"
  | "tomorrow"
  | "thisWeek"
  | "thisMonth"
  | "lastMonth"
  | "overdue";

/** 2990's own six, words and order (`DataGrid.tsx:234-241`). */
export const DATE_PRESETS: readonly { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "thisWeek", label: "This week" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "overdue", label: "Overdue" },
];

/**
 * 2990's preset matcher verbatim (`DataGrid.tsx:242-268`): evaluated in MYT
 * (UTC+8) — a Date shifted by +8h has its UTC fields equal to the MYT wall
 * clock, so date-only math via the getUTC family is correct. Monday opens the
 * week, as it does on every calendar this portal draws.
 */
export function dateMatchesPreset(
  iso: string | null | undefined,
  preset: DatePreset,
  now: number = Date.now(),
): boolean {
  if (!iso) return false;
  const d = String(iso).slice(0, 10);
  if (d.length < 10) return false;
  const nowMyt = new Date(now + 8 * 3600 * 1000);
  const today = nowMyt.toISOString().slice(0, 10);
  switch (preset) {
    case "today":
      return d === today;
    case "overdue":
      return d < today;
    case "tomorrow": {
      const t = new Date(nowMyt);
      t.setUTCDate(t.getUTCDate() + 1);
      return d === t.toISOString().slice(0, 10);
    }
    case "thisWeek": {
      const dow = (nowMyt.getUTCDay() + 6) % 7; // 0 = Monday
      const mon = new Date(nowMyt);
      mon.setUTCDate(mon.getUTCDate() - dow);
      const sun = new Date(mon);
      sun.setUTCDate(sun.getUTCDate() + 6);
      return d >= mon.toISOString().slice(0, 10) && d <= sun.toISOString().slice(0, 10);
    }
    case "thisMonth":
      return d.slice(0, 7) === today.slice(0, 7);
    case "lastMonth": {
      const lm = new Date(nowMyt);
      lm.setUTCDate(1);
      lm.setUTCMonth(lm.getUTCMonth() - 1);
      return d.slice(0, 7) === lm.toISOString().slice(0, 7);
    }
  }
}

/** One column's whole ▼ state. Every member absent = the column is not narrowing. */
export interface ColumnFilterState {
  /** The checklist: values the row's `text` must be among. Empty set = off. */
  values?: ReadonlySet<string>;
  /** A date column's lit preset. */
  preset?: DatePreset;
  /** A date column's custom pair — either bound alone is a half-open range. */
  from?: string;
  to?: string;
  /** A number column's bounds, as typed — '' / non-numeric = that bound is off. */
  min?: string;
  max?: string;
}

/** Whether one column's state narrows anything at all. */
export function filterIsActive(f: ColumnFilterState | undefined): boolean {
  if (!f) return false;
  return (
    (f.values != null && f.values.size > 0) ||
    f.preset != null ||
    !!f.from ||
    !!f.to ||
    numeric(f.min) != null ||
    numeric(f.max) != null
  );
}

const numeric = (s: string | undefined): number | null => {
  if (s == null || s.trim() === "") return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
};

/**
 * Every column's ▼, applied — 2990's `filteredRows` walk, against THIS
 * catalog's own raw accessors. A values filter matches the SAME string the
 * cell prints; a date filter reads `iso`; a number filter reads `num` and a
 * row with no figure is excluded, exactly as 2990 excludes a NaN.
 */
export function passesColumnFilters(
  row: RegisterRow,
  filters: ReadonlyMap<string, ColumnFilterState>,
  now: number = Date.now(),
): boolean {
  for (const [key, f] of filters) {
    const field = fieldByKey(key);
    if (!field) continue;
    if (f.values != null && f.values.size > 0 && !f.values.has(field.text(row))) return false;
    if (f.preset != null && !dateMatchesPreset(field.iso?.(row), f.preset, now)) return false;
    if (f.from || f.to) {
      const d = (field.iso?.(row) ?? "").slice(0, 10);
      if (!d) return false;
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
    }
    const min = numeric(f.min);
    const max = numeric(f.max);
    if (min != null || max != null) {
      const n = field.num?.(row) ?? null;
      if (n == null) return false;
      if (min != null && n < min) return false;
      if (max != null && n > max) return false;
    }
  }
  return true;
}

/**
 * What one active ▼ says on its chip — Gmail's shape: the column's word, then
 * the narrowing in the fewest characters that still name it. A values set
 * names its first pick and counts the rest (`Customer: Umi +2`).
 */
export function filterChipText(field: RegisterField, f: ColumnFilterState): string {
  const parts: string[] = [];
  if (f.values != null && f.values.size > 0) {
    const [first] = [...f.values].sort((a, b) => a.localeCompare(b));
    parts.push(f.values.size === 1 ? String(first) : `${first} +${f.values.size - 1}`);
  }
  if (f.preset != null) {
    parts.push(DATE_PRESETS.find((p) => p.value === f.preset)?.label ?? f.preset);
  }
  if (f.from || f.to) {
    if (f.from && f.to) parts.push(`${fmtDate(f.from)} – ${fmtDate(f.to)}`);
    else if (f.from) parts.push(`${fmtDate(f.from)} onwards`);
    else parts.push(`up to ${fmtDate(f.to!)}`);
  }
  const min = numeric(f.min);
  const max = numeric(f.max);
  if (min != null && max != null) parts.push(`${min} – ${max}`);
  else if (min != null) parts.push(`${min} and above`);
  else if (max != null) parts.push(`up to ${max}`);
  return `${field.label}: ${parts.join(" · ")}`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * SO-5 · FILTER STATE LIVES ON THE URL — a narrowed register is a SHAREABLE
 * VIEW. One param per narrowing column, `f_<key>`, so a pasted link re-opens
 * exactly this view and Back releases the last ▼. Segments are `;`-joined,
 * checklist values `|`-joined and URI-encoded, because a customer's name may
 * carry either separator.
 * ──────────────────────────────────────────────────────────────────────────── */

const FILTER_PARAM_PREFIX = "f_";

/** One column's ▼ state as one URL param value. `null` = nothing to say. */
export function filterToParam(f: ColumnFilterState): string | null {
  const parts: string[] = [];
  if (f.values != null && f.values.size > 0) {
    parts.push(`v:${[...f.values].sort().map(encodeURIComponent).join("|")}`);
  }
  if (f.preset != null) parts.push(`p:${f.preset}`);
  if (f.from) parts.push(`from:${f.from}`);
  if (f.to) parts.push(`to:${f.to}`);
  if (f.min != null && f.min.trim() !== "") parts.push(`min:${encodeURIComponent(f.min)}`);
  if (f.max != null && f.max.trim() !== "") parts.push(`max:${encodeURIComponent(f.max)}`);
  return parts.length > 0 ? parts.join(";") : null;
}

/** The reverse walk. Unknown segments are dropped, never thrown on. */
export function filterFromParam(value: string): ColumnFilterState {
  const f: ColumnFilterState = {};
  for (const part of value.split(";")) {
    const at = part.indexOf(":");
    if (at < 0) continue;
    const kind = part.slice(0, at);
    const rest = part.slice(at + 1);
    if (kind === "v" && rest) {
      f.values = new Set(rest.split("|").map(decodeURIComponent));
    } else if (kind === "p" && DATE_PRESETS.some((p) => p.value === rest)) {
      f.preset = rest as DatePreset;
    } else if (kind === "from" && rest) f.from = rest;
    else if (kind === "to" && rest) f.to = rest;
    else if (kind === "min" && rest) f.min = decodeURIComponent(rest);
    else if (kind === "max" && rest) f.max = decodeURIComponent(rest);
  }
  return f;
}

/** Every active ▼ written onto `params`; every stale `f_*` param removed. */
export function writeFiltersToParams(
  filters: ReadonlyMap<string, ColumnFilterState>,
  params: URLSearchParams,
): void {
  for (const key of [...params.keys()]) {
    if (key.startsWith(FILTER_PARAM_PREFIX)) params.delete(key);
  }
  for (const [key, f] of filters) {
    if (!fieldByKey(key)) continue;
    const value = filterToParam(f);
    if (value != null) params.set(FILTER_PARAM_PREFIX + key, value);
  }
}

/** The URL's `f_*` params as filter state. Unknown columns are dropped. */
export function readFiltersFromParams(
  params: URLSearchParams,
): Map<string, ColumnFilterState> {
  const out = new Map<string, ColumnFilterState>();
  for (const [key, value] of params) {
    if (!key.startsWith(FILTER_PARAM_PREFIX)) continue;
    const column = key.slice(FILTER_PARAM_PREFIX.length);
    if (!fieldByKey(column)) continue;
    const f = filterFromParam(value);
    if (filterIsActive(f)) out.set(column, f);
  }
  return out;
}

/**
 * SO-5 — the chooser is REMEMBERED per user (*"auto-remember; NOT a layout
 * manager"*). What was stored is never trusted as-is: unknown keys are
 * dropped (a column that left the catalog must not crash the register that
 * remembered it), order is the CATALOG's, and an empty result falls back to
 * the defaults — a register with zero columns is not a view anyone asked for.
 */
export function sanitizeShownColumns(stored: unknown): readonly string[] {
  if (!Array.isArray(stored)) return DEFAULT_COLUMNS;
  const wanted = new Set(stored.filter((k): k is string => typeof k === "string"));
  const known = REGISTER_FIELDS.filter((f) => wanted.has(f.key)).map((f) => f.key);
  return known.length > 0 ? known : DEFAULT_COLUMNS;
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
