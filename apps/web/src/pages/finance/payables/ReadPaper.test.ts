import { describe, expect, it } from "vitest";
import type { BillReadAnswer, BillReading } from "@carres/shared/bill-reading";
import { asCredit, formLines, pagesGap, readPaperNotes } from "./ReadPaper";

const reading = (over: Partial<BillReading>): BillReading => ({
  vendorName: "LUMEN SOFA WORKS SDN BHD", vendorRegNo: null, documentKind: "invoice", invoiceNumber: "LSW-1207",
  invoiceDate: "2026-09-28", dueDate: null, currency: "MYR", total: 1250,
  lines: [{ description: "Sofa 3 seater", amount: 1200 }, { description: "Delivery", amount: 50 }],
  ...over,
});
const lumen = { id: "s1", name: "Lumen Sofa Works", kind: "supplier", how: "exact" as const };
const answer = (r: Partial<BillReading>, supplier: BillReadAnswer["supplier"] = lumen): BillReadAnswer =>
  ({ reading: reading(r), supplier });

describe("the notes after a reading", () => {
  it("say what was read and that every figure is checked", () => {
    expect(readPaperNotes(answer({}), { pages: 1, expect: "bill", linesKept: false })).toEqual([
      "Read from 1 page. Check every figure before you save.",
      "From Lumen Sofa Works.",
    ]);
  });

  it("name what needs a person: no supplier, another currency, a proforma, lines that do not add up", () => {
    const notes = readPaperNotes(
      answer({ documentKind: "proforma", currency: "USD", total: 1300 }, null),
      { pages: 2, expect: "bill", linesKept: false },
    );
    expect(notes).toEqual([
      "Read from 2 pages. Check every figure before you save.",
      "The paper names LUMEN SOFA WORKS SDN BHD. No supplier has that name, so choose the supplier.",
      "It reads as a proforma invoice, not a final invoice.",
      "The paper is in USD. Carres enters it in ringgit.",
      "The lines come to RM 1,250.00, but the total reads RM 1,300.00. Check the lines.",
    ]);
  });

  it("a close name is named so it is checked, and lines already typed are kept", () => {
    const notes = readPaperNotes(answer({}, { ...lumen, how: "contains" }), { pages: 1, expect: "bill", linesKept: true });
    expect(notes).toContain("From Lumen Sofa Works: the paper prints LUMEN SOFA WORKS SDN BHD. Check it is the same supplier.");
    expect(notes).toContain("The lines were not changed, as the form already has lines.");
  });

  it("a discount read as its own line is left for the person", () => {
    const r = answer({ total: 1200, lines: [{ description: "Sofa", amount: 1250 }, { description: "Discount", amount: -50 }] });
    expect(readPaperNotes(r, { pages: 1, expect: "bill", linesKept: false }))
      .toContain("Discount: RM 50.00 off was read. Take it off the lines it belongs to.");
    expect(formLines(r)).toEqual([{ description: "Sofa", amount: "1250.00" }]);
  });

  it("a credit note on a bill form, or an invoice on a credit note form, is named", () => {
    expect(readPaperNotes(answer({ documentKind: "credit_note" }), { pages: 1, expect: "bill", linesKept: false }))
      .toContain("It reads as a credit note. A credit note is entered under Credit Notes.");
    expect(readPaperNotes(answer({}), { pages: 1, expect: "credit_note", linesKept: false }))
      .toContain("It does not read as a credit note. Check the paper.");
  });
});

describe("a credit note printed with minus signs", () => {
  it("is read as the credit it is", () => {
    const a = asCredit(answer({ documentKind: "credit_note", total: -350,
      lines: [{ description: "Two chairs returned", amount: -300 }, { description: "Rebate", amount: -50 }] }));
    expect(a.reading.total).toBe(350);
    expect(formLines(a)).toEqual([
      { description: "Two chairs returned", amount: "300.00" },
      { description: "Rebate", amount: "50.00" },
    ]);
  });

  it("mixed signs are left as read", () => {
    const a = answer({ lines: [{ description: "Returned", amount: -300 }, { description: "Fee", amount: 20 }] });
    expect(asCredit(a)).toBe(a);
  });
});

describe("the pages", () => {
  const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });
  it("are one to eight PDFs or photos of at most 10 MB", () => {
    expect(pagesGap([file("a.pdf", "application/pdf")])).toBeNull();
    expect(pagesGap([])).toBe("Choose the paper to read.");
    expect(pagesGap([file("a.txt", "text/plain")])).toBe("a.txt is not a PDF or a photo (JPEG, PNG or WebP).");
    expect(pagesGap(Array.from({ length: 9 }, (_, i) => file(`${i}.png`, "image/png")))).toBe("Read at most 8 pages at a time.");
    expect(pagesGap([file("big.jpg", "image/jpeg", 10 * 1024 * 1024 + 1)])).toBe("big.jpg is too big to read. 10 MB at most.");
  });
});
