/**
 * Purchase / Procurement cockpit — the API response contract for the
 * "① Place orders" section (GET /api/operation/purchase/today).
 *
 * The Hono route assembles live demand + supply, runs the pure
 * `computeNetRequirements` engine (see ./net-requirements), and shapes its
 * output into this schema. Kept separate from the engine so the pure netting
 * math has no zod / transport concern.
 */
import { z } from "zod";
import {
  computeNetRequirements,
  type DemandLine,
  type NetRequirementsSupply,
  type NetRequirementsOptions,
} from "./net-requirements";
import { countWorkingDays, type WorkingDayOptions } from "./working-days";

/** Mirrors `UrgencyBucket` in ./net-requirements (kept in sync by hand). */
export const purchaseUrgencyBucketSchema = z.enum([
  "covered",
  "late",
  "urgent",
  "due",
  "scheduled",
  "no_deadline",
]);
export type PurchaseUrgencyBucket = z.infer<typeof purchaseUrgencyBucketSchema>;

const productCategorySchema = z.enum([
  "mattress",
  "bedframe",
  "sofa",
  "accessory",
  "service",
]);

/** One SKU line WITHIN a delivery bundle — what to buy + why. */
export const purchaseBundleItemSchema = z.object({
  sku: z.string(),
  category: productCategorySchema,
  supplierId: z.string(),
  /** Total customer demand for this sku inside the bundle. */
  qty: z.number(),
  /** Net units to place on a new PO (after netting free stock + open POs). */
  toOrder: z.number(),
  coveredByOpenPo: z.number(),
  coveredByFreeStock: z.number(),
  /**
   * Unit system cost (`product_skus.cost`), or `null` when unset. DISPLAY-ONLY /
   * advisory — never a pricing or order-path input (mirrors the cost read-model
   * elsewhere). The per-card total = Σ(cost × toOrder) is computed by the page.
   */
  cost: z.number().nullable(),
  /** Human one-liner e.g. "need 3 · 1 on PO · order 2". */
  why: z.string(),
});
export type PurchaseBundleItem = z.infer<typeof purchaseBundleItemSchema>;

/** A delivery bundle = one customer trip (bed-set couples mattress+bedframe). */
export const purchaseBundleSchema = z.object({
  bundleKey: z.string(),
  orderId: z.string(),
  /** Convenience SO number for the operator (from orders.so). */
  so: z.number().nullable(),
  /** Customer name (from orders.customer_name) — the card's primary label. */
  customerName: z.string().nullable(),
  group: z.string(),
  lineIds: z.array(z.string()),
  supplierIds: z.array(z.string()),
  deadline: z.string().nullable(),
  maxLeadDays: z.number(),
  raiseBy: z.string().nullable(),
  promiseIfOrderedToday: z.string(),
  toOrder: z.number(),
  urgency: purchaseUrgencyBucketSchema,
  items: z.array(purchaseBundleItemSchema),
});
export type PurchaseBundle = z.infer<typeof purchaseBundleSchema>;

/** Per-SKU roll-up for the by-supplier buy list. */
export const purchaseSkuLineSchema = z.object({
  sku: z.string(),
  category: productCategorySchema,
  supplierId: z.string(),
  totalDemand: z.number(),
  coveredByFreeStock: z.number(),
  coveredByOpenPo: z.number(),
  toOrder: z.number(),
  freeStock: z.number(),
});
export type PurchaseSkuLine = z.infer<typeof purchaseSkuLineSchema>;

// ── ② Chase / ③ Receive (open-PO read models) ────────────────────────────────

/** One outstanding line on an open PO (`received_qty < qty`). */
export const purchasePoItemSchema = z.object({
  sku: z.string(),
  /** Units still not received = `qty − received_qty` (always > 0 here). */
  outstanding: z.number(),
});
export type PurchasePoItem = z.infer<typeof purchasePoItemSchema>;

/** A source order a PO serves (`po.so` or a `po.so_refs[]` entry), joined for
 *  the operator's chase / receive context (customer + their delivery date). */
export const purchaseLinkedOrderSchema = z.object({
  so: z.number().nullable(),
  customerName: z.string().nullable(),
  deliveryDate: z.string().nullable(),
});
export type PurchaseLinkedOrder = z.infer<typeof purchaseLinkedOrderSchema>;

