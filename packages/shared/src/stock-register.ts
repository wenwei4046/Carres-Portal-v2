/**
 * THE STOCK REGISTER — the one current listing of controlled Units.
 * CARD-2026-08-20-stock-register · Stock MASTER §7 · UI MASTER §6.7.
 *
 * PURE. No I/O and no clock of its own: every function needing "now" is handed
 * one, so the browser, the API and the tests can never disagree about what
 * "this week" meant.
 *
 * ── WHAT THIS FILE IS NOT ───────────────────────────────────────────────────
 * It does not compute availability. `unitAvailability()` (0366) is the ONE
 * arithmetic and this file only READS the answer it already produced. Nothing
 * here looks at `status`, `needsRepair` or a stored total to decide whether
 * goods can be offered — that is the exact defect the Unit Authority card
 * exists to remove (Architecture Law D).
 */

import {
  UNIT_AVAILABILITY_LABEL,
  type UnitAvailability,
} from "./unit-availability";

/** One row of `public.stock_unit_register_v` (migration 0373), camel-cased. */
export interface StockRegisterUnit {
  id: string;
  unitCode: string;
  sku: string;
  /** The CATALOG's answer, or null when the catalog holds no row for this SKU.
   *  Never derived from SKU text (D9, ERP-ARCHITECTURE §3.1). */
  category: string | null;
  warehouseId: string | null;
  siteName: string | null;
  holderPartyId: string | null;
  holderName: string | null;
  ownership: string;
  supplier: string | null;
  poNo: string | null;
  status: string;
  condition: string;
  needsRepair: boolean;
  holdReason: string | null;
  reservedRef: string | null;
  soldOrderId: string | null;
  qty: number;
  dateIn: string | null;
  lastVerifiedAt: string | null;
  availability: UnitAvailability;
  lifecycleOutcome: string;
  /** Last PHYSICAL event (0373). null = this Unit has not moved since the
   *  lineage ledger began — an honest fact, not a missing one. */
  lastEventAt: string | null;
  lastEvent: string | null;
  /** Read-only facts joined from Catalog, Purchasing and Sales Order. */
  productName?: string | null;
  poDate?: string | null;
  soDate?: string | null;
  expectedArrival?: string | null;
  purchasePurpose?: string | null;
}

/**
 * THE DEFAULT VIEW IS CURRENT UNITS.
 *
 * Card §1: "Delivered and ended Units are accessible through Delivered / history
 * and exact-ID search, not mixed into the default current view." A register that
 * silently mixes a delivered sofa into today's shelf teaches the operator that
 * the list cannot be trusted.
 */
export function isCurrentUnit(u: Pick<StockRegisterUnit, "availability">): boolean {
  return u.availability !== "ended";
}

// ---------------------------------------------------------------------------
// The honest no-catalog bucket
// ---------------------------------------------------------------------------

/**
 * A Unit whose SKU the Catalog does not hold — 87 of 136 records, measured on
 * production 2026-08-21.
 *
 * It is NOT a category and never folds into Accessory: *we do not know what this
 * is* is a different fact from *this is an accessory*. Card §3 admits the bucket
 * only "when Catalog was actually queried", which is why it keys off an explicit
 * null rather than a missing field.
 */
export const NO_CATALOG_KEY = "__none__";
export const NO_CATALOG_LABEL = "Not in catalog";

export function categoryKeyOf(u: Pick<StockRegisterUnit, "category">): string {
  return u.category ?? NO_CATALOG_KEY;
}

// ---------------------------------------------------------------------------
// Changed — a PHYSICAL event, inside a period
// ---------------------------------------------------------------------------

export const CHANGED_SCOPES = ["today", "week", "month"] as const;
export type ChangedScope = (typeof CHANGED_SCOPES)[number];

export const CHANGED_SCOPE_LABEL: Record<ChangedScope, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
};

