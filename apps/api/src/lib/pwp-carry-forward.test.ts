import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sweepReservedForSubmit, type SweepArgs } from "./pwp-carry-forward";
import type { RecomputableLine } from "./sofa-recompute";

/**
 * P8d (0188 §3 / §8.3) — the carry-forward sweep unit tests. Mocks the four reads
 * the sweep makes (RESERVED pwp_codes, active pwp_rules, product_skus resolve, +
 * the carry UPDATE / delete with a `.select("code")` tail) and asserts the
 * carry-vs-delete decision + the server-derived trigger scope.
 */

const STAFF = "00000000-0000-0000-0000-0000000staff1";
const DEALER = "00000000-0000-0000-0000-00000000deal1";
const ORDER = "00000000-0000-0000-0000-0000000order1";
const MATT_MODEL = "00000000-0000-0000-0000-0000000matt01";
const RULE = "00000000-0000-0000-0000-00000000rule01";

type ReservedRow = { code: string; rule_id: string | null; cart_line_key: string | null; trigger_item_code: string | null; created_at?: string };
type RuleRow = Record<string, unknown>;

function activeRule(over: Partial<RuleRow> = {}): RuleRow {
  return {
    id: RULE,
    type: "pwp",
    trigger_category: "mattress",
    trigger_targets: [{ scope: "model", modelId: MATT_MODEL }],
    reward_category: "bedframe",
    reward_targets: [{ scope: "model", modelId: "00000000-0000-0000-0000-00000000bed01" }],
    qty_per_trigger: 1,
    active: true,
    carry_forward: true,
    carry_forward_days: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
    ...over,
  };
}

interface MockOpts {
  reserved: ReservedRow[];
  rules: RuleRow[];
  /** product_skus rows resolved by resolveSkuInfo (sku → model/category). */
  skus?: Array<{ sku: string; model_id: string | null; variant: string | null; product_models: { category: string } }>;
  /** Force a specific read error. */
  reservedError?: string;
  rulesError?: string;
}

/** Records every UPDATE / DELETE so a test can assert carry vs delete codes. */
function mockSb(opts: MockOpts): {
  sb: SupabaseClient;
  ops: Array<{ kind: "update" | "delete"; codes: string[]; patch?: Record<string, unknown> }>;
} {
  const ops: Array<{ kind: "update" | "delete"; codes: string[]; patch?: Record<string, unknown> }> = [];
  const skus = opts.skus ?? [];

  function from(table: string) {
    if (table === "pwp_codes") {
      // The RESERVED read: .select().eq().eq() → resolve the reserved rows.
      // The carry UPDATE: .update(patch).eq().eq().in(codes).select("code").
      // The delete:       .delete().eq().eq().in(codes).select("code").
      return {
        select: () => {
          const chain: Record<string, unknown> = {
            eq: () => chain,
            then: (resolve: (v: unknown) => unknown) =>
              resolve(opts.reservedError ? { data: null, error: { message: opts.reservedError } } : { data: opts.reserved, error: null }),
          };
          return chain;
        },
        update: (patch: Record<string, unknown>) => {
          let captured: string[] = [];
          const chain: Record<string, unknown> = {
            eq: () => chain,
            in: (_col: string, codes: string[]) => {
              captured = codes;
              return chain;
            },
            select: () => {
              ops.push({ kind: "update", codes: captured, patch });
              return Promise.resolve({ data: captured.map((code) => ({ code })), error: null });
            },
          };
          return chain;
        },
        delete: () => {
          let captured: string[] = [];
          const chain: Record<string, unknown> = {
            eq: () => chain,
            in: (_col: string, codes: string[]) => {
              captured = codes;
              return chain;
            },
            select: () => {
              ops.push({ kind: "delete", codes: captured });
              return Promise.resolve({ data: captured.map((code) => ({ code })), error: null });
            },
          };
          return chain;
        },
      };
    }
    if (table === "pwp_rules") {
      return {
        // 2026-08-24: the read is `.eq().order().order()` through the one
        // ordered door (readActivePwpRules), so this double must be
        // CHAINABLE rather than a fixed two-deep shape.
        select: () => {
          const chain: Record<string, unknown> = {
            eq: () => chain,
            order: () => chain,
            then: (resolve: (v: unknown) => unknown) =>
              resolve(opts.rulesError ? { data: null, error: { message: opts.rulesError } } : { data: opts.rules, error: null }),
          };
          return chain;
        },
      };
    }
    if (table === "product_skus") {
      return {
        select: () => ({
          in: async () => ({ data: skus, error: null }),
        }),
      };
    }
    return { select: () => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }) }) };
  }

  return { sb: { from } as unknown as SupabaseClient, ops };
}

