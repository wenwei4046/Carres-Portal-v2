/**
 * WORK PREVIEW — DEV ONLY.
 *
 * The REAL Work page and stylesheet over a seeded v2 Work feed
 * (`/api/operation/work`), so the left rail can be walked and measured without
 * a login. Every row is dated from the machine's own today (working-day
 * offsets), so the rail's ringed day, the picker's red dates and the right
 * panel's `{n} days left` all count from ONE today. Every party, date and
 * number here is invented; the sentences are the production rules' own.
 *
 * A separate vite entry (`work-preview.html`), not a route: `vite build` only
 * emits `index.html`'s graph, so this cannot reach production. The fetch stub
 * answers ONLY the Work read; every other API path 404s.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OperationWorkItem, OperationWorkModule, OperationWorkResponse } from "@carres/shared";
import { addWorkingDays, myHolidaySet } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import { appTodayIso } from "@/lib/fmt-date";
import OperationWork from "@/pages/operation/OperationWork";
import PreviewFrame from "./preview-frame";
import "@/index.css";

const ME = "00000000-0000-4000-8000-0000000000aa";
/* The machine's own today, in Malaysia; `wd(n)` is n Office working days
   away (Sunday and public holidays skipped), so a dated row never lands on
   a day the rules would not put it on. */
