import { goodsCategoryWordOf, type GoodsCategoryWord } from "./line-category";
import { poSupplierReplyOf, type PoDatePromise } from "./po-workspace";
import {
  resolveWarehouseSchedule,
  type WarehouseActivity,
  type WarehouseScheduleInput as WarehouseSettingsScheduleInput,
} from "./warehouse-settings";
import type { InboundArrival } from "./warehouse-inbound";
import {
  WAREHOUSE_OFF_DAYS,
  type WarehouseOutboundCard,
} from "./warehouse-outbound";
import { isWorkingDay, type IsoDate } from "./working-days";

/**
 * WAREHOUSE — ARRIVAL / PICKUP SCHEDULE, the authoritative data projection.
 *
 * This replaces the combined Monitor PRESENTATION feed, not inventory
 * ownership and not the evidence rules. It is read-only: nothing here
 * receives, loads, books, completes, or stores a second copy of a date, a
 * quantity or a status. Every field below is a fact one of the owning modules
 * already recorded, or `null`.
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────
 * `warehouseMonitorArrivalEvents` prints one line per PO — `Pending Delivery
 * Qty <n>` — from the PO's WHOLE remaining balance. That is a summary event,
 * not the product-line contract the Schedule needs, and that balance belongs
 * to the PO, never to any single proposed arrival. This module reads the
 * ARRANGEMENT instead: Receiving's own `InboundArrival` rows, whose expected
 * and received counts are already scoped to one arrangement, with the original
 * ordered lines beside them.
 *
 * ── QUANTITY UNITS ──────────────────────────────────────────────────────────
 * Every `*Qty` here counts PHYSICAL UNITS — the same thing a Carres Unit ID
 * names, and the same unit `InboundArrival.expected` and
 * `WarehouseOutboundCard.unitsRequired` already count. Never a money amount,
 * a carton, an order-line count or a percentage.
 *
 * ── UNKNOWN IS NOT ZERO ─────────────────────────────────────────────────────
 * `null` means *no owning record states this*. `0` means *a record states
 * zero*. The two never merge: a line nobody has received yet reads `0`
 * (Receiving's results say so), while a line whose receipts cannot be
 * attributed to it reads `null` (see EVIDENCE SCOPE).
 *
 * ── EVIDENCE SCOPE ──────────────────────────────────────────────────────────
 * ARRIVAL  receipts are recorded per exact UNIT (`receiving_unit_results`),
 *          and a Unit carries PO lineage but NO PO-LINE lineage — stated
 *          explicitly in `warehouse-inbound.ts`. So a per-line received count
 *          is knowable only when the line's SKU identifies it uniquely inside
 *          its own arrangement. Where two lines of one arrangement share a
 *          SKU, both read `null`; the arrangement total stays exact either way.
 * PICKUP   loading is recorded per exact Unit, so every pickup line IS one
 *          Unit and its loaded count is always known — `0` or `1`.
 *
 * ── WHAT THIS MODULE REFUSES TO INVENT ──────────────────────────────────────
 * No split-arrival engine, no combined multi-PO arrival, no proposed booking,
 * no return manufactured out of a damage result, and no record id assembled
 * from a number that is only a label. Absence is reported, never filled.
 */

// ── The contract ─────────────────────────────────────────────────────────────

export type WarehouseScheduleDirection = "arrival" | "pickup";

/**
 * `expected`   the owning module recorded an ESTIMATE — a PO `eta_date`, an
 *              arrival source's `expected_date`, a delivery `confirmed_date`.
 * `scheduled`  the owning module holds evidence of an AGREED arrangement.
 * `null`       no date at all.
 *
 * A DATE ALONE IS NOT AN AGREEMENT, which is why `scheduled` is narrow:
 * `purchase_orders.official_delivery_date` does not earn it (0428 stamps it
 * from the birth `eta_date` by trigger, so it is the original estimate wearing
 * a formal name), and neither does `ops_delivery_arrangements.confirmed_date`
 * on its own (that table keeps the partner's actual reply in its own column
 * precisely because prepared, copied, opened or sent never means confirmed).
 */
