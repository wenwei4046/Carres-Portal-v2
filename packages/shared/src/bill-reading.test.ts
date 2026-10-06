import { describe, expect, it } from "vitest";
import {
  billReadInput,
  cleanBillReading,
  isFooterRow,
  linesMatchTotal,
  matchSupplier,
  normalizeVendor,
  parseModelJson,
  readAmount,
  readDay,
} from "./bill-reading";

describe("cleaning what the model read", () => {
  it("keeps a figure it read and empties one it could not, never guessing", () => {
    const r = cleanBillReading({
      vendorName: "  Ohana Furniture  Sdn Bhd ", vendorRegNo: "201901012345", documentKind: "invoice",
      invoiceNumber: "OH-INV-88231", invoiceDate: "2026-09-24", dueDate: "2026-02-30",
      currency: "RM", total: "1,650.00", lines: [{ description: "Sofa 3 seater", amount: 1650 }],
    });
    expect(r).toEqual({
      vendorName: "Ohana Furniture Sdn Bhd", vendorRegNo: "201901012345", documentKind: "invoice",
      invoiceNumber: "OH-INV-88231", invoiceDate: "2026-09-24",
      dueDate: null, // 30 February is not a day
      currency: "MYR", total: 1650, lines: [{ description: "Sofa 3 seater", amount: 1650 }],
    });
  });

  it("drops totals, tender and change rows, and a zero rounding row, but keeps tax, delivery and discounts", () => {
    const r = cleanBillReading({
      lines: [
        { description: "Mattress queen", amount: 899 },
        { description: "Delivery charge", amount: 50 },
        { description: "Discount", amount: -49 },
        { description: "SST 8%", amount: 71.92 },
        { description: "Sub Total", amount: 971.92 },
        { description: "Rounding Adj.", amount: 0 },
        { description: "Rounding", amount: -0.02 },
        { description: "TOTAL (RM)", amount: 971.9 },
        { description: "Cash", amount: 1000 },
        { description: "Change", amount: 28.1 },
        { description: "", amount: 5 },
        { description: "Unreadable price", amount: "abc" },
      ],
    });
    expect(r?.lines.map((l) => l.description)).toEqual([
      "Mattress queen", "Delivery charge", "Discount", "SST 8%", "Rounding",
    ]);
  });

  it("refuses an answer that is not an object, and unknown kinds and odd currencies", () => {
    expect(cleanBillReading(null)).toBeNull();
    expect(cleanBillReading([1, 2])).toBeNull();
    const r = cleanBillReading({ documentKind: "menu", currency: "ringgit", total: "about 100" });
    expect(r).toMatchObject({ documentKind: null, currency: null, total: null, lines: [] });
  });

  it("reads amounts and days the strict way", () => {
    expect(readAmount("RM 1,234.567")).toBe(1234.57);
    expect(readAmount(-12.5)).toBe(-12.5);
    expect(readAmount("12/5")).toBeNull();
    expect(readAmount(Number.NaN)).toBeNull();
    expect(readDay("2026-10-03")).toBe("2026-10-03");
    expect(readDay("03/10/2026")).toBeNull();
    expect(readDay("1999-01-01")).toBeNull();
  });

  it("finds the JSON in a fenced answer", () => {
    expect(parseModelJson('Here it is:\n```json\n{"total": 12}\n```')).toEqual({ total: 12 });
    expect(parseModelJson("I cannot read this.")).toBeNull();
    expect(parseModelJson("{not json}")).toBeNull();
  });

  it("says whether the lines add up to the total, to the sen", () => {
    const base = { vendorName: null, vendorRegNo: null, documentKind: null, invoiceNumber: null, invoiceDate: null, dueDate: null, currency: null };
    expect(linesMatchTotal({ ...base, total: 10.3, lines: [{ description: "a", amount: 10.1 }, { description: "b", amount: 0.2 }] })).toBe(true);
    expect(linesMatchTotal({ ...base, total: 10, lines: [{ description: "a", amount: 9 }] })).toBe(false);
    expect(linesMatchTotal({ ...base, total: null, lines: [{ description: "a", amount: 9 }] })).toBeNull();
  });

  it("a footer row is a whole label, never a word inside an item", () => {
    expect(isFooterRow("Grand Total:", 10)).toBe(true);
    expect(isFooterRow("Total Care service plan", 10)).toBe(false);
  });
});

describe("which supplier sent it", () => {
  const suppliers = [
    { id: "1", name: "Ohana Furniture Manufacturing Industries (M) Sdn Bhd" },
    { id: "2", name: "Lumen Sofa Works" },
    { id: "3", name: "Dorsett Loft Trading" },
    { id: "4", name: "Dorsett Loft Enterprise" },
  ];

  it("strips company words and punctuation", () => {
    expect(normalizeVendor("Lumen Sofa Works S/B")).toBe("LUMEN SOFA WORKS");
    expect(normalizeVendor("A & B Furniture Sdn. Bhd.")).toBe("A AND B FURNITURE");
  });

  it("matches one supplier by name, exactly or contained", () => {
    expect(matchSupplier("LUMEN SOFA WORKS SDN BHD", suppliers)).toEqual({ supplier: suppliers[1], how: "exact" });
    // Company-type words fall away on both sides, so this is the same name.
    expect(matchSupplier("Ohana Furniture", suppliers)).toEqual({ supplier: suppliers[0], how: "exact" });
    expect(matchSupplier("Lumen Sofa", suppliers)).toEqual({ supplier: suppliers[1], how: "contains" });
  });

  it("two candidates or a short name is no match: never a guess", () => {
    expect(matchSupplier("Dorsett Loft", suppliers)).toBeNull();
    expect(matchSupplier("AB", suppliers)).toBeNull();
    expect(matchSupplier(null, suppliers)).toBeNull();
    expect(matchSupplier("Nice Future", suppliers)).toBeNull();
  });
});

describe("the request", () => {
  const page = { name: "bill.pdf", mime: "application/pdf", dataBase64: "JVBERi0xLjQK" };
  it("takes one to eight pages of PDF or photo", () => {
    expect(billReadInput.safeParse({ files: [page] }).success).toBe(true);
    expect(billReadInput.safeParse({ files: [] }).error?.issues[0]?.message).toBe("Choose the bill to read.");
    expect(billReadInput.safeParse({ files: Array(9).fill(page) }).success).toBe(false);
    expect(billReadInput.safeParse({ files: [{ ...page, mime: "text/plain" }] }).error?.issues[0]?.message)
      .toBe("Read a PDF or a photo (JPEG, PNG or WebP).");
    expect(billReadInput.safeParse({ files: [{ ...page, dataBase64: "not base64!" }] }).success).toBe(false);
  });
});
