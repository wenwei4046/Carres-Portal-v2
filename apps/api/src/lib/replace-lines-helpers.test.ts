/**
 * 0256 — line-EDIT promo-parity helpers: the gift-row matcher (wizard
 * semantics: gifts leave with their line) + the promo-entitlement guard
 * (an edit may never leave rewards/vouchers un-backed).
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkPromoEntitlementAfterEdit,
  matchEarnedGiftRows,
  type PersistedLineRow,
} from "./replace-lines-helpers";

/* ── matchEarnedGiftRows ─────────────────────────────────────────────────── */

function giftRow(id: string, over: Partial<PersistedLineRow> = {}): PersistedLineRow {
  return {
    id,
    sku: "PILLOW-1",
    qty: 2,
    unitPrice: 0,
    attrs: { free_gift: { giftSku: "PILLOW-1", sourceModelId: "m-cloud" } },
    ...over,
  };
}

const desiredGift = (over: Partial<{ sku: string; qty: number }> = {}) => ({
  sku: over.sku ?? "PILLOW-1",
  qty: over.qty ?? 2,
  attrs: { free_gift: { giftSku: over.sku ?? "PILLOW-1", sourceModelId: "m-cloud" } },
});

describe("matchEarnedGiftRows", () => {
  it("matches ONE persisted RM0 row per desired emission (giftSku + sourceModelId + qty)", () => {
    const rows = [giftRow("g1"), giftRow("g2")];
    expect(matchEarnedGiftRows([desiredGift()], rows, new Set())).toEqual(["g1"]);
    // Two identical emissions consume two distinct rows.
    expect(matchEarnedGiftRows([desiredGift(), desiredGift()], rows, new Set())).toEqual([
      "g1",
      "g2",
    ]);
  });

  it("never matches excluded rows, priced rows, or drifted config (qty/marker mismatch)", () => {
    const rows = [
      giftRow("g-excluded"),
      giftRow("g-priced", { unitPrice: 99 }),
      giftRow("g-qty", { qty: 1 }),
      giftRow("g-other-model", {
        attrs: { free_gift: { giftSku: "PILLOW-1", sourceModelId: "m-other" } },
      }),
    ];
    expect(matchEarnedGiftRows([desiredGift()], rows, new Set(["g-excluded"]))).toEqual([]);
  });

  it("a paid row without the marker is never treated as a gift", () => {
    const rows: PersistedLineRow[] = [
      { id: "p1", sku: "PILLOW-1", qty: 2, unitPrice: 0, attrs: null },
    ];
    expect(matchEarnedGiftRows([desiredGift()], rows, new Set())).toEqual([]);
  });
});

/* ── checkPromoEntitlementAfterEdit ──────────────────────────────────────── */

/** Thenable table stub: every chain method returns itself; awaiting resolves
 *  to { data: rowsByTable[table], error: null }. */
function sbStub(rowsByTable: Record<string, unknown[]>): SupabaseClient {
  const mk = (table: string) => {
    const result = { data: rowsByTable[table] ?? [], error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    for (const m of ["select", "eq", "in", "order"]) chain[m] = () => chain;
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    return chain;
  };
  return { from: (t: string) => mk(t) } as unknown as SupabaseClient;
}

const MATTRESS_RULE = {
  id: "rule-1",
  trigger_category: "mattress",
  trigger_targets: [],
  reward_category: "bedframe",
  reward_targets: [],
  qty_per_trigger: 1,
  type: "pwp",
  active: true,
  carry_forward: true,
};

const skuRows = [
  {
    sku: "MAT-Q",
    model_id: "m-cloud",
    variant: "Queen",
    product_models: { category: "mattress" },
  },
  {
    sku: "BED-R",
    model_id: "m-bed",
    variant: "Queen",
    product_models: { category: "bedframe" },
  },
];

const rewardLine = {
  sku: "BED-R",
  qty: 1,
  attrs: { pwp: { ruleId: "rule-1", type: "pwp", triggerRef: "MAT-Q" } },
};

describe("checkPromoEntitlementAfterEdit", () => {
  it("ok when the order has no rewards and no sourced vouchers (dormant)", async () => {
    const sb = sbStub({ pwp_codes: [], pwp_rules: [] });
    const r = await checkPromoEntitlementAfterEdit(sb, "o-1", [
      { sku: "MAT-Q", qty: 1, attrs: null },
    ]);
    expect(r).toEqual({ status: "ok" });
  });

  it("ok while the post-edit cart still backs the reward (2 triggers, 1 reward)", async () => {
    const sb = sbStub({
      pwp_codes: [],
      pwp_rules: [MATTRESS_RULE],
      product_skus: skuRows,
    });
    const r = await checkPromoEntitlementAfterEdit(sb, "o-1", [
      { sku: "MAT-Q", qty: 2, attrs: null },
      rewardLine,
    ]);
    expect(r.status).toBe("ok");
  });

  it("BLOCKS when the edit removes the trigger units backing a reward line", async () => {
    const sb = sbStub({
      pwp_codes: [],
      pwp_rules: [MATTRESS_RULE],
      product_skus: skuRows,
    });
    // Post-edit cart: the mattress trigger is gone, the reward line remains.
    const r = await checkPromoEntitlementAfterEdit(sb, "o-1", [rewardLine]);
    expect(r.status).toBe("blocked");
  });

  it("BLOCKS when this order's AVAILABLE vouchers outnumber the post-edit entitlement", async () => {
    const sb = sbStub({
      pwp_codes: [{ rule_id: "rule-1" }, { rule_id: "rule-1" }],
      pwp_rules: [MATTRESS_RULE],
      product_skus: skuRows,
    });
    // qty 1 trigger × qty_per_trigger 1 = 1 entitled < 2 vouchers.
    const r = await checkPromoEntitlementAfterEdit(sb, "o-1", [
      { sku: "MAT-Q", qty: 1, attrs: null },
    ]);
    expect(r.status).toBe("blocked");
    // qty 2 backs both vouchers again.
    const ok = await checkPromoEntitlementAfterEdit(sb, "o-1", [
      { sku: "MAT-Q", qty: 2, attrs: null },
    ]);
    expect(ok.status).toBe("ok");
  });

  it("a DEACTIVATED rule's artifacts never block (settled history / dead vouchers)", async () => {
    const sb = sbStub({
      pwp_codes: [{ rule_id: "rule-1" }],
      pwp_rules: [], // rule no longer active
      product_skus: skuRows,
    });
    const r = await checkPromoEntitlementAfterEdit(sb, "o-1", [
      { sku: "BED-R", qty: 1, attrs: null },
    ]);
    expect(r.status).toBe("ok");
  });

  it("a reward line never opens a PROMO entitlement (one-way parity)", async () => {
    const promoRule = { ...MATTRESS_RULE, id: "rule-p", type: "promo" };
    const sb = sbStub({
      pwp_codes: [{ rule_id: "rule-p" }],
      pwp_rules: [promoRule],
      product_skus: [
        ...skuRows,
        {
          sku: "MAT-FREE",
          model_id: "m-cloud",
          variant: "Queen",
          product_models: { category: "mattress" },
        },
      ],
    });
    // The only mattress "trigger" in the post-edit cart is itself a promo
    // reward → entitled 0 < 1 voucher → blocked.
    const r = await checkPromoEntitlementAfterEdit(sb, "o-1", [
      { sku: "MAT-FREE", qty: 1, attrs: { pwp: { ruleId: "rule-p", type: "promo" } } },
    ]);
    expect(r.status).toBe("blocked");
  });
});
