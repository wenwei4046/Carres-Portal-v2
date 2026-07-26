import { describe, expect, it } from "vitest";

import { matchSofaCombo } from "../sofa-pricing";
import {
  GUARANTEE_ID_REGEX,
  deriveGuaranteeSkuCode,
  guaranteeCovers,
  guaranteeProductInputSchema,
  guaranteeScopeLabel,
  guaranteeDeskStatus,
  displayGuaranteeId,
  effectiveGuaranteeStatus,
  isGuaranteeId,
  normalizeGuaranteeId,
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

describe("guarantee ID (0267) — 4 letters + 6 digits", () => {
  it("accepts the exact shape and nothing looser", () => {
    expect(GUARANTEE_ID_REGEX.test("ABCD123456")).toBe(true);
    expect(GUARANTEE_ID_REGEX.test("ABC123456")).toBe(false); // 3 letters
    expect(GUARANTEE_ID_REGEX.test("ABCD12345")).toBe(false); // 5 digits
    expect(GUARANTEE_ID_REGEX.test("ABCD1234567")).toBe(false); // 7 digits
    expect(GUARANTEE_ID_REGEX.test("abcd123456")).toBe(false); // stored form is upper
    expect(GUARANTEE_ID_REGEX.test("AB1D123456")).toBe(false); // digit in the letter block
  });

  it("forgives how a human types it off a printed Sales Order", () => {
    expect(normalizeGuaranteeId(" abcd-123 456 ")).toBe("ABCD123456");
    expect(isGuaranteeId("abcd 123456")).toBe(true);
    expect(isGuaranteeId("ABCD-123456")).toBe(true);
  });

  it("does not mistake a SO number or a name for an ID", () => {
    expect(isGuaranteeId("1258")).toBe(false);
    expect(isGuaranteeId("May Tan")).toBe(false);
    expect(isGuaranteeId("")).toBe(false);
  });

  it("the letter/digit blocks are positional, so O-vs-0 can never be ambiguous", () => {
    // "O" is only ever in the first four slots; "0" only in the last six.
    expect(isGuaranteeId("OOOO000000")).toBe(true);
    expect(isGuaranteeId("0000OOOOOO")).toBe(false);
  });

  it("displays the live ID, falling back to the retired one after a claim", () => {
    expect(displayGuaranteeId({ guaranteeId: "ABCD123456", claimedGuaranteeId: null })).toBe(
      "ABCD123456",
    );
    // Claimed: the live column is cleared but the customer's document still
    // carries the string, so the UI must still recognise it.
    expect(displayGuaranteeId({ guaranteeId: null, claimedGuaranteeId: "ZZZZ000111" })).toBe(
      "ZZZZ000111",
    );
    expect(displayGuaranteeId({ guaranteeId: null, claimedGuaranteeId: null })).toBeNull();
  });
});

describe("guaranteeDeskStatus — the three words the desk shows (Loo 2026-07-26)", () => {
  it("folds pending into Active — not claimed yet means active", () => {
    expect(guaranteeDeskStatus("pending")).toBe("active");
    expect(guaranteeDeskStatus("active")).toBe("active");
  });

  it("keeps claimed and expired as their own words", () => {
    expect(guaranteeDeskStatus("claimed")).toBe("claimed");
    expect(guaranteeDeskStatus("expired")).toBe("expired");
  });

  it("does NOT fold void into active — a cancelled order's guarantee is not live", () => {
    // Not one of Loo's three on purpose: calling this Active would invite an
    // operator to honour a guarantee whose order was cancelled.
    expect(guaranteeDeskStatus("void")).toBe("void");
  });

  it("is a pure fold of the DERIVED status, so expiry is decided by one clock", () => {
    // It takes effectiveGuaranteeStatus's output — it must not re-read a date,
    // or a browser in another timezone could disagree about claimability.
    const eff = effectiveGuaranteeStatus("active", "2020-01-01", "2026-07-26");
    expect(guaranteeDeskStatus(eff)).toBe("expired");
    const live = effectiveGuaranteeStatus("active", "2041-08-01", "2026-07-26");
    expect(guaranteeDeskStatus(live)).toBe("active");
  });
});

describe("guaranteeCovers — what a guarantee actually covers (0270)", () => {
  const MATTRESS = { category: "mattress" as const, modelId: "m1", variant: "King" };

  it("an unset level is a wildcard, so a category-only term covers everything in it", () => {
    // This is what keeps the pre-0270 term working untouched.
    expect(guaranteeCovers({ coversCategory: "mattress" }, MATTRESS)).toBe(true);
    expect(
      guaranteeCovers({ coversCategory: "mattress" }, { ...MATTRESS, modelId: "other" }),
    ).toBe(true);
  });

  it("never covers a different category", () => {
    expect(guaranteeCovers({ coversCategory: "sofa" }, MATTRESS)).toBe(false);
    expect(guaranteeCovers({ coversCategory: "mattress" }, { ...MATTRESS, category: null })).toBe(
      false,
    );
  });

  it("narrows to one model when a model is pinned", () => {
    const scope = { coversCategory: "mattress" as const, coversModelId: "m1" };
    expect(guaranteeCovers(scope, MATTRESS)).toBe(true);
    expect(guaranteeCovers(scope, { ...MATTRESS, modelId: "m2" })).toBe(false);
  });

  it("narrows to the ticked sizes, and compares them forgivingly", () => {
    const scope = {
      coversCategory: "mattress" as const,
      coversModelId: "m1",
      coversVariants: ["King", "Queen"],
    };
    expect(guaranteeCovers(scope, MATTRESS)).toBe(true);
    // authored "King", SKU says "king " — same size, different hands typed it
    expect(guaranteeCovers(scope, { ...MATTRESS, variant: "king " })).toBe(true);
    expect(guaranteeCovers(scope, { ...MATTRESS, variant: "Single" })).toBe(false);
  });

  it("an EMPTY variant list still means any size (not 'no size')", () => {
    const scope = { coversCategory: "mattress" as const, coversVariants: [] };
    expect(guaranteeCovers(scope, { ...MATTRESS, variant: "Anything" })).toBe(true);
  });

  it("a compartment-scoped guarantee matches only that compartment's sku", () => {
    const scope = { coversCategory: "sofa" as const, coversCompartmentId: "c1" };
    const line = { category: "sofa" as const, modelId: "s1", compartmentId: "c1" };
    expect(guaranteeCovers(scope, line)).toBe(true);
    expect(guaranteeCovers(scope, { ...line, compartmentId: "c2" })).toBe(false);
    expect(guaranteeCovers(scope, { ...line, compartmentId: null })).toBe(false);
  });

  it("a combo-scoped guarantee matches a BUILD whose modules satisfy the combo", () => {
    const scope = { coversCategory: "sofa" as const, coversComboId: "cb1" };
    const slots = [["1A"], ["2A"], ["CNR"]];
    const covers = (codes: string[]) =>
      guaranteeCovers(
        scope,
        { category: "sofa", modelId: "s1", builtModuleCodes: codes },
        matchSofaCombo,
        slots,
      );
    expect(covers(["1A", "2A", "CNR"])).toBe(true);
    expect(covers(["1A", "2A", "CNR", "CONSOLE"])).toBe(true); // extras are fine
    expect(covers(["1A", "2A"])).toBe(false); // a slot can't be filled
    expect(covers([])).toBe(false); // not a build at all
  });

  it("without a matcher a combo scope falls back to the MODEL — it never widens", () => {
    const scope = { coversCategory: "sofa" as const, coversComboId: "cb1", coversModelId: "s1" };
    expect(guaranteeCovers(scope, { category: "sofa", modelId: "s1" })).toBe(true);
    expect(guaranteeCovers(scope, { category: "sofa", modelId: "s2" })).toBe(false);
  });
});

describe("guaranteeScopeLabel", () => {
  it("says 'any <category>' when nothing is pinned", () => {
    expect(guaranteeScopeLabel({ coversCategory: "mattress" })).toBe("any mattress");
  });
  it("names the model and the sizes when they are", () => {
    expect(
      guaranteeScopeLabel(
        { coversCategory: "mattress", coversModelId: "m1", coversVariants: ["King", "Queen"] },
        { model: "Lumi FirmCare" },
      ),
    ).toBe("Lumi FirmCare · King / Queen");
  });
  it("names the compartment / combo for a sofa", () => {
    expect(
      guaranteeScopeLabel({ coversCategory: "sofa", coversCompartmentId: "c1" }, { compartment: "1A" }),
    ).toBe("1A (sofa)");
  });
});

describe("deriveGuaranteeSkuCode", () => {
  it("builds a clean join key from the scope + the years", () => {
    expect(deriveGuaranteeSkuCode({ coversCategory: "mattress", coverageYears: 15 })).toBe(
      "GRT-MATTRESS-15Y",
    );
    expect(
      deriveGuaranteeSkuCode({
        coversCategory: "mattress",
        modelKey: "lumi firmcare",
        variants: ["King"],
        coverageYears: 10,
      }),
    ).toBe("GRT-LUMI-FIRMCARE-KING-10Y");
  });

  it("collapses several sizes rather than growing an unbounded code", () => {
    expect(
      deriveGuaranteeSkuCode({
        coversCategory: "mattress",
        modelKey: "lumi",
        variants: ["King", "Queen", "Single"],
        coverageYears: 5,
      }),
    ).toBe("GRT-LUMI-3SIZES-5Y");
  });

  it("prefers the compartment / combo over the model when one is pinned", () => {
    expect(
      deriveGuaranteeSkuCode({
        coversCategory: "sofa",
        modelKey: "booqit",
        compartmentCode: "1A(LHF)",
        coverageYears: 3,
      }),
    ).toBe("GRT-1A-LHF-3Y");
  });
});

describe("guaranteeProductInputSchema — the authoring contract", () => {
  const base = { coversCategory: "mattress" as const, coverageYears: 15 };

  it("takes the simple case and defaults the remedy + price", () => {
    const p = guaranteeProductInputSchema.parse(base);
    expect(p.remedy).toBe("replace");
    expect(p.price).toBe(0);
  });

  it("refuses a combo AND a compartment at once — they are different things", () => {
    expect(() =>
      guaranteeProductInputSchema.parse({
        coversCategory: "sofa",
        coverageYears: 5,
        coversComboId: "11111111-1111-1111-1111-111111111111",
        coversCompartmentId: "22222222-2222-2222-2222-222222222222",
      }),
    ).toThrow();
  });

  it("refuses combo / compartment scope outside sofa", () => {
    expect(() =>
      guaranteeProductInputSchema.parse({
        ...base,
        coversComboId: "11111111-1111-1111-1111-111111111111",
      }),
    ).toThrow();
  });

  it("refuses variants on a category that has no size axis (Loo: accessories)", () => {
    expect(() =>
      guaranteeProductInputSchema.parse({
        coversCategory: "accessory",
        coverageYears: 2,
        coversVariants: ["King"],
      }),
    ).toThrow();
  });

  it("keeps the DDL bounds so zod never passes a doomed payload", () => {
    expect(() => guaranteeProductInputSchema.parse({ ...base, coverageYears: 0 })).toThrow();
    expect(() => guaranteeProductInputSchema.parse({ ...base, coverageYears: 51 })).toThrow();
  });
});

describe("guaranteeCovers — sizes are compared CANONICALLY (Loo 2026-07-26)", () => {
  // The bug this locks: the size POOL stores a code ("K") with a marketing
  // label ("6FT"), while a mattress SKU's variant is the full name ("King").
  // A raw string compare authored a guarantee that silently covered NOTHING —
  // the precise failure this feature exists to prevent.
  const scope = { coversCategory: "mattress" as const, coversVariants: ["King"] };
  const line = (variant: string) => ({
    category: "mattress" as const,
    modelId: "m1",
    variant,
  });

  it("matches the SKU's full name against a pool CODE", () => {
    expect(guaranteeCovers({ ...scope, coversVariants: ["K"] }, line("King"))).toBe(true);
  });

  it("does NOT treat the pool's marketing label as a size token", () => {
    // "6FT" is per-row display config, not a size name — canonicalSize knows
    // codes and names only, and baking arbitrary labels in would be wrong.
    // This is why the CHIP stores the canonical name, not the label.
    expect(guaranteeCovers({ ...scope, coversVariants: ["6FT"] }, line("King"))).toBe(false);
  });

  it("matches whichever way round the two were written", () => {
    expect(guaranteeCovers(scope, line("K"))).toBe(true);
    expect(guaranteeCovers(scope, line("king"))).toBe(true);
    expect(guaranteeCovers(scope, line(" King "))).toBe(true);
  });

  it("still tells two different sizes apart", () => {
    expect(guaranteeCovers(scope, line("Queen"))).toBe(false);
    expect(guaranteeCovers(scope, line("Q"))).toBe(false);
    expect(guaranteeCovers({ ...scope, coversVariants: ["SS"] }, line("Single"))).toBe(false);
    expect(guaranteeCovers({ ...scope, coversVariants: ["SS"] }, line("Super Single"))).toBe(true);
  });
});
