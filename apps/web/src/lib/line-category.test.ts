import { describe, expect, it } from "vitest";
import { stockMatchKey, lineCategory, lineSize } from "./line-category";

/**
 * stockMatchKey is the ONE rule that links an order line to warehouse free stock
 * (readiness badge + Warehouse-stock panel filter). It must survive case /
 * punctuation drift AND unify the two ways a size is written (-Q vs "Queen"),
 * while keeping fabric distinct so a sofa in fabric A never silently matches
 * fabric B (that's the "Loan any sofa" escape hatch, not a match).
 */
describe("stockMatchKey", () => {
  it("ignores case + punctuation drift between order line and stock", () => {
    expect(stockMatchKey("Breeze FirmCare-B1201F-Q")).toBe(
      stockMatchKey("Breeze Firmcare B1201F-Q"),
    );
  });

  it("unifies the -Q suffix with the word Queen (the locked -Q = Queen rule)", () => {
    expect(stockMatchKey("Breeze FirmCare-B1201F-Q")).toBe(
      stockMatchKey("Breeze FirmCare B1201F Queen"),
    );
  });

  it("unifies the -S suffix with the word Single", () => {
    expect(stockMatchKey("Sonic-S")).toBe(stockMatchKey("Sonic Single"));
  });

  it("keeps different sizes distinct (Queen never matches King)", () => {
    expect(stockMatchKey("Breeze FirmCare-B1201F-Q")).not.toBe(
      stockMatchKey("Breeze FirmCare-B1201F-K"),
    );
  });

  it("keeps different fabrics distinct on a sofa (no silent cross-fabric match)", () => {
    expect(stockMatchKey("1013Jager/Fab2-Queen")).not.toBe(
      stockMatchKey("1013Jager/Fab3-Queen"),
    );
  });

  it("matches the same sofa model + fabric + size across naming drift", () => {
    expect(stockMatchKey("1013Jager/Fab2-Queen")).toBe(
      stockMatchKey("1013 Jager / Fab2 - Q"),
    );
  });
});

describe("lineSize (size canonicalization used by stockMatchKey)", () => {
  it("reads the word form", () => {
    expect(lineSize("Something Queen")).toBe("Q");
    expect(lineSize("Something King")).toBe("K");
    expect(lineSize("Something Super Single")).toBe("S");
  });
  it("reads the suffix form", () => {
    expect(lineSize("Model-Q")).toBe("Q");
    expect(lineSize("Model-K")).toBe("K");
  });
});

describe("lineCategory (drives the Loan-any-sofa gate)", () => {
  it("classifies a sofa by keyword", () => {
    expect(lineCategory("Muro 3 Seater")).toBe("sofa");
    expect(lineCategory("sofa:Nuvio")).toBe("sofa");
  });
  it("classifies a mattress and does not call it a sofa", () => {
    expect(lineCategory("Breeze FirmCare-B1201F-Q")).toBe("mattress");
  });
});
