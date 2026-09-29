// @vitest-environment node
/**
 * The A4 REPAIR ORDER on real paper (docs/pdf/DOCUMENT-KIT.md §3 rules 11–12,
 * §4; Purchasing MASTER §9.7 "THE DOCUMENT CARRIES THE REASON AND THE
 * PHOTOGRAPHS"). Rendered with the family renderer and read back with pdf.js.
 */
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import fs from "node:fs";
import { pdf } from "@react-pdf/renderer";
import type { RepairOrderPrintData } from "@carres/shared";
import { RepairOrderTemplate } from "./repair-order-template";
import { registerNotoSansSC } from "./fonts/noto";

const LOGO = new URL("../../../public/carres-logo.png", import.meta.url).pathname;

beforeAll(() => {
  registerNotoSansSC();
  vi.stubGlobal("__CARRES_LOGO_SRC__", LOGO);
});
afterAll(() => vi.unstubAllGlobals());

const sample = (photos: boolean): RepairOrderPrintData => ({
  ro_no: "RO260928-4827",
  version: 1,
  ro_doc_date: "2026-09-28",
  supplier: { name: "Sample repair supplier", address: "Lot 1, Jalan Industri, 42000 Klang", contact: "012-3456789" },
  claim_no: null,
  pickup: { name: "Carres Klang", address: "No 2, Jalan Klang, 41200 Klang" },
  return_to: { name: "PJ Showroom", address: "No 3, Jalan PJ, 46000 Petaling Jaya" },
  issued_by: "Recorded actor",
  units: [
    {
      unit_id: "U1-000-001", po_no: "PO260920-1111", category: "Sofa", item: "Sofa Lyra", item_spec: "3 seater · Grey",
      problem: "Damaged", problem_note: "The left arm fabric is torn along the seam.", repair_requirement: "Replace the left arm fabric",
      photos: photos ? [LOGO, LOGO] : [],
    },
    {
      unit_id: "U1-000-002", po_no: null, category: "Mattress", item: "Sonic", item_spec: "Queen",
      problem: "Missing component", problem_note: "One zip puller is missing.", repair_requirement: "Supply and fit the zip puller",
      photos: [],
    },
  ],
});

async function render(data: RepairOrderPrintData, name: string) {
  const stream = await pdf(RepairOrderTemplate(data)).toBuffer();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = new Uint8Array(Buffer.concat(chunks));
  if (process.env.RO_PREVIEW_DIR) fs.writeFileSync(`${process.env.RO_PREVIEW_DIR}/${name}.pdf`, bytes);
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

it("prints the document facts, the goods table and the Reason box — money-free, no dash", async () => {
  const pages = await render(sample(true), "ro-with-photos");
  const first = pages[0]!;
  const all = pages.join(" ");
  expect(first.replace(/\s/g, "")).toContain("REPAIRORDER");
  expect(first).toContain("RO260928-4827(1)");
  for (const word of ["RO Doc Date", "Mon, 28 Sep 2026", "Carres Klang", "PJ Showroom", "Sample repair supplier"])
    expect(first).toContain(word);
  // Block labels print in the family's caps.
  for (const label of ["SUPPLIER PICKUP LOCATION", "SUPPLIER RETURN LOCATION", "RO DETAILS", "REASON"])
    expect(first).toContain(label);
  // The goods table, in the approved order.
  expect(first.toUpperCase()).toMatch(/CATEGORY.*PO NO \/ UNIT ID.*ITEMS.*QTY.*PROBLEM.*REPAIR REQUIREMENT/);
  expect(first).toMatch(/Sofa.*PO260920-1111.*U1-000-001.*Sofa Lyra.*Damaged.*Replace the left arm fabric/);
  // PO No absent reads `Not recorded`, never a blank or a dash.
  expect(first).toMatch(/Not recorded.*U1-000-002/);
  // The Reason box prints the recorded sentence verbatim.
  expect(first).toContain("The left arm fabric is torn along the seam.");
  expect(first).toContain("One zip puller is missing.");
  // A direct repair has no Claim: the row is omitted, never a blank.
  expect(all.toUpperCase()).not.toContain("SUPPLIER CLAIM NO");
  // MONEY-FREE (DOCUMENT-KIT §4) and no dash anywhere (owner 2026-09-26/28).
  expect(all).not.toMatch(/\bRM\b|price|quotation|cost responsibility|carres pays|supplier pays/i);
  expect(all).not.toMatch(/[—–]/);
  expect(all).toContain("Page 1 of");
});

it("the damage photographs take a page of their own after the goods table, under the full header", async () => {
  const pages = await render(sample(true), "ro-with-photos");
  expect(pages).toHaveLength(2);
  expect(pages[0]).not.toContain("DAMAGE PHOTOS");
  expect(pages[1]!.toUpperCase()).toContain("DAMAGE PHOTOS · U1-000-001");
  expect(pages[1]).toContain("CARRES SDN. BHD.");
  expect(pages[1]).toContain("RO260928-4827(1)");
  // The Unit that has no photograph says so in one sentence.
  expect(pages[0]).toContain("No damage photos recorded for U1-000-002.");
});

it("with no photograph at all there is no photo page — one sentence says so", async () => {
  const pages = await render(sample(false), "ro-no-photos");
  expect(pages).toHaveLength(1);
  expect(pages[0]).toContain("No damage photos recorded.");
  expect(pages[0]).not.toContain("DAMAGE PHOTOS");
});

it("a Claim-origin repair prints its Supplier Claim No", async () => {
  const pages = await render({ ...sample(false), claim_no: "CLM260920-0042" }, "ro-claim");
  expect(pages[0]).toMatch(/Supplier Claim No.*CLM260920-0042/);
});

it("the template source can never print money (source scan)", () => {
  const src = fs.readFileSync(new URL("./repair-order-template.tsx", import.meta.url), "utf8");
  expect(src).not.toMatch(/\bprice\b|quotation|cost_responsibility|\bRM\b/i);
});
