import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recomputeDeliveryFee, type DeliveryRecomputeContext } from "./delivery-fee-recompute";
import type { RecomputableLine } from "./sofa-recompute";

/* ─── per-table mock ────────────────────────────────────────────────────────
 * The real recompute touches up to 6 tables. This mock resolves each terminal
 * (.maybeSingle / .in / .limit / await) to that table's configured response, so
 * a test can wire delivery_fee_config + rules + product_skus + orders +
 * order_addons independently (the orders.test.ts harness can't — see the
 * carry-forward note). */
const MODEL_X = "00000000-0000-0000-0000-00000000000x";

interface MockOpts {
  config?: Record<string, unknown> | null;
  configError?: { message: string };
  rules?: unknown[];
  rulesError?: { message: string };
  skus?: Array<Record<string, unknown>>;
  skusError?: { message: string };
  combos?: Array<{ id: string; slots: string[][] }>;
  combosError?: { message: string };
  sourceOrder?: Record<string, unknown> | null;
  sourceOrderError?: { message: string };
  usedAddons?: Array<{ id: string }>;
  usedAddonsError?: { message: string };
  /** order_lines rows for the SOURCE order's category resolution (FIX B). */
  sourceOrderLines?: Array<{ sku: string }>;
  sourceOrderLinesError?: { message: string };
}

function mockSb(opts: MockOpts = {}): SupabaseClient {
  const td = (table: string): { single: unknown; list: unknown[]; error?: { message: string } } => {
    switch (table) {
      case "delivery_fee_config":
        return { single: opts.config ?? null, list: [], error: opts.configError };
      case "special_delivery_fee_rules":
        return { single: null, list: opts.rules ?? [], error: opts.rulesError };
      case "product_skus":
        return { single: null, list: opts.skus ?? [], error: opts.skusError };
      case "sofa_combo_pricing":
        return { single: null, list: opts.combos ?? [], error: opts.combosError };
      case "orders":
        return { single: opts.sourceOrder ?? null, list: [], error: opts.sourceOrderError };
      case "order_lines":
        return { single: null, list: opts.sourceOrderLines ?? [], error: opts.sourceOrderLinesError };
      case "order_addons":
        return { single: null, list: opts.usedAddons ?? [], error: opts.usedAddonsError };
      default:
        return { single: null, list: [] };
    }
  };
  const builder = (table: string) => {
    const d = td(table);
    const listRes = async () => ({ data: d.error ? null : d.list, error: d.error ?? null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      eq: () => b,
      in: () => listRes(),
      limit: () => listRes(),
      maybeSingle: async () => ({ data: d.error ? null : d.single, error: d.error ?? null }),
      // thenable — `await sb.from(t).select("*")` (unfiltered rules read).
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: d.error ? null : d.list, error: d.error ?? null }),
    };
    return b;
  };
  return {
    from: (table: string) => ({ select: () => builder(table) }),
  } as unknown as SupabaseClient;
}

const cfgRow = (over: Record<string, unknown> = {}) => ({
  id: 1,
  base_fee: 0,
  cross_category_fee: 0,
  charged_categories: ["sofa", "mattress", "bedframe"],
  mattress_bedframe_lead_days: 14,
  sofa_lead_days: 21,
  updated_at: "2026-01-01T00:00:00Z",
  updated_by: null,
  ...over,
});

const ruleRow = (over: Record<string, unknown> = {}) => ({
  id: "00000000-0000-0000-0000-0000000rule1",
  target: [{ scope: "model", modelId: MODEL_X }],
  standalone_fee: 0,
  cross_cat_followup_fee: 0,
  label: null,
  active: true,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  updated_by: null,
  ...over,
});

const skuRow = (sku: string, category: string, over: Record<string, unknown> = {}) => ({
  sku,
  model_id: MODEL_X,
  variant: "QUEEN",
  product_models: { category },
  ...over,
});

const line = (sku: string, over: Partial<RecomputableLine> = {}): RecomputableLine => ({
  sku,
  qty: 1,
  attrs: null,
  unitPrice: 0,
  ...over,
});

