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

const data = {
  po_number: "PO-2055",
  po_id: "PO-2055",
  issue_date: "2026-08-09",
  supplier: { name: "Ohana", address: null, contact: "Ms Lee · +60 12-388 1122" },
  destination: {
    name: "Carres Klang Warehouse",
    address: "Lot 12, Jalan Sungai Pinang 4/2, 42100 Klang, Selangor",
  },
  delivery_instructions: "Call the warehouse 1 hour before arrival.",
  eta_date: "2026-08-12",
  so_refs: [1256, 1257, 1258],
  issued_by: "Shasha",
  lines: [
    {
      sku: "B1201F-K",
      description: "Forte — King",
      qty: 2,
      unit: "pc",
      attrs: null,
      unit_codes: ["id-kfg204817", "id-kfg204818"],
    },
    {
      sku: "B1305F-Q",
      description: "Splendor — Queen",
      qty: 1,
      unit: "pc",
      attrs: null,
      unit_codes: ["id-kfg204819"],
    },
    {
      sku: "ELWOOD-K",
      description: "Elwood Bedframe — King",
      qty: 1,
      unit: "pc",
      attrs: { color: "Walnut", gap: '14"' },
      unit_codes: ["id-msh330121"],
    },
  ],
  terms: null,
};

const element = React.createElement(PoTemplate, data);
const blob = await pdf(element).toBlob();
const buffer = Buffer.from(await blob.arrayBuffer());
const out = path.join(__dirname, "PO-preview.pdf");
writeFileSync(out, buffer);
console.log(`PDF written: ${out} (${buffer.length} bytes)`);
