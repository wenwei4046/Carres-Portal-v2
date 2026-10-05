/**
 * SALES ORDER `Stock Status` · LOCAL WALK SCENARIO — DEV ONLY, every write
 * SIMULATED (owner rulings 2026-10-05, relayed by the controller).
 *
 * ONE LINK (owner, 2026-10-05): it is mounted INSIDE the Tasks walk —
 * `tasks-preview.tsx` imports this module right AFTER `./tasks-fixtures` (so it
 * wraps the fetch the Tasks walk owns) and renders `<StockStatusWalkPanel />`
 * beside its Banner. It answers only the reads and writes its scenario owns
 * and passes everything else through; there is no separate page.
 *
 *   reads    /api/operation/orders                       its orders added
 *            /api/operation/orders/register-facts        Stock Status for every
 *                                                        order, through the REAL
 *                                                        shared `salesOrderStockOf`
 *            /api/operation/orders/:id/expansion         its orders' Unit IDs
 *            /api/operation/purchase/demands/:id/ready-stock   the EXISTING door's read
 *   writes   /api/operation/purchase/demands/ready-stock/save  the EXISTING door,
 *                                                        simulated with its own
 *                                                        checks and refusals
 *            the simulated RECEIPT (walk panel buttons)  the owner's 2026-10-05
 *                                                        auto-reserve ruling —
 *                                                        APPROVED, NOT BUILT
 *
 * Nothing reaches a server: no reservation, receipt, Unit or order changes
 * anywhere. Customers are `{braces}`; SO-1319 · PO-20260903-4354 · U1-000-002
 * mirror the real case the owner named; every other number is invented.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  readyStockRefusalWord,
  salesOrderStockOf,
  soBatchLineCoverageInput,
  soBatchOrderLineOutstandingQty,
  type RouteGoodsFacts,
  type SalesOrderStockFact,
} from "@carres/shared";

/* ── the world ─────────────────────────────────────────────────────────── */
type Line = { id: string; sku: string; qty: number };
type Order = { id: string; so: number; customer: string; cancelled?: boolean; lines: Line[] };
type PoLine = { id: string; sku: string; qty: number; received_qty: number; damaged_qty: number; wrong_item_qty: number };
type Po = { id: string; status: "open" | "cancelled"; lines: PoLine[] };
type Source = { id: string; order_id: string; order_line_id: string; po_id: string; po_line_id: string; qty: number; created_at: string };
type Unit = {
  id: string; unit_code: string; sku: string;
  status: "free" | "incoming" | "reserved" | "sold" | "on_hold";
  reserved_ref: string | null; reserved_order_line_id: string | null; sold_order_id: string | null;
  condition: string; needs_repair: boolean; sale_cleared_at: string | null; po_line_id: string | null;
  po_no: string | null; date_in: string | null;
};

const uuid = (kind: number, n: number) => `00000000-0000-4${String(kind).padStart(3, "0")}-8000-${String(n).padStart(12, "0")}`;
const orderIdOf = (so: number) => uuid(901, so);
const lineIdOf = (so: number, k = 1) => uuid(902, so * 10 + k);
const SKU = "B1201S-K";
/* Three goods of one model, so SO-2901's three lines each have their own shelf. */
const SKU_Q = "B1201S-Q";
const SKU_SK = "B1201S-SK";

