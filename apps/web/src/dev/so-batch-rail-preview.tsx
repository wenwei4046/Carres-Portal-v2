/**
 * SO BATCH PURCHASE · RAIL PREVIEW — DEV ONLY (Card 02-A).
 *
 * The REAL `SoBatchRegister`, the REAL stylesheet, only the payload seeded:
 * one row in every rail category, so the corrected TO ORDER · ORDER TIMING ·
 * SETUP TO FIX rail can be walked and photographed. The live screen is behind
 * a login, and live data cannot be made to hold all five timing bands at once.
 *
 * `?setup=0` removes the one `Production time not set` line, proving the whole
 * `SETUP TO FIX` section leaves the rail with it.
 *
 * `?old=1` draws, beside the real page, a static reconstruction of the RETIRED
 * six-state rail — the owner asked to SEE changes, and a description of a
 * deleted layout is not seeing it. It uses the same governed `RailGroup` /
 * `RailItem` kit, is labelled as retired, and ships nowhere.
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

const data: SoBatchPurchaseResponse = {
  today: "2026-09-02",
  rows,
  destinations: [
    { id: KLANG, name: "Carres Klang", isDefault: true, active: true },
    { id: BULOH, name: "AL Sungai Buloh", isDefault: false, active: true },
  ],
  defaultDestinationId: KLANG,
  currentPoDuty: { userId: "u1", name: "Yee Jean" },
  actingPoDuty: null,
  mayIssue: true,
  procurementPartners: [],
  safetyDays: 14,
};

/** The RETIRED rail, reconstructed so old and new can be looked at together. */
function OldRail() {
  return (
    <div className="flex w-[240px] shrink-0 flex-col gap-2 border-r border-kit-slate-5 bg-white p-3">
      <div className="text-meta font-semibold text-kit-red-9">
        RETIRED 2026-08-26 — the old rail, for comparison only
      </div>
      <RailGroup title="BUYING RECORDS">
        <RailItem label="Ready to buy" count={2} active={false} onClick={() => {}} testId="old-ready" />
        <RailItem label="Covered" count={1} active={false} onClick={() => {}} testId="old-covered" />
      </RailGroup>
      <RailGroup title="WORK TO DO">
        <RailItem label="No customer date" count={1} active={false} onClick={() => {}} testId="old-date" />
        <RailItem label="No SKU" active={false} onClick={() => {}} testId="old-sku" />
        <RailItem label="No supplier" active={false} onClick={() => {}} testId="old-supplier" />
        <RailItem label="No production days" count={1} active={false} onClick={() => {}} testId="old-days" />
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