export type WarehouseScheduleDateStatus = "expected" | "scheduled";

/**
 * One ORIGINAL source line. Two lines that happen to share a category or a
 * model stay two lines: `id` is the owning record's own row identity — a
 * `purchase_order_lines.id`, an `ops_stock_items.id`, a Carres Unit ID —
 * never a SKU bucket.
 */
export interface WarehouseScheduleLine {
  id: string;
  /** The governed Catalog answer (`goodsCategoryWordOf` — recorded category,
   *  then the catalog, then the shared classifier). `null` only when the line
   *  carries no SKU to ask about. Never a supplier-name rule. */
  categoryKey: GoodsCategoryWord | null;
  modelLabel: string | null;
  /** Units this line ordered, or this line's scope requires. */
  plannedQty: number;
  /** Units received at THIS line's scope; `null` when unattributable. */
  receivedQty: number | null;
  /** Units loaded at THIS line's scope; `null` on arrivals — loading is a
   *  pickup fact and never borrows the receiving count. */
  loadedQty: number | null;
  /** Units received and recorded `damaged`. A damaged Unit IS included in
   *  `receivedQty` — it arrived — so these never sum. `null` where the line
   *  has no receipt lineage, and on every pickup line (no damage fact is
   *  recorded at loading). */
  damagedQty: number | null;
}

export interface WarehouseScheduleRelatedRecord {
  id: string;
  ref: string;
  href: string;
}

export interface WarehouseScheduleCard {
  id: string;
  direction: WarehouseScheduleDirection;
  /** The owning record's own kind, passed through verbatim rather than
   *  re-spelled: `supplier-delivery` · `transfer` · `customer-return` ·
   *  `failed-delivery-return` · `repair-return` · `supplier-replacement`
   *  (ARRIVAL, from `ArrivalSourceType`) · `customer_delivery_pickup`
   *  (PICKUP, from `DeliveryWarehouseScheduleEvent`). */
  kind: string;
  sourceId: string;
  /** The document number the source itself minted — a PO No, a Transfer No,
   *  a DO No. Never an invented interface document. */
  sourceRef: string;
  soRef: string | null;
  doRef: string | null;
  partyName: string | null;
  siteId: string | null;
  date: IsoDate | null;
  dateStatus: WarehouseScheduleDateStatus | null;
  lines: WarehouseScheduleLine[];
  /** Units the LOGISTICS side itself confirmed receiving — the counterparty's
   *  own statement, never the Warehouse's loading count. `null` on arrivals. */
  driverConfirmedQty: number | null;
  logisticsName: string | null;
  relatedRecords: WarehouseScheduleRelatedRecord[];
  /** The work destination, already filtered to this date · Site · source. */
  openHref: string | null;
  /** The read-only source document, when one has its own page. */
  detailHref: string | null;
  /** Dated in the past with physical work still owing. A card with NO date is
   *  never overdue — absence is not lateness. */
  overdue: boolean;
}

export interface WarehouseScheduleError {
  direction: WarehouseScheduleDirection;
  message: string;
}

export interface WarehouseScheduleResult {
  cards: WarehouseScheduleCard[];
  operatingDates: IsoDate[];
  loading: boolean;
  /** A failed source is reported here and its direction contributes no cards.
   *  It never empties the other direction. `cards: []` with `errors: []` is a
   *  genuine "nothing scheduled"; `cards: []` with a non-empty `errors` is a
   *  failure and must never be read as "no arrangements". */
  errors: WarehouseScheduleError[];
  /** The `from` that lands the window immediately BEFORE this one — computed
   *  here because only this layer knows the Site's operating rule. */
  previousFrom: IsoDate;
}

// ── ARRIVAL source facts ─────────────────────────────────────────────────────

/** One original ordered line of one arrival source. */
export interface WarehouseArrivalSourceLine {
  id: string;
  sku: string | null;
  qty: number;
}

/**
 * The two arrival facts `InboundArrival` does not carry: which ORIGINAL rows
 * the arrangement ordered, and whether its date stands on an agreement or an
 * estimate. Computed from rows the Inbound read already fetches, so no new
 * query, table or permission is involved.
 */
