/** Local fixture preview only. No production session, writes or external requests.
 *
 * The owner-confirmed Purchase Returns register (`docs/purchasing/MASTER.md`
 * §9.6, Jess 2026-09-18) rendered on the REAL components, so the walk measures
 * the shipped page rather than a mock.
 *
 * ⭐ THE PARTIES, DATES AND NUMBERS BELOW ARE ILLUSTRATIVE. §9.6 says so in
 * its own opening paragraph: "sample parties, dates, quantities and document
 * references are illustrative, not verified business data." `Hookka 2 ·
 * Ohana 1` is the supplier rail example the confirmed preview itself used, so
 * it is reproduced here exactly — it is what Jess looked at.
 *
 * The four states the walk needs are all present:
 *   PR-1042  two Units, unsent, pickup unconfirmed  → three overlapping rail
 *                                                     conditions at once
 *   PR-1041  one Unit collected of two              → `Partly picked up`, and
 *                                                     a parent pickup date
 *                                                     deliberately WITHHELD
 *   PR-1039  collected, no pickup photo             → `Pickup proof missing`
 *   PR-1036  collected AND received by the supplier → the only row where the
 *                                                     two dates both print
 */
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PurchaseReturnListRow } from "@carres/shared";
import OperationPurchaseReturns from "@/pages/operation/OperationPurchaseReturns";
import PreviewFrame from "./preview-frame";
import "@/index.css";

