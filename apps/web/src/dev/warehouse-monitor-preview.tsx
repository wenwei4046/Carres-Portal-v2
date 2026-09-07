/**
 * WAREHOUSE MONITOR / INBOUND / OUTBOUND PREVIEW — DEV ONLY (walk aid for
 * the 2026-09-06 replacement Card).
 *
 * Same contract as `warehouse-rail-preview.tsx`: the REAL pages, the REAL
 * stylesheet, only the session seeded and the feeds stubbed with fixtures.
 * A separate vite entry — cannot reach production. `?tab=` switches pages
 * exactly as OperationApp does, so Monitor card clicks land on the real
 * filtered Inbound/Outbound.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  buildInboundRegisterView,
  deliveryWarehouseScheduleEvents,
  inboundArrivals,
  inboundUnresolvedSources,
  type DeliveryWarehouseScheduleInput,
  type InboundInput,
} from "@carres/shared";
import { useAuth } from "@/lib/auth";
import WarehouseWorkspace from "@/pages/operation/WarehouseWorkspace";
import WarehouseInbound from "@/pages/operation/WarehouseInbound";
import WarehouseOutboundWork from "@/pages/operation/WarehouseOutboundWork";
import "@/index.css";

useAuth.setState({
  role: "operation",
  user: { email: "sha@carres.co" } as never,
});

function unitInput(
  overrides: Partial<DeliveryWarehouseScheduleInput> & { unitId: string },
): DeliveryWarehouseScheduleInput {
  return {
    orderId: "order-19",
    deliveryOrderId: "do-19",
    leg: 0,
    so: 260919,
    fromLocation: "Carres Klang Warehouse",
    toCustomer: "Petaling Jaya",
    logisticsPartner: "NETS Delivery",
    driverName: null,
    vehicle: null,
    doNumber: "DO-2609-019",
    collectionDate: "2026-09-08",
    collectionWindow: null,
    customerHandoverDate: null,
    actualCollectionAt: null,
    actualArrivalAt: null,
    hasCollectionEvidence: false,
    hasDeliveryEvidence: false,
    soDate: "2026-09-01",
    sku: "SOFA-1",
    productName: "Jager Sofa (Grey)",
    ...overrides,
  };
}

const TODAY = "2026-09-08"; // Tue — inside the walk week, never a Sunday

const EVENTS = [
  // A driver-assigned pickup with a window, partly loaded.
  ...deliveryWarehouseScheduleEvents(
    unitInput({
      unitId: "U1-260-019",
      driverName: "Ahmad Rahman",
      vehicle: "VBM 1234",
      collectionWindow: "14:30",
      unitScannedAt: `${TODAY}T10:00:00+08:00`,
      unitCheckedAt: `${TODAY}T10:05:00+08:00`,
      unitPackedAt: `${TODAY}T10:10:00+08:00`,
      unitHandedOverAt: `${TODAY}T11:18:00+08:00`,
      unitHasEvidence: true,
      unitDeliveryPerson: "Ahmad Rahman",
      unitWarehouseOperator: "Shasha",
    }),
  ),
  ...deliveryWarehouseScheduleEvents(
    unitInput({
      unitId: "U1-260-020",
      driverName: "Ahmad Rahman",
      vehicle: "VBM 1234",
      collectionWindow: "14:30",
    }),
  ),
  // A loaded-and-driver-confirmed Unit — the third count is its own fact.
  ...deliveryWarehouseScheduleEvents(
    unitInput({
      unitId: "U1-260-022",
      driverName: "Ahmad Rahman",
      vehicle: "VBM 1234",
      collectionWindow: "14:30",
      sku: "MAT-KING-1",
      productName: "Cloud Mattress (King)",
      unitScannedAt: `${TODAY}T10:00:00+08:00`,
      unitCheckedAt: `${TODAY}T10:05:00+08:00`,
      unitPackedAt: `${TODAY}T10:10:00+08:00`,
      unitHandedOverAt: `${TODAY}T11:18:00+08:00`,
      unitHasEvidence: true,
      unitDriverConfirmedAt: `${TODAY}T11:30:00+08:00`,
      unitDeliveryPerson: "Ahmad Rahman",
      unitWarehouseOperator: "Shasha",
    }),
  ),
  // A second DO with no driver assigned and no window.
  ...deliveryWarehouseScheduleEvents(
    unitInput({
      unitId: "U1-260-031",
      orderId: "order-21",
      deliveryOrderId: "do-21",
      so: 260921,
      doNumber: "DO-2609-021",
      toCustomer: "Shah Alam",
      productName: "Nordic Bedframe (Oak)",
      sku: "BED-2",
    }),
  ),
];

const POS = [
  {
    id: "PO-2646-0107",
    supplier_id: "sup-1",
    warehouse_id: "wh-1",
    status: "open",
    sup_status: "confirmed",
    so: null,
    so_refs: null,
    eta_date: TODAY,
    placed_at: "2026-08-20",
    purchase_order_lines: [
      { id: "l1", sku: "MAT-KING-1", qty: 3, received_qty: 0 },
      { id: "l2", sku: "BED-2", qty: 2, received_qty: 1 },
    ],
  },
  {
    id: "PO-2646-0110",
    supplier_id: "sup-2",
    warehouse_id: "wh-1",
    status: "open",
    sup_status: "confirmed",
    so: null,
    so_refs: null,
    eta_date: "2026-09-01",
    placed_at: "2026-08-18",
    purchase_order_lines: [{ id: "l3", sku: "SOFA-1", qty: 1, received_qty: 0 }],
  },
];


/** The Inbound register's own server view, built from the same projection
 *  the Worker uses — the preview answers the real query contract. */