export interface WarehouseArrivalSourceFacts {
  sourceId: string;
  dateStatus: WarehouseScheduleDateStatus | null;
  lines: WarehouseArrivalSourceLine[];
}

export interface WarehouseArrivalSourceFactsInput {
  pos: ReadonlyArray<{
    id: string;
    version?: number | null;
    eta_date?: string | null;
    official_delivery_date?: string | null;
  }>;
  lines?: ReadonlyArray<{
    id?: string | null;
    po_id: string;
    sku?: string | null;
    qty: number;
  }>;
  promises?: ReadonlyArray<PoDatePromise & { po_id: string }>;
}

/**
 * A PO's date standing and its ordered lines.
 *
 * An EVIDENCED supplier reply about this exact document version is the only
 * agreement fact Purchasing keeps, and `poSupplierReplyOf` is its one
 * authority — this adds no second test of the same question.
 */
export function warehouseArrivalSourceFacts(
  input: WarehouseArrivalSourceFactsInput,
): WarehouseArrivalSourceFacts[] {
  return input.pos.map((po) => {
    const agreed = poSupplierReplyOf(
      (input.promises ?? []).filter((row) => row.po_id === po.id),
      po.version ?? 1,
    );
    const hasEstimate = Boolean(po.official_delivery_date ?? po.eta_date);
    return {
      sourceId: po.id,
      dateStatus: agreed ? "scheduled" : hasEstimate ? "expected" : null,
      lines: (input.lines ?? [])
        .filter((line) => line.po_id === po.id)
        .map((line, index) => ({
          /* A line row without its own id still keeps a STABLE identity — its
             position inside its own PO — so two same-SKU lines never collapse
             into one and the id survives a reload. */
          id: line.id ?? `${po.id}#line${index + 1}`,
          sku: line.sku ?? null,
          qty: line.qty,
        })),
    };
  });
}

// ── ARRIVAL cards ────────────────────────────────────────────────────────────

const NO_SKU_KEY = " no-sku";

/**
 * SKU → the CATALOG's own category (`product_models.category`), or `null`
 * where the catalog holds no row for that SKU. A SKU absent from the map was
 * never asked about at all — a different thing again, and the ladder's
 * `undefined` branch handles it.
 *
 * MEASURED ON PRODUCTION 2026-09-14. `goodsCategoryWordOf` is the governed
 * ladder — recorded category, then the CATALOG, then a keyword classifier —
 * and it was being called with the SKU alone, so the top two rungs were empty
 * and only the classifier ever ran. 15 of the 37 distinct SKUs on the live
 * purchasing surface rendered `Other goods` while the catalog knew exactly
 * what they were: every `5539-*` and `LYYAR-*` sofa among them.
 *
 * Those are precisely the families `line-category.ts` names in its own D9
 * note — *"adding 5539 and lyyar would clear today's twelve orders and
 * rebuild the same trap for the next model Ohana names"*. So the fix is not a
 * keyword. It is asking the authority that already knows.
 */
export type WarehouseSkuCategories = ReadonlyMap<string, string | null>;

/** The governed ladder, asked properly. Passing `category: undefined` is NOT
 *  the same as passing `null`: undefined means nobody asked (version skew),
 *  null means the catalog was asked and holds no row. `goodsCategoryWordOf`
 *  distinguishes them and this preserves that distinction rather than
 *  flattening it. */
function categoryKeyOf(
  sku: string | null | undefined,
  categories: WarehouseSkuCategories | undefined,
): GoodsCategoryWord | null {
  if (!sku) return null;
  return categories?.has(sku)
    ? goodsCategoryWordOf({ sku, category: categories.get(sku) ?? null })
    : goodsCategoryWordOf({ sku });
}