const ctx = (over: Partial<DeliveryRecomputeContext> = {}): DeliveryRecomputeContext => ({
  additionalDeliveryFee: 0,
  crossCategorySourceSo: null,
  customerPhone: "012-3456789",
  ...over,
});

describe("recomputeDeliveryFee — dormant", () => {
  it("0-rate config + a charged line → NO delivery addon (byte-identical)", async () => {
    const sb = mockSb({ config: cfgRow(), skus: [skuRow("M1", "mattress")] });
    const r = await recomputeDeliveryFee(sb, [line("M1")], ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.addons).toEqual([]);
    expect(r.fee.total).toBe(0);
  });

  it("absent config row falls back to dormant (no addon)", async () => {
    const sb = mockSb({ config: null, skus: [skuRow("M1", "mattress")] });
    const r = await recomputeDeliveryFee(sb, [line("M1")], ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.addons).toEqual([]);
  });

  it("dormant path books zero addons WITHOUT touching the category embed (FIX D)", async () => {
    // A skusError would surface as server_error IF the recompute reached the
    // product_skus embed; a dormant 0/0 config + no client fee must early-return
    // before that. status ok proves the embed was skipped.
    const sb = mockSb({ config: cfgRow(), skusError: { message: "must not read product_skus" } });
    const r = await recomputeDeliveryFee(sb, [line("M1")], ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.addons).toEqual([]);
    expect(r.fee.total).toBe(0);
  });
});

describe("recomputeDeliveryFee — base + cross-category", () => {
  it("a configured base fee on a single charged category → one DELIVERY addon", async () => {
    const sb = mockSb({ config: cfgRow({ base_fee: 50, cross_category_fee: 30 }), skus: [skuRow("M1", "mattress")] });
    const r = await recomputeDeliveryFee(sb, [line("M1")], ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.addons).toEqual([
      { addonKey: "DELIVERY", qty: 1, unitPrice: 50, attrs: { kind: "base" } },
    ]);
  });

  it("in-order sofa × mattress → DELIVERY_CROSS is pure-engine WIRING ONLY — unreachable on a Carres order (0089 mutex rejects the order at create_order, so it never persists)", async () => {
    // This input cannot occur on a real Carres order: migration 0089's category
    // mutex rejects any single order mixing sofa with mattress/bedframe (the
    // recompute runs BEFORE create_order, which 422s `mixed_category_lines` so no
    // DELIVERY_CROSS addon is ever written). The case is kept only to document
    // the faithful pure-engine wiring — it does NOT imply such an order books.
    const sb = mockSb({
      config: cfgRow({ base_fee: 50, cross_category_fee: 30 }),
      skus: [skuRow("S1", "sofa"), skuRow("M1", "mattress")],
    });
    const r = await recomputeDeliveryFee(sb, [line("S1"), line("M1")], ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    const keys = r.addons.map((a) => a.addonKey);
    expect(keys).toEqual(["DELIVERY", "DELIVERY_CROSS"]);
    expect(r.addons.find((a) => a.addonKey === "DELIVERY_CROSS")?.unitPrice).toBe(30);
    expect(r.fee.total).toBe(80);
  });

  it("a category NOT in charged_categories does not bill a base fee", async () => {
    const sb = mockSb({
      config: cfgRow({ base_fee: 50, charged_categories: ["sofa"] }),
      skus: [skuRow("M1", "mattress")],
    });
    const r = await recomputeDeliveryFee(sb, [line("M1")], ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.addons).toEqual([]);
  });
});

describe("recomputeDeliveryFee — no-funding (Phase 7 free lines)", () => {
  it("a free_item line alone does NOT trip a base fee (excluded from charged categories)", async () => {
    const sb = mockSb({ config: cfgRow({ base_fee: 50 }), skus: [skuRow("M1", "mattress")] });
    const r = await recomputeDeliveryFee(
      sb,
      [line("M1", { unitPrice: 0, attrs: { free_item: { campaignId: "c1", name: "GWP" } } })],
      ctx(),
    );
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.addons).toEqual([]);
    expect(r.fee.total).toBe(0);
  });

  it("a free_gift line is excluded; only the PAID line's category bills", async () => {
    const sb = mockSb({
      config: cfgRow({ base_fee: 50 }),
      skus: [skuRow("M1", "mattress"), skuRow("GIFT", "accessory")],
    });
    const r = await recomputeDeliveryFee(
      sb,
      [
        line("M1"),
        line("GIFT", { unitPrice: 0, attrs: { free_gift: { giftSku: "GIFT", sourceModelId: MODEL_X } } }),
      ],
      ctx(),
    );
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    // The paid mattress bills the base; the free gift adds nothing.
    expect(r.addons).toEqual([{ addonKey: "DELIVERY", qty: 1, unitPrice: 50, attrs: { kind: "base" } }]);
  });

  // Phase 8b — a 'promo' PWP reward forced to RM0 is a giveaway (no-funding):
  // excluded from the charged-category set just like free_gift / free_item.
  it("a 'promo' PWP line alone does NOT trip a base fee (excluded, no-funding)", async () => {
    const sb = mockSb({ config: cfgRow({ base_fee: 50 }), skus: [skuRow("M1", "mattress")] });
    const r = await recomputeDeliveryFee(
      sb,
      [line("M1", { unitPrice: 0, attrs: { pwp: { ruleId: "r1", type: "promo", triggerRef: null } } })],
      ctx(),
    );
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.addons).toEqual([]);
    expect(r.fee.total).toBe(0);
  });

  // A 'pwp' reward (discounted, > 0) is a PAID deliverable genuinely on the truck
  // → it COUNTS for delivery (NOT excluded).
  it("a 'pwp' PWP line (discounted, > 0) IS billed (counts for delivery)", async () => {
    const sb = mockSb({ config: cfgRow({ base_fee: 50 }), skus: [skuRow("M1", "mattress")] });
    const r = await recomputeDeliveryFee(
      sb,
      [line("M1", { unitPrice: 300, attrs: { pwp: { ruleId: "r1", type: "pwp", triggerRef: null } } })],
      ctx(),
    );
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.addons).toEqual([{ addonKey: "DELIVERY", qty: 1, unitPrice: 50, attrs: { kind: "base" } }]);
  });
});

