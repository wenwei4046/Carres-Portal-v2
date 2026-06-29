import { describe, it, expect } from "vitest";
import { resolvePwp, type PwpRule, type PwpLineInput } from "./pwp";

// Standard rule: buy an eligible Mattress model → redeem an eligible Bed Frame
// model at PWP price, 1 per mattress unit. Ported from 2990s pwp.test.ts and
// mechanically translated to the Carres RuleTarget shape (triggerEligibleModelIds
// → triggerTargets:[{scope:'model',modelId}]; empty lists → []; + type:'pwp').
const RULE: PwpRule = {
  type: "pwp",
  triggerCategory: "MATTRESS",
  triggerTargets: [{ scope: "model", modelId: "m-ok" }],
  rewardCategory: "BEDFRAME",
  rewardTargets: [{ scope: "model", modelId: "b-ok" }],
  qtyPerTrigger: 1,
};

type LineOpts = { qty?: number; name?: string; code?: string; pwp?: boolean; isReward?: boolean };
const line = (idx: number, category: string, modelId: string | null, o: LineOpts = {}): PwpLineInput => ({
  idx,
  category,
  modelId,
  sizeCode: null,
  builtCompartments: [],
  qty: o.qty ?? 1,
  productName: o.name,
  productCode: o.code,
  pwpRequested: o.pwp ?? false,
  ...(o.isReward !== undefined ? { isReward: o.isReward } : {}),
});

const grantedIdx = (
  rules: PwpRule[],
  lines: PwpLineInput[],
  comboMap?: Map<string, string[][]>,
): number[] =>
  resolvePwp(rules, lines, comboMap)
    .map((g) => g.idx)
    .sort((a, b) => a - b);