function freshWorld() {
  const orders: Order[] = [];
  const pos: Po[] = [];
  const sources: Source[] = [];
  const units: Unit[] = [];
  let unitNo = 900;
  const unit = (over: Partial<Unit> & Pick<Unit, "status">): Unit => {
    unitNo += 1;
    return {
      id: uuid(903, unitNo), unit_code: `U1-000-${unitNo}`, sku: SKU, reserved_ref: null, reserved_order_line_id: null,
      sold_order_id: null, condition: "new", needs_repair: false, sale_cleared_at: null, po_line_id: null, po_no: null,
      date_in: "2026-09-20", ...over,
    };
  };
  const order = (so: number, customer: string, lines: number | Array<[string, number]>, extra: Partial<Order> = {}) => {
    const spec: Array<[string, number]> = typeof lines === "number" ? [[SKU, lines]] : lines;
    const o: Order = { id: orderIdOf(so), so, customer, lines: spec.map(([sku, qty], k) => ({ id: lineIdOf(so, k + 1), sku, qty })), ...extra };
    orders.push(o);
    return o;
  };
  let seq = 0;
  /** A PO line and the lineage shares naming it: `[order, share, line index]`. */
  const onPo = (poId: string, poLineId: string, qty: number, shares: Array<[Order, number, number?]>, sku = SKU) => {
    let po = pos.find((p) => p.id === poId);
    if (!po) pos.push((po = { id: poId, status: "open", lines: [] }));
    po.lines.push({ id: poLineId, sku, qty, received_qty: 0, damaged_qty: 0, wrong_item_qty: 0 });
    for (const [o, share, k = 0] of shares) {
      seq += 1;
      sources.push({
        id: uuid(904, seq), order_id: o.id, order_line_id: o.lines[k]!.id, po_id: poId, po_line_id: poLineId, qty: share,
        created_at: `2026-09-01T00:${String(seq).padStart(2, "0")}:00Z`,
      });
    }
    /* Unit IDs are born with the official PO (Stock MASTER §3). */
    for (let k = 0; k < qty; k += 1) units.push(unit({ status: "incoming", sku, po_line_id: poLineId, po_no: poId, date_in: null }));
  };
  const reserveTo = (o: Order, u: Unit) => Object.assign(u, { status: "reserved", reserved_ref: `SO-${o.so}`, reserved_order_line_id: o.lines[0]!.id });

  /* 1 · the owner's named case: bought, not arrived → receipt → reserved → Ready */
  const so1319 = order(1319, "{customer 1319}", 1);
  onPo("PO-20260903-4354", uuid(905, 1), 1, [[so1319, 1]]);
  units[units.length - 1]!.unit_code = "U1-000-002";
  /* 2 · Reserve stock follows the UNCOVERED quantity (owner ruling 2026-10-05):
         line 1 needs 3, none covered → reserve up to 3
         line 2 needs 3, a PO covers 2 → reserve the remaining 1
         line 3 needs 1, a PO covers it → no action, stock or no stock */
  const so2901 = order(2901, "{customer 2901}", [[SKU, 3], [SKU_Q, 3], [SKU_SK, 1]]);
  onPo("PO-20260925-2901", uuid(905, 2), 2, [[so2901, 2, 1]], SKU_Q);
  onPo("PO-20260925-2901", uuid(905, 7), 1, [[so2901, 1, 2]], SKU_SK);
  /* 4 · one of two reserved, one not bought → Partially ready + Reserve stock */
  const so2903 = order(2903, "{customer 2903}", 2);
  units.push(reserveTo(so2903, unit({ status: "free" })));
  /* 5 · whole quantity reserved → Ready */
  const so2904 = order(2904, "{customer 2904}", 1);
  units.push(reserveTo(so2904, unit({ status: "free" })));
  /* 6 · a reserved Unit found damaged → not usable, issue shown */
  const so2905 = order(2905, "{customer 2905}", 1);
  units.push(reserveTo(so2905, unit({ status: "free", condition: "damaged" })));
  /* 7 · one PO line shared by two orders, 2906's share written first */
  const so2906 = order(2906, "{customer 2906}", 1);
  const so2907 = order(2907, "{customer 2907}", 1);
  onPo("PO-20260926-2906", uuid(905, 3), 2, [[so2906, 1], [so2907, 1]]);
  /* 8 · receipt with damaged / wrong / over-received pieces */
  const so2908 = order(2908, "{customer 2908}", 2);
  onPo("PO-20260927-2908", uuid(905, 4), 2, [[so2908, 2]]);
  /* 9 · requirement reduced after purchase (bought 2, now needs 1) */
  const so2909 = order(2909, "{customer 2909}", 1);
  onPo("PO-20260928-2909", uuid(905, 5), 2, [[so2909, 2]]);
  /* 10 · cancelled order whose goods are on a PO (not on the Register) */
  const so2910 = order(2910, "{customer 2910}", 1, { cancelled: true });
  onPo("PO-20260929-2910", uuid(905, 6), 1, [[so2910, 1]]);
  /* shelf: free, exact, Carres-owned Ready Stock of each of the goods */
  for (let k = 0; k < 5; k += 1) units.push(unit({ status: "free", po_no: "PO-20260801-0001" }));
  for (let k = 0; k < 2; k += 1) units.push(unit({ status: "free", sku: SKU_Q, po_no: "PO-20260801-0001" }));
  for (let k = 0; k < 2; k += 1) units.push(unit({ status: "free", sku: SKU_SK, po_no: "PO-20260801-0001" }));
  return { orders, pos, sources, units, log: [] as string[] };
}

