/**
 * WAREHOUSE SCHEDULE PREVIEW — DEV ONLY (walk aid for the owner-approved
 * 2026-09-14 Schedule card).
 *
 * Same contract as `warehouse-monitor-preview.tsx`: the REAL board, the REAL
 * card component and the REAL stylesheet, with only the projection's OUTPUT
 * supplied as a fixture. A separate vite entry — it cannot reach production,
 * and none of these names, numbers or dates exist in the ERP.
 *
 * It exists to make the measurements checkable: every state the card has to
 * render is on screen at once, so 36px rows, the 24px category slot, the four
 * progress states and a wrapping long name can be measured rather than
 * assumed.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import type { WarehouseScheduleCard } from "@carres/shared";
import { ScheduleBoard } from "@/pages/operation/WarehouseWorkspace";
import "@/index.css";

const DATES = [
  "2026-09-14",
  "2026-09-15",
  "2026-09-16",
  "2026-09-17",
  "2026-09-18",
  "2026-09-19",
];

let n = 0;
function card(over: Partial<WarehouseScheduleCard>): WarehouseScheduleCard {
  n += 1;
  return {
    id: `demo-${n}`,
    direction: "arrival",
    kind: "supplier-delivery",
    sourceId: `src-${n}`,
    sourceRef: "PO-2609-0001",
    soRef: null,
    doRef: null,
    partyName: "Demo Supplier",
    siteId: "demo-site",
    date: DATES[1]!,
    dateStatus: "expected",
    lines: [],
    driverConfirmedQty: null,
    logisticsName: "Demo Logistics",
    relatedRecords: [],
    openHref: "/operation?tab=warehouse-inbound",
    detailHref: "/operation/procurement/demo",
    overdue: false,
    ...over,
  };
}

let l = 0;
function line(over: Partial<WarehouseScheduleCard["lines"][number]>) {
  l += 1;
  return {
    id: `line-${l}`,
    categoryKey: "Mattress" as const,
    modelLabel: "Demo Model 180x200",
    plannedQty: 3,
    receivedQty: null,
    loadedQty: null,
    damagedQty: null,
    ...over,
  };
}

const CARDS: WarehouseScheduleCard[] = [
  /* Two records, same party, same date — two cards, never merged. */
  card({ date: DATES[1], sourceRef: "PO-2609-0001", lines: [line({})] }),
  card({
    date: DATES[1],
    sourceRef: "PO-2609-0002",
    lines: [line({ categoryKey: "Bedframe", receivedQty: 0, plannedQty: 2 })],
  }),
  /* The four progress states side by side. */
  card({
    date: DATES[2],
    dateStatus: "scheduled",
    sourceRef: "PO-2609-0003",
    lines: [
      line({ categoryKey: "Mattress", plannedQty: 3, receivedQty: null }),
      line({ categoryKey: "Bedframe", plannedQty: 2, receivedQty: 0 }),
      line({ categoryKey: "Sofa", plannedQty: 4, receivedQty: 2 }),
      line({ categoryKey: "Pillow", plannedQty: 6, receivedQty: 6 }),
    ],
  }),
  /* Damage inside the received count, plus a linked source record. */
  card({
    date: DATES[2],
    kind: "customer-return",
    sourceRef: "PO-2609-0004",
    lines: [line({ plannedQty: 3, receivedQty: 3, damagedQty: 1 })],
    relatedRecords: [{ id: "r", ref: "DO-2609-019", href: "#" }],
    overdue: true,
  }),
  /* A long party name and a long reference — both must WRAP. */
  card({
    date: DATES[3],
    partyName: "Demo Furniture Manufacturing Sendirian Berhad (Klang Branch)",
    sourceRef: "PO-2609-0005-REV-B-REISSUE",
    lines: [line({ categoryKey: "Mattress protector", plannedQty: 12 })],
  }),
  /* Five categories in ONE scope — five lines, no cap, no `+N more`. */
  card({
    date: DATES[4],
    direction: "pickup",
    kind: "customer_delivery_pickup",
    soRef: "SO-1362",
    doRef: "DO-2609-019",
    partyName: "Demo Customer",
    driverConfirmedQty: 4,
    lines: (["Mattress", "Bedframe", "Sofa", "Pillow", "Topper"] as const).map((c) =>
      line({ categoryKey: c, plannedQty: 1, loadedQty: 1 }),
    ),
  }),
  /* No agreed date, no door — neutral, and nothing invented. */
  card({
    date: DATES[5],
    dateStatus: null,
    sourceRef: "PO-2609-0006",
    openHref: null,
    detailHref: null,
    lines: [line({ categoryKey: "Accessory", plannedQty: 1 })],
  }),
];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <div className="flex h-screen flex-col bg-kit-canvas">
        <ScheduleBoard
          dates={DATES}
          cards={CARDS}
          direction="arrival"
          feedFailed={false}
        />
      </div>
    </BrowserRouter>
  </StrictMode>,
);
