/**
 * SO BATCH PURCHASE · THE APPROVED LISTING AND STOCK PICKER — DEV ONLY.
 *
 * The REAL `SoBatchRegister`, the REAL `GoodsMiniTable`, the REAL
 * `ReadyStockTable` and the REAL kit stylesheet, with the two server reads
 * seeded instead of fetched. It exists so the owner-approved acceptance walk
 * (Purchasing §9.1 · UI §6.8–6.9) can actually be LOOKED AT:
 *
 *   · the twelve parent columns in the owner's exact order, at 1440 / 1180 /
 *     820 / 390 and at 200% zoom;
 *   · the goods expansion's seven columns, its Ready Stock cell and the two
 *     counts;
 *   · the stock picker under one item, its six columns, and the connector that
 *     runs from under the disclosure arrow to the frame's top border;
 *   · the whole selection journey — choose, save, change, remove, cancel.
 *
 * ── WHY A PREVIEW AND NOT THE LIVE SCREEN ───────────────────────────────────
 *
 * The live surface is behind a login this session cannot type a password into,
 * and the journey it would walk WRITES: `Choose Ready Unit` commits real Units
 * to a real customer's order and `Issue PO` commits Carres to a supplier. So
 * the LAYOUT and the INTERACTION are walked here, on the real components; the
 * business rules are proved by the tests — including the reservation and
 * replacement doors, run as SQL against a real Postgres — and the authenticated
 * production walk stays owed.
 *
 * A separate vite entry, not a route: `vite build` emits `index.html`'s graph
 * and nothing else, so this cannot reach production.
 */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  PurchaseDemandRow,
  ReadyStockResponse,
  ReadyStockUnit,
  SoBatchOrderRow,
  SoBatchPurchaseResponse,
} from "@carres/shared";
import { soBatchAction } from "@carres/shared";
import SoBatchRegister from "@/pages/operation/so-batch/SoBatchRegister";
import "@/index.css";

const KLANG = "11111111-1111-4111-8111-111111111111";
const BULOH = "22222222-2222-4222-8222-222222222222";

/* ── the seeded reads ────────────────────────────────────────────────────── */

const LINE_1 = "aaaaaaaa-0000-4000-8000-000000000001";
const LINE_2 = "aaaaaaaa-0000-4000-8000-000000000002";
const LINE_3 = "aaaaaaaa-0000-4000-8000-000000000003";

