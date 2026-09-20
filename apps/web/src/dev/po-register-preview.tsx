/**
 * PURCHASE ORDERS REGISTER PREVIEW — DEV ONLY (walk aid for the 2026-09-04
 * register-facts correction).
 *
 * Same contract as `warehouse-monitor-preview.tsx`: the REAL
 * PurchaseOrdersPage, the REAL stylesheet, only the session seeded and the
 * API reads stubbed with fixtures. A separate vite entry — cannot reach
 * production. The fixtures exercise the four `Sent to Supplier` readings:
 * current version sent · older version sent (mismatch) · never sent ·
 * received goods with no send record (legacy, honestly `Not sent`).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import PurchaseOrdersPage from "@/pages/operation/purchase-orders/PurchaseOrdersPage";
import "@/index.css";

useAuth.setState({
  role: "operation",
  user: { email: "operation@carres.com" } as never,
});

function po(overrides: Record<string, unknown>) {
  return {
    supplier_id: "supplier-1",
    warehouse_id: "warehouse-1",
    destination_id: "destination-1",
    status: "open",
    sup_status: "pending",
    so: null,
    so_refs: null,
    expected_ready_date: null,
    official_delivery_date: null,
    purpose: "customer_sales",
    placed_at: "2026-08-28T08:00:00Z",
    sources: [{ kind: "sales_order", reference: "SO-4001" }],
    promises: [],
    purchase_order_lines: [],
    ...overrides,
  };
}

function line(id: string, qty: number, receivedQty: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    sku: "MAT-K-001",
    qty,
    received_qty: receivedQty,
    identity_mode: "exact_unit",
    model_name: "Cody",
    size: "King",
    attrs: { category: "mattress" },
    destination_id: "destination-1",
    sources: [],
    governed_sources: [{ kind: "sales_order", reference: "SO-4001", qty }],
    ...overrides,
  };
}

/* The real line-bound Units the PO minted at issue (§6.2, 0442–0444), by
   `po_line_id`. Nothing here is generated for the screen. */
const UNITS: Record<string, Array<{ unit_code: string; sku: string; status: string; po_line_id: string }>> = {
  "PO-20260901-1001": [
    { unit_code: "U1-000-081", sku: "MAT-K-001", status: "incoming", po_line_id: "l1" },
    { unit_code: "U1-000-082", sku: "MAT-K-001", status: "incoming", po_line_id: "l1" },
    { unit_code: "U1-000-083", sku: "MAT-K-001", status: "incoming", po_line_id: "l1" },
  ],
  "PO-20260902-1002": [
    { unit_code: "U1-000-084", sku: "MAT-K-001", status: "incoming", po_line_id: "l2" },
    { unit_code: "U1-000-085", sku: "MAT-K-001", status: "incoming", po_line_id: "l2" },
  ],
  "PO-20260903-1003": [],
};

const POS = [
  /* The mismatch the card exists to expose: the official document is V2 but
     only V1 ever gained confirmed-send evidence. */
  po({
    id: "PO-20260901-1001",
    eta_date: "2026-09-12",
    official_delivery_date: "2026-09-12",
    version: 2,
    purchase_order_lines: [line("l1", 3, 1)],
    /* Two trucks, two arrival dates, two quantities — the case the count link
       exists for. */
    grns: [
      { id: "receipt-1", grn_no: "GRN-20260910-1001", goods_received_at: "2026-09-09", received_qty: 2 },
      { id: "receipt-2", grn_no: "GRN-20260912-1002", goods_received_at: "2026-09-12", received_qty: 1 },
    ],
    /* 0430 — a V1 reply recorded WITHOUT evidence: readable history, never a
       confirmation of the current V2. */
    promises: [{ kind: "tomorrow_delivery", answer: "shipping", about_date: "2026-09-12", previous_date: null, new_date: null, reason: null, po_version: 1, recorded_at: "2026-09-01T09:00:00Z" }],
    sends: [{ channel: "whatsapp", note: null, sent_at: "2026-09-03T09:00:00Z", kind: "confirmed_sent", recipient: "Hooka Purchasing Group", po_version: 1, sent_by_name: "Yee Jean", duty_name: "Yee Jean", acting_name: null, po_revisions: null }],
  }),
  /* Current version sent by email — PO V2 / PO V2. The reply form is OPEN
     here: type an earlier/later date to walk the 0430 classification. */
  po({
    id: "PO-20260902-1002",
    eta_date: "2026-09-20",
    official_delivery_date: "2026-09-20",
    version: 2,
    purchase_order_lines: [
      line("l2", 5, 0),
      /* Counted goods: no Unit ID by law, so the cell prints `—`. */
      line("l2-acc", 10, 0, { id: "l2-acc", sku: "PROT-Q", identity_mode: "quantity", model_name: "Mattress protector", size: "Queen", attrs: { category: "protector" } }),
    ],
    /* MPR is the visible identity again (owner ruling 2026-09-18). */
    sources: [{ kind: "manual_purchase", reference: "MPR-20260828-0533", req_no: "MPR-20260828-0533", request_id: "request-1", purpose: "ready_stock", proceed_date: "2026-08-28" }],
    sends: [{ channel: "email", note: null, sent_at: "2026-09-04T02:00:00Z", kind: "confirmed_sent", recipient: "buy@hooka.my", po_version: 2, sent_by_name: "Yee Jean", duty_name: "Yee Jean", acting_name: null, po_revisions: null }],
  }),
  /* Never sent — PO V1 / Not sent. */
  po({
    id: "PO-20260903-1003",
    eta_date: "2026-09-25",
    official_delivery_date: "2026-09-25",
    version: 1,
    purchase_order_lines: [line("l3", 2, 0)],
    /* Two Sales Orders behind one PO: the approved count, and the Order Route
       where each one is its own row. */
    sources: [
      { kind: "sales_order", reference: "SO-4001", order_id: "order-1" },
      { kind: "sales_order", reference: "SO-4002", order_id: "order-2" },
    ],
    sends: [],
  }),
  /* 0430 — original date genuinely unknown (ready-date recompute, pre-0428):
     the PO Delivery Date column states the absence; a reply records the
     supplier date without any relative claim. An evidenced earlier reply and
     an unevidenced older one share the Reply history. */
  po({
    id: "PO-20260830-1004",
    eta_date: "2026-09-18",
    official_delivery_date: null,
    version: 1,
    purchase_order_lines: [line("l5", 2, 0)],
    promises: [
      { kind: "tomorrow_delivery", answer: "reported", about_date: null, previous_date: null, new_date: "2026-09-17", reason: null, po_version: 1, channel: "whatsapp", recipient: "Hooka Purchasing Group", evidence: "PO-20260830-1004/reply.png", reported_by: "Factory staff", reported_at: "2026-09-05T03:00:00Z", recorded_by: "user-duty", recorded_by_name: "Yee Jean", recorded_at: "2026-09-05T03:10:00Z" },
      { kind: "tomorrow_delivery", answer: "shipping", about_date: "2026-09-18", previous_date: null, new_date: null, reason: null, po_version: 1, recorded_at: "2026-09-02T08:00:00Z" },
    ],
    sends: [{ channel: "whatsapp", note: null, sent_at: "2026-09-01T09:00:00Z", kind: "confirmed_sent", recipient: "Hooka Purchasing Group", po_version: 1, sent_by_name: "Yee Jean", duty_name: "Yee Jean", acting_name: null, po_revisions: null }],
  }),
  /* Legacy: goods fully received, no send record — evidence stays missing. */
  po({
    id: "PO-LEGACY-0007",
    eta_date: null,
    version: 1,
    status: "received",
    purchase_order_lines: [line("l4", 4, 4)],
    grns: [{ id: "receipt-9", grn_no: "GRN-20250104-0001", goods_received_at: "2025-01-04", received_qty: 4 }],
    sends: [],
  }),
];

