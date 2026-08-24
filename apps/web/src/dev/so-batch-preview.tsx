/**
 * REVIEW PURCHASE ORDERS · 50 / 50 PREVIEW — DEV ONLY.
 *
 * The same contract as `route-preview.tsx`: the REAL component, the REAL
 * stylesheet, only the input seeded instead of fetched. It exists to walk the
 * responsive law (CARD-2026-08-22-purchasing-02 closure §10) at the approved
 * widths:
 *
 *   ≥ 1130px   50% decision work + 50% the official PDF
 *   < 1130px   stacked, work first, the document keeping a readable height
 *
 * ── WHY A PREVIEW AND NOT THE LIVE SCREEN ───────────────────────────────────
 *
 * The live surface is behind a login AND behind `Issue PO`. A walk that reached
 * the right-hand PDF would have CREATED real purchase orders and committed
 * Carres to a supplier, so the layout is walked here and the business journey
 * is proved by its tests and by the owner's own walk.
 *
 * A separate vite entry (`so-batch-preview.html`), not a route: `vite build`
 * only emits `index.html`'s graph, so this cannot reach production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { PurchasingDestination, SoBatchDocument } from "@carres/shared";
import SoBatchIssueWorkspace from "@/pages/operation/so-batch/SoBatchIssueWorkspace";
import "@/index.css";

const KLANG: PurchasingDestination = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Carres Klang",
  isDefault: true,
  active: true,
};
const BULOH: PurchasingDestination = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "AL Sungai Buloh",
  isDefault: false,
  active: true,
};

/* Two documents: one ordinary mattress consolidation across two customers, and
   one sofa set going to the showroom — enough that `1 of 2`, the navigation and
   a multi-SKU cost block are all on screen. */
const DOCUMENTS: SoBatchDocument[] = [
  {
    key: `s-hooka::${KLANG.id}::mattress::`,
    supplierId: "s-hooka",
    supplierName: "Hooka",
    destinationId: KLANG.id,
    category: "mattress",
    orderId: null,
    qty: 4,
    supplierKind: "own_logistics",
    lines: [
      {
        demandId: "build::o1::b1",
        orderId: "o1",
        so: 1318,
        item: "Booqit",
        variant: "King",
        skus: ["B1201S-K"],
        qty: 3,
        goodsMustArrive: "2026-09-02",
        issueRef: { proposalKey: "s-hooka::mattress", buildKey: "b1" },
        costs: [{ sku: "B1201S-K", unitCost: 880 }],
      },
      {
        demandId: "build::o2::b2",
        orderId: "o2",
        so: 1321,
        item: "Booqit",
        variant: "Queen",
        skus: ["B1201S-Q"],
        qty: 1,
        goodsMustArrive: "2026-09-04",
        issueRef: { proposalKey: "s-hooka::mattress", buildKey: "b2" },
        costs: [{ sku: "B1201S-Q", unitCost: 760 }],
      },
    ],
  },
  {
    key: `s-ohana::${BULOH.id}::sofa::o3`,
    supplierId: "s-ohana",
    supplierName: "Ohana",
    destinationId: BULOH.id,
    category: "sofa",
    orderId: "o3",
    qty: 1,
    supplierKind: "factory_pickup",
    lines: [
      {
        demandId: "build::o3::b3",
        orderId: "o3",
        so: 1330,
        item: "Chelsea L-Shape",
        variant: "3 Modules",
        skus: ["5539-1B(LHF)", "5539-CNR", "5539-2A(RHF)"],
        qty: 1,
        goodsMustArrive: "2026-09-18",
        issueRef: { proposalKey: "s-ohana::sofa", buildKey: "b3" },
        costs: [
          { sku: "5539-1B(LHF)", unitCost: 1200 },
          { sku: "5539-CNR", unitCost: 900 },
          { sku: "5539-2A(RHF)", unitCost: 1150 },
        ],
      },
    ],
  },
];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MemoryRouter>
      <div className="flex h-screen flex-col">
        <SoBatchIssueWorkspace
          documents={DOCUMENTS}
          destinations={[KLANG, BULOH]}
          procurementPartners={[
            { id: "p-nets", name: "Chase NETS" },
            { id: "p-al", name: "AL Logistics" },
          ]}
          onBack={() => {}}
          onDone={() => {}}
        />
      </div>
    </MemoryRouter>
  </StrictMode>,
);