describe("resolvePwp", () => {
  it("grants each requested reward up to allowance (3 mattress → 3 bedframes)", () => {
    const lines = [
      line(0, "MATTRESS", "m-ok"),
      line(1, "MATTRESS", "m-ok"),
      line(2, "MATTRESS", "m-ok"),
      line(3, "BEDFRAME", "b-ok", { pwp: true }),
      line(4, "BEDFRAME", "b-ok", { pwp: true }),
      line(5, "BEDFRAME", "b-ok", { pwp: true }),
    ];
    expect(grantedIdx([RULE], lines)).toEqual([3, 4, 5]);
  });

  it("the 4th bedframe is NOT granted when only 3 mattresses bought (over allowance)", () => {
    const lines = [
      line(0, "MATTRESS", "m-ok"),
      line(1, "MATTRESS", "m-ok"),
      line(2, "MATTRESS", "m-ok"),
      line(3, "BEDFRAME", "b-ok", { pwp: true }),
      line(4, "BEDFRAME", "b-ok", { pwp: true }),
      line(5, "BEDFRAME", "b-ok", { pwp: true }),
      line(6, "BEDFRAME", "b-ok", { pwp: true }),
    ];
    expect(grantedIdx([RULE], lines)).toEqual([3, 4, 5]); // idx 6 dropped
  });

  it("no qualifying trigger → no grants", () => {
    const lines = [line(0, "BEDFRAME", "b-ok", { pwp: true })];
    expect(grantedIdx([RULE], lines)).toEqual([]);
  });

  it("trigger model NOT in the eligible list does not unlock", () => {
    const lines = [
      line(0, "MATTRESS", "m-other"), // not 'm-ok'
      line(1, "BEDFRAME", "b-ok", { pwp: true }),
    ];
    expect(grantedIdx([RULE], lines)).toEqual([]);
  });

  it("reward model NOT in the eligible list is not granted", () => {
    const lines = [
      line(0, "MATTRESS", "m-ok"),
      line(1, "BEDFRAME", "b-other", { pwp: true }), // not 'b-ok'
    ];
    expect(grantedIdx([RULE], lines)).toEqual([]);
  });

  it("does not grant a reward line that was not toggled (pwpRequested=false)", () => {
    const lines = [
      line(0, "MATTRESS", "m-ok"),
      line(1, "BEDFRAME", "b-ok", { pwp: false }),
    ];
    expect(grantedIdx([RULE], lines)).toEqual([]);
  });

  it("qtyPerTrigger scales the allowance (1 mattress → 2 bedframes)", () => {
    const rule: PwpRule = { ...RULE, qtyPerTrigger: 2 };
    const lines = [
      line(0, "MATTRESS", "m-ok"),
      line(1, "BEDFRAME", "b-ok", { pwp: true }),
      line(2, "BEDFRAME", "b-ok", { pwp: true }),
      line(3, "BEDFRAME", "b-ok", { pwp: true }),
    ];
    expect(grantedIdx([rule], lines)).toEqual([1, 2]); // 3rd over allowance
  });

  it("empty eligible lists mean the whole category qualifies", () => {
    const rule: PwpRule = { ...RULE, triggerTargets: [], rewardTargets: [] };
    const lines = [
      line(0, "MATTRESS", "anything"),
      line(1, "BEDFRAME", "whatever", { pwp: true }),
    ];
    expect(grantedIdx([rule], lines)).toEqual([1]);
  });

  it("binds each granted reward to a specific trigger unit (greedy by order)", () => {
    const lines = [
      line(0, "MATTRESS", "m-ok", { name: "Sealy Posture", code: "SLY-Q" }),
      line(1, "MATTRESS", "m-ok", { name: "King Koil", code: "KK-Q" }),
      line(2, "BEDFRAME", "b-ok", { pwp: true }),
      line(3, "BEDFRAME", "b-ok", { pwp: true }),
    ];
    const grants = resolvePwp([RULE], lines);
    expect(grants.find((g) => g.idx === 2)?.triggerRef).toEqual({ name: "Sealy Posture", code: "SLY-Q" });
    expect(grants.find((g) => g.idx === 3)?.triggerRef).toEqual({ name: "King Koil", code: "KK-Q" });
  });

  it("a multi-qty reward line is all-or-nothing against the allowance", () => {
    // allowance 3; line A qty2 (granted, consumes 2), line B qty2 (needs 2, only 1 left → dropped)
    const lines = [
      line(0, "MATTRESS", "m-ok", { qty: 3 }),
      line(1, "BEDFRAME", "b-ok", { pwp: true, qty: 2 }),
      line(2, "BEDFRAME", "b-ok", { pwp: true, qty: 2 }),
    ];
    expect(grantedIdx([RULE], lines)).toEqual([1]);
  });

  it("a legacy line with null modelId never matches a non-empty model list", () => {
    const lines = [
      line(0, "MATTRESS", null), // null can't match {scope:'model',modelId:'m-ok'}
      line(1, "BEDFRAME", "b-ok", { pwp: true }),
    ];
    expect(grantedIdx([RULE], lines)).toEqual([]);
  });
});