/** ② Chase — an OPEN PO the factory is late on (still making, no goods yet). */
export const purchaseChaseSchema = z.object({
  poId: z.string(),
  supplierId: z.string(),
  /** Raw supplier lifecycle stage (a POSupStatus still-making value). */
  supStatus: z.string(),
  /** Promised ready date — already in the past for a chase row. */
  expectedReadyDate: z.string().nullable(),
  items: z.array(purchasePoItemSchema),
  linkedOrders: z.array(purchaseLinkedOrderSchema),
  /** WORKING days from `expectedReadyDate` to today (how late the factory is). */
  daysLate: z.number(),
  /** Earliest linked customer delivery date — the real pressure. */
  earliestDeliveryDate: z.string().nullable(),
});
export type PurchaseChase = z.infer<typeof purchaseChaseSchema>;

/** ③ Receive — an OPEN PO with goods ready / arriving + units still to book in. */
export const purchaseReceiveSchema = z.object({
  poId: z.string(),
  supplierId: z.string(),
  /** Raw supplier lifecycle stage (a POSupStatus goods-ready / arriving value). */
  supStatus: z.string(),
  etaDate: z.string().nullable(),
  expectedReadyDate: z.string().nullable(),
  items: z.array(purchasePoItemSchema),
  linkedOrders: z.array(purchaseLinkedOrderSchema),
});
export type PurchaseReceive = z.infer<typeof purchaseReceiveSchema>;

/** Count of to-place bundles per urgency bucket + coarse totals. */
export const purchaseSummarySchema = z.object({
  late: z.number(),
  urgent: z.number(),
  due: z.number(),
  scheduled: z.number(),
  no_deadline: z.number(),
  /** Bundles in the to-place list (toOrder > 0). */
  toPlaceBundles: z.number(),
  /** Sum of every to-place bundle's toOrder. */
  toOrderUnits: z.number(),
  /** ② Open POs the factory is late on (chase list length). */
  toChase: z.number(),
  /** ② Subset of `toChase` — kept distinct for the KPI overdue sub-count.
   *  Every chase row is by definition late, so `chaseLate === toChase`; the
   *  field mirrors the ① `late` style so the page reads one shape. */
  chaseLate: z.number(),
  /** ③ Open POs with goods ready / arriving + units still to book in. */
  toReceive: z.number(),
});
export type PurchaseSummary = z.infer<typeof purchaseSummarySchema>;

export const purchaseTodayResponseSchema = z.object({
  /** Server anchor date (IsoDate) every raise-by / urgency was computed against. */
  today: z.string(),
  /** The "① Place orders" list — only bundles that still need a PO (toOrder > 0). */
  bundles: z.array(purchaseBundleSchema),
  /** The per-supplier buy list (net-to-order per SKU). */
  bySku: z.array(purchaseSkuLineSchema),
  /** ② Chase list — open POs the factory is late on. */
  chase: z.array(purchaseChaseSchema),
  /** ③ Receive list — open POs with goods ready / arriving to book in. */
  receive: z.array(purchaseReceiveSchema),
  summary: purchaseSummarySchema,
});
export type PurchaseTodayResponse = z.infer<typeof purchaseTodayResponseSchema>;

// ── ②③ open-PO shaping (pure, no I/O) ────────────────────────────────────────

/** The still-making supplier stages → a late open PO belongs in ② Chase. */
export const PURCHASE_CHASE_STATUSES = [
  "pending",
  "acknowledged",
  "in_production",
] as const;

/** The goods-ready / arriving supplier stages → an open PO belongs in ③ Receive. */
export const PURCHASE_RECEIVE_STATUSES = [
  "ready_for_pickup",
  "picked_up",
  "shipped",
  "delivered",
  "at_warehouse_waiting",
  "at_own_wh_waiting",
  "ready_confirm_sent",
  "partner_confirmed",
] as const;

/** One open PO, already joined to its lines + source orders by the route. */
export interface PurchasePoInput {
  poId: string;
  supplierId: string;
  supStatus: string;
  /** POStatus — only `"open"` POs are shaped into chase / receive. */
  status: string;
  expectedReadyDate: string | null;
  etaDate: string | null;
  lines: readonly { sku: string; qty: number; receivedQty: number }[];
  linkedOrders: readonly PurchaseLinkedOrder[];
}

export interface PurchaseChaseReceiveOptions extends WorkingDayOptions {
  /** Anchor "now" (IsoDate) every daysLate / late test reads from. Required. */
  today: string;
}

/**
 * Pure shaping of open POs into the ② Chase + ③ Receive lists.
 *
 * A PO must be `status="open"` AND carry ≥1 outstanding line (`received_qty <
 * qty`) to appear in either list. Then:
 *   - ② Chase  = the factory is still making (`sup_status` ∈ still-making set)
 *                AND its promised `expected_ready_date` is already past.
 *   - ③ Receive = goods are ready / arriving (`sup_status` ∈ goods-ready set).
 * Intermediate pickup stages (pickup_assigned/accepted, reassign_needed,
 * customer_rejected, relocated, at_partner_wh) fall through BOTH sets by design.
 *
 * Chase is sorted most-late-first (then earliest customer deadline); receive is
 * sorted by soonest ETA (nulls last). Kept pure so the route only does DB reads.
 */
