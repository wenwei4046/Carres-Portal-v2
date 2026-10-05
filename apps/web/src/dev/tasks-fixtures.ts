/**
 * TASKS LOCAL WALK — fixtures and the simulated API. DEV ONLY.
 *
 * Imported FIRST by `tasks-preview.tsx`, so `window.fetch` is replaced before
 * any module (the Supabase client included) captures it. Every API call is
 * answered here from in-memory fixtures; every write is SIMULATED — it changes
 * these fixtures only, so the walk can finish a task and watch the row leave.
 * Nothing reaches a server: no order, reservation, PO issue, PO send,
 * supplier message or stock change happens anywhere.
 *
 * Every party, number and date is invented; dates are generated from this
 * machine's clock so Missed, today and the week always exist.
 */
import type { OperationWorkItem, OperationWorkModule, OperationWorkResponse } from "@carres/shared";
import { addDaysIso, weekStartIso } from "@/lib/excel-date-filter";
import { appTodayIso } from "@/lib/fmt-date";

(window as unknown as { __carresSimulated: boolean }).__carresSimulated = true;

export const SCENARIOS = ["default", "loading", "failed", "failed-no-data", "nothing"] as const;
export type Scenario = (typeof SCENARIOS)[number];
const params = new URLSearchParams(window.location.search);
export const SCENARIO: Scenario = (SCENARIOS as readonly string[]).includes(params.get("scenario") ?? "")
  ? (params.get("scenario") as Scenario)
  : "default";

export const ME = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";
export const TODAY = appTodayIso();
const MONDAY = weekStartIso(TODAY);
const day = (offset: number) => addDaysIso(MONDAY, offset);
const past = (offset: number) => addDaysIso(TODAY, -offset);

/* ── parties ─────────────────────────────────────────────────────────────── */
const KLANG = "11111111-1111-4111-8111-111111111111";
const SUP = { nice: "22222222-2222-4222-8222-2222222222a1", ohana: "22222222-2222-4222-8222-2222222222a2" };
const AL = "33333333-3333-4333-8333-3333333333a1";
export const SUPPLIERS = [
  { id: SUP.nice, name: "Nice Future", kind: "own_logistics", cat_covered: [], lead_time: null, contact: null, contact_email: "po@nicefuture.example", whatsapp_group_url: "https://chat.whatsapp.com/nice-future-example", po_send_channel: null },
  { id: SUP.ohana, name: "Ohana", kind: "own_logistics", cat_covered: [], lead_time: null, contact: null, contact_email: null, whatsapp_group_url: "https://chat.whatsapp.com/ohana-example", po_send_channel: null },
];

/* ── Sales Orders ───────────────────────────────────────────────────────── */
const orderId = (so: number) => `00000000-0000-4000-8000-${String(so).padStart(12, "0")}`;
const CUSTOMERS: Record<number, string> = { 1368: "Jimmy", 1313: "Tan Ah Kow", 1340: "Kimmy", 1369: "Siti", 1371: "PETER", 1372: "ANNE", 1373: "Mohd Hafiz", 1203: "ABC", 1205: "TOMMY", 1206: "UMIO" };
export const ORDERS = Object.entries(CUSTOMERS).map(([so, name]) => {
  const n = Number(so);
  return {
    id: orderId(n), so: n, status: "proceed_order", operation_stage: "confirmed", warehouse_id: null,
    customer_name: name, customer_phone: `019-83372${String(n).slice(-3)}`, customer_email: null,
    customer_address: n === 1368 ? "1888. jalan Pillow, 68000 Ampang, Selangor" : `${n % 90} Jalan Example, 41000 Klang, Selangor`,
    customer_address_line1: `${n % 90} Jalan Example`, customer_address_line2: null,
    customer_address_city: n === 1368 ? "Ampang" : "Klang", customer_address_state: "Selangor", customer_address_postcode: "41000",
    building_type: null, delivery_floor: null, delivery_has_lift: null,
    placed_at: "2026-09-30T02:00:00Z", proceeded_at: "2026-09-30T03:00:00Z", proceed_date: "2026-09-30",
    delivery_date: day(5 + 21), delivery_date_tbd: false, source_system: null, source_ref: null,
    salesperson_id: "sp", salespersons: { name: "Alvin" },
    outlet_id: "outlet-1", outlets: { name: "Carres Kota Damansara" }, dealer_id: null, dealers: null,
    order_lines: [{ id: `l-${n}-1`, sku: "B1201S-K", qty: 1, unit_price: 2499, attrs: { category: "mattress" } }],
    order_addons: [], paid: 1380, delivery_partner_id: null, request_for_delivery_at: null, partner_accepted_at: null,
    partner_rejected_at: null, partner_rejected_reason: null, delivery_partners: null, do_number: null,
    dispatched_at: null, delivered_at: null, order_supplier_threads: [], order_annotations: [],
    order_finance_exceptions: [], ops_delivery_orders: [], po_numbers: [], allocated_units: [{ sku: "B1201S-K", status: "reserved", qty: 1 }],
    original_request: [{ revision: 1, snapshot: { header: { delivery_date: day(5 + 21), delivery_date_tbd: false } } }],
  };
});

