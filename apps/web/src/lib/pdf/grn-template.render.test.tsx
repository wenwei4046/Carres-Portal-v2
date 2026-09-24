// @vitest-environment node
/** Prove item/Unit placement on the actual paper, not only its input object. */
import { beforeAll, expect, it } from "vitest";
import fs from "node:fs";
import { pdf } from "@react-pdf/renderer";
import { GrnTemplate } from "./grn-template";
import { registerNotoSansSC } from "./fonts/noto";
import type { GrnTemplateData } from "./types";

beforeAll(() => registerNotoSansSC());

it("prints each Unit beside its own item, preserving unresolved evidence separately", async () => {
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
  const stream = await pdf(GrnTemplate(data)).toBuffer();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = new Uint8Array(Buffer.concat(chunks));
  if (process.env.GRN_PREVIEW_PATH) fs.writeFileSync(process.env.GRN_PREVIEW_PATH, bytes);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false }).promise;
  const words: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    words.push(...content.items.flatMap((item) => "str" in item ? [item.str] : []));
  }
  const text = words.join(" ").replace(/\s+/g, " ");
  expect(text.replace(/\s/g, "")).toContain("GOODSRECEIVEDNOTE");
  expect(text).toMatch(/King mattress.*U1-000-001.*U1-000-004.*Queen mattress.*U1-000-005.*TOTAL.*UNIT RESULTS.*U1-000-099/);
  for (const code of ["U1-000-001", "U1-000-004", "U1-000-005", "U1-000-099"])
    expect(text.split(code)).toHaveLength(2);
  expect(text).toContain("Supplier Deliver To");
  expect(text).toContain("Goods Received Date");
  expect(text).toContain("Time not recorded");
  expect(text).not.toContain("Goods received on");
  await doc.destroy();
});
