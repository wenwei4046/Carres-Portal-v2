/**
 * MANUAL PURCHASE · PERMANENT REGISTER PREVIEW — DEV ONLY (Card 04).
 *
 * The REAL `OperationManualPurchase`, the REAL stylesheet; only the
 * register read is seeded (window.fetch answers the page's own API paths),
 * because the live screen is behind a login and live data cannot be made
 * to hold every column state at once: MPR- and historical REQ- numbers,
 * all four Approval facts, `Not ordered yet` / one clickable PO / `2 POs`,
 * every structured For, one item and `+ n more`, one supplier and
 * `2 suppliers`, and a selectable Ready-to-order remainder for the
 * PO-Duty-beside-Issue bar.
 *
 * A separate vite entry (`manual-purchase-preview.html`), not a route:
 * `vite build` only emits `index.html`'s graph, so this cannot reach
 * production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationManualPurchase from "@/pages/operation/OperationManualPurchase";
import "@/index.css";

const KLANG = "11111111-1111-4111-8111-111111111111";
const BULOH = "22222222-2222-4222-8222-222222222222";
const S_HOOKA = "aaaaaaa1-0000-4000-8000-000000000001";
const S_OHANA = "aaaaaaa2-0000-4000-8000-000000000002";
const S_DORSETT = "aaaaaaa3-0000-4000-8000-000000000003";
const PO_A = "bbbbbbb1-0000-4000-8000-000000000001";
const PO_B = "bbbbbbb2-0000-4000-8000-000000000002";
const PO_C = "bbbbbbb3-0000-4000-8000-000000000003";
const SC_1 = "ccccccc1-0000-4000-8000-000000000001";
const U_SITI = "ddddddd1-0000-4000-8000-000000000001";
const U_LICHING = "ddddddd2-0000-4000-8000-000000000002";
const U_SHASHA = "ddddddd3-0000-4000-8000-000000000003";

let n = 0;
const rid = () => `eeeeeee${++n}-0000-4000-8000-00000000000${n}`;
const R1 = rid(), R2 = rid(), R3 = rid(), R4 = rid(), R5 = rid(), R6 = rid();

function req(over: Record<string, unknown>) {
  return {
    required_by: null,
    why: null,
    approval_required: false,
    approved_at: null,
    approved_by: null,
    refused_at: null,
    refused_by: null,
    refuse_reason: null,
    for_service_case_id: null,
    for_staff_user_id: null,
    for_subsidiary_name: null,
    created_by: U_SITI,
    destination_id: KLANG,
    ...over,
  };
}

let ln = 0;
function line(over: Record<string, unknown>) {
  return {
    id: `fffffff${++ln}-0000-4000-8000-0000000000${String(ln).padStart(2, "0")}`,
    supplier_id: S_HOOKA,
    destination_id: KLANG,
    approved_qty: null,
    issued_qty: 0,
    remaining_qty: 0,
    required_by: null,
    remark: null,
    po_id: null,
    cancelled_at: null,
    cancel_reason: null,
    received: false,
    po_ids: [],
    ...over,
  };
}

const REGISTER = {
  requests: [
    // ① Other Purchase · Need approval (+ `Jess approves`) · Not ordered yet.
    req({
      id: R1, req_no: "MPR-20260829-4821", purpose: "other_purchase",
      why: "Spare castors for the delivery van",
      approval_required: true, required_by: "2026-09-05",
      created_at: "2026-08-29T03:10:00Z",
    }),
    // ② Service Case · Approved · Ready to order (SELECTABLE) · 2 items.
    req({
      id: R2, req_no: "MPR-20260829-1207", purpose: "service_case",
      for_service_case_id: SC_1, approval_required: true,
      approved_at: "2026-08-29T04:00:00Z", required_by: "2026-09-10",
      created_at: "2026-08-29T02:00:00Z",
    }),
    // ③ Historical REQ- number · RETIRED purpose · Refused.
    req({
      id: R3, req_no: "REQ-0042", purpose: "display",
      why: "Balakong floor sofa is worn.",
      approval_required: true, refused_at: "2026-08-20T02:00:00Z",
      refuse_reason: "a unit in Klang can move instead",
      created_at: "2026-08-20T01:00:00Z",
    }),
    // ④ Ready Stock · No approval needed · fully ordered on TWO POs.
    req({
      id: R4, req_no: "MPR-20260828-7719", purpose: "ready_stock",
      required_by: "2026-09-01", created_at: "2026-08-28T06:00:00Z",
    }),
    // ⑤ Internal Staff Purchase · Approved · part issued (one PO + remainder).
    req({
      id: R5, req_no: "MPR-20260827-0533", purpose: "internal_staff_purchase",
      for_staff_user_id: U_LICHING, approval_required: true,
      approved_at: "2026-08-27T08:00:00Z", required_by: "2026-09-15",
      created_at: "2026-08-27T05:00:00Z",
    }),
    // ⑥ Subsidiary Purchase · 2 suppliers · Multiple destinations.
    req({
      id: R6, req_no: "MPR-20260827-0201", purpose: "subsidiary_purchase",
      for_subsidiary_name: "HOUZS Sdn Bhd", required_by: "2026-09-20",
      created_at: "2026-08-27T02:00:00Z",
    }),
  ],
  lines: [
    line({ request_id: R1, sku: "CASTOR-75", qty: 8, remaining_qty: 8,
      item_label: "Castor 75mm", category: null }),
    line({ request_id: R2, sku: "5539-2NA", qty: 1, approved_qty: 1, remaining_qty: 1,
      item_label: "Booqit 2 Seater", category: "sofa" }),
    line({ request_id: R2, sku: "5539-CNR", qty: 1, approved_qty: 1, remaining_qty: 1,
      item_label: "Booqit Corner", category: "sofa" }),
    line({ request_id: R3, sku: "7011-3S", qty: 1, remaining_qty: 1,
      item_label: "Dorsett 3 Seater", category: "sofa", supplier_id: S_DORSETT }),
    line({ request_id: R4, sku: "B1201S-K", qty: 4, issued_qty: 4, po_id: PO_A,
      po_ids: [PO_A, PO_B], item_label: "Sonic K", category: "mattress" }),
    line({ request_id: R5, sku: "M1401F-Q", qty: 3, approved_qty: 2, issued_qty: 1,
      po_id: PO_C, po_ids: [PO_C], remaining_qty: 1,
      item_label: "Atlas Q", category: "bedframe", supplier_id: S_OHANA }),
    line({ request_id: R6, sku: "5539-L", qty: 1, remaining_qty: 1,
      item_label: "Booqit L Shape", category: "sofa", supplier_id: S_HOOKA }),
    line({ request_id: R6, sku: "7011-2S", qty: 1, remaining_qty: 1,
      item_label: "Dorsett 2 Seater", category: "sofa", supplier_id: S_DORSETT,
      destination_id: BULOH }),
  ],
  pos: [
    { id: PO_A, po_no: "PO-20260828-3301" },
    { id: PO_B, po_no: "PO-20260828-6644" },
    { id: PO_C, po_no: "PO-20260827-9012" },
  ],
  serviceCases: [{ id: SC_1, case_no: "SC-20260815-3311" }],
  destinations: [
    { id: KLANG, name: "Carres Klang" },
    { id: BULOH, name: "AL Sungai Buloh" },
  ],
  suppliers: [
    { id: S_HOOKA, name: "Hooka", kind: "own_logistics" },
    { id: S_OHANA, name: "Ohana", kind: "own_logistics" },
    { id: S_DORSETT, name: "Dorsettloft", kind: "own_logistics" },
  ],
  users: [
    { id: U_SITI, name: "Siti" },
    { id: U_LICHING, name: "Li Ching" },
    { id: U_SHASHA, name: "Shasha" },
  ],
  approvers: [{ id: "u9", name: "Jess" }],
  canApprove: false,
  currentPoDuty: { userId: U_SHASHA, name: "Shasha" },
  actingPoDuty: null,
  poDutyUnavailable: false,
  mayIssue: true,
};

const PICK = { items: [], stockWarehouse: "Carres Klang" };

/* The page's own reads, answered locally — nothing leaves the browser. */
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const answer = (body: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  if (url.includes("/purchasing/requests/issue-costs")) {
    return answer({ costs: [
      { sku: "5539-2NA", unitCost: 850 },
      { sku: "5539-CNR", unitCost: 400 },
    ] });
  }
  if (url.includes("/purchasing/requests/issue")) {
    return answer({ poIds: [], documents: 1 });
  }
  if (url.includes("/purchasing/requests")) return answer(REGISTER);
  if (url.includes("pick-items")) return answer(PICK);
  if (url.includes("/api/")) return answer({});
  return realFetch(input, init);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={["/operation?tab=manual-purchase"]}>
        <div className="h-screen bg-white">
          <OperationManualPurchase />
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
