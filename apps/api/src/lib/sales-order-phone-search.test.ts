import { describe, expect, it } from "vitest";
import { findOrdersByPhone, phoneMatches, phoneSearchDigits, phoneSearchPattern } from "./sales-order-phone-search";

describe("phoneSearchDigits — is the typed term a phone?", () => {
  it.each([
    ["0123456789", "0123456789"],
    ["012-345 6789", "0123456789"],
    ["(012) 345-6789", "0123456789"],
    ["+60123456789", "60123456789"],
    ["+60 12-345 6789", "60123456789"],
    ["  019-83372393 ", "01983372393"],
  ])("reads %s as the digits %s", (term, digits) => {
    expect(phoneSearchDigits(term)).toBe(digits);
  });

  it.each(["Tan Ah Kow", "SO-1303", "1303", "0123456", "CR0854", "012.345.6789", "0123456789 Tan", "60+123456789", "9007199254740992"])(
    "does not read %s as a phone",
    (term) => {
      expect(phoneSearchDigits(term)).toBeNull();
    },
  );
});

describe("phoneMatches — the same number however it was written", () => {
  const typed = ["0123456789", "012-345 6789", "(012) 345-6789", "+60123456789", "+60 12-345 6789", "123456789"];
  const stored = ["0123456789", "012-3456789", "012 345 6789", "+60123456789", "60123456789", "123456789", "011-1111111/012-3456789"];
  for (const t of typed)
    for (const s of stored)
      it(`typed ${t} finds stored ${s}`, () => {
        expect(phoneMatches(s, phoneSearchDigits(t)!)).toBe(true);
      });

  it("finds a number by the part the operator remembers", () => {
    expect(phoneMatches("019-83372393", phoneSearchDigits("83372393")!)).toBe(true);
  });

  it.each([
    ["0123456788", "0123456789"],
    ["+60123456788", "0123456789"],
    [null, "0123456789"],
    ["", "0123456789"],
  ])("does not match stored %s for typed %s", (s, t) => {
    expect(phoneMatches(s, phoneSearchDigits(t)!)).toBe(false);
  });

  it("never widens a short `60…` fragment into an unrelated number", () => {
    /* `60123456` stripped of `60` would be `123456` — inside 012-3456789. */
    expect(phoneMatches("012-3456789", phoneSearchDigits("60123456")!)).toBe(false);
    expect(phoneMatches("019-6012 3456", phoneSearchDigits("60123456")!)).toBe(true);
  });
});

describe("phoneSearchPattern — the server pre-filter only ever widens", () => {
  it("asks for the national digits in order, separators allowed between", () => {
    expect(phoneSearchPattern("60123456789")).toBe("%1%2%3%4%5%6%7%8%9%");
    expect(phoneSearchPattern("60123456")).toBe("%6%0%1%2%3%4%5%6%");
  });

  it("admits every stored shape that matches", () => {
    const like = (value: string, pattern: string) =>
      new RegExp(`^${pattern.split("%").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(value);
    for (const s of ["0123456789", "012-3456789", "+60 12-345 6789", "123456789", "(012) 345 6789"])
      for (const t of ["0123456789", "+60123456789", "012-345-6789"]) {
        const digits = phoneSearchDigits(t)!;
        expect(phoneMatches(s, digits)).toBe(true);
        expect(like(s, phoneSearchPattern(digits))).toBe(true);
      }
  });
});

describe("findOrdersByPhone — reads pages, fails closed", () => {
  it("keeps only the rows whose digits match and reads past a full page", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `x-${i}`, customer_phone: "0123456780" }));
    const calls: Array<[string, number, number]> = [];
    const ids = await findOrdersByPhone(async (pattern, from, to) => {
      calls.push([pattern, from, to]);
      return { data: from === 0 ? [{ id: "hit-1", customer_phone: "012-3456789" }, ...page1.slice(1)] : [{ id: "hit-2", customer_phone: "+60123456789" }], error: null };
    }, "0123456789");
    expect(ids.sort()).toEqual(["hit-1", "hit-2"]);
    expect(calls.map(([, from, to]) => [from, to])).toEqual([[0, 999], [1000, 1999]]);
    expect(calls[0]?.[0]).toBe("%1%2%3%4%5%6%7%8%9%");
  });

  it("throws on a failed read instead of reporting no match", async () => {
    await expect(findOrdersByPhone(async () => ({ data: null, error: { code: "42501", message: "denied" } }), "0123456789")).rejects.toMatchObject({ code: "42501" });
    await expect(findOrdersByPhone(async () => ({ data: null, error: null }), "0123456789")).rejects.toThrow();
  });
});
