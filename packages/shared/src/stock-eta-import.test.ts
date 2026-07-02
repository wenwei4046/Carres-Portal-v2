import { describe, expect, it } from "vitest";
import {
  excelSerialToISO,
  normalizePoKey,
  splitPoKeys,
  parseEtaCell,
  normalizeMasterStockStatus,
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

describe("splitPoKeys", () => {
  it("splits a multi-PO cell into normalized keys", () => {
    expect(splitPoKeys("PO/2603-065, PO/2603-066")).toEqual(["PO/2603-065", "PO/2603-066"]);
  });
  it("returns one key for a single PO and none for blank", () => {
    expect(splitPoKeys(" po/2603-065 ")).toEqual(["PO/2603-065"]);
    expect(splitPoKeys("")).toEqual([]);
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
        stockStatus: "waiting",
      },
    });
  });
  it("keeps a received row (no ETA) and maps its status to ready", () => {
    const r = masterRecordToStockRow({
      PO: "PO/2603-065",
      "Item Detail": "1013Jager/Fab3-King",
      "Stock ETA": "",
      "Stock Status": "Received",
    });
    expect(r).toEqual({
      ok: true,
      row: { po: "PO/2603-065", sku: "1013Jager/Fab3-King", stockStatus: "ready" },
    });
  });
  it("skips a row with neither an ETA nor a mappable status", () => {
    const r = masterRecordToStockRow({
      PO: "PO/1",
      "Item Detail": "x",
      "Stock ETA": "",
      "Stock Status": "",
    });
    expect(r.ok).toBe(false);
  });
  it("skips a row missing the PO", () => {
    const r = masterRecordToStockRow({ "Item Detail": "x", "Stock ETA": 46193 });
    expect(r.ok).toBe(false);
  });
});

describe("normalizeMasterStockStatus", () => {
  it("maps the Master Stock Status vocab to portal readiness", () => {
    expect(normalizeMasterStockStatus("Received")).toBe("ready");
    expect(normalizeMasterStockStatus("Pending")).toBe("waiting");
    expect(normalizeMasterStockStatus("No Stock")).toBe("nopo");
    expect(normalizeMasterStockStatus("")).toBeNull();
    expect(normalizeMasterStockStatus("something else")).toBeNull();
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

  it("carries a status-only row (Received, no ETA) through the match", () => {
    const rows: StockEtaImportRow[] = [
      { po: "PO/2603-065", sku: "1013Jager/Fab3-King", stockStatus: "ready" },
    ];
    const out = matchStockRows(rows, lines);
    expect(out.matched).toEqual([
      { orderId: "o1", sku: "1013Jager/Fab3-King/COL:PC15", stockStatus: "ready" },
    ]);
  });

  it("matches a row whose PO cell lists TWO POs (comma-separated)", () => {
    const rows: StockEtaImportRow[] = [
      { po: "PO/9999-999, PO/2605-058", sku: 'HK5531/24"', eta: "2026-06-20" },
    ];
    const out = matchStockRows(rows, lines);
    expect(out.matched).toEqual([
      { orderId: "o2", sku: 'HK5531/24" (2 Seater + Lshape)/COL:M2', eta: "2026-06-20" },
    ]);
    expect(out.unmatched).toHaveLength(0);
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