describe("recomputeDeliveryFee — special rule match", () => {
  it("a matched model-scope rule supersedes the base (highest wins)", async () => {
    const sb = mockSb({
      config: cfgRow({ base_fee: 50 }),
      rules: [ruleRow({ standalone_fee: 500 })],
      skus: [skuRow("M1", "mattress")],
    });
    const r = await recomputeDeliveryFee(sb, [line("M1")], ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.addons[0]).toEqual({ addonKey: "DELIVERY", qty: 1, unitPrice: 500, attrs: { kind: "special" } });
    expect(r.fee.isSpecial).toBe(true);
  });

  it("an INACTIVE rule is ignored", async () => {
    const sb = mockSb({
      config: cfgRow({ base_fee: 50 }),
      rules: [ruleRow({ standalone_fee: 500, active: false })],
      skus: [skuRow("M1", "mattress")],
    });
    const r = await recomputeDeliveryFee(sb, [line("M1")], ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.addons[0]?.unitPrice).toBe(50);
    expect(r.fee.isSpecial).toBe(false);
  });
});

describe("recomputeDeliveryFee — additional fee", () => {
  it("books a DELIVERY_ADD addon for the operator's free-form fee", async () => {
    const sb = mockSb({ config: cfgRow(), skus: [skuRow("M1", "mattress")] });
    const r = await recomputeDeliveryFee(sb, [line("M1")], ctx({ additionalDeliveryFee: 20 }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.addons).toEqual([
      { addonKey: "DELIVERY_ADD", qty: 1, unitPrice: 20, attrs: null },
    ]);
  });

  it("clamps a negative additional fee to 0 (no addon)", async () => {
    const sb = mockSb({ config: cfgRow(), skus: [skuRow("M1", "mattress")] });
    const r = await recomputeDeliveryFee(sb, [line("M1")], ctx({ additionalDeliveryFee: -50 }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.addons).toEqual([]);
  });
});

describe("recomputeDeliveryFee — cross-order follow-up", () => {
  it("a sofa-source + mattress-new link spans a real cross-category pair → follow-up applies + records the source", async () => {
    // new order = mattress; SOURCE order = sofa (resolved via its order_lines) →
    // genuinely a second trip → reduced rate + link recorded.
    const sb = mockSb({
      config: cfgRow({ base_fee: 500, cross_category_fee: 175 }),
      skus: [skuRow("M1", "mattress"), skuRow("S-SRC", "sofa")],
      sourceOrder: { id: "ord-1", so: 1042, status: "place", customer_phone: "012-3456789" },
      sourceOrderLines: [{ sku: "S-SRC" }],
      usedAddons: [],
    });
    const r = await recomputeDeliveryFee(sb, [line("M1")], ctx({ crossCategorySourceSo: "SO-1042" }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.fee.isFollowup).toBe(true);
    expect(r.addons).toEqual([
      {
        addonKey: "DELIVERY",
        qty: 1,
        unitPrice: 175,
        attrs: { kind: "cross_category_followup", cross_category_source_so: "SO-1042" },
      },
    ]);
  });

  it("a same-customer link where BOTH orders are mattress → NOT a follow-up (full base, no reduced rate, no link)", async () => {
    // hard checks pass, but mattress→mattress is one bedroom trip, not cross —
    // book the standalone base, never the reduced follow-up rate, never the link.
    const sb = mockSb({
      config: cfgRow({ base_fee: 500, cross_category_fee: 175 }),
      skus: [skuRow("M1", "mattress"), skuRow("M-SRC", "mattress")],
      sourceOrder: { id: "ord-1", so: 1042, status: "place", customer_phone: "012-3456789" },
      sourceOrderLines: [{ sku: "M-SRC" }],
      usedAddons: [],
    });
    const r = await recomputeDeliveryFee(sb, [line("M1")], ctx({ crossCategorySourceSo: "SO-1042" }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.fee.isFollowup).toBe(false);
    // full standalone base, kind "base", and NO source-SO link recorded
    expect(r.addons).toEqual([
      { addonKey: "DELIVERY", qty: 1, unitPrice: 500, attrs: { kind: "base" } },
    ]);
  });

  it("a bare numeric link parses against orders.so", async () => {
    const sb = mockSb({
      config: cfgRow({ base_fee: 500, cross_category_fee: 175 }),
      skus: [skuRow("S1", "sofa"), skuRow("M-SRC", "mattress")],
      sourceOrder: { id: "ord-1", so: 1042, status: "place", customer_phone: "0123456789" },
      sourceOrderLines: [{ sku: "M-SRC" }],
      usedAddons: [],
    });
    const r = await recomputeDeliveryFee(sb, [line("S1")], ctx({ crossCategorySourceSo: "1042" }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.fee.isFollowup).toBe(true);
  });

  it("a missing source SO → bad_request (order NOT created)", async () => {
    const sb = mockSb({ config: cfgRow({ base_fee: 500 }), skus: [skuRow("S1", "sofa")], sourceOrder: null });
    const r = await recomputeDeliveryFee(sb, [line("S1")], ctx({ crossCategorySourceSo: "SO-9999" }));
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.message).toContain("was not found");
  });

  it("a cancelled source SO → bad_request", async () => {
    const sb = mockSb({
      config: cfgRow({ base_fee: 500 }),
      skus: [skuRow("S1", "sofa")],
      sourceOrder: { id: "ord-1", so: 1042, status: "cancelled", customer_phone: "012-3456789" },
    });
    const r = await recomputeDeliveryFee(sb, [line("S1")], ctx({ crossCategorySourceSo: "SO-1042" }));
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.message).toContain("cancelled");
  });

  it("a different-customer source SO (phone mismatch) → bad_request", async () => {
    const sb = mockSb({
      config: cfgRow({ base_fee: 500 }),
      skus: [skuRow("S1", "sofa")],
      sourceOrder: { id: "ord-1", so: 1042, status: "place", customer_phone: "019-9999999" },
    });
    const r = await recomputeDeliveryFee(sb, [line("S1")], ctx({ crossCategorySourceSo: "SO-1042" }));
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.message).toContain("different customer");
  });

  it("an already-used source SO → bad_request (single-use)", async () => {
    const sb = mockSb({
      config: cfgRow({ base_fee: 500 }),
      skus: [skuRow("S1", "sofa")],
      sourceOrder: { id: "ord-1", so: 1042, status: "place", customer_phone: "012-3456789" },
      usedAddons: [{ id: "addon-1" }],
    });
    const r = await recomputeDeliveryFee(sb, [line("S1")], ctx({ crossCategorySourceSo: "SO-1042" }));
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.message).toContain("already used");
  });

  it("a non-numeric link → bad_request", async () => {
    const sb = mockSb({ config: cfgRow({ base_fee: 500 }), skus: [skuRow("S1", "sofa")] });
    const r = await recomputeDeliveryFee(sb, [line("S1")], ctx({ crossCategorySourceSo: "garbage" }));
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.message).toContain("not a valid SO");
  });
});