export function buildPurchaseChaseReceive(
  pos: readonly PurchasePoInput[],
  options: PurchaseChaseReceiveOptions,
): { chase: PurchaseChase[]; receive: PurchaseReceive[] } {
  const today = options.today.slice(0, 10);
  const wd: WorkingDayOptions = { holidays: options.holidays };
  const chaseSet = new Set<string>(PURCHASE_CHASE_STATUSES);
  const receiveSet = new Set<string>(PURCHASE_RECEIVE_STATUSES);

  const chase: PurchaseChase[] = [];
  const receive: PurchaseReceive[] = [];

  for (const po of pos) {
    if (po.status !== "open") continue;

    const items: PurchasePoItem[] = po.lines
      .map((l) => ({ sku: l.sku, outstanding: Number(l.qty) - Number(l.receivedQty) }))
      .filter((it) => it.outstanding > 0)
      .sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));
    // A fully-received open PO has nothing to chase or book in — skip it.
    if (items.length === 0) continue;

    const linkedOrders = [...po.linkedOrders];
    const earliestDeliveryDate =
      linkedOrders
        .map((o) => o.deliveryDate)
        .filter((d): d is string => Boolean(d))
        .sort()[0] ?? null;

    const erd = po.expectedReadyDate ? po.expectedReadyDate.slice(0, 10) : null;

    if (chaseSet.has(po.supStatus) && erd && erd < today) {
      chase.push({
        poId: po.poId,
        supplierId: po.supplierId,
        supStatus: po.supStatus,
        expectedReadyDate: erd,
        items,
        linkedOrders,
        daysLate: countWorkingDays(erd, today, wd),
        earliestDeliveryDate,
      });
    } else if (receiveSet.has(po.supStatus)) {
      receive.push({
        poId: po.poId,
        supplierId: po.supplierId,
        supStatus: po.supStatus,
        etaDate: po.etaDate ? po.etaDate.slice(0, 10) : null,
        expectedReadyDate: erd,
        items,
        linkedOrders,
      });
    }
  }

  // Chase: most late first, then earliest customer deadline, then PO id.
  chase.sort((a, b) => {
    if (a.daysLate !== b.daysLate) return b.daysLate - a.daysLate;
    const ad = a.earliestDeliveryDate ?? "9999-12-31";
    const bd = b.earliestDeliveryDate ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.poId < b.poId ? -1 : 1;
  });
  // Receive: soonest ETA first (nulls last), then PO id.
  receive.sort((a, b) => {
    const ae = a.etaDate ?? "9999-12-31";
    const be = b.etaDate ?? "9999-12-31";
    if (ae !== be) return ae < be ? -1 : 1;
    return a.poId < b.poId ? -1 : 1;
  });

  return { chase, receive };
}

/**
 * Pure shaping: run the net-requirements engine over assembled demand + supply,
 * then reshape into the transport contract for the Purchase page.
 *
 * Kept pure (no I/O) so the API route only does DB reads and the netting flow is
 * unit-testable end-to-end. Only bundles with `toOrder > 0` reach the returned
 * `bundles` list (the "① Place orders" section); the summary counts them.
 */