/* ── Purchase Orders ───────────────────────────────────────────────────── */
type PoLine = { id: string; sku: string; qty: number; received_qty: number; damaged_qty: number; wrong_item_qty: number; model_name: string; size: string };
type Po = {
  id: string; supplier_id: string; version: number; placed_at: string; eta_date: string | null; official_delivery_date: string | null;
  orderIds: number[]; window: string | null; sent: boolean; lines: PoLine[];
};
const line = (po: string, i: number, sku: string, qty: number, model: string, size: string, received = 0): PoLine => ({
  id: `0000000${i}-${po.slice(-4)}-4000-8000-000000000000`.slice(0, 36).replace(/[^0-9a-f-]/g, "0"),
  sku, qty, received_qty: received, damaged_qty: 0, wrong_item_qty: 0, model_name: model, size,
});
const uuidFor = (po: string, i: number) => `00000000-0000-4000-8${String(i).padStart(3, "0")}-${po.replace(/\D/g, "").slice(-12).padStart(12, "0")}`;

const W_A = `${past(34)}T11:00`; // Missed: two POs to Nice Future not sent (Ohana's sent)
const W_B = `${past(31)}T16:00`; // Missed: three POs to Nice Future not sent
const W_C = `${past(14)}T11:30`; // Missed: one PO to Nice Future not sent
const W_D = `${past(4)}T11:00`;  // Missed: nothing issued yet — buy first
const W_F = `${day(4)}T11:30`;   // Friday: one PO to Ohana not sent

