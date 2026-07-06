import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recomputeOptionPickLines, type RecomputableLine } from "./option-picks-recompute";

/**
 * Unit tests for the option-picks trust gate (0201/0202 wiring). Mirrors the
 * special-addons-recompute test harness: a per-table mock whose chain is
 * thenable (plain select → list) with .in()/.maybeSingle() terminators.
 */

interface TableData {
  list?: unknown[];
  one?: unknown;
  error?: { message: string } | null;
}

function mockSb(tables: Record<string, TableData>) {
  const fromCalls: string[] = [];
  function chainFor(table: string) {
    const listRes = () => ({
      data: tables[table]?.error ? null : tables[table]?.list ?? [],
      error: tables[table]?.error ?? null,
    });
    const oneRes = () => ({
      data: tables[table]?.error ? null : tables[table]?.one ?? null,
      error: tables[table]?.error ?? null,
    });
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: async () => listRes(),
      maybeSingle: async () => oneRes(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(listRes()).then(resolve, reject),
    };
    return chain;
  }
  return Object.assign(
    {
      from: (table: string) => {
        fromCalls.push(table);
        return chainFor(table);
      },
      _fromCalls: fromCalls,
    },
    {},
  ) as unknown as SupabaseClient & { _fromCalls: string[] };
}

let poolSeq = 0;
function poolRow(pool: string, value: string, surcharge: number | null, active = true) {
  return {
    id: `00000000-0000-4000-8000-${String(++poolSeq).padStart(12, "0")}`,
    pool,
    value,
    label: null,
    dimensions: null,
    surcharge,
    active,
    sort_order: poolSeq,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    updated_by: null,
  };
}

