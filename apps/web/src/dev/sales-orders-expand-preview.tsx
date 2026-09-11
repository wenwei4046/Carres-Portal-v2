import { createRoot } from "react-dom/client";
import GoodsMiniTable, { type GoodsMiniLine } from "@/pages/operation/components/GoodsMiniTable";
import "@/index.css";

const line: GoodsMiniLine = {
  key: "mattress", category: "Mattress",
  unitIds: [60, 61, 68, 69, 70, 71, 72, 73, 76, 77, 78, 79, 80, 81].map(n => `U1-000-${String(n).padStart(3, "0")}`),
  unitAbsence: "Not allocated", deliverTo: ["Carres Klang"], deliverToAbsence: "?",
  sku: "H1401F-K", qty: 1, item: "H1401F ? King", selectable: false,
};

createRoot(document.getElementById("root")!).render(
  <main className="min-h-screen bg-white p-8" style={{ fontFamily: "Inter, sans-serif" }}>
    <h1 className="mb-2 text-2xl font-semibold">Sales Orders</h1>
    <p className="mb-6 text-sm text-slate-500">Expanded layout preview ? sample data</p>
    <div className="w-full min-w-0">
      <div className="grid grid-cols-4 border border-slate-200 bg-white px-7 py-3 text-[13px]">
        <span className="font-semibold text-blue-600">? SO-1340</span><span>Fri, 4 Sep</span><span>TestWhole</span><span>Penang Hill, Penang</span>
      </div>
      <GoodsMiniTable salesOrderLayout label="Goods on SO-1340" lines={[line]} />
      <div className="mt-4 grid grid-cols-4 border border-slate-200 bg-white px-7 py-3 text-[13px]">
        <span className="font-semibold text-blue-600">? SO-1357</span><span>Thu, 10 Sep</span><span>Ali Bin Abu</span><span>Shah Alam, Selangor</span>
      </div>
      <GoodsMiniTable salesOrderLayout label="Goods on SO-1357" lines={[
        { ...line, key: "bed", category: "Bedframe", unitIds: [], sku: "TRION-Q", item: "Trion ? Queen", itemDetail: "gap KIV ? Divan Full Cover" },
        { ...line, key: "service", category: "Service", unitIds: [], unitAbsence: "?", deliverTo: [], sku: "DELIVERY", item: "Delivery fee" },
      ]} />
    </div>
  </main>,
);
