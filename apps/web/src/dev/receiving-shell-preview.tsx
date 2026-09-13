/**
 * RECEIVING · PORTAL-SHELL PREVIEW — DEV ONLY (walk aid for
 * CARD-2026-09-13-receiving-02).
 *
 * The REAL Portal shell — `OperationApp` with its `PortalSidebar`, route/tab
 * handling and the Receiving destination — mounted at `/operation?tab=receiving`
 * under a MemoryRouter, with the identity seeded and the API stubbed by
 * `receiving-fixture.ts`. The standalone `receiving-preview.tsx` proves the
 * page's own geometry; this entry proves it inside the shared navigation the
 * operator actually uses (240px rail beside the sidebar, the sheet's sideways
 * scroll under the shell's grid, the 32px footer at the frame's foot).
 * A separate vite entry — `vite build` only emits `index.html`'s graph, so
 * this cannot reach production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./receiving-fixture";
import OperationApp from "@/pages/operation/OperationApp";
import "@/index.css";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const START = new URLSearchParams(window.location.search).get("start") ?? "/operation?tab=receiving";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[START]}>
        <Routes>
          <Route path="/operation/*" element={<OperationApp />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