let world = freshWorld();
let failStockRead = false;
/* The walk panel redraws whenever the simulated world changes. */
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());

/* ── the walk's scenario cards ─────────────────────────────────────────── */
type WalkReceipt = { poLineId: string; good: number; damaged?: number; wrong?: number; label: string };
export const STOCK_STATUS_WALK: ReadonlyArray<{ so: number; title: string; expect: string; receipts?: WalkReceipt[] }> = [
  { so: 1319, title: "Bought for this order, not arrived", expect: "Awaiting goods. Receipt auto-reserve (approved, not built): U1-000-002 is reserved to SO-1319 and it reads Ready.", receipts: [{ poLineId: uuid(905, 1), good: 1, label: "Receive U1-000-002" }] },
  { so: 2901, title: "Reserve stock follows the uncovered quantity", expect: "Items → line 1 (needs 3, none covered): Reserve stock, up to 3 · line 2 (needs 3, PO covers 2): Reserve stock for the remaining 1 · line 3 (PO covers it): no action. Reserve 3 + 1 → Partially ready (line 2's 2 still on the PO)." },
  { so: 2903, title: "One of two reserved", expect: "Partially ready · Reserve stock for the second piece → Ready." },
  { so: 2904, title: "Reserved", expect: "Ready (green). No offer." },
  { so: 2905, title: "Reserved Unit found damaged", expect: "Awaiting goods + amber 1 damaged or wrong. Damaged goods never count toward Ready (observation for the owner: nothing is owed by a supplier here)." },
  { so: 2906, title: "Shared PO line, share written first", expect: "Receive 1: by lineage order it goes to SO-2906 → Ready; SO-2907 stays Awaiting goods. Receive again → SO-2907 Ready.", receipts: [{ poLineId: uuid(905, 3), good: 1, label: "Receive 1 of the shared line" }] },
  { so: 2908, title: "Damaged, wrong, then replacement + extra", expect: "Step 1: 1 damaged + 1 wrong arrive → nothing reserved, Awaiting goods + amber 2 damaged or wrong. Step 2: 3 good arrive → 2 reserved → Ready; the extra piece is not reserved (exception below).", receipts: [{ poLineId: uuid(905, 4), good: 0, damaged: 1, wrong: 1, label: "Step 1 · damaged + wrong" }, { poLineId: uuid(905, 4), good: 3, label: "Step 2 · 3 good" }] },
  { so: 2909, title: "Requirement reduced (bought 2, needs 1)", expect: "Receive 2: 1 reserved → Ready; 1 kept and NOT reserved (exception below).", receipts: [{ poLineId: uuid(905, 5), good: 2, label: "Receive 2" }] },
  { so: 2910, title: "Cancelled order (not on the Register)", expect: "Receive 1: nothing reserved (exception below).", receipts: [{ poLineId: uuid(905, 6), good: 1, label: "Receive 1" }] },
];

