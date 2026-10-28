// @vitest-environment node
import { expect, it } from "vitest";
import { pdf } from "@react-pdf/renderer";
import { RegisterListTemplate } from "./register-list-template";

it("keeps long identities inside each column without changing their characters", async () => {
  const headers = Array.from({ length: 15 }, (_, i) => `Column ${i + 1}`);
  const row = headers.map((_, i) => `DOC2609014827ABCDEFGHIJKL${String(i).padStart(2, "0")}`);
  const stream = await pdf(RegisterListTemplate({ title: "Receiving", headers, rows: [row], printedAt: "5 Oct 2026" })).toBuffer();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)), useSystemFonts: false }).promise;
  try {
    expect(doc.numPages).toBe(1);
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const items = content.items.filter((item): item is import("pdfjs-dist/types/src/display/api").TextItem => "str" in item);
    const header = items.find(item => item.str === "Column 1");
    expect(header).toBeDefined();
    const body = items.filter(item => item.str.trim() && item.transform[5] < header!.transform[5] - 5 && item.transform[5] > 40);
    const columnWidth = (page.getViewport({ scale: 1 }).width - 48) / 15;
    const recovered = Array.from({ length: 15 }, () => "");
    for (const item of body) {
      const x = item.transform[4];
      const column = Math.floor((x - 24) / columnWidth);
      expect(column).toBeGreaterThanOrEqual(0);
      expect(column).toBeLessThan(15);
      expect(x + item.width).toBeLessThanOrEqual(24 + (column + 1) * columnWidth - 3);
      recovered[column] += item.str.replace(/\s/g, "");
    }
    expect(recovered).toEqual(row);
  } finally { await doc.destroy(); }
});

it("preserves every row when wrapped cells paginate", async () => {
  const headers = Array.from({ length: 15 }, (_, i) => `Column ${i + 1}`);
  const identities = Array.from({ length: 65 }, (_, i) => `ROW${String(i).padStart(4, "0")}ABCDEFGHIJKLMN`);
  const rows = identities.map(id => [id, ...Array.from({ length: 14 }, () => "SupplierReference2609014827")]);
  const stream = await pdf(RegisterListTemplate({ title: "Receiving", headers, rows, printedAt: "5 Oct 2026" })).toBuffer();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)), useSystemFonts: false }).promise;
  try {
    expect(doc.numPages).toBeGreaterThan(1);
    let text = "";
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const pageText = content.items.flatMap(item => "str" in item ? [item.str] : []).join("").replace(/\s/g, "");
      expect(pageText).toContain("Column1");
      text += pageText;
    }
    for (const id of identities) expect(text.split(id)).toHaveLength(2);
  } finally { await doc.destroy(); }
});