export const POS: Po[] = [
  { id: "PO-260903-4585", supplier_id: SUP.nice, version: 1, placed_at: `${W_A.slice(0, 10)}T03:00:00Z`, eta_date: past(20), official_delivery_date: past(20), orderIds: [1203, 1205], window: W_A, sent: false, lines: [] },
  { id: "PO-260903-7907", supplier_id: SUP.nice, version: 1, placed_at: `${W_A.slice(0, 10)}T03:00:00Z`, eta_date: past(20), official_delivery_date: past(20), orderIds: [1205, 1206], window: W_A, sent: false, lines: [] },
  { id: "PO-260903-4316", supplier_id: SUP.ohana, version: 1, placed_at: `${W_A.slice(0, 10)}T03:00:00Z`, eta_date: past(20), official_delivery_date: past(20), orderIds: [1203], window: W_A, sent: true, lines: [] },
  { id: "PO-260904-5101", supplier_id: SUP.nice, version: 1, placed_at: `${W_B.slice(0, 10)}T08:00:00Z`, eta_date: past(10), official_delivery_date: past(10), orderIds: [1369], window: W_B, sent: false, lines: [] },
  { id: "PO-260904-5102", supplier_id: SUP.nice, version: 1, placed_at: `${W_B.slice(0, 10)}T08:00:00Z`, eta_date: past(10), official_delivery_date: past(10), orderIds: [1371], window: W_B, sent: false, lines: [] },
  { id: "PO-260904-5103", supplier_id: SUP.nice, version: 1, placed_at: `${W_B.slice(0, 10)}T08:00:00Z`, eta_date: past(10), official_delivery_date: past(10), orderIds: [1372], window: W_B, sent: false, lines: [] },
  { id: "PO-260922-8987", supplier_id: SUP.nice, version: 1, placed_at: `${W_C.slice(0, 10)}T03:30:00Z`, eta_date: day(8), official_delivery_date: day(8), orderIds: [1373], window: W_C, sent: false, lines: [] },
  { id: "PO-261009-1301", supplier_id: SUP.ohana, version: 1, placed_at: `${TODAY}T01:00:00Z`, eta_date: day(14), official_delivery_date: day(14), orderIds: [1340], window: W_F, sent: false, lines: [] },
  /* Receiving: a passed PO Delivery Date, one line; and a two-line PO for the
     partial receipt (one King short). Neither is gated by the send record. */
  { id: "PO-260903-6426", supplier_id: SUP.nice, version: 1, placed_at: `${past(33)}T03:00:00Z`, eta_date: past(20), official_delivery_date: past(20), orderIds: [1203], window: null, sent: true, lines: [] },
  { id: "PO-261001-1201", supplier_id: SUP.ohana, version: 1, placed_at: `${past(4)}T03:00:00Z`, eta_date: TODAY, official_delivery_date: TODAY, orderIds: [1368, 1205], window: null, sent: false, lines: [] },
  { id: "PO-260915-2205", supplier_id: SUP.ohana, version: 1, placed_at: `${past(20)}T03:00:00Z`, eta_date: day(1), official_delivery_date: day(1), orderIds: [1369], window: null, sent: true, lines: [] },
  /* A shortage already claimed: the rest stays a task until it arrives. */
  { id: "PO-260910-3301", supplier_id: SUP.nice, version: 1, placed_at: `${past(25)}T03:00:00Z`, eta_date: past(12), official_delivery_date: past(12), orderIds: [1206], window: null, sent: true, lines: [] },
];
for (const po of POS) {
  po.lines = po.id === "PO-261001-1201"
    ? [line(po.id, 1, "B1201S-K", 2, "Mattress B1201S", "183X190CM"), line(po.id, 2, "B1201S-Q", 2, "Mattress B1201S", "152X190CM")]
    : po.id === "PO-260903-6426"
      ? [line(po.id, 1, "L1201S-K", 1, "Mattress L1201S", "183X190CM")]
      : po.id === "PO-260910-3301"
        ? [{ ...line(po.id, 1, "M1401F-K", 2, "Mattress M1401F", "183X190CM", 1), damaged_qty: 0 }]
        : po.id === "PO-260903-7907"
          ? Array.from({ length: 10 }, (_, i) => line(po.id, i + 1, i % 2 ? "B1201S-Q" : "B1201S-K", 1, "Mattress B1201S", i % 2 ? "152X190CM" : "183X190CM"))
          : [line(po.id, 1, "B1201S-K", 1, "Mattress B1201S", "183X190CM")];
  po.lines.forEach((l, i) => { l.id = uuidFor(po.id, i + 1); });
}
const supplierName = (id: string) => SUPPLIERS.find((s) => s.id === id)?.name ?? "Supplier";
const docNo = (po: Po) => `${po.id}-V${po.version}`;

/* ── the SO Batch read (demand + lineage), stamped into windows ─────────── */
type Demand = { id: string; so: number; supplierId: string; toBuy: number; window: string };
export const DEMANDS: Demand[] = [{ id: "d-1368", so: 1368, supplierId: SUP.nice, toBuy: 1, window: W_D }];

export function soBatchRead() {
  const rows = DEMANDS.filter((d) => d.toBuy > 0).map((d) => ({
    id: d.id, state: "can_order_early", lineIds: [`l-${d.so}-1`], orderId: orderId(d.so), so: d.so, customer: CUSTOMERS[d.so],
    customerDelivery: day(26), item: "B1201S", variant: "King", category: "mattress", skus: ["B1201S-K"],
    supplierId: d.supplierId, supplier: supplierName(d.supplierId), qtyNeeded: d.toBuy, readyStock: 0, takenFromStock: 0, onPo: 0,
    fullyOnPo: false, poNumbers: [], toBuy: d.toBuy, goodsMustArrive: day(10),
    issueRef: { proposalKey: `${d.supplierId}::mattress`, buildKey: d.id }, action: null,
    parts: [{ sku: "B1201S-K", qty: d.toBuy, unitCost: 100 }], supplierKind: "own_logistics",
    supplierAddress: "8 Example Industrial Road, Selangor", poDate: TODAY, poDeliveryDate: day(7), poDeliveryWorkingDays: 7,
    orderBy: TODAY, ownerName: "Shasha", ownerDuty: null, poWindow: d.window,
  }));
  const byOrder = new Map<number, Po[]>();
  for (const po of POS.filter((p) => p.window)) for (const so of po.orderIds) byOrder.set(so, [...(byOrder.get(so) ?? []), po]);
  const registerRows = ORDERS.map((o) => ({
    orderId: o.id, so: o.so, customer: o.customer_name, status: (byOrder.get(o.so)?.length ? "ordered" : "blank"),
    proceededAt: o.proceeded_at, requestedDeliveryDate: o.delivery_date, deliveryCity: o.customer_address_city, deliveryState: "Selangor",
    pos: (byOrder.get(o.so) ?? []).map((po) => ({
      poId: po.id, status: "open", supplierId: po.supplier_id, supplierName: supplierName(po.supplier_id), destinationId: KLANG,
      officialDeliveryDate: po.official_delivery_date, sentCurrentVersion: po.sent, version: po.version, poWindow: po.window,
    })),
    lines: [{ orderLineId: `l-${o.so}-1`, sku: "B1201S-K", qty: 1, stockTaken: 0, item: "B1201S", variant: "King", category: "mattress",
      pos: (byOrder.get(o.so) ?? []).map((po) => ({ poId: po.id, qty: 1 })) }],
    outstandingSuppliers: rows.some((r) => r.orderId === o.id) ? ["Nice Future"] : [],
  }));
  return {
    today: TODAY, rows, registerRows,
    destinations: [{ id: KLANG, name: "Carres Klang", address: "10 Example Warehouse Road, 42100 Klang", isDefault: true, active: true }],
    defaultDestinationId: KLANG, currentPoDuty: { userId: ME, name: "Shasha" }, actingPoDuty: null,
    poDutyNameUnavailable: false, poDutyUnavailable: false, mayIssue: true, procurementPartners: [], safetyDays: 14,
  };
}

