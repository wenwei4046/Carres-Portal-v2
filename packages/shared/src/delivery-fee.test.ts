import { describe, expect, it } from "vitest";
import {
  computeDeliveryFee,
  specialModelsForLines,
  type DeliveryFeeConfig,
  type DeliveryFeeInput,
  type SpecialDeliveryRule,
} from "./delivery-fee";
import type { RuleLineInput, RuleTarget } from "./rule-target";

/* ─── config + input factories ─────────────────────────────────────────── */

const cfg = (over: Partial<DeliveryFeeConfig> = {}): DeliveryFeeConfig => ({
  baseFee: 0,
  crossCategoryFee: 0,
  chargedCategories: ["sofa", "mattress", "bedframe"],
  mattressBedframeLeadDays: 14,
  sofaLeadDays: 21,
  ...over,
});

const input = (over: Partial<DeliveryFeeInput> = {}): DeliveryFeeInput => ({
  categoryIds: [],
  specialModels: [],
  isCrossCategoryFollowup: false,
  additionalFee: 0,
  ...over,
});

const special = (standaloneFee: number, crossCategoryFollowupFee = 0) => ({
  standaloneFee,
  crossCategoryFollowupFee,
});

/* ─── computeDeliveryFee ───────────────────────────────────────────────── */

describe("computeDeliveryFee — dormant + gating", () => {
  it("dormant 0-rate config with a charged line → total 0", () => {
    const r = computeDeliveryFee(input({ categoryIds: ["sofa"] }), cfg());
    expect(r).toEqual({
      base: 0,
      crossCategory: 0,
      additional: 0,
      total: 0,
      isSpecial: false,
      isFollowup: false,
    });
  });

  it("EMPTY categoryIds gate → base 0 even with config baseFee set; only additional bills", () => {
    const r = computeDeliveryFee(
      input({ categoryIds: [], additionalFee: 10 }),
      cfg({ baseFee: 50, crossCategoryFee: 30 }),
    );
    expect(r.base).toBe(0);
    expect(r.crossCategory).toBe(0);
    expect(r.additional).toBe(10);
    expect(r.total).toBe(10);
  });

  it("EMPTY categoryIds gate holds even when a special model is present", () => {
    const r = computeDeliveryFee(
      input({ categoryIds: [], specialModels: [special(500)] }),
      cfg({ baseFee: 50 }),
    );
    expect(r.base).toBe(0);
    expect(r.isSpecial).toBe(false);
    expect(r.total).toBe(0);
  });
});

describe("computeDeliveryFee — base + cross-category", () => {
  it("a charged line bills the config baseFee, no cross when single-category", () => {
    const r = computeDeliveryFee(input({ categoryIds: ["mattress"] }), cfg({ baseFee: 50, crossCategoryFee: 30 }));
    expect(r.base).toBe(50);
    expect(r.crossCategory).toBe(0);
    expect(r.total).toBe(50);
  });

  // NOTE: the next two cases exercise the PURE engine only — a categoryIds set
  // containing both 'sofa' and a mattress/bedframe is UNREACHABLE on a real
  // Carres order (migration 0089's category mutex rejects such an order at
  // create_order, so the in-order cross surcharge never persists). They verify
  // the faithful 2990s port, not a bookable Carres order.
  it("sofa × mattress trips the cross-category surcharge (pure engine only — unreachable on a Carres order, 0089 mutex)", () => {
    const r = computeDeliveryFee(
      input({ categoryIds: ["sofa", "mattress"] }),
      cfg({ baseFee: 50, crossCategoryFee: 30 }),
    );
    expect(r.base).toBe(50);
    expect(r.crossCategory).toBe(30);
    expect(r.total).toBe(80);
  });

  it("sofa × bedframe also trips the cross-category surcharge (pure engine only — unreachable on a Carres order, 0089 mutex)", () => {
    const r = computeDeliveryFee(
      input({ categoryIds: ["sofa", "bedframe"] }),
      cfg({ baseFee: 50, crossCategoryFee: 30 }),
    );
    expect(r.crossCategory).toBe(30);
  });

  it("mattress + bedframe alone (bedroom set) does NOT trip cross-category", () => {
    const r = computeDeliveryFee(
      input({ categoryIds: ["mattress", "bedframe"] }),
      cfg({ baseFee: 50, crossCategoryFee: 30 }),
    );
    expect(r.crossCategory).toBe(0);
    expect(r.total).toBe(50);
  });

  it("sofa alone does NOT trip cross-category", () => {
    const r = computeDeliveryFee(input({ categoryIds: ["sofa"] }), cfg({ baseFee: 50, crossCategoryFee: 30 }));
    expect(r.crossCategory).toBe(0);
  });

  it("category ids are matched case-insensitively", () => {
    const r = computeDeliveryFee(
      input({ categoryIds: ["SOFA", "Mattress"] }),
      cfg({ baseFee: 50, crossCategoryFee: 30 }),
    );
    expect(r.crossCategory).toBe(30);
  });
});

