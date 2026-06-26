import { describe, expect, it } from "vitest";
import {
  parseRuleTargets,
  parseTargetRefinement,
  refinementMatchesLine,
  lineMatchesTarget,
  lineMatchesTargets,
  type RuleLineInput,
  type RuleTarget,
} from "./rule-target";

/* ─── line factories ───────────────────────────────────────────────────── */

const MODEL_A = "00000000-0000-0000-0000-00000000000a";
const MODEL_B = "00000000-0000-0000-0000-00000000000b";

const mattress = (modelId: string, sizeCode: string): RuleLineInput => ({
  category: "MATTRESS",
  modelId,
  sizeCode,
  builtCompartments: [],
});

const sofa = (modelId: string | null, compartments: string[]): RuleLineInput => ({
  category: "SOFA",
  modelId,
  sizeCode: null,
  builtCompartments: compartments,
});

/** A combo slot map keyed by combo id (slots stored in normalized code form). */
const COMBOS = new Map<string, string[][]>([
  ["cmb-3str", [["1A(LHF)"], ["1NA"], ["1A(RHF)"]]],
  ["cmb-pair", [["1A(LHF)"], ["1NA"]]],
]);
const NO_COMBOS = new Map<string, string[][]>();

/* ─── parseTargetRefinement / parseRuleTargets ─────────────────────────── */

describe("parseTargetRefinement", () => {
  it("defaults an unknown / missing scope to 'model'", () => {
    expect(parseTargetRefinement({})).toEqual({ scope: "model" });
    expect(parseTargetRefinement({ scope: "bogus" })).toEqual({ scope: "model" });
  });

  it("upper-cases + trims variant sizeCodes, drops a variant with no sizes", () => {
    expect(parseTargetRefinement({ scope: "variant", sizeCodes: [" queen ", "king"] })).toEqual({
      scope: "variant",
      sizeCodes: ["QUEEN", "KING"],
    });
    expect(parseTargetRefinement({ scope: "variant", sizeCodes: [] })).toBeNull();
    expect(parseTargetRefinement({ scope: "variant" })).toBeNull();
  });

  it("keeps compartment codes verbatim (trim only), drops empty", () => {
    expect(parseTargetRefinement({ scope: "compartment", compartments: [" 1A(LHF) "] })).toEqual({
      scope: "compartment",
      compartments: ["1A(LHF)"],
    });
    expect(parseTargetRefinement({ scope: "compartment", compartments: [] })).toBeNull();
  });

  it("accepts comboIds[] and a legacy single comboId", () => {
    expect(parseTargetRefinement({ scope: "combo", comboIds: ["x", "y"] })).toEqual({
      scope: "combo",
      comboIds: ["x", "y"],
    });
    expect(parseTargetRefinement({ scope: "combo", comboId: "z" })).toEqual({
      scope: "combo",
      comboIds: ["z"],
    });
    expect(parseTargetRefinement({ scope: "combo" })).toBeNull();
  });
});

describe("parseRuleTargets", () => {
  it("returns [] for non-arrays", () => {
    expect(parseRuleTargets(null)).toEqual([]);
    expect(parseRuleTargets({})).toEqual([]);
    expect(parseRuleTargets("nope")).toEqual([]);
  });

  it("drops a non-combo entry with no modelId, keeps a combo entry without one", () => {
    const out = parseRuleTargets([
      { scope: "model" }, // no modelId → dropped
      { scope: "model", modelId: MODEL_A },
      { scope: "combo", comboIds: ["cmb-pair"] }, // modelId-less combo kept
    ]);
    expect(out).toEqual([
      { scope: "model", modelId: MODEL_A },
      { scope: "combo", modelId: "", comboIds: ["cmb-pair"] },
    ]);
  });

  it("drops malformed entries (null / non-object / unusable refinement)", () => {
    const out = parseRuleTargets([
      null,
      42,
      { scope: "variant", modelId: MODEL_A, sizeCodes: [] }, // unusable → dropped
      { scope: "variant", modelId: MODEL_A, sizeCodes: ["QUEEN"] },
    ]);
    expect(out).toEqual([{ scope: "variant", modelId: MODEL_A, sizeCodes: ["QUEEN"] }]);
  });
});

/* ─── refinementMatchesLine (scope semantics) ──────────────────────────── */

