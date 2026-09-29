/**
 * REPAIR ORDER WORK PREVIEW — DEV ONLY (Purchasing §9.7 · §10, slice B).
 *
 * The REAL Work page over a feed whose items are produced by the REAL
 * projector (`projectRepairOrderWork`, the one the API feed runs) from three
 * fixture Repair Orders at three stops. Unit IDs and suppliers are test rows
 * read from the database on 2026-09-28; RO numbers are `{RO No}` placeholders
 * (no invented numbers). A separate vite entry: it cannot reach production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  addWorkingDays,
  myHolidaySet,
  projectRepairOrderWork,
  type OperationWorkResponse,
  type RepairOrderDetail,
  type RepairOrderUnitRow,
} from "@carres/shared";
import { useAuth } from "@/lib/auth";
import { appTodayIso } from "@/lib/fmt-date";
import OperationWork from "@/pages/operation/OperationWork";
import PreviewFrame from "./preview-frame";
import "@/index.css";

const ME = "00000000-0000-4000-8000-0000000000aa";
const TODAY = appTodayIso();
const HOLS = myHolidaySet();
function back(n: number): string {
  let cur = TODAY;
  let left = n;
  while (left > 0) {
    const d = new Date(`${cur}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    cur = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !HOLS.has(cur)) left--;
  }
  return cur;
}

const unit = (over: Partial<RepairOrderUnitRow>): RepairOrderUnitRow => ({
  stock_item_id: "si", unit_id: "", po_no: null, sku: null, category: null, item: null, item_spec: null,
  ownership: "carres_owned", display: false, problem: "damaged", problem_note: "{What happened}",
  repair_requirement: "{Repair Requirement}", evidence: [], collected_by: null, actual_pickup_date: null,
  goods_received_date: null, grn_no: null, pickup_proof: null, return_proof: null, inspected: false, ...over,
});
const ro = (over: Partial<RepairOrderDetail>): RepairOrderDetail => ({
  id: "ro", ro_no: "{RO No}", ro_doc_date: TODAY, version: 1, supplier_id: "s1", supplier_name: "Hookka Industries",
  claim_id: null, claim_no: null, cost_responsibility: "not_decided", price: null, pickup_site_id: "w1",
  pickup_site_name: "Carres Klang", return_site_id: "w1", return_site_name: "Carres Klang", issued: false,
  supplier_received_at: null, return_target_date: null, cancelled_at: null, latest_reply: null, units: [],
  quotation_path: null, supplier_received_source: null, supplier_received_evidence: null, return_target_working_days: null,
  return_target_calendar: null, cancel_reason: null, created_by: null, created_at: `${TODAY}T01:00:00Z`,
  sends: [], replies: [], consents: [], pickup_source_id: null, ...over,
});

const ROS: RepairOrderDetail[] = [
  // Not issued, created today, a consignment Unit without consent.
  ro({ id: "ro-a", ro_no: "{RO No A}", units: [unit({ stock_item_id: "a", unit_id: "U1-000-090", ownership: "supplier_consignment", owner_name: "Laveo" })] }),
  // Sent three working days ago, receipt not recorded.
  ro({
    id: "ro-b", ro_no: "{RO No B}", supplier_name: "Laveo", ro_doc_date: back(3), issued: true,
    sends: [{ version: 1, recipient: "{Supplier WhatsApp group}", channel: "whatsapp", sent_by: null, sent_at: `${back(3)}T02:00:00Z` }],
    units: [unit({ stock_item_id: "b", unit_id: "U1-000-087" })],
  }),
  // Target passed two working days ago; one of two Units still out.
  ro({
    id: "ro-c", ro_no: "{RO No C}", ro_doc_date: back(20), issued: true, supplier_received_at: `${back(16)}T02:00:00Z`,
    return_target_date: back(2),
    latest_reply: { id: "r", expected_return_date: addWorkingDays(TODAY, 10, { holidays: HOLS }), reason: "Material unavailable", note: null, reference: "{Reply reference}", recorded_by: null, recorded_at: `${back(1)}T02:00:00Z` },
    units: [unit({ stock_item_id: "c1", unit_id: "U1-000-085", goods_received_date: `${back(1)}T03:00:00Z`, grn_no: "{GRN No}" }), unit({ stock_item_id: "c2", unit_id: "U1-000-086" })],
  }),
];

const PO_DUTY = { dutyKey: "po_duty", onDate: TODAY, normalOwner: { userId: ME, name: "Shasha" }, buddy: null, activeCover: null, actingPerson: { userId: ME, name: "Shasha" }, state: "primary" as const, assignmentId: null };
const items = projectRepairOrderWork({ repairOrders: ROS, poDuty: PO_DUTY, today: TODAY, observedAt: `${TODAY}T01:00:00.000Z` });
const FEED: OperationWorkResponse = {
  contractVersion: 2,
  complete: true,
  generatedOn: TODAY,
  closureReceipt: null,
  staff: [{ userId: ME, name: "Shasha", email: "sha@carres.co" }],
  sources: (["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((key) => ({
    key, state: "healthy" as const, observedAt: `${TODAY}T01:00:00.000Z`, lastSuccessfulAt: `${TODAY}T01:00:00.000Z`, errorLabel: null,
  })),
  items,
};

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/\/api\/operation\/work(\?|$)/.test(url)) return json(FEED);
  if (/\/api\/operation\/staff(\?|$)/.test(url)) return json({ staff: [{ user_id: ME, email: "sha@carres.co", name: "Shasha", pooled: true, available: true, note: null, last_seen_at: null, duties: [] }], myDuties: [] });
  if (url.includes("/api/")) return new Response(JSON.stringify({ message: "not seeded" }), { status: 404 });
  return realFetch(input, init);
};

useAuth.setState({ role: "operation", user: { id: ME, email: "sha@carres.co" } as never });
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const start = new URLSearchParams(window.location.search).get("at") ?? "/operation?tab=work&day=missed";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[start]}>
        <PreviewFrame label="Work · Repair Order items (fixture Repair Orders, real projector)">
          <div className="flex h-full flex-col">
            <OperationWork />
          </div>
        </PreviewFrame>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