/** The Units of one arrangement, counted at one line's SKU scope. */
function unitCountsForSku(
  units: InboundArrival["units"],
  sku: string | null,
): { received: number; damaged: number } {
  let received = 0;
  let damaged = 0;
  for (const unit of units) {
    if ((unit.sku ?? null) !== sku) continue;
    if (unit.outcome !== "received" && unit.outcome !== "received_with_issue")
      continue;
    received += 1;
    /* A damaged Unit ARRIVED. It is counted in `received`, and again on its
       own here — the two answer different questions and never substitute. */
    if (unit.outcome === "received_with_issue" && unit.issue === "damaged")
      damaged += 1;
  }
  return { received, damaged };
}

function modelLabelOf(arrival: InboundArrival, sku: string | null): string | null {
  if (!sku) return null;
  return arrival.products.find((p) => p.sku === sku)?.name ?? sku;
}

function arrivalLines(
  arrival: InboundArrival,
  facts: WarehouseArrivalSourceFacts | undefined,
  categories: WarehouseSkuCategories | undefined,
): WarehouseScheduleLine[] {
  const sourceLines = facts?.lines ?? [];
  if (sourceLines.length > 0) {
    /* A SKU appearing on more than one line of the SAME arrangement cannot own
       a share of that arrangement's receipts: a Unit has PO lineage, not
       PO-LINE lineage. Those lines report `null`, not a split nobody made. */
    const skuLineCount = new Map<string, number>();
    for (const line of sourceLines) {
      const key = line.sku ?? NO_SKU_KEY;
      skuLineCount.set(key, (skuLineCount.get(key) ?? 0) + 1);
    }
    return sourceLines.map((line) => {
      const unique = (skuLineCount.get(line.sku ?? NO_SKU_KEY) ?? 0) === 1;
      const counts = unique ? unitCountsForSku(arrival.units, line.sku) : null;
      return {
        id: line.id,
        categoryKey: categoryKeyOf(line.sku, categories),
        modelLabel: modelLabelOf(arrival, line.sku),
        plannedQty: line.qty,
        receivedQty: counts ? counts.received : null,
        loadedQty: null,
        damagedQty: counts ? counts.damaged : null,
      };
    });
  }
  /* No ordered-line document — a transfer, a return, a repair. Its original
     scope rows ARE the exact Units linked to the source, so each Unit is its
     own line and keeps its own permanent identity. */
  return arrival.units.map((unit) => {
    /* `unknown` is Receiving's own word for a posted session whose results
       were never mapped. It is an absence, not a zero. */
    const unmapped = unit.outcome === "unknown";
    const received =
      unit.outcome === "received" || unit.outcome === "received_with_issue";
    return {
      id: unit.id,
      categoryKey: categoryKeyOf(unit.sku, categories),
      modelLabel: unit.product ?? unit.sku ?? null,
      plannedQty: 1,
      receivedQty: unmapped ? null : received ? 1 : 0,
      loadedQty: null,
      damagedQty: unmapped
        ? null
        : unit.outcome === "received_with_issue" && unit.issue === "damaged"
          ? 1
          : 0,
    };
  });
}

/** Receiving's own deep-link contract — exact date, governed Site ID, source
 *  type and source record. Deliberately identical to `inboundHref`. */
function arrivalOpenHref(arrival: InboundArrival): string {
  const p = new URLSearchParams({
    tab: "warehouse-inbound",
    site: arrival.siteId,
    sourceType: arrival.sourceType,
    source: arrival.sourceId,
  });
  if (arrival.date) p.set("date", arrival.date);
  return `/operation?${p}`;
}

/**
 * One card per ARRIVAL ARRANGEMENT — which is what `inboundArrivals` already
 * produces. So two POs on the same date from the same supplier stay TWO cards,
 * and one PO carrying a Sofa line and a Bedframe line stays ONE card with two
 * lines.
 *
 * `facts` is keyed by source id. An arrival with no entry still renders: its
 * lines fall back to its exact Units and its `dateStatus` stays honest.
 */