/**
 * Did this Unit physically change inside the scope?
 *
 * Card §3 is exact about what counts: "at least one Warehouse physical event in
 * the chosen period, not viewed, edited copy, financial note or another module's
 * unrelated update." So this reads `lastEventAt` — the append-only lineage — and
 * never `updatedAt`, which moves for writes that are not physical facts.
 *
 * `now` is a parameter because a filter that reads the clock cannot be tested,
 * and because the operator's "today" is the browser's, not the server's.
 */
export function changedWithin(
  u: Pick<StockRegisterUnit, "lastEventAt">,
  scope: ChangedScope,
  now: Date,
): boolean {
  if (!u.lastEventAt) return false;
  const at = new Date(u.lastEventAt);
  if (Number.isNaN(at.getTime())) return false;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (scope === "week") {
    // Monday-first, matching the production calendar (Stock MASTER §8).
    const dow = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dow);
  } else if (scope === "month") {
    start.setDate(1);
  }
  return at.getTime() >= start.getTime();
}

// ---------------------------------------------------------------------------
// Attention — only reasons whose FACT exists
// ---------------------------------------------------------------------------

/**
 * ⚠ MEASURED ON PRODUCTION 2026-08-21, AND THE MEASUREMENT DECIDED THIS LIST.
 *
 * Card §3 names nine Attention reasons: waiting inspection · cannot find · Unit
 * ID issue · Site differs · damaged · components missing · returned not checked ·
 * evidence incomplete · not recently verified.
 *
 * FIVE have no fact to read. There is no "cannot find" flag, no components
 * manifest, no evidence-completeness fact, no Unit-ID-issue record, and only one
 * Site exists so nothing can differ from it. A chip reading a column nobody
 * writes puts a number on screen that means nothing — worse than its absence.
 *
 * TWO more are measurable but flag EVERYTHING, which is the same as flagging
 * nothing:
 *   last_verified_at IS NULL   136 of 136 — the column shipped hours earlier
 *   holder_party_id  IS NULL   136 of 136 — no door populates it yet
 *
 * So the built list is the reasons that are both REAL and DISCRIMINATING today.
 * The other seven are recorded as an explicit gap in docs/stock/MASTER.md, with
 * the fact each one waits for, rather than drawn as controls that cannot tell an
 * operator anything.
 */
export const ATTENTION_REASONS = [
  "on_hold",
  "in_repair",
  "damaged",
  "no_source",
] as const;
export type AttentionReason = (typeof ATTENTION_REASONS)[number];

export const ATTENTION_REASON_LABEL: Record<AttentionReason, string> = {
  on_hold: "Waiting inspection",
  in_repair: "In repair",
  damaged: "Damaged",
  no_source: "No purchase order",
};

export function hasAttention(u: StockRegisterUnit, reason: AttentionReason): boolean {
  switch (reason) {
    case "on_hold":
      return u.holdReason != null;
    case "in_repair":
      return u.needsRepair;
    case "damaged":
      return u.condition === "damaged";
    case "no_source":
      return !u.poNo;
  }
}

// ---------------------------------------------------------------------------
// The rail selection, and how the sections combine
// ---------------------------------------------------------------------------

/**
 * Card §3: "One selection applies within a section... Choices across sections
 * combine. All stock clears every filter."
 */
export interface StockRailSelection {
  attention: AttentionReason | null;
  availability: UnitAvailability | null;
  site: string | null;
  ownership: string | null;
  category: string | null;
  changed: ChangedScope | null;
  /** Register Search — Card §4: Unit ID · product/SKU · source PO · SO · supplier. */
  query: string;
  /** Delivered / history is a DESTINATION, not a filter (Card §1). */
  showEnded: boolean;
}

export const EMPTY_RAIL_SELECTION: StockRailSelection = {
  attention: null,
  availability: null,
  site: null,
  ownership: null,
  category: null,
  changed: null,
  query: "",
  showEnded: false,
};

