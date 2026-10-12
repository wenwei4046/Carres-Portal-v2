/**
 * SETTINGS → OFFICE · COMPANY · SETTINGS EDITORS PREVIEW — DEV ONLY (walk aid, 12 Oct 2026).
 *
 * Same contract as `warehouse-settings-preview.tsx`: the REAL Settings
 * Workspace, the REAL pages, the REAL stylesheet. Only the session is seeded
 * and `/api/operation/settings/*` is answered from a fixture. A separate vite
 * entry, so it cannot reach production.
 *
 * The fixture is TEST data: the owner-confirmed Office defaults (Settings List
 * OFF-01..05), no recorded holiday year, and two TEST change records. Add
 * `?reader=1` to see the page as a person who may only read, and
 * `?holidays=1` for a recorded holiday year.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VERIFIED_COMPANY_PROFILE } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import SettingsWorkspace from "@/pages/operation/SettingsWorkspace";
import "@/index.css";

useAuth.setState({ role: "operation", user: { email: "test.staff.a@carres.test" } as never });

const params = new URLSearchParams(window.location.search);
const canEdit = params.get("reader") !== "1";
const year = new Date().getFullYear();

let office = {
  stored: true,
  canEdit,
  revision: 3,
  values: {
    work_days: [1, 2, 3, 4, 5], start_time: "09:00", end_time: "18:00", flexi_minutes: 60,
    lunch_start: "13:00", lunch_end: "14:00", lunch_shift_minutes: 60, holiday_region: "Kuala Lumpur",
  },
  holidays: params.get("holidays") === "1"
    ? [{ date: `${year}-01-01`, name: "TEST · New Year's Day" }, { date: `${year}-08-31`, name: "TEST · National Day" }]
    : [],
  changes: [
    {
      id: 2, what: "office_calendar", oldValue: { flexi_minutes: 30 }, newValue: { flexi_minutes: 60 },
      reason: "TEST · reason typed by the editor", actorName: "TEST · Staff A", changedAt: `${year}-10-09T03:10:00Z`,
    },
    {
      id: 1, what: "office_calendar", oldValue: { end_time: "17:30" }, newValue: { end_time: "18:00" },
      reason: null, actorName: null, changedAt: `${year}-10-09T02:40:00Z`,
    },
  ],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  if (url.includes("/api/operation/settings/office")) {
    if (method !== "GET" && init?.body) {
      const body = JSON.parse(String(init.body)) as { values?: typeof office.values; year?: number; holidays?: { date: string; name: string }[] };
      if (body.values) office = { ...office, values: body.values, revision: office.revision + 1 };
      if (body.holidays) office = { ...office, holidays: [...office.holidays.filter((h) => !h.date.startsWith(`${body.year}-`)), ...body.holidays] };
    }
    return json(office);
  }
  if (url.includes("/api/operation/settings/company")) {
    return json({ stored: true, values: VERIFIED_COMPANY_PROFILE, revision: 4, canEdit, changes: [] });
  }
  if (url.includes("/api/operation/settings/editors")) return json({ stored: true, canManage: canEdit, owners: ["TEST · Owner"], people: [{ id: "u-test-a", name: "TEST · Staff A" }], grants: [] });
  if (url.includes("/api/operation/settings/can-edit")) return json({ canEdit });
  if (url.includes("/api/")) return json({}, 404);
  return realFetch(input, init);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/operation/settings/*" element={<SettingsWorkspace />} />
          <Route path="*" element={<Navigate to={`/operation/settings/office${window.location.search}`} replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
