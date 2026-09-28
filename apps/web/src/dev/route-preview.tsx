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
 *   · GOODS / DELIVERY / PAYMENT / LOAN group bands, 72px between groups
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
  paymentApprovals: [],
  loans: [{ id: "L1", label: "sofa", qty: 1, returned: false }],
  cases: [],
  claims: [],
};

/* `?s=` picks the state to photograph (Scope A, owner rulings 2026-09-25/26):
 *   (none)      the four-line order above
 *   waiting     a change request waiting for approval — the banner
 *   unreadable  Delivery and Payments could not be read
 *   paid        nothing owed
 */
/* `?s=journey` — a two-leg Delivery Journey, delivered: the shape measured on
 * production as SO-1362. `{braces}` stand where a real record would print. */
const lane = {
  trip: 0,
  plate: null,
  transfer: false,
  legStop: null,
  partnerName: null,
  confirmedDate: null,
  confirmedTime: null,
  deliveryOrder: null,
  tripGroups: null,
  attempts: [],
  handoverEvents: [],
  photos: [],
};
const journey: SalesOrderRouteInput = {
  ...input,
  order: { ...input.order, so: 1362, customerName: "{customer}", placedAt: "2026-09-13", deliveryDate: "2026-09-17" },
  lineLabels: { "MATT-K": "{goods line}" },
  allocation: {
    ...input.allocation,
    lines: [input.allocation.lines[0]!],
    totals: { committedQty: 1, reservedQty: 1, soldQty: 0, outstandingQty: 0 },
  },
  purchaseOrders: [],
  money: { known: true, outstanding: 0 },
  loans: [],
  delivery: {
    logistics: null,
    booking: null,
    attempts: [],
    scopes: [
      {
        ...lane,
        leg: 1,
        plate: "Leg 1 · Carres Klang → JB transit warehouse",
        transfer: true,
        legStop: "JB transit warehouse",
        partnerName: "NETS",
        confirmedDate: "2026-09-15",
        confirmedTime: "10 AM to 1 PM",
        deliveryOrder: { id: "do-1", number: "DO-130926-0842" },
        attempts: [{ result: "delivered", reasonKey: null, recordedAt: "2026-09-15T04:00:00Z" }],
      },
      {
        ...lane,
        leg: 2,
        plate: "Leg 2 · JB transit warehouse → customer",
        partnerName: "AL",
        confirmedDate: "2026-09-17",
        confirmedTime: "2 PM to 5 PM",
        deliveryOrder: { id: "do-2", number: "DO-130926-3223" },
        attempts: [{ result: "delivered", reasonKey: null, recordedAt: "2026-09-17T08:00:00Z" }],
      },
    ],
  },
};

/* `?s=goods` — the goods chain read from its owners: a delayed Purchase Order,
 * a partly received one, a line Ready Stock can fill, and a line whose
 * Purchasing read failed. `{braces}` stand where a real record would print. */
const source = {
  supplierName: "{Supplier}",
  sent: true,
  qty: 1,
  issuedAt: "2026-09-03",
  poDeliveryDate: "2026-09-18",
  expectedArrival: null,
  confirmed: false,
  dayBeforeCheckOpen: false,
  receivedQty: 0,
  pendingQty: 1,
  damagedOrWrongQty: 0,
  latestGrn: null,
};
const goods: SalesOrderRouteInput = {
  ...input,
  order: { ...input.order, so: 1319, customerName: "{customer}" },
  loans: [],
  money: { known: true, outstanding: 1249 },
  goods: [
    {
      lineId: "L1",
      sku: "B1201S",
      label: "{goods line 1}",
      qty: 1,
      sources: [
        {
          ...source,
          poId: "{PO No}",
          expectedArrival: { date: "2026-09-28", change: "delayed", reason: "Production delay" },
          dayBeforeCheckOpen: true,
        },
      ],
      onOrderQty: 1,
      readyQty: 0,
      unitCodes: [],
      uncoveredQty: 0,
      shortBecause: "not-received",
      readyStockQty: 0,
    },
    {
      lineId: "L2",
      sku: "PILLOW",
      label: "{goods line 2}",
      qty: 5,
      sources: [
        {
          ...source,
          poId: "{PO No 2}",
          qty: 5,
          confirmed: true,
          receivedQty: 3,
          pendingQty: 2,
          damagedOrWrongQty: 1,
          latestGrn: { id: "r2", number: "{GRN No}", receivedAt: "2026-09-19" },
        },
      ],
      onOrderQty: 2,
      readyQty: 3,
      unitCodes: ["{Unit ID}", "{Unit ID}", "{Unit ID}"],
      uncoveredQty: 0,
      shortBecause: "not-received",
      readyStockQty: 0,
    },
    {
      lineId: "L3",
      sku: "SOFA-L",
      label: "{goods line 3}",
      qty: 1,
      sources: [],
      onOrderQty: 0,
      readyQty: 0,
      unitCodes: [],
      uncoveredQty: 1,
      shortBecause: "not-ordered",
      readyStockQty: 2,
    },
    {
      lineId: "L4",
      sku: "MATT-K",
      label: "{goods line 4}",
      qty: 1,
      sources: [],
      onOrderQty: 0,
      readyQty: 0,
      unitCodes: [],
      uncoveredQty: 1,
      shortBecause: "not-ordered",
      readyStockQty: 0,
    },
  ],
  unreadable: { purchasing: ["L4"] },
};

/* `?s=unsent` — the goods scenario with its first Purchase Order issued but not
 * yet marked sent: PURCHASING owes the send, and the supplier is not asked. */
const unsent: SalesOrderRouteInput = {
  ...goods,
  goods: goods.goods!.map((line, i) =>
    i === 0 ? { ...line, sources: line.sources.map((src) => ({ ...src, sent: false })) } : line,
  ),
};

const scenario = new URLSearchParams(window.location.search).get("s");
const seeded: SalesOrderRouteInput =
  scenario === "journey"
    ? journey
    : scenario === "goods"
      ? goods
    : scenario === "unsent"
      ? unsent
    : scenario === "waiting"
    ? { ...input, amendment: {
        status: "submitted",
        submittedAt: "2026-09-23",
        submittedBy: "Shasha",
        approver: "Jess",
        changes: [
          { what: "Customer Requested Delivery Date", before: "2026-09-24", after: "2026-10-05" },
          { what: "Latex Pillow", before: "Qty 4", after: "Qty 2" },
        ],
      } }
    : scenario === "unreadable"
      ? { ...input, unreadable: { delivery: true, payments: true } }
      : scenario === "paid"
        ? { ...input, money: { known: true, outstanding: 0 } }
        : input;

const map = resolveSalesOrderRoute(seeded);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MemoryRouter>
      <div className="min-h-screen bg-kit-slate-3 px-4 py-4">
        <SalesOrderRoute
          route={map}
          owners={{
            purchasing: { userId: "u-yj", name: "Yu Jun", email: "yujun@carres.my" },
            receiving: { userId: "u-sh", name: "Shasha", email: "shasha@carres.my" },
            delivery: { userId: "u-sh", name: "Shasha", email: "shasha@carres.my" },
            payment: { userId: "u-sh", name: "Shasha", email: "shasha@carres.my" },
          }}
          onRetry={() => undefined}
        />
      </div>
    </MemoryRouter>
  </StrictMode>,
);