describe("refinementMatchesLine — scope semantics", () => {
  it("model: matches any line (model already fixed by the caller)", () => {
    expect(refinementMatchesLine(mattress(MODEL_A, "QUEEN"), { scope: "model" }, NO_COMBOS)).toBe(true);
    expect(refinementMatchesLine(sofa(MODEL_A, ["1NA"]), { scope: "model" }, NO_COMBOS)).toBe(true);
  });

  it("variant: matches a listed size (case-insensitive), rejects unlisted + sofa", () => {
    const ref = { scope: "variant" as const, sizeCodes: ["QUEEN", "KING"] };
    expect(refinementMatchesLine(mattress(MODEL_A, "queen"), ref, NO_COMBOS)).toBe(true);
    expect(refinementMatchesLine(mattress(MODEL_A, "SINGLE"), ref, NO_COMBOS)).toBe(false);
    // a sofa line has no size → variant scope never matches it
    expect(refinementMatchesLine(sofa(MODEL_A, ["1NA"]), ref, NO_COMBOS)).toBe(false);
  });

  it("compartment: normalizes both sides, rejects non-sofa", () => {
    const ref = { scope: "compartment" as const, compartments: ["1A(LHF)"] };
    // build carries the dash form; normalizeCompartmentCode unifies it
    expect(refinementMatchesLine(sofa(MODEL_A, ["1A-LHF", "1NA"]), ref, NO_COMBOS)).toBe(true);
    expect(refinementMatchesLine(sofa(MODEL_A, ["1NA", "Console"]), ref, NO_COMBOS)).toBe(false);
    // a mattress line is never a compartment match
    expect(refinementMatchesLine(mattress(MODEL_A, "QUEEN"), ref, NO_COMBOS)).toBe(false);
  });

  it("combo: matches via shared matchSofaCombo subset, rejects when a slot is uncoverable", () => {
    const refPair = { scope: "combo" as const, comboIds: ["cmb-pair"] };
    // built ⊇ the pair combo's slots → match
    expect(refinementMatchesLine(sofa(MODEL_A, ["1A(LHF)", "1NA", "Console"]), refPair, COMBOS)).toBe(true);
    // missing the 1NA slot → no match
    expect(refinementMatchesLine(sofa(MODEL_A, ["1A(LHF)", "Console"]), refPair, COMBOS)).toBe(false);
    // unknown combo id → no slots → no match
    expect(refinementMatchesLine(sofa(MODEL_A, ["1A(LHF)", "1NA"]), { scope: "combo", comboIds: ["ghost"] }, COMBOS)).toBe(false);
    // a mattress line is never a combo match
    expect(refinementMatchesLine(mattress(MODEL_A, "QUEEN"), refPair, COMBOS)).toBe(false);
  });
});

/* ─── lineMatchesTarget — model gate ───────────────────────────────────── */

describe("lineMatchesTarget — modelId gate", () => {
  it("non-combo scopes require the SAME modelId", () => {
    const t: RuleTarget = { scope: "model", modelId: MODEL_A };
    expect(lineMatchesTarget(mattress(MODEL_A, "QUEEN"), t, NO_COMBOS)).toBe(true);
    expect(lineMatchesTarget(mattress(MODEL_B, "QUEEN"), t, NO_COMBOS)).toBe(false);
  });

  it("combo scope matches regardless of modelId (model-agnostic combo entry)", () => {
    const t: RuleTarget = { scope: "combo", modelId: "", comboIds: ["cmb-pair"] };
    // build's modelId differs from the (empty) target modelId, still matches by slots
    expect(lineMatchesTarget(sofa(MODEL_B, ["1A(LHF)", "1NA"]), t, COMBOS)).toBe(true);
  });
});

/* ─── lineMatchesTargets — OR + empty = all + relative strictness ──────── */

describe("lineMatchesTargets", () => {
  it("empty targets match EVERY line (caller scopes category)", () => {
    expect(lineMatchesTargets(mattress(MODEL_A, "QUEEN"), [], NO_COMBOS)).toBe(true);
    expect(lineMatchesTargets(sofa(MODEL_A, ["1NA"]), [], NO_COMBOS)).toBe(true);
  });

  it("OR across entries — a line matches if ANY target covers it", () => {
    const targets: RuleTarget[] = [
      { scope: "variant", modelId: MODEL_A, sizeCodes: ["KING"] },
      { scope: "variant", modelId: MODEL_A, sizeCodes: ["QUEEN"] },
    ];
    expect(lineMatchesTargets(mattress(MODEL_A, "QUEEN"), targets, NO_COMBOS)).toBe(true);
    expect(lineMatchesTargets(mattress(MODEL_A, "SINGLE"), targets, NO_COMBOS)).toBe(false);
  });

  it("a variant target is STRICTER than a model target on the same model", () => {
    const single = mattress(MODEL_A, "SINGLE");
    // model scope covers any variant of MODEL_A …
    expect(lineMatchesTargets(single, [{ scope: "model", modelId: MODEL_A }], NO_COMBOS)).toBe(true);
    // … but a QUEEN-only variant target does not cover the SINGLE line
    expect(
      lineMatchesTargets(single, [{ scope: "variant", modelId: MODEL_A, sizeCodes: ["QUEEN"] }], NO_COMBOS),
    ).toBe(false);
  });
});
