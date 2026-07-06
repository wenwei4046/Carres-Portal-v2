import { describe, it, expect } from "vitest";
import {
  activeSofaHeights,
  allowedFabricsFor,
  allowedPoolValues,
  computedTotalHeight,
  fabricTierFor,
  inchesOf,
  optionsAttrsSchema,
  poolTicksFor,
  resolveOptionsTotal,
} from "./option-picks";
import type { CatalogFabricDto, CatalogOptionPoolDto } from "./schemas/catalog";

/* ─── fixtures ───────────────────────────────────────────────────────────── */

let seq = 0;
function poolRow(over: Partial<CatalogOptionPoolDto> & Pick<CatalogOptionPoolDto, "pool" | "value">): CatalogOptionPoolDto {
  return {
    id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
    label: null,
    dimensions: null,
    surcharge: null,
    active: true,
    sortOrder: seq,
    ...over,
  };
}

function fabric(over: Partial<CatalogFabricDto> & Pick<CatalogFabricDto, "fabricCode">): CatalogFabricDto {
  return {
    id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
    series: null,
    description: null,
    supplierCode: null,
    sofaTier: "PRICE_1",
    bedframeTier: "PRICE_1",
    active: true,
    sortOrder: seq,
    ...over,
  };
}

const POOLS: CatalogOptionPoolDto[] = [
  poolRow({ pool: "divan_height", value: '8"', sortOrder: 1 }),
  poolRow({ pool: "divan_height", value: '10"', surcharge: 125, sortOrder: 2 }),
  poolRow({ pool: "divan_height", value: '12"', surcharge: 250, sortOrder: 3 }),
  poolRow({ pool: "divan_height", value: '14"', surcharge: 375, active: false, sortOrder: 4 }),
  poolRow({ pool: "gap", value: '10"', sortOrder: 1 }),
  poolRow({ pool: "gap", value: '12"', sortOrder: 2 }),
  poolRow({ pool: "gap", value: '14"', sortOrder: 3 }),
  poolRow({ pool: "bedframe_leg_height", value: "No Leg", sortOrder: 1 }),
  poolRow({ pool: "bedframe_leg_height", value: '4"', surcharge: 60, sortOrder: 2 }),
  poolRow({ pool: "sofa_leg_height", value: '6"', surcharge: 90, sortOrder: 1 }),
  poolRow({ pool: "sofa_size", value: "24", sortOrder: 1 }),
  poolRow({ pool: "sofa_size", value: "26", sortOrder: 2 }),
  poolRow({ pool: "sofa_size", value: "35", sortOrder: 3 }),
  poolRow({ pool: "sofa_size", value: "Flat", sortOrder: 4 }),
  poolRow({ pool: "sofa_size", value: "28", active: false, sortOrder: 5 }),
];

const FABRICS: CatalogFabricDto[] = [
  fabric({ fabricCode: "BF-01", description: "Oat weave", sofaTier: "PRICE_1", bedframeTier: "PRICE_2" }),
  fabric({ fabricCode: "BF-02", description: "Forest velvet", sofaTier: "PRICE_3", bedframeTier: "PRICE_3" }),
  fabric({ fabricCode: "BF-OFF", active: false }),
];

const bareModel = { gaps: null, allowedOptions: {} };

/* ─── per-model gating ───────────────────────────────────────────────────── */

describe("poolTicksFor", () => {
  it("reads the allowed_options key per pool", () => {
    expect(
      poolTicksFor({ gaps: null, allowedOptions: { divan_heights: ['10"'] } }, "divan_height"),
    ).toEqual(['10"']);
    expect(
      poolTicksFor({ gaps: null, allowedOptions: { leg_heights: ['4"'] } }, "bedframe_leg_height"),
    ).toEqual(['4"']);
    expect(
      poolTicksFor({ gaps: null, allowedOptions: { leg_heights: ['6"'] } }, "sofa_leg_height"),
    ).toEqual(['6"']);
  });

  it("gap falls back to the legacy product_models.gaps column", () => {
    expect(poolTicksFor({ gaps: ['10"', '12"'], allowedOptions: {} }, "gap")).toEqual(['10"', '12"']);
    // explicit allowed_options.gaps wins over the column
    expect(
      poolTicksFor({ gaps: ['10"'], allowedOptions: { gaps: ['14"'] } }, "gap"),
    ).toEqual(['14"']);
  });

  it("non-gap pools have no legacy fallback", () => {
    expect(poolTicksFor({ gaps: ['10"'], allowedOptions: {} }, "divan_height")).toEqual([]);
  });
});