/* ── the Work feed — rebuilt from the fixtures on every read ────────────── */
type TaskSeed = {
  id: string; module: OperationWorkModule; ruleKey: string; kind: string; objectId: string; label: string;
  problem: string; action: string; recipient: string | null; due: string | null; destination: string;
  embedded?: string; covered?: boolean;
};
function workItem(t: TaskSeed): OperationWorkItem {
  const missed = t.due !== null && (t.due < TODAY || (t.kind === "po_window" && Date.parse(`${t.objectId}:00+08:00`) <= Date.now()));
  return {
    contractVersion: 2, id: t.id, module: t.module, ruleKey: t.ruleKey, ruleVersion: 1,
    object: { kind: t.kind, id: t.objectId, label: t.label },
    problem: t.problem, action: t.action, recipient: t.recipient,
    requiredResult: "Recorded by the owning module", completionPredicate: "source fact exists", completionStatement: "Recorded by the owning module",
    owner: {
      rule: t.module === "purchasing" ? "po_duty" : "salesperson", dutyKey: t.module === "purchasing" ? "po_duty" : null,
      normal: t.covered ? { userId: OTHER, name: "{normal owner}" } : { userId: ME, name: "Shasha" },
      activeCover: t.covered ? { userId: ME, name: "Shasha" } : null,
      coverEvidence: t.covered ? { id: "cover-1", startsOn: TODAY, endsOn: TODAY } : null,
      acting: { userId: ME, name: "Shasha" }, state: t.covered ? "covered" : "primary",
    },
    timing: {
      businessDueOn: t.due, actionOn: t.due,
      placement: t.due === null ? "no_working_date" : missed ? "missed" : "on_day",
      missedAge: missed ? { state: "counted", workingDays: 1, basis: { calendarKey: "module+person", from: t.due!, to: TODAY } } : { state: "not_calculable", workingDays: null, basis: null },
      eligibility: "eligible", noDateReason: t.due === null ? "The owning module has not set a working date" : null,
      calendar: { module: { key: t.module, source: t.module, state: "ready" }, actor: { key: "person:shasha", source: "people", state: "ready" }, holidayName: null },
    },
    communication: null, blocker: null, nextConsequence: null,
    interaction: t.embedded
      ? { mode: "embedded", actionKey: t.embedded, componentKey: t.embedded, capability: "SIMULATED in the local walk", inputContract: "-", evidenceContract: "-", idempotencyKey: "-", staleVersion: "-", staleRefusal: "-", successReceipt: "-", fallbackDestination: t.destination }
      : { mode: "open_module", fallbackDestination: t.destination },
    destination: t.destination,
    observedAt: `${TODAY}T01:00:00.000Z`, sourceVersion: `${TODAY}T01:00:00.000Z`,
    tone: missed ? "warning" : "info", locked: false, broken: false,
  } as OperationWorkItem;
}

