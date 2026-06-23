import { describe, it, expect } from "vitest";
import {
  resolveCompartmentPrice,
  mirrorCode,
  canonicalizeSofaSlots,
  matchSofaCombo,
  pickSofaCombo,
  computeSofaPrice,
  explodeSofaBuild,
  sofaPriceWithinTolerance,
  SOFA_PRICE_DRIFT_TOLERANCE,
  type SofaBuild,
  type SofaPricingSnapshot,
  type SofaComboLike,
} from "./sofa-pricing";
import type { SofaCompartment, ModelSofaCompartment } from "./domain";

/* ─────────────────────────────────────────────────────────────────────────
 * Test fixtures — Carres numeric-MYR catalog inputs (NOT 2990s sen/centi).
 * The pure engine ports 2990s `groupPrice` + `matchComboSubset` +
 * `pickComboMatch` + `distributeProportionally`, adapted to numeric MYR in /
 * integer-cents arithmetic / numeric MYR out (the `explodeCombo` convention).
 * ──────────────────────────────────────────────────────────────────────── */

const MODEL = "model-1";

/** Build a `SofaCompartment` pool entry. */
function pool(code: string, defaultPrice: number): SofaCompartment {
  return {
    id: `comp-${code}`,
    code,
    description: null,
    seatCount: null,
    armConfig: null,
    iconUrl: null,
    defaultPrice,
    sortOrder: 0,
    active: true,
  };
}

/** Build a `ModelSofaCompartment` (per-model offered) entry. */
function modelComp(
  compartmentId: string,
  priceOverride: number | null,
): ModelSofaCompartment {
  return { modelId: MODEL, compartmentId, priceOverride, sortOrder: 0 };
}

/** A combo row (camelCased domain-ish shape the engine consumes). */
function combo(over: Partial<SofaComboLike> = {}): SofaComboLike {
  return {
    id: "r1",
    modelId: MODEL,
    slots: [
      ["2A(LHF)", "2A(RHF)"],
      ["L(LHF)", "L(RHF)"],
    ],
    tier: "PRICE_1",
    pricesByHeight: { "24": 2640, "28": 2750 },
    label: null,
    effectiveFrom: "2026-01-01",
    active: true,
    discontinuedAt: null,
    ...over,
  };
}

/**
 * Assemble a pricing snapshot from a code→price map. Each compartment is in the
 * pool at `defaultPrice` and offered by the model with NO override (so the
 * resolved price = defaultPrice). `overrides` lets a test set a per-model
 * override for a code.
 */
function snapshotFrom(
  priceByCode: Record<string, number>,
  opts: {
    combos?: SofaComboLike[];
    overrides?: Record<string, number | null>;
    fabricTierConfig?: { sofaTier2Delta: number; sofaTier3Delta: number };
    fabricTierOverride?: { tier2Delta: number | null; tier3Delta: number | null };
  } = {},
): SofaPricingSnapshot {
  const compartmentPool: SofaCompartment[] = [];
  const modelCompartments: ModelSofaCompartment[] = [];
  for (const [code, price] of Object.entries(priceByCode)) {
    const c = pool(code, price);
    compartmentPool.push(c);
    const ov = opts.overrides?.[code];
    modelCompartments.push(modelComp(c.id, ov === undefined ? null : ov));
  }
  return {
    compartmentPool,
    modelCompartments,
    sofaCombos: opts.combos ?? [],
    fabricTierConfig: opts.fabricTierConfig ?? null,
    fabricTierOverride: opts.fabricTierOverride ?? null,
  };
}

function build(over: Partial<SofaBuild> = {}): SofaBuild {
  return {
    modelId: MODEL,
    cells: [{ moduleCode: "2A(LHF)" }, { moduleCode: "L(RHF)" }],
    fabricTier: null,
    height: "28",
    ...over,
  };
}

const ASOF = "2026-05-28";

/* ─── resolveCompartmentPrice ──────────────────────────────────────────── */

describe("resolveCompartmentPrice", () => {
  it("uses the model override when present", () => {
    expect(resolveCompartmentPrice(modelComp("c", 500), pool("X", 300))).toBe(500);
  });

  it("override of 0 wins over the pool default (?? not ||)", () => {
    expect(resolveCompartmentPrice(modelComp("c", 0), pool("X", 300))).toBe(0);
  });

  it("null override inherits the pool default", () => {
    expect(resolveCompartmentPrice(modelComp("c", null), pool("X", 300))).toBe(300);
  });

  it("returns 0 when neither model-comp nor pool is found", () => {
    expect(resolveCompartmentPrice(undefined, undefined)).toBe(0);
  });

  it("falls back to pool default when model-comp is missing", () => {
    expect(resolveCompartmentPrice(undefined, pool("X", 420))).toBe(420);
  });
});

