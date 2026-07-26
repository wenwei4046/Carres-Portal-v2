import { describe, it, expect } from "vitest";
import {
  deriveGuaranteeSkuCode,
  guaranteeProductInputSchema,
  guaranteeVisitsTotal,
} from "./guarantee";

/**
 * 0274 — one category, two kinds of cover (Loo 2026-07-26).
 *
 *   one_time  = a guarantee: ONE claim
 *   recurring = a care plan: years × visits-a-year, counted down
 *
 * The bar these tests hold: the two shapes can never be authored crossed over.
 * A "recurring guarantee that replaces the mattress" would promise an unbounded
 * number of free mattresses, and the DB CHECK is the last line — this schema is
 * the one that has to give the operator a readable field error first.
 */

describe("guaranteeVisitsTotal", () => {
  it("a one-time cover is always exactly one visit", () => {
    expect(guaranteeVisitsTotal("one_time", 15, null)).toBe(1);
    // even if someone passes a visit count, one_time means one
    expect(guaranteeVisitsTotal("one_time", 15, 4)).toBe(1);
  });

  it("a recurring plan is years x visits a year", () => {
    expect(guaranteeVisitsTotal("recurring", 3, 2)).toBe(6);
    expect(guaranteeVisitsTotal("recurring", 1, 4)).toBe(4);
    expect(guaranteeVisitsTotal("recurring", 5, 3)).toBe(15);
  });

  it("never sells a plan with zero visits", () => {
    // a missing/zero rate would otherwise price a plan that can never be used
    expect(guaranteeVisitsTotal("recurring", 3, null)).toBe(1);
    expect(guaranteeVisitsTotal("recurring", 3, 0)).toBe(1);
    expect(guaranteeVisitsTotal("recurring", 0, 2)).toBe(1);
  });
});

describe("deriveGuaranteeSkuCode", () => {
  const base = { coversCategory: "mattress", modelKey: "CLOUD", coverageYears: 3 };

  it("codes a guarantee as GRT and a care plan as SVC", () => {
    expect(deriveGuaranteeSkuCode({ ...base, kind: "one_time" })).toBe("GRT-CLOUD-3Y");
    expect(deriveGuaranteeSkuCode({ ...base, kind: "recurring", visitsPerYear: 2 })).toBe(
      "SVC-CLOUD-3Y-6V",
    );
  });

  it("defaults to the guarantee shape when no kind is given (pre-0274 callers)", () => {
    expect(deriveGuaranteeSkuCode(base)).toBe("GRT-CLOUD-3Y");
  });

  it("a plan and a guarantee over the same product can never collide", () => {
    const g = deriveGuaranteeSkuCode({ ...base, kind: "one_time" });
    const s = deriveGuaranteeSkuCode({ ...base, kind: "recurring", visitsPerYear: 2 });
    expect(g).not.toBe(s);
  });

  it("carries the visit total in the code, so it reads off the label", () => {
    expect(
      deriveGuaranteeSkuCode({ ...base, coverageYears: 2, kind: "recurring", visitsPerYear: 4 }),
    ).toBe("SVC-CLOUD-2Y-8V");
  });
});

describe("guaranteeProductInputSchema — the two shapes cannot cross over", () => {
  const ok = {
    coversCategory: "mattress" as const,
    coverageYears: 15,
    price: 150,
  };

  it("accepts a plain one-time guarantee (today's payload, unchanged)", () => {
    const r = guaranteeProductInputSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.kind).toBe("one_time");
      expect(r.data.remedy).toBe("replace");
    }
  });

  it("accepts a recurring plan that services the item", () => {
    const r = guaranteeProductInputSchema.safeParse({
      ...ok,
      coverageYears: 3,
      kind: "recurring",
      remedy: "service",
      visitsPerYear: 2,
    });
    expect(r.success).toBe(true);
  });

  it("REFUSES a recurring plan with no visit rate", () => {
    const r = guaranteeProductInputSchema.safeParse({
      ...ok,
      kind: "recurring",
      remedy: "service",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("visitsPerYear"))).toBe(true);
    }
  });

  it("REFUSES a recurring plan that promises a REPLACEMENT", () => {
    // This is the dangerous one: unbounded free mattresses.
    const r = guaranteeProductInputSchema.safeParse({
      ...ok,
      kind: "recurring",
      remedy: "replace",
      visitsPerYear: 2,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("remedy"))).toBe(true);
    }
  });

  it("REFUSES a one-time cover that carries a visit schedule", () => {
    const r = guaranteeProductInputSchema.safeParse({ ...ok, visitsPerYear: 3 });
    expect(r.success).toBe(false);
  });

  it("REFUSES a one-time cover whose remedy is 'service'", () => {
    const r = guaranteeProductInputSchema.safeParse({ ...ok, remedy: "service" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("remedy"))).toBe(true);
    }
  });

  it("still refuses a visit rate outside 1-12, matching the DB CHECK", () => {
    for (const n of [0, 13, 100]) {
      const r = guaranteeProductInputSchema.safeParse({
        ...ok,
        kind: "recurring",
        remedy: "service",
        visitsPerYear: n,
      });
      expect(r.success).toBe(false);
    }
  });
});
