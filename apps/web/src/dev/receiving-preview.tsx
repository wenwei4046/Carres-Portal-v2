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
import OperationReceiving from "@/pages/operation/OperationReceiving";
import OperationReceivingReport from "@/pages/operation/OperationReceivingReport";
import StaffDuties from "@/pages/operation/StaffDuties";
import WarehouseIncoming from "@/pages/warehouse/WarehouseIncoming";
import "@/index.css";

import { PAGE } from "./receiving-fixture";


const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        {/* The shell's own bounded frame: the portal main area is a fixed
            viewport-height flex column, which is what lets the Register's
            32px footer sit at the bottom of the frame instead of below the
            fold. The preview reproduces that frame so geometry can be read. */}
        <div className="flex h-screen min-h-0 flex-col">
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
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
