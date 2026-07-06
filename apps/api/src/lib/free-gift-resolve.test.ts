import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveDefaultFreeGiftLines,
  validateFreeItemClaims,
} from "./free-gift-resolve";
import type { RecomputableLine } from "./sofa-recompute";

const MODEL = "00000000-0000-0000-0000-00000000m0del";
const OTHER_MODEL = "00000000-0000-0000-0000-0000000other";

/* ─── per-table mock (mirrors delivery-fee-recompute.test.ts) ────────────────
 * The resolver touches product_skus, model_default_free_gifts,
 * free_item_campaigns, sofa_combo_pricing. Each terminal (.in / .maybeSingle /
 * await) resolves to that table's configured response so a test can wire them
 * independently (the orders.test.ts shared chain can't). */
interface MockOpts {
  productSkus?: Array<Record<string, unknown>>;
  productSkusError?: { message: string };
  modelGifts?: unknown[];
  modelGiftsError?: { message: string };
  campaigns?: unknown[];
  campaignsError?: { message: string };
  combos?: Array<{ id: string; slots: string[][] }>;
  combosError?: { message: string };
}

function mockSb(opts: MockOpts = {}): SupabaseClient {
  const td = (table: string): { list: unknown[]; error?: { message: string } } => {
    switch (table) {
      case "product_skus":
        return { list: opts.productSkus ?? [], error: opts.productSkusError };
      case "model_default_free_gifts":
        return { list: opts.modelGifts ?? [], error: opts.modelGiftsError };
      case "free_item_campaigns":
        return { list: opts.campaigns ?? [], error: opts.campaignsError };
      case "sofa_combo_pricing":
        return { list: opts.combos ?? [], error: opts.combosError };
      default:
        return { list: [] };
    }
  };
  const builder = (table: string) => {
    const d = td(table);
    const listRes = async () => ({ data: d.error ? null : d.list, error: d.error ?? null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      eq: () => b,
      in: () => listRes(),
      maybeSingle: async () => ({ data: null, error: d.error ?? null }),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: d.error ? null : d.list, error: d.error ?? null }),
    };
    return b;
  };
  return { from: (table: string) => ({ select: () => builder(table) }) } as unknown as SupabaseClient;
}

const skuRow = (sku: string, over: Record<string, unknown> = {}) => ({
  sku,
  model_id: MODEL,
  variant: "QUEEN",
  product_models: { category: "mattress" },
  ...over,
});

const giftRow = (gifts: unknown[], modelId = MODEL) => ({
  model_id: modelId,
  gifts,
  updated_at: "2026-01-01T00:00:00Z",
  updated_by: null,
});

const campaignRow = (over: Record<string, unknown> = {}) => ({
  id: "camp-1",
  name: "GWP Promo",
  active: true,
  max_free_qty: 2,
  eligible: [{ scope: "model", modelId: MODEL }],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  updated_by: null,
  ...over,
});

