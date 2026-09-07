/**
 * RECEIVING PREVIEW — DEV ONLY (walk aid for CARD-2026-09-04-receiving-01).
 *
 * Same contract as the other `src/dev/*-preview.tsx` entries: the REAL
 * OperationReceiving page, the REAL stylesheet, only the session seeded and
 * the API stubbed with a card fixture. A separate vite entry — cannot reach
 * production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildGrnRegisterView } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import OperationReceiving from "@/pages/operation/OperationReceiving";
import OperationReceivingReport from "@/pages/operation/OperationReceivingReport";
import StaffDuties from "@/pages/operation/StaffDuties";
import WarehouseIncoming from "@/pages/warehouse/WarehouseIncoming";
import "@/index.css";

/** ?page=duties | report | warehouse — defaults to the Receiving register. */
const PAGE = new URLSearchParams(window.location.search).get("page") ?? "receiving";

useAuth.setState({
  role: PAGE === "warehouse" ? "warehouse" : "operation",
  user: { email: PAGE === "warehouse" ? "nets@carres.co" : "sha@carres.co" } as never,
});

const WH = "11111111-1111-1111-1111-111111111111";
const WH2 = "33333333-3333-3333-3333-333333333333";
const POSTED = "22222222-2222-2222-2222-222222222222";
const SUBMITTED = "44444444-4444-4444-4444-444444444444";
const VOIDED = "55555555-5555-5555-5555-555555555555";

const POSTED_ROW = {
  id: POSTED,
  po_id: "PO-20260901-4827",
  warehouse_id: WH,
  warehouse_name: "Carres Klang",
  supplier_name: "Hooka",
  do_number: "HK-5512",
  do_file_path: "PO-20260901-4827/a-do.jpg",
  do_file_url: null,
  note: null,
  status: "posted",
  submitted_from: "office",
  goods_received_at: "2026-09-03",
  submitted_by_name: "Shasha",
  submitted_at: "2026-09-03T02:00:00Z",
  posted_at: "2026-09-03T02:05:00Z",
  posted_by_name: "Shasha",
  reviewed_by_name: "Shasha",
  reviewed_at: "2026-09-03T02:05:00Z",
  return_reason: null,
  grn_no: "GRN-20260903-1184",
  actual_site_id: null,
  actual_site_name: null,
  posted_duty_holder_name: "Khor Yee",
  posted_duty_cover_name: null,
  posted_authority: "grn_duty",
  arrival_evidence: [
    { path: "PO-20260901-4827/a-arrival.jpg", kind: "photo" },
    { path: "PO-20260901-4827/a-arrival.mp4", kind: "video" },
  ],
  extra_lines: [],
  void_at: null,
  void_by_name: null,
  void_reason: null,
  lines: [
    {
      id: "l1",
      sku: "MS01-K King Mattress",
      received_now: 3,
      damaged_qty: 1,
      wrong_item_qty: 0,
      wrong_item_claim_type: null,
    },
  ],
  summary: "3 good · 1 damaged",
  opens_claims: true,
  categories: ["Mattress"],
  supplier_delivery_date: "2026-09-08",
  product_labels: ["Mattress Forte King"],
};

const SUBMITTED_ROW = {
  ...POSTED_ROW,
  id: SUBMITTED,
  po_id: "PO-20260902-0761",
  supplier_name: "Ohana",
  warehouse_id: WH2,
  warehouse_name: "AL Sungai Buloh",
  do_number: "OH-2210",
  status: "submitted",
  submitted_from: "warehouse",
  goods_received_at: "2026-09-04",
  posted_at: null,
  posted_by_name: null,
  grn_no: null,
  posted_duty_holder_name: null,
  posted_authority: null,
  arrival_evidence: [],
  lines: [
    {
      id: "l2",
      sku: "BF02-Q Queen Bedframe",
      received_now: 2,
      damaged_qty: 0,
      wrong_item_qty: 0,
      wrong_item_claim_type: null,
    },
  ],
  summary: "2 good",
  opens_claims: false,
  categories: ["Bedframe"],
  supplier_delivery_date: "2026-09-04",
  product_labels: ["Bedframe Quinn Queen"],
};

