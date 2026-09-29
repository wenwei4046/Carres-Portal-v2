/**
 * CHANGE DELIVER TO PREVIEW — DEV ONLY (Purchasing MASTER §5.4, built
 * 2026-09-29). The REAL form inside the PO page's edit pane chrome; the save
 * is answered in the browser and nothing leaves it. A separate vite entry, so
 * it cannot reach production.
 *
 * ⭐ THE FIXTURE IS THE MEASURED PRODUCTION PO `PO-20260903-4316` (Ohana, V1,
 * Deliver To Ohana) on 2026-09-29: its seven lines, their Unit IDs and the five
 * governed destinations by their real ids. Nothing is invented.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { X } from "lucide-react";
import ChangeDeliverToForm from "@/pages/operation/purchase-orders/ChangeDeliverToForm";
import type { operationPoListRow } from "@/lib/queries";
import "@/index.css";

const DESTINATIONS = [
  { id: "2f181917-f4e1-42b2-9e25-d7ee6785424a", name: "Carres Klang" },
  { id: "de206ba9-ef85-4e08-b630-c95a4bfc32f1", name: "Ohana" },
  { id: "82e0d541-285a-4f60-acf5-4f1d1b9e0922", name: "Hookka Industries" },
  { id: "818b420c-27f9-4707-a516-b91a6e03f343", name: "AL Sungai Buloh" },
  { id: "84bb35f6-4ac2-428a-a39b-f9c528a12900", name: "HOUZS" },
];
const LINES: Array<[string, string, number, string, string]> = [
  ["e4c2677d-c240-432f-936b-0451668b242f", "CODY-K", 1, "Cody", "King"],
  ["21b0f357-6417-48d1-a6c0-a90fbbd18f3a", "CODY-Q", 1, "Cody", "Queen"],
  ["ededac4a-068c-4010-bce3-1fc65c348ec4", "FENRIR-K", 2, "Fenrir", "King"],
  ["570cc230-d0f3-45ef-a525-f3f061bf7d85", "FENRIR-Q", 3, "Fenrir", "Queen"],
  ["c73d973f-6bb1-4a6a-b0e7-e42931df175c", "JAGER-SS", 1, "Jager", "Super Single"],
  ["4933e104-a816-4295-a57b-967209ef856c", "TRION-K", 2, "Trion", "King"],
  ["4858015c-2f25-4014-b0d1-a4c2749ce6fb", "TRION-Q", 1, "Trion", "Queen"],
];
const UNITS: Array<[string, string]> = [
  ["U1-000-024", "21b0f357-6417-48d1-a6c0-a90fbbd18f3a"],
  ["U1-000-025", "570cc230-d0f3-45ef-a525-f3f061bf7d85"],
  ["U1-000-026", "570cc230-d0f3-45ef-a525-f3f061bf7d85"],
  ["U1-000-027", "570cc230-d0f3-45ef-a525-f3f061bf7d85"],
  ["U1-000-028", "4933e104-a816-4295-a57b-967209ef856c"],
  ["U1-000-029", "4933e104-a816-4295-a57b-967209ef856c"],
  ["U1-000-030", "4858015c-2f25-4014-b0d1-a4c2749ce6fb"],
  ["U1-000-031", "ededac4a-068c-4010-bce3-1fc65c348ec4"],
  ["U1-000-032", "ededac4a-068c-4010-bce3-1fc65c348ec4"],
  ["U1-000-033", "c73d973f-6bb1-4a6a-b0e7-e42931df175c"],
  ["U1-000-034", "e4c2677d-c240-432f-936b-0451668b242f"],
];

const po = {
  id: "PO-20260903-4316",
  supplier_id: "00000000-0000-0000-0000-0000000000e1",
  warehouse_id: "",
  destination_id: "de206ba9-ef85-4e08-b630-c95a4bfc32f1",
  status: "open",
  sup_status: "pending",
  so: null,
  so_refs: null,
  eta_date: null,
  version: 1,
  placed_at: "2026-09-03T06:41:02Z",
  purchase_order_lines: LINES.map(([id, sku, qty, model_name, size]) => ({
    id, sku, qty, received_qty: 0, identity_mode: "exact_unit", model_name, size, destination_id: null,
  })),
} as unknown as operationPoListRow;

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/change-deliver-to")) {
    return new Response(JSON.stringify({ ok: true, result: { version: 2 } }), { headers: { "Content-Type": "application/json" } });
  }
  return realFetch(input, init);
};

const qc = new QueryClient();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <div className="min-h-screen bg-kit-canvas p-4">
        <section className="mx-auto max-w-[640px] min-w-0 border border-kit-slate-5 bg-white p-4">
          <div className="mb-3 flex items-center justify-between border-b border-kit-slate-5 pb-3">
            <div>
              <h2 className="text-body font-semibold">Change Deliver To</h2>
              <p className="text-meta text-kit-slate-11">Check the official document beside these fields before you finish.</p>
            </div>
            <button type="button" aria-label="Close document work"><X size={16} /></button>
          </div>
          <ChangeDeliverToForm
            po={po}
            supplierName="Ohana"
            destinations={DESTINATIONS}
            activeDestinations={DESTINATIONS}
            units={UNITS.map(([unit_code, po_line_id]) => ({ unit_code, po_line_id, status: "incoming" }))}
            onSaved={() => alert("Saved")}
            onCancel={() => undefined}
          />
        </section>
      </div>
    </QueryClientProvider>
  </StrictMode>,
);
