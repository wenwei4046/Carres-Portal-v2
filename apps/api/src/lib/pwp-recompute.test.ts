import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recomputePwpLines } from "./pwp-recompute";
import type { RecomputableLine } from "./sofa-recompute";

const MATT_MODEL = "00000000-0000-0000-0000-0000000matt0";
const BED_MODEL = "00000000-0000-0000-0000-00000000bed0";
const OTHER_MODEL = "00000000-0000-0000-0000-0000000other";

/* ─── per-table mock (mirrors free-gift-resolve.test.ts / delivery) ───────────
 * The lib touches pwp_rules, product_skus (resolveSkuInfo join + pwp_price read),
 * and sofa_combo_pricing. Each terminal (.eq→await / .in / .maybeSingle) resolves
 * to that table's configured response. product_skus is read TWICE (the
 * resolveSkuInfo join + the pwp_price `.in`), distinguished by the select columns
 * is not needed here — both reads use `.in`, and the row shape carries both
 * `model_id`/`product_models.category` AND `pwp_price`, so one fixture serves
 * both. */
interface MockOpts {
  productSkus?: Array<Record<string, unknown>>;
  productSkusError?: { message: string };
  rules?: unknown[];
  rulesError?: { message: string };
  combos?: Array<{ id: string; slots: string[][] }>;
  combosError?: { message: string };
}

function mockSb(opts: MockOpts = {}): SupabaseClient {
  const td = (table: string): { list: unknown[]; error?: { message: string } } => {
    switch (table) {
      case "product_skus":
        return { list: opts.productSkus ?? [], error: opts.productSkusError };
      case "pwp_rules":
        return { list: opts.rules ?? [], error: opts.rulesError };
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
      // `.from(PWP_RULES).select("*").eq("active",true)` is awaited directly.
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: d.error ? null : d.list, error: d.error ?? null }),
    };
    return b;
  };
  return { from: (table: string) => ({ select: () => builder(table) }) } as unknown as SupabaseClient;
}

/** product_skus fixture row carrying BOTH the resolveSkuInfo join fields and
 *  pwp_price (the lib reads product_skus twice; one shape serves both). */
const skuRow = (sku: string, over: Record<string, unknown> = {}) => ({
  sku,
  model_id: MATT_MODEL,
  variant: "QUEEN",
  product_models: { category: "mattress" },
  pwp_price: null,
  ...over,
});

