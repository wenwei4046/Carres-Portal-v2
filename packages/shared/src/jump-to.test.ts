import { describe, expect, it } from "vitest";
import {
  grnDateFromQuery,
  numericPrefixRanges,
  parseJumpQuery,
  rankJumpDocuments,
  type JumpDocumentResult,
} from "./jump-to";

describe("parseJumpQuery", () => {
  it("an empty box can still match every governed type", () => {
    const p = parseJumpQuery("   ");
    expect(p.types).toEqual(["SO", "PO", "GRN", "INV"]);
    expect(p.term).toBe("");
  });

  it("a named prefix narrows to that ONE type", () => {
    expect(parseJumpQuery("SO-1307").types).toEqual(["SO"]);
    expect(parseJumpQuery("po 2051").types).toEqual(["PO"]);
    expect(parseJumpQuery("grn-020826-4417").types).toEqual(["GRN"]);
    expect(parseJumpQuery("inv").types).toEqual(["INV"]);
  });

  it("reads the number the way the paper spells it — dash, space or neither", () => {
    for (const typed of ["SO-1307", "SO 1307", "so1307"]) {
      const p = parseJumpQuery(typed);
      expect(p.types, typed).toEqual(["SO"]);
      expect(p.term, typed).toBe("1307");
      expect(p.digits, typed).toBe("1307");
    }
  });

  it("bare digits stay open to every type — the operator has not said which", () => {
    const p = parseJumpQuery("1307");
    expect(p.types).toEqual(["SO", "PO", "GRN", "INV"]);
    expect(p.digits).toBe("1307");
  });

  /* The failure this guards: a two-letter prefix eating the front of a longer
   * one. `INV` starts with `I`, not with `SO`/`PO`, but a naive scan that
   * matched shortest-first would classify `GRN…` as a bare term. */
  it("matches the LONGEST prefix, never a shorter one inside it", () => {
    expect(parseJumpQuery("GRN020826").term).toBe("020826");
    expect(parseJumpQuery("INV-FIX-3208").term).toBe("FIX-3208");
  });
});

describe("numericPrefixRanges", () => {
  it("a full 4-digit SO matches itself and everything spelt longer", () => {
    expect(numericPrefixRanges("1307", 5)).toEqual([
      { gte: 1307, lt: 1308 },
      { gte: 13070, lt: 13080 },
    ]);
  });

  it("a partial prefix covers every length it could be", () => {
    expect(numericPrefixRanges("13", 4)).toEqual([
      { gte: 13, lt: 14 },
      { gte: 130, lt: 140 },
      { gte: 1300, lt: 1400 },
    ]);
  });

  it("refuses what cannot start an integer — non-digits and a leading zero", () => {
    expect(numericPrefixRanges("13A")).toEqual([]);
    expect(numericPrefixRanges("0130")).toEqual([]);
    expect(numericPrefixRanges("12345678")).toEqual([]);
  });

  /* Negative control: SO-1307 must fall INSIDE the range a "13" prefix builds,
   * or the range arithmetic is decorative. */
  it("the ranges really contain the number they claim", () => {
    const ranges = numericPrefixRanges("13", 4);
    expect(ranges.some((r) => 1307 >= r.gte && 1307 < r.lt)).toBe(true);
    expect(ranges.some((r) => 1207 >= r.gte && 1207 < r.lt)).toBe(false);
  });
});

describe("grnDateFromQuery", () => {
  it("reads the document date back out of the number", () => {
    expect(grnDateFromQuery("020826-4417")).toBe("2026-08-02");
    expect(grnDateFromQuery("-020826")).toBe("2026-08-02");
  });

  it("returns null until the date is complete or when it is impossible", () => {
    expect(grnDateFromQuery("0208")).toBeNull();
    expect(grnDateFromQuery("021326")).toBeNull(); // month 13
    expect(grnDateFromQuery("003826")).toBeNull(); // day 0
  });
});

describe("rankJumpDocuments", () => {
  const doc = (type: JumpDocumentResult["type"], number: string): JumpDocumentResult => ({
    type,
    number,
    party: null,
    href: "/x",
  });

  it("an exact number is first, whatever type it is", () => {
    const ranked = rankJumpDocuments(
      [doc("SO", "SO-1307"), doc("PO", "PO-1307"), doc("SO", "SO-13070")],
      "PO-1307",
    );
    expect(ranked[0]?.number).toBe("PO-1307");
  });

  it("a prefix match beats a digits-only match", () => {
    const ranked = rankJumpDocuments([doc("SO", "SO-11307"), doc("SO", "SO-1307")], "SO-130");
    expect(ranked[0]?.number).toBe("SO-1307");
  });
});
