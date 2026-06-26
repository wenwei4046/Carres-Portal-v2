import { describe, expect, it } from "vitest";
import {
  campaignsCoveringLine,
  parseFreeItemEligible,
  type FreeItemCampaign,
} from "./free-item-campaign";
import type { RuleLineInput, RuleTarget } from "./rule-target";

/* ─── ids + factories ──────────────────────────────────────────────────── */

const MODEL_A = "00000000-0000-0000-0000-00000000000a";
const MODEL_B = "00000000-0000-0000-0000-00000000000b";

const mattress = (modelId: string | null, sizeCode: string | null): RuleLineInput => ({
  category: "MATTRESS",
  modelId,
  sizeCode,
  builtCompartments: [],
});

const sofa = (modelId: string, compartments: string[]): RuleLineInput => ({
  category: "SOFA",
  modelId,
  sizeCode: null,
  builtCompartments: compartments,
});

const campaign = (over: Partial<FreeItemCampaign> = {}): FreeItemCampaign => ({
  id: "00000000-0000-0000-0000-0000000ca001",
  name: "Pillow giveaway",
  active: true,
  maxFreeQty: 1,
  eligible: [{ scope: "model", modelId: MODEL_A } as RuleTarget],
  ...over,
});

const COMBOS = new Map<string, string[][]>([["cmb-pair", [["1A(LHF)"], ["1NA"]]]]);

/* ─── parseFreeItemEligible ────────────────────────────────────────────── */

describe("parseFreeItemEligible", () => {
  it("returns [] for non-arrays", () => {
    expect(parseFreeItemEligible(null)).toEqual([]);
    expect(parseFreeItemEligible("nope")).toEqual([]);
  });

  it("delegates to parseRuleTargets — keeps clean entries, drops malformed", () => {
    const out = parseFreeItemEligible([
      { scope: "model" }, // no modelId → dropped
      { scope: "model", modelId: MODEL_A },
      { scope: "variant", modelId: MODEL_B, sizeCodes: ["queen"] }, // upper-cased
      { scope: "combo", comboIds: ["cmb-pair"] }, // model-agnostic combo kept
    ]);
    expect(out).toEqual([
      { scope: "model", modelId: MODEL_A },
      { scope: "variant", modelId: MODEL_B, sizeCodes: ["QUEEN"] },
      { scope: "combo", modelId: "", comboIds: ["cmb-pair"] },
    ]);
  });
});

/* ─── campaignsCoveringLine ────────────────────────────────────────────── */

describe("campaignsCoveringLine", () => {
  it("returns an ACTIVE campaign whose eligible covers the line", () => {
    const out = campaignsCoveringLine(mattress(MODEL_A, "QUEEN"), [campaign()]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("00000000-0000-0000-0000-0000000ca001");
    expect(out[0]?.maxFreeQty).toBe(1);
  });

  it("excludes an INACTIVE campaign even when eligible matches", () => {
    expect(campaignsCoveringLine(mattress(MODEL_A, "QUEEN"), [campaign({ active: false })])).toEqual([]);
  });

  it("an EMPTY eligible covers NOTHING (the load-bearing guard, NOT 'match all')", () => {
    expect(campaignsCoveringLine(mattress(MODEL_A, "QUEEN"), [campaign({ eligible: [] })])).toEqual([]);
  });

  it("returns [] for a line with no modelId", () => {
    expect(campaignsCoveringLine(mattress(null, "QUEEN"), [campaign()])).toEqual([]);
  });

  it("does not cover a line whose model is not targeted", () => {
    expect(campaignsCoveringLine(mattress(MODEL_B, "QUEEN"), [campaign()])).toEqual([]);
  });

  it("honors a variant scope (size-specific eligibility)", () => {
    const c = campaign({ eligible: [{ scope: "variant", modelId: MODEL_A, sizeCodes: ["QUEEN"] }] });
    expect(campaignsCoveringLine(mattress(MODEL_A, "QUEEN"), [c])).toHaveLength(1);
    expect(campaignsCoveringLine(mattress(MODEL_A, "KING"), [c])).toEqual([]);
  });

  it("honors a model-agnostic combo scope via the shared matcher", () => {
    const c = campaign({ eligible: [{ scope: "combo", modelId: "", comboIds: ["cmb-pair"] }] });
    // built ⊇ the pair combo's slots → covered, even though modelId differs
    expect(campaignsCoveringLine(sofa(MODEL_B, ["1A(LHF)", "1NA", "Console"]), [c], COMBOS)).toHaveLength(1);
    // missing a slot → not covered
    expect(campaignsCoveringLine(sofa(MODEL_B, ["1A(LHF)"]), [c], COMBOS)).toEqual([]);
  });

  it("returns ALL covering campaigns (salesperson picks)", () => {
    const c1 = campaign({ id: "00000000-0000-0000-0000-0000000ca001", name: "A" });
    const c2 = campaign({ id: "00000000-0000-0000-0000-0000000ca002", name: "B", maxFreeQty: 3 });
    const out = campaignsCoveringLine(mattress(MODEL_A, "QUEEN"), [c1, c2]);
    expect(out.map((c) => c.name)).toEqual(["A", "B"]);
    expect(out[1]?.maxFreeQty).toBe(3);
  });
});
