import { describe, expect, it } from "vitest";
import {
  excelSerialToISO,
  normalizePoKey,
  parseEtaCell,
  masterRecordToStockRow,
  matchStockRows,
  type OrderLineRef,
  type StockEtaImportRow,
} from "./stock-eta-import";

describe("excelSerialToISO", () => {
  it("converts a real Master serial to the displayed date (tz-safe)", () => {
    // 46193 renders "20 Jun 26" in the sheet.
    expect(excelSerialToISO(46193)).toBe("2026-06-20");
    expect(excelSerialToISO(46204)).toBe("2026-07-01");
  });
  it("rejects non-positive / non-finite serials", () => {
    expect(excelSerialToISO(0)).toBeNull();
    expect(excelSerialToISO(-5)).toBeNull();
    expect(excelSerialToISO(NaN)).toBeNull();
  });
});

describe("normalizePoKey", () => {
  it("collapses whitespace + case so a leading-space PO still matches", () => {
    expect(normalizePoKey(" PO/2603-065")).toBe("PO/2603-065");
    expect(normalizePoKey("po/2603-065")).toBe("PO/2603-065");
  });
});

describe("parseEtaCell", () => {
  it("accepts a serial number, a serial string, and ISO", () => {
    expect(parseEtaCell(46193)).toBe("2026-06-20");
    expect(parseEtaCell("46193")).toBe("2026-06-20");
    expect(parseEtaCell("2026-06-20")).toBe("2026-06-20");
  });
  it("returns null for blank / junk", () => {
    expect(parseEtaCell("")).toBeNull();
    expect(parseEtaCell(null)).toBeNull();
    expect(parseEtaCell("n/a")).toBeNull();
  });
});

describe("masterRecordToStockRow", () => {
  it("maps a Pending row (case-insensitive headers)", () => {
    const r = masterRecordToStockRow({
      PO: "PO/2605-058",
      "Item Detail": 'HK5531/24" (2 Seater + Lshape)',
      "Stock ETA": 46193,
      "Stock Status": "Pending",
    });
    expect(r).toEqual({
      ok: true,
      row: {
        po: "PO/2605-058",
        sku: 'HK5531/24" (2 Seater + Lshape)',
        eta: "2026-06-20",
        status: "Pending",
      },
    });
  });
  it("skips a received row with no ETA", () => {
    const r = masterRecordToStockRow({
      PO: "PO/2603-065",
      "Item Detail": "1013Jager/Fab3-King",
      "Stock ETA": "",
      "Stock Status": "Received",
    });
    expect(r.ok).toBe(false);
  });
  it("skips a row missing the PO", () => {
    const r = masterRecordToStockRow({ "Item Detail": "x", "Stock ETA": 46193 });
    expect(r.ok).toBe(false);
  });
});

describe("matchStockRows", () => {
  const lines: OrderLineRef[] = [
    { orderId: "o1", sku: "1013Jager/Fab3-King/COL:PC15", sourcePo: "PO/2603-065" },
    { orderId: "o1", sku: "1013Jager/Fab3-Queen/COL:PC15", sourcePo: "PO/2603-065" },
    { orderId: "o2", sku: 'HK5531/24" (2 Seater + Lshape)/COL:M2', sourcePo: " PO/2605-058" },
  ];

  it("joins by PO and disambiguates multi-line POs by size/model tokens despite colour drift", () => {
    const rows: StockEtaImportRow[] = [
      { po: "PO/2603-065", sku: "1013Jager/Fab3-Queen /PC1", eta: "2026-06-24" },
    ];
    const out = matchStockRows(rows, lines);
    expect(out.matched).toEqual([
      { orderId: "o1", sku: "1013Jager/Fab3-Queen/COL:PC15", eta: "2026-06-24" },
    ]);
    expect(out.unmatched).toHaveLength(0);
  });

  it("matches a single-line PO with a leading-space PO cell", () => {
    const rows: StockEtaImportRow[] = [
      { po: "PO/2605-058", sku: 'HK5531/24"', eta: "2026-06-20" },
    ];
    const out = matchStockRows(rows, lines);
    expect(out.matched).toEqual([
      { orderId: "o2", sku: 'HK5531/24" (2 Seater + Lshape)/COL:M2', eta: "2026-06-20" },
    ]);
  });

  it("reports an unknown PO as unmatched", () => {
    const rows: StockEtaImportRow[] = [
      { po: "PO/9999-999", sku: "whatever", eta: "2026-06-20" },
    ];
    const out = matchStockRows(rows, lines);
    expect(out.matched).toHaveLength(0);
    expect(out.unmatched[0].reason).toMatch(/PO not found/);
  });
});