const line = (over: Partial<RecomputableLine> = {}): RecomputableLine => ({
  sku: "MATT-1",
  qty: 1,
  attrs: null,
  unitPrice: 1500,
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe("resolveDefaultFreeGiftLines", () => {
  it("DORMANT — no gifts configured → no appended lines (F8: short-circuits before any product_skus read)", async () => {
    const sb = mockSb({ productSkus: [skuRow("MATT-1")], modelGifts: [] });
    const fromSpy = vi.spyOn(sb, "from");
    const r = await resolveDefaultFreeGiftLines(sb, [line()]);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines).toEqual([]);
    // F8 — the gift config is read FIRST; the dormant order never reads product_skus.
    expect(fromSpy).toHaveBeenCalledWith("model_default_free_gifts");
    expect(fromSpy).not.toHaveBeenCalledWith("product_skus");
  });

  it("a configured model gift → one appended RM0 line with attrs.free_gift", async () => {
    const sb = mockSb({
      productSkus: [skuRow("MATT-1"), skuRow("GIFT-PILLOW", { model_id: null, product_models: { category: "accessory" } })],
      modelGifts: [giftRow([{ giftSku: "GIFT-PILLOW", qty: 1, label: "Free pillow" }])],
    });
    const r = await resolveDefaultFreeGiftLines(sb, [line()]);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ sku: "GIFT-PILLOW", qty: 1, unitPrice: 0 });
    expect(r.lines[0]!.attrs).toEqual({
      free_gift: { giftSku: "GIFT-PILLOW", label: "Free pillow", sourceModelId: MODEL },
    });
  });

  it("a campaign-freed item (attrs.free_item) STILL keeps its default gift (GWP not stripped by 'Make free')", async () => {
    const sb = mockSb({
      productSkus: [skuRow("MATT-1"), skuRow("GIFT-PILLOW", { product_models: { category: "accessory" } })],
      modelGifts: [giftRow([{ giftSku: "GIFT-PILLOW", qty: 1 }])],
    });
    // The mattress was made free via a campaign (unitPrice 0 + attrs.free_item) —
    // it must STILL trigger its ACC gift.
    const r = await resolveDefaultFreeGiftLines(sb, [
      line({ attrs: { free_item: { campaignId: "camp-1" } }, unitPrice: 0 }),
    ]);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ sku: "GIFT-PILLOW", qty: 1, unitPrice: 0 });
  });

  it("an appended gift line (attrs.free_gift) never triggers another gift (no recursion)", async () => {
    const sb = mockSb({
      productSkus: [skuRow("MATT-1"), skuRow("GIFT-PILLOW", { product_models: { category: "accessory" } })],
      modelGifts: [giftRow([{ giftSku: "GIFT-PILLOW", qty: 1 }])],
    });
    const r = await resolveDefaultFreeGiftLines(sb, [
      line({ attrs: { free_gift: { giftSku: "GIFT-PILLOW" } } }),
    ]);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines).toEqual([]);
  });

  it("scales a non-sofa gift by the trigger line qty", async () => {
    const sb = mockSb({
      productSkus: [skuRow("MATT-1"), skuRow("GIFT-PILLOW", { product_models: { category: "accessory" } })],
      modelGifts: [giftRow([{ giftSku: "GIFT-PILLOW", qty: 1 }])],
    });
    const r = await resolveDefaultFreeGiftLines(sb, [line({ qty: 3 })]);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[0]).toMatchObject({ sku: "GIFT-PILLOW", qty: 3, unitPrice: 0 });
  });

  it("fail-SOFT (F4) — a gift sku pointing at a NON-accessory product is omitted (order still books)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // GIFT-MATTRESS exists but its model category is 'mattress' (a core item) —
    // appending it would trip the 0089 mutex, so it is fail-soft dropped.
    const sb = mockSb({
      productSkus: [skuRow("MATT-1"), skuRow("GIFT-MATTRESS", { product_models: { category: "mattress" } })],
      modelGifts: [giftRow([{ giftSku: "GIFT-MATTRESS", qty: 1 }])],
    });
    const r = await resolveDefaultFreeGiftLines(sb, [line()]);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("fail-SOFT — a gift sku that is not a real product_skus row is omitted (order still books)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // GIFT-GHOST is configured but NOT present in product_skus (only MATT-1 is).
    const sb = mockSb({
      productSkus: [skuRow("MATT-1")],
      modelGifts: [giftRow([{ giftSku: "GIFT-GHOST", qty: 1 }])],
    });
    const r = await resolveDefaultFreeGiftLines(sb, [line()]);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("fails CLOSED on a product_skus read error", async () => {
    // A gift IS configured (so the F8 dormant short-circuit doesn't fire) — the
    // trigger-line product_skus resolve then errors → fail-closed server_error.
    const sb = mockSb({
      modelGifts: [giftRow([{ giftSku: "GIFT-PILLOW", qty: 1 }])],
      productSkusError: { message: "skus down" },
    });
    const r = await resolveDefaultFreeGiftLines(sb, [line()]);
    expect(r.status).toBe("server_error");
  });

  it("a line whose model has no row contributes nothing", async () => {
    const sb = mockSb({ productSkus: [skuRow("MATT-1", { model_id: OTHER_MODEL })], modelGifts: [giftRow([{ giftSku: "GIFT-PILLOW", qty: 1 }], MODEL)] });
    const r = await resolveDefaultFreeGiftLines(sb, [line()]);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines).toEqual([]);
  });
});

