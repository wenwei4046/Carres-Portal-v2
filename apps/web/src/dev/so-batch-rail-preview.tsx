/**
 * SO BATCH PURCHASE · RAIL PREVIEW — DEV ONLY (Cards 02-A · 02-B · 02-C).
 *
 * The REAL `SoBatchRegister`, the REAL stylesheet, only the payload seeded:
 * one row in every rail category, so the six-section WORK TO DO · TO ORDER ·
 * ORDER TIMING · PRODUCT · SUPPLIER · SETUP TO FIX rail can be walked and
 * photographed. The live screen is behind a login, and live data cannot be
 * made to hold all five timing bands at once.
 *
 * `?setup=0` removes the one `Production days not set` line, proving the
 * whole `SETUP TO FIX` section leaves the rail with it.
 *
 * `?old=1` draws, beside the real page, a static reconstruction of the
 * RETIRED 200px truncating rail — the owner asked to SEE changes, and a
 * description of a deleted layout is not seeing it. It uses the legacy
 * `RailGroup` / `RailItem` pair, is labelled as retired, and ships nowhere.
 *
 * A separate vite entry (`so-batch-rail-preview.html`), not a route:
 * `vite build` only emits `index.html`'s graph, so this cannot reach
 * production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  soBatchAction,
  type PurchaseDemandRow,
  type SoBatchOrderRow,
  type SoBatchPurchaseResponse,
} from "@carres/shared";
import SoBatchRegister from "@/pages/operation/so-batch/SoBatchRegister";
import { RailGroup, RailItem } from "@/pages/operation/components/workspace-rail";
import "@/index.css";

const KLANG = "11111111-1111-4111-8111-111111111111";
const BULOH = "22222222-2222-4222-8222-222222222222";

let seq = 0;
function row(over: Partial<PurchaseDemandRow>): PurchaseDemandRow {
  seq += 1;
  const base: PurchaseDemandRow = {
    id: `build::o${seq}::b${seq}`,
    state: "can_order_early",
    lineIds: [`l${seq}`],
    orderId: `o${seq}`,
    so: 1317 + seq,
    customer: "Kimmy",
    customerDelivery: "2026-10-28",
    item: "Booqit",
    variant: "King",
    category: "mattress",
    skus: ["B1201S-K"],
    supplierId: "s-hooka",
    supplier: "Hooka",
    qtyNeeded: 2,
    readyStock: 0,
    takenFromStock: 0,
    onPo: 0,
    poNumbers: [],
    toBuy: 2,
    goodsMustArrive: "2026-10-08",
    issueRef: { proposalKey: "s-hooka::mattress", buildKey: `b${seq}` },
    action: null,
    parts: [{ sku: "B1201S-K", qty: 2, unitCost: 100 }],
    supplierKind: "own_logistics",
    ownerName: null,
    ownerDuty: null,
    ...over,
  };
  return {
    ...base,
    action:
      over.action !== undefined
        ? over.action
        : soBatchAction({
            state: base.state,
            item: base.item,
            supplier: base.supplier,
            category: base.category,
            ownerId: null,
            ownerName: base.ownerName,
            orderId: base.orderId,
            so: base.so,
            dueDate: base.goodsMustArrive,
          }),
  };
}

const params = new URLSearchParams(window.location.search);
const withSetup = params.get("setup") !== "0";
const showOld = params.get("old") === "1";

const rows: PurchaseDemandRow[] = [
  row({ customer: "Kimmy", item: "Booqit", variant: "King", skus: ["B1201S-K"] }),
  row({
    state: "can_order_early",
    customer: "PETER",
    item: "Laveo",
    variant: "Queen",
    skus: ["L1201S-Q"],
    qtyNeeded: 1,
    toBuy: 1,
    parts: [{ sku: "L1201S-Q", qty: 1, unitCost: 90 }],
  }),
  row({
    state: "safety_days_full",
    customer: "ANNE",
    item: "Haven",
    variant: "King",
    skus: ["H1401S-K"],
    customerDelivery: "2026-10-01",
    goodsMustArrive: "2026-09-10",
    qtyNeeded: 1,
    toBuy: 1,
    parts: [{ sku: "H1401S-K", qty: 1, unitCost: 120 }],
  }),
  row({
    state: "safety_days_low",
    customer: "BOB",
    item: "Partly",
    variant: "King",
    skus: ["PART-K"],
    customerDelivery: "2026-09-18",
    goodsMustArrive: "2026-09-10",
    qtyNeeded: 3,
    onPo: 2,
    poNumbers: ["PO-20260820-4827"],
    toBuy: 1,
    parts: [{ sku: "PART-K", qty: 1, unitCost: 100 }],
  }),
  row({
    state: "safety_days_none",
    customer: "MEI",
    item: "Booqit",
    variant: "Queen",
    skus: ["B1201S-Q"],
    customerDelivery: "2026-09-10",
    goodsMustArrive: "2026-09-10",
    qtyNeeded: 1,
    toBuy: 1,
    parts: [{ sku: "B1201S-Q", qty: 1, unitCost: 100 }],
  }),
  row({
    state: "not_enough_production_time",
    customer: "RAJ",
    item: "Laveo",
    variant: "King",
    skus: ["L1201S-K"],
    customerDelivery: "2026-09-04",
    goodsMustArrive: "2026-09-01",
    qtyNeeded: 1,
    toBuy: 1,
    parts: [{ sku: "L1201S-K", qty: 1, unitCost: 90 }],
  }),
  /* Card 02-C — a BEDFRAME from a second supplier, so the PRODUCT and
     SUPPLIER sections have something real to say. */
  row({
    state: "safety_days_low",
    customer: "FARIDAH",
    item: "Nordic Bedframe",
    variant: "Queen",
    category: "bedframe",
    skus: ["NBF-Q"],
    supplier: "Nice Future",
    supplierId: "s-nicefuture",
    customerDelivery: "2026-09-20",
    goodsMustArrive: "2026-09-08",
    qtyNeeded: 1,
    toBuy: 1,
    parts: [{ sku: "NBF-Q", qty: 1, unitCost: 150 }],
  }),
  row({
    state: "no_customer_date",
    customer: "Wong",
    item: "Booqit",
    variant: "Queen",
    skus: ["B1201S-Q"],
    customerDelivery: null,
    goodsMustArrive: null,
    issueRef: null,
    toBuy: null,
    readyStock: null,
    onPo: null,
    ownerName: "Siew Hong",
  }),
  ...(withSetup
    ? [
        row({
          state: "no_production_days",
          customer: "Tan",
          item: "Chelsea L-Shape",
          variant: null,
          category: "sofa",
          skus: ["5539-1B(LHF)"],
          supplier: "Ohana",
          supplierId: "s-ohana",
          goodsMustArrive: null,
          issueRef: null,
          toBuy: null,
          readyStock: null,
          onPo: null,
        }),
      ]
    : []),
];

