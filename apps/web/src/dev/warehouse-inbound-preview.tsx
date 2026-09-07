/** DEV ONLY: the real page with explicitly labelled verification fixtures, never a production fallback. */
import { createRoot } from "react-dom/client";
import { BrowserRouter, useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { inboundArrivals, type ArrivalSource } from "@carres/shared";
import ArrivalSourceWorkspace from "@/pages/operation/ArrivalSourceWorkspace";
import WarehouseInbound from "@/pages/operation/WarehouseInbound";
import { useAuth } from "@/lib/auth";
import "@/index.css";
useAuth.setState({ role: "operation" });
const sites = [{ id: "preview-site", name: "Preview Site" }];
const arrivals = inboundArrivals({
  pos: [
    {
      id: "PREVIEW-PO-1",
      supplier_id: "preview-supplier",
      warehouse_id: "preview-site",
      destination_id: null,
      status: "open",
      official_delivery_date: "2026-09-01",
      eta_date: null,
      placed_at: "2026-08-01",
      so: null,
    },
  ],
  sites,
  suppliers: [{ id: "preview-supplier", name: "Preview Supplier" }],
  destinations: [],
  units: [1, 2, 3].map((n) => ({
    id: String(n),
    unit_code: `U1-000-00${n}`,
    po_no: "PREVIEW-PO-1",
    qty: 1,
  })),
  receipts: [
    {
      id: "preview-receipt",
      po_id: "PREVIEW-PO-1",
      status: "posted",
      posted_at: "2026-09-01",
    },
  ],
  results: [
    {
      receipt_id: "preview-receipt",
      stock_item_id: "1",
      outcome: "received",
      issue_kind: null,
    },
    {
      receipt_id: "preview-receipt",
      stock_item_id: "2",
      outcome: "received_with_issue",
      issue_kind: "damaged",
    },
  ],
});
const previewId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const extraSites = [{ id: previewId(900), name: "Preview destination" }];
const parties = [
  {
    id: previewId(901),
    name: "Preview delivery party",
    kind: "delivery_operator",
  },
  {
    id: previewId(902),
    name: "Preview warehouse operator",
    kind: "warehouse_operator",
  },
];
const sourceDetails = (
  [
    "transfer",
    "customer-return",
    "failed-delivery-return",
    "repair-return",
    "supplier-replacement",
  ] as const
).map((kind, index) => {
  const id = previewId(100 + index);
  const source: ArrivalSource = {
    id,
    source_no: `PREVIEW-${kind.toUpperCase()}`,
    kind,
    claim_id: null,
    case_id: null,
    from_site_id: null,
    to_site_id: previewId(900),
    party_id: previewId(901),
    expected_date: "2026-09-07",
    collection_date: "2026-09-06",
    reason: "Explicit sample source for local verification",
    cancelled_at: null,
    created_at: "2026-09-05",
  };
  const units = [1, 2, 3].map((n) => ({
    source_id: id,
    stock_item_id: previewId(200 + index * 10 + n),
    replaces_item_id: null,
    unit: {
      id: previewId(200 + index * 10 + n),
      unit_code: `U1-001-${String(index * 10 + n).padStart(3, "0")}`,
      sku: "Sample product",
      status: n === 3 ? "transferred" : "on_hold",
      qty: 1,
      warehouse_id: previewId(900),
      reserved_ref: null,
    },
  }));
  const receipts = [
    {
      id: previewId(300 + index),
      grn_no: `PREVIEW-GRN-${index + 1}`,
      status: "posted",
      posted_at: "2026-09-07",
      goods_received_at: "2026-09-07",
      do_number: `PREVIEW-DO-${index + 1}`,
      do_file_path: "sample-only",
      unit_results: units.slice(0, 2).map((u, n) => ({
        stock_item_id: u.stock_item_id,
        unit_code: u.unit.unit_code,
        outcome: n === 0 ? "received" : "received_with_issue",
        issue_kind: n === 0 ? null : "damaged",
      })),
    },
  ];
  const events = [
    {
      id: previewId(400 + index),
      kind: "collected",
      source_id: id,
      unit_ids: units.slice(0, 2).map((u) => u.stock_item_id),
      occurred_at: "2026-09-06",
      person: "Sample collector",
      evidence: "Sample handover evidence",
    },
    {
      id: previewId(500 + index),
      kind: "carrier_received",
      source_id: id,
      unit_ids: [units[0].stock_item_id],
      occurred_at: "2026-09-06",
      person: "Sample delivery operator",
      evidence: "Sample carrier receipt",
    },
  ];
  return { source, units, receipts, events };
});
const extraArrivals = inboundArrivals({
  pos: [],
  suppliers: [],
  destinations: [],
  sites: extraSites,
  parties,
  arrivalSources: sourceDetails.map((d) => d.source),
  sourceUnits: sourceDetails.flatMap((d) => d.units),
  sourceEvents: sourceDetails.flatMap((d) => d.events),
  units: sourceDetails.flatMap((d) =>
    d.units.map((u) => ({ ...u.unit, po_no: null })),
  ),
  receipts: sourceDetails.flatMap((d) =>
    d.receipts.map((r) => ({
      ...r,
      po_id: null,
      arrival_source_id: d.source.id,
    })),
  ),
  results: sourceDetails.flatMap((d) =>
    d.receipts.flatMap((r) =>
      r.unit_results.map((u) => ({ ...u, receipt_id: r.id })),
    ),
  ),
});
function PreviewPage() {
  const [p] = useSearchParams();
  const tab = p.get("tab");
  if (tab === "receiving" && p.get("po"))
    return (
      <div className="p-4 text-body">
        Supplier Receiving uses the existing PO workflow. This sample preview
        covers the additional arrival sources.
      </div>
    );
  return tab === "arrival-source" ||
    tab === "receiving" ||
    tab === "warehouse-outbound" ? (
    <ArrivalSourceWorkspace
      receiving={tab === "receiving"}
      outbound={tab === "warehouse-outbound"}
    />
  ) : (
    <WarehouseInbound />
  );
}
const realFetch = window.fetch.bind(window);
let retryFailed = false;
window.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (init?.method && init.method !== "GET")
    return new Response(
      JSON.stringify({
        message: "Sample preview does not save operational records",
      }),
      { status: 503 },
    );
  if (url.includes("/arrival-sources/options"))
    return Response.json({
      sites: extraSites,
      parties,
      units: sourceDetails.flatMap((d) => d.units.map((u) => u.unit)),
      limit: 100,
    });
  if (url.includes("/warehouse-receipts/duty"))
    return Response.json({ allowed: true });
  if (url.includes("/arrival-sources/")) {
    const id = url.split("/arrival-sources/")[1].split("?")[0];
    const detail = sourceDetails.find((d) => d.source.id === id);
    return Response.json(detail ?? { message: "Sample source not found" }, {
      status: detail ? 200 : 404,
    });
  }
  if (url.includes("/warehouse/inbound")) {
    const mode = new URLSearchParams(location.search).get("preview");
    const fail = mode === "error" || (mode === "retry" && !retryFailed);
    if (fail) retryFailed = true;
    if (mode === "loading") await new Promise((r) => setTimeout(r, 30000));
    return new Response(
      JSON.stringify(
        fail
          ? { message: "Preview connection failed" }
          : {
              arrivals: mode === "empty" ? [] : [...arrivals, ...extraArrivals],
              sites: [...sites, ...extraSites],
            },
      ),
      {
        status: fail ? 503 : 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  if (url.includes("/api/")) return new Response("{}", { status: 200 });
  return realFetch(input, init);
};
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <BrowserRouter>
      <div className="flex h-screen flex-col">
        <div className="bg-kit-amber-3 px-3 py-1 text-meta">
          Local verification · Sample data
        </div>
        <PreviewPage />
      </div>
    </BrowserRouter>
  </QueryClientProvider>,
);
