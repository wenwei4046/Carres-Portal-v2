/**
 * SALES ORDER DETAIL PREVIEW — DEV ONLY (walk aid for the approved composition).
 *
 * Same contract as the other `src/dev/*-preview.tsx` entries: the REAL
 * SalesOrderWorkspace and the REAL stylesheet, only the session seeded and the
 * API stubbed with a fixture. A separate vite entry — it cannot reach
 * production.
 *
 * The fixture is chosen to exercise what the composition changed:
 *   · a priced goods line, a RECORDED GIFT at RM 0.00, and two services
 *   · a payment ledger with a live payment, a deposit with nothing recorded on
 *     it, and a VOIDED row that must stay visible and stamped
 *   · `?state=empty` walks the no-payments case, `?state=forbidden` the 403 —
 *     because "absence is not zero" is only visible in those two.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import SalesOrderWorkspace from "@/pages/operation/SalesOrderWorkspace";
import "@/index.css";

const STATE = new URLSearchParams(window.location.search).get("state") ?? "full";
useAuth.setState({
  role: "operation" as never,
  user: { email: "operation@carres.co" } as never,
});

const ID = "11111111-1111-1111-1111-111111111111";

const ORDER = {
  id: ID, so: 1319, status: "proceed_order", operation_stage: "proceed_order",
  customer_name: "LIM KUAN YANG", customer_phone: "0162157293",
  customer_email: "lim@example.com",
  customer_address_line1: "12 Jalan SS2/24", customer_address_line2: "Taman Bahagia",
  customer_address_city: "Petaling Jaya", customer_address_state: "Selangor",
  customer_address_postcode: "47300", customer_address_unknown: false,
  customer_billing: null, customer_billing_same: true,
  customer_emergency: "Siti · 0198887777 · Spouse",
  customer_race: "Chinese", customer_gender: "Male", customer_birthday: "1990-02-08",
  entry_data: { fields: { building_type: "Condo" } },
  delivery_floor: 3, delivery_has_lift: false, delivery_stair_items: 2,
  placed_at: "2026-08-21T02:00:00Z", delivery_date: "2026-09-24",
  delivery_date_tbd: false, proceed_date: "2026-08-26",
  source_ref: ["CR-2207", "TCF-8891"], source_system: "native",
  paid: STATE === "evidence-zero" ? 0 : STATE === "saved" ? 1250 : 2999.5, dealer_id: "d1", outlet_id: "o1", salesperson_id: "s1",
  dealers: { name: "Carres HQ" }, outlets: { name: "PJ Showroom" },
  salespersons: { name: "Bernard" },
  installment_months: 12, payment_method: "installment",
  approval_code: "BANK-REFERENCE", payment_slip_url: "orders-attachments/preview/slip.jpg",
  do_number: null, invoice_no: null, invoiced_at: null, delivered_at: null,
  dispatched_at: null, warehouse_id: null, delivery_partner_id: null,
};

const LINES = [
  { id: "l1", sku: "M1401F-K", qty: 2, unit_price: 1890, label: "Jager · King",
    attrs: { size: "King", firmness: "Medium" }, source_po: null, category: "mattress" },
  { id: "l2", sku: "GIFT-PILLOW", qty: 1, unit_price: 0, label: "Latex pillow",
    attrs: {}, source_po: null, category: "accessory" },
];
const ADDONS = [
  { addon_key: "DELIVERY", qty: 1, unit_price: 250, attrs: null },
  { addon_key: "STAIR_CARRY", qty: 1, unit_price: 100, attrs: null },
];

const PAYMENTS = [
  { id: "p1", order_id: ID, amount: 2499.5, paid_on: "2026-09-02", method: "bank",
    kind: "payment", reference: "TXN-77120", receipt_no: "RC-020926-0031",
    receipt_url: "https://receipts.example/p1", note: null, recorded_by: "u1",
    recorded_by_name: "Shasha", created_at: "2026-09-02T02:00:00Z",
    counted_in_paid: true, voided_at: null },
  { id: "p2", order_id: ID, amount: 500, paid_on: "2026-08-21", method: "duitnow_qr",
    kind: "deposit", reference: null, receipt_no: null, receipt_url: null, note: null,
    recorded_by: null, recorded_by_name: null, created_at: "2026-08-21T02:00:00Z",
    counted_in_paid: false, voided_at: null },
  { id: "p3", order_id: ID, amount: 1200, paid_on: "2026-08-20", method: "cash",
    kind: "payment", reference: "WRONG-KEY", receipt_no: "RC-200826-0007",
    receipt_url: null, note: null, recorded_by: "u2", recorded_by_name: "Li Ching",
    created_at: "2026-08-20T02:00:00Z", counted_in_paid: true,
    voided_at: "2026-08-20T06:00:00Z", void_reason: "Keyed on the wrong order" },
];

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  if (url.includes(`/payments`)) {
    if (["empty", "saved", "evidence-zero"].includes(STATE)) return json({ payments: [] });
    if (STATE === "forbidden") return json({ error: "Operation or principal only" }, 403);
    return json({ payments: PAYMENTS });
  }
  if (url.includes("/expansion"))
    return json({ lines: [
      { lineId: "l1", unitIds: ["U1-000-082", "U1-000-083"], deliverTo: [{ name: "AL Sungai Buloh", qty: 2 }] },
      { lineId: "l2", unitIds: [], deliverTo: [] },
    ] });
  if (url.includes("/revisions")) return json({ revisions: [] });
  if (url.includes("/amendment")) return json({ amendment: null });
  if (url.includes("/correction-work")) return json({ work: [] });
  if (url.includes("/service-cases")) return json({ cases: [] });
  if (url.includes("/receiving-sessions") || url.includes("/route")) return json({ sessions: [] });
  // The PDF and form must use the same saved facts, including services and paid. The fixture
  // must not hide a parity failure behind unrelated document totals.
  if (url.includes("/sales-order-data"))
    return json({
      order_id: ID, so_number: "SO-1319", order_code: "SO-1319", issue_date: "2026-08-21", currency: "MYR",
      customer: { name: ORDER.customer_name, phone: ORDER.customer_phone,
        email: ORDER.customer_email, address: "12 Jalan SS2/24, Petaling Jaya" },
      dealer: { name: "Carres HQ", contact: null, salesperson_name: "Bernard",
        outlet_name: "PJ Showroom" },
      partner: null,
      lines: LINES.map((l) => ({ ...l, description: l.label, line_total: l.qty * l.unit_price })),
      addons: ADDONS.map((a) => ({ ...a, label: a.addon_key === "DELIVERY" ? "Delivery fee" : "Stair carry", line_total: a.qty * a.unit_price })),
      payments: [],
      subtotal: 4130, total: 4130, paid: ORDER.paid, balance_due: 4130 - ORDER.paid,
      delivery_date: "2026-09-24",
    });
  if (url.includes("/api/operation/workspace-duties")) return json({ duties: [] });
  if (url.includes("/api/outlets")) return json({ outlets: [{ id: "o1", name: "PJ Showroom" }] });
  if (url.includes("/api/operation/dealers")) return json({ dealers: [{ id: "d1", name: "Carres HQ" }] });
  if (url.includes("/api/operation/staff") || url.includes("salespersons"))
    return json({ salespersons: [{ id: "s1", name: "Bernard" }] });
  if (url.includes("/api/catalog"))
    return json({ skus: [], models: [], addons: [
      { key: "DELIVERY", name: "Delivery fee", price: 250, active: true },
      { key: "STAIR_CARRY", name: "Stair carry", price: 100, active: true },
      { key: "dispose-mattress", name: "Dispose old mattress", price: 80, active: true, serviceSku: "SVC-DISPOSE-MATTRESS", sizeOptions: ["King", "Queen", "Super Single", "Single"] },
    ], entryConfig: { formFields: null } });
  if (url.includes("order-entry-config")) return json({ entryConfig: { formFields: null } });
  if (url.match(/\/api\/operation\/orders\/[0-9a-f-]+$/))
    return json({ order: ORDER, lines: LINES, addons: ADDONS, total: 4130,
      warehouse: null, stockBalances: [], freeUnits: [], pos: [], history: [], threads: [] });
  return realFetch(input as RequestInfo, init);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {/* The workspace reads `:orderId` from the route, so the preview must
          actually BE on that route — a `path="*"` mount would render the
          create-a-new-order mode and prove nothing about the object page. */}
      <MemoryRouter initialEntries={[`/operation/orders/so/${ID}`]}>
        <Routes>
          <Route path="/operation/orders/so/:orderId" element={<SalesOrderWorkspace />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
