import { describe, it, expect } from "vitest";
import {
  normalizeStockCondition,
  warehouseSheetRecordToImportRow,
  stockUnitKey,
  reconcileStockImport,
  opsStockImportRowSchema,
  type OpsStockImportRow,
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

// ── Idempotent count-based import reconcile ─────────────────────────────────
const row = (over: Partial<OpsStockImportRow> = {}): OpsStockImportRow =>
  opsStockImportRowSchema.parse({ sku: "BF-K", condition: "new", ...over });

describe("stockUnitKey", () => {
  it("is stable across case/space and ignores status + reservedRef + qty", () => {
    const a = stockUnitKey({
      sku: " BF-K ",
      condition: "Exhibition",
      poNo: "PO/1",
      sourceRef: "CR9",
      supplier: "NB",
      dateIn: "2026-06-01",
    });
    const b = stockUnitKey({
      sku: "bf-k",
      condition: "exhibition",
      poNo: "po/1",
      sourceRef: "cr9",
      supplier: "nb",
      dateIn: "2026-06-01",
    });
    expect(a).toBe(b);
  });

  it("does not collide when fields shift across the separator", () => {
    // "ab"+"c" must not equal "a"+"bc"
    expect(stockUnitKey({ sku: "ab", condition: "c" })).not.toBe(
      stockUnitKey({ sku: "a", condition: "bc" }),
    );
  });

  it("treats blank PO / OLD REF as an empty key part (not 'new = duplicate')", () => {
    const blank = stockUnitKey({ sku: "BF", condition: "exhibition", supplier: "NB" });
    const same = stockUnitKey({
      sku: "BF",
      condition: "exhibition",
      poNo: null,
      sourceRef: null,
      supplier: "NB",
    });
    expect(blank).toBe(same);
  });
});

describe("reconcileStockImport", () => {
  it("inserts everything into an empty pool", () => {
    const desired = [row(), row({ sku: "MP-Q", qty: 319 })];
    const r = reconcileStockImport(desired, []);
    expect(r.toAddCount).toBe(2);
    expect(r.alreadyInCount).toBe(0);
    expect(r.desiredCount).toBe(2);
  });

  it("is idempotent — re-importing the same sheet adds nothing", () => {
    const desired = [row({ sku: "A" }), row({ sku: "B" }), row({ sku: "A" })];
    const first = reconcileStockImport(desired, []);
    expect(first.toAddCount).toBe(3);
    // Simulate the pool now holding exactly what was inserted.
    const pool = first.toInsert.map((d) => ({
      sku: d.sku,
      condition: d.condition,
      poNo: d.poNo,
      sourceRef: d.sourceRef,
      supplier: d.supplier,
      dateIn: d.dateIn,
    }));
    const second = reconcileStockImport(desired, pool);
    expect(second.toAddCount).toBe(0);
    expect(second.alreadyInCount).toBe(3);
  });

  it("preserves legitimate identical duplicates (blank ref/PO)", () => {
    // 3 real identical display units — must NOT collapse to 1.
    const jager: Partial<OpsStockImportRow> = {
      sku: "JAGER-K",
      condition: "exhibition",
      supplier: "NB",
    };
    const desired = [row(jager), row(jager), row(jager)];
    const r = reconcileStockImport(desired, []);
    expect(r.toAddCount).toBe(3);
  });

  it("adds only the deficit when the pool is partially populated", () => {
    const cozy: Partial<OpsStockImportRow> = {
      sku: "COZY",
      condition: "exhibition",
      supplier: "NB",
    };
    const desired = [row(cozy), row(cozy), row(cozy)]; // sheet says 3
    const pool = [
      { sku: "COZY", condition: "exhibition", poNo: null, sourceRef: null, supplier: "NB", dateIn: undefined },
    ]; // pool already has 1
    const r = reconcileStockImport(desired, pool);
    expect(r.toAddCount).toBe(2);
    expect(r.alreadyInCount).toBe(1);
  });

  it("counts an existing reserved unit against a free sheet line (no re-add)", () => {
    // The physical-identity key ignores status, so a unit reserved AFTER the
    // sheet was cut still counts — we don't duplicate it.
    const desired = [row({ sku: "X", supplier: "NB" })];
    const pool = [
      { sku: "X", condition: "new", poNo: null, sourceRef: null, supplier: "NB", dateIn: undefined },
    ];
    const r = reconcileStockImport(desired, pool);
    expect(r.toAddCount).toBe(0);
  });
});
