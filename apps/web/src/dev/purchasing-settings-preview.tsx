/**
 * PURCHASING SETTINGS PREVIEW — DEV ONLY (walk aid for the PO windows card,
 * 2026-09-28). The REAL Settings Workspace and the REAL page; only the session
 * is seeded and `/api/operation/purchasing/settings` is answered from a
 * fixture. A separate vite entry, so it cannot reach production.
 *
 * ⭐ THE FIXTURE IS THE MEASURED PRODUCTION ROW `purchasing_settings` id 1 on
 * 2026-09-28 (safety 14, earliest sell 30, confirm 3, PO Days Mon·Wed·Fri,
 * windows 11:30 and 16:00 on, Manual Purchase floor 0). It invents no
 * supplier, no destination and no history row.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PurchasingSettingsResponse } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import SettingsWorkspace from "@/pages/operation/SettingsWorkspace";
import "@/index.css";

useAuth.setState({
  role: "operation",
  user: { email: "jess@carres.com" } as never,
});

let SETTINGS: PurchasingSettingsResponse = {
  canEdit: true,
  orderByBufferDays: 14,
  earliestSellDays: 30,
  logisticsCallWorkingDays: 3,
  poDays: [1, 3, 5],
  poWindows: { first: "11:30", second: "16:00", secondEnabled: true },
  manualPurchaseMinDeliveryDays: 0,
  suppliers: [],
  productionDays: [],
  destinations: [],
  lastChanges: [],
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/purchasing/settings/po-windows") && init?.method === "PUT") {
    const body = JSON.parse(String(init.body)) as { first: string; second: string | null; secondEnabled: boolean };
    SETTINGS = { ...SETTINGS, poWindows: body };
    return json(SETTINGS);
  }
  if (url.includes("/purchasing/settings")) return json(SETTINGS);
  if (url.includes("/api/")) return new Response(JSON.stringify({}), { status: 404 });
  return realFetch(input, init);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/operation/settings/*" element={<SettingsWorkspace />} />
          <Route path="*" element={<Navigate to="/operation/settings/purchasing" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
