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
 * The default week follows the reviewed storyboard (tasks-complete-ux.html,
 * corrected 2026-10-05): Purchasing 6 · Warehouse 2 · Delivery 7 · Payment 1 ·
 * Issue Tracker 1 = 17; Missed 7 · Mon 2 · Tue 3 · Wed 1 · Thu 0 · Fri 2 ·
 * Sat 1 · No date 1. Every party, number and date is invented; dates are
 * generated from this machine's clock so Missed, today and the week exist.
 */
import type { OperationWorkItem, OperationWorkModule, OperationWorkResponse } from "@carres/shared";
import { addDaysIso, weekStartIso } from "@/lib/excel-date-filter";
import { appTodayIso } from "@/lib/fmt-date";

(window as unknown as { __carresSimulated: boolean }).__carresSimulated = true;

export const SCENARIOS = [
  "default", "loading", "failed", "failed-no-data", "nothing",
  "reminder-first-entry", "reminder-zero", "reminder-acknowledged", "reminder-draft",
] as const;
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
const NETS = "33333333-3333-4333-8333-3333333333a2";
export const SUPPLIERS = [
  { id: SUP.nice, name: "Nice Future", kind: "own_logistics", cat_covered: [], lead_time: null, contact: null, contact_email: "po@nicefuture.example", whatsapp_group_url: "https://chat.whatsapp.com/nice-future-example", po_send_channel: null },
  { id: SUP.ohana, name: "Ohana", kind: "own_logistics", cat_covered: [], lead_time: null, contact: null, contact_email: null, whatsapp_group_url: "https://chat.whatsapp.com/ohana-example", po_send_channel: null },
];
const PARTNERS = [
  { id: AL, name: "AL", whatsapp_group_url: "https://chat.whatsapp.com/al-example", has_portal: false },
  { id: NETS, name: "NETS", whatsapp_group_url: "https://chat.whatsapp.com/nets-example", has_portal: false },
];

/* ── Sales Orders ───────────────────────────────────────────────────────── */
const orderId = (so: number) => `00000000-0000-4000-8000-${String(so).padStart(12, "0")}`;
const CUSTOMERS: Record<number, string> = {
  1368: "Jimmy", 1313: "Tan Ah Kow", 1340: "Jimmy", 1296: "YH2", 1364: "Siti", 1367: "PETER", 1371: "ANNE",
  1206: "UMIO", 1203: "ABC", 1205: "TOMMY", 1369: "Mohd Hafiz", 1372: "Kimmy", 1373: "Nurul Aisyah",
};
export const ORDERS = Object.entries(CUSTOMERS).map(([so, name]) => {
  const n = Number(so);
  const requested = n === 1368 ? day(26) : day(10 + (n % 9));
  return {
    id: orderId(n), so: n, status: "proceed_order", operation_stage: "confirmed", warehouse_id: null,
    customer_name: name, customer_phone: `019-83372${String(n).slice(-3)}`, customer_email: null,
    customer_address: n === 1368 ? "1888. jalan Pillow, 68000 Ampang, Selangor" : `${n % 90} Jalan Example, 41000 Klang, Selangor`,
    customer_address_line1: `${n % 90} Jalan Example`, customer_address_line2: null,
    customer_address_city: n === 1368 ? "Ampang" : "Klang", customer_address_state: "Selangor", customer_address_postcode: "41000",
    building_type: null, delivery_floor: null, delivery_has_lift: null,
    placed_at: "2026-09-30T02:00:00Z", proceeded_at: "2026-09-30T03:00:00Z", proceed_date: "2026-09-30",
    delivery_date: requested, delivery_date_tbd: false, source_system: null, source_ref: null,
    salesperson_id: "sp", salespersons: { name: "Alvin" },
    outlet_id: "outlet-1", outlets: { name: "Carres Kota Damansara" }, dealer_id: null, dealers: null,
    order_lines: [{ id: `l-${n}-1`, sku: "B1201S-K", qty: 1, unit_price: 2499, attrs: { category: "mattress" } }],
    order_addons: [], paid: 1380, delivery_partner_id: null, request_for_delivery_at: null, partner_accepted_at: null,
    partner_rejected_at: null, partner_rejected_reason: null, delivery_partners: null, do_number: null,
    dispatched_at: null, delivered_at: null, order_supplier_threads: [], order_annotations: [],
    order_finance_exceptions: [], ops_delivery_orders: [], po_numbers: [], allocated_units: [{ sku: "B1201S-K", status: "reserved", qty: 1 }],
    original_request: [{ revision: 1, snapshot: { header: { delivery_date: requested, delivery_date_tbd: false } } }],
  };
});

