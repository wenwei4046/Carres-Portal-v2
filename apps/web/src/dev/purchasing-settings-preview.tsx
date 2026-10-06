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
  /* Five production suppliers by their real ids; none has a Last PO time
     today (measured 2026-09-29). Categories and work weeks are left out:
     this preview is for the PO windows card. */
  suppliers: [
    { id: "838f325a-92e2-4db4-a11a-699c207b6742", name: "Armani", categories: [], offDays: null, poCutoff: null },
    { id: "fc99b9a9-b1b3-4455-882f-ffb6f9a91efa", name: "Dorsettloft", categories: [], offDays: null, poCutoff: null },
    { id: "ccdd06e4-700b-4476-87ff-1810bd41cae0", name: "Hookka Industries", categories: [], offDays: null, poCutoff: null },
    { id: "00000000-0000-0000-0000-0000000000e2", name: "Nice Future", categories: [], offDays: null, poCutoff: null },
    { id: "00000000-0000-0000-0000-0000000000e1", name: "Ohana", categories: [], offDays: null, poCutoff: null },
  ],
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
  if (url.includes("/purchasing/settings/po-cutoff") && init?.method === "PUT") {
    const body = JSON.parse(String(init.body)) as { supplierId: string; cutoff: string | null };
    SETTINGS = { ...SETTINGS, suppliers: SETTINGS.suppliers.map((s) => (s.id === body.supplierId ? { ...s, poCutoff: body.cutoff } : s)) };
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