const VOIDED_ROW = {
  ...POSTED_ROW,
  id: VOIDED,
  po_id: "PO-20260828-3350",
  supplier_name: "Dorsettloft",
  do_number: "DL-118",
  status: "voided",
  goods_received_at: "2026-08-30",
  grn_no: "GRN-20260830-4102",
  void_at: "2026-09-01T03:00:00Z",
  void_by_name: "Khor Yee",
  void_reason: "Counted against the wrong purchase order",
  lines: [
    {
      id: "l3",
      sku: "SOFA-3 Jager Sofa",
      received_now: 1,
      damaged_qty: 0,
      wrong_item_qty: 0,
      wrong_item_claim_type: null,
    },
  ],
  summary: "1 good",
  opens_claims: false,
  categories: ["Sofa"],
  supplier_delivery_date: null,
  product_labels: ["Jager Sofa 3-seater"],
};

/** An EVIDENCED supplier reply — what the rail Calendar's markers read. */
const reply = (date: string) => ({
  kind: "tomorrow_delivery",
  answer: "confirmed",
  about_date: null,
  new_date: date,
  po_version: 1,
  channel: "whatsapp",
  recipient: "Supplier group",
  evidence: "evidence/reply.jpg",
  reported_by: "Factory PIC",
  reported_at: "2026-09-01T02:00:00Z",
  recorded_by: "u-ky",
  recorded_at: "2026-09-01T03:00:00Z",
  reason: null,
  remarks: null,
});

const PO_OPEN = {
  id: "PO-20260902-0761",
  supplier_id: "sup-ohana",
  warehouse_id: WH2,
  status: "open",
  version: 1,
  promises: [reply("2026-09-08")],
  placed_at: "2026-09-02T03:00:00Z",
  eta_date: "2026-09-04",
  purchase_order_lines: [
    {
      id: "l2",
      sku: "BF02-Q Queen Bedframe",
      qty: 4,
      received_qty: 0,
      damaged_qty: 0,
      wrong_item_qty: 0,
    },
  ],
};
const PO_OPEN_2 = {
  id: "PO-20260904-2210",
  supplier_id: "sup-hooka",
  warehouse_id: WH,
  status: "open",
  version: 1,
  promises: [reply("2026-09-08")],
  placed_at: "2026-09-04T01:00:00Z",
  eta_date: "2026-09-06",
  purchase_order_lines: [
    {
      id: "l4",
      sku: "MS01-K King Mattress",
      qty: 2,
      received_qty: 0,
      damaged_qty: 0,
      wrong_item_qty: 0,
    },
  ],
};

const DETAIL = {
  receipt: {
    ...POSTED_ROW,
    unit_results: [
      {
        stock_item_id: "u1",
        unit_code: "U1-000-101",
        outcome: "received",
        issue_kind: null,
        note: null,
      },
      {
        stock_item_id: "u2",
        unit_code: "U1-000-102",
        outcome: "received",
        issue_kind: null,
        note: null,
      },
      {
        stock_item_id: "u3",
        unit_code: "U1-000-103",
        outcome: "received_with_issue",
        issue_kind: "damaged",
        note: null,
      },
      {
        stock_item_id: "u4",
        unit_code: "U1-000-104",
        outcome: "not_received",
        issue_kind: null,
        note: null,
      },
    ],
  },
  po: {
    id: "PO-20260901-4827",
    supplier_id: "sup-hooka",
    warehouse_id: WH,
    purchase_order_lines: [
      {
        id: "l1",
        sku: "MS01-K King Mattress",
        qty: 5,
        received_qty: 4,
        damaged_qty: 1,
        wrong_item_qty: 0,
      },
    ],
  },
  line_info: {
    "MS01-K King Mattress": {
      description: "Mattress Forte King",
      category: "Mattress",
    },
  },
  events: [
    {
      id: "e2",
      receipt_id: POSTED,
      event: "amended",
      actor_id: "u-ky",
      actor_name: "Khor Yee",
      event_at: "2026-09-04T01:30:00Z",
      payload: {
        reason: "Driver recount found one more mattress",
        before: { goods_received_at: "2026-09-02" },
        after: { goods_received_at: "2026-09-03" },
      },
    },
    {
      id: "e1",
      receipt_id: POSTED,
      event: "posted",
      actor_id: "u-sha",
      actor_name: "Shasha",
      event_at: "2026-09-03T02:05:00Z",
      payload: {
        do_number: "HK-5512",
        goods_received_at: "2026-09-03",
        units_counted: 4,
        entry_source: "office",
        grn_no: "GRN-20260903-1184",
        claims_linked: 1,
      },
    },
  ],
};

