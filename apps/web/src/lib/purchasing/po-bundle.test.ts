import { describe, expect, it, vi } from "vitest";
import type { PoTemplateData } from "@/lib/pdf/types";
import { preparePoBundle, prepareSelectedPoDocuments, poBundleDocumentList } from "./po-bundle";

const selected = [{ id: "po1", supplierId: "s1", version: 1 }, { id: "po2", supplierId: "s1", version: 2 }];
function document(id: string): PoTemplateData {
  return { po_id: id, po_number: id === "po1" ? "PO-001" : "PO-002", version: id === "po1" ? 1 : 2 } as PoTemplateData;
}
const pdf = () => Promise.resolve(new Blob(["%PDF-1.4"], { type: "application/pdf" }));

describe("selected supplier PO attachment preparation", () => {
  it("keeps independent PDFs and the exact message/version set", async () => {
    const result = await preparePoBundle("s1", selected, async id => document(id), pdf);
    expect(result.map(po => po.filename)).toEqual(["PO-001-V1.pdf", "PO-002-V2.pdf"]);
    expect(poBundleDocumentList(result)).toBe("PO-001 · V1\nPO-002 · V2");
    expect(result.every(po => po.pdf.size > 0)).toBe(true);
  });
  it.each([
    [[], "empty_selection"],
    [[selected[0], { ...selected[1], supplierId: "s2" }], "mixed_suppliers"],
    [[selected[0], selected[0]], "duplicate_po"],
  ])("refuses invalid scope before reading or rendering", async (scope, code) => {
    const load = vi.fn();
    await expect(preparePoBundle("s1", scope, load, pdf)).rejects.toMatchObject({ code });
    expect(load).not.toHaveBeenCalled();
  });
  it("refuses a draft or another PO returned for a selection", async () => {
    for (const override of [{ draft: true }, { po_id: "another" }]) {
      await expect(preparePoBundle("s1", [selected[0]], async id => ({ ...document(id), ...override }), pdf)).rejects.toMatchObject({ code: "invalid_po_document" });
    }
  });
  it("refuses a revision during attachment preparation", async () => {
    let reads = 0;
    await expect(preparePoBundle("s1", [selected[0]], async id => ({ ...document(id), version: ++reads === 1 ? 1 : 2 }), pdf)).rejects.toMatchObject({ code: "stale_po_version" });
  });
  it("returns no partial pack when one PDF fails", async () => {
    await expect(preparePoBundle("s1", selected, async id => document(id), async data => {
      if (data.po_id === "po2") throw new Error("render failed");
      return pdf();
    })).rejects.toThrow("render failed");
  });
  it("snapshots selection before asynchronous preparation", async () => {
    const scope = [{ ...selected[0] }];
    const result = preparePoBundle("s1", scope, async id => document(id), pdf);
    scope[0].id = "po2";
    expect((await result)[0].id).toBe("po1");
  });
});


describe("register selection downloads", () => {
  const mixed = [selected[0], { ...selected[1], supplierId: "s2" }];
  it("prepares selected independent versions across suppliers without adding another PO", async () => {
    const files = await prepareSelectedPoDocuments(mixed, async id => document(id), pdf);
    expect(files.map(file => [file.id, file.supplierId, file.version])).toEqual([["po1", "s1", 1], ["po2", "s2", 2]]);
  });
  it("refuses the whole download if a supplier's PDF fails", async () => {
    await expect(prepareSelectedPoDocuments(mixed, async id => document(id), async data => {
      if (data.po_id === "po2") throw new Error("render failed");
      return pdf();
    })).rejects.toThrow("render failed");
  });
  it("detects a revision after one supplier finishes but before the complete pack is ready", async () => {
    const reads = new Map<string, number>();
    await expect(prepareSelectedPoDocuments(mixed, async id => {
      const count = (reads.get(id) ?? 0) + 1; reads.set(id, count);
      return { ...document(id), ...(id === "po1" && count === 3 ? { version: 2 } : {}) };
    }, pdf)).rejects.toMatchObject({ code: "stale_po_version" });
  });
});
