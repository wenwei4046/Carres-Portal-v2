/** Local fixture preview only. No production session, writes or external requests. */
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationSupplierClaims from "@/pages/operation/OperationSupplierClaims";
import "@/index.css";
const base = { id: "claim-1", claim_no: "SC-20260904-1038", po_id: "PO-20260901-0251", po_line_id: "line-1", supplier_id: "supplier-1", supplier_name: "Hooka", sku: "LYYAR-1A(LHF)", product_description: "Sofa Lyra", product_variant: "Left arm", warehouse_receipt_id: "receipt-1", grn_no: "GRN-20260904-1064", product_category: "sofa", claim_type: "damaged", qty: 2, status: "open", do_number: "HK-2091", note: "Left arm fabric torn on arrival. Both items remain held at the warehouse.", reported_by_name: "Shasha", reported_at: "2026-09-04T02:00:00Z", photo_count: 1, requested_action: "replace", requested_at: "2026-09-04T03:00:00Z", supplier_response: "repair", supplier_response_note: "Supplier offered to repair both items.", responded_at: "2026-09-05T04:00:00Z", customer_resolution: null, carres_execution: "return_to_supplier", held_units: 2, hold_reason: "damaged", held_unit_codes: ["U-20260904-0142", "U-20260904-0143"], closed_at: null };
const rows = [base, { ...base, id: "claim-2", claim_no: "SC-1019", supplier_name: "Nice Future", sku: "NF-CLASSIC-K", product_description: "Mattress Classic", product_variant: "King", claim_type: "wrong_sku", qty: 1, supplier_response: null, requested_action: null, requested_at: null, responded_at: null, note: "King ordered; Queen label on the received item.", held_units: 1, held_unit_codes: ["U-20260903-0090"] }, { ...base, id: "claim-3", claim_no: "SC-1018", supplier_name: "Ohana", status: "closed", closed_at: "2026-08-31T08:00:00Z", reported_at: "2026-08-25T01:00:00Z", product_description: "Bedframe Nora", product_variant: "Queen", sku: "NR-QUEEN", qty: 1, held_units: 0, held_unit_codes: [], photo_count: 0 }];
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/")) {
    if (init?.method && init.method !== "GET") return new Response(JSON.stringify({ message: "Local preview does not save records." }), { status: 405, headers: { "Content-Type": "application/json" } });
    if (url.includes("/api/ops/service-cases")) return new Response(JSON.stringify({ items: [{ id: "22222222-2222-4222-8222-222222222222", caseNo: "SC2609-01",  customerName: "", issueType: "damaged", productCategory: "sofa", productSku: "LYYAR-1A(LHF)", whatHappened: "Left arm fabric torn on arrival." }] }), { headers: { "Content-Type": "application/json" } });
    const payload = url.includes("/photos") ? { photos: [{ path: "unavailable.jpg", url: null }] } : url.includes("/supplier-claims") ? { claims: rows, counts: { open: 2, closed: 1, all: 3 } } : {};
    return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
  }
  return realFetch(input, init);
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}><BrowserRouter>
  <div className="h-screen flex flex-col"><div className="shrink-0 px-4 py-1 text-label bg-base-900 text-white">Local fixture preview · Supplier Claims</div><div className="flex-1 min-h-0"><OperationSupplierClaims /></div></div>
</BrowserRouter></QueryClientProvider>);