const DUTY = {
  duty_key: "grn_duty",
  normal_user_id: "u-ky",
  normal_user_name: "Khor Yee",
  acting_user_id: null,
  acting_user_name: null,
  actor_user_id: "u-ky",
  is_cover: false,
  is_superuser: true,
  allowed: true,
  source: "assignment",
};

const WORKSPACE_DUTIES = {
  can_assign: true,
  duties: [
    {
      key: "grn_duty",
      label: "GRN Duty",
      resolution: {
        duty_key: "grn_duty",
        on_date: "2026-09-04",
        normal_user_id: "u-ky",
        normal_user_name: "Khor Yee",
        acting_user_id: "u-sha",
        acting_user_name: "Shasha",
        actor_user_id: "u-sha",
        is_cover: true,
        cover_id: "c1",
        source: "assignment",
      },
      assignments: [
        {
          id: "a1",
          duty_key: "grn_duty",
          holder_id: "u-ky",
          holder_name: "Khor Yee",
          effective_from: "2026-09-01",
          effective_until: null,
          assigned_by: "u-jess",
          assigned_by_name: "Jess",
          note: null,
          created_at: "2026-09-01T01:00:00Z",
        },
      ],
      covers: [
        {
          id: "c1",
          duty_key: "grn_duty",
          normal_user_id: "u-ky",
          normal_user_name: "Khor Yee",
          acting_user_id: "u-sha",
          acting_user_name: "Shasha",
          starts_on: "2026-09-04",
          ends_on: "2026-09-05",
          reason: "Annual leave",
          assigned_by: "u-jess",
          assigned_by_name: "Jess",
          created_at: "2026-09-03T08:00:00Z",
        },
      ],
    },
  ],
};

const WAREHOUSE_INCOMING = {
  warehouse: { id: WH2, name: "NETS Warehouse" },
  pos: [
    {
      po_id: "PO-20260902-0761",
      supplier_name: "Ohana",
      eta_date: "2026-09-04",
      sup_status: "otw_customer",
      open_receipt_id: null,
      lines: [
        {
          id: "l2",
          sku: "BF02-Q Queen Bedframe",
          qty: 4,
          received_qty: 0,
          damaged_qty: 0,
          wrong_item_qty: 0,
          category: "bedframe",
        },
      ],
      expected_units: [
        { id: "eu1", unit_code: "U1-000-201", sku: "BF02-Q Queen Bedframe", status: "incoming" },
        { id: "eu2", unit_code: "U1-000-202", sku: "BF02-Q Queen Bedframe", status: "incoming" },
        { id: "eu3", unit_code: "U1-000-203", sku: "BF02-Q Queen Bedframe", status: "incoming" },
        { id: "eu4", unit_code: "U1-000-204", sku: "BF02-Q Queen Bedframe", status: "incoming" },
      ],
    },
  ],
};