function fabricRow(code: string, over: Record<string, unknown> = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(++poolSeq).padStart(12, "0")}`,
    fabric_code: code,
    series: null,
    description: "Oat weave",
    supplier_code: null,
    sofa_tier: "PRICE_1",
    bedframe_tier: "PRICE_2",
    active: true,
    sort_order: poolSeq,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    updated_by: null,
    ...over,
  };
}

const POOL_TABLE = {
  catalog_option_pools: {
    list: [
      poolRow("divan_height", '10"', 125),
      poolRow("divan_height", '8"', null),
      poolRow("bedframe_leg_height", '4"', 60),
      poolRow("bedframe_leg_height", '2"', 40, false),
    ],
  },
};

const lineWith = (
  options: unknown,
  total: unknown,
  unitPrice = 2185,
  sku = "BF-K",
): RecomputableLine => ({
  sku,
  qty: 1,
  attrs: { options, options_total: total } as Record<string, unknown>,
  unitPrice,
});

describe("recomputeOptionPickLines", () => {
  it("passes through lines with no options (no DB read)", async () => {
    const sb = mockSb({});
    const lines: RecomputableLine[] = [{ sku: "A", qty: 1, attrs: null, unitPrice: 100 }];
    const r = await recomputeOptionPickLines(sb, lines);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines).toEqual(lines);
    expect(sb._fromCalls).toEqual([]);
  });

  it("accepts a matching client total and canonicalises attrs.options", async () => {
    const line = lineWith(
      [
        { kind: "divan_height", value: '10"', surcharge: 125 },
        { kind: "bedframe_leg_height", value: '4"', surcharge: 60 },
      ],
      185,
      2185,
    );
    const r = await recomputeOptionPickLines(mockSb(POOL_TABLE), [line]);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[0]!.unitPrice).toBe(2185); // 2185 − 185 + 185
    const attrs = r.lines[0]!.attrs as {
      options_total: number;
      options: Array<{ kind: string; value: string; surcharge: number }>;
    };
    expect(attrs.options_total).toBe(185);
    expect(attrs.options).toEqual([
      { kind: "divan_height", value: '10"', surcharge: 125 },
      { kind: "bedframe_leg_height", value: '4"', surcharge: 60 },
    ]);
  });

  it("nudges unitPrice when the server figure moved sub-tolerance", async () => {
    const line = lineWith([{ kind: "divan_height", value: '10"', surcharge: 125.004 }], 125.004, 2125.004);
    const r = await recomputeOptionPickLines(mockSb(POOL_TABLE), [line]);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[0]!.unitPrice).toBe(2125); // 2125.004 − 125.004 + 125
  });

  it("rejects a faked client total beyond tolerance (drift → 422 path)", async () => {
    const line = lineWith([{ kind: "divan_height", value: '10"', surcharge: 5 }], 5, 2005);
    const r = await recomputeOptionPickLines(mockSb(POOL_TABLE), [line]);
    expect(r.status).toBe("drift");
    if (r.status !== "drift") return;
    expect(r.drift).toMatchObject({ lineSku: "BF-K", clientTotal: 5, serverTotal: 125 });
  });

  it("rejects a retired / INACTIVE pool value (bad_request, reconfigure)", async () => {
    // '2"' exists but active=false; 'ghost' never existed — both must reject.
    for (const value of ['2"', "ghost"]) {
      const line = lineWith([{ kind: "bedframe_leg_height", value, surcharge: 0 }], 0);
      const r = await recomputeOptionPickLines(mockSb(POOL_TABLE), [line]);
      expect(r.status).toBe("bad_request");
      if (r.status !== "bad_request") continue;
      expect(r.message.toLowerCase()).toContain("no longer available");
    }
  });

  it("rejects malformed option attrs (unknown kind)", async () => {
    const line = lineWith([{ kind: "gap", value: '10"', surcharge: 0 }], 0);
    const r = await recomputeOptionPickLines(mockSb(POOL_TABLE), [line]);
    expect(r.status).toBe("bad_request");
  });

  it("fails closed on a pool read error", async () => {
    const line = lineWith([{ kind: "divan_height", value: '10"', surcharge: 125 }], 125);
    const r = await recomputeOptionPickLines(
      mockSb({ catalog_option_pools: { error: { message: "db down" } } }),
      [line],
    );
    expect(r.status).toBe("server_error");
  });

  it("a freed line (attrs.free_gift/free_item) passes through verbatim at RM0", async () => {
    const line: RecomputableLine = {
      sku: "BF-K",
      qty: 1,
      attrs: {
        free_item: { campaignId: "c1" },
        options: [{ kind: "divan_height", value: '10"', surcharge: 125 }],
        options_total: 125,
      },
      unitPrice: 0,
    };
    const r = await recomputeOptionPickLines(mockSb({}), [line]);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[0]).toBe(line);
  });

  describe("fabric picks", () => {
    const FABRIC_TABLES = {
      ...POOL_TABLE,
      catalog_fabrics: { list: [fabricRow("BF-01")] },
      fabric_tier_addon_config: {
        one: { id: 1, sofa_tier2_delta: "150", sofa_tier3_delta: "300", updated_at: "2026-07-01T00:00:00Z", updated_by: null },
      },
      product_skus: { list: [{ sku: "BF-K", model_id: "m-1" }] },
      product_models: { list: [{ id: "m-1", category: "bedframe" }] },
      model_fabric_tier_overrides: { list: [] },
    };

    it("prices a fabric pick from the line's model CATEGORY tier column", async () => {
      // bedframe → bedframe_tier PRICE_2 → global tier2 delta 150.
      const line = lineWith([{ kind: "fabric", value: "BF-01", surcharge: 150 }], 150, 2150);
      const r = await recomputeOptionPickLines(mockSb(FABRIC_TABLES), [line]);
      expect(r.status).toBe("ok");
      if (r.status !== "ok") return;
      const attrs = r.lines[0]!.attrs as { options: Array<Record<string, unknown>> };
      expect(attrs.options[0]).toEqual({
        kind: "fabric",
        value: "BF-01",
        label: "Oat weave",
        surcharge: 150,
      });
    });

    it("per-model tier override beats the global config", async () => {
      const tables = {
        ...FABRIC_TABLES,
        model_fabric_tier_overrides: {
          list: [
            { model_id: "m-1", tier2_delta: "999", tier3_delta: null, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z", updated_by: null },
          ],
        },
      };
      const line = lineWith([{ kind: "fabric", value: "BF-01", surcharge: 999 }], 999, 2999);
      const r = await recomputeOptionPickLines(mockSb(tables), [line]);
      expect(r.status).toBe("ok");
    });

    it("a fabric pick on an unknown sku fails closed (bad_request)", async () => {
      const tables = { ...FABRIC_TABLES, product_skus: { list: [] } };
      const line = lineWith([{ kind: "fabric", value: "BF-01", surcharge: 150 }], 150);
      const r = await recomputeOptionPickLines(mockSb(tables), [line]);
      expect(r.status).toBe("bad_request");
      if (r.status !== "bad_request") return;
      expect(r.message).toContain("not a known product");
    });

    it("a retired fabric code rejects (bad_request, reconfigure)", async () => {
      const tables = { ...FABRIC_TABLES, catalog_fabrics: { list: [fabricRow("BF-01", { active: false })] } };
      const line = lineWith([{ kind: "fabric", value: "BF-01", surcharge: 150 }], 150);
      const r = await recomputeOptionPickLines(mockSb(tables), [line]);
      expect(r.status).toBe("bad_request");
    });
  });
});
