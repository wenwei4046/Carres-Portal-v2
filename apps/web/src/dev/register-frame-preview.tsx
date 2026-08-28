/**
 * REGISTER FRAME PREVIEW — DEV ONLY.
 *
 * Same contract as `so-batch-preview.tsx`: the REAL engine, the REAL
 * stylesheet, only the rows seeded instead of fetched. It exists to walk the
 * 2026-08-27 owner ruling — no outer frame around the Work Toolbar + grid +
 * status footer — without a login. A separate vite entry
 * (`register-frame-preview.html`), not a route: `vite build` only emits
 * `index.html`'s graph, so this cannot reach production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Plus } from "lucide-react";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import GoodsMiniTable, { type GoodsMiniLine } from "@/pages/operation/components/GoodsMiniTable";
import "@/index.css";

/* The two lines Jess circled on SO-1329 — the REAL GoodsMiniTable renders
   them here, so the one-face fix is walked on the same goods. */
const GOODS: GoodsMiniLine[] = [
  {
    key: "g1",
    category: "Mattress",
    unitIds: [],
    unitAbsence: "Not allocated",
    deliverTo: ["Kuala Lumpur"],
    deliverToAbsence: "Not applicable",
    sku: "H1401S-K",
    qty: 1,
    item: "H1401S · King",
    selectable: true,
  },
  {
    key: "g2",
    category: "Service",
    unitIds: [],
    unitAbsence: "—",
    deliverTo: [],
    deliverToAbsence: "Not applicable",
    sku: "dispose-mattress",
    qty: 1,
    item: "dispose mattress",
    selectable: false,
  },
];

type Row = {
  id: string;
  so: string;
  ordered: string;
  requested: string;
  customer: string;
};

const ROWS: Row[] = [
  { id: "1", so: "SO-1329", ordered: "Thu, 27 Aug", requested: "Sat, 26 Sep", customer: "Kimmy" },
  { id: "2", so: "SO-1328", ordered: "Thu, 27 Aug", requested: "Tue, 15 Sep", customer: "LIM KUAN YANG" },
  { id: "3", so: "SO-1327", ordered: "Wed, 26 Aug", requested: "Thu, 10 Sep", customer: "Umi Kalsom" },
  { id: "4", so: "SO-1326", ordered: "Wed, 26 Aug", requested: "Sat, 5 Sep", customer: "Chase NETS" },
  { id: "5", so: "SO-1325", ordered: "Tue, 25 Aug", requested: "Fri, 4 Sep", customer: "Tan Mei Ling" },
];

const COLUMNS: DataGridColumn<Row>[] = [
  { key: "so", label: "SO No", accessor: (r) => r.so, width: 110 },
  { key: "ordered", label: "Ordered", accessor: (r) => r.ordered, width: 150 },
  { key: "requested", label: "Requested Delivery Date", accessor: (r) => r.requested, width: 260 },
  { key: "customer", label: "Customer", accessor: (r) => r.customer, width: 240 },
];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="flex h-screen flex-col bg-white">
      {/* Stand-in for the 50px Destination Header — context only. */}
      <div className="flex h-[50px] shrink-0 items-center border-b border-base-200 px-4">
        <span className="text-page text-base-900">Sales Orders</span>
      </div>
      {/* The page's 8px outer gap, exactly as SalesOrdersRegister renders it. */}
      <div className="flex min-h-0 flex-1 flex-col p-2">
        <DataGrid<Row>
          appearance="reference"
          rows={ROWS}
          columns={COLUMNS}
          storageKey="dev.register-frame-preview"
          rowKey={(r) => r.id}
          exportName="Preview"
          searchPlaceholder="Search sales orders…"
          groupBanner={false}
          expandable={{
            renderExpansion: (r) => <GoodsMiniTable label={`Goods on ${r.so}`} lines={GOODS} />,
          }}
          toolbarStart={
            <button
              type="button"
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-kit-blue-9 px-3 text-meta font-semibold text-white hover:opacity-90"
            >
              <Plus size={14} strokeWidth={2.25} /> New Sales Order
            </button>
          }
          statusSummary={(rows) => <span>{rows.length} orders · Mattress 3 · Sofa 2</span>}
        />
      </div>
    </div>
  </StrictMode>,
);
