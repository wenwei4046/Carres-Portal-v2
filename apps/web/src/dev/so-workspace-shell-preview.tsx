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
import OperationApp from "@/pages/operation/OperationApp";
import "@/index.css";

const STATE = new URLSearchParams(window.location.search).get("state") ?? "full";
const ROLE = new URLSearchParams(window.location.search).get("as") === "principal" ? "principal" : "operation";
useAuth.setState({
  role: ROLE as never,
  user: { email: "operation@carres.co" } as never,
});

const ID = "11111111-1111-1111-1111-111111111111";

const ORDER = {
  id: ID, so: 1319, status: "proceed_order", operation_stage: "proceed_order",
  /* A DIAL-ABLE placeholder, not a real number: the customer-type probe is
     disabled below 8 digits, so "(masked)" left the `· {n} orders ›` door
     (ruling 2026-09-21) invisible in the walk. `0100000000` is the same
     invented number the PDF fixture already uses. */
  customer_name: "Customer (masked)", customer_phone: "0100000000",
  customer_email: "(masked)",
  customer_address_line1: "(masked)", customer_address_line2: "(masked)",
  customer_address_city: "Petaling Jaya", customer_address_state: "Selangor",
  customer_address_postcode: "47300", customer_address_unknown: false,
  customer_billing: null, customer_billing_same: true,
  customer_emergency: "(masked) · (masked) · (masked)",
  customer_race: "(masked)", customer_gender: "(masked)", customer_birthday: null,
  entry_data: { fields: { building_type: "Condo" } },
  delivery_floor: 3, delivery_has_lift: false, delivery_stair_items: 2,
  placed_at: "2026-08-21T02:00:00Z", delivery_date: "2026-09-24",
  delivery_date_tbd: false, proceed_date: "2026-08-26",
  source_ref: ["CR-2207", "TCF-8891"], source_system: "native",
  paid: STATE === "agreement-zero" ? 0 : STATE === "saved" ? 1250 : 2999.5, dealer_id: "d1", outlet_id: "o1", salesperson_id: "s1",
  dealers: { name: "Carres HQ" }, outlets: { name: "PJ Showroom" },
  salespersons: { name: "Bernard" },
  installment_months: 12, payment_method: "installment",
  approval_code: "BANK-REFERENCE", payment_slip_url: "orders-attachments/preview/slip.jpg",
  do_number: null, invoice_no: null, invoiced_at: null, delivered_at: null,
  dispatched_at: null, warehouse_id: null, delivery_partner_id: null,
};

const LINES = [
  { id: "l1", sku: "M1401F-K", qty: 2, unit_price: 1890, label: "M1401F · King",
    attrs: { size: "King", firmness: "Medium" }, source_po: null, category: "mattress" },
  { id: "l2", sku: "GIFT-PILLOW", qty: 1, unit_price: 0, label: "Latex pillow",
    attrs: {}, source_po: null, category: "accessory" },
];
const ADDONS = [
  { addon_key: "DELIVERY", qty: 1, unit_price: 250, attrs: null },
  { addon_key: "STAIR_CARRY", qty: 1, unit_price: 100, attrs: null },
  /* `?state=disposal` walks a lower-case catalogue key (`dispose-mattress`):
     the Item Code prints upper case, and Delivery states the disposal from
     this same row without charging it again. */
  ...(STATE === "disposal" ? [{ addon_key: "dispose-mattress", qty: 2, unit_price: 80, attrs: { size: "Queen" } }] : []),
];
const SERVICES_TOTAL = ADDONS.reduce((n, a) => n + a.qty * a.unit_price, 0);

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

