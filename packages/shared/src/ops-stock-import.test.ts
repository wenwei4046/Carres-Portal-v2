import { describe, it, expect } from "vitest";
import {
  normalizeStockCondition,
  warehouseSheetRecordToImportRow,
} from "./ops-stock-import";

describe("normalizeStockCondition", () => {
  it("maps the sheet's free-text grades to the enum (trim + case)", () => {
    expect(normalizeStockCondition("New")).toBe("new");
    expect(normalizeStockCondition("Exhibition ")).toBe("exhibition");
    expect(normalizeStockCondition("display")).toBe("exhibition");
    expect(normalizeStockCondition("Old")).toBe("old");
    expect(normalizeStockCondition("Fair (used)")).toBe("old");
    expect(normalizeStockCondition("Refurbished")).toBe("refurbished");
    expect(normalizeStockCondition("Damaged")).toBe("damaged");
  });
  it("falls back to 'new' for blank / unknown", () => {
    expect(normalizeStockCondition("")).toBe("new");
    expect(normalizeStockCondition(null)).toBe("new");
    expect(normalizeStockCondition("???")).toBe("new");
  });
});

describe("warehouseSheetRecordToImportRow", () => {
  const base = {
    "DATE IN": 46181,
    CONDITION: "New",
    PO: "PO/2601-105",
    "OLD REF": "CR0973",
    SKU: "1007-K BEDFRAME",
    CATEGORY: "Headboard",
    QTY: 1,
    "FREE/RESERVED": "Free",
    "RESERVED REF NO": null,
    SUPPLIER: "Hookka",
    REMARK: "",
  };

  it("maps a clean row + converts the Excel serial date", () => {
    const r = warehouseSheetRecordToImportRow(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({
      sku: "1007-K BEDFRAME",
      condition: "new",
      status: "free",
      qty: 1,
      poNo: "PO/2601-105",
      sourceRef: "CR0973",
      supplier: "Hookka",
    });
    expect(r.row.dateIn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("drops OLD REF when it's a leaked condition word", () => {
    const r = warehouseSheetRecordToImportRow({
      ...base,
      CONDITION: "Exhibition ",
      "OLD REF": "Exhibition ",
      SUPPLIER: "Renness",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.condition).toBe("exhibition");
    expect(r.row.sourceRef).toBeUndefined();
  });

  it("reads reserved status + keeps the reserved ref only when reserved", () => {
    const r = warehouseSheetRecordToImportRow({
      ...base,
      "FREE/RESERVED": "Reserved",
      "RESERVED REF NO": "SO-1070",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.status).toBe("reserved");
    expect(r.row.reservedRef).toBe("SO-1070");
  });

  it("drops a reserved ref on a free row", () => {
    const r = warehouseSheetRecordToImportRow({
      ...base,
      "FREE/RESERVED": "Free",
      "RESERVED REF NO": "SO-1070",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.reservedRef).toBeUndefined();
  });

  it("rejects a row with no SKU", () => {
    expect(warehouseSheetRecordToImportRow({ ...base, SKU: "  " }).ok).toBe(false);
  });

  it("is case/space-insensitive on headers", () => {
    const r = warehouseSheetRecordToImportRow({
      " sku ": "X-1",
      "free/reserved": "Free",
      condition: "old",
      qty: 2,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({ sku: "X-1", condition: "old", qty: 2 });
  });
});