export function buildPurchaseTodayReport(
  demand: readonly DemandLine[],
  supply: NetRequirementsSupply,
  options: NetRequirementsOptions,
  soByOrderId: ReadonlyMap<string, number> | Record<string, number> = {},
  customerNameByOrderId:
    | ReadonlyMap<string, string | null>
    | Record<string, string | null> = {},
  costBySku: ReadonlyMap<string, number | null> | Record<string, number | null> = {},
  chaseReceive: { chase?: readonly PurchaseChase[]; receive?: readonly PurchaseReceive[] } = {},
): PurchaseTodayResponse {
  const soMap =
    soByOrderId instanceof Map
      ? soByOrderId
      : new Map(
          Object.entries(soByOrderId).map(([k, v]) => [k, Number(v)] as const),
        );
  const nameMap =
    customerNameByOrderId instanceof Map
      ? customerNameByOrderId
      : new Map(Object.entries(customerNameByOrderId));
  const costMap =
    costBySku instanceof Map ? costBySku : new Map(Object.entries(costBySku));

  const result = computeNetRequirements(demand, supply, options);

  // lineId → coverage, so each bundle can explain its per-SKU netting.
  const lineById = new Map(result.lines.map((l) => [l.line.lineId, l]));

  const toPlace = result.bundles
    .filter((b) => b.toOrder > 0)
    .map((b) => {
      // Aggregate the bundle's member lines by SKU.
      const bySku = new Map<string, PurchaseBundleItem>();
      for (const lineId of b.lineIds) {
        const r = lineById.get(lineId);
        if (!r) continue;
        const { line } = r;
        let item = bySku.get(line.sku);
        if (!item) {
          item = {
            sku: line.sku,
            category: line.category,
            supplierId: line.supplierId,
            qty: 0,
            toOrder: 0,
            coveredByOpenPo: 0,
            coveredByFreeStock: 0,
            cost: costMap.get(line.sku) ?? null,
            why: "",
          };
          bySku.set(line.sku, item);
        }
        item.qty += line.qty;
        item.toOrder += r.toOrder;
        item.coveredByOpenPo += r.coveredByOpenPo;
        item.coveredByFreeStock += r.coveredByFreeStock;
      }
      const items = [...bySku.values()]
        // Only SKUs that still need ordering carry into the buy card.
        .filter((it) => it.toOrder > 0)
        .map((it) => {
          const parts = [`need ${it.qty}`];
          if (it.coveredByOpenPo > 0) parts.push(`${it.coveredByOpenPo} on PO`);
          if (it.coveredByFreeStock > 0)
            parts.push(`${it.coveredByFreeStock} from stock`);
          parts.push(`order ${it.toOrder}`);
          it.why = parts.join(" · ");
          return it;
        });

      return {
        bundleKey: b.bundleKey,
        orderId: b.orderId,
        so: soMap.get(b.orderId) ?? null,
        customerName: nameMap.get(b.orderId) ?? null,
        group: b.group,
        lineIds: b.lineIds,
        supplierIds: b.supplierIds,
        deadline: b.deadline,
        maxLeadDays: b.maxLeadDays,
        raiseBy: b.raiseBy,
        promiseIfOrderedToday: b.promiseIfOrderedToday,
        toOrder: b.toOrder,
        urgency: b.urgency,
        items,
      } satisfies PurchaseBundle;
    });

  // Order the to-place list by urgency (most pressing first), then earliest
  // raise-by, then SO — the operator works top-down.
  const rank: Record<PurchaseUrgencyBucket, number> = {
    late: 0,
    urgent: 1,
    due: 2,
    no_deadline: 3,
    scheduled: 4,
    covered: 5,
  };
  toPlace.sort((a, b) => {
    if (rank[a.urgency] !== rank[b.urgency]) return rank[a.urgency] - rank[b.urgency];
    const ar = a.raiseBy ?? "9999-12-31";
    const br = b.raiseBy ?? "9999-12-31";
    if (ar !== br) return ar < br ? -1 : 1;
    return (a.so ?? 0) - (b.so ?? 0);
  });

  const bySku = result.bySku
    .filter((s) => s.toOrder > 0)
    .map((s) => ({
      sku: s.sku,
      category: s.category,
      supplierId: s.supplierId,
      totalDemand: s.totalDemand,
      coveredByFreeStock: s.coveredByFreeStock,
      coveredByOpenPo: s.coveredByOpenPo,
      toOrder: s.toOrder,
      freeStock: s.freeStock,
    }))
    .sort((a, b) =>
      a.supplierId === b.supplierId
        ? a.sku < b.sku
          ? -1
          : a.sku > b.sku
            ? 1
            : 0
        : a.supplierId < b.supplierId
          ? -1
          : 1,
    );

  const chase = [...(chaseReceive.chase ?? [])];
  const receive = [...(chaseReceive.receive ?? [])];

  const summary: PurchaseSummary = {
    late: 0,
    urgent: 0,
    due: 0,
    scheduled: 0,
    no_deadline: 0,
    toPlaceBundles: toPlace.length,
    toOrderUnits: toPlace.reduce((sum, b) => sum + b.toOrder, 0),
    // Every chase row is by definition late (past its promised ready date).
    toChase: chase.length,
    chaseLate: chase.length,
    toReceive: receive.length,
  };
  for (const b of toPlace) {
    if (b.urgency === "late") summary.late += 1;
    else if (b.urgency === "urgent") summary.urgent += 1;
    else if (b.urgency === "due") summary.due += 1;
    else if (b.urgency === "scheduled") summary.scheduled += 1;
    else if (b.urgency === "no_deadline") summary.no_deadline += 1;
  }

  return { today: options.today.slice(0, 10), bundles: toPlace, bySku, chase, receive, summary };
}