const INBOUND_INPUT = {
  pos: [
    {
      id: "PO-2646-0107",
      supplier_id: "sup-1",
      warehouse_id: "wh-1",
      destination_id: null,
      status: "open",
      official_delivery_date: TODAY,
      eta_date: TODAY,
      placed_at: "2026-08-20",
      so: 260901,
    },
    {
      id: "PO-2646-0110",
      supplier_id: "sup-2",
      warehouse_id: "wh-1",
      destination_id: null,
      status: "open",
      official_delivery_date: "2026-09-01",
      eta_date: "2026-09-01",
      placed_at: "2026-08-18",
      so: null,
    },
  ],
  sites: [
    { id: "wh-1", name: "Carres Klang Warehouse" },
    { id: "wh-2", name: "HOUZS Balakong" },
  ],
  suppliers: [
    { id: "sup-1", name: "Nice Future" },
    { id: "sup-2", name: "TCF Furniture" },
  ],
  destinations: [],
  units: [
    { id: "u1", unit_code: "U1-260-101", po_no: "PO-2646-0107", qty: 1, sku: "MAT-KING-1" },
    { id: "u2", unit_code: "U1-260-102", po_no: "PO-2646-0107", qty: 1, sku: "MAT-KING-1" },
    { id: "u3", unit_code: "U1-260-103", po_no: "PO-2646-0107", qty: 1, sku: "MAT-KING-1" },
    { id: "u4", unit_code: "U1-260-104", po_no: "PO-2646-0107", qty: 1, sku: "BED-2" },
    { id: "u5", unit_code: "U1-260-105", po_no: "PO-2646-0107", qty: 1, sku: "BED-2" },
    { id: "u6", unit_code: "U1-260-110", po_no: "PO-2646-0110", qty: 1, sku: "SOFA-1" },
    { id: "u7", unit_code: "U1-260-201", po_no: null, qty: 1, sku: "BED-2" },
  ],
  skuNames: [
    { sku: "MAT-KING-1", name: "Cloud Mattress (King)" },
    { sku: "BED-2", name: "Nordic Bedframe (Oak)" },
    { sku: "SOFA-1", name: "Jager Sofa (Grey)" },
  ],
  lines: [
    { po_id: "PO-2646-0107", qty: 3, destination_id: null, sku: "MAT-KING-1" },
    { po_id: "PO-2646-0107", qty: 2, destination_id: null, sku: "BED-2" },
    { po_id: "PO-2646-0110", qty: 1, destination_id: null, sku: "SOFA-1" },
  ],
  receipts: [
    {
      id: "sess-1",
      po_id: "PO-2646-0107",
      arrival_source_id: null,
      actual_site_id: "wh-1",
      status: "posted",
      posted_at: `${TODAY}T09:30:00+08:00`,
      grn_no: "GRN-080926-1201",
      goods_received_at: TODAY,
    },
  ],
  results: [
    { receipt_id: "sess-1", stock_item_id: "u1", outcome: "received", issue_kind: null },
    { receipt_id: "sess-1", stock_item_id: "u2", outcome: "received", issue_kind: null },
    { receipt_id: "sess-1", stock_item_id: "u4", outcome: "received_with_issue", issue_kind: "damaged" },
  ],
  arrivalSources: [
    {
      id: "as-1",
      source_no: "TR-080926-3001",
      kind: "transfer" as const,
      claim_id: null,
      case_id: null,
      from_site_id: "wh-2",
      to_site_id: "wh-1",
      party_id: "party-1",
      expected_date: TODAY,
      collection_date: null,
      reason: "Rebalance Klang stock",
      cancelled_at: null,
      created_at: "2026-09-05",
      sales_order_ref: null,
    },
  ],
  sourceUnits: [
    { source_id: "as-1", stock_item_id: "u7", replaces_item_id: null },
  ],
  parties: [{ id: "party-1", name: "NETS Logistics" }],
  sourceEvents: [],
} as unknown as InboundInput;

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  if (url.includes("/warehouse-schedule")) return json({ events: EVENTS });
  if (url.includes("/api/operation/warehouse/inbound")) {
    const qs = new URLSearchParams(url.split("?")[1] ?? "");
    const rows = inboundArrivals(INBOUND_INPUT);
    const offset = Number(qs.get("offset")) || 0;
    const limit = Number(qs.get("limit")) || 50;
    const view = buildInboundRegisterView(rows, qs, offset, limit);
    return json({
      arrivals: view.rows,
      sites: [
        { id: "wh-1", name: "Carres Klang Warehouse" },
        { id: "wh-2", name: "HOUZS Balakong" },
      ],
      unresolvedSources: inboundUnresolvedSources(INBOUND_INPUT),
      page: { offset, limit, total: view.total },
      facets: view.facets,
    });
  }
  if (url.includes("/api/operation/pos")) return json({ pos: POS });
  if (url.includes("/api/operation/suppliers"))
    return json({
      suppliers: [
        { id: "sup-1", name: "Nice Future" },
        { id: "sup-2", name: "TCF Furniture" },
      ],
    });
  if (url.includes("/api/operation/warehouse-receipts"))
    return json({
      receipts: [
        { id: "sess-1", po_id: "PO-2646-0110", status: "submitted", lines: [], do_number: "DO-S1", submitted_at: `${TODAY}T09:00:00+08:00` },
      ],
    });
  if (url.includes("/api/operation/warehouse"))
    return json({ warehouses: [{ id: "wh-1", name: "Carres Klang Warehouse" }] });
  if (url.includes("/api/")) {
    return new Response(JSON.stringify({}), { status: 404 });
  }
  return realFetch(input, init);
};

function TabSwitch() {
  const [params] = useSearchParams();
  const tab = params.get("tab") ?? "warehouse-monitor";
  if (tab === "warehouse-inbound") return <WarehouseInbound />;
  if (tab === "warehouse-outbound") return <WarehouseOutboundWork />;
  if (tab === "receiving")
    return (
      <div className="p-6 text-[13px]">
        Receiving Session opens here in the real portal (governed door) — params:{" "}
        <code>{params.toString()}</code>
      </div>
    );
  return <WarehouseWorkspace />;
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<TabSwitch />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
