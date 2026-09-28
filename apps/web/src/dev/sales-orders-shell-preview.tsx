/**
 * SALES ORDERS · REAL SHELL PREVIEW — DEV ONLY (the eleven-column composition,
 * Jess 2026-09-21: Proceed Date · SO Doc Date · SO No lead).
 *
 * The REAL `OperationApp` — portal sidebar, destination header and the Sales
 * Orders Register — at `/operation/orders`, so the leading three are measured
 * with the chrome production puts beside it. Only the network is seeded: every
 * API call is answered locally and nothing leaves the browser. A separate vite
 * entry (`sales-orders-shell-preview.html`), so it cannot reach production.
 * Fixture evidence is not authenticated production evidence.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import OperationApp from "@/pages/operation/OperationApp";
import type { SoBatchPurchaseResponse } from "@carres/shared";
import { appTodayIso } from "@/lib/fmt-date";
import "@/index.css";

const CUSTOMERS = [
  "Kimmy", "LIM KUAN YANG", "Nurul Aisyah binti Abdul Rahman", "PETER", "ANNE", "Tan Ah Kow",
  "Mohd Hafiz", "CHONG WEI MING & FAMILY", "Siti", "Rajesh Kumar a/l Subramaniam",
];
const CITIES: Array<[string, string]> = [
  ["Petaling Jaya", "Selangor"], ["Johor Bahru", "Johor"], ["Kuala Lumpur", "Kuala Lumpur"],
  ["Port Dickson", "Negeri Sembilan"], ["Kota Kinabalu", "Sabah"],
];

/* The longest live salesperson (`Khoo Aik Yean`) and one far longer than any
   real name, so the one-line cell's ellipsis and its open-whole door are walked. */
const SALESPEOPLE = ["Khoo Aik Yean", "Mayson", "Alvin", "Nur Syafiqah Binti Mohd Zulkifli", "tan qu qu"];

const orders = Array.from({ length: 24 }, (_, n) => {
  const i = n + 1;
  const [city, state] = CITIES[i % CITIES.length]!;
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    so: 1340 - i,
    status: "proceed_order",
    operation_stage: "confirmed",
    warehouse_id: null,
    customer_name: CUSTOMERS[i % CUSTOMERS.length],
    customer_phone: `01${i % 10}-34789${String(10 + i).slice(-2)}`,
    customer_address_city: city,
    customer_address_state: state,
    // One order from an earlier year: the widest date the column must hold.
    placed_at: i === 7 ? "2025-05-28T02:00:00Z" : `2026-09-${String(1 + (i % 16)).padStart(2, "0")}T02:00:00Z`,
    proceeded_at: i === 7 ? "2025-06-02T02:00:00Z" : `2026-09-${String(2 + (i % 16)).padStart(2, "0")}T06:00:00Z`,
    salesperson_id: "sp",
    salespersons: { name: SALESPEOPLE[i % SALESPEOPLE.length] },
    delivery_date: `2026-10-${String(1 + (i % 27)).padStart(2, "0")}`,
    delivery_date_tbd: false,
    delivery_partner_id: null,
    request_for_delivery_at: null,
    partner_accepted_at: null,
    partner_rejected_at: null,
    partner_rejected_reason: null,
    delivery_partners: null,
    do_number: null,
    dispatched_at: null,
    delivered_at: null,
    /* Sales Location = the outlet, else the dealer. The longest live outlet,
       and every sixth order a dealer sale with no outlet at all. */
    outlet_id: i % 6 === 0 ? null : "outlet-1",
    outlets: i % 6 === 0 ? null : { name: i % 2 ? "Carres Kota Damansara" : "Carres Maluri Cheras" },
    dealer_id: i % 6 === 0 ? "dealer-1" : null,
    dealers: { name: "Home Living Furniture Sdn Bhd" },
    order_supplier_threads: [],
    order_annotations: [],
    paid: 1250,
    po_numbers: i % 7 === 0 ? [`PO-20260910-${4000 + i}`, `PO-20260911-${5000 + i}`] : i % 3 ? [`PO-20260910-${4000 + i}`] : [],
    ops_delivery_orders: i % 5 === 0 ? [{ do_number: `DO-20260915-${7000 + i}` }] : [],
    order_lines: [
      { id: `line-${i}-1`, sku: i % 2 ? "CODY-SK" : "B1201S-K", qty: 1, unit_price: 2499, attrs: { category: "mattress", fabric_code: "BF-10 Charcoal Velvet", colour: "Deep Ocean Blue" } },
      ...(i % 3 === 0 ? [{ id: `line-${i}-2`, sku: "MEMORY-FOAM-PILLOW-asd", qty: 2, unit_price: 99, attrs: { category: "accessory" } }] : []),
    ],
    order_addons: [],
  };
});

/* ── MONTHLY DEMAND (Scope F) — `?view=monthly`. Placeholders in braces stand
   where a real record would print; nothing here is a real customer or dealer. */