function leaf(over: Partial<PurchaseDemandRow> & { id: string; orderId: string }): PurchaseDemandRow {
  const base: PurchaseDemandRow = {
    state: "safety_days_low",
    lineIds: [LINE_1],
    so: 1318,
    customer: "LIM KUAN YANG",
    customerDelivery: "2026-10-28",
    orderBy: "2026-09-19",
    safetyDaysLeft: 6,
    item: "Booqit",
    variant: "King",
    category: "mattress",
    skus: ["B1201S-K"],
    supplierId: "s-hooka",
    supplier: "Nice Furniture Sdn Bhd",
    qtyNeeded: 2,
    readyStock: 2,
    takenFromStock: 0,
    onPo: 0,
    fullyOnPo: false,
    poNumbers: [],
    toBuy: 2,
    goodsMustArrive: "2026-10-08",
    issueRef: { proposalKey: "s-hooka::mattress", buildKey: "b1" },
    action: null,
    parts: [{ sku: "B1201S-K", qty: 2, unitCost: 1200 }],
    supplierKind: "own_logistics",
    ownerName: null,
    ownerDuty: null,
    ...over,
  };
  return {
    ...base,
    action: soBatchAction({
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

function order(over: Partial<SoBatchOrderRow> & { orderId: string }): SoBatchOrderRow {
  return {
    so: null,
    customer: null,
    status: "blank",
    proceededAt: null,
    requestedDeliveryDate: null,
    deliveryCity: null,
    deliveryState: null,
    pos: [],
    lines: [],
    outstandingSuppliers: [],
    ...over,
  };
}

const ORDERS: SoBatchOrderRow[] = [
  order({
    orderId: "o1",
    so: 1318,
    customer: "LIM KUAN YANG",
    proceededAt: "2026-09-11",
    requestedDeliveryDate: "2026-10-28",
    deliveryCity: "Cheras",
    deliveryState: "Kuala Lumpur",
    outstandingSuppliers: ["Nice Furniture Sdn Bhd"],
    lines: [
      { orderLineId: LINE_1, sku: "B1201S-K", qty: 2, stockTaken: 0, item: "Booqit",
        variant: "King · Fabric 3", category: "mattress", pos: [] },
      { orderLineId: LINE_2, sku: "L1201S-Q", qty: 1, stockTaken: 1, item: "Laveo bedframe",
        variant: "Queen · White", category: "bedframe", pos: [] },
    ],
  }),
  order({
    orderId: "o2",
    so: 1319,
    customer: "SITI NURHALIZA BINTI ABDULLAH",
    proceededAt: "2026-09-09",
    requestedDeliveryDate: "2027-01-06",
    deliveryCity: "Sungai Petani",
    deliveryState: "Kedah",
    status: "partial",
    outstandingSuppliers: ["Ohana Living"],
    pos: [
      { poId: "PO-20260930-4827", status: "open", supplierId: "s-ohana",
        supplierName: "Ohana Living", destinationId: KLANG,
        officialDeliveryDate: "2026-11-17", sentCurrentVersion: true },
    ],
    lines: [
      { orderLineId: LINE_3, sku: "S9-2A", qty: 3, stockTaken: 0, item: "Jager modular sofa",
        variant: "2 seater · Fabric 3", category: "sofa",
        pos: [{ poId: "PO-20260930-4827", poLineId: null, qty: 1, destinationId: KLANG }] },
    ],
  }),
  order({
    orderId: "o3",
    so: 1301,
    customer: "CARD-1",
    proceededAt: "2026-08-30",
    requestedDeliveryDate: null,
    deliveryCity: null,
    deliveryState: null,
    status: "ordered",
    pos: [
      { poId: "PO-20260820-1111", status: "received", supplierId: "s-hooka",
        supplierName: "Nice Furniture Sdn Bhd", destinationId: BULOH,
        officialDeliveryDate: "2026-09-10", sentCurrentVersion: true },
    ],
    lines: [
      { orderLineId: "l31", sku: "B1201S-K", qty: 1, stockTaken: 0, item: "Booqit",
        variant: "King", category: "mattress",
        pos: [{ poId: "PO-20260820-1111", poLineId: null, qty: 1, destinationId: BULOH }] },
    ],
  }),
];

const DATA: SoBatchPurchaseResponse = {
  today: "2026-09-18",
  rows: [
    leaf({ id: "build::o1::b1", orderId: "o1" }),
    leaf({
      id: "build::o2::b1", orderId: "o2", so: 1319, lineIds: [LINE_3],
      customer: "SITI NURHALIZA BINTI ABDULLAH", item: "Jager modular sofa",
      variant: "2 seater", category: "sofa", skus: ["S9-2A"],
      supplierId: "s-ohana", supplier: "Ohana Living", qtyNeeded: 3, toBuy: 2,
      safetyDaysLeft: 21, state: "can_order_early", orderBy: "2026-10-02",
      customerDelivery: "2027-01-06", goodsMustArrive: "2026-12-17",
      issueRef: { proposalKey: "s-ohana::sofa", buildKey: "b2" },
      parts: [{ sku: "S9-2A", qty: 2, unitCost: 2400 }],
    }),
  ],
  registerRows: ORDERS,
  destinations: [
    { id: KLANG, name: "Carres Klang", isDefault: true, active: true },
    { id: BULOH, name: "AL Sungai Buloh", isDefault: false, active: true },
  ],
  defaultDestinationId: KLANG,
  currentPoDuty: { userId: "u-yj", name: "Yu Jun" },
  actingPoDuty: null,
  poDutyNameUnavailable: false,
  poDutyUnavailable: false,
  mayIssue: true,
  procurementPartners: [],
  safetyDays: 14,
};

/* ── the Ready Stock read, seeded and WRITABLE in memory ─────────────────── */

function unit(over: Partial<ReadyStockUnit> & { itemId: string }): ReadyStockUnit {
  return {
    unitCode: "U1-000-001",
    identityScope: "unit",
    sku: "B1201S-K",
    condition: "new",
    siteName: "Carres Klang Warehouse",
    holderName: null,
    ownership: "carres_owned",
    supplier: "Nice Furniture Sdn Bhd",
    qty: 1,
    dateIn: "2026-08-01",
    poNo: "PO-20260820-4827",
    matchingLineIds: [LINE_1],
    lineIds: [LINE_1],
    reservedForLineId: null,
    blocked: null,
    ...over,
  };
}

const SHELF: ReadyStockUnit[] = [
  unit({ itemId: "bbbbbbbb-0000-4000-8000-000000000001" }),
  unit({ itemId: "bbbbbbbb-0000-4000-8000-000000000002", unitCode: "U1-000-002", condition: "exhibition", dateIn: "2026-08-14" }),
  unit({
    itemId: "bbbbbbbb-0000-4000-8000-000000000003", unitCode: "U1-000-065", condition: "new", dateIn: null, poNo: null,
    siteName: "AL Sungai Buloh", ownership: "supplier_consignment", supplier: "Dorsettloft",
  }),
  unit({
    itemId: "bbbbbbbb-0000-4000-8000-000000000004", unitCode: "QTY-000000001", identityScope: "quantity", qty: 893,
    dateIn: "2026-07-02", poNo: null, blocked: "counted_stock",
  }),
  unit({
    itemId: "bbbbbbbb-0000-4000-8000-000000000005", unitCode: "U1-000-311", sku: "L1201S-Q", dateIn: "2026-09-02",
    poNo: "PO-20260901-3311", matchingLineIds: [LINE_2], lineIds: [LINE_2],
    reservedForLineId: LINE_2,
  }),
];

/**
 * THE SEEDED DOORS. The read answers from the in-memory shelf; the save applies
 * the replacement to it, so `Choose Ready Unit` → `Change selection` →
 * `Save changes` → `Cancel` can all be walked end to end without a server and
 * without committing a real Unit to a real customer.
 */
const shelf = new Map(SHELF.map((u) => [u.itemId, { ...u }]));
const originalFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  if (url.includes("/ready-stock/save")) {
    const body = JSON.parse(String(init?.body ?? "{}")) as { orderLineId: string; itemIds: string[] };
    const wanted = new Set(body.itemIds);
    let added = 0;
    let released = 0;
    for (const u of shelf.values()) {
      if (u.reservedForLineId === body.orderLineId && !wanted.has(u.itemId)) {
        u.reservedForLineId = null;
        released += 1;
      } else if (wanted.has(u.itemId) && u.reservedForLineId !== body.orderLineId) {
        u.reservedForLineId = body.orderLineId;
        added += 1;
      }
    }
    const reserved = [...shelf.values()].filter((u) => u.reservedForLineId === body.orderLineId);
    return json({ reserved: reserved.length, added, released, reference: "SO-1318", units: [] });
  }
  if (url.includes("/ready-stock")) {
    const body: ReadyStockResponse = {
      orderId: "o1",
      so: 1318,
      reference: "SO-1318",
      lines: [],
      units: [...shelf.values()],
    };
    return json(body);
  }
  if (url.includes("/expansion") || url.includes("/operation/orders/")) {
    return json({ defaultDeliverTo: null, place: [], lines: [] });
  }
  return originalFetch(input as RequestInfo, init);
}) as typeof window.fetch;

function Preview() {
  const [issued, setIssued] = useState<string | null>(null);
  return (
    <div className="flex h-screen flex-col">
      {issued ? (
        <p className="bg-kit-blue-3 px-3 py-2 text-body" data-testid="preview-issued">
          {issued}
        </p>
      ) : null}
      <SoBatchRegister
        data={DATA}
        isLoading={false}
        onIssue={(s) => setIssued(`Issue PO would carry ${s.length} demand(s) — preview only`)}
      />
    </div>
  );
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/operation/purchase"]}>
        <Preview />
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
