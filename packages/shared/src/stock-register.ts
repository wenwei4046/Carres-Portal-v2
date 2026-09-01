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

import { type UnitAvailability } from "./unit-availability";

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
  /** Read-only projection of the official Transfer, Delivery, PO or problem source. */
  nextMovementKind?: NextMovementKind | null;
  nextMovementLocation?: string | null;
  nextMovementRef?: string | null;
  moveDate?: string | null;
}

export type NextMovementKind =
  | "none"
  | "transfer"
  | "customer_delivery"
  | "supplier_arrival"
  | "problem_block";

export function nextMovementLabel(
  movement: Pick<
    StockRegisterUnit,
    "nextMovementKind" | "nextMovementLocation" | "nextMovementRef"
  >,
): string {
  const location = movement.nextMovementLocation;
  const ref = movement.nextMovementRef;
  switch (movement.nextMovementKind) {
    case "none":
      return "No movement planned";
    case "transfer":
      return location && ref ? `To ${location} · ${ref}` : "—";
    case "customer_delivery":
      return ref ? `To customer · ${ref}` : "—";
    case "supplier_arrival":
      return location && ref ? `To ${location} · ${ref}` : "—";
    case "problem_block":
      return "No movement until this problem is fixed";
    default:
      return "—";
  }
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

/** Quantity-controlled records are pieces, not one invented physical Unit. */
export function exactUnitRecords(units: StockRegisterUnit[]): StockRegisterUnit[] {
  return units.filter((unit) => unit.qty === 1);
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
export const NO_HOLDER_KEY = "__not_recorded__";
export const NO_HOLDER_LABEL = "Not recorded";

export function categoryKeyOf(u: Pick<StockRegisterUnit, "category">): string {
  return u.category ?? NO_CATALOG_KEY;
}

export function holderKeyOf(u: Pick<StockRegisterUnit, "holderPartyId">): string {
  return u.holderPartyId ?? NO_HOLDER_KEY;
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

/** Attention names observed facts held by condition or the governed hold reason. */
export const ATTENTION_REASONS = [
  "damage_reported",
  "cannot_find",
  "parts_missing",
  "returned_check",
] as const;
export type AttentionReason = (typeof ATTENTION_REASONS)[number];

export const ATTENTION_REASON_LABEL: Record<AttentionReason, string> = {
  damage_reported: "Damage reported",
  cannot_find: "Unit cannot be found",
  parts_missing: "Parts missing",
  returned_check: "Returned — check before sale",
};

export function hasAttention(u: StockRegisterUnit, reason: AttentionReason): boolean {
  const held = (u.holdReason ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (reason) {
    case "damage_reported":
      return u.condition === "damaged" || held.includes("damage");
    case "cannot_find":
      return held === "cannot_find" || held === "unit_not_found" || held === "missing_unit";
    case "parts_missing":
      return held === "parts_missing" || held === "components_missing" || held === "missing_component";
    case "returned_check":
      return held === "returned" || held === "returned_check" || held === "return_check";
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
  holder: string | null;
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
  holder: null,
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
    sel.holder !== null ||
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
  return [u.unitCode, u.sku, u.poNo, u.reservedRef, u.supplier, u.siteName, u.holderName]
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
    if (sel.holder && holderKeyOf(u) !== sel.holder) return false;
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
  let exactUnits = 0;
  let available = 0;
  let bulkOnHand = 0;
  for (const u of units) {
    if (u.qty === 1) exactUnits += 1;
    if (u.availability !== "available") continue;
    if (u.qty > 1) bulkOnHand += u.qty;
    else available += 1;
  }
  return { units: exactUnits, available, bulkOnHand };
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

/** Stock's approved screen words. The governed availability VALUE is unchanged. */
export function availabilityLabel(a: UnitAvailability): string {
  switch (a) {
    case "available":
      return "Available to sell";
    case "reserved":
      return "Reserved for customer";
    case "incoming":
      return "Ordered — not received";
    case "in_transit":
      return "On the way";
    case "not_available":
      return "Cannot sell";
    case "ended":
      return "Delivered / history";
  }
}

/** A blocked Unit names only an observed, governed reason; raw values stay hidden. */
export function stockAvailabilityLabel(unit: StockRegisterUnit): string {
  if (unit.availability !== "not_available") return availabilityLabel(unit.availability);
  const reason = ATTENTION_REASONS.find((candidate) => hasAttention(unit, candidate));
  return reason
    ? `Cannot sell — ${ATTENTION_REASON_LABEL[reason]}`
    : "Cannot sell — reason not recorded";
}
