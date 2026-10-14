/**
 * PO PAPER PREVIEW — DEV ONLY (owner review of PO-20260908-2503 V1,
 * 2026-09-30). Renders the REAL PO template through the app's own
 * `renderPoPdf` + `PdfPreview`, in the browser, with the CDN fonts production
 * uses. A separate vite entry, so it cannot reach production.
 *
 * ⭐ THE FIXTURE IS THE MEASURED PRODUCTION DOCUMENT: `purchasing_po_document`
 * for PO-20260908-2503 on 2026-09-30 plus the print-data route's paper facts
 * (8 working days, Nice Future is a collection supplier) and the Catalog model
 * name of ALL-AASNDA-K. Nothing is invented.
 */
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import PdfPreview from "@/components/kit/PdfPreview";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import "@/index.css";

const KLANG = { name: "Carres Klang", address: "Lot 6515, Batu 5 1/2, Jalan kapar, 42100 Klang." };
const DATA = {
  po_number: "PO-20260908-2503", po_id: "PO-20260908-2503", version: 1, issue_date: "2026-09-08",
  supplier: { name: "Nice Future", address: "5, WELLOYD INDUSTRIAL PARK,\nLORONG HAJI ABDUL MANAN/KU 8,\n41050 KLANG, SELANGOR", contact: null },
  destination: KLANG, delivery_instructions: null, eta_date: "2026-09-21",
  delivery_working_days: 8, delivery_method: "we_collect", issued_by: "principal",
  so_refs: [], terms: null,
  lines: [
    { sku: "ALL-AASNDA-K", description: "King", model_name: "all aasnda", qty: 1, unit: "pc", attrs: {}, sources: [],
      unit_codes: ["U1-000-082"], destination: KLANG, identity_mode: "exact_unit" },
  ],
} as unknown as PoTemplateData;

function App() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void renderPoPdf(DATA).then((blob) => setUrl(URL.createObjectURL(blob)));
  }, []);
  return (
    <div className="min-h-screen bg-kit-canvas p-4">
      <div className="mx-auto max-w-[900px] bg-white" data-testid="po-paper">
        {url ? <PdfPreview src={url} title="PO paper" /> : "Rendering"}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
