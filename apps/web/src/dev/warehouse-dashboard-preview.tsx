/**
 * WAREHOUSE DASHBOARD PREVIEW — DEV ONLY (walk aid for CARD 03).
 *
 * Same contract as `warehouse-rail-preview.tsx`: the REAL WarehouseWorkspace,
 * the REAL stylesheet, only the session seeded and the schedule feed stubbed
 * with the card §10 fixture. A separate vite entry — cannot reach production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  deliveryWarehouseScheduleEvents,
  type DeliveryWarehouseScheduleInput,
} from "@carres/shared";
import { useAuth } from "@/lib/auth";
import WarehouseWorkspace from "@/pages/operation/WarehouseWorkspace";
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
    logisticsPartner: "NETS",
    driverName: null,
    vehicle: null,
    doNumber: "DO-2609-019",
    collectionDate: "2026-09-04",
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

const EVENTS = [
  ...deliveryWarehouseScheduleEvents(
    unitInput({
      unitId: "U1-260-019",
      unitScannedAt: "2026-09-04T10:00:00+08:00",
      unitCheckedAt: "2026-09-04T10:05:00+08:00",
      unitPackedAt: "2026-09-04T10:10:00+08:00",
      unitHandedOverAt: "2026-09-04T11:18:00+08:00",
      unitHasEvidence: true,
      unitDeliveryPerson: "Ahmad (NETS)",
      unitWarehouseOperator: "Shasha",
    }),
  ),
  ...deliveryWarehouseScheduleEvents(unitInput({ unitId: "U1-260-020" })),
];

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/warehouse-schedule")) {
    return new Response(JSON.stringify({ events: EVENTS }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
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
          <Route path="*" element={<WarehouseWorkspace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