const windowTime = (key: string) => {
  const [h, m] = key.slice(11).split(":").map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** Which deliveries are still open (a saved scheduled delivery closes one). */
export const DELIVERY_OPEN = new Map<number, string | null>([
  [1313, past(3)], [1368, TODAY], [1369, day(1)], [1371, day(2)], [1372, day(4)], [1373, day(5)], [1206, null],
]);
/** Which receipts are still owed (a full receipt closes one). */
const RECEIVE_DUE: Record<string, string> = {
  "PO-260903-6426": past(20), "PO-261001-1201": TODAY, "PO-260915-2205": day(1), "PO-260910-3301": past(12),
};
const CLAIMED: Record<string, string> = { "PO-260910-3301": "SC-260920-0003" };

export function workFeed(): OperationWorkResponse {
  const seeds: TaskSeed[] = [];
  /* Purchasing: one Work item per batch window that still owes something. */
  for (const key of [W_A, W_B, W_C, W_D, W_F]) {
    const unsent = POS.filter((p) => p.window === key && !p.sent);
    const demand = DEMANDS.filter((d) => d.window === key && d.toBuy > 0);
    if (!unsent.length && !demand.length) continue;
    seeds.push({
      id: `purchasing:${key}:purchasing.po_window`, module: "purchasing", ruleKey: "purchasing.po_window", kind: "po_window",
      objectId: key, label: `${windowTime(key)} PO window`,
      problem: demand.length ? "Purchase order required" : "Sending not confirmed",
      action: demand.length ? `Issue the POs by ${windowTime(key)}` : `Send ${docNo(unsent[0]!)} to ${supplierName(unsent[0]!.supplier_id)}`,
      recipient: supplierName((unsent[0] ?? POS.find((p) => p.supplier_id === demand[0]?.supplierId))?.supplier_id ?? SUP.nice),
      due: key.slice(0, 10), destination: `/operation?tab=purchase&window=${encodeURIComponent(key)}`,
      embedded: unsent.length ? "purchasing.po_issue_evidence" : undefined,
    });
  }
  /* Warehouse: receive what a PO still owes — never gated by its send record. */
  for (const [poId, due] of Object.entries(RECEIVE_DUE)) {
    const po = POS.find((p) => p.id === poId)!;
    const received = po.lines.reduce((n, l) => n + l.received_qty, 0);
    const ordered = po.lines.reduce((n, l) => n + l.qty, 0);
    if (received >= ordered) continue;
    const some = received > 0;
    seeds.push({
      id: `receiving:${poId}:warehouse.receive`, module: "receiving", ruleKey: "warehouse.receive (SIMULATED rule)", kind: "purchase_order",
      objectId: poId, label: `${poId}-V1`,
      problem: CLAIMED[poId] ? `Supplier Claim ${CLAIMED[poId]} open · items still to receive` : some ? "Items still to receive" : "Goods to receive",
      action: some ? `Receive the rest from ${supplierName(po.supplier_id)}` : `Receive goods from ${supplierName(po.supplier_id)}`,
      recipient: supplierName(po.supplier_id), due, destination: `/operation?tab=receiving&po=${encodeURIComponent(poId)}`,
    });
  }
  /* Delivery: call the logistics company (never the customer). */
  for (const [so, due] of DELIVERY_OPEN) {
    seeds.push({
      id: `delivery:SO-${so}:confirm_delivery_date`, module: "delivery", ruleKey: "confirm_delivery_date", kind: "delivery_scope",
      objectId: orderId(so), label: `SO-${so}`, problem: "The delivery is not scheduled", action: "Call AL", recipient: "AL",
      due, destination: `/operation/orders/so/${orderId(so)}`, embedded: "delivery.confirm_date",
    });
  }
  /* Payment (covering a colleague today) and the Issue Tracker. */
  seeds.push({
    id: "payment:SO-1340:collect", module: "payment", ruleKey: "collect", kind: "sales_order", objectId: orderId(1340), label: "SO-1340",
    problem: "Customer payment should have been received", action: "Ask customer to pay · Kimmy", recipient: "Kimmy",
    due: past(3), destination: `/operation/orders/so/${orderId(1340)}`, covered: true,
  });
  seeds.push({
    id: "issue_tracker:ISS-0042:reply", module: "issue_tracker", ruleKey: "reply", kind: "issue", objectId: "ISS-0042", label: "ISS-0042",
    problem: "Issue waiting for a reply", action: "Reply to Li Ching", recipient: "Li Ching", due: day(1), destination: "/operation?tab=service-notes",
  });
  const items = SCENARIO === "nothing" ? [] : seeds.map(workItem);
  return {
    contractVersion: 2, complete: SCENARIO !== "failed", generatedOn: TODAY, closureReceipt: null,
    staff: [{ userId: ME, name: "Shasha", email: "sha@carres.example" }],
    sources: (["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((key) => ({
      key,
      state: SCENARIO === "failed" && key === "delivery" ? ("read_failed" as never) : ("healthy" as const),
      observedAt: `${TODAY}T01:00:00.000Z`, lastSuccessfulAt: `${TODAY}T02:42:00.000Z`,
      errorLabel: SCENARIO === "failed" && key === "delivery" ? "read failed" : null,
    })),
    items,
  } as OperationWorkResponse;
}

