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
  deliveryWarehouseScheduleEvents,
  type DeliveryWarehouseScheduleInput,
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
