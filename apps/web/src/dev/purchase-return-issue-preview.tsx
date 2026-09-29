/**
 * PURCHASE RETURN CREATION PREVIEW — DEV ONLY (Purchasing §9.6 creation door,
 * slice C2). The REAL pages over a seeded fetch stub; suppliers, claims and
 * Units are test fixtures. `?view=` picks the surface:
 *
 *   claim     the claim record's Result: `Record what Carres does next`, `Issue Purchase Return`
 *   issue     the `Issue Purchase Return` form beside its DRAFT paper (50/50)
 *   register  the Purchase Returns register (the `Sending not confirmed` rail row)
 *   record    the full-width PR record
 *   work      the Work page with the four Purchase Return items (real projector)
 *
 * A separate vite entry: it cannot reach production, and it saves nothing.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { projectPurchaseReturnWork, type OperationWorkResponse, type PurchaseReturnDetail, type PurchaseReturnIssueSource } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import { appTodayIso } from "@/lib/fmt-date";
import OperationSupplierClaims from "@/pages/operation/OperationSupplierClaims";
import OperationPurchaseReturns from "@/pages/operation/OperationPurchaseReturns";
import OperationWork from "@/pages/operation/OperationWork";
import { IssueForm } from "@/pages/operation/components/PurchaseReturnIssue";
import PreviewFrame from "./preview-frame";
import "@/index.css";

const ME = "00000000-0000-4000-8000-0000000000aa";
const TODAY = appTodayIso();
const day = (n: number) => { const d = new Date(`${TODAY}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const view = new URLSearchParams(window.location.search).get("view") ?? "claim";

const UNITS = [
  { id: "u-142", unit_code: "U1-000-142", identity_scope: "unit", qty: 1, status: "on_hold" },
  { id: "u-143", unit_code: "U1-000-143", identity_scope: "unit", qty: 1, status: "on_hold" },
];
const CLAIM = { id: "claim-1", claim_no: "SC-20260904-1038", po_id: "PO-20260901-0251", po_line_id: "line-1", supplier_id: "supplier-1", supplier_name: "Hookka Industries", sku: "LYYAR-1A(LHF)", product_description: "Sofa Lyra", product_variant: "Left arm", warehouse_receipt_id: "receipt-1", grn_no: "GRN-20260904-1064", product_category: "sofa", claim_type: "damaged", qty: 2, status: "open", do_number: "HK-2091", note: "Left arm fabric torn on arrival.", reported_by_name: "Shasha", reported_at: "2026-09-04T02:00:00Z", photo_count: 0, requested_action: "replace", requested_at: "2026-09-04T03:00:00Z", supplier_response: "return_and_replace", supplier_response_note: null, responded_at: "2026-09-05T04:00:00Z", customer_resolution: null, carres_execution: view === "claim-empty" ? null : "return_to_supplier", carres_execution_at: "2026-09-28T02:00:00Z", held_units: 2, hold_reason: "damaged", held_unit_codes: ["U1-000-142", "U1-000-143"], closed_at: null, units: UNITS, sent: true, response_reply: { scope: "claim", unit_ids: [], supplier_date: "2026-10-05" } };
const RECORD = {
  replies: [{ id: "r1", response: "return_and_replace", scope: "claim", unit_ids: [], supplier_date: "2026-10-05", note: null, spoke_with: "{Supplier contact}", spoken_at: "2026-09-05T03:30:00Z", recorded_at: "2026-09-05T04:00:00Z", recorded_by_name: "Shasha", formal_at: "2026-09-05T04:00:00Z", current: true, evidence: [] }],
  sends: [{ id: "s1", version: 1, recipient: "{Supplier WhatsApp group}", channel: "whatsapp", note: null, sent_at: "2026-09-04T03:10:00Z", sent_by_name: "Shasha" }],
  units: UNITS, requested_by_name: "Shasha", repair_orders: [], purchase_returns: [], authorised_outcome: null,
  plan_repair: { allowed: false, missing: "Authorised Outcome" }, po_duty_name: "Shasha", approver_name: "Jess",
  carres_execution: CLAIM.carres_execution, carres_execution_at: CLAIM.carres_execution_at, carres_execution_by_name: "Shasha", may_record_next: true,
};
const SOURCE: PurchaseReturnIssueSource = {
  claim_id: "claim-1", claim_no: CLAIM.claim_no, supplier_name: "Hookka Industries", return_address: "{Supplier return address}\nMuar, Johor", grn_no: CLAIM.grn_no,
  units: [
    { stock_item_id: "u-142", unit_code: "U1-000-142", po_no: CLAIM.po_id, category: "Sofa", item: "Sofa Lyra", item_spec: "Left arm", pickup_location: "Carres Klang", seen: "t", refusal: null },
    { stock_item_id: "u-143", unit_code: "U1-000-143", po_no: CLAIM.po_id, category: "Sofa", item: "Sofa Lyra", item_spec: "Left arm", pickup_location: "Carres Klang", seen: "t", refusal: null },
    { stock_item_id: "u-144", unit_code: "U1-000-144", po_no: CLAIM.po_id, category: "Sofa", item: "Sofa Lyra", item_spec: "Left arm", pickup_location: "Carres Klang", seen: "t", refusal: "Already on RO260928-4827" },
  ],
};
const unit = (code: string, over: Partial<PurchaseReturnDetail["units"][number]> = {}) => ({ unit_id: code, po_id: CLAIM.po_id, category: "Sofa", item: "Sofa Lyra", item_spec: "Left arm", pickup_location: "Carres Klang", return_to: "{Supplier return address}", collected_by: null, actual_pickup_date: null, supplier_received_date: null, evidence: [], ...over });
const RETURNS: PurchaseReturnDetail[] = [
  { id: "pr-1", pr_no: "PR-20260929-1001", pr_doc_date: `${TODAY}T02:00:00Z`, supplier_id: "supplier-1", supplier_name: "Hookka Industries", supplier_claim_id: "claim-1", claim_no: CLAIM.claim_no, grn_no: CLAIM.grn_no, sent_at: null, confirmed_pickup_date: null, sends: [], confirmations: [], units: [unit("U1-000-142"), unit("U1-000-143")] },
  { id: "pr-2", pr_no: "PR-20260928-1000", pr_doc_date: `${day(-1)}T02:00:00Z`, supplier_id: "supplier-2", supplier_name: "Nice Future", supplier_claim_id: "claim-2", claim_no: "SC-1019", grn_no: null, sent_at: `${day(-1)}T03:00:00Z`, confirmed_pickup_date: day(1), sends: [{ id: "d1", channel: "whatsapp", recipient: "{Supplier WhatsApp group}", sent_at: `${day(-1)}T03:00:00Z`, sent_by_name: "Shasha" }], confirmations: [], units: [unit("U1-000-090", { item: "Mattress Classic", item_spec: "King", category: "Mattress" })] },
  { id: "pr-3", pr_no: "PR-20260925-0999", pr_doc_date: `${day(-5)}T02:00:00Z`, supplier_id: "supplier-3", supplier_name: "Ohana", supplier_claim_id: "claim-3", claim_no: "SC-1018", grn_no: null, sent_at: `${day(-5)}T03:00:00Z`, confirmed_pickup_date: day(-2), sends: [{ id: "d2", channel: "email", recipient: "{Supplier email}", sent_at: `${day(-5)}T03:00:00Z`, sent_by_name: "Shasha" }], confirmations: [], units: [unit("U1-000-051", { item: "Bedframe Nora", item_spec: "Queen", category: "Bedframe" })] },
];
const duty = { dutyKey: "po_duty", onDate: TODAY, normalOwner: { userId: ME, name: "Shasha" }, buddy: null, activeCover: null, actingPerson: { userId: ME, name: "Shasha" }, state: "primary" as const, assignmentId: null };
const FEED: OperationWorkResponse = {
  contractVersion: 2, complete: true, generatedOn: TODAY, closureReceipt: null,
  staff: [{ userId: ME, name: "Shasha", email: "sha@carres.co" }],
  sources: (["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((key) => ({ key, state: "healthy" as const, observedAt: `${TODAY}T01:00:00.000Z`, lastSuccessfulAt: `${TODAY}T01:00:00.000Z`, errorLabel: null })),
  items: projectPurchaseReturnWork({ pendingIssue: [{ id: "claim-4", claim_no: "SC-1022", supplier_name: "Laveo", carres_execution_at: `${day(-3)}T02:00:00Z` }], returns: RETURNS, poDuty: duty as never, today: TODAY, observedAt: `${TODAY}T01:00:00.000Z` }),
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("/api/")) return realFetch(input, init);
  if (init?.method && init.method !== "GET") return json({ message: "Local preview does not save records." }, 405);
  if (/\/api\/operation\/work(\?|$)/.test(url)) return json(FEED);
  if (/\/api\/operation\/staff(\?|$)/.test(url)) return json({ staff: [{ user_id: ME, email: "sha@carres.co", name: "Shasha", pooled: true, available: true, note: null, last_seen_at: null, duties: [] }], myDuties: [] });
  if (url.includes("/supplier-claims/claim-1/record")) return json(RECORD);
  if (url.includes("/supplier-claims")) return json({ claims: [CLAIM], counts: { open: 1, closed: 0, all: 1 } });
  if (url.includes("/purchase-returns/issue-source")) return json({ source: SOURCE });
  const one = url.match(/purchase-returns\/(pr-\d)(\?|$)/)?.[1];
  if (one) return json({ purchaseReturn: RETURNS.find((r) => r.id === one) });
  if (url.includes("/purchase-returns")) return json({ returns: RETURNS });
  return json({ message: "not seeded" }, 404);
};

useAuth.setState({ role: "operation", user: { id: ME, email: "sha@carres.co" } as never });
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const start = view === "register" ? "/operation?tab=purchase-returns"
  : view === "record" ? "/operation?tab=purchase-returns&pr=pr-2"
  : view === "work" ? `/operation?tab=work&day=${new URLSearchParams(window.location.search).get("day") ?? "missed"}${new URLSearchParams(window.location.search).get("order") ? `&order=${encodeURIComponent(new URLSearchParams(window.location.search).get("order")!)}` : ""}`
  : "/operation?tab=claims&claim=claim-1";

const body = view === "issue"
  ? <div className="h-full overflow-auto p-4"><IssueForm source={SOURCE} onClose={() => undefined} onIssued={() => undefined} /></div>
  : view === "register" || view === "record" ? <OperationPurchaseReturns />
  : view === "work" ? <div className="flex h-full flex-col"><OperationWork /></div>
  : <OperationSupplierClaims />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[start]}>
        <PreviewFrame label={`Purchase Return creation · ${view} (test suppliers, fixture claims)`}>{body}</PreviewFrame>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