/* The preview's own amendment lane, so a walk can submit, record the customer agreement and decide. */
const LIVE: { amendment: Record<string, unknown> | null } = { amendment: null };
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  if (url.includes(`/payments`)) {
    if (["empty", "saved", "agreement-zero"].includes(STATE)) return json({ payments: [] });
    if (STATE === "forbidden") return json({ error: "Operation or principal only" }, 403);
    return json({ payments: PAYMENTS });
  }
  if (url.includes("/expansion"))
    return json({ lines: [
      { lineId: "l1", unitIds: ["U1-000-082", "U1-000-083"], deliverTo: [{ name: "AL Sungai Buloh", qty: 2 }] },
      { lineId: "l2", unitIds: [], deliverTo: [] },
    ] });
  if (url.includes("/revisions"))
    return json({ revisions: [{ revision: 1, snapshot: { header: { so: 1319, delivery_date: "2026-09-24", proceed_date: "2026-08-26", customer_name: ORDER.customer_name }, lines: LINES.map((l) => ({ ...l, unit_price: String(l.unit_price) })), addons: ADDONS.map((a) => ({ addon_key: a.addon_key, qty: a.qty, unit_price: String(a.unit_price) })) }, created_at: "2026-08-21T02:00:00Z", created_by: null, created_by_name: "Preview", actor_kind: "human", change_type: null, note: null }] });
  if (url.includes("/changes")) {
    LIVE.amendment = {
      id: "aaaaaaaa-1111-2222-3333-444444444444", status: "submitted", reason: "Preview request",
      base_revision: 1, base_contractual_hash: "h", current_contractual_hash: "h", stale: false,
      proposed_snapshot: JSON.parse(String((init?.body ?? "{}"))).lines
        ? { lines: JSON.parse(String(init?.body)).lines, addons: JSON.parse(String(init?.body)).addons }
        : {},
      submitted_at: new Date().toISOString(), customer_asked_on: null,
      customer_agreement_kind: JSON.parse(String(init?.body ?? "{}")).agreement?.kind ?? null,
      customer_agreement_reference: JSON.parse(String(init?.body ?? "{}")).agreement?.reference ?? null,
      customer_agreement_covers_proposal: Boolean(JSON.parse(String(init?.body ?? "{}")).agreement),
    };
    return json({ action: "submitted", amendmentId: LIVE.amendment.id, baseRevision: 1, agreementRecorded: Boolean(LIVE.amendment.customer_agreement_kind) }, 201);
  }
  if (url.includes("/agreement")) {
    if (LIVE.amendment) {
      const b = JSON.parse(String(init?.body ?? "{}"));
      LIVE.amendment.customer_agreement_kind = b.kind;
      LIVE.amendment.customer_agreement_reference = b.reference;
      LIVE.amendment.customer_agreement_covers_proposal = true;
    }
    return json({ ok: true });
  }
  if (url.includes("/decide")) { LIVE.amendment = null; return json({ id: "a", status: "applied", revision: 2 }); }
  if (url.includes("/amendment")) return json({ amendment: LIVE.amendment });
  if (url.includes("/correction-work")) return json({ work: [] });
  if (url.includes("/service-cases")) return json({ cases: [] });
  if (url.includes("/receiving-sessions") || url.includes("/route")) return json({ sessions: [] });
  // The PDF and form must use the same saved facts, including services and paid. The fixture
  // must not hide a parity failure behind unrelated document totals.
  if (url.includes("/sales-order-data"))
    return json({
      order_id: ID, so_number: "SO-1319", order_code: "SO-1319", issue_date: "2026-08-21", currency: "MYR",
      customer: { name: ORDER.customer_name, phone: ORDER.customer_phone,
        email: ORDER.customer_email, address: "(masked), Petaling Jaya" },
      dealer: { name: "Carres HQ", contact: null, salesperson_name: "Bernard",
        outlet_name: "PJ Showroom" },
      partner: null,
      lines: LINES.map((l) => ({ ...l, description: l.label, line_total: l.qty * l.unit_price })),
      /* The server sends each service's stored key as `sku` (the Item Code). */
      addons: ADDONS.map((a) => ({ ...a, sku: a.addon_key,
        label: a.addon_key === "DELIVERY" ? "Delivery fee" : a.addon_key === "STAIR_CARRY" ? "Stair carry" : "Dispose old mattress",
        line_total: a.qty * a.unit_price })),
      payments: [],
      subtotal: 3780 + SERVICES_TOTAL, total: 3780 + SERVICES_TOTAL, paid: ORDER.paid,
      balance_due: 3780 + SERVICES_TOTAL - ORDER.paid,
      delivery_date: "2026-09-24",
    });
  if (url.includes("/api/operation/workspace-duties")) return json({ duties: [] });
  /* The probe behind the customer-type chip and its orders door. */
  if (url.includes("/api/orders/customer-type"))
    return json({ existing: STATE !== "newcustomer", matches: STATE !== "newcustomer" ? 4 : 0 });
  if (url.includes("/api/outlets")) return json({ outlets: [{ id: "o1", name: "PJ Showroom" }] });
  if (url.includes("/api/operation/dealers")) return json({ dealers: [{ id: "d1", name: "Carres HQ" }] });
  if (url.includes("/api/operation/staff") || url.includes("salespersons"))
    return json({ salespersons: [{ id: "s1", name: "Bernard" }] });
  if (url.includes("/api/catalog"))
    return json({
      models: [
        { id: "m-1401", name: "M1401F", category: "mattress", allowedOptions: { gaps: ['4"', '6"'] } },
        { id: "m-pillow", name: "Latex pillow", category: "accessory" },
      ],
      skus: [
        { id: "s-k", modelId: "m-1401", sku: "M1401F-K", variant: "King", price: 1890 },
        { id: "s-q", modelId: "m-1401", sku: "M1401F-Q", variant: "Queen", price: 1690 },
        { id: "s-p", modelId: "m-pillow", sku: "GIFT-PILLOW", variant: "Standard", price: 0 },
      ],
      floorConfig: { freeUpToFloor: 2, perFloorPerItem: 50 },
      sofaFabrics: [], addons: [
      { key: "DELIVERY", name: "Delivery fee", price: 250 },
      { key: "STAIR_CARRY", name: "Stair carry", price: 100 },
      { key: "dispose-mattress", name: "Dispose old mattress", price: 80, active: true },
    ], entryConfig: { formFields: null } });
  if (url.includes("order-entry-config")) return json({ entryConfig: { formFields: null } });
  if (url.match(/\/api\/operation\/orders\/[0-9a-f-]+$/))
    return json({ order: ORDER, lines: LINES, addons: ADDONS, total: 3780 + SERVICES_TOTAL,
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
          <Route path="/operation/*" element={<OperationApp />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