// Chairman 2026-06-02 — MULTIPLE differentiated rules for the SAME category pair
// (MATTRESS→BEDFRAME): "2990 AKKA unlocks Aria" + "2990 KETTA unlocks Orient".
describe("resolvePwp — multiple differentiated rules", () => {
  const RULE_A: PwpRule = {
    type: "pwp",
    triggerCategory: "MATTRESS",
    triggerTargets: [{ scope: "model", modelId: "akka" }],
    rewardCategory: "BEDFRAME",
    rewardTargets: [{ scope: "model", modelId: "aria" }],
    qtyPerTrigger: 1,
  };
  const RULE_B: PwpRule = {
    type: "pwp",
    triggerCategory: "MATTRESS",
    triggerTargets: [{ scope: "model", modelId: "ketta" }],
    rewardCategory: "BEDFRAME",
    rewardTargets: [{ scope: "model", modelId: "orient" }],
    qtyPerTrigger: 1,
  };

  it("each reward is granted by its own rule", () => {
    const lines = [
      line(0, "MATTRESS", "akka"),
      line(1, "MATTRESS", "ketta"),
      line(2, "BEDFRAME", "aria", { pwp: true }),
      line(3, "BEDFRAME", "orient", { pwp: true }),
    ];
    expect(grantedIdx([RULE_A, RULE_B], lines)).toEqual([2, 3]);
  });

  it("a reward is NOT granted when only the OTHER rule's trigger was bought", () => {
    // Bought AKKA (rule A trigger) but want Orient (rule B reward) → no.
    const lines = [
      line(0, "MATTRESS", "akka"),
      line(1, "BEDFRAME", "orient", { pwp: true }),
    ];
    expect(grantedIdx([RULE_A, RULE_B], lines)).toEqual([]);
  });

  it("the matching reward IS granted; the mismatched one is not", () => {
    const lines = [
      line(0, "MATTRESS", "akka"),
      line(1, "BEDFRAME", "aria", { pwp: true }), // rule A → granted
      line(2, "BEDFRAME", "orient", { pwp: true }), // rule B trigger absent → not granted
    ];
    expect(grantedIdx([RULE_A, RULE_B], lines)).toEqual([1]);
  });

  it("binds the reward to its rule's trigger (triggerRef)", () => {
    const lines = [
      line(0, "MATTRESS", "akka", { name: "2990 AKKA-FIRM" }),
      line(1, "MATTRESS", "ketta", { name: "2990 KETTA-SOFT" }),
      line(2, "BEDFRAME", "orient", { pwp: true }),
    ];
    const grants = resolvePwp([RULE_A, RULE_B], lines);
    expect(grants.find((g) => g.idx === 2)?.triggerRef?.name).toBe("2990 KETTA-SOFT");
  });

  it("attributes each grant to the rule index that actually granted it (ruleIndex)", () => {
    // Aria (rule A reward) + Orient (rule B reward), each with its own trigger
    // present. The grant on Aria must carry ruleIndex 0 (RULE_A), Orient ruleIndex
    // 1 (RULE_B) — so the server can assert the claimed rule == the granting rule.
    const lines = [
      line(0, "MATTRESS", "akka"),
      line(1, "MATTRESS", "ketta"),
      line(2, "BEDFRAME", "aria", { pwp: true }),
      line(3, "BEDFRAME", "orient", { pwp: true }),
    ];
    const grants = resolvePwp([RULE_A, RULE_B], lines);
    expect(grants.find((g) => g.idx === 2)?.ruleIndex).toBe(0);
    expect(grants.find((g) => g.idx === 3)?.ruleIndex).toBe(1);
  });
});

/* Promo one-way (Loo 2026-06-06) — a rule whose trigger set == reward set
   ("buy ARRUS, get an ARRUS free") must not let the free unit fund the next
   free unit, while pwp rules still chain off reward lines. */
describe("resolvePwp - promo one-way", () => {
  const PROMO: PwpRule = {
    type: "promo",
    triggerCategory: "MATTRESS",
    triggerTargets: [{ scope: "model", modelId: "arrus" }],
    rewardCategory: "MATTRESS",
    rewardTargets: [{ scope: "model", modelId: "arrus" }],
    qtyPerTrigger: 1,
  };
  const PWP_BED: PwpRule = {
    type: "pwp",
    triggerCategory: "MATTRESS",
    triggerTargets: [{ scope: "model", modelId: "arrus" }],
    rewardCategory: "BEDFRAME",
    rewardTargets: [{ scope: "model", modelId: "b-ok" }],
    qtyPerTrigger: 1,
  };

  it("a full-price ARRUS funds ONE free ARRUS (the normal sale)", () => {
    const lines = [
      line(0, "MATTRESS", "arrus"), // paid trigger
      line(1, "MATTRESS", "arrus", { pwp: true }), // wants to be free
    ];
    expect(grantedIdx([PROMO], lines)).toEqual([1]);
  });

  it("a reward ARRUS line creates NO promo slots - free cannot fund free", () => {
    const lines = [
      line(0, "MATTRESS", "arrus", { isReward: true }), // the FREE one from an earlier grant
      line(1, "MATTRESS", "arrus", { pwp: true }), // tries to ride on it
    ];
    expect(grantedIdx([PROMO], lines)).toEqual([]);
  });

  it("an ARRUS cannot be its own trigger (pwpRequested excluded from promo slots)", () => {
    const lines = [line(0, "MATTRESS", "arrus", { pwp: true })];
    expect(grantedIdx([PROMO], lines)).toEqual([]);
  });

  it("the reward ARRUS still triggers a pwp rule (chains stay allowed)", () => {
    const lines = [
      line(0, "MATTRESS", "arrus", { isReward: true }), // free mattress
      line(1, "BEDFRAME", "b-ok", { pwp: true }), // bedframe at pwp price
    ];
    expect(grantedIdx([PWP_BED], lines)).toEqual([1]);
  });

  it("a rule without type behaves as pwp (reward lines still open slots)", () => {
    const NO_TYPE: PwpRule = { ...PWP_BED, type: undefined as unknown as PwpRule["type"] };
    const lines = [
      line(0, "MATTRESS", "arrus", { isReward: true }),
      line(1, "BEDFRAME", "b-ok", { pwp: true }),
    ];
    expect(grantedIdx([NO_TYPE], lines)).toEqual([1]);
  });
});