/* ── Card 02-B — the parent grain the Register draws ─────────────────────────
 *
 * One order row per seeded leaf order, plus the walk's own stories: a fully
 * Ordered order across TWO documents, a numbered-but-unsent PO with blank
 * Status, and a fully Ready-Stock-covered order that stays visible. Real
 * repository supplier names throughout.
 */
const CITIES: Array<[string, string]> = [
  ["Petaling Jaya", "Selangor"],
  ["Klang", "Selangor"],
  ["Kuala Lumpur", "Kuala Lumpur"],
  ["Shah Alam", "Selangor"],
  ["Subang Jaya", "Selangor"],
  ["Kajang", "Selangor"],
  ["Seremban", "Negeri Sembilan"],
  ["Ipoh", "Perak"],
];
const registerRows: SoBatchOrderRow[] = rows.map((r, i) => ({
  orderId: r.orderId,
  so: r.so,
  customer: r.customer,
  /* BOB's Partly order — 2 of 3 already on a sent PO. */
  status: r.skus.includes("PART-K") ? "partial" : "blank",
  proceededAt: `2026-08-${String(18 + (i % 8)).padStart(2, "0")}T08:15:00+08:00`,
  requestedDeliveryDate: r.customerDelivery,
  deliveryCity: CITIES[i % CITIES.length]![0],
  deliveryState: CITIES[i % CITIES.length]![1],
  pos: r.poNumbers.map((poId) => ({
    poId,
    status: "open" as const,
    supplierId: r.supplierId,
    supplierName: r.supplier,
    destinationId: KLANG,
    officialDeliveryDate: "2026-09-15",
    sentCurrentVersion: true,
  })),
  lines: r.lineIds.map((lineId, j) => ({
    orderLineId: lineId,
    sku: r.skus[j] ?? r.skus[0] ?? r.item,
    qty: r.skus.includes("PART-K") ? 3 : r.qtyNeeded,
    stockTaken: 0,
    item: r.item,
    variant: r.variant,
    category: r.category,
    pos: r.poNumbers.map((poId) => ({ poId, qty: 2 })),
  })),
  outstandingSuppliers: r.supplier ? [r.supplier] : [],
}));
registerRows.push(
  {
    orderId: "o90",
    so: 1450,
    customer: "LIM KUAN YANG",
    status: "ordered",
    proceededAt: "2026-08-14T08:15:00+08:00",
    requestedDeliveryDate: "2026-09-25",
    deliveryCity: "Cheras",
    deliveryState: "Kuala Lumpur",
    pos: [
      { poId: "PO-20260818-1042", status: "received", supplierId: "s-hooka",
        supplierName: "Nice Future", destinationId: KLANG,
        officialDeliveryDate: "2026-09-18", sentCurrentVersion: true },
      { poId: "PO-20260819-2210", status: "open", supplierId: "s-ohana",
        supplierName: "Ohana", destinationId: BULOH,
        officialDeliveryDate: "2026-09-22", sentCurrentVersion: true },
    ],
    lines: [
      { orderLineId: "l901", sku: "B1201S-K", qty: 1, stockTaken: 0,
        item: "Booqit", variant: "King", category: "mattress",
        pos: [{ poId: "PO-20260818-1042", qty: 1 }] },
      { orderLineId: "l902", sku: "H1401S-Q", qty: 1, stockTaken: 0,
        item: "Haven", variant: "Queen", category: "mattress",
        pos: [{ poId: "PO-20260819-2210", qty: 1 }] },
    ],
    outstandingSuppliers: [],
  },
  {
    orderId: "o91",
    so: 1447,
    customer: "NURUL AIN",
    status: "blank",
    proceededAt: "2026-08-25T08:15:00+08:00",
    requestedDeliveryDate: "2026-10-02",
    deliveryCity: "Puchong",
    deliveryState: "Selangor",
    /* Numbered this morning, PDF not yet confirmed sent — PO No shows,
       Status stays blank. */
    pos: [
      { poId: "PO-20260902-3301", status: "open", supplierId: "s-hooka",
        supplierName: "Nice Future", destinationId: KLANG,
        officialDeliveryDate: null, sentCurrentVersion: false },
    ],
    lines: [
      { orderLineId: "l911", sku: "B1201S-Q", qty: 2, stockTaken: 0,
        item: "Booqit", variant: "Queen", category: "mattress",
        pos: [{ poId: "PO-20260902-3301", qty: 2 }] },
    ],
    outstandingSuppliers: [],
  },
  {
    orderId: "o92",
    so: 1444,
    customer: "CHONG WEI",
    status: "blank",
    proceededAt: "2026-08-26T08:15:00+08:00",
    requestedDeliveryDate: "2026-09-12",
    deliveryCity: "Ampang",
    deliveryState: "Selangor",
    pos: [],
    /* Every unit already drawn from Ready Stock — visible, blank,
       unselectable, explained in the expansion. */
    lines: [
      { orderLineId: "l921", sku: "B1201S-K", qty: 1, stockTaken: 1,
        item: "Booqit", variant: "King", category: "mattress", pos: [] },
    ],
    outstandingSuppliers: [],
  },
);