export function isRailFiltered(sel: StockRailSelection): boolean {
  return (
    sel.attention !== null ||
    sel.availability !== null ||
    sel.site !== null ||
    sel.ownership !== null ||
    sel.category !== null ||
    sel.changed !== null ||
    sel.query.trim() !== "" ||
    sel.showEnded
  );
}

/** Card §4 — what exact-ID and text search actually looks at. */
export function matchesRegisterQuery(u: StockRegisterUnit, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (q === "") return true;
  return [u.unitCode, u.productName, u.sku, u.poNo, u.reservedRef, u.supplier, u.siteName]
    .filter(Boolean)
    .some((v) => (v as string).toLowerCase().includes(q));
}

export function applyRailSelection(
  units: StockRegisterUnit[],
  sel: StockRailSelection,
  now: Date,
): StockRegisterUnit[] {
  const exact = sel.query.trim().toLowerCase();
  return units.filter((u) => {
    // Ended Units leave the default view but stay findable by EXACT ID —
    // searching a delivered Unit's code must still open it (Card §6).
    if (!sel.showEnded && !isCurrentUnit(u)) {
      if (exact === "" || u.unitCode.toLowerCase() !== exact) return false;
    }
    if (sel.attention && !hasAttention(u, sel.attention)) return false;
    if (sel.availability && u.availability !== sel.availability) return false;
    if (sel.site && u.warehouseId !== sel.site) return false;
    if (sel.ownership && u.ownership !== sel.ownership) return false;
    if (sel.category && categoryKeyOf(u) !== sel.category) return false;
    if (sel.changed && !changedWithin(u, sel.changed, now)) return false;
    return matchesRegisterQuery(u, sel.query);
  });
}

// ---------------------------------------------------------------------------
// The footer summary — two numbers, because there are two facts
// ---------------------------------------------------------------------------

export interface StockRegisterTotals {
  units: number;
  /** Exact Units a Sales Order can BIND right now. */
  available: number;
  /** Real pieces in a qty > 1 record — present, but nameable by no promise. */
  bulkOnHand: number;
}

/**
 * UI MASTER §6.7 forbids a KPI strip above the table; the 32px status footer
 * carries the summary. It carries BOTH numbers on purpose.
 *
 * `available` counts exact Units; `bulkOnHand` counts pieces that are really on
 * the floor and really cannot be promised to one customer, because
 * `ops_stock_items_bulk_never_reserved` (0366) forbids a qty > 1 record from
 * ever being reserved. Measured on production: 85 bindable against 893 bulk
 * pieces. Printing one number would either hide 893 real pillows or promise 893
 * that no Sales Order can name — so the Register prints two, and the gap is
 * visible to Jess instead of buried.
 */
export function summariseRegister(units: StockRegisterUnit[]): StockRegisterTotals {
  let available = 0;
  let bulkOnHand = 0;
  for (const u of units) {
    if (u.availability !== "available") continue;
    if (u.qty > 1) bulkOnHand += u.qty;
    else available += 1;
  }
  return { units: units.length, available, bulkOnHand };
}

/** The one sentence the footer prints. Plural-correct, never a bare count. */
export function registerSummaryLine(t: StockRegisterTotals, ofTotal: number): string {
  const head =
    t.units === ofTotal
      ? `${t.units} ${t.units === 1 ? "Unit" : "Units"}`
      : `${t.units} of ${ofTotal} Units`;
  const promise = `${t.available} you can promise`;
  return t.bulkOnHand > 0
    ? `${head} · ${promise} · ${t.bulkOnHand} pieces you cannot`
    : `${head} · ${promise}`;
}

/** Availability label for the rail and the column. The VALUE stays `reserved`;
 *  `Reserved / sold` is the operator's word and lives only at this boundary
 *  (owner ruling 2026-08-20). */
export function availabilityLabel(a: UnitAvailability): string {
  return UNIT_AVAILABILITY_LABEL[a];
}
