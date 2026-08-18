/**
 * ORDER ROUTE · MULTI-ITEM PREVIEW — DEV ONLY.
 *
 * The same contract as `stage3-preview.tsx`: the REAL component, the REAL
 * stylesheet, the REAL resolver — only the input is seeded instead of
 * fetched. It exists to prove the multi-item layout law (owner ruling
 * 2026-08-17) on a four-line order without a production login:
 *
 *   · one LANE per goods line, chains converging on the line's ONE STOCK
 *   · caption plates carry the product names — nothing sits on a connector
 *   · GOODS / DELIVERY / MONEY / LOAN group bands, 72px between groups
 *   · the load fit never drops below 0.7×
 *
 * A separate vite entry (`route-preview.html`), not a route: `vite build`
 * only emits `index.html`'s graph, so this cannot reach production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { resolveSalesOrderRoute, type SalesOrderRouteInput } from "@carres/shared";
import SalesOrderRoute from "@/pages/operation/SalesOrderRoute";
import "@/index.css";

/* Four lines, four different truths:
 *   MATT-K   from shelf stock — the lane is plate + STOCK alone, complete
 *   B1201S   PO issued, supplier CURRENT
 *   SOFA-L   no Purchase Order yet — amber; the goods CURRENT already sits on
 *            B1201S's supplier (first unfinished position wins), so this lane
 *            waits its turn, exactly as the law says
 *   PILLOW   split across TWO POs — one plate spanning two chains, one STOCK
 */
const input: SalesOrderRouteInput = {
  order: {
    id: "order-preview",
    so: 1321,
    customerName: "JAGER-SS",
    placedAt: "2026-08-12",
    deliveryDate: "2026-09-24",
    deliveredAt: null,
  },
  lineLabels: {
    "MATT-K": "M1401F-K · King",
    B1201S: "B1201S · King",
    "SOFA-L": "Chelsea L-Shape Sofa",
    PILLOW: "Latex Pillow",
  },
  lineDestinations: {},
  cancelledLines: [],
  allocation: {
    orderId: "order-preview",
    soRef: "SO-1321",
    lines: [
      {
        sku: "MATT-K",
        committedQty: 1,
        reservedUnits: [
          {
            id: "u-1",
            unitCode: "UNT-9001",
            sku: "MATT-K",
            status: "reserved",
            condition: "new",
            warehouseId: "wh-1",
            poNo: null,
            qty: 1,
            dateIn: "2026-08-10",
          },
        ],
        soldUnits: [],
        reservedQty: 1,
        soldQty: 0,
        outstandingQty: 0,
      },
      {
        sku: "B1201S",
        committedQty: 1,
        reservedUnits: [],
        soldUnits: [],
        reservedQty: 0,
        soldQty: 0,
        outstandingQty: 1,
      },
      {
        sku: "SOFA-L",
        committedQty: 1,
        reservedUnits: [],
        soldUnits: [],
        reservedQty: 0,
        soldQty: 0,
        outstandingQty: 1,
      },
      {
        sku: "PILLOW",
        committedQty: 4,
        reservedUnits: [],
        soldUnits: [],
        reservedQty: 0,
        soldQty: 0,
        outstandingQty: 4,
      },
    ],
    unmatchedUnits: [],
    totals: { committedQty: 7, reservedQty: 1, soldQty: 0, outstandingQty: 6 },
  },
  purchaseOrders: [
    {
      id: "PO-2048",
      issuedAt: "2026-08-13",
      expectedReadyDate: null,
      lines: [{ sku: "B1201S", qty: 1, receivedQty: 0 }],
    },
    {
      id: "PO-2051",
      issuedAt: "2026-08-13",
      expectedReadyDate: "2026-09-02",
      lines: [{ sku: "PILLOW", qty: 2, receivedQty: 0 }],
    },
    {
      id: "PO-2052",
      issuedAt: "2026-08-14",
      expectedReadyDate: null,
      lines: [{ sku: "PILLOW", qty: 2, receivedQty: 0 }],
    },
  ],
  receivingRecords: [],
  delivery: { logistics: null, booking: null, attempts: [] },
  money: { known: true, outstanding: 1500 },
  financeExceptions: [],
  loans: [{ id: "L1", label: "sofa", qty: 1, returned: false }],
  cases: [],
  claims: [],
};

const map = resolveSalesOrderRoute(input);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MemoryRouter>
      <div className="min-h-screen bg-white p-6">
        <SalesOrderRoute
          route={map}
          owners={{
            purchasing: { userId: "u-yj", name: "Yu Jun", email: "yujun@carres.my" },
            receiving: { userId: "u-sh", name: "Shasha", email: "shasha@carres.my" },
          }}
        />
      </div>
    </MemoryRouter>
  </StrictMode>,
);