describe("computeDeliveryFee — special models", () => {
  it("highest special standalone fee supersedes the base (never summed)", () => {
    const r = computeDeliveryFee(
      input({ categoryIds: ["mattress"], specialModels: [special(500), special(300)] }),
      cfg({ baseFee: 50 }),
    );
    expect(r.base).toBe(500);
    expect(r.isSpecial).toBe(true);
  });

  it("config baseFee wins when it exceeds the special standalone (max semantics)", () => {
    const r = computeDeliveryFee(
      input({ categoryIds: ["mattress"], specialModels: [special(300)] }),
      cfg({ baseFee: 600 }),
    );
    expect(r.base).toBe(600);
    expect(r.isSpecial).toBe(true);
  });

  it("special standalone stacks with the in-order cross-category surcharge", () => {
    const r = computeDeliveryFee(
      input({ categoryIds: ["sofa", "mattress"], specialModels: [special(500)] }),
      cfg({ baseFee: 50, crossCategoryFee: 30 }),
    );
    expect(r.base).toBe(500);
    expect(r.crossCategory).toBe(30);
    expect(r.total).toBe(530);
  });
});

describe("computeDeliveryFee — cross-order follow-up", () => {
  it("follow-up bills only the reduced cross rate, crossCategory 0", () => {
    const r = computeDeliveryFee(
      input({ categoryIds: ["sofa"], isCrossCategoryFollowup: true }),
      cfg({ baseFee: 500, crossCategoryFee: 175 }),
    );
    expect(r.base).toBe(175);
    expect(r.crossCategory).toBe(0);
    expect(r.total).toBe(175);
    expect(r.isFollowup).toBe(true);
  });

  it("follow-up takes the higher of config cross rate and a special follow-up fee", () => {
    const higher = computeDeliveryFee(
      input({ categoryIds: ["sofa"], isCrossCategoryFollowup: true, specialModels: [special(0, 300)] }),
      cfg({ crossCategoryFee: 175 }),
    );
    expect(higher.base).toBe(300);

    const lower = computeDeliveryFee(
      input({ categoryIds: ["sofa"], isCrossCategoryFollowup: true, specialModels: [special(0, 100)] }),
      cfg({ crossCategoryFee: 175 }),
    );
    expect(lower.base).toBe(175);
  });

  it("a follow-up with an empty cart still bills nothing (gate first)", () => {
    const r = computeDeliveryFee(
      input({ categoryIds: [], isCrossCategoryFollowup: true }),
      cfg({ crossCategoryFee: 175 }),
    );
    expect(r.base).toBe(0);
    expect(r.total).toBe(0);
  });
});