describe("validateFreeItemClaims", () => {
  it("DORMANT — no markers → byte-identical (same line references, no DB read)", async () => {
    const sb = mockSb();
    const fromSpy = vi.spyOn(sb, "from");
    const lines = [line()];
    const r = await validateFreeItemClaims(sb, lines);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[0]).toBe(lines[0]); // identity preserved
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("strips a client-sent attrs.free_gift entirely (gifts are server-only)", async () => {
    const sb = mockSb();
    const lines = [line({ attrs: { free_gift: { giftSku: "HACK-FREE-TV" }, color: "blue" } })];
    const r = await validateFreeItemClaims(sb, lines);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[0]!.attrs).toEqual({ color: "blue" }); // free_gift removed, other attrs kept
  });

  it("a valid claim → forces the line unitPrice to 0 + canonical attrs.free_item", async () => {
    const sb = mockSb({ productSkus: [skuRow("MATT-1")], campaigns: [campaignRow()] });
    const lines = [line({ attrs: { free_item: { campaignId: "camp-1" } }, unitPrice: 1500 })];
    const r = await validateFreeItemClaims(sb, lines);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[0]!.unitPrice).toBe(0);
    expect(r.lines[0]!.attrs).toEqual({ free_item: { campaignId: "camp-1", name: "GWP Promo" } });
  });

  it("does NOT trust the client free_item content — re-derives name from the campaign", async () => {
    const sb = mockSb({ productSkus: [skuRow("MATT-1")], campaigns: [campaignRow()] });
    const lines = [line({ attrs: { free_item: { campaignId: "camp-1", name: "FAKE 100% OFF EVERYTHING" } } })];
    const r = await validateFreeItemClaims(sb, lines);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[0]!.attrs).toEqual({ free_item: { campaignId: "camp-1", name: "GWP Promo" } });
  });

  it("an ineligible claim (line model not in the campaign) → bad_request (→ 409)", async () => {
    const sb = mockSb({
      productSkus: [skuRow("MATT-1")],
      campaigns: [campaignRow({ eligible: [{ scope: "model", modelId: OTHER_MODEL }] })],
    });
    const lines = [line({ attrs: { free_item: { campaignId: "camp-1" } } })];
    const r = await validateFreeItemClaims(sb, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.message.toLowerCase()).toContain("not eligible");
  });

  it("a claim for an unknown / inactive campaign → bad_request", async () => {
    const sb = mockSb({ productSkus: [skuRow("MATT-1")], campaigns: [] });
    const lines = [line({ attrs: { free_item: { campaignId: "camp-gone" } } })];
    const r = await validateFreeItemClaims(sb, lines);
    expect(r.status).toBe("bad_request");
  });

  it("a claim whose qty exceeds max_free_qty → bad_request", async () => {
    const sb = mockSb({ productSkus: [skuRow("MATT-1")], campaigns: [campaignRow({ max_free_qty: 1 })] });
    const lines = [line({ qty: 2, attrs: { free_item: { campaignId: "camp-1" } } })];
    const r = await validateFreeItemClaims(sb, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.message.toLowerCase()).toContain("exceeds");
  });

  it("F3 — aggregates freed qty per campaign across lines: two qty-1 lines on a maxFreeQty=1 campaign → bad_request", async () => {
    const sb = mockSb({
      productSkus: [skuRow("MATT-1"), skuRow("MATT-2")],
      campaigns: [campaignRow({ max_free_qty: 1 })],
    });
    const lines = [
      line({ sku: "MATT-1", qty: 1, attrs: { free_item: { campaignId: "camp-1" } } }),
      line({ sku: "MATT-2", qty: 1, attrs: { free_item: { campaignId: "camp-1" } } }),
    ];
    const r = await validateFreeItemClaims(sb, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.message.toLowerCase()).toContain("exceeds");
  });

  it("F2 — a free-item claim on a sofa-build line → bad_request (→ 409; free-item is flat-only)", async () => {
    const sb = mockSb({ productSkus: [skuRow("SOFA-REP")], campaigns: [campaignRow()] });
    const lines = [
      line({
        sku: "SOFA-REP",
        attrs: { free_item: { campaignId: "camp-1" }, sofa_build: { cells: [{ moduleCode: "2A" }], height: "28" } },
      }),
    ];
    const r = await validateFreeItemClaims(sb, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.message.toLowerCase()).toContain("sofa build");
  });

  it("a free_item marker with no campaignId → bad_request (anti-tamper)", async () => {
    const sb = mockSb();
    const lines = [line({ attrs: { free_item: {} } })];
    const r = await validateFreeItemClaims(sb, lines);
    expect(r.status).toBe("bad_request");
  });

  it("fails CLOSED on a campaigns read error", async () => {
    const sb = mockSb({ campaignsError: { message: "campaigns down" } });
    const lines = [line({ attrs: { free_item: { campaignId: "camp-1" } } })];
    const r = await validateFreeItemClaims(sb, lines);
    expect(r.status).toBe("server_error");
  });
});
