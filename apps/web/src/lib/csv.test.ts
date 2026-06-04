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

  // Return-shape contract — 2026-06-04: was `T | null`, now a discriminated
  // union `{ ok:true, row } | { ok:false, reason }` so the operation panel can
  // explain WHY each row was skipped (the "all 192 rows rejected because one
  // discount line had no Item Group" UX trap). `noRef` keeps the original
  // silent-skip semantics; the three other reasons used to slip past the
  // mapper and trigger a useless zod error.

  it("returns ok:true with row when every required field is present", () => {
    const r = listingRowToImportRow(validRow);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.ref).toBe("CR0418");
      expect(r.row.itemGroup).toBe("Mattress");
      expect(r.row.qty).toBe(1);
      expect(r.row.detailDescription).toBe("Breeze FirmCare-B1201F-K");
      expect(r.row.poDocNo).toBe("PO/2604-006");
      expect(r.row.debtorName).toBe("Felix Koh");
      expect(r.row.balance).toBe("RM3322 Paid");
    }
  });

  it("returns ok:false reason='noRef' when Ref. is blank (preserves old silent skip)", () => {
    expect(listingRowToImportRow({ ...validRow, "Ref.": "" })).toEqual({
      ok: false,
      reason: "noRef",
    });
  });

  it("returns ok:false reason='noItemGroup' when Item Group is blank (AutoCount discount line)", () => {
    expect(listingRowToImportRow({ ...validRow, "Item Group": "" })).toEqual({
      ok: false,
      reason: "noItemGroup",
    });
  });

  it("returns ok:false reason='noDescription' when Detail Description is blank", () => {
    expect(listingRowToImportRow({ ...validRow, "Detail Description": "" })).toEqual({
      ok: false,
      reason: "noDescription",
    });
  });

  it("returns ok:false reason='noDebtorName' when Debtor Name is blank", () => {
    expect(listingRowToImportRow({ ...validRow, "Debtor Name": "" })).toEqual({
      ok: false,
      reason: "noDebtorName",
    });
  });

  it("reports noRef first when both Ref. and Item Group are blank (ref drives the silent-skip path)", () => {
    expect(
      listingRowToImportRow({ ...validRow, "Ref.": "", "Item Group": "" }),
    ).toEqual({ ok: false, reason: "noRef" });
  });

  it("parses Excel serial 46143 to ISO date (May 1 2026, Lotus epoch)", () => {
    const r = listingRowToImportRow(validRow);
    // 1899-12-30 + 46143 days = 2026-05-01
    if (r.ok) expect(r.row.deliveryDate).toBe("2026-05-01");
    else throw new Error("expected ok row");
  });

  it("parses DD/MM/YYYY date format", () => {
    const r = listingRowToImportRow({ ...validRow, "New- Delivery Date": "19/05/2026" });
    if (r.ok) expect(r.row.deliveryDate).toBe("2026-05-19");
    else throw new Error("expected ok row");
  });

  it("accepts ISO date format passthrough", () => {
    const r = listingRowToImportRow({ ...validRow, "New- Delivery Date": "2026-05-19" });
    if (r.ok) expect(r.row.deliveryDate).toBe("2026-05-19");
    else throw new Error("expected ok row");
  });

  it("returns null deliveryDate for blank / unparseable", () => {
    const blank = listingRowToImportRow({ ...validRow, "New- Delivery Date": "" });
    const garbage = listingRowToImportRow({ ...validRow, "New- Delivery Date": "garbage" });
    if (blank.ok) expect(blank.row.deliveryDate).toBeNull();
    else throw new Error("expected ok row for blank date");
    if (garbage.ok) expect(garbage.row.deliveryDate).toBeNull();
    else throw new Error("expected ok row for garbage date");
  });

  it("defaults qty to 1 when blank or non-numeric", () => {
    const blank = listingRowToImportRow({ ...validRow, Qty: "" });
    const abc = listingRowToImportRow({ ...validRow, Qty: "abc" });
    if (blank.ok) expect(blank.row.qty).toBe(1);
    else throw new Error("expected ok row for blank qty");
    if (abc.ok) expect(abc.row.qty).toBe(1);
    else throw new Error("expected ok row for abc qty");
  });

  it("case-insensitive header tolerance", () => {
    const upper: Record<string, string> = {};
    for (const [k, v] of Object.entries(validRow)) upper[k.toUpperCase()] = v;
    const r = listingRowToImportRow(upper);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.ref).toBe("CR0418");
      expect(r.row.itemGroup).toBe("Mattress");
    }
  });

  it("nullifies blank Address fields", () => {
    const r = listingRowToImportRow(validRow);
    if (r.ok) {
      expect(r.row.addr2).toBeNull();
      expect(r.row.addr3).toBeNull();
      expect(r.row.addr4).toBeNull();
    } else throw new Error("expected ok row");
  });
});
