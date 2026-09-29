/** Local fixture preview only. No production session, writes or external requests.
 *
 * Repair Orders slice A (`docs/purchasing/MASTER.md` §9.7) on the REAL
 * components. `?view=register` · `?view=create` · `?view=object`.
 *
 * Unit IDs, PO numbers, items, Sites and Suppliers are real (test) rows read
 * from the database on 2026-09-28; no Repair Order exists there yet, so the
 * RO numbers print as `{RO No}` placeholders rather than invented numbers.
 */
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RepairOrderDetail, RepairOrderEligibleUnit, RepairOrderUnitRow } from "@carres/shared";
import OperationRepairOrders from "@/pages/operation/OperationRepairOrders";
import PreviewFrame from "./preview-frame";
import "@/index.css";

const unit = (over: Partial<RepairOrderUnitRow>): RepairOrderUnitRow => ({
  stock_item_id: "si", unit_id: "", po_no: null, sku: null, category: null, item: null, item_spec: null,
  ownership: "carres_owned", display: false, problem: "damaged", problem_note: "{What happened}",
  repair_requirement: "{Repair Requirement}", evidence: [], collected_by: null, actual_pickup_date: null,
  goods_received_date: null, grn_no: null, pickup_proof: null, return_proof: null, inspected: false, ...over,
});

const base: RepairOrderDetail = {
  id: "ro-1", ro_no: "{RO No}", ro_doc_date: "2026-09-28", version: 1, supplier_id: "s1", supplier_name: "Hookka Industries",
  claim_id: null, claim_no: null, cost_responsibility: "not_decided", price: null, pickup_site_id: "w1",
  pickup_site_name: "Carres Klang", return_site_id: "w1", return_site_name: "Carres Klang", issued: false,
  supplier_received_at: null, return_target_date: null, cancelled_at: null, latest_reply: null,
  units: [
    unit({ stock_item_id: "a", unit_id: "U1-000-090", po_no: "PO/2604-087", sku: "DSL9038-SET-2S+L", category: "Sofa", item: "DSL9038", item_spec: "SET-2S+L", evidence: [{ path: "x.jpg", kind: "photo", source: "unit" }] }),
    unit({ stock_item_id: "b", unit_id: "U1-000-087", po_no: "PO2603-110", sku: "SONIC-Q", category: "Mattress", item: "Sonic", item_spec: "Queen", problem: "missing_component" }),
  ],
  quotation_path: null, supplier_received_source: null, supplier_received_evidence: null, return_target_working_days: null,
  return_target_calendar: null, cancel_reason: null, created_by: "{Operation staff}", created_at: "2026-09-28T02:00:00Z",
  sends: [], replies: [], consents: [], pickup_source_id: null,
};
const second: RepairOrderDetail = {
  ...base, id: "ro-2", ro_no: "{RO No 2}", supplier_name: "Laveo", issued: true, supplier_received_at: "2026-09-28T03:00:00Z",
  return_target_date: "2026-10-16", cost_responsibility: "supplier_pays",
  sends: [{ version: 1, recipient: "{Supplier WhatsApp group}", channel: "whatsapp", sent_by: "{Operation staff}", sent_at: "2026-09-28T02:30:00Z" }],
  units: [unit({ stock_item_id: "c", unit_id: "U1-000-085", po_no: "PO2601-121", sku: "B1201S-Q", category: "Mattress", item: "B1201S", item_spec: "Queen", actual_pickup_date: "2026-09-28T06:00:00Z", collected_by: "{Driver}", pickup_proof: true })],
};
const eligible: RepairOrderEligibleUnit[] = [
  { id: "e1", unit_id: "U1-000-086", sku: "M1401S-K", item: "M1401S · King", po_no: "PO2601-116", site_id: "w1", site_name: null, display: false, ownership: "carres_owned", refusal: null },
  { id: "e2", unit_id: "U1-000-088", sku: "H1401S-Q", item: "H1401S · Queen", po_no: "PO2604-078", site_id: "w1", site_name: null, display: false, ownership: "carres_owned", refusal: null },
  { id: "e3", unit_id: "U1-000-090", sku: "DSL9038-SET-2S+L", item: "DSL9038 · SET-2S+L", po_no: "PO/2604-087", site_id: "w1", site_name: null, display: false, ownership: "carres_owned", refusal: "Already on {RO No}" },
];

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("/api/")) return realFetch(input, init);
  if (init?.method && init.method !== "GET") return new Response(JSON.stringify({ message: "Local preview does not save records." }), { status: 405 });
  if (url.includes("/api/operation/repair-orders/options")) return json({ sites: [{ id: "w1", name: "Carres Klang", carres: true }, { id: "w2", name: "PJ Showroom", carres: true }], suppliers: [{ id: "s1", name: "Hookka Industries" }, { id: "s2", name: "Laveo" }] });
  if (url.includes("/api/operation/repair-orders/eligible-units")) return json({ units: eligible });
  if (url.includes("/api/ops/issues/evidence/upload-url")) return json({ token: "t", path: "x" });
  if (/\/api\/operation\/repair-orders\/[^/?]+\/evidence/.test(url)) return json({ files: [], quotation: null });
  // Slice B: the A4 paper. The photographs stand in with the Carres mark (a
  // local file) — no invented damage picture.
  if (/\/api\/operation\/repair-orders\/[^/?]+\/print-data/.test(url)) return json({
    ro_no: base.ro_no, version: 1, ro_doc_date: base.ro_doc_date,
    supplier: { name: "Hookka Industries", address: null, contact: null }, claim_no: null,
    pickup: { name: "Carres Klang", address: null }, return_to: { name: "Carres Klang", address: null },
    issued_by: "{Operation staff}",
    units: base.units.map((u) => ({
      unit_id: u.unit_id, po_no: u.po_no, category: u.category, item: u.item, item_spec: u.item_spec,
      problem: u.problem === "damaged" ? "Damaged" : "Missing component", problem_note: u.problem_note,
      repair_requirement: u.repair_requirement, photos: u.evidence.length ? ["/carres-logo.png", "/carres-logo.png"] : [],
    })),
  });
  if (/\/api\/operation\/repair-orders\/[^/?]+/.test(url)) return json({ repairOrder: base });
  if (url.includes("/api/operation/repair-orders")) return json({ repairOrders: [base, second] });
  return json({});
};

const view = new URLSearchParams(window.location.search).get("view") ?? "register";
if (view === "object-out") Object.assign(base, second, { id: "ro-1", units: second.units });
const entry = view === "create" ? "/operation?tab=repair-orders&create=1" : view === "object" || view === "object-out" ? "/operation?tab=repair-orders&ro=ro-1" : "/operation?tab=repair-orders";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[entry]}>
      <PreviewFrame label="Repair Orders (§9.7, test rows)">
        <OperationRepairOrders />
      </PreviewFrame>
    </MemoryRouter>
  </QueryClientProvider>,
);
