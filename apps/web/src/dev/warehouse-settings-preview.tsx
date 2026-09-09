/**
 * WAREHOUSE SETTINGS PREVIEW — DEV ONLY (walk aid for the 2026-09-09 card).
 *
 * Same contract as `warehouse-monitor-preview.tsx`: the REAL Settings
 * Workspace, the REAL page, the REAL stylesheet — only the session is seeded
 * and `/api/operation/warehouse-settings` is answered from a fixture. A
 * separate vite entry, so it cannot reach production.
 *
 * ⭐ THE FIXTURE IS THE MEASURED PRODUCTION STATE after 0456 · 0457 applied on
 * 2026-09-09: one Site named `Carres Klang Warehouse`, operated by
 * `NETS Warehouse`, `active`, `Asia/Kuala_Lumpur`, and NOTHING else recorded —
 * no address, no contact, not one working hour, no policy, no calendar, no
 * grant. It invents no person, no phone number and no holiday date.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WarehouseSettingsResponse } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import SettingsWorkspace from "@/pages/operation/SettingsWorkspace";
import "@/index.css";

useAuth.setState({
  role: "operation",
  user: { email: "jess@carres.com" } as never,
});

const SITE = "00000000-0000-0000-0000-000000000c03";
const NETS = "47cda689-c5b2-4999-af47-e40daa901ec3";
const CARRES_WH = "64fcc437-91c8-4658-ab16-e7b338c31248";
const YU_JUN = "aac9edf9-63ad-4d0a-ba91-e495a25f9896";
const SHASHA = "0cab8bcf-6ebb-454e-ba21-b916e18cc419";

const SETTINGS: WarehouseSettingsResponse = {
  canEdit: true,
  details: {
    siteId: SITE,
    name: "Carres Klang Warehouse",
    address: null,
    status: "active",
    operatingPartyId: NETS,
    operatingPartyName: "NETS Warehouse",
    timeZone: "Asia/Kuala_Lumpur",
    keyContactId: null,
    keyContactName: null,
    keyContactOrganisation: null,
    keyContactActive: false,
    contactNumber: null,
  },
  operatingParties: [
    { id: NETS, name: "NETS Warehouse" },
    { id: CARRES_WH, name: "Carres Warehouse" },
  ],
  people: [
    { id: SHASHA, name: "Shasha", organisation: "Carres" },
    { id: YU_JUN, name: "Yu Jun", organisation: "Carres" },
  ],
  workingHours: [],
  specialDates: [],
  holidayPolicy: null,
  holidayCalendars: [],
  holidayDates: [],
  capabilities: [
    {
      key: "manage_warehouse_settings",
      label: "Manage Warehouse Settings",
      helper: "Change Warehouse configuration.",
      appliesTo: "Saving anything on this page.",
      holders: [],
    },
    {
      key: "confirm_inbound_receipt",
      label: "Confirm inbound receipt",
      helper: "Confirm that the Warehouse physically received the listed goods.",
      appliesTo:
        "Recorded here. The receiving door still asks for GRN Duty, which Workspace → Staff & Duties assigns.",
      holders: [],
    },
    {
      key: "confirm_collection_from_warehouse",
      label: "Confirm collection from Warehouse",
      helper: "Confirm that the listed goods physically left the Warehouse with the collector.",
      appliesTo:
        "Recorded here. The handover door still asks for the Warehouse operator signed in at the Site.",
      holders: [],
    },
    {
      key: "perform_stock_count",
      label: "Perform stock count",
      helper: "Enter and submit a physical stock-count result.",
      appliesTo: "Recorded here. Stock Counts are not built yet, so no door reads it.",
      holders: [],
    },
  ],
  changes: [],
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
  if (url.includes("/api/operation/warehouse-settings")) return json(SETTINGS);
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
          {/* The vite entry is served at `/warehouse-settings-preview.html`, so
              BOTH that address and `/` land on the real Settings route. */}
          <Route
            path="*"
            element={<Navigate to="/operation/settings/warehouse/details" replace />}
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
