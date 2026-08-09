// Preview harness — the family-chrome Invoice, both modes:
//   INV-preview.pdf     TAX INVOICE (SST split + guarantee block)
//   INV-request-preview.pdf  PAYMENT REQUEST (imported order's statement)
// Run from apps/web:
//   ../../node_modules/.bin/tsx --tsconfig tsconfig.app.json scripts/preview-invoice-pdf.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { pdf } from "@react-pdf/renderer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { InvoiceTemplate } = await import("../src/lib/pdf/invoice-template.tsx");
const { registerNotoSansSC } = await import("../src/lib/pdf/fonts/noto.ts");

registerNotoSansSC();

async function render(data, name) {
  const element = React.createElement(InvoiceTemplate, data);
  const blob = await pdf(element).toBlob();
  const buffer = Buffer.from(await blob.arrayBuffer());
  const out = path.join(__dirname, name);
  writeFileSync(out, buffer);
  console.log(`PDF written: ${out} (${buffer.length} bytes)`);
}

const base = {
  issue_date: "2026-08-24",
  order_id: "preview",
  order_code: "SO-1256",
  customer: {
    name: "Jaikrishen Singh",
    address: "No 23 Jalan SS 3/62, Taman Universiti, 47300 Petaling Jaya, Selangor",
    phone: "+60 16-215 7293",
  },
  dealer: { name: "Carres", contact: null },
  lines: [
    { sku: "BOAAT-1A(LHF)", description: "Sofa Boaat 1A (LHF)", qty: 1, unit: "pc",
      unit_price: 1495, line_total: 1495, category: "SOFA" },
    { sku: "BOAAT-1A(RHF)", description: "Sofa Boaat 1A (RHF)", qty: 1, unit: "pc",
      unit_price: 1495, line_total: 1395, category: "SOFA", discount: 100 },
    { sku: "B1201F-K", description: "Forte Mattress — King", qty: 2, unit: "pc",
      unit_price: 2890, line_total: 5780, category: "MATTRESS" },
    { sku: "SVC-DELIVERY", description: "Delivery fee", qty: 1, unit: "pc",
      unit_price: 250, line_total: 250, category: "SERVICE" },
  ],
  currency: "MYR",
};

// TAX INVOICE — SST inclusive split: 8,920 → 8,259.26 + 660.74
await render({
  ...base,
  invoice_no: "INV-240826-0001",
  subtotal: 8259.26,
  tax_amount: 660.74,
  total: 8920,
  guarantees: [
    {
      label: "Forte Mattress 10-Year Guarantee",
      guarantee_id: "GRTX482913",
      covers: "Forte Mattress — King (id-kfg204817, id-kfg204818)",
      coverage_years: 10,
      remedy: "replace",
      starts_on: "24 Aug 26",
      expires_on: "24 Aug 36",
      terms_text: "Sagging beyond 3cm, coil failure and workmanship defects. Excludes stains and burns.",
    },
  ],
}, "INV-preview.pdf");

// PAYMENT REQUEST — no SST rows, Total due band
await render({
  ...base,
  doc_title: "PAYMENT REQUEST",
  invoice_no: "PR-240826-0001",
  subtotal: 8920,
  tax_amount: 0,
  total: 5180,
}, "INV-request-preview.pdf");