/* ── the arithmetic the server would do, on this world ─────────────────── */
function factsOf(o: Order): SalesOrderStockFact {
  const own = world.sources.filter((s) => s.order_id === o.id);
  const shared = world.sources.filter((s) => own.some((x) => x.po_line_id === s.po_line_id));
  const sources = [...new Map([...own, ...shared].map((s) => [s.id, s])).values()]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const ref = `SO-${o.so}`;
  const facts: RouteGoodsFacts = {
    todayIso: "2026-10-05",
    orderId: o.id,
    lines: o.lines.map((l) => ({ ...l, label: l.sku })),
    sources,
    purchaseOrders: world.pos
      .filter((p) => sources.some((s) => s.po_id === p.id))
      .map((p) => ({ id: p.id, status: p.status, placed_at: null, official_delivery_date: null, eta_date: null, lines: p.lines, promises: [], arrival_confirmations: [] })),
    receipts: [],
    units: world.units.filter((u) =>
      ((u.status === "reserved" || u.status === "incoming") && u.reserved_ref === ref) || (u.status === "sold" && u.sold_order_id === o.id)),
    readyStock: {},
  };
  return salesOrderStockOf(facts);
}

/** `so_line_remaining_requirement` on this world — through its shared TS twin,
 *  the one coverage arithmetic (Law D). */
function remainingOf(line: Line, exclude?: string): number {
  return soBatchOrderLineOutstandingQty(
    soBatchLineCoverageInput({
      qty: line.qty,
      lineage: world.sources
        .filter((s) => s.order_line_id === line.id && world.pos.find((p) => p.id === s.po_id)?.status !== "cancelled")
        .map((s) => ({ poId: s.po_id, poLineId: s.po_line_id, qty: s.qty })),
      units: world.units
        .filter((u) => u.id !== exclude && u.reserved_order_line_id === line.id && ["reserved", "sold", "incoming"].includes(u.status))
        .map((u) => ({ status: u.status, poLineId: u.po_line_id })),
    }),
  );
}

/** The EXISTING door's read (`GET /purchase/demands/:id/ready-stock`), on this world. */
function readyStockOf(o: Order) {
  const lines = o.lines.map((l) => ({
    orderLineId: l.id, sku: l.sku, item: l.sku, qty: l.qty,
    reservedQty: world.units.filter((u) => u.reserved_order_line_id === l.id && u.status === "reserved" && !u.po_line_id).length,
    reservedUnitCodes: world.units.filter((u) => u.reserved_order_line_id === l.id && u.status === "reserved").map((u) => u.unit_code),
    onPoQty: world.sources.filter((s) => s.order_line_id === l.id).reduce((sum, s) => sum + s.qty, 0),
    remainingQty: remainingOf(l),
  }));
  const units = world.units
    .filter((u) => o.lines.some((l) => l.sku === u.sku) && (u.status === "free" && u.condition !== "damaged" || (u.status === "reserved" && o.lines.some((l) => l.id === u.reserved_order_line_id))))
    .map((u) => {
      const same = lines.filter((l) => l.sku === u.sku);
      const matching = u.status === "free" ? same.filter((l) => l.remainingQty > 0).map((l) => l.orderLineId) : [];
      return {
        itemId: u.id, unitCode: u.unit_code, identityScope: "unit", sku: u.sku, condition: u.condition, siteName: "Carres Klang",
        warehouseId: "wh-klang", holderName: null, ownership: "carres_owned", supplier: null, qty: 1, dateIn: u.date_in, poNo: u.po_no,
        matchingLineIds: matching, lineIds: same.map((l) => l.orderLineId),
        reservedForLineId: u.status === "reserved" ? u.reserved_order_line_id : null,
        blocked: u.status === "free" && matching.length === 0 ? "no_line_needs_it" : null,
      };
    });
  return { orderId: o.id, so: o.so, reference: `SO-${o.so}`, lines, units };
}