/* ─── mirrorCode ───────────────────────────────────────────────────────── */

describe("mirrorCode", () => {
  it("swaps LHF → RHF", () => {
    expect(mirrorCode("2A(LHF)")).toBe("2A(RHF)");
  });
  it("swaps RHF → LHF", () => {
    expect(mirrorCode("L(RHF)")).toBe("L(LHF)");
  });
  it("passes orientation-free codes through unchanged", () => {
    expect(mirrorCode("1NA")).toBe("1NA");
    expect(mirrorCode("Console")).toBe("Console");
  });
});

/* ─── canonicalizeSofaSlots ────────────────────────────────────────────── */

describe("canonicalizeSofaSlots", () => {
  it("sorts codes within each slot AND sorts slots by first code", () => {
    expect(
      canonicalizeSofaSlots([
        ["L(RHF)", "L(LHF)"],
        ["2A(RHF)", "2A(LHF)"],
      ]),
    ).toEqual([
      ["2A(LHF)", "2A(RHF)"],
      ["L(LHF)", "L(RHF)"],
    ]);
  });

  it("trims, de-dupes, and drops empty slots", () => {
    expect(
      canonicalizeSofaSlots([[" 2A(LHF) ", "2A(LHF)"], ["", "  "], ["CNR"]]),
    ).toEqual([["2A(LHF)"], ["CNR"]]);
  });

  it("two equivalent slot-sets canonicalize to byte-identical JSON", () => {
    const a = canonicalizeSofaSlots([
      ["2A(RHF)", "2A(LHF)"],
      ["L(RHF)", "L(LHF)"],
    ]);
    const b = canonicalizeSofaSlots([
      ["L(LHF)", "L(RHF)"],
      ["2A(LHF)", "2A(RHF)"],
    ]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("empty / unusable input → empty array", () => {
    expect(canonicalizeSofaSlots([])).toEqual([]);
    expect(canonicalizeSofaSlots([[], [""]])).toEqual([]);
  });
});

/* ─── matchSofaCombo (Kuhn bipartite max matching) ─────────────────────── */

describe("matchSofaCombo", () => {
  it("exact cover — each built module fills its singleton slot", () => {
    expect(
      matchSofaCombo(
        ["2A(LHF)", "CNR", "2A(RHF)"],
        [["2A(LHF)"], ["CNR"], ["2A(RHF)"]],
      ),
    ).toEqual([0, 1, 2]);
  });

  it("too few built modules to cover every slot → null", () => {
    expect(
      matchSofaCombo(["2A(LHF)", "CNR"], [["2A(LHF)"], ["CNR"], ["2A(RHF)"]]),
    ).toBeNull();
  });

  it("EXTRA built module beyond the slots is allowed — subset = matched only", () => {
    const slots = [
      ["2A(LHF)", "2A(RHF)"],
      ["L(LHF)", "L(RHF)"],
    ];
    expect(matchSofaCombo(["2A(LHF)", "L(RHF)", "1NA"], slots)).toEqual([0, 1]);
    expect(matchSofaCombo(["2A(LHF)", "L(RHF)", "1NA", "Console"], slots)).toEqual([
      0, 1,
    ]);
  });

  it("OR-alternative cover is order-independent", () => {
    const slots = [
      ["2A(LHF)", "2A(RHF)"],
      ["L(LHF)", "L(RHF)"],
    ];
    expect(matchSofaCombo(["2A(RHF)", "L(LHF)"], slots)).toEqual([0, 1]);
    expect(matchSofaCombo(["L(RHF)", "2A(LHF)"], slots)).toEqual([0, 1]);
  });

  it("a slot no built module can fill → null", () => {
    expect(
      matchSofaCombo(["2A(LHF)", "CNR"], [["2A(LHF)"], ["L(LHF)", "L(RHF)"]]),
    ).toBeNull();
  });

  it("overlapping OR-sets need MAX matching (not greedy)", () => {
    // [{X,Y},{X}] vs built [X,Y]: greedy grabs X for slot0 and strands slot1;
    // Kuhn finds X→slot1, Y→slot0. Both consumed → subset [0,1].
    expect(matchSofaCombo(["X", "Y"], [["X", "Y"], ["X"]])).toEqual([0, 1]);
    // [Y,Y] vs [{X,Y},{X}]: only one slot accepts Y → can't cover both.
    expect(matchSofaCombo(["Y", "Y"], [["X", "Y"], ["X"]])).toBeNull();
  });

  it("duplicate modules need distinct slots", () => {
    expect(matchSofaCombo(["1NA", "1NA"], [["1NA"], ["1NA"]])).toEqual([0, 1]);
    expect(matchSofaCombo(["1NA", "1NA"], [["1NA"], ["CNR"]])).toBeNull();
  });

  it("empty slots never match", () => {
    expect(matchSofaCombo(["2A(LHF)"], [])).toBeNull();
    expect(matchSofaCombo([], [])).toBeNull();
  });
});

/* ─── pickSofaCombo ────────────────────────────────────────────────────── */

describe("pickSofaCombo", () => {
  it("matches OR slots and returns the height price + matched subset", () => {
    const m = pickSofaCombo(
      { modelId: MODEL, builtCodes: ["2A(RHF)", "L(LHF)"], tier: "PRICE_1", height: "28", asOf: ASOF },
      [combo()],
    );
    expect(m).not.toBeNull();
    expect(m!.priceMyr).toBe(2750);
    expect(m!.matchedIndices).toEqual([0, 1]);
  });

  it("subset match: extra module allowed, matchedIndices excludes the extra", () => {
    const m = pickSofaCombo(
      { modelId: MODEL, builtCodes: ["2A(RHF)", "L(LHF)", "1NA"], tier: "PRICE_1", height: "28", asOf: ASOF },
      [combo()],
    );
    expect(m!.matchedIndices).toEqual([0, 1]);
  });

  it("too few built modules → null", () => {
    expect(
      pickSofaCombo(
        { modelId: MODEL, builtCodes: ["2A(RHF)"], tier: "PRICE_1", height: "28", asOf: ASOF },
        [combo()],
      ),
    ).toBeNull();
  });

  it("model mismatch → null", () => {
    expect(
      pickSofaCombo(
        { modelId: "other", builtCodes: ["2A(RHF)", "L(LHF)"], tier: "PRICE_1", height: "28", asOf: ASOF },
        [combo()],
      ),
    ).toBeNull();
  });

  it("tier-specific row only matches its tier; null tier matches any", () => {
    expect(
      pickSofaCombo(
        { modelId: MODEL, builtCodes: ["2A(RHF)", "L(LHF)"], tier: "PRICE_2", height: "28", asOf: ASOF },
        [combo({ tier: "PRICE_1" })],
      ),
    ).toBeNull();
    expect(
      pickSofaCombo(
        { modelId: MODEL, builtCodes: ["2A(RHF)", "L(LHF)"], tier: "PRICE_2", height: "28", asOf: ASOF },
        [combo({ tier: null })],
      )!.priceMyr,
    ).toBe(2750);
  });

  it("tier === null on args matches any combo tier", () => {
    expect(
      pickSofaCombo(
        { modelId: MODEL, builtCodes: ["2A(RHF)", "L(LHF)"], tier: null, height: "28", asOf: ASOF },
        [combo({ tier: "PRICE_1" })],
      )!.priceMyr,
    ).toBe(2750);
  });

  it("active+tier (2) outranks active+any (1)", () => {
    const anyTier = combo({ id: "c-any", tier: null, pricesByHeight: { "28": 1 } });
    const tierRow = combo({ id: "c-tier", tier: "PRICE_1", pricesByHeight: { "28": 2 } });
    expect(
      pickSofaCombo(
        { modelId: MODEL, builtCodes: ["2A(LHF)", "L(RHF)"], tier: "PRICE_1", height: "28", asOf: ASOF },
        [anyTier, tierRow],
      )!.combo.id,
    ).toBe("c-tier");
  });

  it("tie-break: newest effective_from on/before asOf wins", () => {
    const older = combo({ id: "old", effectiveFrom: "2026-01-01", pricesByHeight: { "28": 2750 } });
    const newer = combo({ id: "new", effectiveFrom: "2026-05-01", pricesByHeight: { "28": 2690 } });
    const future = combo({ id: "fut", effectiveFrom: "2026-12-01", pricesByHeight: { "28": 1000 } });
    const m = pickSofaCombo(
      { modelId: MODEL, builtCodes: ["2A(LHF)", "L(RHF)"], tier: "PRICE_1", height: "28", asOf: ASOF },
      [older, newer, future],
    );
    expect(m!.combo.id).toBe("new");
    expect(m!.priceMyr).toBe(2690);
  });

  it("inactive / discontinued rows never match", () => {
    expect(
      pickSofaCombo(
        { modelId: MODEL, builtCodes: ["2A(LHF)", "L(RHF)"], tier: "PRICE_1", height: "28", asOf: ASOF },
        [combo({ active: false })],
      ),
    ).toBeNull();
    expect(
      pickSofaCombo(
        { modelId: MODEL, builtCodes: ["2A(LHF)", "L(RHF)"], tier: "PRICE_1", height: "28", asOf: ASOF },
        [combo({ discontinuedAt: "2026-05-20T00:00:00Z" })],
      ),
    ).toBeNull();
  });

  it("a row without a numeric price > 0 for the height does not win", () => {
    expect(
      pickSofaCombo(
        { modelId: MODEL, builtCodes: ["2A(LHF)", "L(RHF)"], tier: "PRICE_1", height: "99", asOf: ASOF },
        [combo()],
      ),
    ).toBeNull();
    // null at the height → no price set → combo does NOT apply (filtered out).
    expect(
      pickSofaCombo(
        { modelId: MODEL, builtCodes: ["2A(LHF)", "L(RHF)"], tier: "PRICE_1", height: "30", asOf: ASOF },
        [combo({ pricesByHeight: { "30": null } })],
      ),
    ).toBeNull();
    // literal 0 at the height SURVIVES the filter (faithful to 2990s
    // pickComboMatch — a numeric price, incl. 0, is kept). The `> 0` decision
    // is made POST-rank by computeSofaPrice, not by this filter.
    const zeroPick = pickSofaCombo(
      { modelId: MODEL, builtCodes: ["2A(LHF)", "L(RHF)"], tier: "PRICE_1", height: "30", asOf: ASOF },
      [combo({ pricesByHeight: { "30": 0 } })],
    );
    expect(zeroPick).not.toBeNull();
    expect(zeroPick!.priceMyr).toBe(0);
  });
});

/* ─── computeSofaPrice ─────────────────────────────────────────────────── */

describe("computeSofaPrice — à-la-carte (no combo)", () => {
  it("sums resolved compartment prices when no combo matches", () => {
    const snap = snapshotFrom({ "2A(LHF)": 1000, "L(RHF)": 800 });
    const r = computeSofaPrice(build(), snap);
    expect(r.basis).toBe("a_la_carte");
    expect(r.aLaCarteSum).toBe(1800);
    expect(r.total).toBe(1800);
    expect(r.reclinerExtra).toBe(0);
    expect(r.fabricDelta).toBe(0);
  });

  it("mirror fallback prices a one-hand-only compartment from its mirror", () => {
    // Pool/model only price 2A(LHF) + L(LHF); the build uses 2A(LHF)+L(RHF).
    // L(RHF) resolves via mirror to L(LHF)'s price — never RM 0.
    const snap = snapshotFrom({ "2A(LHF)": 1000, "L(LHF)": 800 });
    const r = computeSofaPrice(build({ cells: [{ moduleCode: "2A(LHF)" }, { moduleCode: "L(RHF)" }] }), snap);
    expect(r.aLaCarteSum).toBe(1800);
    expect(r.total).toBe(1800);
  });
});

describe("computeSofaPrice — combo override", () => {
  it("applies the combo even when it is PRICIER than à-la-carte", () => {
    // à-la-carte = 1000 + 800 = 1800; combo @28 = 2750 (dearer) → combo wins.
    const snap = snapshotFrom(
      { "2A(LHF)": 1000, "L(RHF)": 800 },
      { combos: [combo()] },
    );
    const r = computeSofaPrice(build(), snap);
    expect(r.basis).toBe("combo");
    expect(r.comboPrice).toBe(2750);
    expect(r.comboSubsetSum).toBe(1800);
    expect(r.comboExtras).toBe(0);
    expect(r.total).toBe(2750);
  });

  it("combo covers ONLY the matched subset; extras add at full à-la-carte", () => {
    // built = 2A(LHF) + L(RHF) (the combo subset) + a stray 1NA @ RM 300.
    const snap = snapshotFrom(
      { "2A(LHF)": 1000, "L(RHF)": 800, "1NA": 300 },
      { combos: [combo({ pricesByHeight: { "28": 1500 } })] },
    );
    const r = computeSofaPrice(
      build({ cells: [{ moduleCode: "2A(LHF)" }, { moduleCode: "L(RHF)" }, { moduleCode: "1NA" }] }),
      snap,
    );
    expect(r.basis).toBe("combo");
    expect(r.aLaCarteSum).toBe(2100); // 1000+800+300
    expect(r.comboPrice).toBe(1500);
    expect(r.comboSubsetSum).toBe(1800); // 1000+800
    expect(r.comboExtras).toBe(300); // the 1NA at full price
    expect(r.total).toBe(1800); // 1500 + 300
    expect(r.matchedCellIndices).toEqual([0, 1]);
  });

  it("C1 invariant: mirror fallback uses the SAME lookup in subset sum — no double-charge", () => {
    // The model prices only L(LHF), not L(RHF). The build uses L(RHF) (a matched
    // cell). Without mirror in the subset sum, comboExtras = aLaCarte − subsetSum
    // would re-charge L(RHF) on TOP of the combo. With mirror, subsetSum includes
    // it → comboExtras = 0.
    const snap = snapshotFrom(
      { "2A(LHF)": 1000, "L(LHF)": 800 },
      { combos: [combo({ pricesByHeight: { "28": 2000 } })] },
    );
    const r = computeSofaPrice(
      build({ cells: [{ moduleCode: "2A(LHF)" }, { moduleCode: "L(RHF)" }] }),
      snap,
    );
    expect(r.basis).toBe("combo");
    expect(r.aLaCarteSum).toBe(1800);
    expect(r.comboSubsetSum).toBe(1800); // mirror used here too
    expect(r.comboExtras).toBe(0);
    expect(r.total).toBe(2000); // pure combo price, no double-charge
  });

  it("no combo match → à-la-carte basis", () => {
    const snap = snapshotFrom(
      { "2A(LHF)": 1000, "1NA": 300 },
      { combos: [combo()] }, // combo needs an L-slot; build has none
    );
    const r = computeSofaPrice(
      build({ cells: [{ moduleCode: "2A(LHF)" }, { moduleCode: "1NA" }] }),
      snap,
    );
    expect(r.basis).toBe("a_la_carte");
    expect(r.total).toBe(1300);
  });

  it("per-height combo price selection", () => {
    const snap24 = snapshotFrom({ "2A(LHF)": 1, "L(RHF)": 1 }, { combos: [combo()] });
    expect(computeSofaPrice(build({ height: "24" }), snap24).total).toBe(2640);
    expect(computeSofaPrice(build({ height: "28" }), snap24).total).toBe(2750);
  });

  it("height with no combo price → falls through to à-la-carte", () => {
    const snap = snapshotFrom(
      { "2A(LHF)": 1000, "L(RHF)": 800 },
      { combos: [combo()] }, // combo only prices 24 + 28
    );
    const r = computeSofaPrice(build({ height: "30" }), snap);
    expect(r.basis).toBe("a_la_carte");
    expect(r.total).toBe(1800);
  });

  it("0-priced WINNER blocks a lower combo (2990s post-rank gate) → à-la-carte, no retry", () => {
    // Newer combo priced literal 0 @28 + older combo priced 2750 @28; à-la-carte = 1800.
    // 2990s: the newer-0 wins ranking (newest effective_from), then the `> 0`
    // gate falls the whole group to à-la-carte — it does NOT retry the older
    // positive combo. (Pre-fix Carres dropped the 0-combo pre-rank, so 2750 won.)
    const older = combo({ id: "old", effectiveFrom: "2026-01-01", pricesByHeight: { "28": 2750 } });
    const newerZero = combo({ id: "new0", effectiveFrom: "2026-05-01", pricesByHeight: { "28": 0 } });
    const snap = snapshotFrom({ "2A(LHF)": 1000, "L(RHF)": 800 }, { combos: [older, newerZero] });
    const r = computeSofaPrice(build({ asOf: ASOF }), snap);
    expect(r.basis).toBe("a_la_carte");
    expect(r.total).toBe(1800);
  });

  it("default lookup tier when build.fabricTier is unset = PRICE_1", () => {
    // combo authored at PRICE_1; build has no fabricTier → still matches.
    const snap = snapshotFrom(
      { "2A(LHF)": 1000, "L(RHF)": 800 },
      { combos: [combo({ tier: "PRICE_1" })] },
    );
    const r = computeSofaPrice(build({ fabricTier: null }), snap);
    expect(r.basis).toBe("combo");
    expect(r.total).toBe(2750);
  });
});

describe("computeSofaPrice — fabric tier delta", () => {
  it("PRICE_1 delta = 0 (no surcharge)", () => {
    const snap = snapshotFrom(
      { "2A(LHF)": 1000, "L(RHF)": 800 },
      { fabricTierConfig: { sofaTier2Delta: 200, sofaTier3Delta: 400 } },
    );
    const r = computeSofaPrice(build({ fabricTier: "PRICE_1" }), snap);
    expect(r.fabricDelta).toBe(0);
    expect(r.total).toBe(1800);
  });

  it("PRICE_2 delta stacks on top of à-la-carte from global config", () => {
    const snap = snapshotFrom(
      { "2A(LHF)": 1000, "L(RHF)": 800 },
      { fabricTierConfig: { sofaTier2Delta: 200, sofaTier3Delta: 400 } },
    );
    const r = computeSofaPrice(build({ fabricTier: "PRICE_2" }), snap);
    expect(r.fabricDelta).toBe(200);
    expect(r.total).toBe(2000); // 1800 + 200
  });

  it("PRICE_3 delta stacks on top of a COMBO price", () => {
    const snap = snapshotFrom(
      { "2A(LHF)": 1000, "L(RHF)": 800 },
      {
        combos: [combo({ tier: null, pricesByHeight: { "28": 2750 } })],
        fabricTierConfig: { sofaTier2Delta: 200, sofaTier3Delta: 400 },
      },
    );
    const r = computeSofaPrice(build({ fabricTier: "PRICE_3" }), snap);
    expect(r.basis).toBe("combo");
    expect(r.fabricDelta).toBe(400);
    expect(r.total).toBe(3150); // 2750 + 400
  });

  it("per-model override takes precedence over global config", () => {
    const snap = snapshotFrom(
      { "2A(LHF)": 1000, "L(RHF)": 800 },
      {
        fabricTierConfig: { sofaTier2Delta: 200, sofaTier3Delta: 400 },
        fabricTierOverride: { tier2Delta: 50, tier3Delta: null },
      },
    );
    expect(computeSofaPrice(build({ fabricTier: "PRICE_2" }), snap).fabricDelta).toBe(50);
    // tier3 override null → inherits global 400
    expect(computeSofaPrice(build({ fabricTier: "PRICE_3" }), snap).fabricDelta).toBe(400);
  });
});

describe("computeSofaPrice — recliner stub", () => {
  it("reclinerExtra is always 0 in Phase 2 (interface-complete stub)", () => {
    const snap = snapshotFrom({ "2A(LHF)": 1000, "L(RHF)": 800 });
    const r = computeSofaPrice(build(), snap);
    expect(r.reclinerExtra).toBe(0);
  });
});

describe("computeSofaPrice — cents-exact rounding", () => {
  it("does arithmetic in integer cents (no float drift on .x prices)", () => {
    const snap = snapshotFrom({ "2A(LHF)": 1000.1, "L(RHF)": 800.2 });
    const r = computeSofaPrice(build(), snap);
    expect(r.aLaCarteSum).toBe(1800.3);
    expect(r.total).toBe(1800.3);
  });
});

/* ─── explodeSofaBuild ─────────────────────────────────────────────────── */

describe("explodeSofaBuild", () => {
  const lookup = (code: string): number =>
    ({ "2A(LHF)": 1000, "L(RHF)": 800, "1NA": 300 } as Record<string, number>)[code] ?? 0;

  it("one line per build cell carrying buildKey + cellIndex", () => {
    const b = build({
      buildKey: "bk-1",
      cells: [{ moduleCode: "2A(LHF)" }, { moduleCode: "L(RHF)" }],
    });
    const lines = explodeSofaBuild(b, 1800, lookup);
    expect(lines).toHaveLength(2);
    expect(lines[0].moduleCode).toBe("2A(LHF)");
    expect(lines[0].cellIndex).toBe(0);
    expect(lines[0].buildKey).toBe("bk-1");
    expect(lines[1].cellIndex).toBe(1);
  });

  it("Σ(unitPrice × qty) === total exactly (weighted by à-la-carte price)", () => {
    const b = build({ cells: [{ moduleCode: "2A(LHF)" }, { moduleCode: "L(RHF)" }] });
    const lines = explodeSofaBuild(b, 2750, lookup);
    const sum = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    expect(Number(sum.toFixed(2))).toBe(2750);
  });

  it("residue lands on the LAST line", () => {
    // 3 equal-weight cells, total 100 → 33.33 / 33.33 / 33.34.
    const b = build({
      cells: [{ moduleCode: "A" }, { moduleCode: "B" }, { moduleCode: "C" }],
    });
    const equal = () => 10;
    const lines = explodeSofaBuild(b, 100, equal);
    expect(lines.map((l) => l.unitPrice)).toEqual([33.33, 33.33, 33.34]);
    expect(lines.reduce((s, l) => s + l.unitPrice, 0)).toBeCloseTo(100, 2);
  });

  it("missing price → 0 weight, no NaN (other cells absorb)", () => {
    const b = build({ cells: [{ moduleCode: "2A(LHF)" }, { moduleCode: "GHOST" }] });
    const lines = explodeSofaBuild(b, 1000, lookup);
    expect(lines.every((l) => Number.isFinite(l.unitPrice))).toBe(true);
    const sum = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    expect(Number(sum.toFixed(2))).toBe(1000);
  });

  it("all-zero weights → equal split, sum exact", () => {
    const b = build({
      cells: [{ moduleCode: "A" }, { moduleCode: "B" }, { moduleCode: "C" }],
    });
    const lines = explodeSofaBuild(b, 100, () => 0);
    const sum = lines.reduce((s, l) => s + l.unitPrice, 0);
    expect(Number(sum.toFixed(2))).toBe(100);
  });

  it("empty cells → empty output", () => {
    expect(explodeSofaBuild(build({ cells: [] }), 0, lookup)).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * sofaPriceWithinTolerance (Phase 4 server-recompute drift gate)
 * The anti-price-fudge check: |client − server| / server <= 0.5%.
 * ──────────────────────────────────────────────────────────────────────── */

describe("sofaPriceWithinTolerance", () => {
  it("tolerance constant is 0.5%", () => {
    expect(SOFA_PRICE_DRIFT_TOLERANCE).toBe(0.005);
  });

  it("exact match passes", () => {
    expect(sofaPriceWithinTolerance(5000, 5000)).toBe(true);
  });

  it("drift just under 0.5% passes (RM 5000 ± 25)", () => {
    expect(sofaPriceWithinTolerance(5024.99, 5000)).toBe(true);
    expect(sofaPriceWithinTolerance(4975.01, 5000)).toBe(true);
  });

  it("drift exactly 0.5% passes (boundary inclusive)", () => {
    expect(sofaPriceWithinTolerance(5025, 5000)).toBe(true);
  });

  it("drift over 0.5% fails (tampered client price)", () => {
    expect(sofaPriceWithinTolerance(5026, 5000)).toBe(false);
    expect(sofaPriceWithinTolerance(4000, 5000)).toBe(false);
    expect(sofaPriceWithinTolerance(6000, 5000)).toBe(false);
  });

  it("server 0 + client 0 → passes (genuine free build)", () => {
    expect(sofaPriceWithinTolerance(0, 0)).toBe(true);
  });

  it("server 0 + client > 0 → fails (model can't justify any price)", () => {
    expect(sofaPriceWithinTolerance(1500, 0)).toBe(false);
    expect(sofaPriceWithinTolerance(0.01, 0)).toBe(false);
  });

  it("sub-cent client residue against server 0 still passes", () => {
    // A 0-priced build the client also computed as ~0 (floating residue).
    expect(sofaPriceWithinTolerance(0.004, 0)).toBe(true);
  });

  it("negative / non-finite inputs fail closed (never silently accept)", () => {
    expect(sofaPriceWithinTolerance(NaN, 5000)).toBe(false);
    expect(sofaPriceWithinTolerance(5000, NaN)).toBe(false);
    expect(sofaPriceWithinTolerance(5000, -5000)).toBe(false);
  });
});
