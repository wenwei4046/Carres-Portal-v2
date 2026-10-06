// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CFB } from "xlsx";
import { zipPoBundle, type PreparedPoDocument } from "./po-bundle";

function document(number: string, content: string): PreparedPoDocument {
  return { id: number, supplierId: "supplier", version: 1, number, filename: `${number}-V1.pdf`, pdf: new Blob([content], { type: "application/pdf" }) };
}

describe("independent PO PDF ZIP", () => {
  it("extracts exactly the selected PDF filenames with their original bytes", async () => {
    const contents = ["%PDF-1.4\nfirst document\n%%EOF", "%PDF-1.4\nsecond document\n%%EOF"];
    const zip = await zipPoBundle(contents.map((content, i) => document(`PO-00${i + 1}`, content)));
    expect(zip.type).toBe("application/zip");
    const bytes = new Uint8Array(await zip.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([80, 75, 3, 4]);
    const archive = CFB.read(bytes, { type: "array" });
    const files = archive.FileIndex.filter((entry: { name: string }) => entry.name.endsWith(".pdf"));
    expect(files.map((entry: { name: string }) => entry.name)).toEqual(["PO-001-V1.pdf", "PO-002-V1.pdf"]);
    expect(files.map((entry: { content: Uint8Array }) => new TextDecoder().decode(entry.content))).toEqual(contents);
  });
  it("refuses filename collisions rather than overwriting an attachment", async () => {
    await expect(zipPoBundle([document("PO-001", "first"), document("PO-001", "second")])).rejects.toMatchObject({ code: "duplicate_po" });
  });
});
