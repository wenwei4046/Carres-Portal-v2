// Throwaway preview harness (Loo 2026-08-09) — render the reskinned Sales
// Order PDF locally with the owner's 2990 sample (SO-2607-019) recast as
// Carres data, so the design can be inspected without the API route.
//
// Run from apps/web:  ../../node_modules/.bin/tsx scripts/preview-so-pdf.mjs
// Output: scripts/SO-preview.pdf

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { pdf } from "@react-pdf/renderer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { SalesOrderTemplate } = await import("../src/lib/pdf/sales-order-template.tsx");
const { registerNotoSansSC } = await import("../src/lib/pdf/fonts/noto.ts");

registerNotoSansSC();

const data = {
  so_number: "SO-1256",
  issue_date: "2026-08-09",
  order_id: "preview",
  order_code: "SO-1256",
  status_label: "Confirmed", // contract field; the render drops it by law
  channel: "showroom",

  customer: {
    name: "Jaikrishen Singh",
    address: "No 23 Jalan SS 3/62, Taman Universiti, 47300 Petaling Jaya, Selangor",
    phone: "+60 16-215 7293",
    email: "jaikrishen@gmail.com",
    emergency: "Mona Doal · +60 17-339 8639 (Spouse)",
  },

  dealer: {
    name: "Carres",
    contact: null,
    address: null,
    outlet_name: "PJ Showroom",
    outlet_address: "Lot 1F-23, Jaya One, Petaling Jaya",
    salesperson_name: "Bernard",
    salesperson_phone: null,
  },

  delivery: {
    date: "2026-08-24",
    floor: 3,
    has_lift: false,
  },
  proceed_date: "2026-08-09",

  lines: [
    {
      sku: "BOAAT-1A(LHF)",
      description: "Sofa Boaat 1A (LHF)",
      qty: 1,
      unit_price: 1495,
      line_total: 1495,
      attrs: { sofa_spec: 'CG-004 (KN390-4) · Wood · Seat 32 · Leg 2"' },
      category: "SOFA",
      discount: null,
    },
    {
      sku: "BOAAT-1A(RHF)",
      description: "Sofa Boaat 1A (RHF)",
      qty: 1,
      unit_price: 1495,
      line_total: 1395,
      attrs: { sofa_spec: 'CG-004 (KN390-4) · Wood · Seat 32 · Leg 2"' },
      category: "SOFA",
      discount: 100,
    },
    {
      sku: "B1201F-K",
      description: "Forte Mattress — King",
      qty: 1,
      unit_price: 2890,
      line_total: 2890,
      attrs: { remark: "Deliver together with sofa" },
      category: "MATTRESS",
      discount: null,
    },
  ],

  addons: [
    {
      label: "Delivery fee",
      qty: 1,
      unit_price: 250,
      line_total: 250,
      attrs: null,
    },
  ],

  payments: [
    {
      label: "Instalment · 12 months",
      reference: null,
      amount: 3240,
      date: "2026-08-09",
      approval_code: "819884",
      collected_by: "Bernard",
    },
    {
      label: "Bank transfer",
      reference: null,
      amount: 500,
      date: "2026-08-09",
      approval_code: null,
      collected_by: "Shasha",
    },
  ],

  vouchers: [
    {
      code: "PWP-5423DYNG",
      redeemed: false,
      type: "pwp",
      reward_category: "bedframe",
      trigger_sku: "BOAAT-1A(LHF)",
    },
  ],

  subtotal: 6030,
  total: 6030,
  paid: 3740,
  balance_due: 2290,
  currency: "MYR",
  expected_deposit: 3240,

  signed: false,
  signature_url: null,
};

const element = React.createElement(SalesOrderTemplate, data);
const blob = await pdf(element).toBlob();
const buffer = Buffer.from(await blob.arrayBuffer());
const out = path.join(__dirname, "SO-preview.pdf");
writeFileSync(out, buffer);
console.log(`PDF written: ${out} (${buffer.length} bytes)`);