/* Enough rows in one group that the operator scrolls THROUGH it — which is
   the only condition under which a group-local sticky header can be read. */
for (let n = 0; n < 14; n += 1) {
  POS.push(po({
    id: `PO-2026090${(n % 9) + 1}-2${String(100 + n)}`,
    eta_date: "2026-09-28",
    official_delivery_date: "2026-09-28",
    version: 1,
    purchase_order_lines: [line(`f${n}`, 2, 0)],
    sends: [],
  }));
}

const ROUTES: Array<[test: (url: string) => boolean, body: () => unknown]> = [
  [(url) => /\/api\/operation\/pos\/[^/]+\/units/.test(url), () => ({ units: [] })],
  [(url) => url.includes("/api/operation/register-layouts"), () => ({ layouts: [], limit: 10 })],
  [(url) => /\/api\/operation\/pos\/[^/]+\/receiving/.test(url), () => ({ sessions: [], events: [] })],
  [(url) => /\/api\/operation\/pos\/[^/]+\/audit/.test(url), () => ({ revisions: [], history: [] })],
  [(url) => url.includes("/api/operation/pos"), () => ({
    pos: POS,
    destinations: [{ id: "destination-1", name: "Carres Klang", is_default: true }],
    referencedDestinations: [{ id: "destination-1", name: "Carres Klang", is_default: true }],
    messageTemplate: "Please build this purchase order.",
  })],
  [(url) => url.includes("/api/operation/suppliers"), () => ({
    suppliers: [{ id: "supplier-1", name: "Hooka", kind: "own_logistics", cat_covered: [], lead_time: null, contact: "+60123456789", whatsapp_group_url: "https://chat.whatsapp.com/hooka", contact_email: "buy@hooka.my" }],
  })],
  [(url) => url.includes("/api/operation/warehouse"), () => ({
    warehouses: [{ id: "warehouse-1", name: "Carres Klang", address: "Klang" }],
  })],
  [(url) => url.includes("/api/operation/workspace-duties"), () => ({
    can_assign: false,
    duties: [{
      key: "po_duty",
      label: "PO Duty",
      resolution: {
        duty_key: "po_duty",
        normal_user_id: "user-duty",
        normal_user_name: "Yu Jun",
        acting_user_id: null,
        acting_user_name: null,
        actor_user_id: "user-duty",
        is_cover: false,
        source: "assignment",
      },
      assignments: [],
      covers: [],
    }],
  })],
  [(url) => url.includes("/api/operation/supplier-claims"), () => ({
    claims: [],
    counts: { open: 0, closed: 0, all: 0 },
  })],
];

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const units = /\/api\/operation\/pos\/([^/]+)\/units/.exec(url);
  if (units) {
    return new Response(JSON.stringify({ units: UNITS[decodeURIComponent(units[1]!)] ?? [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  const route = ROUTES.find(([test]) => test(url));
  if (route) {
    return new Response(JSON.stringify(route[1]()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (url.includes("/api/")) {
    return new Response(JSON.stringify({}), { status: 404 });
  }
  return realFetch(input, init);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        {/* The real shell gives the page a bounded height, which is what the
            register's own scroll container — and therefore every sticky
            header — anchors to. Without it the preview would grow forever and
            nothing would ever stick. */}
        <div className="h-screen">
          <Routes>
            <Route path="*" element={<PurchaseOrdersPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