/* ── Purchase Orders ───────────────────────────────────────────────────── */
type PoLine = { id: string; sku: string; qty: number; received_qty: number; damaged_qty: number; wrong_item_qty: number; model_name: string; size: string };
type Po = {
  id: string; supplier_id: string; version: number; placed_at: string; eta_date: string | null; official_delivery_date: string | null;
  orderIds: number[]; window: string | null; sent: boolean; lines: PoLine[];
};
const uuidFor = (po: string, i: number) => `00000000-0000-4000-8${String(i).padStart(3, "0")}-${po.replace(/\D/g, "").slice(-12).padStart(12, "0")}`;
const line = (po: string, i: number, sku: string, qty: number, model: string, size: string, received = 0): PoLine => ({
  id: uuidFor(po, i), sku, qty, received_qty: received, damaged_qty: 0, wrong_item_qty: 0, model_name: model, size,
});

const W_A = `${past(34)}T11:00`; // Missed: 2 POs to Nice Future not sent (Ohana's sent)
const W_B = `${past(31)}T16:00`; // Missed: 14 POs to Nice Future not sent
const W_C = `${past(14)}T11:30`; // Missed: one PO to Nice Future not sent
const W_D = `${past(4)}T11:00`;  // Missed: nothing issued yet — buy first
const W_F = `${day(4)}T11:30`;   // Friday: one PO to Ohana not sent

const po = (id: string, supplier: string, window: string | null, sent: boolean, orderIds: number[], eta: string | null): Po => ({
  id, supplier_id: supplier, version: 1, placed_at: `${(window ?? past(30)).slice(0, 10)}T03:00:00Z`, eta_date: eta, official_delivery_date: eta,
  orderIds, window, sent, lines: [],
});
export const POS: Po[] = [
  po("PO-260903-4585", SUP.nice, W_A, false, [1203, 1205], past(20)),
  po("PO-260903-7907", SUP.nice, W_A, false, [1205, 1206], past(20)),
  po("PO-260903-4316", SUP.ohana, W_A, true, [1203], past(20)),
  ...Array.from({ length: 14 }, (_, i) => po(`PO-260904-${5101 + i}`, SUP.nice, W_B, false, [[1369, 1371, 1372][i % 3]!], past(10))),
  po("PO-260922-8987", SUP.nice, W_C, false, [1373], day(8)),
  po("PO-261009-1301", SUP.ohana, W_F, false, [1340], day(14)),
  /* A passed supplier date with no physical report — PO Duty asks. */
  po("PO-260903-6426", SUP.nice, null, true, [1203], past(20)),
  /* Two submitted arrival reports from the warehouse. */
  po("PO-261001-1201", SUP.ohana, null, true, [1368, 1205], TODAY),
  po("PO-260915-2205", SUP.ohana, null, true, [1369], day(1)),
];
for (const p of POS) {
  p.lines = p.id === "PO-261001-1201"
    ? [line(p.id, 1, "B1201S-K", 2, "Mattress B1201S", "183X190CM"), line(p.id, 2, "B1201S-Q", 1, "Mattress B1201S", "152X190CM")]
    : p.id === "PO-260903-6426"
      ? [line(p.id, 1, "L1201S-K", 1, "Mattress L1201S", "183X190CM")]
      : p.id === "PO-260903-7907"
        ? Array.from({ length: 10 }, (_, i) => line(p.id, i + 1, i % 2 ? "B1201S-Q" : "B1201S-K", 1, "Mattress B1201S", i % 2 ? "152X190CM" : "183X190CM"))
        : [line(p.id, 1, "B1201S-K", 1, "Mattress B1201S", "183X190CM")];
}
const supplierName = (id: string) => SUPPLIERS.find((s) => s.id === id)?.name ?? "Supplier";
const docNo = (p: Po) => `${p.id}-V${p.version}`;

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
  for (const p of POS.filter((x) => x.window)) for (const so of p.orderIds) byOrder.set(so, [...(byOrder.get(so) ?? []), p]);
  const registerRows = ORDERS.map((o) => ({
    orderId: o.id, so: o.so, customer: o.customer_name, status: (byOrder.get(o.so)?.length ? "ordered" : "blank"),
    proceededAt: o.proceeded_at, requestedDeliveryDate: o.delivery_date, deliveryCity: o.customer_address_city, deliveryState: "Selangor",
    pos: (byOrder.get(o.so) ?? []).map((p) => ({
      poId: p.id, status: "open", supplierId: p.supplier_id, supplierName: supplierName(p.supplier_id), destinationId: KLANG,
      officialDeliveryDate: p.official_delivery_date, sentCurrentVersion: p.sent, version: p.version, poWindow: p.window,
    })),
    lines: [{ orderLineId: `l-${o.so}-1`, sku: "B1201S-K", qty: 1, stockTaken: 0, item: "B1201S", variant: "King", category: "mattress",
      pos: (byOrder.get(o.so) ?? []).map((p) => ({ poId: p.id, qty: 1 })) }],
    outstandingSuppliers: rows.some((r) => r.orderId === o.id) ? ["Nice Future"] : [],
  }));
  return {
    today: TODAY, rows, registerRows,
    destinations: [{ id: KLANG, name: "Carres Klang", address: "10 Example Warehouse Road, 42100 Klang", isDefault: true, active: true }],
    defaultDestinationId: KLANG, currentPoDuty: { userId: ME, name: "Shasha" }, actingPoDuty: null,
    poDutyNameUnavailable: false, poDutyUnavailable: false, mayIssue: true, procurementPartners: [], safetyDays: 14,
  };
}