class Refusal extends Error {
  constructor(public code: string, public itemId: string | null = null) { super(code); }
}

/** The EXISTING door (`so_batch_save_ready_units` → `ops_stock_pool_draw`),
 *  simulated: one line's whole chosen set, all or none, with its refusals. */
function saveReadyUnits(orderId: string, lineId: string, itemIds: string[]) {
  const o = world.orders.find((x) => x.id === orderId);
  const line = o?.lines.find((l) => l.id === lineId);
  if (!o || !line) throw new Refusal("order_line_not_in_order");
  const before = structuredClone(world.units);
  try {
    const saved = world.units.filter((u) => u.reserved_order_line_id === lineId && u.status === "reserved");
    let released = 0;
    for (const u of saved) {
      if (itemIds.includes(u.id)) continue;
      Object.assign(u, { status: "free", reserved_ref: null, reserved_order_line_id: null });
      released += 1;
    }
    let added = 0;
    for (const id of itemIds) {
      const u = world.units.find((x) => x.id === id);
      if (!u) throw new Refusal("unit_not_found", id);
      if (u.reserved_order_line_id === lineId && u.status === "reserved") continue;
      if (u.status !== "free") throw new Refusal("unit_no_longer_free", id);
      if (u.condition === "damaged" || u.needs_repair) throw new Refusal("unit_not_available", id);
      if (u.sku !== line.sku) throw new Refusal("unit_does_not_match_line", id);
      if (remainingOf(line, u.id) <= 0) throw new Refusal("line_already_covered", id);
      Object.assign(u, { status: "reserved", reserved_ref: `SO-${o.so}`, reserved_order_line_id: lineId });
      added += 1;
    }
    const reserved = world.units.filter((u) => u.reserved_order_line_id === lineId && u.status === "reserved").length;
    world.log.unshift(`SIMULATED reservation · SO-${o.so} · ${added} added · ${released} given back`);
    changed();
    return { reserved, added, released, reference: `SO-${o.so}`, units: itemIds.map((itemId) => ({ itemId, orderLineId: lineId })) };
  } catch (e) {
    world.units = before;
    if (e instanceof Refusal) world.log.unshift(`SIMULATED refusal · SO-${o.so} · ${readyStockRefusalWord(e.code)}`);
    changed();
    throw e;
  }
}

/**
 * ⭐ THE SIMULATED RECEIPT — owner ruling 2026-10-05 (the real Receiving →
 * Stock door is the Receiving/Purchasing lane's build, not this branch's).
 * Accepted good pieces are auto-reserved to the explicit Sales Order lines of
 * this PO line, share by share in LINEAGE ORDER; damaged, wrong and
 * over-received pieces are never reserved; a cancelled order or a reduced
 * requirement forces nothing — the goods are kept and the exception is shown.
 */