/* ── the simulated API ──────────────────────────────────────────────────── */
const ARRANGEMENTS: Array<Record<string, unknown>> = [];
const SENDS: Record<string, Array<Record<string, unknown>>> = {};
let nextPo = 1104;
export const SIMULATED_LOG: string[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function poRow(po: Po) {
  return {
    id: po.id, supplier_id: po.supplier_id, warehouse_id: KLANG, destination_id: KLANG, status: "open", sup_status: "pending",
    so: null, so_refs: null, eta_date: po.eta_date, official_delivery_date: po.official_delivery_date, expected_ready_date: null,
    purpose: "customer_sales", version: po.version, placed_at: po.placed_at,
    sources: po.orderIds.map((so) => ({ kind: "sales_order", reference: `SO-${so}`, order_id: orderId(so) })),
    grns: [], promises: [],
    sends: [...(po.sent ? [{ channel: "whatsapp", note: null, sent_at: `${po.placed_at.slice(0, 10)}T06:00:00Z`, kind: "confirmed_sent", recipient: "group", po_version: po.version, sent_by_name: "Yu Jun", duty_name: "Yu Jun", acting_name: null, po_revisions: null }] : []), ...(SENDS[po.id] ?? [])],
    purchase_order_lines: po.lines.map((l) => ({
      ...l, destination_id: KLANG, identity_mode: "quantity", attrs: { category: "Mattress" }, governed_sources: [],
      sources: po.orderIds.map((so) => ({ so, qty: 1 })),
    })),
  };
}
function printData(po: Po) {
  const dest = { name: "Carres Klang", address: "10 Example Warehouse Road, 42100 Klang, Selangor." };
  return {
    po_number: po.id, po_id: po.id, version: po.version, issue_date: po.placed_at.slice(0, 10),
    supplier: { name: supplierName(po.supplier_id), address: "8 Example Industrial Road, Selangor.", contact: null },
    destination: dest, delivery_instructions: null, eta_date: po.official_delivery_date, delivery_working_days: 7,
    delivery_method: "supplier_delivers", terms: null, issued_by: "Yu Jun", so_refs: po.orderIds,
    lines: po.lines.map((l) => ({ sku: l.sku, description: `${l.model_name} · ${l.size}`, qty: l.qty, unit: "unit", destination: dest, attrs: { category: "Mattress" }, identity_mode: "quantity", unit_codes: [], sources: [{ so: po.orderIds[0], qty: l.qty }] })),
  };
}
const issued = (po: Po) => ({
  id: po.id, supplierId: po.supplier_id, supplierName: supplierName(po.supplier_id), destinationId: KLANG, destination: "Carres Klang",
  whatsappGroupUrl: SUPPLIERS.find((s) => s.id === po.supplier_id)?.whatsapp_group_url ?? null,
  contactEmail: SUPPLIERS.find((s) => s.id === po.supplier_id)?.contact_email ?? null, poSendChannel: null, contact: null, version: po.version,
});
const salesOrderData = (o: (typeof ORDERS)[number]) => ({
  order_id: o.id, so_number: `SO-${o.so}`, order_code: `SO-${o.so}`, issue_date: "2026-09-30", currency: "MYR",
  customer: { name: o.customer_name, phone: o.customer_phone, email: null, address: o.customer_address },
  dealer: { name: "Carres HQ", contact: null, salesperson_name: "Alvin", outlet_name: "Carres Kota Damansara" }, partner: null,
  lines: [{ sku: "B1201S-K", description: "B1201S · King", qty: 1, unit_price: 2499, line_total: 2499, attrs: { size: "King" } }],
  addons: [{ sku: "SVC-DISPOSE", label: "Dispose old bed frame", qty: 1, unit_price: 100, line_total: 100, attrs: { size: "King" } }],
  payments: [], subtotal: 2599, total: 2599, paid: 1380, balance_due: 1219, delivery_date: o.delivery_date,
});

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  /* Supabase Storage (the signed DO upload): accepted, nothing stored. */
  if (url.includes("placeholder.supabase.co/storage")) {
    SIMULATED_LOG.push(`upload ${url.split("/").pop()}`);
    return json({ Key: "delivery-orders/simulated.pdf", path: "simulated.pdf" });
  }
  if (!url.includes("127.0.0.1:8888")) return realFetch(input, init);
  const path = new URL(url).pathname;
  const q = new URL(url).searchParams;

  if (path === "/api/operation/work") {
    if (SCENARIO === "loading") return new Promise<Response>(() => {});
    if (SCENARIO === "failed-no-data") return json({ message: "read failed" }, 500);
    return json(workFeed());
  }

  /* ── SIMULATED writes ── */
  if (method !== "GET") {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    const confirm = /^\/api\/operation\/pos\/([^/]+)\/confirm-sent$/.exec(path);
    if (confirm) {
      const id = decodeURIComponent(confirm[1]!).replace(/-V\d+$/, "");
      const po = POS.find((p) => p.id === id);
      if (po) {
        po.sent = true;
        (SENDS[po.id] ??= []).push({ channel: String(body.channel ?? "whatsapp"), note: null, sent_at: new Date().toISOString(), kind: "confirmed_sent", recipient: String(body.recipient ?? "group"), po_version: po.version, sent_by_name: "Shasha", duty_name: "Shasha", acting_name: null, po_revisions: null });
      }
      SIMULATED_LOG.push(`PO sent to supplier ${id}`);
      return json({ ok: true, simulated: true });
    }
    if (path === "/api/operation/purchase/to-order/issue-batch") {
      const selections = (body.selections ?? []) as Array<{ demandId: string }>;
      const made: Po[] = [];
      for (const sel of selections) {
        const d = DEMANDS.find((x) => x.id === sel.demandId);
        if (!d || d.toBuy <= 0) continue;
        const po: Po = { id: `PO-${TODAY.slice(2).replaceAll("-", "")}-${nextPo++}`, supplier_id: d.supplierId, version: 1, placed_at: new Date().toISOString(), eta_date: day(9), official_delivery_date: day(9), orderIds: [d.so], window: d.window, sent: false, lines: [] };
        po.lines = [line(po.id, 1, "B1201S-K", d.toBuy, "Mattress B1201S", "183X190CM")];
        po.lines[0]!.id = uuidFor(po.id, 1);
        POS.push(po);
        d.toBuy = 0;
        made.push(po);
      }
      SIMULATED_LOG.push(`issued ${made.map((p) => p.id).join(", ")}`);
      return json({ pos: made.map(issued), simulated: true });
    }
    const arrangement = /^\/api\/operation\/delivery-arrangements\/([^/]+)$/.exec(path);
    if (arrangement && method === "PUT") {
      const order = ORDERS.find((o) => o.id === arrangement[1]);
      const row = {
        id: `arr-${Date.now()}`, order_id: arrangement[1], leg: Number(q.get("leg") ?? 0), partner_id: body.partnerId ?? AL, partner_name: "AL",
        confirmed_date: body.confirmedDate, confirmed_time: body.confirmedTime ?? null, expected_arrival: null, logistics_note: null,
        reply_proof_path: body.replyProofPath ?? null, driver_name: null, vehicle: null, condo_registration: null,
        updated_at: new Date().toISOString(), updated_by: ME,
      };
      ARRANGEMENTS.splice(0, ARRANGEMENTS.length, ...ARRANGEMENTS.filter((a) => a.order_id !== row.order_id), row);
      if (order) DELIVERY_OPEN.delete(order.so);
      SIMULATED_LOG.push(`scheduled delivery ${order ? `SO-${order.so}` : arrangement[1]}`);
      return json({ arrangement: row, simulated: true });
    }
    const receive = /^\/api\/operation\/pos\/([^/]+)\/office-receive$/.exec(path);
    if (receive) {
      const po = POS.find((p) => p.id === decodeURIComponent(receive[1]!));
      for (const l of (body.lines ?? []) as Array<{ id: string; receivedNow: number; damagedQty?: number; wrongItemQty?: number }>) {
        const pl = po?.lines.find((x) => x.id === l.id);
        if (!pl) continue;
        pl.received_qty += l.receivedNow;
        pl.damaged_qty += l.damagedQty ?? 0;
        pl.wrong_item_qty += l.wrongItemQty ?? 0;
      }
      SIMULATED_LOG.push(`receipt saved ${po?.id}`);
      return json({ receiptId: "99999999-9999-4999-8999-999999999999", grnNo: "GRN-SIMULATED", simulated: true });
    }
    if (path === "/api/storage/dos/sign-upload") return json({ token: "simulated", path: `simulated/${Date.now()}.pdf` });
    return json({ code: "simulated_refused", message: "This local walk does not save that." }, 405);
  }

  /* ── reads ── */
  if (path === "/api/operation/purchase/demands") return json(soBatchRead());
  if (path === "/api/operation/suppliers") return json({ suppliers: SUPPLIERS });
  if (path === "/api/operation/partners") return json({ partners: [{ id: AL, name: "AL", whatsapp_group_url: "https://chat.whatsapp.com/al-example", has_portal: false }] });
  if (path === "/api/operation/delivery-arrangements") return json({ arrangements: ARRANGEMENTS, events: [], contacts: [] });
  if (path === "/api/operation/delivery-orders") return json({ deliveryOrders: [], attempts: [], handoverEvents: [], proofReviews: [], attemptEvidence: [] });
  if (path === "/api/operation/delivery-settings") return json({ templates: [], settings: null });
  if (path === "/api/operation/purchasing/settings") return json({});
  if (path === "/api/operation/workspace-duties") return json({ can_assign: false, duties: [] });
  if (path === "/api/operation/staff") return json({ staff: [{ user_id: ME, email: "sha@carres.example", name: "Shasha", pooled: true, available: true, note: null, last_seen_at: null, duties: [] }], myDuties: [], salespersons: [] });
  if (path === "/api/operation/register-layouts") return json({ layouts: [], limit: 10 });
  if (path === "/api/operation/supplier-claims") return json({ claims: [], counts: { open: 0, closed: 0, all: 0 } });
  if (path === "/api/operation/warehouse") return json({ warehouses: [{ id: KLANG, name: "Carres Klang", address: "Klang" }] });
  if (path === "/api/operation/warehouse-receipts/receiver") return json({ receiver: { kind: "staff", name: "Shasha" } });
  if (path === "/api/catalog") return json({ models: [{ id: "m1", modelKey: "B1201S", name: "B1201S", category: "mattress", blurb: null, colors: null, gaps: null, sofaMode: null }], skus: [{ id: "s1", modelId: "m1", sku: "B1201S-K", variant: "King", variantKind: "size", price: 2499, cost: null }], sofaFabrics: [], addons: [{ key: "SVC-DISPOSE", name: "Dispose old bed frame", price: 100 }], floorConfig: {} });
  const timeline = /^\/api\/operation\/orders\/([^/]+)\/timeline$/.exec(path);
  if (timeline) return json([]);
  const expansion = /^\/api\/operation\/orders\/([^/]+)\/expansion$/.exec(path);
  if (expansion) return json({ lines: [] });
  if (path === "/api/operation/orders") {
    const one = q.get("orderId");
    return json({ orders: one ? ORDERS.filter((o) => o.id === one) : ORDERS, total: ORDERS.length });
  }
  if (path === "/api/operation/orders/register-facts") return json({ facts: {} });
  const sod = /^\/api\/orders\/([^/]+)\/sales-order-data$/.exec(path);
  if (sod) {
    const o = ORDERS.find((x) => x.id === decodeURIComponent(sod[1]!));
    return o ? json(salesOrderData(o)) : json({ message: "not found" }, 404);
  }
  if (path === "/api/operation/pos") {
    const one = q.get("poId");
    const list = one ? POS.filter((p) => p.id === one) : POS;
    return json({ pos: list.map(poRow), destinations: [{ id: KLANG, name: "Carres Klang", is_default: true }], referencedDestinations: [], messageTemplate: "Hi {supplier}, please find our purchase order {po} attached. Thank you." });
  }
  const poPath = /^\/api\/operation\/pos\/([^/]+)\/(print-data|sends|issue-context|receiving|units)$/.exec(path);
  if (poPath) {
    const po = POS.find((p) => p.id === decodeURIComponent(poPath[1]!).replace(/-V\d+$/, ""));
    if (!po) return json({ code: "po_not_found", message: "Purchase Order not found." }, 404);
    if (poPath[2] === "print-data") return json(printData(po));
    if (poPath[2] === "sends") return json({ sends: poRow(po).sends });
    if (poPath[2] === "issue-context") return json(issued(po));
    if (poPath[2] === "units") return json({ units: [] });
    return json({ events: [], expected_units: [] });
  }
  return json({ message: "not seeded in the local walk" }, 404);
};