/* ── Warehouse: submitted arrival reports, each its own receiving session ── */
type Session = { id: string; poId: string; due: string; status: "submitted" | "posted"; counts: Record<string, number> };
const SESSIONS: Session[] = [
  /* Only 1 of the 2 King arrived: the balance goes to PO Duty after Save. */
  { id: "44444444-4444-4444-8444-000000000001", poId: "PO-261001-1201", due: TODAY, status: "submitted", counts: { [uuidFor("PO-261001-1201", 1)]: 1, [uuidFor("PO-261001-1201", 2)]: 1 } },
  { id: "44444444-4444-4444-8444-000000000002", poId: "PO-260915-2205", due: day(1), status: "submitted", counts: { [uuidFor("PO-260915-2205", 1)]: 1 } },
];
/** PO Duty follow-ups created by a partial receipt (`Ask … balance …`). */
const BALANCE: Array<{ poId: string; due: string }> = [];
/** Supplier answers recorded (SIMULATED) close the PO Duty act. */
const ANSWERED = new Set<string>();

/* ── Delivery: what is still open, per order ────────────────────────────── */
type DeliveryAct = { so: number; rule: "confirm_delivery_date" | "assign_logistics" | "check_delivery_proof"; due: string | null; partner: string | null };
export const DELIVERY_ACTS: DeliveryAct[] = [
  { so: 1313, rule: "confirm_delivery_date", due: past(3), partner: AL },
  { so: 1368, rule: "assign_logistics", due: TODAY, partner: null },
  { so: 1296, rule: "confirm_delivery_date", due: day(1), partner: NETS },
  { so: 1364, rule: "assign_logistics", due: day(2), partner: null },
  { so: 1367, rule: "assign_logistics", due: day(4), partner: null },
  /* Saturday is a Delivery working day: a proof to check on the DO page. */
  { so: 1371, rule: "check_delivery_proof", due: day(5), partner: AL },
  { so: 1206, rule: "confirm_delivery_date", due: null, partner: AL },
];
const DO_1371 = "DO-261003-2101";
const ARRANGEMENTS: Array<Record<string, unknown>> = DELIVERY_ACTS.filter((a) => a.partner).map((a) => ({
  id: `arr-${a.so}`, order_id: orderId(a.so), leg: 0, partner_id: a.partner, partner_name: PARTNERS.find((p) => p.id === a.partner)?.name,
  confirmed_date: a.rule === "check_delivery_proof" ? past(2) : null, confirmed_time: null, expected_arrival: null, logistics_note: null,
  reply_proof_path: null, driver_name: null, vehicle: null, condo_registration: null, updated_at: `${past(5)}T02:00:00Z`, updated_by: ME,
}));

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

