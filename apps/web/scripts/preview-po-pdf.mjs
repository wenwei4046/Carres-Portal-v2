// Preview harness — render the family-chrome Purchase Order: a BULK mattress
// PO (several SOs, unit ids minted, TOTAL row). Run from apps/web:
//   ../../node_modules/.bin/tsx --tsconfig tsconfig.app.json scripts/preview-po-pdf.mjs
// Output: scripts/PO-preview.pdf

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { pdf } from "@react-pdf/renderer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { PoTemplate } = await import("../src/lib/pdf/po-template.tsx");
const { registerNotoSansSC } = await import("../src/lib/pdf/fonts/noto.ts");

registerNotoSansSC();


async function render(data, name) {
  const element = React.createElement(PoTemplate, data);
  const blob = await pdf(element).toBlob();
  const buffer = Buffer.from(await blob.arrayBuffer());
  const out = path.join(__dirname, name);
  writeFileSync(out, buffer);
  console.log(`PDF written: ${out} (${buffer.length} bytes)`);
}

const base = {
  issue_date: "2026-08-09",
  issued_by: "Shasha",
  terms: null,
};

// 1 · MATTRESS — bulk, several SOs, grouped by model, TOTAL row
await render({
  ...base,
  po_number: "PO-2055",
  po_id: "PO-2055",
  supplier: { name: "Ohana", address: null, contact: "Ms Lee · +60 12-388 1122" },
  destination: {
    name: "Carres Klang Warehouse",
    address: "Lot 12, Jalan Sungai Pinang 4/2, 42100 Klang, Selangor",
  },
  delivery_instructions: "Call the warehouse 1 hour before arrival.",
  eta_date: "2026-08-12",
  so_refs: [1256, 1257, 1258],
  lines: [
    { sku: "B1201F-K", description: "Forte — King", qty: 2, unit: "pc", attrs: null,
      unit_codes: ["id-kfg204817", "id-kfg204818"] },
    { sku: "B1201F-Q", description: "Forte — Queen", qty: 1, unit: "pc", attrs: null,
      unit_codes: ["id-kfg204819"] },
    { sku: "B1305F-K", description: "Splendor — King", qty: 1, unit: "pc", attrs: null,
      unit_codes: ["id-kfg204820"] },
  ],
}, "PO-mattress-preview.pdf");

// 2 · BEDFRAME — one customer (§6.2), colour + gap attrs
await render({
  ...base,
  po_number: "PO-2056",
  po_id: "PO-2056",
  supplier: { name: "Carres Factory", address: null, contact: "En Farid · +60 13-220 8811" },
  destination: {
    name: "Carres Klang Warehouse",
    address: "Lot 12, Jalan Sungai Pinang 4/2, 42100 Klang, Selangor",
  },
  delivery_instructions: null,
  eta_date: "2026-08-14",
  so_refs: [1256],
  lines: [
    { sku: "ELWOOD-K", description: "Elwood Bedframe — King", qty: 1, unit: "pc",
      attrs: { color: "Walnut", gap: '14"' }, unit_codes: ["id-msh330121"] },
  ],
}, "PO-bedframe-preview.pdf");

// 3 · SOFA — one customer, module lines + the layout drawing
await render({
  ...base,
  po_number: "PO-2057",
  po_id: "PO-2057",
  supplier: { name: "Ohana", address: null, contact: "Ms Lee · +60 12-388 1122" },
  destination: {
    name: "Carres Klang Warehouse",
    address: "Lot 12, Jalan Sungai Pinang 4/2, 42100 Klang, Selangor",
  },
  delivery_instructions: null,
  eta_date: "2026-08-20",
  so_refs: [1256],
  lines: [
    { sku: "BOAAT-1A(LHF)", description: "Sofa Boaat 1A (LHF)", qty: 1, unit: "pc",
      attrs: { fabric_name: "CG-004" }, unit_codes: ["id-aab120451"] },
    { sku: "BOAAT-CNR", description: "Sofa Boaat Corner", qty: 1, unit: "pc",
      attrs: { fabric_name: "CG-004" }, unit_codes: ["id-aab120455"] },
    { sku: "BOAAT-L(RHF)", description: "Sofa Boaat Chaise (RHF)", qty: 1, unit: "pc",
      attrs: { fabric_name: "KN-390" }, unit_codes: ["id-aab120456"] },
  ],
}, "PO-sofa-preview.pdf");
