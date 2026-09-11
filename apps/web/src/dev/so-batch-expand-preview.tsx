/**
 * SO BATCH EXPAND · THE THREE CONNECTED SECTIONS — DEV ONLY.
 *
 * The REAL components — `ConnectedSections`, `GoodsMiniTable`,
 * `ReadyStockDisclosure` + `ReadyStockTable`, `PoDetailsTable` — drawn the way
 * an expanded Sales Order row draws them, with a stand-in parent row above and
 * a second Sales Order below it, so the two things the drawing has to prove can
 * actually be LOOKED AT:
 *
 *   · the connector starts under the parent and ENDS in a curve at the last
 *     section — it never reaches the next Sales Order;
 *   · a line fourteen purchase orders touch keeps a COMPACT item row, and the
 *     fourteen references are all still on the page, one per row, in the
 *     section that is about documents.
 *
 * ── WHY A PREVIEW AND NOT THE LIVE SCREEN ───────────────────────────────────
 *
 * The live surface is behind a login this session cannot type a password into,
 * and the fourteen-PO row the owner photographed cannot be conjured on demand
 * without CREATING purchase orders against a real supplier. So the LAYOUT is
 * walked here, on the real components, at the widths the report named; the
 * business journey is proved by the tests and by the owner's own walk.
 *
 * A separate vite entry, not a route: `vite build` only emits `index.html`'s
 * graph, so this cannot reach production.
 */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import GoodsMiniTable, { type GoodsMiniLine } from "@/pages/operation/components/GoodsMiniTable";
import ReadyStockTable, {
  ReadyStockDisclosure,
  type ReadyStockTableRow,
} from "@/pages/operation/components/ReadyStockTable";
import ConnectedSections, {
  CONNECT_AT_DISCLOSURE,
  CONNECT_AT_TABLE_HEADER,
  type ConnectedSection,
} from "@/pages/operation/components/ConnectedSections";
import PoDetailsTable, { type PoDetailRow } from "@/pages/operation/so-batch/PoDetailsTable";
import "@/index.css";

/** What Sales Orders passes — a truth register: no buying, no On PO. */
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

/**
 * THE ROW FROM THE REPORT. Qty 1, and fourteen purchase orders naming the same
 * item line — the case that filled the screen. `On PO` states 14 and the row
 * stays one line tall.
 */
const FOURTEEN = Array.from({ length: 14 }, (_, i) => `PO-2026090${(i % 9) + 1}-${4665 + i}`);

const BUYING_LINES: GoodsMiniLine[] = [
  {
    key: "buy-1",
    category: "Mattress",
    unitIds: [],
    unitAbsence: "—",
    fromStock: 1,
    onPoQty: 2,
    onPoAbsence: "Not ordered yet",
    toBuy: 1,
    deliverTo: [],
    deliverToAbsence: "Not chosen",
    supplier: "Nice Future",
    supplierAbsence: "—",
    sku: "L1201S-K",
    qty: 4,
    item: "Laveo",
    itemDetail: "King · Fabric 3",
    selectable: true,
  },
  {
    key: "buy-2",
    category: "Mattress",
    unitIds: [],
    unitAbsence: "—",
    onPoQty: 14,
    onPoAbsence: "Not ordered yet",
    toBuy: 1,
    deliverTo: [],
    deliverToAbsence: "Not chosen",
    supplier: "Ohana",
    supplierAbsence: "—",
    sku: "JAGER-SS",
    qty: 1,
    item: "Jager",
    itemDetail: "Super Single · Fabric 1",
    selectable: true,
  },
  {
    key: "buy-3",
    category: "Mattress protector",
    unitIds: [],
    unitAbsence: "—",
    onPoQty: 0,
    onPoAbsence: "Not ordered yet",
    toBuy: null,
    deliverTo: [],
    deliverToAbsence: "—",
    supplierAbsence: "—",
    sku: "MP-K",
    qty: 1,
    item: "Microfiber Waterproof",
    itemDetail: "King",
    selectable: false,
  },
];