export function warehouseArrivalScheduleCards(
  arrivals: readonly InboundArrival[],
  facts: readonly WarehouseArrivalSourceFacts[],
  todayIso: IsoDate,
  categories?: WarehouseSkuCategories,
): WarehouseScheduleCard[] {
  const factsById = new Map(facts.map((f) => [f.sourceId, f]));
  return arrivals.map((arrival) => {
    const fact = factsById.get(arrival.sourceId);
    const related: WarehouseScheduleRelatedRecord[] = [];
    for (const session of arrival.sessions)
      if (session.grnNo)
        related.push({
          id: session.id,
          ref: session.grnNo,
          href: `/operation?tab=warehouse-inbound&source=${encodeURIComponent(
            arrival.sourceId,
          )}&receipt=${encodeURIComponent(session.id)}`,
        });
    return {
      id: `arrival:${arrival.id}`,
      direction: "arrival" as const,
      kind: arrival.sourceType,
      sourceId: arrival.sourceId,
      sourceRef: arrival.documentNo,
      /* `InboundArrival.so` is a NUMBER — a label Purchasing carries, not an
         order id. It names the Sales Order; it may not be built into a link. */
      soRef: arrival.so === null ? null : `SO-${arrival.so}`,
      doRef: arrival.documentWord === "DO No" ? arrival.documentNo : null,
      partyName: arrival.party,
      siteId: arrival.siteId,
      date: arrival.date,
      dateStatus: arrival.date
        ? fact
          ? fact.dateStatus
          : /* A non-PO source carries `expected_date` and no agreement record
               of any kind — an estimate is all that exists to report. */
            ("expected" as const)
        : null,
      lines: arrivalLines(arrival, fact, categories),
      driverConfirmedQty: null,
      logisticsName: null,
      relatedRecords: related,
      openHref: arrivalOpenHref(arrival),
      detailHref:
        arrival.sourceType === "supplier-delivery"
          ? `/operation/procurement/${encodeURIComponent(arrival.sourceId)}`
          : null,
      overdue: Boolean(
        arrival.date && arrival.date < todayIso && arrival.remaining > 0,
      ),
    };
  });
}

// ── PICKUP cards ─────────────────────────────────────────────────────────────

/**
 * The delivery scopes whose partner AGREEMENT is proven, keyed by
 * `warehousePickupScopeKey`.
 *
 * `ops_delivery_arrangements.reply_proof_path` is the partner's ACTUAL reply
 * on file. That table keeps it in its own column precisely because prepared,
 * copied, opened or sent never means confirmed — so `confirmed_date` alone
 * yields `expected`, and only the proof yields `scheduled`.
 */
export type WarehousePickupAgreementProofs = ReadonlySet<string>;

export function warehousePickupScopeKey(orderId: string, leg: number): string {
  return `${orderId}#leg${leg}`;
}

/** Outbound's deep-link contract — exact date, governed Site ID, exact DO. */
function pickupOpenHref(card: WarehouseOutboundCard): string {
  const p = new URLSearchParams({ tab: "warehouse-outbound" });
  if (card.eventDate) p.set("date", card.eventDate);
  const site = card.warehouseSiteId ?? card.fromLocation;
  if (site) p.set("site", site);
  p.set("do", card.doNumber);
  return `/operation?${p}`;
}

/**
 * One card per DELIVERY SCOPE — exactly the scope `warehouseOutboundCards`
 * already groups (Delivery Order + Warehouse Site, one per Journey leg). A
 * scope carrying a mattress and a sofa stays ONE card; mixed categories never
 * split it.
 *
 * `proofs` is optional. When absent, a dated scope reads `expected` and never
 * `scheduled` — an unproven agreement is not upgraded to fill a field.
 */