function defaultSeeds(): TaskSeed[] {
  const seeds: TaskSeed[] = [];
  /* Purchasing: one Work item per batch window that still owes something. */
  for (const key of [W_A, W_B, W_C, W_D, W_F]) {
    const unsent = POS.filter((p) => p.window === key && !p.sent);
    const demand = DEMANDS.filter((d) => d.window === key && d.toBuy > 0);
    if (!unsent.length && !demand.length) continue;
    const first = unsent[0];
    seeds.push({
      id: `purchasing:${key}:purchasing.po_window`, module: "purchasing", ruleKey: "purchasing.po_window", kind: "po_window",
      objectId: key, label: `${windowTime(key)} PO window`,
      problem: demand.length ? "Purchase order required" : "Sending not confirmed",
      action: demand.length ? `Issue the POs by ${windowTime(key)}` : `Send ${docNo(first!)} to ${supplierName(first!.supplier_id)}`,
      recipient: supplierName(first?.supplier_id ?? demand[0]!.supplierId),
      due: key.slice(0, 10), destination: `/operation?tab=purchase&window=${encodeURIComponent(key)}`,
      embedded: unsent.length ? "purchasing.po_issue_evidence" : undefined,
    });
  }
  /* PO Duty: a passed supplier date with no arrival report. */
  if (!ANSWERED.has("PO-260903-6426")) {
    seeds.push({
      id: "purchasing:PO-260903-6426:purchasing.supplier_date_passed", module: "purchasing", ruleKey: "purchasing.supplier_date_passed",
      kind: "purchase_order", objectId: "PO-260903-6426", label: "PO-260903-6426-V1", problem: "Supplier delivery date passed",
      action: "Ask Nice Future when the goods will arrive", recipient: "Nice Future", due: past(20),
      destination: "/operation/procurement?po=PO-260903-6426",
    });
  }
  /* PO Duty: the balance a partial receipt left owed. */
  for (const b of BALANCE) {
    if (ANSWERED.has(b.poId)) continue;
    const p = POS.find((x) => x.id === b.poId)!;
    const owed = p.lines.reduce((n, l) => n + Math.max(0, l.qty - l.received_qty), 0);
    seeds.push({
      id: `purchasing:${b.poId}:purchasing.balance_date`, module: "purchasing", ruleKey: "purchasing.balance_date",
      kind: "purchase_order", objectId: b.poId, label: docNo(p), problem: `${owed} ${owed === 1 ? "item" : "items"} still due`,
      action: `Ask ${supplierName(p.supplier_id)} for the balance delivery date`, recipient: supplierName(p.supplier_id), due: b.due,
      destination: `/operation/procurement?po=${b.poId}`,
    });
  }
  /* Warehouse: a submitted arrival report opens THAT receiving session. */
  for (const s of SESSIONS.filter((x) => x.status === "submitted")) {
    const p = POS.find((x) => x.id === s.poId)!;
    seeds.push({
      id: `receiving:${s.id}:receiving.check_in`, module: "receiving", ruleKey: "receiving.check_in", kind: "receiving",
      objectId: s.id, label: docNo(p), problem: "Goods arrived · GRN not posted",
      action: `Receive goods from ${supplierName(p.supplier_id)}`, recipient: supplierName(p.supplier_id), due: s.due,
      destination: `/operation?tab=receiving&session=${s.id}`,
    });
  }
  /* Delivery: the logistics company is named, never the customer. */
  for (const a of DELIVERY_ACTS) {
    const partner = PARTNERS.find((p) => p.id === a.partner)?.name ?? null;
    seeds.push(a.rule === "assign_logistics"
      ? { id: `delivery:SO-${a.so}:assign_logistics`, module: "delivery", ruleKey: "assign_logistics", kind: "delivery_scope",
          objectId: orderId(a.so), label: `SO-${a.so}`, problem: "Delivery company not assigned", action: "Assign logistics",
          recipient: null, due: a.due, destination: `/operation/orders/so/${orderId(a.so)}` }
      : a.rule === "check_delivery_proof"
        ? { id: `delivery:${DO_1371}:check_delivery_proof`, module: "delivery", ruleKey: "check_delivery_proof", kind: "delivery_order",
            objectId: DO_1371, label: DO_1371, problem: "Delivery proof not reviewed", action: "Check delivery proof",
            recipient: partner, due: a.due, destination: `/operation/delivery-orders/${DO_1371}` }
        : { id: `delivery:SO-${a.so}:confirm_delivery_date`, module: "delivery", ruleKey: "confirm_delivery_date", kind: "delivery_scope",
            objectId: orderId(a.so), label: `SO-${a.so}`, problem: "Get the scheduled delivery date", action: `Call ${partner}`,
            recipient: partner, due: a.due, destination: `/operation/orders/so/${orderId(a.so)}` });
  }
  /* Payment (covering a colleague today) and the Issue Tracker. */
  seeds.push({
    id: "payment:SO-1340:collect", module: "payment", ruleKey: "collect", kind: "sales_order", objectId: orderId(1340), label: "SO-1340",
    problem: "Customer balance due", action: "Ask Jimmy to pay", recipient: "Jimmy",
    due: past(3), destination: `/operation/orders/so/${orderId(1340)}`, covered: true,
  });
  seeds.push({
    id: "issue_tracker:ISS-0042:reply", module: "issue_tracker", ruleKey: "reply", kind: "issue", objectId: "ISS-0042", label: "ISS-0042",
    problem: "Issue waiting for a reply", action: "Reply to Li Ching", recipient: "Li Ching", due: day(1), destination: "/operation?tab=service-notes",
  });
  return seeds;
}