const TODAY = appTodayIso();
const REAL_TODAY = TODAY;
const wd = (n: number) => (n >= 0 ? addWorkingDays(TODAY, n, { holidays: myHolidaySet() }) : subWorkingDays(TODAY, -n));
function subWorkingDays(from: string, n: number): string {
  const holidays = myHolidaySet();
  let cur = from;
  let left = n;
  while (left > 0) {
    const d = new Date(`${cur}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    cur = d.toISOString().slice(0, 10);
    /* Office days only: a missed Payment or Sales Order row never sits on a Saturday. */
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidays.has(cur)) left--;
  }
  return cur;
}

let seq = 0;
type Words = { problem: string; action: string; recipient: string | null; ref?: string };
const WORDS: Record<OperationWorkModule, Words[]> = {
  orders: [
    { problem: "No delivery date", action: "Call Tan Qu Qu", recipient: "Tan Qu Qu" },
    { problem: "Supplier date misses the customer commitment", action: "Delay planning", recipient: "Lim Mei Ling" },
  ],
  purchasing: [
    { problem: "Supplier delivery date passed", action: "Ask the supplier when the goods will arrive", recipient: "Dreamland Factory", ref: "PO2609-1042" },
    { problem: "Confirm tomorrow's supplier delivery", action: "Confirm tomorrow's delivery", recipient: "Sleepwell Sdn Bhd", ref: "PO2609-1057" },
  ],
  receiving: [{ problem: "Supplier date passed · nothing received yet", action: "Check in", recipient: "Warehouse Klang", ref: "PO2609-1031" }],
  delivery: [
    { problem: "Overdue delivery", action: "Call NETS", recipient: "NETS" },
    { problem: "Delivery proof not reviewed", action: "Check delivery proof", recipient: "AL Logistics", ref: "DO2609-20411" },
  ],
  payment: [{ problem: "Payment due today", action: "Ask customer to pay", recipient: "Wong Kah Wai" }],
  issue_tracker: [{ problem: "Issue waiting for a reply", action: "Record result", recipient: null }],
};
const used: Partial<Record<OperationWorkModule, number>> = {};

function item(module: OperationWorkModule, actionOn: string | null, missedDays = 0): OperationWorkItem {
  const n = used[module] ?? 0;
  used[module] = n + 1;
  const words = WORDS[module][n % WORDS[module].length];
  seq += 1;
  const id = `obj-${seq}`;
  return {
    contractVersion: 2,
    id: `${module}:${id}:follow`,
    module,
    ruleKey: "follow",
    ruleVersion: 1,
    object: { kind: module === "purchasing" || module === "receiving" ? "purchase_order" : "sales_order", id, label: words.ref ?? `SO2609-${4800 + seq}` },
    problem: words.problem,
    action: words.action,
    recipient: words.recipient,
    requiredResult: "Customer Delivery exists",
    completionPredicate: "orders.delivery_date exists",
    completionStatement: "Customer Delivery exists",
    owner: {
      rule: "salesperson",
      dutyKey: null,
      normal: { userId: ME, name: "Shasha" },
      activeCover: null,
      coverEvidence: null,
      acting: { userId: ME, name: "Shasha" },
      state: "primary",
    },
    timing: {
      businessDueOn: actionOn,
      actionOn,
      placement: actionOn === null ? "no_working_date" : missedDays > 0 ? "missed" : "on_day",
      missedAge: {
        state: "counted",
        workingDays: missedDays,
        basis: { calendarKey: "module+person", from: actionOn ?? TODAY, to: TODAY },
      },
      eligibility: "eligible",
      noDateReason: actionOn === null ? "The owning rule has no working date" : null,
      calendar: {
        module: { key: module, source: module, state: "ready" },
        actor: { key: "person:shasha", source: "people", state: "ready" },
        holidayName: null,
      },
    },
    communication: null,
    blocker: null,
    nextConsequence: null,
    interaction: { mode: "open_module", fallbackDestination: `/operation/orders/so/${id}` },
    destination: `/operation/orders/so/${id}`,
    observedAt: `${TODAY}T01:00:00.000Z`,
    sourceVersion: `${TODAY}T01:00:00.000Z`,
    tone: "warning",
    locked: false,
    broken: false,
  };
}

const FEED: OperationWorkResponse = {
  contractVersion: 2,
  complete: true,
  generatedOn: TODAY,
  closureReceipt: null,
  staff: [{ userId: ME, name: "Shasha", email: "sha@carres.co" }],
  sources: (["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((key) => ({
    key,
    state: "healthy" as const,
    observedAt: `${TODAY}T01:00:00.000Z`,
    lastSuccessfulAt: `${TODAY}T01:00:00.000Z`,
    errorLabel: null,
  })),
  items: [
    item("purchasing", wd(-5), 5),
    item("delivery", wd(-4), 4),
    item("payment", wd(-6), 6),
    item("orders", wd(0)),
    item("receiving", wd(0)),
    item("purchasing", wd(1)),
    item("delivery", wd(1)),
    item("delivery", wd(1)),
    item("orders", wd(1)),
    item("payment", wd(0)),
    item("delivery", wd(2)),
    item("purchasing", wd(2)),
    item("orders", null),
    item("payment", null),
  ],
};

// One covered job (tomorrow, Delivery · NETS): Shasha acts for Li Ching
// today, so the row carries `For Li Ching` beside its number.
const coveredItem = FEED.items.find((i) => i.module === "delivery" && i.timing.actionOn === wd(1) && i.recipient === "NETS");
if (coveredItem) {
  coveredItem.owner = {
    ...coveredItem.owner,
    normal: { userId: "00000000-0000-4000-8000-0000000000bb", name: "Li Ching" },
    activeCover: { userId: ME, name: "Shasha" },
    coverEvidence: { id: "cover-1", startsOn: TODAY, endsOn: TODAY },
    acting: { userId: ME, name: "Shasha" },
    state: "covered",
  };
}

/* ── THE LOGISTICS CARD SEED (owner rulings 2026-09-24) ─────────────────────
   The first missed Delivery job names ONE Sales Order, so the right panel draws
   its party cards. `?lc=` picks the state: `none` (no company), `link`
   (AL Logistics, active link, details received, scheduled Mon 21 Sep), or the
   default — AL Logistics, no link yet, the 3-day check due today and money
   owed on an outstation delivery. Every name, date and number is invented. */
const ORDER = "00000000-0000-4000-8000-00000000c001";
/* The requested date is 3 working days out, so the checks read true on any
   day the preview is opened. */
const REQUESTED = addWorkingDays(REAL_TODAY, 3, { holidays: myHolidaySet() });
const lc = new URLSearchParams(window.location.search).get("lc") ?? "due";
const firstDelivery = FEED.items.find((i) => i.module === "delivery");
if (firstDelivery) {
  firstDelivery.object = { kind: "delivery_scope", id: ORDER, label: "SO-1362" };
  firstDelivery.id = "delivery:SO-1362:confirm_delivery_date";
  firstDelivery.ruleKey = "confirm_delivery_date";
  firstDelivery.problem = "The delivery is not scheduled";
  firstDelivery.action = "Call AL Logistics";
  firstDelivery.recipient = "AL Logistics";
  firstDelivery.requiredResult = "Scheduled delivery recorded";
  firstDelivery.completionStatement = "Scheduled delivery recorded";
}
const AL = "00000000-0000-4000-8000-00000000d001";
const withPartner = lc !== "none";
const scheduled = lc === "link";
const ORDERS = {
  orders: [
    {
      id: ORDER, so: 1362, status: "proceed_order", operation_stage: "ready_to_dispatch", warehouse_id: null,
      customer_name: "LIM KUAN YANG", customer_phone: "012-345 6789", customer_email: "kuanyang.lim@example.com",
      customer_address: "12 Jalan Sekolah, 41000 Klang, Selangor", customer_address_city: "Klang", customer_address_state: "Selangor",
      building_type: "Condo", delivery_floor: 7, delivery_has_lift: true,
      placed_at: "2026-09-01T02:00:00Z", proceeded_at: "2026-09-01T02:00:00Z",
      delivery_date: REQUESTED, delivery_date_tbd: false, source_system: null, source_ref: ["TCF0541"],
      ops_assigned_logistic: null,
      order_lines: [{ id: "l-1", sku: "M1401F-K", qty: 1, unit_price: 2450 }, { id: "l-2", sku: "B1201S-K", qty: 1, unit_price: 1800 }],
      order_addons: [], paid: 3000, delivery_partner_id: null, request_for_delivery_at: null, partner_accepted_at: null,
      partner_rejected_at: null, partner_rejected_reason: null, delivery_partners: null, do_number: null, dispatched_at: null,
      delivered_at: null, outlet_id: null, dealer_id: "d-1", dealers: { name: "Carres KL" }, order_supplier_threads: [],
      order_annotations: [], order_finance_exceptions: [], ops_delivery_orders: [],
    },
  ],
};
/* The catalogue the Sales Order card reads goods names from (`Carres Cloud · King`). */
const CATALOG = {
  models: [
    { id: "00000000-0000-4000-8000-00000000e001", category: "mattress", modelKey: "M1401F", name: "Carres Cloud", blurb: null, colors: null, gaps: null, sofaMode: null },
    { id: "00000000-0000-4000-8000-00000000e002", category: "bedframe", modelKey: "B1201S", name: "Oslo Bed Frame", blurb: null, colors: null, gaps: null, sofaMode: null },
  ],
  skus: [
    { id: "00000000-0000-4000-8000-00000000e101", modelId: "00000000-0000-4000-8000-00000000e001", sku: "M1401F-K", variant: "King", variantKind: "size", price: 2450, cost: null },
    { id: "00000000-0000-4000-8000-00000000e102", modelId: "00000000-0000-4000-8000-00000000e002", sku: "B1201S-K", variant: "King", variantKind: "size", price: 1800, cost: null },
  ],
  sofaFabrics: [], addons: [], floorConfig: {},
};
const ARRANGEMENTS = {
  arrangements: withPartner
    ? [{
        id: "arr-1", order_id: ORDER, leg: 0, partner_id: AL, partner_name: "AL Logistics",
        confirmed_date: scheduled ? REQUESTED : null, confirmed_time: null, expected_arrival: null, logistics_note: null,
        reply_proof_path: null, driver_name: scheduled ? "Ali" : null, vehicle: scheduled ? "VBA 1234" : null,
        condo_registration: null, updated_at: "2026-09-15T02:00:00Z", updated_by: null,
      }]
    : [],
  events: [],
  contacts: [] as Array<Record<string, unknown>>,
};

/* ── THE REST OF THE RIGHT PANEL (owner approval + correction 2026-09-25, §5.10) ─
   `?cm=` — the Customer: default = normal partner scheduling (read-only, no
   Carres act); `delay` (Sales Orders' delay_planning open), `another` (the
   company asked for another date), `refused`, `phone` (contact details wrong).
   `?sp=` — the Suppliers: `three` (default: one delayed, one expected, one
   not issued), `none` (no PO), `received`. `?loan=1` adds a loan offer. */
const cm = new URLSearchParams(window.location.search).get("cm") ?? "normal";
const sp = new URLSearchParams(window.location.search).get("sp") ?? "three";
const loanOn = new URLSearchParams(window.location.search).get("loan") === "1";
const contactRow = (result: string) => ({
  id: "c-1", order_id: ORDER, leg: 0, purpose_key: "confirm_delivery_date", channel: "call", contacted_person: "partner",
  contact_owner_user_id: ME, acting_user_id: ME, contacted_at: `${REAL_TODAY}T02:42:00Z`, result_key: result,
  reply_evidence_path: result === "customer_refused_delivery" ? "arrangement/wa-2.jpg" : null, next_action: null, note: null,
  on_behalf_of_partner_id: AL, recorded_by: ME, recorded_at: `${REAL_TODAY}T02:42:00Z`,
});
if (cm === "refused") ARRANGEMENTS.contacts.push(contactRow("customer_refused_delivery"));
if (cm === "phone") ARRANGEMENTS.contacts.push(contactRow("contact_details_incorrect"));
if (cm === "delay") {
  const d = item("orders", TODAY);
  d.ruleKey = "delay_planning";
  d.id = "orders:SO-1362:delay_planning";
  d.object = { kind: "sales_order", id: ORDER, label: "SO-1362" };
  d.problem = "Supplier date misses the customer commitment";
  d.action = "Decide the customer plan for the new supplier date";
  FEED.items.push(d);
}
const plusDays = (n: number) => addWorkingDays(REAL_TODAY, n, { holidays: myHolidaySet() });
const SUPPLIERS = sp === "none"
  ? []
  : sp === "received"
    ? [{ poNo: "PO260910-4827", supplier: "Hookka Industries", issued: true, originalIso: plusDays(-2), effectiveIso: plusDays(-2), reply: null, supplierDo: { number: "DO-5531", atIso: `${plusDays(-3)}T02:00:00Z` }, deliverTo: "Carres Klang Warehouse", grnIso: plusDays(-2), orderedQty: 2, receivedQty: 2, lines: [{ sku: "M1401F-K", qty: 1 }] }]
    : [
        { poNo: "PO260910-4827", supplier: "Sleepwell", issued: true, originalIso: plusDays(1), effectiveIso: plusDays(6), reply: { answer: "delayed", reason: "Production Delay", evidence: "arrangement/wa-1.jpg", recordedAtIso: `${REAL_TODAY}T01:00:00Z` }, supplierDo: null, deliverTo: "Carres Klang Warehouse", grnIso: null, orderedQty: 1, receivedQty: 0, lines: [{ sku: "M1401F-K", qty: 1 }] },
        { poNo: "PO260911-1188", supplier: "ABC Furniture", issued: true, originalIso: plusDays(2), effectiveIso: plusDays(2), reply: null, supplierDo: null, deliverTo: "Carres Klang Warehouse", grnIso: null, orderedQty: 1, receivedQty: 0, lines: [{ sku: "B1201S-K", qty: 1 }] },
        { poNo: "PO260912-2044", supplier: "XYZ Bedding", issued: false, originalIso: null, effectiveIso: null, reply: null, supplierDo: null, deliverTo: "Carres Klang Warehouse", grnIso: null, orderedQty: 2, receivedQty: 0, lines: [{ sku: "pillow:P01", qty: 2 }] },
      ];
let linkActive = lc === "link";
const facts = () => ({
  partner: withPartner ? { id: AL, name: "AL Logistics", hasPortal: false, kvDefault: false } : null,
  routes: [{
    key: "supplier_to_logistics", place: "AL Sungai Buloh",
    purchaseOrders: [{ poNo: "PO260910-4827", supplier: "Hookka Industries", poDeliveryDate: "2026-09-18", receivedDate: scheduled ? "2026-09-17" : null }],
    readyUnits: 0,
  }],
  link: linkActive
    ? { id: "link-1", token: "q4lB6xN2c8Yd0VhS7pZ1tR5mWfK3aJ9eUgL0oHnC2vE", createdAt: "2026-09-15T03:00:00Z", createdByName: "Shasha", firstOpenedAt: "2026-09-15T06:10:00Z", lastOpenedAt: "2026-09-16T01:40:00Z" }
    : null,
  lastRevokedAt: null,
  detailsReceivedAt: linkActive ? "2026-09-15T06:10:00Z" : null,
  answer: cm === "another" ? { kind: "another_date", at: `${REAL_TODAY}T03:10:00Z`, proposedDate: addWorkingDays(REQUESTED, 2, { holidays: myHolidaySet() }), reasonKey: "customer_asked" } : null,
  history: withPartner
    ? [
        ...(scheduled ? [{ event: "arrangement_saved", at: "2026-09-16T01:42:00Z", source: "external_link", who: "AL Logistics via external link", detail: REQUESTED }] : []),
        { event: "assigned", at: "2026-09-15T02:00:00Z", source: "operation", who: "Shasha", detail: "AL Logistics" },
      ]
    : [],
});
/* ── THE PO WINDOW CARDS (Purchasing §5.6.1, owner rulings 2026-09-24/25) ──
   `?pw=1` adds today's two windows: 11:30 AM after issue (three POs, two not
   sent yet) and 4:00 PM before issue (demand still to buy). The SO Batch read
   and the PO rows below are what the panel computes the same window from. */
const pw = new URLSearchParams(window.location.search).get("pw") === "1";
const SUP = { ohana: "00000000-0000-4000-8000-0000000005a1", hookka: "00000000-0000-4000-8000-0000000005a2", dorsett: "00000000-0000-4000-8000-0000000005a3" };
const W1130 = `${TODAY}T11:30`;
const W1600 = `${TODAY}T16:00`;
function windowItem(key: string, label: string, problem: string, action: string, recipient: string, embedded: boolean): OperationWorkItem {
  const base = item("purchasing", TODAY);
  const destination = `/operation?tab=purchase&window=${encodeURIComponent(key)}`;
  return {
    ...base,
    id: `purchasing:${key}:purchasing.po_window`,
    ruleKey: "purchasing.po_window",
    object: { kind: "po_window", id: key, label },
    problem, action, recipient,
    requiredResult: "Every PO issued and marked as sent",
    completionStatement: "Every PO issued from the window has its current version marked as sent",
    owner: { ...base.owner, rule: "po_duty", dutyKey: "po_duty" },
    interaction: embedded
      ? {
          mode: "embedded", actionKey: "purchasing.confirm_po_sent", componentKey: "purchasing.po_issue_evidence",
          capability: "POST /api/operation/pos/:id/confirm-sent", inputContract: "ConfirmPoSentInput",
          evidenceContract: "po_sends confirmed_sent for the rendered version", idempotencyKey: "po_id + po_version",
          staleVersion: "ConfirmPoSentInput.poVersion", staleRefusal: "stale_po_version",
          successReceipt: "PO sent to supplier", fallbackDestination: destination,
        }
      : { mode: "open_module", fallbackDestination: destination },
    destination,
  };
}
if (pw) {
  FEED.items.push(
    windowItem(W1130, "11:30 AM PO window", "3 POs issued · 2 not sent yet", "Click WhatsApp, send PO170926-4827(1) to Ohana", "2 suppliers", true),
    windowItem(W1600, "4:00 PM PO window", "Buy 7 items for 4 Sales Orders", "Issue the POs by 4:00 PM", "2 suppliers", false),
  );
}
const demandRow = (id: string, orderId: string, so: number, supplierId: string, supplier: string, toBuy: number) => ({
  id, state: "safety_days_full", lineIds: [`${id}-l`], orderId, so, customer: "Customer", customerDelivery: "2026-10-20",
  item: "M1401F", variant: "King", category: "mattress", skus: ["M1401F-K"], supplierId, supplier,
  qtyNeeded: toBuy, readyStock: 0, takenFromStock: 0, onPo: 0, poNumbers: [], toBuy, goodsMustArrive: "2026-10-06",
  issueRef: { proposalKey: "p", buildKey: "b" }, action: null, parts: [], supplierKind: "own_logistics",
  ownerName: "Shasha", ownerDuty: null, poWindow: W1600,
});
const windowPo = (poId: string, supplierId: string, supplierName: string, sent: boolean) => ({
  poId, status: "open", supplierId, supplierName, destinationId: "dest-klang", officialDeliveryDate: "2026-10-01",
  sentCurrentVersion: sent, version: 1, poWindow: W1130,
});
const SO_BATCH = {
  today: TODAY,
  rows: [
    demandRow("r1", "so-a", 1401, SUP.ohana, "Ohana", 2),
    demandRow("r2", "so-b", 1402, SUP.ohana, "Ohana", 3),
    demandRow("r3", "so-c", 1403, SUP.ohana, "Ohana", 1),
    demandRow("r4", "so-d", 1404, SUP.hookka, "Hookka", 1),
  ],
  registerRows: [{
    orderId: "so-x", so: 1390, customer: "Customer", status: "ordered", proceededAt: `${TODAY}T01:00:00Z`,
    requestedDeliveryDate: "2026-10-20", deliveryCity: "Klang", deliveryState: "Selangor",
    pos: [
      windowPo("PO170926-4827", SUP.ohana, "Ohana", false),
      windowPo("PO170926-4828", SUP.hookka, "Hookka", false),
      windowPo("PO170926-4829", SUP.dorsett, "Dorsett", true),
    ],
    lines: [], outstandingSuppliers: [],
  }],
  destinations: [{ id: "dest-klang", name: "Carres Klang Warehouse", isDefault: true, active: true }],
  defaultDestinationId: "dest-klang", currentPoDuty: { userId: ME, name: "Shasha" }, actingPoDuty: null,
  poDutyNameUnavailable: false, poDutyUnavailable: false, mayIssue: true, procurementPartners: [], safetyDays: 14,
};
const WINDOW_SUPPLIERS = [
  { id: SUP.ohana, name: "Ohana", kind: "own_logistics", cat_covered: [], lead_time: null, contact: null, contact_email: null, whatsapp_group_url: "https://chat.whatsapp.com/ohana" },
  { id: SUP.hookka, name: "Hookka", kind: "own_logistics", cat_covered: [], lead_time: null, contact: null, contact_email: "po@hookka.example", whatsapp_group_url: null },
  { id: SUP.dorsett, name: "Dorsett", kind: "own_logistics", cat_covered: [], lead_time: null, contact: null, contact_email: null, whatsapp_group_url: null },
];
const sentPos = new Set<string>(["PO170926-4829"]);
const poRow = (poId: string) => {
  const po = SO_BATCH.registerRows[0]!.pos.find((p) => p.poId === poId)!;
  return {
    pos: [{
      id: poId, supplier_id: po.supplierId, version: 1, destination_id: "dest-klang", status: "open",
      sends: sentPos.has(poId) ? [{ channel: "whatsapp", note: null, sent_at: `${TODAY}T03:10:00Z`, kind: "confirmed_sent", recipient: "group", po_version: 1, sent_by_name: "Shasha", po_revisions: null }] : [],
      purchase_order_lines: [],
    }],
    destinations: [{ id: "dest-klang", name: "Carres Klang Warehouse", is_default: true }],
    referencedDestinations: [],
    messageTemplate: "Hi {supplier}, please find our purchase order {po} attached. Thank you.",
  };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/\/api\/operation\/work(\?|$)/.test(url)) {
    return new Response(JSON.stringify(FEED), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (/\/api\/operation\/orders(\?|$)/.test(url)) return json(ORDERS);
  if (/\/api\/catalog(\?|$)/.test(url)) return json(CATALOG);
  if (/\/api\/operation\/partners(\?|$)/.test(url)) return json({ partners: [{ id: AL, name: "AL Logistics", whatsapp_group_url: "https://chat.whatsapp.com/example" }] });
  if (/\/api\/operation\/pos\/for-order\//.test(url)) return json({ purchaseOrders: SUPPLIERS });
  if (/\/loan-offers/.test(url)) return json({ offers: loanOn ? [{ id: "lo-1", seq: 1, order_id: ORDER, event: "offered", item_id: null, label: "Loan sofa", reason: null, recorded_by: ME, recorded_at: `${REAL_TODAY}T01:00:00Z`, unit_id: null }] : [] });
  if (/\/api\/operation\/staff(\?|$)/.test(url)) return json({ staff: [{ user_id: ME, email: "sha@carres.co", name: "Shasha", pooled: true, available: true, note: null, last_seen_at: null, duties: [] }], myDuties: [] });
  if (/\/api\/operation\/suppliers(\?|$)/.test(url)) return json({ suppliers: [{ id: "s-1", name: "Sleepwell", kind: "own_logistics", cat_covered: [], lead_time: null, contact: null, whatsapp_group_url: "https://chat.whatsapp.com/sleepwell" }, ...WINDOW_SUPPLIERS] });
  if (/\/api\/operation\/purchase\/demands/.test(url)) {
    return json({
      ...SO_BATCH,
      registerRows: SO_BATCH.registerRows.map((r) => ({ ...r, pos: r.pos.map((p) => ({ ...p, sentCurrentVersion: sentPos.has(p.poId) })) })),
    });
  }
  const poConfirm = /\/api\/operation\/pos\/([^/]+)\/confirm-sent/.exec(url);
  if (poConfirm) { sentPos.add(decodeURIComponent(poConfirm[1]!)); return json({ ok: true }); }
  const onePo = /\/api\/operation\/pos\?[^#]*poId=([^&]+)/.exec(url);
  if (onePo) return json(poRow(decodeURIComponent(onePo[1]!)));
  if (/\/api\/operation\/delivery-arrangements(\?|$)/.test(url)) return json(ARRANGEMENTS);
  if (/\/api\/operation\/delivery-orders(\?|$)/.test(url)) return json({ deliveryOrders: [], attempts: [], handoverEvents: [], proofReviews: [], attemptEvidence: [] });
  if (/\/logistics-card/.test(url)) return json(facts());
  if (/\/link\/revoke/.test(url)) { linkActive = false; return json({ revoked: true }); }
  if (/\/link(\?|$)/.test(url)) { linkActive = true; return json({ link: { id: "link-1" } }, 201); }
  if (url.includes("/api/")) return new Response(JSON.stringify({ message: "not seeded" }), { status: 404 });
  return realFetch(input, init);
};

useAuth.setState({ role: "operation", user: { id: ME, email: "sha@carres.co" } as never });

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const start = new URLSearchParams(window.location.search).get("at")
  ?? "/operation?tab=work&day=missed&selected=delivery%3ASO-1362%3Aconfirm_delivery_date";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[start]}>
        <PreviewFrame label="Work shell and middle cards (illustrative data)">
          <div className="flex h-full flex-col">
            <OperationWork />
          </div>
        </PreviewFrame>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
