import { describe, expect, it } from "vitest";
import { displayCustomerName } from "./customer-name";

describe("customer name display — owner ruling 2026-08-15", () => {
  it("raises the first letter of every word", () => {
    expect(displayCustomerName("jimmy")).toBe("Jimmy");
    expect(displayCustomerName("mei emi")).toBe("Mei Emi");
    expect(displayCustomerName("lim kuan yang")).toBe("Lim Kuan Yang");
  });

  it("NEVER lowercases a letter that is already a capital", () => {
    // The owner's own four examples, verbatim.
    expect(displayCustomerName("KJ NG")).toBe("KJ NG");
    expect(displayCustomerName("LIM KUAN YANG")).toBe("LIM KUAN YANG");
  });

  it("raises a lowercase word without touching the capitals beside it", () => {
    expect(displayCustomerName("KJ ng")).toBe("KJ Ng");
    expect(displayCustomerName("myHouse management")).toBe("MyHouse Management");
  });

  it("treats a hyphen, slash, dot and apostrophe as word starts", () => {
    expect(displayCustomerName("lim wei-ming")).toBe("Lim Wei-Ming");
    expect(displayCustomerName("o'brien")).toBe("O'Brien");
    expect(displayCustomerName("o’brien")).toBe("O’Brien");
    expect(displayCustomerName("tan a/l samy")).toBe("Tan A/L Samy");
    expect(displayCustomerName("j.lim")).toBe("J.Lim");
  });

  it("is idempotent — running it twice cannot drift", () => {
    for (const n of ["jimmy", "KJ NG", "mei emi", "LIM KUAN YANG", "o'brien"]) {
      expect(displayCustomerName(displayCustomerName(n))).toBe(displayCustomerName(n));
    }
  });

  it("leaves a non-Latin name alone", () => {
    expect(displayCustomerName("陈美怡")).toBe("陈美怡");
  });

  it("never invents an empty value — the caller's governed absence wins", () => {
    expect(displayCustomerName("")).toBe("");
    expect(displayCustomerName(null)).toBe(null);
    expect(displayCustomerName(undefined)).toBe(undefined);
  });
});