describe("allowedPoolValues", () => {
  it("EMPTY/ABSENT ticks = no restriction → every ACTIVE master option", () => {
    const got = allowedPoolValues(bareModel, "divan_height", POOLS);
    expect(got.map((p) => p.value)).toEqual(['8"', '10"', '12"']); // 14" inactive
  });

  it("non-empty ticks narrow to that subset (pool order kept)", () => {
    const model = { gaps: null, allowedOptions: { divan_heights: ['12"', '10"'] } };
    expect(allowedPoolValues(model, "divan_height", POOLS).map((p) => p.value)).toEqual([
      '10"',
      '12"',
    ]);
  });

  it("a ticked but INACTIVE master row never surfaces", () => {
    const model = { gaps: null, allowedOptions: { divan_heights: ['14"'] } };
    expect(allowedPoolValues(model, "divan_height", POOLS)).toEqual([]);
  });

  it("legacy gaps column gates the gap pool (pre-0201 bedframe models)", () => {
    const model = { gaps: ['12"', '10"'], allowedOptions: {} };
    expect(allowedPoolValues(model, "gap", POOLS).map((p) => p.value)).toEqual(['10"', '12"']);
  });
});

describe("allowedFabricsFor (OPT-IN)", () => {
  it("absent/empty ticks → NO fabrics (a wooden frame asks no upholstery)", () => {
    expect(allowedFabricsFor(bareModel, FABRICS)).toEqual([]);
    expect(allowedFabricsFor({ allowedOptions: { fabrics: [] } }, FABRICS)).toEqual([]);
  });

  it("ticked codes surface (active only)", () => {
    const model = { allowedOptions: { fabrics: ["BF-01", "BF-OFF", "NOPE"] } };
    expect(allowedFabricsFor(model, FABRICS).map((f) => f.fabricCode)).toEqual(["BF-01"]);
  });
});

describe("fabricTierFor", () => {
  const f = FABRICS[0]!; // sofa P1 / bedframe P2
  it("bedframe prices by bedframeTier, sofa by sofaTier", () => {
    expect(fabricTierFor("bedframe", f)).toBe("PRICE_2");
    expect(fabricTierFor("sofa", f)).toBe("PRICE_1");
  });
});

describe("activeSofaHeights", () => {
  it("active numeric sofa_size pool values ∩ canonical axis, pool order", () => {
    // Flat skipped (non-dimensional); 28 inactive skipped.
    expect(activeSofaHeights(POOLS)).toEqual(["24", "26", "35"]);
  });

  it("empty pool falls back to the full canonical axis", () => {
    expect(activeSofaHeights([])).toEqual(["24", "26", "28", "30", "32", "35", "37"]);
    expect(activeSofaHeights(null)).toEqual(["24", "26", "28", "30", "32", "35", "37"]);
  });
});

/* ─── the shared resolver (POS preview == Hono recompute) ────────────────── */

