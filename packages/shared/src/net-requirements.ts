/**
 * Net-requirements engine — the heart of the Purchase / Procurement MRP.
 *
 * Pure, deterministic, no I/O. Given live customer demand + current supply
 * (open POs, optional ready stock) + per-line lead times, it answers:
 *   1. Per SKU  — how much MORE to order (netted, never double-orders).
 *   2. Per delivery bundle — the raise-by date + urgency + a one-trip promise.
 *
 * LOCKED decisions (Jess, 2026-07-21 — see memory `project-purchase-mrp`):
 *
 * - Make-to-order (sofa / bedframe / mattress) is ORDER-DRIVEN. We do NOT
 *   auto-consume ready stock, because goods are labelled per-order and floating
 *   them without a WMS/scan confuses goods-in/out. So free stock is netted ONLY
 *   when `consumeFreeStock` is explicitly on (reserved for a future NETS WMS);
 *   by default it is reported as advisory-only for the urgent-rescue lever.
 * - Open POs ARE netted (a batch cut on Monday must not be re-cut on Wednesday).
 * - Bed-set delivery coupling: a customer's mattress + bedframe ship in ONE trip.
 *   Their lines form one delivery BUNDLE whose raise-by = deadline − MAX(leads)
 *   (the slower item gates), cut on the same review cycle. Sofa is its OWN
 *   bundle / own PO / own trip.
 * - Lead is `working days` (Mon–Sat, MY holidays) resolved by the CALLER
 *   (normal vs a supplier-confirmed peak — the engine never auto-pads for peak).
 *   buffer 0: report the shortest credible date.
 * - Ordering cadence = fixed per-supplier review days (e.g. Mon/Wed/Fri) with an
 *   urgent off-cycle expedite; the engine buckets each bundle accordingly.
 */

import type { ProductCategory } from "./db-types";
import {
  type IsoDate,
  type WorkingDayOptions,
  subtractWorkingDays,
  addWorkingDays,
  isWorkingDay,
} from "./working-days";

// ── Inputs ──────────────────────────────────────────────────────────────────

/** One customer-demand row: an order_line already resolved to catalog facts. */
export interface DemandLine {
  /** order_line id — unique across the whole input. */
  lineId: string;
  orderId: string;
  sku: string;
  category: ProductCategory;
  supplierId: string;
  qty: number;
  /** Customer delivery deadline, or `null` when TBD. */
  deadline: IsoDate | null;
  /** Effective lead in WORKING days (caller resolves normal vs peak). */
  leadDays: number;
  /** Order placed-at date — greedy-allocation tiebreak within one deadline. */
  placedAt: IsoDate;
  /** proceed_order = committed; place = pipeline. Carried through for the radar. */
  committed: boolean;
  /**
   * The supplier's non-working weekdays for THIS line's make leg (0=Sun…6=Sat).
   * e.g. Nice Future (5-day) = [0,6]; Ohana (6-day) = [0]. Falls back to
   * `options.offDays` when omitted. Lets a bed-set span two suppliers with
   * different work weeks (each leg counts its own; the bundle takes the earliest).
   */
  offDays?: readonly number[];
  /**
   * WORKING days between the factory FINISHING and the goods reaching Carres,
   * counted on the OFFICE week (`options.offDays`) — moving the goods is
   * arranged by us, not by the factory (Law 2A). This is the same
   * `purchasing_supplier_settings.transit_days` the forward arithmetic
   * (`expectedArrivalOf`) already adds, so the backward walk here and the
   * `eta_date` a PO is born with are finally ONE arithmetic (Law D).
   *
   * `undefined` / `null` = nobody has set a number for this supplier. The leg
   * is then OMITTED, never guessed — a transit number nobody chose would be a
   * date the register would paint as a measurement (P1). Omitting it is
   * exactly the pre-2026-09-09 behaviour, so a caller that does not supply
   * this field is unchanged, byte for byte.
   */
  transitDays?: number | null;
}

