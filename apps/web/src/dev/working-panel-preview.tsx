/**
 * WORKING PANEL · LOCAL WALK — DEV ONLY (owner flow "Tasks, Working Panel and
 * document view", 2026-10-05). LOCALHOST PROPOSAL — never deployed.
 *
 * The REAL `OperationApp` — portal sidebar, SO Batch Purchase, Sales Orders,
 * Purchase Orders, the Sales Order page, the Quick Rail and the right Working
 * Panel — over seeded reads. Every API call is answered here; a write is
 * refused (405) so nothing can be ordered, reserved or sent. Every party, date
 * and number is invented; window times are generated from this machine's
 * clock so Missed / today / next always exist when the page is opened.
 *
 *   ?state=default   SO Batch: a Missed window (yesterday 4:00 PM), today's
 *                    window (later today) and the next window; Sales Orders and
 *                    Purchase Orders each with a Missed and a today item.
 *   ?state=nomissed  the same without the Missed items.
 *   ?state=nowork    no work anywhere — the plain empty state.
 *   ?at=<path>       the page to open (kept in the address bar while walking,
 *                    so a reload returns to the same page).
 */
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OperationWorkItem, OperationWorkModule, OperationWorkResponse } from "@carres/shared";
import { addWorkingDays, myHolidaySet, malaysiaClockOf } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import { appTodayIso } from "@/lib/fmt-date";
import OperationApp from "@/pages/operation/OperationApp";
import "@/index.css";

const params = new URLSearchParams(window.location.search);
const STATE = params.get("state") ?? "default";
const WITH_WORK = STATE !== "nowork";
const WITH_MISSED = STATE === "default";

