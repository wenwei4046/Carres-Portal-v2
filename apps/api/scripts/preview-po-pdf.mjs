// Throwaway script (Loo 2026-05-10) — render PO-2031's PDF locally so we can
// inspect the design without going through wrangler dev (whose Miniflare-3
// sandbox blocks yoga-layout's Wasm). Bypasses the route entirely and feeds
// real staging data into the same template the route would.
//
// Run: node scripts/preview-po-pdf.mjs
// Output: scripts/PO-2031.pdf

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { pdf } from "@react-pdf/renderer";

// vitest's node entry resolves the @react-pdf/renderer node build, so we get
// the working renderer here too. The route's renderPoPdf wrapper does the
// same thing — `pdf(element).toBlob().arrayBuffer()`.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Pre-compile the .tsx template via tsx loader so we can import directly.
const { PoTemplate } = await import("../src/lib/pdf/po-template.tsx");
const { registerNotoSansSC } = await import("../src/lib/pdf/fonts/noto.ts");

registerNotoSansSC();

// Real PO-2031 data pulled from staging (Loo's autotest run).
const data = {
  po_number: "PO-2031",
  issue_date: "2026-05-10",
  po_id: "PO-2031",
  supplier: {
    name: "Ohana",
    address: null,
    contact: null,
  },
  buyer: {
    name: "Carres Klang Warehouse",
    contact: "Address TBD — please update via Logistics -> Warehouses",
  },
  lines: [
    {
      sku: "bedframe:elwood:King",
      description: "King",
      qty: 2,
      unit: "pc",
      unit_price: 2290,
      line_total: 4580,
      // 0076 / 0077: cascade picker payload — bedframe Walnut + 14" gap.
      attrs: { color: "Walnut", gap: '14"' },
    },
  ],
  grand_total: 4580,
  currency: "MYR",
  terms: null,
};

const element = React.createElement(PoTemplate, data);
const blob = await pdf(element).toBlob();
const buffer = Buffer.from(await blob.arrayBuffer());
const out = path.join(__dirname, "PO-2031.pdf");
writeFileSync(out, buffer);
console.log(`PDF written: ${out} (${buffer.length} bytes)`);