export interface NetRequirementsSupply {
  /** Remaining qty on OPEN purchase orders, per SKU (`qty − received_qty`). */
  openPoBySku?: ReadonlyMap<string, number> | Record<string, number>;
  /** FREE (unreserved) ready stock per SKU (`qty − reserved`, Klg only). */
  freeStockBySku?: ReadonlyMap<string, number> | Record<string, number>;
}

export interface NetRequirementsOptions extends WorkingDayOptions {
  /** Anchor "now" — every raise-by / urgency reads from this. Required. */
  today: IsoDate;
  /**
   * Consume FREE stock as a supply pool (before open POs). Default `false`:
   * make-to-order never auto-eats labelled stock without a WMS. Turn on only
   * for a scan-controlled warehouse.
   */
  consumeFreeStock?: boolean;
  /**
   * Per-supplier review weekdays (0=Sun … 6=Sat), e.g. Mon/Wed/Fri = [1,3,5].
   * A supplier missing here is treated as per-order (order the day raise-by
   * hits — sofa's mode).
   */
  reviewDaysBySupplier?:
    | ReadonlyMap<string, readonly number[]>
    | Record<string, readonly number[]>;
  /**
   * Which delivery bundle a category joins WITHIN one order. Return a group
   * name to co-bundle (default: mattress + bedframe → `"bedset"`), or `null`
   * for its own per-line bundle (default: sofa & everything else).
   */
  bundleGroupOf?: (category: ProductCategory) => string | null;
  /**
   * Working days the stock must ARRIVE before the customer deadline (Jess: the
   * editable arrival buffer, default 7 in prod; leaves time to arrange delivery
   * / assign logistic / PayHold). Counted on the delivery-side week (`offDays`).
   * Default 0 = arrive-on-deadline (back-compat: raise-by = deadline − lead).
   */
  arrivalBufferDays?: number;
}

// ── Outputs ─────────────────────────────────────────────────────────────────

export type UrgencyBucket =
  | "covered" // fully on open PO / consumed stock — no new PO
  | "late" // raise-by already passed — order immediately
  | "urgent" // can't wait for the next scheduled review — expedite off-cycle today
  | "due" // order in the next scheduled review batch
  | "scheduled" // has a deadline, but not needed until a later cycle
  | "no_deadline"; // needs a PO but the deadline is TBD

export interface DemandLineResult {
  line: DemandLine;
  coveredByFreeStock: number;
  coveredByOpenPo: number;
  /** Residual that needs a NEW purchase order. */
  toOrder: number;
  /** Total FREE stock for this SKU (advisory — the urgent-rescue lever). */
  freeStockAvailable: number;
}

export interface SkuRequirement {
  sku: string;
  category: ProductCategory;
  supplierId: string;
  totalDemand: number;
  coveredByFreeStock: number;
  coveredByOpenPo: number;
  /** Net quantity to place on new POs for this SKU. */
  toOrder: number;
  /** Advisory FREE stock (not netted unless `consumeFreeStock`). */
  freeStock: number;
}

export interface BundleRequirement {
  /** Stable key: `${orderId}::${group}` or `${orderId}::line::${lineId}`. */
  bundleKey: string;
  orderId: string;
  /** `"bedset"`, or the sole line's category for own-bundle lines. */
  group: string;
  lineIds: string[];
  supplierIds: string[];
  /** Most-constraining member deadline, or `null` when every member is TBD. */
  deadline: IsoDate | null;
  /** Longest member lead — the slower item gates a one-trip delivery. */
  maxLeadDays: number;
  /**
   * **Stock Ready** — `deadline − arrivalBufferDays` (delivery-side working
   * days): the day the goods must be in for the delivery to be arranged in
   * time. `raiseBy` is measured back from it through the transit leg and then
   * the production leg, so the two can never disagree, and it is the ONE
   * source To Order reads (Loo, 2026-07-30 — the
   * naming freeze: Stock Ready is Carres' own requirement, never a supplier's
   * promise, which is `purchase_orders.expected_ready_date`).
   *
   * `null` when the deadline is TBD. It used to be a local variable here and
   * was thrown away, which is why nothing downstream could show it.
   */
  arriveBy: IsoDate | null;
  /**
   * arriveBy − transit − production (each on its own calendar). `null` when
   * the deadline is TBD. A planned date, never an unlock date.
   */
  raiseBy: IsoDate | null;
  /** One-trip ARRIVAL if the PO is cut today = today + production + transit. */
  promiseIfOrderedToday: IsoDate;
  /** Sum of member `toOrder` — 0 means fully covered. */
  toOrder: number;
  urgency: UrgencyBucket;
}