const mattLine = (): RecomputableLine => ({ sku: "MATT-1", qty: 1, attrs: null, unitPrice: 1500 });
const skuRows = () => [
  { sku: "MATT-1", model_id: MATT_MODEL, variant: "QUEEN", product_models: { category: "mattress" } },
];

function args(over: Partial<SweepArgs> = {}): SweepArgs {
  return {
    ownerStaffId: STAFF,
    ownerDealerId: DEALER,
    orderId: ORDER,
    customerPhone: "0123456789",
    customerName: "Ali Tan",
    finalLines: [mattLine()],
    clientCartLineKeys: [],
    ...over,
  };
}

describe("sweepReservedForSubmit", () => {
  it("DORMANT — 0 RESERVED rows → early ok, no rules fetch, no carry/delete", async () => {
    const { sb, ops } = mockSb({ reserved: [], rules: [activeRule()] });
    const r = await sweepReservedForSubmit(sb, args());
    expect(r.status).toBe("ok");
    expect(r.carried).toBe(0);
    expect(r.deleted).toBe(0);
    expect(ops).toHaveLength(0);
  });

  it("CARRY — an active carry_forward rule + a captured phone flips RESERVED→AVAILABLE bound to the phone", async () => {
    const reserved: ReservedRow[] = [
      { code: "PWP-CARRY001", rule_id: RULE, cart_line_key: "L-matt", trigger_item_code: "MATT-1" },
    ];
    const { sb, ops } = mockSb({ reserved, rules: [activeRule()], skus: skuRows() });
    const r = await sweepReservedForSubmit(sb, args());
    expect(r.status).toBe("ok");
    expect(r.carried).toBe(1);
    expect(r.deleted).toBe(0);
    const carry = ops.find((o) => o.kind === "update");
    expect(carry?.codes).toEqual(["PWP-CARRY001"]);
    // bound to the CANONICAL phone (phoneKeyMy 0123456789 → 123456789), dealer, source.
    expect(carry?.patch).toMatchObject({
      status: "AVAILABLE",
      source_order_id: ORDER,
      bound_customer_phone: "123456789",
      owner_dealer_id: DEALER,
      expires_at: null,
      cart_line_key: null,
    });
  });

  it("server-derived scope — carries even when clientCartLineKeys is EMPTY (resolves the trigger from finalLines)", async () => {
    const reserved: ReservedRow[] = [
      { code: "PWP-CARRY002", rule_id: RULE, cart_line_key: "L-matt", trigger_item_code: "MATT-1" },
    ];
    const { sb, ops } = mockSb({ reserved, rules: [activeRule()], skus: skuRows() });
    const r = await sweepReservedForSubmit(sb, args({ clientCartLineKeys: [] }));
    expect(r.carried).toBe(1);
    expect(ops.find((o) => o.kind === "update")?.codes).toEqual(["PWP-CARRY002"]);
  });

  it("carry_forward=false → DELETE (no carry)", async () => {
    const reserved: ReservedRow[] = [
      { code: "PWP-DELE001", rule_id: RULE, cart_line_key: "L-matt", trigger_item_code: "MATT-1" },
    ];
    const { sb, ops } = mockSb({ reserved, rules: [activeRule({ carry_forward: false })], skus: skuRows() });
    const r = await sweepReservedForSubmit(sb, args());
    expect(r.carried).toBe(0);
    expect(r.deleted).toBe(1);
    expect(ops.find((o) => o.kind === "delete")?.codes).toEqual(["PWP-DELE001"]);
    expect(ops.find((o) => o.kind === "update")).toBeUndefined();
  });

  it("rule INACTIVE (not in the active set) → DELETE", async () => {
    // The reserved row's rule_id is a rule NOT returned by the active read.
    const reserved: ReservedRow[] = [
      { code: "PWP-DELE002", rule_id: "00000000-0000-0000-0000-0000000dead01", cart_line_key: "L-matt", trigger_item_code: "MATT-1" },
    ];
    // active rules contains a DIFFERENT rule that still matches the trigger line, so
    // the code is in-scope (trigger SKU present) but its OWN minting rule is gone.
    const { sb, ops } = mockSb({ reserved, rules: [activeRule()], skus: skuRows() });
    const r = await sweepReservedForSubmit(sb, args());
    expect(r.deleted).toBe(1);
    expect(ops.find((o) => o.kind === "delete")?.codes).toEqual(["PWP-DELE002"]);
  });

  it("would-carry but NO phone captured → DELETE + a softWarning", async () => {
    const reserved: ReservedRow[] = [
      { code: "PWP-NOPH001", rule_id: RULE, cart_line_key: "L-matt", trigger_item_code: "MATT-1" },
    ];
    const { sb, ops } = mockSb({ reserved, rules: [activeRule()], skus: skuRows() });
    const r = await sweepReservedForSubmit(sb, args({ customerPhone: null }));
    expect(r.carried).toBe(0);
    expect(r.deleted).toBe(1);
    expect(r.softWarning).toMatch(/not saved/i);
    expect(ops.find((o) => o.kind === "delete")?.codes).toEqual(["PWP-NOPH001"]);
  });

  it("carry_forward_days=30 → AVAILABLE with expires_at ≈ now()+30d", async () => {
    const reserved: ReservedRow[] = [
      { code: "PWP-EXPY001", rule_id: RULE, cart_line_key: "L-matt", trigger_item_code: "MATT-1" },
    ];
    const { sb, ops } = mockSb({ reserved, rules: [activeRule({ carry_forward_days: 30 })], skus: skuRows() });
    const before = Date.now();
    const r = await sweepReservedForSubmit(sb, args());
    expect(r.carried).toBe(1);
    const carry = ops.find((o) => o.kind === "update");
    const expiresAt = new Date(String(carry?.patch?.expires_at)).getTime();
    const expected = before + 30 * 86_400_000;
    expect(Math.abs(expiresAt - expected)).toBeLessThan(60_000); // within a minute
  });

  it("OUT of scope — a RESERVED row whose trigger SKU is NOT in this order is left UNTOUCHED", async () => {
    const reserved: ReservedRow[] = [
      // trigger SOFA-9 is not a line in finalLines (only MATT-1), and not in the hint.
      { code: "PWP-OTHER001", rule_id: RULE, cart_line_key: "L-other", trigger_item_code: "SOFA-9" },
    ];
    const { sb, ops } = mockSb({ reserved, rules: [activeRule()], skus: skuRows() });
    const r = await sweepReservedForSubmit(sb, args());
    expect(r.carried).toBe(0);
    expect(r.deleted).toBe(0);
    expect(ops).toHaveLength(0);
  });

  it("fails server_error on the RESERVED read error", async () => {
    const { sb } = mockSb({ reserved: [], rules: [], reservedError: "db down" });
    const r = await sweepReservedForSubmit(sb, args());
    expect(r.status).toBe("server_error");
  });

  // ─── ENTITLEMENT CAP (2026-07-14, closes `pwp-sweep-cross-cart-contamination`) ──
  // Live repro: CO-1174 (2× trigger) printed 8 vouchers — 4 legit + 4 orphan
  // RESERVED codes minted 2026-07-06/10 by ABANDONED carts sharing the SAME
  // trigger SKU, hoovered in by the trigger-sku scope. The sweep now carries at
  // most Σ(trigger qty) × qty_per_trigger per rule — this cart's codes first,
  // then newest — and DELETES the excess.
  it("CAP — stale same-SKU orphans from dead carts are DELETED, only this cart's entitlement carries", async () => {
    const reserved: ReservedRow[] = [
      { code: "PWP-STALE001", rule_id: RULE, cart_line_key: "L-dead-1", trigger_item_code: "MATT-1", created_at: "2026-07-06T15:20:00Z" },
      { code: "PWP-STALE002", rule_id: RULE, cart_line_key: "L-dead-2", trigger_item_code: "MATT-1", created_at: "2026-07-10T17:23:00Z" },
      { code: "PWP-CART0001", rule_id: RULE, cart_line_key: "L-matt", trigger_item_code: "MATT-1", created_at: "2026-07-13T17:46:00Z" },
    ];
    const { sb, ops } = mockSb({ reserved, rules: [activeRule()], skus: skuRows() });
    // 1 trigger unit × qty_per_trigger 1 → entitled 1.
    const r = await sweepReservedForSubmit(sb, args({ clientCartLineKeys: ["L-matt"] }));
    expect(r.status).toBe("ok");
    expect(r.carried).toBe(1);
    expect(r.deleted).toBe(2);
    expect(ops.find((o) => o.kind === "update")?.codes).toEqual(["PWP-CART0001"]);
    expect(ops.find((o) => o.kind === "delete")?.codes.sort()).toEqual([
      "PWP-STALE001",
      "PWP-STALE002",
    ]);
  });

  it("CAP — entitlement scales with trigger line qty (2× mattress → 2 codes carry, excess deleted)", async () => {
    const reserved: ReservedRow[] = [
      { code: "PWP-STALE003", rule_id: RULE, cart_line_key: "L-dead-3", trigger_item_code: "MATT-1", created_at: "2026-07-06T15:20:00Z" },
      { code: "PWP-CART0002", rule_id: RULE, cart_line_key: "L-matt", trigger_item_code: "MATT-1", created_at: "2026-07-13T17:46:00Z" },
      { code: "PWP-CART0003", rule_id: RULE, cart_line_key: "L-matt", trigger_item_code: "MATT-1", created_at: "2026-07-13T17:46:01Z" },
    ];
    const { sb, ops } = mockSb({ reserved, rules: [activeRule()], skus: skuRows() });
    const r = await sweepReservedForSubmit(
      sb,
      args({ finalLines: [{ ...mattLine(), qty: 2 }], clientCartLineKeys: ["L-matt"] }),
    );
    expect(r.carried).toBe(2);
    expect(r.deleted).toBe(1);
    expect(ops.find((o) => o.kind === "update")?.codes.sort()).toEqual([
      "PWP-CART0002",
      "PWP-CART0003",
    ]);
    expect(ops.find((o) => o.kind === "delete")?.codes).toEqual(["PWP-STALE003"]);
  });

  it("CAP — qty_per_trigger multiplies the entitlement (1 trigger × 2/trigger → 2 carry)", async () => {
    const reserved: ReservedRow[] = [
      { code: "PWP-OLD00001", rule_id: RULE, cart_line_key: "L-dead-4", trigger_item_code: "MATT-1", created_at: "2026-07-06T15:20:00Z" },
      { code: "PWP-NEW00001", rule_id: RULE, cart_line_key: "L-matt", trigger_item_code: "MATT-1", created_at: "2026-07-13T17:46:00Z" },
      { code: "PWP-NEW00002", rule_id: RULE, cart_line_key: "L-matt", trigger_item_code: "MATT-1", created_at: "2026-07-13T17:46:01Z" },
    ];
    const { sb, ops } = mockSb({
      reserved,
      rules: [activeRule({ qty_per_trigger: 2 })],
      skus: skuRows(),
    });
    const r = await sweepReservedForSubmit(sb, args({ clientCartLineKeys: ["L-matt"] }));
    expect(r.carried).toBe(2);
    expect(r.deleted).toBe(1);
    expect(ops.find((o) => o.kind === "delete")?.codes).toEqual(["PWP-OLD00001"]);
  });

  it("CAP — no in-cart hint: newest codes win the entitled slots (recency fallback)", async () => {
    const reserved: ReservedRow[] = [
      { code: "PWP-OLDER001", rule_id: RULE, cart_line_key: null, trigger_item_code: "MATT-1", created_at: "2026-07-06T15:20:00Z" },
      { code: "PWP-NEWER001", rule_id: RULE, cart_line_key: null, trigger_item_code: "MATT-1", created_at: "2026-07-13T17:46:00Z" },
    ];
    const { sb, ops } = mockSb({ reserved, rules: [activeRule()], skus: skuRows() });
    const r = await sweepReservedForSubmit(sb, args({ clientCartLineKeys: [] }));
    expect(r.carried).toBe(1);
    expect(r.deleted).toBe(1);
    expect(ops.find((o) => o.kind === "update")?.codes).toEqual(["PWP-NEWER001"]);
    expect(ops.find((o) => o.kind === "delete")?.codes).toEqual(["PWP-OLDER001"]);
  });
});