describe("resolveOptionsTotal", () => {
  const ctx = {
    pools: POOLS,
    fabrics: FABRICS,
    category: "bedframe" as const,
    fabricTierConfig: { sofaTier2Delta: 150, sofaTier3Delta: 300 },
  };

  it("prices pool picks from the row surcharge (null → 0)", () => {
    const r = resolveOptionsTotal(
      [
        { kind: "divan_height", value: '10"' },
        { kind: "bedframe_leg_height", value: "No Leg" },
      ],
      ctx,
    );
    expect(r.unknown).toEqual([]);
    expect(r.total).toBe(125);
    expect(r.lines).toEqual([
      { kind: "divan_height", value: '10"', surcharge: 125 },
      { kind: "bedframe_leg_height", value: "No Leg", surcharge: 0 },
    ]);
  });

  it("prices a fabric pick from the category tier column + delta config", () => {
    const r = resolveOptionsTotal([{ kind: "fabric", value: "BF-01" }], ctx);
    // bedframeTier PRICE_2 → global sofaTier2Delta 150 (shared 0176 deltas)
    expect(r.total).toBe(150);
    expect(r.lines[0]).toEqual({
      kind: "fabric",
      value: "BF-01",
      label: "Oat weave",
      surcharge: 150,
    });
  });

  it("the SAME fabric prices 0 for a sofa line when its sofaTier is PRICE_1", () => {
    const r = resolveOptionsTotal([{ kind: "fabric", value: "BF-01" }], {
      ...ctx,
      category: "sofa",
    });
    expect(r.total).toBe(0);
  });

  it("per-model tier override beats the global config", () => {
    const r = resolveOptionsTotal([{ kind: "fabric", value: "BF-02" }], {
      ...ctx,
      fabricTierOverride: { tier2Delta: null, tier3Delta: 999 },
    });
    expect(r.total).toBe(999);
  });

  it("unknown / retired / inactive values land in `unknown` (caller rejects)", () => {
    const r = resolveOptionsTotal(
      [
        { kind: "divan_height", value: '14"' }, // inactive row
        { kind: "fabric", value: "BF-OFF" }, // inactive fabric
        { kind: "fabric", value: "GONE" },
      ],
      ctx,
    );
    expect(r.unknown).toEqual(["divan_height:14\"", "fabric:BF-OFF", "fabric:GONE"]);
    expect(r.total).toBe(0);
  });

  it("sums in integer cents (no float drift)", () => {
    const pools = [
      poolRow({ pool: "divan_height", value: "a", surcharge: 0.1 }),
      poolRow({ pool: "divan_height", value: "b", surcharge: 0.2 }),
    ];
    const r = resolveOptionsTotal(
      [
        { kind: "divan_height", value: "a" },
        { kind: "divan_height", value: "b" },
      ],
      { ...ctx, pools },
    );
    expect(r.total).toBe(0.3);
  });
});

/* ─── attrs schema + total-height helpers ────────────────────────────────── */

describe("optionsAttrsSchema", () => {
  it("accepts the stored envelope", () => {
    expect(
      optionsAttrsSchema.safeParse({
        options: [{ kind: "divan_height", value: '10"', surcharge: 125 }],
        options_total: 125,
      }).success,
    ).toBe(true);
  });

  it("rejects unknown kinds and non-finite money", () => {
    expect(
      optionsAttrsSchema.safeParse({
        options: [{ kind: "gap", value: '10"', surcharge: 0 }],
        options_total: 0,
      }).success,
    ).toBe(false);
    expect(
      optionsAttrsSchema.safeParse({
        options: [{ kind: "fabric", value: "BF-01", surcharge: Infinity }],
        options_total: 0,
      }).success,
    ).toBe(false);
  });
});

describe("inchesOf / computedTotalHeight", () => {
  it("parses inch values and treats No Leg as 0", () => {
    expect(inchesOf('10"')).toBe(10);
    expect(inchesOf("No Leg")).toBe(0);
    expect(inchesOf("Iron Metal Leg")).toBeNull();
    expect(inchesOf(null)).toBeNull();
  });

  it("total height = divan + leg; null when either side is unknown", () => {
    expect(computedTotalHeight('10"', '4"')).toBe('14"');
    expect(computedTotalHeight('12"', "No Leg")).toBe('12"');
    expect(computedTotalHeight('10"', null)).toBeNull();
    expect(computedTotalHeight('10"', "Iron Metal Leg")).toBeNull();
  });
});