export interface NetRequirementsResult {
  bySku: SkuRequirement[];
  bundles: BundleRequirement[];
  lines: DemandLineResult[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function asMap<V>(
  m: ReadonlyMap<string, V> | Record<string, V> | undefined,
): ReadonlyMap<string, V> {
  if (!m) return new Map();
  if (m instanceof Map) return m;
  return new Map(Object.entries(m as Record<string, V>));
}

/** Day of week 0=Sun … 6=Sat, via a UTC anchor (no timezone math). */
function weekdayOf(iso: IsoDate): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function stepDay(iso: IsoDate, dir: 1 | -1): IsoDate {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dir));
  const yy = dt.getUTCFullYear();
  const mm = dt.getUTCMonth() + 1;
  const dd = dt.getUTCDate();
  return `${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * Smallest date `>= from` that is a review day (weekday ∈ reviewDays) AND a
 * working day. `strictAfter` starts the search one day later. When
 * `reviewDays` is empty the supplier is per-order → the next working day.
 */
function nextReviewDate(
  from: IsoDate,
  reviewDays: readonly number[],
  opts: WorkingDayOptions,
  strictAfter = false,
): IsoDate {
  let cur = strictAfter ? stepDay(from.slice(0, 10), 1) : from.slice(0, 10);
  // Bounded scan (a review must exist within a fortnight of working days).
  for (let i = 0; i < 60; i++) {
    const isReviewWeekday =
      reviewDays.length === 0 || reviewDays.includes(weekdayOf(cur));
    if (isReviewWeekday && isWorkingDay(cur, opts)) return cur;
    cur = stepDay(cur, 1);
  }
  return cur;
}

/**
 * Bucket a raise-by against today + the supplier's review cadence.
 *   raiseBy < today                 → late
 *   today ≤ raiseBy < nextReview     → urgent  (can't wait for the scheduled review)
 *   nextReview ≤ raiseBy < 2ndReview → due     (goes in the next review batch)
 *   raiseBy ≥ 2ndReview             → scheduled
 */
function bucketFor(
  raiseBy: IsoDate,
  today: IsoDate,
  reviewDays: readonly number[],
  opts: WorkingDayOptions,
): Exclude<UrgencyBucket, "covered" | "no_deadline"> {
  const t = today.slice(0, 10);
  const rb = raiseBy.slice(0, 10);
  if (rb < t) return "late";
  const nextReview = nextReviewDate(t, reviewDays, opts);
  if (rb < nextReview) return "urgent";
  const secondReview = nextReviewDate(nextReview, reviewDays, opts, true);
  if (rb < secondReview) return "due";
  return "scheduled";
}

const DEFAULT_BUNDLE_GROUP = (c: ProductCategory): string | null =>
  c === "mattress" || c === "bedframe" ? "bedset" : null;

// ── Engine ────────────────────────────────────────────────────────────────

/**
 * Compute net requirements over live demand. Pure — pass `today` explicitly.
 */
export function computeNetRequirements(
  demand: readonly DemandLine[],
  supply: NetRequirementsSupply = {},
  options: NetRequirementsOptions,
): NetRequirementsResult {
  const today = options.today.slice(0, 10);
  const wdOpts: WorkingDayOptions = {
    holidays: options.holidays,
    offDays: options.offDays,
  };
  const consumeFree = options.consumeFreeStock ?? false;
  const bundleGroupOf = options.bundleGroupOf ?? DEFAULT_BUNDLE_GROUP;
  const reviewDaysBySupplier = asMap<readonly number[]>(
    options.reviewDaysBySupplier,
  );
  const openPo = asMap<number>(supply.openPoBySku);
  const freeStock = asMap<number>(supply.freeStockBySku);

  // Mutable supply pools drained by greedy allocation, per SKU.
  const freePool = new Map<string, number>();
  const poPool = new Map<string, number>();
  for (const s of new Set([...openPo.keys(), ...freeStock.keys(), ...demand.map((d) => d.sku)])) {
    freePool.set(s, Math.max(0, freeStock.get(s) ?? 0));
    poPool.set(s, Math.max(0, openPo.get(s) ?? 0));
  }

  // Greedy allocation: earliest deadline first, TBD last, then earliest placed.
  const ordered = [...demand].sort((a, b) => {
    const ad = a.deadline ?? "9999-12-31";
    const bd = b.deadline ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.placedAt < b.placedAt ? -1 : a.placedAt > b.placedAt ? 1 : 0;
  });

  const lineResults = new Map<string, DemandLineResult>();
  for (const line of ordered) {
    let remaining = Math.max(0, line.qty);
    let fromFree = 0;
    let fromPo = 0;
    if (consumeFree) {
      const avail = freePool.get(line.sku) ?? 0;
      fromFree = Math.min(remaining, avail);
      freePool.set(line.sku, avail - fromFree);
      remaining -= fromFree;
    }
    const poAvail = poPool.get(line.sku) ?? 0;
    fromPo = Math.min(remaining, poAvail);
    poPool.set(line.sku, poAvail - fromPo);
    remaining -= fromPo;

    lineResults.set(line.lineId, {
      line,
      coveredByFreeStock: fromFree,
      coveredByOpenPo: fromPo,
      toOrder: remaining,
      freeStockAvailable: Math.max(0, freeStock.get(line.sku) ?? 0),
    });
  }

  // Per-SKU aggregate for the Buy zone.
  const skuMap = new Map<string, SkuRequirement>();
  for (const line of demand) {
    const r = lineResults.get(line.lineId)!;
    let agg = skuMap.get(line.sku);
    if (!agg) {
      agg = {
        sku: line.sku,
        category: line.category,
        supplierId: line.supplierId,
        totalDemand: 0,
        coveredByFreeStock: 0,
        coveredByOpenPo: 0,
        toOrder: 0,
        freeStock: Math.max(0, freeStock.get(line.sku) ?? 0),
      };
      skuMap.set(line.sku, agg);
    }
    agg.totalDemand += line.qty;
    agg.coveredByFreeStock += r.coveredByFreeStock;
    agg.coveredByOpenPo += r.coveredByOpenPo;
    agg.toOrder += r.toOrder;
  }

  // Delivery bundles: co-bundle within an order per the group policy.
  const bundleMap = new Map<string, DemandLine[]>();
  for (const line of demand) {
    const group = bundleGroupOf(line.category);
    const key =
      group != null
        ? `${line.orderId}::${group}`
        : `${line.orderId}::line::${line.lineId}`;
    (bundleMap.get(key) ?? bundleMap.set(key, []).get(key)!).push(line);
  }

  const bundles: BundleRequirement[] = [];
  for (const [bundleKey, members] of bundleMap) {
    const group = bundleGroupOf(members[0].category) ?? members[0].category;
    const deadlines = members
      .map((m) => m.deadline)
      .filter((d): d is IsoDate => d != null)
      .sort();
    const deadline = deadlines.length ? deadlines[0] : null;
    const maxLeadDays = members.reduce((mx, m) => Math.max(mx, m.leadDays), 0);
    // Arrival buffer: stock must land `arrivalBufferDays` working days BEFORE the
    // deadline (Carres/delivery-side week = wdOpts), leaving time to arrange
    // delivery. Then each member walks TWO legs backwards, each on its own
    // named calendar (Law 2A), and the bundle is ordered by the EARLIEST member
    // raise-by (a bed-set spanning Nice Future 5-day + Ohana 6-day gates on the
    // earlier leg — both must be ready by arriveBy).
    //
    //   arriveBy  = deadline − Safety days              OFFICE week (wdOpts)
    //   readyBy   = arriveBy − transit days             OFFICE week (wdOpts)
    //   raiseBy   = readyBy  − production days          FACTORY week (memberWd)
    //
    // THE TRANSIT LEG WAS MISSING HERE UNTIL 2026-09-09 (owner correction).
    // The forward arithmetic a PO is born with — `expectedArrivalOf`, which
    // stamps `eta_date` — has always been `production + transit`, so a PO
    // issued exactly ON raise-by arrived one working day AFTER the goods were
    // due and quietly ate a day of the Safety period. Measured on live data
    // (every configured supplier carries `transit_days = 1`): a 2 Nov customer
    // date gave Goods Must Arrive Tue 13 Oct and Order By Sat 26 Sep, and the
    // PO born that day promised Wed 14 Oct — 13 of 14 safety days, not 14.
    // Backward and forward are now exact inverses of one another (Law D), and
    // Safety days are still subtracted EXACTLY ONCE, here at `arriveBy`.
    const buffer = options.arrivalBufferDays ?? 0;
    const arriveBy =
      deadline == null ? null : subtractWorkingDays(deadline, buffer, wdOpts);
    let raiseBy: IsoDate | null = null;
    let promiseIfOrderedToday = today;
    for (const m of members) {
      const memberWd: WorkingDayOptions = {
        holidays: options.holidays,
        offDays: m.offDays ?? options.offDays,
      };
      // No number set → the leg is omitted, never guessed (`transitDaysFor`
      // is documented NEVER DEFAULTED). A caller that supplies nothing keeps
      // the exact dates it got before this change.
      const transit = m.transitDays ?? 0;
      if (arriveBy != null) {
        const readyBy = subtractWorkingDays(arriveBy, transit, wdOpts);
        const rb = subtractWorkingDays(readyBy, m.leadDays, memberWd);
        if (raiseBy == null || rb < raiseBy) raiseBy = rb;
      }
      const ready = addWorkingDays(today, m.leadDays, memberWd);
      const arrival = addWorkingDays(ready, transit, wdOpts);
      if (arrival > promiseIfOrderedToday) promiseIfOrderedToday = arrival;
    }
    const toOrder = members.reduce(
      (sum, m) => sum + (lineResults.get(m.lineId)?.toOrder ?? 0),
      0,
    );

    // Cadence = union of member suppliers' review weekdays (bundle ships together).
    const reviewDaySet = new Set<number>();
    let anyConfigured = false;
    for (const m of members) {
      const rd = reviewDaysBySupplier.get(m.supplierId);
      if (rd) {
        anyConfigured = true;
        for (const w of rd) reviewDaySet.add(w);
      }
    }
    const reviewDays = anyConfigured ? [...reviewDaySet] : [];

    let urgency: UrgencyBucket;
    if (toOrder === 0) urgency = "covered";
    else if (raiseBy == null) urgency = "no_deadline";
    else urgency = bucketFor(raiseBy, today, reviewDays, wdOpts);

    bundles.push({
      bundleKey,
      orderId: members[0].orderId,
      group,
      lineIds: members.map((m) => m.lineId),
      supplierIds: [...new Set(members.map((m) => m.supplierId))],
      deadline,
      maxLeadDays,
      arriveBy,
      raiseBy,
      promiseIfOrderedToday,
      toOrder,
      urgency,
    });
  }

  return {
    bySku: [...skuMap.values()],
    bundles,
    lines: ordered.map((l) => lineResults.get(l.lineId)!),
  };
}