describe("recomputeDeliveryFee — exploded sofa build (combo match)", () => {
  it("regroups exploded compartment lines by sofa_build_key and matches a combo rule", async () => {
    const sb = mockSb({
      config: cfgRow({ base_fee: 50 }),
      rules: [ruleRow({ target: [{ scope: "combo", modelId: "", comboIds: ["cmb-pair"] }], standalone_fee: 250 })],
      combos: [{ id: "cmb-pair", slots: [["1A(LHF)"], ["1NA"]] }],
      skus: [skuRow("SOFA-1A", "sofa"), skuRow("SOFA-1NA", "sofa")],
    });
    const lines: RecomputableLine[] = [
      line("SOFA-1A", { attrs: { sofa_build_key: "bk1", module_code: "1A(LHF)" } }),
      line("SOFA-1NA", { attrs: { sofa_build_key: "bk1", module_code: "1NA" } }),
    ];
    const r = await recomputeDeliveryFee(sb, lines, ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    // combo subset matched → special standalone 250 supersedes base 50
    expect(r.addons[0]).toMatchObject({ addonKey: "DELIVERY", unitPrice: 250 });
    expect(r.fee.isSpecial).toBe(true);
  });
});

describe("recomputeDeliveryFee — fail-closed", () => {
  it("a config read error → server_error", async () => {
    const sb = mockSb({ configError: { message: "db down" }, skus: [skuRow("M1", "mattress")] });
    const r = await recomputeDeliveryFee(sb, [line("M1")], ctx());
    expect(r.status).toBe("server_error");
  });

  it("a rules read error → server_error", async () => {
    const sb = mockSb({ config: cfgRow(), rulesError: { message: "rules down" }, skus: [skuRow("M1", "mattress")] });
    const r = await recomputeDeliveryFee(sb, [line("M1")], ctx());
    expect(r.status).toBe("server_error");
  });

  it("a product_skus read error → server_error (non-dormant config reaches the embed)", async () => {
    // base_fee 50 makes this NON-dormant, so the recompute reaches the category
    // embed and the read error surfaces fail-closed (a dormant config would
    // early-return before the embed — see the FIX D test below).
    const sb = mockSb({ config: cfgRow({ base_fee: 50 }), skusError: { message: "skus down" } });
    const r = await recomputeDeliveryFee(sb, [line("M1")], ctx());
    expect(r.status).toBe("server_error");
  });

  it("a source-SO lookup error → server_error (never silently grant the rate)", async () => {
    const sb = mockSb({
      config: cfgRow({ base_fee: 500 }),
      skus: [skuRow("S1", "sofa")],
      sourceOrderError: { message: "orders down" },
    });
    const r = await recomputeDeliveryFee(sb, [line("S1")], ctx({ crossCategorySourceSo: "SO-1042" }));
    expect(r.status).toBe("server_error");
  });
});
