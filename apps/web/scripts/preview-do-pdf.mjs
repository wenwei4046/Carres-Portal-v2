// Preview harness — render the reskinned Delivery Order with the same
// sample order the SO preview uses, so the two documents can be compared
// side by side. Run from apps/web:
//   ../../node_modules/.bin/tsx --tsconfig tsconfig.app.json scripts/preview-do-pdf.mjs
// Output: scripts/DO-preview.pdf

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { pdf } from "@react-pdf/renderer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { DoTemplate } = await import("../src/lib/pdf/do-template.tsx");
const { registerNotoSansSC } = await import("../src/lib/pdf/fonts/noto.ts");

registerNotoSansSC();

const data = {
  do_number: "DO-240826",
  issue_date: "2026-08-23",
  order_id: "preview",
  order_code: "SO-1256",
  customer: {
    name: "Jaikrishen Singh",
    address: "No 23 Jalan SS 3/62, Taman Universiti, 47300 Petaling Jaya, Selangor",
    phone: "+60 16-215 7293",
    emergency: "Mona Doal · +60 17-339 8639 (Spouse)",
  },
  dealer: { name: "Carres", contact: null },
  partner: { name: "NETS" },
  lines: [
    {
      sku: "BOAAT-1A(LHF)",
      description: "Sofa Boaat 1A (LHF) — CG-004 (KN390-4) · Wood · Seat 32 · Leg 2\"",
      qty: 1,
      unit: "pc",
      line_total: 0,
      category: "SOFA",
      source_po: ["PO-2051"],
      attrs: { fabric_name: "CG-004" },
      unit_codes: ["id-aab120451"],
    },
    {
      sku: "BOAAT-1A(RHF)",
      description: "Sofa Boaat 1A (RHF) — CG-004 (KN390-4) · Wood · Seat 32 · Leg 2\"",
      qty: 1,
      unit: "pc",
      line_total: 0,
      category: "SOFA",
      source_po: ["PO-2051"],
      attrs: { fabric_name: "CG-004" },
      unit_codes: ["id-aab120452"],
    },
    {
      sku: "LUNA-L(RHF)",
      description: "Sofa Luna Chaise (RHF) — BF-201 · Fabric · Seat 30",
      qty: 1,
      unit: "pc",
      line_total: 0,
      category: "SOFA",
      source_po: ["PO-2052"],
      attrs: { fabric_name: "BF-201" },
      unit_codes: ["id-aab120453"],
    },
    {
      sku: "LUNA-2A(LHF)",
      description: "Sofa Luna 2A (LHF) — BF-201 · Fabric · Seat 30",
      qty: 1,
      unit: "pc",
      line_total: 0,
      category: "SOFA",
      source_po: ["PO-2052"],
      attrs: { fabric_name: "BF-201" },
      unit_codes: ["id-aab120454"],
    },
  ],
  currency: "MYR",
  delivery_date: "2026-08-24",
  delivery: { floor: 3, has_lift: false },
  pod: null,
};

const element = React.createElement(DoTemplate, data);
const blob = await pdf(element).toBlob();
const buffer = Buffer.from(await blob.arrayBuffer());
const out = path.join(__dirname, "DO-preview.pdf");
writeFileSync(out, buffer);
console.log(`PDF written: ${out} (${buffer.length} bytes)`);