const ME = "00000000-0000-4000-8000-0000000000aa";
const TODAY = appTodayIso();
const wd = (n: number) => addWorkingDays(TODAY, n, { holidays: myHolidaySet() });
function previousWorkingDay(): string {
  const holidays = myHolidaySet();
  let cur = TODAY;
  do {
    const d = new Date(`${cur}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    cur = d.toISOString().slice(0, 10);
  } while ([0, 6].includes(new Date(`${cur}T00:00:00Z`).getUTCDay()) || holidays.has(cur));
  return cur;
}
/* Today's window: the next half hour at least 90 minutes away, so it is
   still due when the walk starts (capped at 11:30 PM). */
function laterToday(): string {
  const { time } = malaysiaClockOf(new Date().toISOString());
  const [h, m] = time.split(":").map(Number) as [number, number];
  const minutes = Math.min(23 * 60 + 30, Math.ceil((h * 60 + m + 90) / 30) * 30);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
const timeWord = (time: string) => {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const YESTERDAY = previousWorkingDay();
const W_MISSED = `${YESTERDAY}T16:00`;
const W_TODAY = `${TODAY}T${laterToday()}`;
const W_NEXT = `${wd(1)}T11:30`;

/* ── Work feed ──────────────────────────────────────────────────────────── */
function workItem(module: OperationWorkModule, over: {
  id: string; ruleKey: string; object: OperationWorkItem["object"]; problem: string; action: string;
  recipient: string | null; actionOn: string; missed: boolean; destination: string;
}): OperationWorkItem {
  return {
    contractVersion: 2,
    id: over.id,
    module,
    ruleKey: over.ruleKey,
    ruleVersion: 1,
    object: over.object,
    problem: over.problem,
    action: over.action,
    recipient: over.recipient,
    requiredResult: "Recorded by the owning page",
    completionPredicate: "source fact exists",
    completionStatement: "Recorded by the owning page",
    owner: {
      rule: module === "purchasing" ? "po_duty" : "salesperson",
      dutyKey: module === "purchasing" ? "po_duty" : null,
      normal: { userId: ME, name: "Shasha" }, activeCover: null, coverEvidence: null,
      acting: { userId: ME, name: "Shasha" }, state: "primary",
    },
    timing: {
      businessDueOn: over.actionOn,
      actionOn: over.actionOn,
      placement: over.missed ? "missed" : "on_day",
      missedAge: { state: "counted", workingDays: over.missed ? 1 : 0, basis: { calendarKey: "module+person", from: over.actionOn, to: TODAY } },
      eligibility: "eligible",
      noDateReason: null,
      calendar: { module: { key: module, source: module, state: "ready" }, actor: { key: "person:shasha", source: "people", state: "ready" }, holidayName: null },
    },
    communication: null,
    blocker: null,
    nextConsequence: null,
    interaction: { mode: "open_module", fallbackDestination: over.destination },
    destination: over.destination,
    observedAt: `${TODAY}T01:00:00.000Z`,
    sourceVersion: `${TODAY}T01:00:00.000Z`,
    tone: over.missed ? "warning" : "info",
    locked: false,
    broken: false,
  };
}

const windowItem = (key: string, missed: boolean, problem: string, action: string) => {
  const time = key.slice(11);
  return workItem("purchasing", {
    id: `purchasing:${key}:purchasing.po_window`, ruleKey: "purchasing.po_window",
    object: { kind: "po_window", id: key, label: `${timeWord(time)} PO window` },
    problem, action, recipient: "2 suppliers", actionOn: key.slice(0, 10), missed,
    destination: `/operation?tab=purchase&window=${encodeURIComponent(key)}`,
  });
};

/* ── Sales Orders ───────────────────────────────────────────────────────── */
const CUSTOMERS = ["LIM KUAN YANG", "Nurul Aisyah binti Abdul Rahman", "Kimmy", "PETER", "ANNE", "Tan Ah Kow", "Mohd Hafiz", "Siti"];
const orderId = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const ORDERS = Array.from({ length: 10 }, (_, n) => {
  const i = n + 1;
  return {
    id: orderId(i), so: 1360 + i, status: "proceed_order", operation_stage: "confirmed", warehouse_id: null,
    customer_name: CUSTOMERS[i % CUSTOMERS.length], customer_phone: `012-345 67${String(10 + i).slice(-2)}`,
    customer_email: null,
    customer_address: `${10 + i} Jalan Example ${i}, 41000 Klang, Selangor`,
    customer_address_line1: `${10 + i} Jalan Example ${i}`, customer_address_line2: null,
    customer_address_city: "Klang", customer_address_state: "Selangor", customer_address_postcode: "41000",
    building_type: i % 2 ? "Condo" : "Landed", delivery_floor: i % 2 ? 7 : 1, delivery_has_lift: true,
    placed_at: `2026-09-${String(10 + i).padStart(2, "0")}T02:00:00Z`,
    proceeded_at: `2026-09-${String(11 + i).padStart(2, "0")}T02:00:00Z`, proceed_date: `2026-09-${String(11 + i).padStart(2, "0")}`,
    delivery_date: wd(5 + i), delivery_date_tbd: false, source_system: null, source_ref: null,
    salesperson_id: "sp", salespersons: { name: "Bernard" },
    outlet_id: "outlet-1", outlets: { name: "Carres Kota Damansara" }, dealer_id: null, dealers: null,
    order_lines: [{ id: `l-${i}-1`, sku: "M1401F-K", qty: 1, unit_price: 2450, attrs: { category: "mattress" } }],
    order_addons: [], paid: 1000, delivery_partner_id: null, request_for_delivery_at: null, partner_accepted_at: null,
    partner_rejected_at: null, partner_rejected_reason: null, delivery_partners: null, do_number: null,
    dispatched_at: null, delivered_at: null, order_supplier_threads: [], order_annotations: [],
    order_finance_exceptions: [], ops_delivery_orders: [], po_numbers: [], allocated_units: [],
    original_request: [{ revision: 1, snapshot: { header: { delivery_date: wd(5 + i), delivery_date_tbd: false } } }],
  };
});

/* ── Purchase Orders ────────────────────────────────────────────────────── */
const SUPPLIERS = [
  { id: "s1", name: "Hooka", whatsapp_group_url: "https://chat.whatsapp.com/example", contact_email: null, contact: null },
  { id: "s2", name: "Ohana Furniture Sdn Bhd", whatsapp_group_url: null, contact_email: "po@example.com", contact: null },
];
const POS = Array.from({ length: 8 }, (_, n) => {
  const i = n + 1;
  const supplier = SUPPLIERS[i % SUPPLIERS.length]!;
  const id = `PO-202609${String(10 + i).padStart(2, "0")}-${4800 + i}`;
  return {
    id, supplier_id: supplier.id, warehouse_id: "w1", destination_id: "d1",
    status: "open", sup_status: "pending", so: null, so_refs: null,
    eta_date: i === 3 ? wd(-2) : wd(i), official_delivery_date: i === 3 ? wd(-2) : wd(i), expected_ready_date: null,
    purpose: "customer_sales", version: 1, placed_at: `2026-09-${String(10 + i).padStart(2, "0")}T02:00:00Z`,
    sources: [{ kind: "sales_order", reference: `SO-${1360 + i}`, order_id: orderId(i) }],
    grns: [], promises: [],
    sends: [{ channel: "whatsapp", note: null, sent_at: `2026-09-${String(10 + i).padStart(2, "0")}T06:00:00Z`, kind: "confirmed_sent", recipient: "group", po_version: 1, sent_by_name: "Yu Jun", duty_name: "Yu Jun", acting_name: null, po_revisions: null }],
    purchase_order_lines: [{ id: `pl-${i}`, sku: "M1401F-K", qty: 1, received_qty: 0, model_name: "Carres Cloud", size: "King",
      destination_id: "d1", identity_mode: "exact_unit", attrs: { category: "Mattress" }, governed_sources: [], sources: [] }],
  };
});

/* ── SO Batch Purchase — demand stamped into the three windows ──────────── */
const demand = (id: string, n: number, supplierId: string, supplier: string, toBuy: number, poWindow: string) => ({
  id, state: "can_order_early", lineIds: [`${id}-l`], orderId: orderId(n), so: 1360 + n, customer: CUSTOMERS[n % CUSTOMERS.length],
  customerDelivery: wd(10), item: "Carres Cloud", variant: "King", category: "mattress", skus: ["M1401F-K"],
  supplierId, supplier, qtyNeeded: toBuy, readyStock: 0, takenFromStock: 0, onPo: 0, fullyOnPo: false, poNumbers: [],
  toBuy, goodsMustArrive: wd(6), issueRef: { proposalKey: `${supplierId}::mattress`, buildKey: id }, action: null,
  parts: [{ sku: "M1401F-K", qty: toBuy, unitCost: 100 }], supplierKind: "own_logistics",
  supplierAddress: "18 Example Factory Road, Selangor", poDate: TODAY, poDeliveryDate: wd(7), poDeliveryWorkingDays: 7,
  orderBy: TODAY, ownerName: null, ownerDuty: null, poWindow,
});
const ROWS = WITH_WORK
  ? [
      ...(WITH_MISSED ? [demand("r1", 1, "s1", "Hooka", 2, W_MISSED), demand("r2", 2, "s2", "Ohana Furniture Sdn Bhd", 1, W_MISSED)] : []),
      demand("r3", 3, "s1", "Hooka", 3, W_TODAY), demand("r4", 4, "s1", "Hooka", 1, W_TODAY), demand("r5", 5, "s2", "Ohana Furniture Sdn Bhd", 2, W_TODAY),
      demand("r6", 6, "s2", "Ohana Furniture Sdn Bhd", 1, W_NEXT),
    ]
  : [];
const SO_BATCH = {
  today: TODAY,
  rows: ROWS,
  registerRows: ORDERS.slice(0, 7).map((o, n) => ({
    orderId: o.id, so: o.so, customer: o.customer_name, status: "blank",
    proceededAt: o.proceeded_at, requestedDeliveryDate: o.delivery_date, deliveryCity: "Klang", deliveryState: "Selangor",
    pos: [], lines: [{ orderLineId: `l-${n + 1}-1`, sku: "M1401F-K", qty: 1, stockTaken: 0, item: "Carres Cloud", variant: "King", category: "mattress", pos: [] }],
    outstandingSuppliers: ROWS.some((r) => r.orderId === o.id) ? ["Hooka"] : [],
  })),
  destinations: [{ id: "d1", name: "Carres Klang", address: "10 Example Warehouse Road, Klang", isDefault: true, active: true }],
  defaultDestinationId: "d1", currentPoDuty: { userId: ME, name: "Shasha" }, actingPoDuty: null,
  poDutyNameUnavailable: false, poDutyUnavailable: false, mayIssue: true, procurementPartners: [], safetyDays: 14,
};

const FEED: OperationWorkResponse = {
  contractVersion: 2,
  complete: true,
  generatedOn: TODAY,
  closureReceipt: null,
  staff: [{ userId: ME, name: "Shasha", email: "sha@carres.example" }],
  sources: (["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((key) => ({
    key, state: "healthy" as const, observedAt: `${TODAY}T01:00:00.000Z`, lastSuccessfulAt: `${TODAY}T01:00:00.000Z`, errorLabel: null,
  })),
  items: WITH_WORK
    ? [
        ...(WITH_MISSED ? [windowItem(W_MISSED, true, "Buy 3 items for 2 Sales Orders", `Issue the POs by ${timeWord("16:00")}`)] : []),
        windowItem(W_TODAY, false, "Buy 6 items for 3 Sales Orders", `Issue the POs by ${timeWord(W_TODAY.slice(11))}`),
        windowItem(W_NEXT, false, "Buy 1 item for 1 Sales Order", "Issue the POs by 11:30 AM"),
        ...(WITH_MISSED ? [workItem("orders", {
          id: `orders:SO-1361:missing_delivery_date`, ruleKey: "missing_delivery_date",
          object: { kind: "sales_order", id: orderId(1), label: "SO-1361" }, problem: "No delivery date",
          action: `Call ${ORDERS[0]!.customer_name}`, recipient: ORDERS[0]!.customer_name, actionOn: YESTERDAY, missed: true,
          destination: `/operation/orders/so/${orderId(1)}`,
        })] : []),
        workItem("orders", {
          id: `orders:SO-1362:ask_delivery_date`, ruleKey: "ask_delivery_date",
          object: { kind: "sales_order", id: orderId(2), label: "SO-1362" }, problem: "Customer delivery date not confirmed",
          action: `Call ${ORDERS[1]!.customer_name}`, recipient: ORDERS[1]!.customer_name, actionOn: TODAY, missed: false,
          destination: `/operation/orders/so/${orderId(2)}`,
        }),
        ...(WITH_MISSED ? [workItem("purchasing", {
          id: `purchasing:${POS[2]!.id}:purchasing.supplier_date_passed`, ruleKey: "purchasing.supplier_date_passed",
          object: { kind: "purchase_order", id: POS[2]!.id, label: POS[2]!.id }, problem: "Supplier delivery date passed",
          action: `Ask ${SUPPLIERS[3 % 2]!.name} when the goods will arrive`, recipient: SUPPLIERS[3 % 2]!.name, actionOn: YESTERDAY, missed: true,
          destination: `/operation/procurement?po=${POS[2]!.id}`,
        })] : []),
        workItem("purchasing", {
          id: `purchasing:${POS[0]!.id}:purchasing.confirm_tomorrows_delivery`, ruleKey: "purchasing.confirm_tomorrows_delivery",
          object: { kind: "purchase_order", id: POS[0]!.id, label: POS[0]!.id }, problem: "Confirm tomorrow's supplier delivery",
          action: "Confirm tomorrow's delivery", recipient: SUPPLIERS[1]!.name, actionOn: TODAY, missed: false,
          destination: `/operation/procurement?po=${POS[0]!.id}`,
        }),
      ]
    : [],
};

/* ── The Sales Order page (View) — one detail per fixture order ─────────── */
const LINES = [{ id: "l1", sku: "M1401F-K", qty: 1, unit_price: 2450, label: "Carres Cloud · King", attrs: { size: "King" }, source_po: null, category: "mattress" }];
const salesOrderData = (o: (typeof ORDERS)[number]) => ({
  order_id: o.id, so_number: `SO-${o.so}`, order_code: `SO-${o.so}`, issue_date: o.placed_at.slice(0, 10), currency: "MYR",
  customer: { name: o.customer_name, phone: o.customer_phone, email: null, address: o.customer_address },
  dealer: { name: "Carres HQ", contact: null, salesperson_name: "Bernard", outlet_name: "Carres Kota Damansara" },
  partner: null,
  lines: LINES.map((l) => ({ ...l, description: l.label, line_total: l.qty * l.unit_price })),
  addons: [], payments: [], subtotal: 2450, total: 2450, paid: o.paid, balance_due: 2450 - o.paid, delivery_date: o.delivery_date,
});
const CATALOG = {
  models: [{ id: "m-1401", modelKey: "M1401F", name: "Carres Cloud", category: "mattress", blurb: null, colors: null, gaps: null, sofaMode: null }],
  skus: [{ id: "s-k", modelId: "m-1401", sku: "M1401F-K", variant: "King", variantKind: "size", price: 2450, cost: null }],
  floorConfig: { freeUpToFloor: 2, perFloorPerItem: 50 }, sofaFabrics: [], addons: [], entryConfig: { formFields: null },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("127.0.0.1:8888")) return realFetch(input, init);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  /* A local walk never writes: no order, reservation, PO send or message. */
  if (method !== "GET") return json({ code: "preview_read_only", message: "This local walk does not save." }, 405);

  if (/\/api\/operation\/work(\?|$)/.test(url)) return json(FEED);
  if (/\/api\/operation\/purchase\/demands/.test(url)) return json(SO_BATCH);
  if (/\/api\/operation\/orders\/register-facts/.test(url)) return json({ facts: {} });
  if (/\/api\/operation\/orders\/monthly-demand/.test(url)) return json({ orders: [] });
  const expansion = /\/api\/operation\/orders\/([^/?]+)\/expansion/.exec(url);
  if (expansion) return json({ lines: [{ lineId: "l1", unitIds: [], deliverTo: [] }] });
  const detail = /\/api\/operation\/orders\/([0-9a-f-]{36})(\?|$)/.exec(url);
  if (detail) {
    const o = ORDERS.find((row) => row.id === detail[1]);
    if (!o) return json({ message: "not found" }, 404);
    return json({ order: { ...o, entry_data: { fields: { building_type: o.building_type } } }, lines: LINES, addons: [], total: 2450,
      warehouse: null, stockBalances: [], freeUnits: [], pos: [], history: [], threads: [] });
  }
  if (/\/api\/operation\/orders(\?|$)/.test(url)) {
    const one = new URL(url).searchParams.get("orderId");
    return json({ orders: one ? ORDERS.filter((o) => o.id === one) : ORDERS, total: ORDERS.length });
  }
  const sod = /\/api\/orders\/([^/]+)\/sales-order-data/.exec(url);
  if (sod) {
    const o = ORDERS.find((row) => row.id === decodeURIComponent(sod[1]!));
    return o ? json(salesOrderData(o)) : json({ message: "not found" }, 404);
  }
  if (/\/api\/orders\/[^/]+\/payments/.test(url)) return json({ payments: [] });
  if (/\/api\/orders\/[^/]+\/revisions/.test(url)) {
    const id = /\/api\/orders\/([^/]+)\/revisions/.exec(url)![1];
    const o = ORDERS.find((row) => row.id === id) ?? ORDERS[0]!;
    return json({ revisions: [{ revision: 1, snapshot: { header: { so: o.so, delivery_date: o.delivery_date, proceed_date: o.proceed_date, customer_name: o.customer_name }, lines: LINES.map((l) => ({ ...l, unit_price: String(l.unit_price) })), addons: [] }, created_at: o.placed_at, created_by: null, created_by_name: "Bernard", actor_kind: "human", change_type: null, note: null }] });
  }
  if (url.includes("/amendment")) return json({ amendment: null });
  if (url.includes("/correction-work")) return json({ work: [] });
  if (url.includes("/service-cases")) return json({ cases: [] });
  if (url.includes("/receiving-sessions") || url.includes("/route")) return json({ sessions: [] });
  if (url.includes("/api/orders/customer-type")) return json({ existing: false, matches: 0 });
  if (url.includes("/api/outlets")) return json({ outlets: [{ id: "outlet-1", name: "Carres Kota Damansara" }] });
  if (url.includes("/api/operation/dealers")) return json({ dealers: [] });
  if (/\/api\/catalog(\?|$)/.test(url)) return json(CATALOG);
  if (url.includes("order-entry-config")) return json({ entryConfig: { formFields: null } });
  if (/\/api\/operation\/staff(\?|$)/.test(url)) return json({ staff: [{ user_id: ME, email: "sha@carres.example", name: "Shasha", pooled: true, available: true, note: null, last_seen_at: null, duties: [] }], myDuties: [], salespersons: [{ id: "sp", name: "Bernard" }] });
  if (url.includes("/api/operation/workspace-duties")) return json({ can_assign: false, duties: [] });
  if (/\/api\/operation\/suppliers(\?|$)/.test(url)) return json({ suppliers: SUPPLIERS.map((s) => ({ ...s, kind: "own_logistics", cat_covered: [], lead_time: null })) });
  if (/\/api\/operation\/partners(\?|$)/.test(url)) return json({ partners: [] });
  if (/\/api\/operation\/delivery-arrangements(\?|$)/.test(url)) return json({ arrangements: [], events: [], contacts: [] });
  if (/\/api\/operation\/delivery-orders(\?|$)/.test(url)) return json({ deliveryOrders: [], attempts: [], handoverEvents: [], proofReviews: [], attemptEvidence: [] });
  if (url.includes("/api/operation/register-layouts")) return json({ layouts: [], limit: 10 });
  if (url.includes("/api/operation/supplier-claims")) return json({ claims: [], counts: { open: 0, closed: 0, all: 0 } });
  if (url.includes("/api/operation/warehouse")) return json({ warehouses: [{ id: "w1", name: "Carres Klang", address: "Klang" }] });
  const poUnits = /\/api\/operation\/pos\/([^/?]+)\/units/.exec(url);
  if (poUnits) return json({ units: [] });
  const print = /\/api\/operation\/pos\/([^/?]+)\/print-data/.exec(url);
  if (print) {
    const po = POS.find((p) => p.id === decodeURIComponent(print[1]!));
    if (!po) return json({ code: "po_not_found", message: "Purchase Order not found." }, 404);
    const supplier = SUPPLIERS.find((s) => s.id === po.supplier_id)!;
    const dest = { name: "Carres Klang", address: "10 Example Warehouse Road, 42100 Klang, Selangor." };
    return json({
      po_number: po.id, po_id: po.id, version: 1, issue_date: po.placed_at.slice(0, 10),
      supplier: { name: supplier.name, address: "8 Example Industrial Road, Selangor.", contact: null },
      destination: dest, delivery_instructions: null, eta_date: po.official_delivery_date, delivery_working_days: 7,
      delivery_method: "supplier_delivers", terms: null, issued_by: "Yu Jun", so_refs: [Number(po.sources[0]!.reference.replace("SO-", ""))],
      lines: po.purchase_order_lines.map((l) => ({ sku: l.sku, description: "Carres Cloud · King", qty: l.qty, unit: "unit", destination: dest,
        attrs: l.attrs, identity_mode: "exact_unit", unit_codes: ["U1-001-001"], sources: [{ so: Number(po.sources[0]!.reference.replace("SO-", "")), qty: l.qty }] })),
    });
  }
  if (/\/api\/operation\/pos(\?|$)/.test(url)) {
    return json({ pos: POS, destinations: [{ id: "d1", name: "Carres Klang", is_default: true }],
      referencedDestinations: [{ id: "d1", name: "Carres Klang", is_default: true }], messageTemplate: "Please build this purchase order." });
  }
  return json({ message: "not seeded in the local walk" }, 404);
};

useAuth.setState({
  role: "operation", hydrated: true, loading: false,
  user: { id: ME, email: "sha@carres.example" } as never,
  session: { access_token: "preview", user: { id: ME, email: "sha@carres.example" } } as never,
});

/** Keep the open page in the address bar (`?at=`), so a reload returns to it. */
function LocationInAddressBar() {
  const location = useLocation();
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set("at", `${location.pathname}${location.search}`);
    window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
  }, [location.pathname, location.search]);
  return null;
}

const start = params.get("at") ?? "/operation?tab=purchase";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[start]}>
        <LocationInAddressBar />
        <Routes>
          <Route path="/operation/*" element={<OperationApp />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