const data: SoBatchPurchaseResponse = {
  today: "2026-09-02",
  rows,
  registerRows,
  destinations: [
    { id: KLANG, name: "Carres Klang", isDefault: true, active: true },
    { id: BULOH, name: "AL Sungai Buloh", isDefault: false, active: true },
  ],
  defaultDestinationId: KLANG,
  currentPoDuty: { userId: "u1", name: "Yee Jean" },
  actingPoDuty: null,
  poDutyNameUnavailable: false,
  poDutyUnavailable: false,
  mayIssue: true,
  procurementPartners: [],
  safetyDays: 14,
};

/**
 * The RETIRED rail, reconstructed so old and new can be looked at together —
 * the pre-02-C production rail: 200px, three sections, truncating labels,
 * `…time` wording, zero counts hidden.
 */
function OldRail() {
  return (
    <div className="flex w-[200px] shrink-0 flex-col gap-4 border-r border-kit-slate-5 bg-white px-3 py-3">
      <div className="text-meta font-semibold text-kit-red-9">
        RETIRED 2026-08-27 — the old rail, for comparison only
      </div>
      <RailGroup title="TO ORDER">
        <RailItem label="All not ordered" count={8} active={false} onClick={() => {}} testId="old-all" />
      </RailGroup>
      <RailGroup title="ORDER TIMING">
        <RailItem label="Can order early" count={2} active={false} onClick={() => {}} testId="old-early" />
        <RailItem label="14 safety days left" count={1} active={false} onClick={() => {}} testId="old-full" />
        <RailItem label="1–13 safety days left" count={2} active={false} onClick={() => {}} testId="old-low" />
        <RailItem label="No safety days left" count={1} active={false} onClick={() => {}} testId="old-none" />
        <RailItem label="Not enough production time" count={1} active={false} onClick={() => {}} testId="old-time" />
      </RailGroup>
      <RailGroup title="SETUP TO FIX">
        <RailItem label="Production time not set" count={1} active={false} onClick={() => {}} testId="old-setup" />
      </RailGroup>
    </div>
  );
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/operation?tab=purchase"]}>
        <div className="flex h-screen w-full">
          {showOld && <OldRail />}
          <div className="min-w-0 flex-1">
            <SoBatchRegister data={data} isLoading={false} onIssue={() => {}} />
          </div>
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