const monthOf = (offset: number) => {
  const now = appTodayIso();
  const at = Number(now.slice(0, 4)) * 12 + Number(now.slice(5, 7)) - 1 + offset;
  return `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, "0")}`;
};
const DEMAND_SKUS: Array<[string, string]> = [
  ["MS12 Firmcare 10inch Queen", "mattress"],
  ["BF07 Hilton Divan King", "bedframe"],
  ["SF03 Muro 2 Seater", "sofa"],
  ["Memory Pillow", "accessory"],
];
const DEMAND_PLACES: Array<[string, string]> = [
  ["Petaling Jaya", "Selangor"], ["Johor Bahru", "Johor"], ["Kuala Lumpur", "Kuala Lumpur"],
];
const demandOrders = Array.from({ length: 40 }, (_, i) => {
  /* -1 = before the window · 0..5 = the six months · 6 = after · 7 = no date */
  const slot = i % 9 === 8 ? 7 : (i % 8) - 1;
  const [sku, category] = DEMAND_SKUS[i % DEMAND_SKUS.length]!;
  const [city, state] = DEMAND_PLACES[i % DEMAND_PLACES.length]!;
  const qty = 1 + (i % 3);
  return {
    id: `md-${i}`,
    so: 1500 + i,
    deliveryDate: slot === 7 ? null : `${monthOf(slot)}-${String(3 + (i % 25)).padStart(2, "0")}`,
    deliveryDateTbd: slot === 7 && i % 2 === 0,
    salesLocation: `{dealer ${1 + (i % 3)}}`,
    state,
    city,
    lines: [
      { id: `md-${i}-l1`, sku, qty, category },
      ...(i === 5 ? [{ id: "md-5-l2", sku: "{not in catalog}", qty: 1, category: null }] : []),
    ],
    delivered: i % 4 === 0 ? [{ orderLineId: `md-${i}-l1`, sku, qty: 1 }] : [],
  };
});
const demandPurchase: SoBatchPurchaseResponse = {
  today: appTodayIso(),
  rows: [],
  registerRows: demandOrders.filter((_, i) => i % 3 !== 0).map((o) => ({
    orderId: o.id, so: o.so, customer: "{customer}", status: "blank" as const,
    proceededAt: `${appTodayIso()}T09:00:00+08:00`, requestedDeliveryDate: o.deliveryDate,
    deliveryCity: o.city, deliveryState: o.state, pos: [],
    /* A delivered Unit was taken from stock first — SO Batch's own rule. */
    lines: [{ orderLineId: o.lines[0]!.id, sku: o.lines[0]!.sku, qty: o.lines[0]!.qty,
      stockTaken: o.delivered.reduce((sum, unit) => sum + unit.qty, 0),
      item: "{item}", variant: "{size}", category: "mattress" as const, pos: [] }],
    outstandingSuppliers: [],
  })),
  destinations: [], defaultDestinationId: null,
  currentPoDuty: null, actingPoDuty: null,
  poDutyNameUnavailable: false, poDutyUnavailable: false, mayIssue: false,
  procurementPartners: [], safetyDays: 14,
} as unknown as SoBatchPurchaseResponse;

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("127.0.0.1:88") && !url.includes("localhost:88")) return realFetch(input, init);
  const expansion = /\/api\/operation\/orders\/([^/]+)\/expansion/.exec(url);
  const order = expansion ? orders.find((o) => o.id === expansion[1]) : undefined;
  if (/\/api\/operation\/orders\/monthly-demand/.test(url)) {
    return new Response(JSON.stringify({ orders: demandOrders }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (/\/api\/operation\/purchase\/demands/.test(url)) {
    return new Response(JSON.stringify(demandPurchase), { status: 200, headers: { "content-type": "application/json" } });
  }
  const body = /\/api\/operation\/orders(\?|$)/.test(url)
    ? { orders, salesOrderTotal: orders.length }
    : order
      ? { lines: order.order_lines.map((l, k) => ({
          lineId: l.id, sku: l.sku, unitIds: k === 0 && order.so % 2 ? ["KLG-M-240915-01"] : [],
          verifiedUnitIds: k === 0 && order.so % 2 ? ["KLG-M-240915-01"] : [], unverifiedUnitIds: [],
          deliverTo: order.po_numbers.length ? [{ name: "Carres Klang", qty: l.qty }] : [],
        })) }
      : /\/api\/catalog(\?|$)/.test(url)
        ? { models: [{ id: "m-cody", name: "Cody" }, { id: "m-b12", name: "Booqit Hybrid" }, { id: "m-pl", name: "Latex Pillow" }],
            skus: [
              { id: "s1", modelId: "m-cody", sku: "CODY-SK", variant: "Super King" },
              { id: "s2", modelId: "m-b12", sku: "B1201S-K", variant: "King" },
              { id: "s3", modelId: "m-pl", sku: "MEMORY-FOAM-PILLOW-asd", variant: "Standard" },
            ],
            sofaFabrics: [], addons: [], floorConfig: {} }
        : url.includes("/rest/") ? [] : {};
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
};

useAuth.setState({
  role: "operation", hydrated: true, loading: false,
  user: { id: "u-op", email: "preview@carres.local" } as never,
  session: { access_token: "preview", user: { id: "u-op", email: "preview@carres.local" } } as never,
});

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/operation/orders${window.location.search}`]}>
        <Routes>
          <Route path="/operation/*" element={<OperationApp />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
