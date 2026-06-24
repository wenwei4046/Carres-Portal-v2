import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recomputeSpecialAddonLines, type RecomputableLine } from "./special-addons-recompute";

// special_addons row as the DB returns it (snake_case + jsonb option_groups).
function row(over: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-0000-0000-0000000000a1",
    code: "right-drawer",
    label: "Right Drawer",
    so_description: "Right pull-out drawer",
    categories: ["bedframe"],
    selling_price: 50,
    cost: null,
    option_groups: [
      { label: "Thickness", required: true, choices: [{ label: '10"', extra: 0 }, { label: '8"', extra: -10 }] },
    ],
    active: true,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
    ...over,
  };
}

// Minimal mock: .from(t).select("*").in("code", …).eq("active", true) → {data,error}.
function mockSb(rows: unknown[], error: { message: string } | null = null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        in: () => ({
          eq: () => Promise.resolve({ data: error ? null : rows, error }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const lineWith = (specials: unknown, total: unknown, unitPrice = 2040): RecomputableLine => ({
  sku: "BF-K",
  qty: 1,
  attrs: { specials, specials_total: total } as Record<string, unknown>,
  unitPrice,
});

describe("recomputeSpecialAddonLines", () => {
  it("passes through lines with no specials (no DB read needed)", async () => {
    const lines: RecomputableLine[] = [{ sku: "A", qty: 1, attrs: null, unitPrice: 100 }];
    const r = await recomputeSpecialAddonLines(mockSb([]), lines);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines).toEqual(lines);
  });

  it("accepts a matching client total and canonicalises attrs.specials", async () => {
    const line = lineWith([{ code: "right-drawer", choiceLabels: ['8"'] }], 40, 2040);
    const r = await recomputeSpecialAddonLines(mockSb([row()]), [line]);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[0].unitPrice).toBe(2040); // 2040 - 40 + 40
    const attrs = r.lines[0].attrs as { specials_total: number; specials: { code: string; surcharge: number; soDescription: string }[] };
    expect(attrs.specials_total).toBe(40);
    expect(attrs.specials[0]).toMatchObject({ code: "right-drawer", surcharge: 40, soDescription: "Right pull-out drawer" });
  });

  it("nudges unitPrice by a sub-tolerance delta (server is authoritative)", async () => {
    const line = lineWith([{ code: "right-drawer", choiceLabels: ['8"'] }], 40.004, 2040.004);
    const r = await recomputeSpecialAddonLines(mockSb([row()]), [line]);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[0].unitPrice).toBe(2040); // 2040.004 - 40.004 + 40
  });

  it("rejects a faked client total beyond tolerance (drift → 422 path)", async () => {
    const line = lineWith([{ code: "right-drawer", choiceLabels: ['8"'] }], 100, 2100);
    const r = await recomputeSpecialAddonLines(mockSb([row()]), [line]);
    expect(r.status).toBe("drift");
    if (r.status !== "drift") return;
    expect(r.drift).toMatchObject({ lineSku: "BF-K", clientTotal: 100, serverTotal: 40 });
  });

  it("rejects a retired/unknown special code (bad_request)", async () => {
    const line = lineWith([{ code: "ghost", choiceLabels: [] }], 0, 1000);
    const r = await recomputeSpecialAddonLines(mockSb([]), [line]); // ghost not in active defs
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.message.toLowerCase()).toContain("no longer available");
  });

  it("rejects malformed specials attrs (missing specials_total)", async () => {
    const line: RecomputableLine = { sku: "BF-K", qty: 1, attrs: { specials: [{ code: "right-drawer" }] }, unitPrice: 2000 };
    const r = await recomputeSpecialAddonLines(mockSb([row()]), [line]);
    expect(r.status).toBe("bad_request");
  });

  it("fails closed on a catalog read error", async () => {
    const line = lineWith([{ code: "right-drawer", choiceLabels: ['8"'] }], 40);
    const r = await recomputeSpecialAddonLines(mockSb([], { message: "db down" }), [line]);
    expect(r.status).toBe("server_error");
  });

  it("supports a negative surcharge (deduction) folding into the line", async () => {
    const noPanel = row({ code: "no-side-panel", selling_price: -40, option_groups: [] });
    const line = lineWith([{ code: "no-side-panel", choiceLabels: [] }], -40, 1960);
    const r = await recomputeSpecialAddonLines(mockSb([noPanel]), [line]);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect((r.lines[0].attrs as { specials_total: number }).specials_total).toBe(-40);
  });
});
