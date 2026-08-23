import { describe, expect, it } from "vitest";
import { csvRecordToImportRow } from "./sku-import";

/**
 * THE IMPORT CARRIES THE SUPPLIER'S OWN CODE (0376, 2026-08-21).
 *
 * 0375 gave `product_skus` the supplier's item code and the Add-SKU form could
 * write it; the IMPORT could not, so keying the Hookka quotation meant opening
 * SKUs one at a time — the exact work the batch importer exists to avoid.
 *
 * ⭐ ABSENT IS NOT BLANK, and the whole importer turns on that distinction:
 *
 *     no supplier_code column  →  key OMITTED  →  server PRESERVES what is stored
 *     column present, blank    →  key OMITTED  →  same (a blank never clears here)
 *     column present, a value  →  key SENT     →  server writes it
 *
 * Getting the first case wrong would mean every re-import of a price list
 * silently wipes codes somebody keyed in by hand.
 */
const BASE = {
  model: "Hookka Lounger",
  category: "sofa",
  variant: "3-Seater",
};

describe("csvRecordToImportRow — supplier_code", () => {
  it("carries the supplier's code when the column has a value", () => {
    const r = csvRecordToImportRow({ ...BASE, supplier_code: "HK-3S" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.row.supplierCode).toBe("HK-3S");
  });

  it("OMITS the key when the file has no such column — the preserve case", () => {
    const r = csvRecordToImportRow({ ...BASE });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row).not.toHaveProperty("supplierCode");
      expect(r.row.supplierCode).toBeUndefined();
    }
  });

  it("OMITS the key for a blank cell, exactly like every other column", () => {
    // Blank = "no value in this file", not "clear it". The same rule keeps a
    // blank price cell from zeroing a price on re-import.
    for (const blank of ["", "   "]) {
      const r = csvRecordToImportRow({ ...BASE, supplier_code: blank });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.row).not.toHaveProperty("supplierCode");
    }
  });

  it("matches the header case-insensitively, like every other header", () => {
    const r = csvRecordToImportRow({ ...BASE, SUPPLIER_CODE: "KN390-15" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.row.supplierCode).toBe("KN390-15");
  });

  it("is independent of `supplier` — theirs is a CODE, not a party", () => {
    // `supplier` names the party and the server resolves it to supplier_id;
    // `supplier_code` is that party's own code for the item. A file may carry
    // either, both, or neither.
    const r = csvRecordToImportRow({ ...BASE, supplier: "Hookka", supplier_code: "HK-3S" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.supplier).toBe("Hookka");
      expect(r.row.supplierCode).toBe("HK-3S");
    }
    const onlyCode = csvRecordToImportRow({ ...BASE, supplier_code: "HK-3S" });
    if (onlyCode.ok) expect(onlyCode.row.supplier).toBeUndefined();
  });

  it("does not disturb the row's other fields", () => {
    const r = csvRecordToImportRow({ ...BASE, supplier_code: "HK-3S", price: "1950" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.model).toBe("Hookka Lounger");
      expect(r.row.variant).toBe("3-Seater");
      expect(r.row.price).toBe(1950);
    }
  });
});
