/** Local fixture preview only. No production session, writes or external requests. */
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationSupplierClaims from "@/pages/operation/OperationSupplierClaims";
import PreviewFrame from "./preview-frame";
import "@/index.css";
const base = { id: "claim-1", claim_no: "SC-20260904-1038", po_id: "PO-20260901-0251", po_line_id: "line-1", supplier_id: "supplier-1", supplier_name: "Hooka", sku: "LYYAR-1A(LHF)", product_description: "Sofa Lyra", product_variant: "Left arm", warehouse_receipt_id: "receipt-1", grn_no: "GRN-20260904-1064", product_category: "sofa", claim_type: "damaged", qty: 2, status: "open", do_number: "HK-2091", note: "Left arm fabric torn on arrival. Both items remain held at the warehouse.", reported_by_name: "Shasha", reported_at: "2026-09-04T02:00:00Z", photo_count: 1, requested_action: "replace", requested_at: "2026-09-04T03:00:00Z", supplier_response: "repair", supplier_response_note: "Supplier offered to repair both items.", responded_at: "2026-09-05T04:00:00Z", customer_resolution: null, carres_execution: "return_to_supplier", held_units: 2, hold_reason: "damaged", held_unit_codes: ["U-20260904-0142", "U-20260904-0143"], closed_at: null,
  units: [{ id: "u-142", unit_code: "U1-000-142", identity_scope: "unit", qty: 1, status: "on_hold" }, { id: "u-143", unit_code: "U1-000-143", identity_scope: "unit", qty: 1, status: "on_hold" }], sent: true,
  response_reply: { scope: "claim", unit_ids: [], supplier_date: "2026-10-05" } };
const rows = [base, { ...base, id: "claim-2", claim_no: "SC-1019", supplier_name: "Nice Future", sku: "NF-CLASSIC-K", product_description: "Mattress Classic", product_variant: "King", claim_type: "wrong_sku", qty: 1, supplier_response: null, requested_action: null, requested_at: null, responded_at: null, note: "King ordered; Queen label on the received item.", held_units: 1, held_unit_codes: ["U-20260903-0090"], units: [{ id: "u-090", unit_code: "U1-000-090", identity_scope: "unit", qty: 1, status: "on_hold" }], sent: false, response_reply: null }, { ...base, id: "claim-3", claim_no: "SC-1018", supplier_name: "Ohana", status: "closed", closed_at: "2026-08-31T08:00:00Z", reported_at: "2026-08-25T01:00:00Z", product_description: "Bedframe Nora", product_variant: "Queen", sku: "NR-QUEEN", qty: 1, held_units: 0, held_unit_codes: [], photo_count: 0, units: [{ id: "q-1", unit_code: null, identity_scope: "quantity", qty: 1, status: "free" }] }];
const RECORD = (id: string) => id === "claim-1" ? {
  replies: [{ id: "r1", response: "repair", scope: "claim", unit_ids: [], supplier_date: "2026-10-05", note: "Supplier offered to repair both items.", spoke_with: "{Supplier contact}", spoken_at: "2026-09-05T03:30:00Z", recorded_at: "2026-09-05T04:00:00Z", recorded_by_name: "Shasha", formal_at: "2026-09-05T04:00:00Z", current: true, evidence: [{ path: "supplier_claim_reply/claim-1/a.jpg", kind: "photo", url: null }] }],
  sends: [{ id: "s1", version: 1, recipient: "{Supplier WhatsApp group}", channel: "whatsapp", note: null, sent_at: "2026-09-04T03:10:00Z", sent_by_name: "Shasha" }],
  units: rows[0].units, requested_by_name: "Shasha", repair_orders: [], purchase_returns: [], authorised_outcome: null,
  plan_repair: { allowed: false, missing: "Authorised Outcome" }, po_duty_name: "Shasha", approver_name: "Jess",
} : { replies: [], sends: [], units: [{ id: "u-090", unit_code: "U1-000-090", identity_scope: "unit", qty: 1, status: "on_hold" }], requested_by_name: null, repair_orders: [], purchase_returns: [], authorised_outcome: null, plan_repair: { allowed: false, missing: "Authorised Outcome" }, po_duty_name: "Shasha", approver_name: "Jess" };
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/")) {
    if (init?.method && init.method !== "GET") return new Response(JSON.stringify({ message: "Local preview does not save records." }), { status: 405, headers: { "Content-Type": "application/json" } });
    if (url.includes("/api/ops/service-cases")) return new Response(JSON.stringify({ items: [{ id: "22222222-2222-4222-8222-222222222222", caseNo: "SC2609-01",  customerName: "", issueType: "damaged", productCategory: "sofa", productSku: "LYYAR-1A(LHF)", whatHappened: "Left arm fabric torn on arrival." }] }), { headers: { "Content-Type": "application/json" } });
    // 0614 — the per-Unit inspector: two files filed with U1-000-142, one
    // video, and one earlier photo that names no Unit (stays `Whole claim`).
    if (url.includes("/inspection")) return new Response(JSON.stringify({
      files: [
        { path: "claim-1/a.jpg", at: "2026-09-04T02:00:00Z", kind: "photo", unit_code: "U1-000-142", url: null },
        { path: "claim-1/b.jpg", at: "2026-09-04T02:00:00Z", kind: "photo", unit_code: "U1-000-142", url: null },
        { path: "claim-1/c.mp4", at: "2026-09-04T02:00:00Z", kind: "video", unit_code: "U1-000-142", url: null },
        { path: "claim-1/old.jpg", at: "2026-09-04T02:00:00Z", kind: "photo", unit_code: null, url: null },
      ],
      problems: [{ stock_item_id: "u-142", note: "{Unit problem note}" }],
    }), { headers: { "Content-Type": "application/json" } });
    const recordId = url.match(/supplier-claims\/([^/]+)\/record/)?.[1];
    if (recordId) return new Response(JSON.stringify(RECORD(recordId)), { headers: { "Content-Type": "application/json" } });
    const payload = url.includes("/photos") ? { photos: [{ path: "unavailable.jpg", url: null }] } : url.includes("/supplier-claims") ? { claims: rows, counts: { open: 2, closed: 1, all: 3 } } : {};
    return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
  }
  return realFetch(input, init);
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}><BrowserRouter>
  <PreviewFrame label="Supplier Claims"><OperationSupplierClaims /></PreviewFrame>
</BrowserRouter></QueryClientProvider>);
