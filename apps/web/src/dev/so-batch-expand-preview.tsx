/**
 * SO BATCH EXPAND · CHILD TABLE PREVIEW — DEV ONLY.
 *
 * The REAL `GoodsMiniTable`, called twice: once the way the Sales Orders
 * register calls it, once the way SO Batch Purchase now does. Side by side is
 * the only way to check the thing the 2026-08-15 ruling actually asks for —
 * that two pages cannot drift into two mini-tables that almost agree.
 *
 * A separate vite entry, not a route: `vite build` only emits `index.html`'s
 * graph, so this cannot reach production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import GoodsMiniTable, { type GoodsMiniLine } from "@/pages/operation/components/GoodsMiniTable";
import "@/index.css";

/** What Sales Orders passes — a truth register: no buying, no Covered by. */
const SALES_ORDER_LINES: GoodsMiniLine[] = [
  {
    key: "so-1",
    category: "Mattress",
    unitIds: ["U1-000-014"],
    unitAbsence: "Not allocated",
    deliverTo: ["Carres Klang"],
    deliverToAbsence: "Not recorded",
    sku: "L1201S-K",
    qty: 1,
    item: "Laveo",
    itemDetail: "King",
    selectable: true,
  },
];

/** What SO Batch Purchase passes — a buying page: Covered by, nothing minted. */
const BUYING_LINES: GoodsMiniLine[] = [
  {
    key: "buy-1",
    category: "Mattress",
    unitIds: [],
    unitAbsence: "Not allocated",
    coveredBy: ["PO-20260820-4827"],
    coveredByAbsence: "Not ordered yet",
    deliverTo: ["Carres Klang"],
    deliverToAbsence: "Not chosen",
    sku: "L1201S-K",
    qty: 1,
    item: "Laveo",
    itemDetail: "King",
    selectable: false,
  },
];

/** A matched set: one ROW, three module codes — what the row cannot say. */
const SET_LINES: GoodsMiniLine[] = [
  ["5539-1B(LHF)", 1],
  ["5539-CNR", 2],
  ["5539-2A(RHF)", 1],
].map(([sku, qty]) => ({
  key: `set-${sku}`,
  category: "Sofa",
  unitIds: [],
  unitAbsence: "Not allocated",
  coveredBy: [],
  coveredByAbsence: "Not ordered yet",
  deliverTo: ["Carres Klang ×3", "AL Sungai Buloh ×1"],
  deliverToAbsence: "Not chosen",
  sku: sku as string,
  qty: qty as number,
  item: "Chelsea L-Shape",
  itemDetail: "3 Modules",
  selectable: false,
})) as GoodsMiniLine[];

/**
 * ⭐ WHAT THE EXPAND USED TO BE — re-created here, and ONLY here.
 *
 * The owner asked to SEE the difference, and a description of a deleted layout
 * is not seeing it. This is the old hand-drawn box, byte-for-byte, so the two
 * can be looked at together. It lives in a dev-only entry and ships nowhere.
 */
function OldExpand() {
  const fact = (label: string, value: string) => (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <span className="text-label uppercase tracking-wide text-kit-slate-11">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className="grid gap-x-10 gap-y-1 bg-white px-4 py-3 text-body sm:grid-cols-2">
      <div className="flex flex-col">
        {fact("REQUIRED", "1")}
        {fact("FROM STOCK", "0")}
        {fact("ON OPEN PO", "1  PO-20260820-4827")}
        {fact("BUY", "0")}
      </div>
      <div className="flex flex-col">
        {fact("Source", "SO-1203 · L1201S-K")}
        {fact("Required for", "Tue, 4 Aug")}
        {fact("Goods must arrive", "Fri, 24 Jul")}
        {fact("Deliver to", "Carres Klang")}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="flex flex-col gap-6 bg-kit-canvas p-4">
      <section className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-wide text-kit-red-11">
          BEFORE — SO Batch Purchase drew its own box
        </span>
        <div className="rounded-control border border-dashed border-kit-red-9 bg-white">
          <OldExpand />
        </div>
      </section>
      <section className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-wide text-kit-slate-11">
          Sales Orders register — the sibling
        </span>
        <GoodsMiniTable label="Goods on SO-1303" lines={SALES_ORDER_LINES} />
      </section>
      <section className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-wide text-kit-slate-11">
          AFTER — SO Batch Purchase, one part already on a purchase order
        </span>
        <GoodsMiniTable label="Goods on SO-1203" lines={BUYING_LINES} showCoveredBy />
      </section>
      <section className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-wide text-kit-slate-11">
          AFTER — a matched set the row can only name
        </span>
        <GoodsMiniTable label="Goods on SO-1330" lines={SET_LINES} showCoveredBy />
      </section>
    </div>
  </StrictMode>,
);
