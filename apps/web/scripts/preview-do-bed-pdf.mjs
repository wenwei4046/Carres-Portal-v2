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
  do_number: "DO-240825",
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
      sku: "B1201F-K",
      description: "Forte Mattress — King",
      qty: 2,
      unit: "pc",
      line_total: 0,
      category: "MATTRESS",
      source_po: ["PO-2053"],
      unit_codes: ["id-kfg204817", "id-kfg204818"],
    },
    {
      sku: "ELWOOD-K",
      description: "Elwood Bedframe — King · Walnut · Gap 14\"",
      qty: 1,
      unit: "pc",
      line_total: 0,
      category: "BEDFRAME",
      source_po: ["PO-2054"],
      unit_codes: ["id-msh330121"],
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
const out = path.join(__dirname, "DO-bed-preview.pdf");
writeFileSync(out, buffer);
console.log(`PDF written: ${out} (${buffer.length} bytes)`);