const PO_RECEIVING = {
  sessions: [],
  events: [],
  expected_units: [
    { id: "eu1", unit_code: "U1-000-201", sku: "BF02-Q Queen Bedframe", status: "incoming" },
    { id: "eu2", unit_code: "U1-000-202", sku: "BF02-Q Queen Bedframe", status: "incoming" },
    { id: "eu3", unit_code: "U1-000-203", sku: "BF02-Q Queen Bedframe", status: "incoming" },
    { id: "eu4", unit_code: "U1-000-204", sku: "BF02-Q Queen Bedframe", status: "incoming" },
  ],
};

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  if (url.includes("/api/operation/workspace-duties")) return json(WORKSPACE_DUTIES);
  if (url.includes("/api/warehouse/incoming")) return json(WAREHOUSE_INCOMING);
  if (url.includes("/api/operation/warehouse-receipts/duty")) return json(DUTY);
  if (url.includes(`/api/operation/warehouse-receipts/${POSTED}`)) return json(DETAIL);
  if (url.includes(`/api/operation/warehouse-receipts/${SUBMITTED}`))
    return json({
      receipt: { ...SUBMITTED_ROW, unit_results: [] },
      po: PO_OPEN,
      events: [
        {
          id: "e3",
          receipt_id: SUBMITTED,
          event: "submitted",
          actor_id: "u-nw",
          actor_name: "Aina (AL)",
          event_at: "2026-09-04T02:00:00Z",
          payload: { do_number: "OH-2210", units_counted: 2 },
        },
      ],
    });
  if (url.includes("/api/operation/warehouse-receipts") && url.includes("scope=grn")) {
    // The paged GRN Register — the SAME shared arithmetic the Worker runs.
    const params = new URLSearchParams(url.split("?")[1] ?? "");
    const grn = [POSTED_ROW, VOIDED_ROW];
    const view = buildGrnRegisterView(
      grn.map((r) => ({
        id: r.id,
        categories: r.categories,
        supplierName: r.supplier_name,
        siteName: r.actual_site_name ?? r.warehouse_name,
        supplierDeliveryDateIso: r.supplier_delivery_date,
        searchText: [r.grn_no, r.po_id, r.do_number, r.supplier_name]
          .filter(Boolean)
          .join(" "),
      })),
      {
        category: params.get("category"),
        supplier: params.get("supplier"),
        site: params.get("site"),
        expected: params.get("expected"),
        q: params.get("q"),
      },
      Number(params.get("offset") ?? 0),
      50,
    );
    const byId = new Map(grn.map((r) => [r.id, r]));
    return json({
      receipts: view.pageIds.map((id) => byId.get(id)),
      page: { offset: Number(params.get("offset") ?? 0), limit: 50, total: view.total },
      facets: view.facets,
      counts: { waiting: 1 },
    });
  }
  if (url.includes("/api/operation/warehouse-receipts"))
    return json({
      receipts: [SUBMITTED_ROW, POSTED_ROW, VOIDED_ROW],
      counts: { waiting: 1 },
    });
  if (url.includes("/receiving") && url.includes("/api/operation/pos/"))
    return json(PO_RECEIVING);
  if (url.includes("/api/operation/pos")) return json({ pos: [PO_OPEN, PO_OPEN_2] });
  if (url.includes("/api/operation/suppliers"))
    return json({
      suppliers: [
        { id: "sup-hooka", name: "Hooka" },
        { id: "sup-ohana", name: "Ohana" },
        { id: "sup-dorsett", name: "Dorsettloft" },
      ],
    });
  if (url.includes("/api/operation/warehouse"))
    return json({
      warehouses: [
        { id: WH, name: "Carres Klang", address: null },
        { id: WH2, name: "AL Sungai Buloh", address: null },
      ],
    });
  if (url.startsWith("/api/")) {
    return new Response(JSON.stringify({}), { status: 404 });
  }
  return realFetch(input, init);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route
            path="*"
            element={
              PAGE === "duties" ? (
                <StaffDuties />
              ) : PAGE === "report" ? (
                <OperationReceivingReport />
              ) : PAGE === "warehouse" ? (
                <WarehouseIncoming />
              ) : (
                <OperationReceiving />
              )
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