const ruleRow = (over: Record<string, unknown> = {}) => ({
  id: "rule-1",
  type: "pwp",
  trigger_category: "mattress",
  trigger_targets: [{ scope: "model", modelId: MATT_MODEL }],
  reward_category: "bedframe",
  reward_targets: [{ scope: "model", modelId: BED_MODEL }],
  qty_per_trigger: 1,
  active: true,
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

describe("recomputePwpLines", () => {
  it("DORMANT — no attrs.pwp markers → byte-identical (same refs, no DB read)", async () => {
    const sb = mockSb();
    const fromSpy = vi.spyOn(sb, "from");
    const lines = [line()];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[0]).toBe(lines[0]); // identity preserved
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("a valid 'pwp' claim → forces unitPrice to the reward sku pwp_price + canonical attrs.pwp", async () => {
    const sb = mockSb({
      productSkus: [
        skuRow("MATT-1"),
        skuRow("BED-1", { model_id: BED_MODEL, product_models: { category: "bedframe" }, pwp_price: 300 }),
      ],
      rules: [ruleRow()],
    });
    const lines = [
      line({ sku: "MATT-1", qty: 1, unitPrice: 1500 }),
      line({ sku: "BED-1", qty: 1, unitPrice: 900, attrs: { pwp: { ruleId: "rule-1" } } }),
    ];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[0]!.unitPrice).toBe(1500); // trigger untouched
    expect(r.lines[1]!.unitPrice).toBe(300); // reward forced to pwp_price
    expect(r.lines[1]!.attrs).toEqual({
      pwp: { ruleId: "rule-1", type: "pwp", triggerRef: { name: "MATT-1", code: "MATT-1" } },
    });
  });

  it("a valid 'promo' claim → forces unitPrice to 0 + attrs.pwp.type==='promo'", async () => {
    const sb = mockSb({
      productSkus: [
        skuRow("MATT-1"),
        skuRow("BED-1", { model_id: BED_MODEL, product_models: { category: "bedframe" }, pwp_price: null }),
      ],
      rules: [ruleRow({ type: "promo" })],
    });
    const lines = [
      line({ sku: "MATT-1", qty: 1 }),
      line({ sku: "BED-1", qty: 1, unitPrice: 900, attrs: { pwp: { ruleId: "rule-1" } } }),
    ];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[1]!.unitPrice).toBe(0);
    expect((r.lines[1]!.attrs as { pwp: { type: string } }).pwp.type).toBe("promo");
  });

  it("does NOT trust the client price / grant — re-derives everything server-side", async () => {
    const sb = mockSb({
      productSkus: [
        skuRow("MATT-1"),
        skuRow("BED-1", { model_id: BED_MODEL, product_models: { category: "bedframe" }, pwp_price: 300 }),
      ],
      rules: [ruleRow()],
    });
    const lines = [
      line({ sku: "MATT-1", qty: 1 }),
      line({
        sku: "BED-1",
        qty: 1,
        unitPrice: 1, // tampered preview
        attrs: { pwp: { ruleId: "rule-1", price: 1, type: "promo", grant: "HACK", triggerRef: { name: "X", code: "X" } } },
      }),
    ];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[1]!.unitPrice).toBe(300); // server pwp_price, not client 1
    // Only the canonical 3 fields survive — the client price/grant/forged type are gone.
    expect(r.lines[1]!.attrs).toEqual({
      pwp: { ruleId: "rule-1", type: "pwp", triggerRef: { name: "MATT-1", code: "MATT-1" } },
    });
  });

  it("an ineligible claim (reward model not in the rule's reward scope) → bad_request pwp_not_eligible", async () => {
    const sb = mockSb({
      productSkus: [
        skuRow("MATT-1"),
        skuRow("BED-1", { model_id: OTHER_MODEL, product_models: { category: "bedframe" }, pwp_price: 300 }),
      ],
      rules: [ruleRow()],
    });
    const lines = [
      line({ sku: "MATT-1", qty: 1 }),
      line({ sku: "BED-1", qty: 1, attrs: { pwp: { ruleId: "rule-1" } } }),
    ];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.code).toBe("pwp_not_eligible");
  });

  it("over-allowance — two qty-1 rewards claim a 1-trigger rule (allowance 1) → 2nd not granted → bad_request", async () => {
    const sb = mockSb({
      productSkus: [
        skuRow("MATT-1"),
        skuRow("BED-1", { model_id: BED_MODEL, product_models: { category: "bedframe" }, pwp_price: 300 }),
        skuRow("BED-2", { model_id: BED_MODEL, product_models: { category: "bedframe" }, pwp_price: 300 }),
      ],
      rules: [ruleRow({ qty_per_trigger: 1 })],
    });
    const lines = [
      line({ sku: "MATT-1", qty: 1 }), // 1 trigger → allowance 1
      line({ sku: "BED-1", qty: 1, attrs: { pwp: { ruleId: "rule-1" } } }),
      line({ sku: "BED-2", qty: 1, attrs: { pwp: { ruleId: "rule-1" } } }),
    ];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.code).toBe("pwp_not_eligible");
  });

  it("unknown / inactive rule (ruleId not in the active set) → bad_request pwp_unknown_rule", async () => {
    const sb = mockSb({
      productSkus: [skuRow("BED-1", { model_id: BED_MODEL, product_models: { category: "bedframe" }, pwp_price: 300 })],
      rules: [], // no active rules
    });
    const lines = [line({ sku: "BED-1", attrs: { pwp: { ruleId: "rule-gone" } } })];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.code).toBe("pwp_unknown_rule");
  });

  it("a sofa-build PWP claim → bad_request pwp_not_eligible_sofa_build (rejected before any DB read)", async () => {
    const sb = mockSb({ rules: [ruleRow()] });
    const fromSpy = vi.spyOn(sb, "from");
    const lines = [
      line({
        sku: "SOFA-REP",
        attrs: { pwp: { ruleId: "rule-1" }, sofa_build: { cells: [{ moduleCode: "2A" }], height: "28" } },
      }),
    ];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.code).toBe("pwp_not_eligible_sofa_build");
    expect(r.message.toLowerCase()).toContain("sofa");
    // Rejected outright — no rules / catalog read.
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("a PWP claim on a line carrying special add-ons → bad_request pwp_not_eligible_specials (before any DB read)", async () => {
    const sb = mockSb({ rules: [ruleRow()] });
    const fromSpy = vi.spyOn(sb, "from");
    const lines = [
      line({
        sku: "BED-1",
        attrs: {
          pwp: { ruleId: "rule-1" },
          specials: [{ code: "SP-1", choiceLabels: [] }],
          specials_total: 50,
        },
      }),
    ];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.code).toBe("pwp_not_eligible_specials");
    // Rejected outright — no rules / catalog read.
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("a 'pwp' reward whose pwp_price is NULL → bad_request pwp_not_eligible (no price configured)", async () => {
    const sb = mockSb({
      productSkus: [
        skuRow("MATT-1"),
        skuRow("BED-1", { model_id: BED_MODEL, product_models: { category: "bedframe" }, pwp_price: null }),
      ],
      rules: [ruleRow()], // type 'pwp'
    });
    const lines = [
      line({ sku: "MATT-1", qty: 1 }),
      line({ sku: "BED-1", qty: 1, attrs: { pwp: { ruleId: "rule-1" } } }),
    ];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.code).toBe("pwp_not_eligible");
    expect(r.message.toLowerCase()).toContain("no pwp price");
  });

  it("a pwp marker with no ruleId → bad_request pwp_unknown_rule (anti-tamper)", async () => {
    const sb = mockSb();
    const lines = [line({ attrs: { pwp: {} } })];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.code).toBe("pwp_unknown_rule");
  });

  it("promo one-way — a free_item line cannot serve as the promo trigger (reward not granted)", async () => {
    // A 'promo' rule whose trigger == reward category (buy ARRUS → free ARRUS).
    // The only ARRUS-category line is itself a reward (already free via free_item),
    // so it opens NO trigger slot → the claimed reward is not granted → 409.
    const sb = mockSb({
      productSkus: [
        skuRow("ARR-1", { model_id: BED_MODEL, product_models: { category: "bedframe" } }),
        skuRow("ARR-2", { model_id: BED_MODEL, product_models: { category: "bedframe" }, pwp_price: null }),
      ],
      rules: [
        ruleRow({
          type: "promo",
          trigger_category: "bedframe",
          trigger_targets: [{ scope: "model", modelId: BED_MODEL }],
          reward_category: "bedframe",
          reward_targets: [{ scope: "model", modelId: BED_MODEL }],
        }),
      ],
    });
    const lines = [
      line({ sku: "ARR-1", qty: 1, unitPrice: 0, attrs: { free_item: { campaignId: "c1", name: "GWP" } } }),
      line({ sku: "ARR-2", qty: 1, attrs: { pwp: { ruleId: "rule-1" } } }),
    ];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.code).toBe("pwp_not_eligible");
  });

  it("wrong-rule ride — a claim on a no-trigger promo rule that another rule granted → bad_request", async () => {
    // Two overlapping active rules sharing the BEDFRAME reward category:
    //  Q (pwp)   trigger MATTRESS m-q (PRESENT) → reward BEDFRAME BED_MODEL.
    //  P (promo) trigger MATTRESS m-p (ABSENT)  → reward BEDFRAME [] (whole cat).
    // Cart = mattress m-q + bedframe BED_MODEL, the bedframe FORGING attrs.pwp.ruleId='rule-P'.
    // resolvePwp genuinely grants the bedframe under Q (Q's trigger is present); P
    // grants nothing (m-p absent). The OLD scope-only cross-check passed P (empty
    // reward targets ⇒ covers the line) and forced the promo price 0 — a free
    // bedframe via a rule whose trigger was never bought. The ruleIndex gate must
    // reject: the granting rule (Q) ≠ the claimed rule (P).
    const M_Q = "00000000-0000-0000-0000-00000000mq00";
    const sb = mockSb({
      productSkus: [
        skuRow("MATT-Q", { model_id: M_Q, product_models: { category: "mattress" } }),
        skuRow("BED-1", { model_id: BED_MODEL, product_models: { category: "bedframe" }, pwp_price: 300 }),
      ],
      rules: [
        ruleRow({
          id: "rule-Q",
          type: "pwp",
          trigger_category: "mattress",
          trigger_targets: [{ scope: "model", modelId: M_Q }],
          reward_category: "bedframe",
          reward_targets: [{ scope: "model", modelId: BED_MODEL }],
        }),
        ruleRow({
          id: "rule-P",
          type: "promo",
          trigger_category: "mattress",
          trigger_targets: [{ scope: "model", modelId: OTHER_MODEL }], // absent from cart
          reward_category: "bedframe",
          reward_targets: [], // whole bedframe category
        }),
      ],
    });
    const lines = [
      line({ sku: "MATT-Q", qty: 1, unitPrice: 1500 }),
      line({ sku: "BED-1", qty: 1, unitPrice: 900, attrs: { pwp: { ruleId: "rule-P" } } }),
    ];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("bad_request");
    if (r.status !== "bad_request") return;
    expect(r.code).toBe("pwp_not_eligible");
  });

  it("the SAME cart claiming the CORRECT (granting) rule → ok, forced to that rule's price", async () => {
    // Sanity counterpart to the ride test: claiming rule-Q (which actually granted
    // the line) succeeds and forces the pwp_price, proving the gate is not
    // over-rejecting legitimate claims when multiple rules are active.
    const M_Q = "00000000-0000-0000-0000-00000000mq00";
    const sb = mockSb({
      productSkus: [
        skuRow("MATT-Q", { model_id: M_Q, product_models: { category: "mattress" } }),
        skuRow("BED-1", { model_id: BED_MODEL, product_models: { category: "bedframe" }, pwp_price: 300 }),
      ],
      rules: [
        ruleRow({
          id: "rule-Q",
          type: "pwp",
          trigger_category: "mattress",
          trigger_targets: [{ scope: "model", modelId: M_Q }],
          reward_category: "bedframe",
          reward_targets: [{ scope: "model", modelId: BED_MODEL }],
        }),
        ruleRow({
          id: "rule-P",
          type: "promo",
          trigger_category: "mattress",
          trigger_targets: [{ scope: "model", modelId: OTHER_MODEL }],
          reward_category: "bedframe",
          reward_targets: [],
        }),
      ],
    });
    const lines = [
      line({ sku: "MATT-Q", qty: 1, unitPrice: 1500 }),
      line({ sku: "BED-1", qty: 1, unitPrice: 900, attrs: { pwp: { ruleId: "rule-Q" } } }),
    ];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lines[1]!.unitPrice).toBe(300);
    expect((r.lines[1]!.attrs as { pwp: { ruleId: string } }).pwp.ruleId).toBe("rule-Q");
  });

  it("fails CLOSED on a pwp_rules read error → server_error", async () => {
    const sb = mockSb({ rulesError: { message: "pwp_rules down" } });
    const lines = [line({ attrs: { pwp: { ruleId: "rule-1" } } })];
    const r = await recomputePwpLines(sb, lines);
    expect(r.status).toBe("server_error");
  });
});