describe("computeDeliveryFee — additional fee", () => {
  it("adds the operator's free-form fee on top", () => {
    const r = computeDeliveryFee(
      input({ categoryIds: ["mattress"], additionalFee: 20 }),
      cfg({ baseFee: 50 }),
    );
    expect(r.additional).toBe(20);
    expect(r.total).toBe(70);
  });

  it("clamps a negative additional fee to 0", () => {
    const r = computeDeliveryFee(
      input({ categoryIds: ["mattress"], additionalFee: -50 }),
      cfg({ baseFee: 50 }),
    );
    expect(r.additional).toBe(0);
    expect(r.total).toBe(50);
  });
});

/* ─── specialModelsForLines ────────────────────────────────────────────── */

const MODEL_LATEX = "00000000-0000-0000-0000-0000000latex";
const COMBOS = new Map<string, string[][]>([["cmb-pair", [["1A(LHF)"], ["1NA"]]]]);
const NO_COMBOS = new Map<string, string[][]>();

const mattressLine = (modelId: string, sizeCode: string): RuleLineInput => ({
  category: "MATTRESS",
  modelId,
  sizeCode,
  builtCompartments: [],
});

describe("specialModelsForLines", () => {
  it("emits one fee per rule whose target matches ANY line", () => {
    const rules: SpecialDeliveryRule[] = [
      {
        target: [{ scope: "model", modelId: MODEL_LATEX } as RuleTarget],
        standaloneFee: 500,
        crossCategoryFollowupFee: 300,
      },
    ];
    const out = specialModelsForLines([mattressLine(MODEL_LATEX, "QUEEN")], rules, NO_COMBOS);
    expect(out).toEqual([{ standaloneFee: 500, crossCategoryFollowupFee: 300 }]);
  });

  it("emits nothing when no line matches the rule's target", () => {
    const rules: SpecialDeliveryRule[] = [
      {
        target: [{ scope: "model", modelId: MODEL_LATEX } as RuleTarget],
        standaloneFee: 500,
        crossCategoryFollowupFee: 0,
      },
    ];
    const out = specialModelsForLines([mattressLine("other-model", "QUEEN")], rules, NO_COMBOS);
    expect(out).toEqual([]);
  });

  it("an empty target rule is a global special fee (matches every cart)", () => {
    const rules: SpecialDeliveryRule[] = [
      { target: [], standaloneFee: 99, crossCategoryFollowupFee: 0 },
    ];
    expect(specialModelsForLines([mattressLine("any", "KING")], rules, NO_COMBOS)).toEqual([
      { standaloneFee: 99, crossCategoryFollowupFee: 0 },
    ]);
    // …but never matches an empty cart
    expect(specialModelsForLines([], rules, NO_COMBOS)).toEqual([]);
  });

  it("matches a sofa build via the combo subset (wired to matchSofaCombo)", () => {
    const rules: SpecialDeliveryRule[] = [
      {
        target: [{ scope: "combo", modelId: "", comboIds: ["cmb-pair"] } as RuleTarget],
        standaloneFee: 250,
        crossCategoryFollowupFee: 0,
      },
    ];
    const sofaLine: RuleLineInput = {
      category: "SOFA",
      modelId: "any-sofa-model",
      sizeCode: null,
      builtCompartments: ["1A(LHF)", "1NA", "Console"],
    };
    expect(specialModelsForLines([sofaLine], rules, COMBOS)).toEqual([
      { standaloneFee: 250, crossCategoryFollowupFee: 0 },
    ]);
  });

  it("feeds computeDeliveryFee: a matched latex mattress drives a RM 500 base", () => {
    const rules: SpecialDeliveryRule[] = [
      {
        target: [{ scope: "model", modelId: MODEL_LATEX } as RuleTarget],
        standaloneFee: 500,
        crossCategoryFollowupFee: 0,
      },
    ];
    const lines = [mattressLine(MODEL_LATEX, "QUEEN")];
    const specials = specialModelsForLines(lines, rules, NO_COMBOS);
    const r = computeDeliveryFee(
      input({ categoryIds: ["mattress"], specialModels: specials }),
      cfg({ baseFee: 50 }),
    );
    expect(r.base).toBe(500);
    expect(r.total).toBe(500);
  });
});
