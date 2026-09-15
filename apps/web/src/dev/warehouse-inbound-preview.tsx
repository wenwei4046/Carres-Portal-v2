/** DEV ONLY: the real page with explicitly labelled verification fixtures, never a production fallback. */
import { createRoot } from "react-dom/client";
import { BrowserRouter, useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  buildInboundRegisterView,
  inboundArrivals,
  INBOUND_UNMAPPED_SITE,
  type ArrivalSource,
} from "@carres/shared";
import ArrivalSourceWorkspace from "@/pages/operation/ArrivalSourceWorkspace";
import WarehouseInbound from "@/pages/operation/WarehouseInbound";
import { useAuth } from "@/lib/auth";
import "@/index.css";
useAuth.setState({ role: "operation" });
/* The acceptance fixtures, each labelled by what it is there to prove. */
const sites = [
  { id: "preview-site", name: "Carres Klang Warehouse" },
  { id: "preview-partner", name: "HOUZS" },
];
/** Ten product lines with long model references — the width case. */
const TEN_LINES = Array.from({ length: 10 }, (_, i) => ({
  sku: `LYYAR-5539-${String(i + 1).padStart(3, "0")}-CHARCOAL-3STR`,
  name: `Booqit CNR Sectional Sofa Left-Hand Facing · Charcoal Weave ${i + 1}`,
}));
const arrivals = inboundArrivals({
  pos: [
    {
      id: "PO-20260901-4471",
      supplier_id: "preview-supplier",
      warehouse_id: "preview-site",
      destination_id: null,
      status: "open",
      official_delivery_date: "2026-09-01",
      eta_date: null,
      placed_at: "2026-08-01",
      so: 4471,
    },
    /* Goods bound for a destination with NO governed Site — the row that
       used to vanish entirely. */
    {
      id: "PO-20260903-8812",
      supplier_id: "preview-supplier",
      warehouse_id: "preview-site",
      destination_id: "preview-unlinked",
      status: "open",
      official_delivery_date: "2026-09-03",
      eta_date: null,
      placed_at: "2026-08-02",
      so: 8812,
    },
    /** Counted stock — a quantity line that mints no Unit IDs. */
    {
      id: "PO-20260905-9003",
      supplier_id: "preview-supplier",
      warehouse_id: "preview-partner",
      destination_id: null,
      status: "open",
      official_delivery_date: "2026-09-05",
      eta_date: null,
      placed_at: "2026-08-04",
      so: null,
    },
  ],
  sites,
  suppliers: [
    { id: "preview-supplier", name: "Nice Future Manufacturing Sdn Bhd" },
  ],
  destinations: [
    { id: "preview-unlinked", warehouse_id: null, name: "Ohana" },
  ],
  skuNames: TEN_LINES.map((l) => ({ sku: l.sku, name: l.name })),
  lines: [
    /* TEN product lines, one piece each: six correct, two damaged, two never
       sent. Order Qty 10 · Received Qty 6 · Damaged Qty 2 · Pending 4. */
    ...TEN_LINES.map((l, i) => ({
      po_id: "PO-20260901-4471",
      qty: 1,
      destination_id: null,
      sku: l.sku,
      identity_mode: "exact_unit" as const,
      received_qty: i < 6 ? 1 : 0,
      damaged_qty: i === 6 || i === 7 ? 1 : 0,
      wrong_item_qty: 0,
    })),
    {
      po_id: "PO-20260903-8812",
      qty: 2,
      destination_id: null,
      sku: TEN_LINES[1].sku,
      identity_mode: "exact_unit" as const,
      received_qty: 0,
    },
    {
      po_id: "PO-20260905-9003",
      qty: 24,
      destination_id: null,
      sku: TEN_LINES[2].sku,
      identity_mode: "quantity" as const,
      received_qty: 10,
      damaged_qty: 2,
      wrong_item_qty: 1,
    },
  ],
  units: [
    ...TEN_LINES.map((l, n) => ({
      id: `unit-${n + 1}`,
      unit_code: `U1-000-${String(n + 1).padStart(3, "0")}`,
      po_no: "PO-20260901-4471",
      qty: 1,
      sku: l.sku,
    })),
    ...[1, 2].map((n) => ({
      id: `unit-d${n}`,
      unit_code: `U1-000-2${n}`,
      po_no: "PO-20260903-8812",
      qty: 1,
      sku: TEN_LINES[1].sku,
    })),
  ],
  /* TWO supplier delivery notes, each with its own receipt and date. */
  receipts: [
    {
      id: "preview-receipt-1",
      po_id: "PO-20260901-4471",
      status: "posted",
      posted_at: "2026-09-01T09:00:00Z",
      grn_no: "GRN-010926-0001",
      do_number: "DO-2026-0918-AAA",
      goods_received_at: "2026-09-01",
    },
    {
      id: "preview-receipt-2",
      po_id: "PO-20260901-4471",
      status: "posted",
      posted_at: "2026-09-04T09:00:00Z",
      grn_no: "GRN-040926-0002",
      do_number: "DO-2026-0930-BBB",
      goods_received_at: "2026-09-04",
    },
  ],
  results: Array.from({ length: 8 }, (_, n) => ({
    receipt_id: n < 6 ? "preview-receipt-1" : "preview-receipt-2",
    stock_item_id: `unit-${n + 1}`,
    outcome: n < 6 ? "received" : "received_with_issue",
    issue_kind: n < 6 ? null : "damaged",
  })),
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
/** The preview answers with the SAME projection the Worker returns, so the
 *  page under test is never given a shape production does not produce. */
function previewRegister(url: string, empty: boolean) {
  const rows = empty ? [] : [...arrivals, ...extraArrivals];
  const params = new URLSearchParams(url.split("?")[1] ?? "");
  const view = buildInboundRegisterView(
    rows,
    params,
    Number(params.get("offset") ?? 0),
    Number(params.get("limit") ?? 50),
  );
  const unmapped = new Map<string, { id: string | null; name: string | null; arrivals: number }>();
  for (const row of rows)
    if (!row.siteMapped) {
      const key = row.destinationId ?? "";
      const entry = unmapped.get(key) ?? {
        id: row.destinationId,
        name: row.destinationName,
        arrivals: 0,
      };
      entry.arrivals += 1;
      unmapped.set(key, entry);
    }
  return {
    arrivals: view.rows,
    sites: [...sites, ...extraSites],
    unmappedDestinations: [...unmapped.values()],
    unresolvedSources: [],
    page: {
      offset: Number(params.get("offset") ?? 0),
      limit: Number(params.get("limit") ?? 50),
      total: view.total,
    },
    facets: view.facets,
  };
}
void INBOUND_UNMAPPED_SITE;

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
          : previewRegister(url, mode === "empty"),
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