/** `First entry today` reminder scenario: 3 missed · 5 due today. */
function reminderSeeds(): TaskSeed[] {
  const s = (i: number, due: string, module: OperationWorkModule, action: string): TaskSeed => ({
    id: `delivery:SO-13${50 + i}:confirm_delivery_date`, module, ruleKey: module === "delivery" ? "confirm_delivery_date" : "collect",
    kind: module === "delivery" ? "delivery_scope" : "sales_order", objectId: orderId(1313), label: `SO-13${50 + i}`,
    problem: module === "delivery" ? "Get the scheduled delivery date" : "Customer balance due", action, recipient: null,
    due, destination: `/operation/orders/so/${orderId(1313)}`,
  });
  return [
    s(1, past(3), "delivery", "Call AL"), s(2, past(2), "delivery", "Call NETS"), s(3, past(1), "payment", "Ask Jimmy to pay"),
    s(4, TODAY, "delivery", "Call AL"), s(5, TODAY, "delivery", "Call NETS"), s(6, TODAY, "delivery", "Call AL"),
    s(7, TODAY, "payment", "Ask Siti to pay"), s(8, TODAY, "delivery", "Call AL"),
  ];
}

export function workFeed(): OperationWorkResponse {
  const seeds = SCENARIO === "nothing" || SCENARIO === "reminder-zero" ? []
    : SCENARIO === "reminder-first-entry" ? reminderSeeds()
      : defaultSeeds();
  return {
    contractVersion: 2, complete: SCENARIO !== "failed", generatedOn: TODAY, closureReceipt: null,
    staff: [{ userId: ME, name: "Shasha", email: "sha@carres.example" }],
    sources: (["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((key) => ({
      key,
      state: SCENARIO === "failed" && key === "delivery" ? ("failed" as const) : ("healthy" as const),
      observedAt: `${TODAY}T01:00:00.000Z`, lastSuccessfulAt: `${TODAY}T02:42:00.000Z`,
      errorLabel: SCENARIO === "failed" && key === "delivery" ? "read failed" : null,
    })),
    items: seeds.map(workItem),
  } as OperationWorkResponse;
}

