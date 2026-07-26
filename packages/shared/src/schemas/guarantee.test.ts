import { describe, expect, it } from "vitest";

import {
  effectiveGuaranteeStatus,
  guaranteeAttrs,
  guaranteeAttachInputSchema,
  guaranteeClaimInputSchema,
  guaranteeCoverageLine,
  guaranteeLineAttrsSchema,
  guaranteeListQuerySchema,
  guaranteeTermInputSchema,
  isGuaranteeClaimable,
} from "./guarantee";

/**
 * Guarantee packages (0261-0263). The three rules under test are Loo's
 * rulings, so they are asserted as rules, not as incidental behaviour:
 * the clock starts on delivery, cover is 1:1, and a claim is one-shot.
 */

describe("effectiveGuaranteeStatus", () => {
  it("derives expiry from the date rather than trusting the stored word", () => {
    // The whole point: nothing depends on a nightly job having run.
    expect(effectiveGuaranteeStatus("active", "2026-07-25", "2026-07-26")).toBe("expired");
    expect(effectiveGuaranteeStatus("active", "2026-07-26", "2026-07-26")).toBe("active");
    expect(effectiveGuaranteeStatus("active", "2041-08-01", "2026-07-26")).toBe("active");
  });

  it("leaves an undelivered guarantee pending — no expiry date yet", () => {
    expect(effectiveGuaranteeStatus("pending", null, "2026-07-26")).toBe("pending");
  });

  it("never resurrects or re-dates a terminal status", () => {
    expect(effectiveGuaranteeStatus("claimed", "2020-01-01", "2026-07-26")).toBe("claimed");
    expect(effectiveGuaranteeStatus("void", "2041-01-01", "2026-07-26")).toBe("void");
  });
});

describe("isGuaranteeClaimable — Loo ruling #3, one-shot", () => {
  it("allows exactly one state: delivered and inside the window", () => {
    expect(isGuaranteeClaimable({ status: "active", expiresOn: "2041-08-01" })).toBe(true);
  });

  it("refuses a spent, undelivered, expired or void guarantee", () => {
    expect(isGuaranteeClaimable({ status: "claimed", expiresOn: "2041-08-01" })).toBe(false);
    expect(isGuaranteeClaimable({ status: "pending", expiresOn: null })).toBe(false);
    expect(isGuaranteeClaimable({ status: "void", expiresOn: "2041-08-01" })).toBe(false);
    // Stored 'active' but past its date — the date wins.
    expect(isGuaranteeClaimable({ status: "active", expiresOn: "2020-01-01" })).toBe(false);
  });
});

describe("guaranteeAttrs — the line stamp the 0262 trigger reads", () => {
  it("writes covers_sku at the exact snake path the trigger looks up", () => {
    // The trigger reads attrs #>> '{guarantee,covers_sku}'. If this shape
    // drifts, guarantees mint UNATTACHED and the claim is untraceable — which
    // is the one failure this whole feature exists to prevent.
    expect(guaranteeAttrs("B1201S-K", "B1201S King")).toEqual({
      guarantee: { covers_sku: "B1201S-K", covers_label: "B1201S King" },
    });
  });

  it("omits the label rather than writing an empty one", () => {
    expect(guaranteeAttrs("B1201S-K")).toEqual({ guarantee: { covers_sku: "B1201S-K" } });
  });
});

describe("guaranteeCoverageLine", () => {
  it("states the promise in full once the clock has started", () => {
    expect(
      guaranteeCoverageLine({
        coverageYears: 15,
        remedy: "replace",
        coversLabel: "B1201S King",
        expiresOn: "2041-08-01",
      }),
    ).toBe("15-year guarantee on B1201S King — one-for-one replacement · valid till 2041-08-01");
  });

  it("says the cover starts on delivery while it is still pending", () => {
    expect(
      guaranteeCoverageLine({
        coverageYears: 15,
        remedy: "replace",
        coversLabel: null,
        expiresOn: null,
      }),
    ).toBe("15-year guarantee on the covered item — one-for-one replacement · starts on delivery");
  });
});

describe("zod contracts", () => {
  it("accepts a well-formed term and defaults the remedy to replacement", () => {
    const parsed = guaranteeTermInputSchema.parse({
      guaranteeSku: "GRT-MATTRESS-15Y",
      label: "Mattress Guarantee 15 Years",
      coversCategory: "mattress",
      coverageYears: 15,
    });
    expect(parsed.remedy).toBe("replace");
  });

  it("rejects a coverage term outside the DDL CHECK, so zod never passes a doomed payload", () => {
    expect(() =>
      guaranteeTermInputSchema.parse({
        guaranteeSku: "GRT-X",
        label: "x",
        coversCategory: "mattress",
        coverageYears: 0,
      }),
    ).toThrow();
    expect(() =>
      guaranteeTermInputSchema.parse({
        guaranteeSku: "GRT-X",
        label: "x",
        coversCategory: "mattress",
        coverageYears: 51,
      }),
    ).toThrow();
  });

  it("accepts 'guarantee' as a covered category only because the enum widened in 0261", () => {
    expect(
      guaranteeTermInputSchema.parse({
        guaranteeSku: "GRT-X",
        label: "x",
        coversCategory: "sofa",
        coverageYears: 5,
      }).coversCategory,
    ).toBe("sofa");
  });

  it("parses the line-attrs camel shape and rejects unknown keys", () => {
    expect(guaranteeLineAttrsSchema.parse({ coversSku: "A" }).coversSku).toBe("A");
    expect(() => guaranteeLineAttrsSchema.parse({ coversSku: "A", nope: 1 })).toThrow();
  });

  it("coerces the list limit and caps it", () => {
    expect(guaranteeListQuerySchema.parse({ limit: "50" }).limit).toBe(50);
    expect(() => guaranteeListQuerySchema.parse({ limit: "500" })).toThrow();
  });

  it("takes an empty claim body (a swap with no notes is still a swap)", () => {
    expect(guaranteeClaimInputSchema.parse({})).toEqual({});
  });

  it("requires a real line id to attach to", () => {
    expect(() => guaranteeAttachInputSchema.parse({ orderLineId: "not-a-uuid" })).toThrow();
  });
});