// Carres-specific — prove a 'variant'-scope target and a 'combo'-scope target gate
// through the P6 RuleTarget matcher (the whole reason this is an adapted port).
describe("resolvePwp — Carres RuleTarget scopes", () => {
  // A variant-scope trigger: only the QUEEN-size mattress unlocks the bedframe.
  const VARIANT_RULE: PwpRule = {
    type: "pwp",
    triggerCategory: "MATTRESS",
    triggerTargets: [{ scope: "variant", modelId: "m-ok", sizeCodes: ["QUEEN"] }],
    rewardCategory: "BEDFRAME",
    rewardTargets: [{ scope: "model", modelId: "b-ok" }],
    qtyPerTrigger: 1,
  };

  const sizedLine = (
    idx: number,
    category: string,
    modelId: string | null,
    sizeCode: string | null,
    o: LineOpts = {},
  ): PwpLineInput => ({
    ...line(idx, category, modelId, o),
    sizeCode,
  });

  it("a 'variant'-scope trigger only unlocks for a matching size_code", () => {
    const lines = [
      sizedLine(0, "MATTRESS", "m-ok", "QUEEN"), // matches the variant trigger
      line(1, "BEDFRAME", "b-ok", { pwp: true }),
    ];
    expect(grantedIdx([VARIANT_RULE], lines)).toEqual([1]);
  });

  it("a 'variant'-scope trigger does NOT unlock for the wrong size_code", () => {
    const lines = [
      sizedLine(0, "MATTRESS", "m-ok", "KING"), // wrong size → not a trigger
      line(1, "BEDFRAME", "b-ok", { pwp: true }),
    ];
    expect(grantedIdx([VARIANT_RULE], lines)).toEqual([]);
  });

  // A combo-scope trigger: a sofa BUILD covering combo 'cmb-1' slots unlocks an
  // accessory at PWP price. Combo subset-matching delegates to matchSofaCombo via
  // the shared comboModulesById map.
  const COMBO_RULE: PwpRule = {
    type: "pwp",
    triggerCategory: "SOFA",
    triggerTargets: [{ scope: "combo", modelId: "", comboIds: ["cmb-1"] }],
    rewardCategory: "ACCESSORY",
    rewardTargets: [{ scope: "model", modelId: "acc-ok" }],
    qtyPerTrigger: 1,
  };

  const sofaLine = (idx: number, modelId: string | null, built: string[], o: LineOpts = {}): PwpLineInput => ({
    ...line(idx, "SOFA", modelId, o),
    builtCompartments: built,
  });

  it("a 'combo'-scope trigger unlocks when the sofa build covers the combo slots", () => {
    // combo 'cmb-1' wants slots [[L1],[CNR]]; a build with [L1, CNR] subset-matches.
    const comboMap = new Map<string, string[][]>([["cmb-1", [["L1"], ["CNR"]]]]);
    const lines = [
      sofaLine(0, "sofa-model", ["L1", "CNR"]), // build matches combo cmb-1
      line(1, "ACCESSORY", "acc-ok", { pwp: true }),
    ];
    expect(grantedIdx([COMBO_RULE], lines, comboMap)).toEqual([1]);
  });

  it("a 'combo'-scope trigger does NOT unlock when the build can't cover the slots", () => {
    const comboMap = new Map<string, string[][]>([["cmb-1", [["L1"], ["CNR"]]]]);
    const lines = [
      sofaLine(0, "sofa-model", ["L1"]), // missing CNR → no combo match
      line(1, "ACCESSORY", "acc-ok", { pwp: true }),
    ];
    expect(grantedIdx([COMBO_RULE], lines, comboMap)).toEqual([]);
  });
});