/* ── the simulated API ──────────────────────────────────────────────────── */
const SENDS: Record<string, Array<Record<string, unknown>>> = {};
const PROMISES: Record<string, Array<Record<string, unknown>>> = {};
let nextPo = 1104;
export const SIMULATED_LOG: string[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function poRow(p: Po) {
  return {
    id: p.id, supplier_id: p.supplier_id, warehouse_id: KLANG, destination_id: KLANG, status: "open", sup_status: "pending",
    so: null, so_refs: null, eta_date: p.eta_date, official_delivery_date: p.official_delivery_date, expected_ready_date: null,
    purpose: "customer_sales", version: p.version, placed_at: p.placed_at,
    sources: p.orderIds.map((so) => ({ kind: "sales_order", reference: `SO-${so}`, order_id: orderId(so) })),
    grns: [], promises: PROMISES[p.id] ?? [],
    sends: [...(p.sent ? [{ channel: "whatsapp", note: null, sent_at: `${p.placed_at.slice(0, 10)}T06:00:00Z`, kind: "confirmed_sent", recipient: "group", po_version: p.version, sent_by_name: "Yu Jun", duty_name: "Yu Jun", acting_name: null, po_revisions: null }] : []), ...(SENDS[p.id] ?? [])],
    purchase_order_lines: p.lines.map((l) => ({
      ...l, destination_id: KLANG, identity_mode: "quantity", attrs: { category: "Mattress" }, governed_sources: [],
      sources: p.orderIds.map((so) => ({ so, qty: 1 })),
    })),
  };
}
function printData(p: Po) {
  const dest = { name: "Carres Klang", address: "10 Example Warehouse Road, 42100 Klang, Selangor." };
  return {
    po_number: p.id, po_id: p.id, version: p.version, issue_date: p.placed_at.slice(0, 10),
    supplier: { name: supplierName(p.supplier_id), address: "8 Example Industrial Road, Selangor.", contact: null },
    destination: dest, delivery_instructions: null, eta_date: p.official_delivery_date, delivery_working_days: 7,
    delivery_method: "supplier_delivers", terms: null, issued_by: "Yu Jun", so_refs: p.orderIds,
    lines: p.lines.map((l) => ({ sku: l.sku, description: `${l.model_name} · ${l.size}`, qty: l.qty, unit: "unit", destination: dest, attrs: { category: "Mattress" }, identity_mode: "quantity", unit_codes: [], sources: [{ so: p.orderIds[0], qty: l.qty }] })),
  };
}
const issued = (p: Po) => ({
  id: p.id, supplierId: p.supplier_id, supplierName: supplierName(p.supplier_id), destinationId: KLANG, destination: "Carres Klang",
  whatsappGroupUrl: SUPPLIERS.find((s) => s.id === p.supplier_id)?.whatsapp_group_url ?? null,
  contactEmail: SUPPLIERS.find((s) => s.id === p.supplier_id)?.contact_email ?? null, poSendChannel: null, contact: null, version: p.version,
});
const salesOrderData = (o: (typeof ORDERS)[number]) => ({
  order_id: o.id, so_number: `SO-${o.so}`, order_code: `SO-${o.so}`, issue_date: "2026-09-30", currency: "MYR",
  customer: { name: o.customer_name, phone: o.customer_phone, email: null, address: o.customer_address },
  dealer: { name: "Carres HQ", contact: null, salesperson_name: "Alvin", outlet_name: "Carres Kota Damansara" }, partner: null,
  lines: [{ sku: "B1201S-K", description: "B1201S · King", qty: 1, unit_price: 2499, line_total: 2499, attrs: { size: "King" } }],
  addons: [{ sku: "SVC-DISPOSE", label: "Dispose old bed frame", qty: 1, unit_price: 100, line_total: 100, attrs: { size: "King" } }],
  payments: [], subtotal: 2599, total: 2599, paid: 1380, balance_due: 1219, delivery_date: o.delivery_date,
});
function sessionDetail(s: Session) {
  const p = POS.find((x) => x.id === s.poId)!;
  const lines = p.lines.map((l) => ({ id: l.id, sku: l.sku, received_now: s.counts[l.id] ?? 0, damaged_qty: 0, wrong_item_qty: 0, wrong_item_claim_type: null }));
  const received = lines.reduce((n, l) => n + l.received_now, 0);
  return {
    receipt: {
      id: s.id, po_id: p.id, source_no: null, source_party_name: null, warehouse_id: KLANG, warehouse_name: "Carres Klang",
      supplier_name: supplierName(p.supplier_id), do_number: "DO-OHANA-0611", do_file_path: "simulated/do.pdf", note: null,
      lines, status: s.status, submitted_by_name: "Warehouse Klang", submitted_at: `${s.due}T02:30:00Z`,
      reviewed_by_name: null, reviewed_at: null, return_reason: null, summary: `${received} good`, opens_claims: false,
      grn_no: s.status === "posted" ? "GRN-SIMULATED" : null, goods_received_at: s.due, goods_received_time: `${s.due}T02:30:00Z`,
      submitted_from: "warehouse", posted_at: null, posted_by_name: null, actual_site_id: KLANG, actual_site_name: "Carres Klang",
      unit_results: [], extra_lines: [], arrival_evidence: [],
    },
    po: { id: p.id, supplier_id: p.supplier_id, warehouse_id: KLANG, purchase_order_lines: p.lines.map((l) => ({ id: l.id, sku: l.sku, qty: l.qty, received_qty: l.received_qty, damaged_qty: l.damaged_qty, wrong_item_qty: l.wrong_item_qty })) },
    line_info: Object.fromEntries(p.lines.map((l) => [l.id, { description: `${l.model_name} ${l.size}`, category: "Mattress" }])),
    events: [{ id: `${s.id}-ev`, event: "submitted", at: `${s.due}T02:30:00Z`, by_name: "Warehouse Klang", detail: null }],
    related_records: { claims: [], returns: [] },
  };
}
function deliveryOrderDetail() {
  const o = ORDERS.find((x) => x.so === 1371)!;
  return {
    deliveryOrder: {
      id: "55555555-5555-4555-8555-000000000001", do_number: DO_1371, issued_at: `${past(3)}T02:00:00Z`, trip_groups: null,
      delivery_date: past(2), time_slot: null, logistics_partner: "AL", voided_at: null, void_reason: null, leg: 0, order_id: o.id,
      orders: { ...o, customer_emergency: null, do_file_path: "simulated/signed-do.pdf", do_uploaded_at: `${past(1)}T08:00:00Z`,
        pod_signature_url: null, pod_signed_by: null, pod_signed_at: null, do_number: DO_1371, delivery_stops: [], ops_order_control: null,
        order_lines: [{ sku: "B1201S-K", qty: 1 }] },
    },
    attempts: [{ do_number: DO_1371, result: "delivered", reason_key: null, recorded_at: `${past(2)}T09:00:00Z` }],
    handoverEvents: [], lineDescriptions: { "B1201S-K": "B1201S · King" }, loans: [], proofReviews: [], attemptEvidence: [], history: [],
  };
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  /* Supabase Storage (signed uploads): accepted, nothing stored. */
  if (url.includes("placeholder.supabase.co/storage")) {
    SIMULATED_LOG.push(`upload ${url.split("/").pop()}`);
    return json({ Key: "simulated/upload.png", path: "simulated/upload.png" });
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
    const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (/sign-upload|signed-upload|upload-url/.test(path)) return json({ token: "simulated", path: `simulated/${Date.now()}.png`, signedUrl: "https://placeholder.supabase.co/storage/v1/object/upload/sign/simulated" });
    const confirm = /^\/api\/operation\/pos\/([^/]+)\/confirm-sent$/.exec(path);
    if (confirm) {
      const id = decodeURIComponent(confirm[1]!).replace(/-V\d+$/, "");
      const p = POS.find((x) => x.id === id);
      if (p) {
        p.sent = true;
        (SENDS[p.id] ??= []).push({ channel: String(body.channel ?? "whatsapp"), note: null, sent_at: new Date().toISOString(), kind: "confirmed_sent", recipient: String(body.recipient ?? "group"), po_version: p.version, sent_by_name: "Shasha", duty_name: "Shasha", acting_name: null, po_revisions: null });
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
        const p = po(`PO-${TODAY.slice(2).replaceAll("-", "")}-${nextPo++}`, d.supplierId, d.window, false, [d.so], day(9));
        p.placed_at = new Date().toISOString();
        p.lines = [line(p.id, 1, "B1201S-K", d.toBuy, "Mattress B1201S", "183X190CM")];
        POS.push(p);
        d.toBuy = 0;
        made.push(p);
      }
      SIMULATED_LOG.push(`issued ${made.map((p) => p.id).join(", ")}`);
      return json({ pos: made.map(issued), simulated: true });
    }
    const answer = /^\/api\/operation\/pos\/([^/]+)\/tomorrow-delivery$/.exec(path);
    if (answer) {
      const id = decodeURIComponent(answer[1]!);
      ANSWERED.add(id);
      (PROMISES[id] ??= []).push({ kind: "tomorrow_delivery", answer: "delayed", about_date: null, previous_date: null, new_date: day(9), reason: null, po_version: 1, channel: "whatsapp", recipient: "group", evidence: "simulated/upload.png", reported_by: null, reported_at: new Date().toISOString(), recorded_by: ME, recorded_by_name: "Shasha", recorded_at: new Date().toISOString() });
      SIMULATED_LOG.push(`supplier answer ${id}`);
      return json({ ok: true, simulated: true });
    }
    const arrangement = /^\/api\/operation\/delivery-arrangements\/([^/]+)$/.exec(path);
    if (arrangement && method === "PUT") {
      const order = ORDERS.find((o) => o.id === arrangement[1]);
      const row = {
        id: `arr-${Date.now()}`, order_id: arrangement[1], leg: Number(q.get("leg") ?? 0), partner_id: body.partnerId ?? null,
        partner_name: PARTNERS.find((p) => p.id === body.partnerId)?.name ?? null,
        confirmed_date: body.confirmedDate ?? null, confirmed_time: body.confirmedTime ?? null, expected_arrival: body.expectedArrival ?? null, logistics_note: null,
        reply_proof_path: body.replyProofPath ?? null, driver_name: body.driverName ?? null, vehicle: body.vehicle ?? null, condo_registration: body.condoRegistration ?? null,
        updated_at: new Date().toISOString(), updated_by: ME,
      };
      ARRANGEMENTS.splice(0, ARRANGEMENTS.length, ...ARRANGEMENTS.filter((a) => a.order_id !== row.order_id), row);
      const act = DELIVERY_ACTS.findIndex((a) => order && a.so === order.so);
      if (act >= 0) {
        const a = DELIVERY_ACTS[act]!;
        /* A scheduled date closes the call; an assignment closes `Assign
           logistics` (scheduling then follows as its own act). */
        if (a.rule === "confirm_delivery_date" ? Boolean(body.confirmedDate) : a.rule === "assign_logistics" ? Boolean(body.partnerId) : false) DELIVERY_ACTS.splice(act, 1);
      }
      SIMULATED_LOG.push(`delivery arrangement ${order ? `SO-${order.so}` : arrangement[1]}`);
      return json({ arrangement: row, simulated: true });
    }
    const review = /^\/api\/operation\/warehouse-receipts\/([^/]+)\/(check-in|send-back)$/.exec(path);
    if (review) {
      const s = SESSIONS.find((x) => x.id === review[1]);
      if (s && review[2] === "check-in") {
        s.status = "posted";
        const p = POS.find((x) => x.id === s.poId)!;
        for (const l of p.lines) l.received_qty += s.counts[l.id] ?? 0;
        const owed = p.lines.some((l) => l.received_qty < l.qty);
        /* A partial receipt hands the balance to PO Duty — never back to
           Receiving (owner 2026-10-05). */
        if (owed && !BALANCE.some((b) => b.poId === p.id)) BALANCE.push({ poId: p.id, due: TODAY });
      }
      SIMULATED_LOG.push(`receiving ${review[2]} ${review[1]}`);
      return json({ ok: true, simulated: true });
    }
    return json({ code: "simulated_refused", message: "This local walk does not save that." }, 405);
  }

  /* ── reads ── */
  if (path === "/api/operation/purchase/demands") return json(soBatchRead());
  if (path === "/api/operation/suppliers") return json({ suppliers: SUPPLIERS });
  if (path === "/api/operation/partners") return json({ partners: PARTNERS });
  if (path === "/api/operation/delivery-arrangements") return json({ arrangements: ARRANGEMENTS, events: [], contacts: [] });
  if (path === "/api/operation/delivery-orders") return json({ deliveryOrders: [], attempts: [], handoverEvents: [], proofReviews: [], attemptEvidence: [] });
  if (path === `/api/operation/delivery-orders/${DO_1371}`) return json(deliveryOrderDetail());
  if (path === "/api/operation/delivery-settings") return json({ templates: [], settings: null, fleet: [] });
  if (path === "/api/operation/purchasing/settings") return json({});
  if (path === "/api/operation/workspace-duties") return json({ can_assign: false, duties: [] });
  if (path === "/api/operation/staff") return json({ staff: [{ user_id: ME, email: "sha@carres.example", name: "Shasha", pooled: true, available: true, note: null, last_seen_at: null, duties: [] }], myDuties: [], salespersons: [] });
  if (path === "/api/operation/register-layouts") return json({ layouts: [], limit: 10 });
  if (path === "/api/operation/supplier-claims") return json({ claims: [], counts: { open: 0, closed: 0, all: 0 } });
  if (path === "/api/operation/warehouse") return json({ warehouses: [{ id: KLANG, name: "Carres Klang", address: "Klang" }] });
  if (path === "/api/operation/warehouse-receipts/receiver") return json({ receiver: { kind: "staff", name: "Shasha" } });
  if (path === "/api/operation/warehouse-receipts/duty") return json({ duty_key: "grn_duty", normal_user_id: ME, normal_user_name: "Shasha", acting_user_id: ME, acting_user_name: "Shasha", actor_user_id: ME, is_cover: false, cover_id: null, allowed: true, may_amend: true });
  const session = /^\/api\/operation\/warehouse-receipts\/([0-9a-f-]{36})$/.exec(path);
  if (session) {
    const s = SESSIONS.find((x) => x.id === session[1]);
    return s ? json(sessionDetail(s)) : json({ message: "not found" }, 404);
  }
  if (path === "/api/catalog") return json({ models: [{ id: "m1", modelKey: "B1201S", name: "B1201S", category: "mattress", blurb: null, colors: null, gaps: null, sofaMode: null }], skus: [{ id: "s1", modelId: "m1", sku: "B1201S-K", variant: "King", variantKind: "size", price: 2499, cost: null }], sofaFabrics: [], addons: [{ key: "SVC-DISPOSE", name: "Dispose old bed frame", price: 100 }], floorConfig: {} });
  if (/^\/api\/operation\/orders\/[^/]+\/timeline$/.test(path)) return json([]);
  if (/^\/api\/operation\/orders\/[^/]+\/expansion$/.test(path)) return json({ lines: [] });
  if (/^\/api\/operation\/orders\/[^/]+\/delivery-photos$/.test(path)) return json({ photos: [] });
  if (path === "/api/operation/orders") {
    const one = q.get("orderId");
    return json({ orders: one ? ORDERS.filter((o) => o.id === one) : ORDERS, total: ORDERS.length });
  }
  if (path === "/api/operation/orders/register-facts") return json({ facts: {} });
  if (path === "/api/operation/orders/monthly-demand") return json({ orders: [] });
  const sod = /^\/api\/orders\/([^/]+)\/sales-order-data$/.exec(path);
  if (sod) {
    const o = ORDERS.find((x) => x.id === decodeURIComponent(sod[1]!));
    return o ? json(salesOrderData(o)) : json({ message: "not found" }, 404);
  }
  if (path === "/api/operation/pos") {
    const one = q.get("poId");
    const list = one ? POS.filter((x) => x.id === one) : POS;
    return json({ pos: list.map(poRow), destinations: [{ id: KLANG, name: "Carres Klang", is_default: true }], referencedDestinations: [], messageTemplate: "Hi {supplier}, please find our purchase order {po} attached. Thank you." });
  }
  const poPath = /^\/api\/operation\/pos\/([^/]+)\/(print-data|sends|issue-context|receiving|units)$/.exec(path);
  if (poPath) {
    const p = POS.find((x) => x.id === decodeURIComponent(poPath[1]!).replace(/-V\d+$/, ""));
    if (!p) return json({ code: "po_not_found", message: "Purchase Order not found." }, 404);
    if (poPath[2] === "print-data") return json(printData(p));
    if (poPath[2] === "sends") return json({ sends: poRow(p).sends });
    if (poPath[2] === "issue-context") return json(issued(p));
    if (poPath[2] === "units") return json({ units: [] });
    return json({ events: [], expected_units: [] });
  }
  return json({ message: "not seeded in the local walk" }, 404);
};