export function warehousePickupScheduleCards(
  cards: readonly WarehouseOutboundCard[],
  todayIso: IsoDate,
  proofs?: WarehousePickupAgreementProofs,
  categories?: WarehouseSkuCategories,
): WarehouseScheduleCard[] {
  return cards.map((card) => ({
    id: `pickup:${card.deliveryOrderId ?? card.doNumber}@${
      card.warehouseSiteId ?? card.fromLocation
    }`,
    direction: "pickup" as const,
    kind: "customer_delivery_pickup",
    sourceId: card.deliveryOrderId ?? card.doNumber,
    sourceRef: card.doNumber,
    soRef: card.source,
    doRef: card.doNumber,
    /* THE PARTY, NOT THE PLACE. The approved card gives this header the
       party name; `toCustomer` is the delivery address despite its name, so
       reading it here put "12 Walk Street, Singapore 189555" where a customer
       belongs. Null when the feed states no name — an address is not a
       fallback for a party, it is a different fact. */
    partyName: card.toCustomerName ?? null,
    siteId: card.warehouseSiteId ?? null,
    date: card.eventDate ?? null,
    dateStatus: card.eventDate
      ? proofs?.has(warehousePickupScopeKey(card.orderId, card.leg))
        ? ("scheduled" as const)
        : ("expected" as const)
      : null,
    /* Loading is recorded per exact Unit, so every Unit of the scope is its
       own line and two Units of one model stay two lines. */
    lines: card.units.map((unit) => ({
      id: unit.unitId,
      categoryKey: categoryKeyOf(unit.sku, categories),
      modelLabel: unit.productName ?? unit.sku ?? null,
      plannedQty: 1,
      receivedQty: null,
      loadedQty: unit.unitHandedOverAt ? 1 : 0,
      damagedQty: null,
    })),
    driverConfirmedQty: card.driverConfirmed,
    logisticsName: card.logisticsPartner,
    relatedRecords: [
      { id: card.orderId, ref: card.source, href: card.sourceHref },
    ],
    openHref: pickupOpenHref(card),
    detailHref: card.deliveryOrderHref,
    overdue: Boolean(
      card.eventDate && card.eventDate < todayIso && card.notHandedOver > 0,
    ),
  }));
}

// ── Ordering and operating dates ─────────────────────────────────────────────

/**
 * Dated work first, in date order; UNDATED work last but never dropped — an
 * arrangement nobody has dated is exactly the work that goes missing, so it
 * stays in the result whatever date window the screen is showing.
 */
export function sortWarehouseScheduleCards(
  cards: readonly WarehouseScheduleCard[],
): WarehouseScheduleCard[] {
  return [...cards].sort((a, b) => {
    if ((a.date === null) !== (b.date === null)) return a.date === null ? 1 : -1;
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.sourceRef.localeCompare(b.sourceRef) || a.id.localeCompare(b.id);
  });
}

/** ARRIVAL is governed by the Site's Receiving hours, PICKUP by its Collection
 *  hours — two acts performed by different parties in different directions,
 *  whose windows Settings configures separately. */
export function warehouseScheduleActivityOf(
  direction: WarehouseScheduleDirection,
): WarehouseActivity {
  return direction === "arrival" ? "receiving" : "collection";
}

export type WarehouseScheduleSettings = Omit<
  WarehouseSettingsScheduleInput,
  "date"
>;

export const WAREHOUSE_SCHEDULE_DATE_COUNT = 6;

/**
 * The operating dates of one activity.
 *
 * ── THE LADDER, AND WHY IT HAS THREE RUNGS NOT TWO ──────────────────────────
 * `resolveWarehouseSchedule` is the one configured-schedule authority and this
 * adds no second copy of it. What it returns is three-valued, and each value
 * gets its own answer:
 *
 *   open             CONFIGURATION SAYS SO — keep the date, Sunday included.
 *   closed           CONFIGURATION SAYS SO — drop it.
 *   not_configured   nobody said. Fall back to the GOVERNED WEEKLY CLOSURE.
 *
 * The third rung is the production correction of 2026-09-14. It first read
 * "keep it — nobody said is not closed", which is the right rule for the
 * SETTINGS page (Stock MASTER §11: *no day is seeded and Sunday is not assumed
 * closed*; an unconfigured day there must read `Not configured`, never
 * `Closed`). But it is the wrong rule for THIS strip, whose own worked example
 * in the same MASTER reads `Tue 1 · Wed 2 · Thu 3 · Fri 4 · Sat 5 · Mon 7 Sep`
 * — Sunday omitted — and states that the governed weekly closure is omitted.
 *
 * Production holds ZERO `warehouse_working_hours` rows, so every weekday
 * resolved `not_configured` and the strip printed `Sun 20 Sept — Fri 25 Sept`.
 * The two MASTER statements are not in conflict: one governs what SETTINGS
 * displays about a day, the other governs which days the STRIP walks. Silence
 * in the configuration does not delete an approved operating rule — it just
 * fails to override it.
 *
 * `WAREHOUSE_OFF_DAYS` is that approved closure, reused rather than re-spelled,
 * so the repository keeps ONE weekly closure and not two that currently agree.
 *
 * `settings` absent — unreadable for this role, or no Site at all — lands on
 * the same fallback, because knowing nothing is not a reason to contradict the
 * approved week either.
 */
