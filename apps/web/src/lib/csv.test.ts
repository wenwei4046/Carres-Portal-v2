import { describe, it, expect } from "vitest";
import { parseCsv, listingRowToImportRow } from "./csv";

describe("parseCsv", () => {
  it("parses a minimal header + 2 rows", () => {
    const r = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(r.headers).toEqual(["a", "b", "c"]);
    expect(r.rows).toEqual([
      { a: "1", b: "2", c: "3" },
      { a: "4", b: "5", c: "6" },
    ]);
    expect(r.errors).toEqual([]);
  });

  it("handles quoted fields with embedded commas", () => {
    const r = parseCsv(`name,desc\n"Tan, Mei","Has, comma"\n`);
    expect(r.rows[0]).toEqual({ name: "Tan, Mei", desc: "Has, comma" });
  });

  it("handles escaped quotes inside quoted fields", () => {
    const r = parseCsv(`a,b\n"He said ""hi""",ok\n`);
    expect(r.rows[0]).toEqual({ a: 'He said "hi"', b: "ok" });
  });

  it("preserves embedded newlines inside quoted cells (multi-line address)", () => {
    const r = parseCsv(`name,addr\n"Felix","123 Jalan\nMuar Johor"\n`);
    expect(r.rows[0].addr).toContain("\n");
  });

  it("trims headers (Excel often exports with leading/trailing spaces)", () => {
    const r = parseCsv(" Ref. ,Item Group\nCR0418,Mattress\n");
    expect(r.headers).toEqual(["Ref.", "Item Group"]);
    expect(r.rows[0]["Ref."]).toBe("CR0418");
  });

  it("drops trailing blank rows from a trailing newline", () => {
    const r = parseCsv("a,b\n1,2\n\n\n");
    expect(r.rows).toHaveLength(1);
  });

  it("handles CRLF line endings", () => {
    const r = parseCsv("a,b\r\n1,2\r\n");
    expect(r.rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("returns empty result for empty input", () => {
    const r = parseCsv("");
    expect(r.headers).toEqual([]);
    expect(r.rows).toEqual([]);
  });

  it("pads short rows with empty strings", () => {
    const r = parseCsv("a,b,c\n1\n");
    expect(r.rows[0]).toEqual({ a: "1", b: "", c: "" });
  });
});

describe("listingRowToImportRow", () => {
  const validRow = {
    "Ref.": "CR0418",
    "Delivery Location": "Muar, Johor",
    "New- Delivery Date": "46143",
    "Item Group": "Mattress",
    "Qty": "1",
    "Detail Description": "Breeze FirmCare-B1201F-K",
    "PO Doc No.": "PO/2604-006",
    "Debtor Name": "Felix Koh",
    "Phone": "012-6399285",
    "Delivery Address 1": "18 Jalan Cempaka",
    "Delivery Address 2": "",
    "Delivery Address 3": "",
    "Delivery Address 4": "",
    "Balance": "RM3322 Paid",
  };

  it("maps a full AutoCount listing row", () => {
    const r = listingRowToImportRow(validRow);
    expect(r).not.toBeNull();
    expect(r!.ref).toBe("CR0418");
    expect(r!.itemGroup).toBe("Mattress");
    expect(r!.qty).toBe(1);
    expect(r!.detailDescription).toBe("Breeze FirmCare-B1201F-K");
    expect(r!.poDocNo).toBe("PO/2604-006");
    expect(r!.debtorName).toBe("Felix Koh");
    expect(r!.balance).toBe("RM3322 Paid");
  });

  it("parses Excel serial 46143 to ISO date (May 1 2026, Lotus epoch)", () => {
    const r = listingRowToImportRow(validRow);
    // 1899-12-30 + 46143 days = 2026-05-01
    expect(r!.deliveryDate).toBe("2026-05-01");
  });

  it("parses DD/MM/YYYY date format", () => {
    const r = listingRowToImportRow({ ...validRow, "New- Delivery Date": "19/05/2026" });
    expect(r!.deliveryDate).toBe("2026-05-19");
  });

  it("accepts ISO date format passthrough", () => {
    const r = listingRowToImportRow({ ...validRow, "New- Delivery Date": "2026-05-19" });
    expect(r!.deliveryDate).toBe("2026-05-19");
  });

  it("returns null deliveryDate for blank / unparseable", () => {
    expect(listingRowToImportRow({ ...validRow, "New- Delivery Date": "" })!.deliveryDate).toBeNull();
    expect(listingRowToImportRow({ ...validRow, "New- Delivery Date": "garbage" })!.deliveryDate).toBeNull();
  });

  it("returns null on missing Ref. (silent skip)", () => {
    expect(listingRowToImportRow({ ...validRow, "Ref.": "" })).toBeNull();
  });

  it("defaults qty to 1 when blank or non-numeric", () => {
    expect(listingRowToImportRow({ ...validRow, Qty: "" })!.qty).toBe(1);
    expect(listingRowToImportRow({ ...validRow, Qty: "abc" })!.qty).toBe(1);
  });

  it("case-insensitive header tolerance", () => {
    const upper: Record<string, string> = {};
    for (const [k, v] of Object.entries(validRow)) upper[k.toUpperCase()] = v;
    const r = listingRowToImportRow(upper);
    expect(r).not.toBeNull();
    expect(r!.ref).toBe("CR0418");
    expect(r!.itemGroup).toBe("Mattress");
  });

  it("nullifies blank Address fields", () => {
    const r = listingRowToImportRow(validRow);
    expect(r!.addr2).toBeNull();
    expect(r!.addr3).toBeNull();
    expect(r!.addr4).toBeNull();
  });
});
