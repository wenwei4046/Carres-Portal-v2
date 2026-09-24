// @vitest-environment node
/** Prove item/Unit placement on the actual paper, not only its input object. */
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import fs from "node:fs";
import { pdf } from "@react-pdf/renderer";
import { GrnTemplate } from "./grn-template";
import { registerNotoSansSC } from "./fonts/noto";
import type { GrnTemplateData } from "./types";

beforeAll(() => {
  registerNotoSansSC();
  vi.stubGlobal("__CARRES_LOGO_SRC__", new URL("../../../public/carres-logo.png", import.meta.url).pathname);
});
afterAll(() => vi.unstubAllGlobals());

const sample = (): GrnTemplateData => {
  const data: GrnTemplateData = {
    grn_no: "GRN-20260924-0042", grn_doc_date: "2026-09-24", status_label: "Valid",
    source: { po_number: "PO260924-0042", is_consignment: false },
    supplier: { name: "Sample supplier" }, supplier_do_no: "SAMPLE-42",
    deliver_to: "Carres Klang", goods_arrived_at: "Carres Klang", goods_received_on: "2026-09-23",
    lines: [
      { sku: "KING", description: "King mattress", category: "Mattress", order_qty: 4,
        received_qty: 3, damaged_qty: 1, wrong_item_qty: 0, pending_delivery_qty: 1,
        unit_results: [
          { unit_code: "U1-000-001", outcome_label: "Received" },
          { unit_code: "U1-000-004", outcome_label: "Received with issue · damaged" },
        ] },
      { sku: "QUEEN", description: "Queen mattress", category: "Mattress", order_qty: 1,
        received_qty: 1, damaged_qty: 0, wrong_item_qty: 0, pending_delivery_qty: 0,
        unit_results: [{ unit_code: "U1-000-005", outcome_label: "Received" }] },
    ],
    unit_results: [{ unit_code: "U1-000-099", outcome_label: "Not received" }],
    duty: { holder_name: "Recorded holder", cover_name: null, actor_name: "Recorded actor", authority_label: null, posted_on: "2026-09-24" },
  };
  return data;
};

async function render(data: GrnTemplateData) {
  const stream = await pdf(GrnTemplate(data)).toBuffer();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = new Uint8Array(Buffer.concat(chunks));
  if (process.env.GRN_PREVIEW_PATH) fs.writeFileSync(process.env.GRN_PREVIEW_PATH, bytes);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false }).promise;
  return doc;
}

it("prints each Unit beside its own item, preserving unresolved evidence separately", async () => {
  const doc = await render(sample());
  const words: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    words.push(...content.items.flatMap((item) => "str" in item ? [item.str] : []));
  }
  const text = words.join(" ").replace(/\s+/g, " ").replace(/(U\d+-\d{3}-)\s+(\d{3})/g, "$1$2");
  expect(text.replace(/\s/g, "")).toContain("GOODSRECEIVEDNOTE");
  expect(text).toMatch(/King mattress.*U1-000-001.*U1-000-004.*Queen mattress.*U1-000-005.*TOTAL.*UNIT RESULTS.*U1-000-099/);
  for (const code of ["U1-000-001", "U1-000-004", "U1-000-005", "U1-000-099"])
    expect(text.split(code)).toHaveLength(2);
  expect(text).toContain("Supplier Deliver To");
  expect(text).toContain("Goods Received Date");
  expect(text).toContain("Time not recorded");
  expect(text).not.toContain("Goods received on");
  const content = await (await doc.getPage(1)).getTextContent();
  const items = content.items.filter((item) => "str" in item);
  const prefix = items.find((item) => item.str === "U1-000-");
  const suffix = items.find((item) => item.str === "001");
  const boldHeader = items.find((item) => item.str === "CARRES SDN. BHD.");
  expect(prefix).toBeDefined();
  expect(suffix).toBeDefined();
  expect(suffix!.fontName).toBe(boldHeader!.fontName);
  expect(suffix!.fontName).not.toBe(prefix!.fontName);
  await doc.destroy();
});


it("repeats the complete letterhead on continuation pages and keeps instruction apart from arrival", async () => {
  const data = sample();
  data.deliver_to = "AL Sungai Buloh";
  data.goods_arrived_at = "Carres Klang";
  data.lines = Array.from({ length: 40 }, (_, index) => ({ ...data.lines[0], sku: `KING-${index}`, unit_results: [] }));
  const doc = await render(data);
  expect(doc.numPages).toBeGreaterThan(1);
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const text = content.items.flatMap((item) => "str" in item ? [item.str] : []).join(" ").replace(/\s+/g, " ");
    expect(text).toContain("CARRES SDN. BHD.");
    expect(text).toContain("GRN-20260924-0042");
    expect(text).toContain("59200 Kuala Lumpur, Wilayah Persekutuan KL.");
    expect(text).toContain(`Page ${n} of ${doc.numPages}`);
    if (n === 1) {
      expect(text).toContain("AL Sungai Buloh");
      expect(text).toContain("Carres Klang");
      const items = content.items.filter((item) => "str" in item);
      const supplier = items.find((item) => item.str === "Supplier Deliver To");
      const arrival = items.find((item) => item.str === "Goods arrived at");
      expect(supplier).toBeDefined();
      expect(arrival).toBeDefined();
      expect(arrival!.transform[4]).toBeGreaterThan(supplier!.transform[4] + 150);
    }
  }
  await doc.destroy();
});

it("keeps zero-only exception quantities out of the table while stating their absence", async () => {
  const data = sample();
  data.lines = [{ ...data.lines[1], unit_results: [] }];
  data.unit_results = [];
  const doc = await render(data);
  const content = await (await doc.getPage(1)).getTextContent();
  const text = content.items.flatMap((item) => "str" in item ? [item.str] : []).join(" ").replace(/\s+/g, " ");
  const heading = text.slice(text.indexOf("DESCRIPTION"), text.indexOf("Queen mattress"));
  expect(heading).toContain("ORDER QTY");
  expect(heading).toContain("RECEIVED QTY");
  expect(heading).not.toMatch(/DAMAGED|WRONG|PENDING/);
  expect(text).toContain("Damaged Qty 0 · Wrong Item Qty 0 · Pending Delivery Qty 0");
  await doc.destroy();
});
