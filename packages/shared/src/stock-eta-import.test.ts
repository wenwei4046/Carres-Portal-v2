import { describe, expect, it } from "vitest";
import {
  excelSerialToISO,
  normalizePoKey,
  splitPoKeys,
  parseEtaCell,
  parseMoneyCell,
  normalizeMasterStockStatus,
  masterRecordToStockRow,
  masterRecordToOrderRow,
  masterRecordToStorageFee,
  aggregateStorageFeesByRef,
  matchStockRows,
  type OrderLineRef,
  type StockEtaImportRow,
  type StorageFeeImportRow,
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
  it("skips non-stock charge / discount lines", () => {
    for (const name of ["Discount 3000", "Transport Fees", "No Lift Per Floor Charge"]) {
      const r = masterRecordToStockRow({
        PO: "PO/1",
        "Item Detail": name,
        "Stock Status": "Received",
      });
      expect(r.ok, name).toBe(false);
    }
  });
});

describe("masterRecordToOrderRow", () => {
  it("maps a Master Ops row to the AutoCount order-row shape", () => {
    const r = masterRecordToOrderRow({
      Ref: "CR1052",
      "Delivery Location": "Kuala Lumpur",
      ETA: 46107,
      "Item Group": "Bed Fram",
      Qty: 1,
      "Item Detail": "1013Jager/Fab3-King/PC151-02",
      PO: "PO/2603-065",
      Customer: "Yip Chung Sien",
      Phone: "010-9738523",
      "Add 1": "B-20-05",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.ref).toBe("CR1052");
      expect(r.row.poDocNo).toBe("PO/2603-065");
      expect(r.row.debtorName).toBe("Yip Chung Sien");
      expect(r.row.qty).toBe(1);
      expect(r.row.deliveryDate).toBe("2026-03-26");
    }
  });
  it("skips a row with no Item Group or no Customer", () => {
    expect(masterRecordToOrderRow({ Ref: "x", Qty: 1, "Item Detail": "y", Customer: "z" }).ok).toBe(false);
    expect(masterRecordToOrderRow({ Ref: "x", "Item Group": "Sofa", Qty: 1, "Item Detail": "y" }).ok).toBe(false);
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

describe("parseMoneyCell", () => {
  it("reads a plain number", () => {
    expect(parseMoneyCell(150)).toBe(150);
    expect(parseMoneyCell(0)).toBe(0);
  });
  it("reads 'RM 150' / 'RM150.00' text", () => {
    expect(parseMoneyCell("RM 150")).toBe(150);
    expect(parseMoneyCell("RM150.00")).toBe(150);
    expect(parseMoneyCell("1,200")).toBe(1200);
  });
  it("is null for blank / non-numeric / negative", () => {
    expect(parseMoneyCell("")).toBeNull();
    expect(parseMoneyCell(null)).toBeNull();
    expect(parseMoneyCell("n/a")).toBeNull();
    expect(parseMoneyCell(-5)).toBeNull();
  });
});

describe("masterRecordToStorageFee", () => {
  it("reads MS/BF + Sofa storage-fee columns by fuzzy header", () => {
    const out = masterRecordToStorageFee({
      Ref: "CR1052",
      "MS/BF Storage Fees": 150,
      "SOF Storage Fees": "RM 200",
    });
    expect(out).toEqual({ ok: true, row: { ref: "CR1052", msbf: 150, sof: 200 } });
  });
  it("tolerates header casing / spacing variants", () => {
    const out = masterRecordToStorageFee({
      ref: "CR1",
      "  sofa storage fee ": "200",
    });
    expect(out).toEqual({ ok: true, row: { ref: "CR1", sof: 200 } });
  });
  it("skips a row with no Ref", () => {
    const out = masterRecordToStorageFee({ "MS/BF Storage Fees": 150 });
    expect(out.ok).toBe(false);
  });
  it("skips a row with no non-zero fee", () => {
    const out = masterRecordToStorageFee({
      Ref: "CR1",
      "MS/BF Storage Fees": 0,
      "SOF Storage Fees": "",
    });
    expect(out.ok).toBe(false);
  });
});

describe("aggregateStorageFeesByRef", () => {
  it("collapses an order's repeated rows to one fee (max non-zero per category)", () => {
    const rows: StorageFeeImportRow[] = [
      { ref: "CR1052", msbf: 150 },
      { ref: "cr1052", msbf: 150 },
      { ref: "CR2000", sof: 200 },
    ];
    const out = aggregateStorageFeesByRef(rows);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.ref.toUpperCase() === "CR1052")).toEqual({
      ref: "CR1052",
      msbf: 150,
    });
    expect(out.find((r) => r.ref.toUpperCase() === "CR2000")).toEqual({
      ref: "CR2000",
      sof: 200,
    });
  });
});