const PO_ROWS: PoDetailRow[] = [
  {
    key: "buy-1::PO-20260820-4827::U1-000-078",
    poNo: "PO-20260820-4827",
    unitId: "U1-000-078",
    unitAbsence: "Not allocated",
    associationRecorded: true,
    sku: "L1201S-K",
    item: "Laveo",
    itemDetail: "King · Fabric 3",
    qty: 1,
    deliverTo: "Carres Klang",
    supplier: "Nice Future",
    poDeliveryDate: "Thu, 17 Sep",
  },
  {
    key: "buy-1::PO-20260820-4827::U1-000-079",
    poNo: "PO-20260820-4827",
    unitId: "U1-000-079",
    unitAbsence: "Not allocated",
    /* The Unit is on this Sales Order; WHICH item line it answers was never
       recorded. An unresolved association stays inspectable and says so. */
    associationRecorded: false,
    sku: "L1201S-K",
    item: "Laveo",
    itemDetail: "King · Fabric 3",
    qty: 1,
    deliverTo: "Carres Klang",
    supplier: "Nice Future",
    poDeliveryDate: "Thu, 17 Sep",
  },
  ...FOURTEEN.map((poNo) => ({
    key: `buy-2::${poNo}::rest`,
    poNo,
    unitId: null,
    unitAbsence: "Not allocated",
    associationRecorded: true,
    sku: "JAGER-SS",
    item: "Jager",
    itemDetail: "Super Single · Fabric 1",
    qty: 1,
    deliverTo: "Carres Klang",
    supplier: "Ohana",
    poDeliveryDate: null,
  })),
];

const STOCK_ROWS: ReadyStockTableRow[] = [
  {
    itemId: "1",
    unitCode: "id-vyf051985",
    identityScope: "unit",
    sku: "JAGER-SS",
    condition: "new",
    siteName: "Carres Klang",
    ownership: "carres_owned",
    supplier: null,
    qty: 1,
  },
  {
    itemId: "2",
    unitCode: "QTY-MP-K",
    identityScope: "quantity",
    sku: "MP-K",
    condition: null,
    siteName: "Carres Klang",
    ownership: "carres_owned",
    supplier: null,
    qty: 893,
  },
];

/** A stand-in for the register's own row, so the line has a parent to start under. */
function ParentRow({ so, open }: { so: number; open: boolean }) {
  return (
    <div className="flex items-center gap-2 border-b border-base-200 bg-white px-2 py-2 text-body">
      <input type="checkbox" readOnly checked={false} aria-label={`Select SO-${so}`} />
      <span aria-hidden className="text-kit-slate-11">{open ? "▾" : "▸"}</span>
      <span className="font-mono font-medium text-kit-blue-11">{`SO-${so}`}</span>
      <span className="text-kit-slate-11">Tan Wei Ming</span>
      <span className="ml-auto text-kit-blue-11">{open ? "14 POs" : "PO-20260820-4827"}</span>
    </div>
  );
}

function Expansion() {
  const [poOpen, setPoOpen] = useState(true);
  const [stockOpen, setStockOpen] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set(["buy-1"]));

  const sections: ConnectedSection[] = [
    {
      key: "goods",
      connectAt: CONNECT_AT_TABLE_HEADER,
      node: (
        <GoodsMiniTable
          label="Goods on SO-1203"
          lines={BUYING_LINES}
          identityFirst
          showFromStock
          showOnPo
          showToBuy
          showSupplier
          showUnitId={false}
          onOpenPoDetails={() => setPoOpen(true)}
          selection={{
            selectedKeys: ticked,
            onToggle: (k) =>
              setTicked((prev) => {
                const next = new Set(prev);
                if (next.has(k)) next.delete(k);
                else next.add(k);
                return next;
              }),
          }}
        />
      ),
    },
    {
      key: "ready-stock",
      connectAt: CONNECT_AT_DISCLOSURE,
      node: (
        <ReadyStockDisclosure
          testId="preview-ready-stock"
          open={stockOpen}
          onToggle={() => setStockOpen((v) => !v)}
          className=""
        >
          <ReadyStockTable label="Ready Stock for SO-1203" rows={STOCK_ROWS} />
        </ReadyStockDisclosure>
      ),
    },
    {
      key: "po-details",
      connectAt: CONNECT_AT_DISCLOSURE,
      node: (
        <ReadyStockDisclosure
          testId="preview-po-details"
          open={poOpen}
          onToggle={() => setPoOpen((v) => !v)}
          title="Purchase order details"
          className=""
        >
          <PoDetailsTable label="Purchase order details for SO-1203" rows={PO_ROWS} />
        </ReadyStockDisclosure>
      ),
    },
  ];

  return <ConnectedSections sections={sections} testId="preview-sections" />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="flex flex-col gap-6 bg-kit-canvas p-4">
      <section className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-wide text-kit-slate-11">
          Sales Orders register — the sibling, untouched
        </span>
        <GoodsMiniTable label="Goods on SO-1303" lines={SALES_ORDER_LINES} />
      </section>

      <section className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-wide text-kit-slate-11">
          SO Batch Purchase — an expanded row: demand · shelf · record
        </span>
        <div className="border border-base-200 bg-white">
          <ParentRow so={1203} open />
          <Expansion />
          {/* The next Sales Order. The line must not reach it. */}
          <ParentRow so={1202} open={false} />
        </div>
      </section>
    </div>
  </StrictMode>,
);