export function warehouseScheduleOperatingDates(
  from: IsoDate,
  count: number = WAREHOUSE_SCHEDULE_DATE_COUNT,
  direction: WarehouseScheduleDirection = "arrival",
  settings?: WarehouseScheduleSettings | null,
  holidays: ReadonlySet<IsoDate> | readonly IsoDate[] = [],
): IsoDate[] {
  const activity = warehouseScheduleActivityOf(direction);
  const out: IsoDate[] = [];
  let cursor = from.slice(0, 10);
  let guard = 0;
  while (out.length < count && guard < count * 10 + 60) {
    if (operatesOn(cursor, activity, settings, holidays)) out.push(cursor);
    cursor = stepIsoDate(cursor);
    guard += 1;
  }
  return out;
}

/** The three-rung ladder above, as one decision. */
function operatesOn(
  date: IsoDate,
  activity: WarehouseActivity,
  settings: WarehouseScheduleSettings | null | undefined,
  holidays: ReadonlySet<IsoDate> | readonly IsoDate[] = [],
): boolean {
  const availability = settings
    ? resolveWarehouseSchedule({ ...settings, date })[activity].availability
    : "not_configured";
  if (availability === "open") return true;
  if (availability === "closed") return false;
  /* Nobody configured this day, so the GOVERNED calendar answers — and it has
     two halves, not one. The weekly closure was already here; the governed
     closed DATES belong beside it for the same reason, or a public holiday
     shows as a working day the moment a Site has no holiday policy saved
     (which is every Site in production today). A Site that does configure its
     own policy still overrides both, above. */
  return isWorkingDay(date, { offDays: WAREHOUSE_OFF_DAYS, holidays });
}

/**
 * The `from` that makes a window of `count` operating dates end on the
 * operating date immediately BEFORE `before`.
 *
 * WHY THIS EXISTS RATHER THAN SUBTRACTING DAYS. `Previous` first stepped back
 * by the shown window's CALENDAR span, which is only right when the preceding
 * stretch contains the same number of closed days as the current one. Measured
 * on production 2026-09-14: from `Mon 21 – Sat 26` it produced
 * `Tue 15 – Mon 21`, re-showing Mon 21, because the Sunday inside the earlier
 * stretch made six calendar days cover only five operating ones. Paging back
 * therefore repeated a column and drifted a day each press.
 *
 * Counting operating dates BACKWARDS through the same predicate the forward
 * walk uses is the only thing that cannot drift: whatever the configuration
 * closes, both directions agree about it.
 */
export function warehouseSchedulePreviousFrom(
  before: IsoDate,
  count: number = WAREHOUSE_SCHEDULE_DATE_COUNT,
  direction: WarehouseScheduleDirection = "arrival",
  settings?: WarehouseScheduleSettings | null,
  holidays: ReadonlySet<IsoDate> | readonly IsoDate[] = [],
): IsoDate {
  const activity = warehouseScheduleActivityOf(direction);
  let cursor = stepIsoDateBack(before.slice(0, 10));
  let earliest = cursor;
  let found = 0;
  let guard = 0;
  while (found < count && guard < count * 10 + 60) {
    if (operatesOn(cursor, activity, settings, holidays)) {
      found += 1;
      earliest = cursor;
    }
    if (found < count) cursor = stepIsoDateBack(cursor);
    guard += 1;
  }
  return earliest;
}

function stepIsoDateBack(iso: IsoDate): IsoDate {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(prev.getUTCDate()).padStart(2, "0")}`;
}

function stepIsoDate(iso: IsoDate): IsoDate {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(next.getUTCDate()).padStart(2, "0")}`;
}