const returns: PurchaseReturnListRow[] = [
  {
    id: "return-1042",
    pr_no: "20260915-1042",
    pr_doc_date: "2026-09-15T02:00:00Z",
    supplier_id: "supplier-hookka",
    supplier_name: "Hookka",
    claim_no: "SC-1038",
    grn_no: "GRN-20260904-1064",
    document_sent_at: null,
    confirmed_pickup_date: null,
    units: [
      {
        unit_id: "U-20260904-0142",
        po_id: "PO-20260901-0251",
        category: "Sofa",
        item: "Sofa Lyra",
        item_spec: "Left arm · Grey",
        pickup_location: "AL Sungai Buloh",
        return_to: "Hookka Factory, Muar",
        collected_by: null,
        actual_pickup_date: null,
        supplier_received_date: null,
        evidence: [{ purpose: "problem", photos: 3, videos: 1 }],
      },
      {
        unit_id: "U-20260904-0143",
        po_id: "PO-20260901-0251",
        category: "Sofa",
        item: "Sofa Lyra",
        item_spec: "Left arm · Grey",
        pickup_location: "AL Sungai Buloh",
        return_to: "Hookka Factory, Muar",
        collected_by: null,
        actual_pickup_date: null,
        supplier_received_date: null,
        evidence: [{ purpose: "problem", photos: 2, videos: 0 }],
      },
    ],
  },
  {
    id: "return-1041",
    pr_no: "20260914-1041",
    pr_doc_date: "2026-09-14T02:00:00Z",
    supplier_id: "supplier-hookka",
    supplier_name: "Hookka",
    claim_no: "SC-1035",
    grn_no: "GRN-20260902-1058",
    document_sent_at: "2026-09-14T06:00:00Z",
    confirmed_pickup_date: "2026-09-17T00:00:00Z",
    units: [
      {
        unit_id: "U-20260902-0118",
        po_id: "PO-20260828-0244",
        category: "Bedframe",
        item: "Bedframe Nora",
        item_spec: "Queen · Oak",
        pickup_location: "AL Sungai Buloh",
        return_to: "Hookka Factory, Muar",
        collected_by: "Faizal",
        actual_pickup_date: "2026-09-17T03:00:00Z",
        supplier_received_date: null,
        evidence: [
          { purpose: "problem", photos: 2, videos: 0 },
          { purpose: "pickup", photos: 2, videos: 0 },
        ],
      },
      {
        unit_id: "U-20260902-0119",
        po_id: "PO-20260828-0244",
        category: "Bedframe",
        item: "Bedframe Nora",
        item_spec: "Queen · Oak",
        pickup_location: "Showroom Kepong",
        return_to: "Hookka Factory, Muar",
        collected_by: null,
        actual_pickup_date: null,
        supplier_received_date: null,
        evidence: [{ purpose: "problem", photos: 1, videos: 0 }],
      },
    ],
  },
  {
    id: "return-1039",
    pr_no: "20260911-1039",
    pr_doc_date: "2026-09-11T02:00:00Z",
    supplier_id: "supplier-ohana",
    supplier_name: "Ohana",
    claim_no: "SC-1029",
    grn_no: "GRN-20260830-1041",
    document_sent_at: "2026-09-11T07:00:00Z",
    confirmed_pickup_date: "2026-09-12T00:00:00Z",
    units: [
      {
        unit_id: "U-20260830-0091",
        po_id: "PO-20260820-0231",
        category: "Mattress",
        item: "Mattress Classic",
        item_spec: "King · 12 inch",
        pickup_location: "AL Sungai Buloh",
        return_to: "Ohana Warehouse, Klang",
        collected_by: "Rahim",
        actual_pickup_date: "2026-09-12T04:00:00Z",
        supplier_received_date: null,
        /* Damage photos ONLY. §9.6: a damage photo is never pickup proof, so
           this row is what `Pickup proof missing` counts. */
        evidence: [{ purpose: "problem", photos: 4, videos: 1 }],
      },
    ],
  },
  {
    id: "return-1036",
    pr_no: "20260905-1036",
    pr_doc_date: "2026-09-05T02:00:00Z",
    supplier_id: "supplier-hookka",
    supplier_name: "Hookka",
    claim_no: "SC-1021",
    grn_no: "GRN-20260826-1030",
    document_sent_at: "2026-09-05T08:00:00Z",
    confirmed_pickup_date: "2026-09-08T00:00:00Z",
    units: [
      {
        unit_id: "U-20260826-0074",
        po_id: "PO-20260815-0219",
        category: "Mattress protector",
        item: "Protector Cool",
        item_spec: "King",
        pickup_location: "AL Sungai Buloh",
        return_to: "Hookka Factory, Muar",
        collected_by: "Faizal",
        actual_pickup_date: "2026-09-08T02:30:00Z",
        supplier_received_date: "2026-09-10T09:00:00Z",
        evidence: [
          { purpose: "problem", photos: 2, videos: 0 },
          { purpose: "pickup", photos: 1, videos: 1 },
          { purpose: "receipt", photos: 1, videos: 0 },
        ],
      },
    ],
  },
];

/* The shared module header carries the portal's top-bar icons, and those run
   their own queries. A preview that leaves them without a client renders
   nothing at all — so the page is mounted exactly as the portal mounts it,
   with a client whose fetches are answered locally and never reach a network. */
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/")) {
    if (init?.method && init.method !== "GET") {
      return new Response(
        JSON.stringify({ message: "Local preview does not save records." }),
        { status: 405, headers: { "Content-Type": "application/json" } },
      );
    }
    /* The register's own read, answered locally. The preview therefore
       exercises the CONTAINER — hook, query key, states and all — not just the
       presentational half, so a walk measures the page the portal serves. */
    if (url.includes("/api/operation/purchase-returns")) {
      return new Response(JSON.stringify({ returns }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("{}", { headers: { "Content-Type": "application/json" } });
  }
  return realFetch(input, init);
};

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
  {/* The page's own address: the shared Purchasing header reads `?tab=` to
      decide which destination word it prints, so a preview mounted at "/"
      would render this page under another page's name. */}
  <MemoryRouter initialEntries={["/operation?tab=purchase-returns"]}>
    <PreviewFrame label="Purchase Returns (§9.6, illustrative data)">
      <OperationPurchaseReturns />
    </PreviewFrame>
  </MemoryRouter>
  </QueryClientProvider>,
);
