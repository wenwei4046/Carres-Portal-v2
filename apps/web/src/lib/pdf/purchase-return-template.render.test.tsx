// @vitest-environment node
/**
 * The A4 PURCHASE RETURN on real paper (docs/pdf/DOCUMENT-KIT.md §2–§4;
 * Purchasing MASTER §9.6 creation door, 2026-09-25). Rendered with the family
 * renderer and read back with pdf.js.
 */
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import fs from "node:fs";
import { pdf } from "@react-pdf/renderer";
import type { PurchaseReturnPrintData } from "@carres/shared";
import { PurchaseReturnTemplate } from "./purchase-return-template";
import { registerNotoSansSC } from "./fonts/noto";

const LOGO = new URL("../../../public/carres-logo.png", import.meta.url).pathname;

beforeAll(() => {
  registerNotoSansSC();
  vi.stubGlobal("__CARRES_LOGO_SRC__", LOGO);
});
afterAll(() => vi.unstubAllGlobals());

const sample = (over: Partial<PurchaseReturnPrintData> = {}): PurchaseReturnPrintData => ({
  pr_no: "PR-20260929-1001",
  pr_doc_date: "2026-09-29T02:00:00Z",
  supplier: { name: "Sample return supplier", contact: "012-3456789" },
  return_to: "Lot 9, Jalan Industri, 84000 Muar",
  claim_no: "SC-20260920-0042",
  grn_no: null,
  confirmed_pickup_date: "2026-10-01",
  issued_by: "Recorded actor",
  units: [
    { unit_id: "U1-000-001", po_no: "PO260920-1111", category: "Sofa", item: "Sofa Lyra", item_spec: "3 seater · Grey", pickup_location: "Carres Klang" },
    { unit_id: "U1-000-002", po_no: null, category: "Mattress", item: "Sonic", item_spec: "Queen", pickup_location: null },
  ],
  ...over,
});

async function render(data: PurchaseReturnPrintData, name: string) {
  const stream = await pdf(PurchaseReturnTemplate(data)).toBuffer();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = new Uint8Array(Buffer.concat(chunks));
  if (process.env.PR_PREVIEW_DIR) fs.writeFileSync(`${process.env.PR_PREVIEW_DIR}/${name}.pdf`, bytes);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(
      content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" ")
        .replace(/\s+/g, " ")
        .replace(/(U\d+-\d{3}-)\s+(\d{3})/g, "$1$2"),
    );
  }
  await doc.destroy();
  return pages;
}

it("prints the document facts and one tracked Unit per row — money-free, no dash", async () => {
  const pages = await render(sample(), "pr-issued");
  const first = pages[0]!;
  expect(pages).toHaveLength(1);
  expect(first.replace(/\s/g, "")).toContain("PURCHASERETURN");
  for (const word of ["PR-20260929-1001", "PR Doc Date", "Tue, 29 Sep 2026", "Sample return supplier", "Lot 9, Jalan Industri, 84000 Muar", "SC-20260920-0042", "Thu, 1 Oct 2026"])
    expect(first).toContain(word);
  for (const label of ["SUPPLIER", "RETURN TO", "PR DETAILS"]) expect(first).toContain(label);
  expect(first.toUpperCase()).toMatch(/CATEGORY.*PO NO \/ UNIT ID.*ITEMS.*QTY.*PICKUP LOCATION/);
  expect(first).toMatch(/Sofa.*PO260920-1111.*U1-000-001.*Sofa Lyra.*Carres Klang/);
  expect(first).toMatch(/Not recorded.*U1-000-002/);
  // A GRN it does not have is omitted, never a blank.
  expect(first).not.toContain("GRN No");
  expect(first).toMatch(/TOTAL 2/);
  expect(first).toContain("PR-20260929-1001 · Issued by Recorded actor");
  expect(first).not.toMatch(/\bRM\b|price|credit|refund|amount/i);
  expect(first).not.toMatch(/[—–]/);
});

it("while issuing it is the DRAFT it will be, never a number it does not have", async () => {
  const pages = await render(sample({ pr_no: null }), "pr-draft");
  expect(pages[0]).toContain("DRAFT");
  expect(pages[0]).toContain("Assigned when issued");
  expect(pages[0]).toContain("DRAFT · Not issued · Do not send to supplier.");
  expect(pages[0]).not.toMatch(/Issued by/);
});

it("the template source can never print money (source scan)", () => {
  const src = fs.readFileSync(new URL("./purchase-return-template.tsx", import.meta.url), "utf8");
  expect(src).not.toMatch(/\bprice\b|\bamount\b|\bRM\b|credit_note/i);
});