export function simulateReceipt(poLineId: string, good: number, damaged = 0, wrong = 0) {
  const po = world.pos.find((p) => p.lines.some((l) => l.id === poLineId));
  const pol = po?.lines.find((l) => l.id === poLineId);
  if (!po || !pol) return;
  /* Pending Delivery Qty = Order Qty − Received Qty (COPY): only GOOD pieces
     settle the order; a good piece beyond it is Extra Qty. */
  const accepted = Math.min(good, Math.max(0, pol.qty - pol.received_qty));
  const extra = good - accepted;
  pol.received_qty += accepted;
  pol.damaged_qty += damaged;
  pol.wrong_item_qty += wrong;
  const incoming = world.units.filter((u) => u.po_line_id === poLineId && u.status === "incoming");
  const arrived = incoming.slice(0, accepted);
  for (const u of arrived) Object.assign(u, { status: "free", date_in: "2026-10-05" });
  const notes: string[] = [`SIMULATED receipt (auto-reserve approved, not built) · ${po.id} · ${accepted} good${damaged ? ` · ${damaged} damaged` : ""}${wrong ? ` · ${wrong} wrong item` : ""}${extra ? ` · ${extra} extra` : ""}`];
  const shares = world.sources.filter((s) => s.po_line_id === poLineId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const pool = [...arrived];
  for (const share of shares) {
    if (pool.length === 0) break;
    const o = world.orders.find((x) => x.id === share.order_id)!;
    const line = o.lines.find((l) => l.id === share.order_line_id)!;
    const already = world.units.filter((u) => u.po_line_id === poLineId && u.reserved_order_line_id === line.id).length;
    const owed = Math.max(0, share.qty - already);
    if (owed === 0) continue;
    if (o.cancelled) {
      notes.push(`EXCEPTION · SO-${o.so} is cancelled: ${Math.min(owed, pool.length)} Unit kept in stock, not reserved`);
      pool.splice(0, Math.min(owed, pool.length));
      continue;
    }
    const need = line.qty - world.units.filter((u) => u.reserved_order_line_id === line.id && ["reserved", "sold"].includes(u.status)).length;
    const take = Math.min(owed, Math.max(0, need), pool.length);
    for (const u of pool.splice(0, take)) {
      Object.assign(u, { status: "reserved", reserved_ref: `SO-${o.so}`, reserved_order_line_id: line.id });
      notes.push(`Reserved ${u.unit_code} to SO-${o.so}`);
    }
    if (take < Math.min(owed, pool.length + take)) {
      const kept = Math.min(owed, pool.length + take) - take;
      pool.splice(0, kept);
      notes.push(`EXCEPTION · SO-${o.so} now needs ${line.qty}: ${kept} Unit kept in stock, not reserved`);
    }
  }
  if (extra) notes.push(`EXCEPTION · ${extra} over-received piece kept as Extra Qty, not reserved`);
  if (damaged + wrong) notes.push(`${damaged + wrong} damaged or wrong piece(s) not reserved (issue shown on the order)`);
  world.log.unshift(...notes.reverse());
  changed();
}

/* ── the fetch wrapper ─────────────────────────────────────────────────── */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const listRow = (o: Order) => ({
  id: o.id, so: o.so, status: "proceed_order", operation_stage: "confirmed", warehouse_id: null,
  customer_name: o.customer, customer_phone: `01${o.so % 10}-0000${String(o.so).slice(-3)}`, customer_email: null,
  customer_address: "{address}", customer_address_line1: "{address}", customer_address_line2: null,
  customer_address_city: "Klang", customer_address_state: "Selangor", customer_address_postcode: "41000",
  placed_at: "2026-09-20T02:00:00Z", proceeded_at: `2026-10-0${(o.so % 4) + 1}T03:00:00Z`, proceed_date: "2026-09-21",
  delivery_date: "2026-11-02", delivery_date_tbd: false, source_system: null, source_ref: null,
  salesperson_id: "sp", salespersons: { name: "{salesperson}" }, outlet_id: "o1", outlets: { name: "{sales location}" },
  dealer_id: null, dealers: null, paid: 0, delivery_partner_id: null, request_for_delivery_at: null, partner_accepted_at: null,
  partner_rejected_at: null, partner_rejected_reason: null, delivery_partners: null, do_number: null, dispatched_at: null,
  delivered_at: null, order_supplier_threads: [], order_annotations: [], order_finance_exceptions: [], ops_delivery_orders: [],
  order_lines: o.lines.map((l) => ({ ...l, unit_price: 2499, attrs: { category: "mattress" } })), order_addons: [],
  po_numbers: [...new Set(world.sources.filter((s) => s.order_id === o.id).map((s) => s.po_id))],
  allocated_units: world.units.filter((u) => u.reserved_ref === `SO-${o.so}` && u.status === "reserved").map((u) => ({ sku: u.sku, status: "reserved", qty: 1 })),
  original_request: [{ revision: 1, snapshot: { header: { delivery_date: "2026-11-02", delivery_date_tbd: false } } }],
});

/** Orders the scenario does not own (the host preview's) get their Stock
 *  Status from their OWN fixture Units, through the same shared function. */
function factOfForeign(o: { id: string; order_lines?: Array<{ id?: string; sku: string; qty: number }>; allocated_units?: Array<{ sku: string; status: string; qty: number }> }) {
  const units = (o.allocated_units ?? []).flatMap((u) =>
    Array.from({ length: u.qty }, () => ({ unit_code: null, status: u.status, reserved_order_line_id: null, sku: u.sku })));
  return salesOrderStockOf({
    todayIso: "2026-10-05", orderId: o.id, sources: [], purchaseOrders: [], receipts: [], units, readyStock: {},
    lines: (o.order_lines ?? []).filter((l) => l.id).map((l) => ({ id: l.id!, sku: l.sku, qty: Number(l.qty), label: l.sku })),
  });
}

const previous = window.fetch.bind(window);
const passJson = async (input: RequestInfo | URL, init?: RequestInit): Promise<unknown> => {
  try {
    const res = await previous(input, init);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
};

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let parsed: URL;
  try { parsed = new URL(url, window.location.href); } catch { return previous(input, init); }
  const path = parsed.pathname;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const mine = (id: string | undefined) => world.orders.find((o) => o.id === decodeURIComponent(id ?? ""));

  if (method === "POST" && path === "/api/operation/purchase/demands/ready-stock/save") {
    const body = JSON.parse(String(init?.body ?? "{}")) as { orderId: string; orderLineId: string; itemIds: string[] };
    if (!mine(body.orderId)) return previous(input, init);
    try {
      return json(saveReadyUnits(body.orderId, body.orderLineId, body.itemIds));
    } catch (e) {
      const r = e instanceof Refusal ? e : new Refusal("simulated_error");
      return json({ error: r.code, code: r.code, ...(r.itemId ? { itemId: r.itemId } : {}) }, 422);
    }
  }
  if (method !== "GET") return previous(input, init);

  const ready = /^\/api\/operation\/purchase\/demands\/([^/]+)\/ready-stock$/.exec(path);
  if (ready) {
    const o = mine(ready[1]);
    return o ? json(readyStockOf(o)) : previous(input, init);
  }
  const expansion = /^\/api\/operation\/orders\/([^/]+)\/expansion$/.exec(path);
  if (expansion) {
    const o = mine(expansion[1]);
    if (!o) return previous(input, init);
    return json({
      lines: o.lines.map((l) => {
        const codes = world.units.filter((u) => u.reserved_order_line_id === l.id && u.status === "reserved").map((u) => u.unit_code);
        return { lineId: l.id, sku: l.sku, unitIds: codes, verifiedUnitIds: codes, unverifiedUnitIds: [], deliverTo: world.sources.some((s) => s.order_line_id === l.id) ? [{ name: "Carres Klang", qty: l.qty }] : [] };
      }),
    });
  }
  if (path === "/api/operation/orders/register-facts") {
    const base = ((await passJson(input, init)) ?? { facts: {}, failed: { obligations: false, cases: false } }) as {
      facts: Record<string, Record<string, unknown>>; failed: Record<string, boolean>;
    };
    const list = ((await passJson(`${parsed.origin}/api/operation/orders?stage=proceeded`)) as { orders?: Array<Parameters<typeof factOfForeign>[0]> } | null)?.orders ?? [];
    const facts: Record<string, Record<string, unknown>> = { ...base.facts };
    for (const o of list) facts[o.id] = { obligations: null, cases: null, ...facts[o.id], stock: failStockRead ? null : factOfForeign(o) };
    for (const o of world.orders) facts[o.id] = { obligations: "outstanding", cases: "none", stock: failStockRead ? null : factsOf(o) };
    return json({ facts, failed: { obligations: false, cases: false, ...base.failed, stock: failStockRead } });
  }
  if (path === "/api/operation/orders") {
    const base = ((await passJson(input, init)) ?? { orders: [] }) as { orders?: unknown[]; salesOrderTotal?: number; total?: number };
    const only = parsed.searchParams.get("orderId");
    const extra = world.orders.filter((o) => !o.cancelled && (!only || o.id === only)).map(listRow);
    const orders = [...(base.orders ?? []), ...extra];
    return json({ ...base, orders, salesOrderTotal: orders.length });
  }
  return previous(input, init);
};

/* ── the walk panel ────────────────────────────────────────────────────── */
export function StockStatusWalkPanel() {
  const qc = useQueryClient();
  /* Inside the Tasks walk it starts folded so it never covers the Working
     Panel; `?walk=stock` (the button below) opens it on Sales Orders. */
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get("walk") === "stock");
  const [, redraw] = useState(0);
  useEffect(() => {
    const fn = () => redraw((n) => n + 1);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["operation", "orders"] });
    void qc.invalidateQueries({ queryKey: ["so-batch-ready-stock"] });
    redraw((n) => n + 1);
  };
  return (
    <div className="fixed bottom-24 left-2 z-50 w-[360px] max-w-[calc(100vw-16px)] rounded-card bg-kit-slate-12 text-label text-white shadow-lg" data-testid="stock-status-walk">
      <button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-left font-semibold" onClick={() => setOpen((v) => !v)}>
        <span>Local walk · Stock Status · SIMULATED</span><span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="max-h-[45vh] space-y-2 overflow-auto px-3 pb-3">
          <button type="button" className="rounded-control border border-kit-slate-6 px-2" data-testid="walk-go-sales-orders"
            onClick={() => {
              const next = new URLSearchParams(window.location.search);
              next.set("at", "/operation/orders");
              next.set("walk", "stock");
              window.location.search = next.toString();
            }}>
            Open Sales Orders
          </button>
          <p className="text-kit-slate-6">Sales Orders → find the SO → click its number → Items. Every receipt and reservation here is simulated; nothing is saved anywhere. Receipt auto-reserve is approved, not built.</p>
          <ol className="space-y-1.5">
            {STOCK_STATUS_WALK.map((s) => (
              <li key={s.so} className="rounded-control border border-kit-slate-9 p-1.5" data-testid={`walk-so-${s.so}`}>
                <div className="font-semibold">SO-{s.so} · {s.title}</div>
                <div className="text-kit-slate-6">{s.expect}</div>
                {(s.receipts ?? []).map((r, i) => (
                  <button key={r.label} type="button" className="mr-1 mt-1 rounded-control border border-kit-slate-6 px-2" data-testid={`walk-receive-${s.so}-${i + 1}`}
                    onClick={() => { simulateReceipt(r.poLineId, r.good, r.damaged, r.wrong); refresh(); }}>
                    {r.label} · approved, not built · simulated
                  </button>
                ))}
              </li>
            ))}
          </ol>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={failStockRead} data-testid="walk-fail-read" onChange={(e) => { failStockRead = e.target.checked; refresh(); }} />
            <span>Read failure (Stock Status could not be loaded)</span>
          </label>
          <div className="flex gap-2">
            <button type="button" className="rounded-control border border-kit-slate-6 px-2" data-testid="walk-reset-stock" onClick={() => { world = freshWorld(); failStockRead = false; refresh(); }}>Reset Stock Status walk</button>
          </div>
          {world.log.length > 0 && (
            <ul className="space-y-0.5 border-t border-kit-slate-9 pt-1.5" data-testid="walk-log">
              {world.log.slice(0, 14).map((line, i) => <li key={`${i}-${line}`} className={line.startsWith("EXCEPTION") ? "text-kit-amber-6" : "text-kit-slate-6"}>{line}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
