/**
 * THE ONE ORDERED READ OF THE ACTIVE PWP RULE SET (2026-08-24).
 *
 * `resolvePwp` is GREEDY — it walks rules in the order it is handed them and
 * binds each reward line to the FIRST rule with spare allowance. So the order of
 * this read is not presentation: with two overlapping rules it decides which one
 * pays for a line, and therefore what the customer is charged.
 *
 * Four callers fed that resolver — `pwp-recompute` (the price at Confirm),
 * `pwp-codes` (which vouchers mint), `pwp-carry-forward` (which survive as saved
 * vouchers) and `replace-lines-helpers` (the amendment path) — and every one of
 * them issued a bare `.select("*").eq("active", true)`. PostgREST guarantees no
 * order for that, so the four could bind the same cart differently, and the same
 * cart could resolve differently twice in a row. Law D, broken four ways.
 *
 * ⭐ WHAT THESE TESTS PIN IS THE REQUEST, NOT THE ROWS. A unit test cannot prove
 * Postgres sorted anything; what it CAN prove is that this function always asks
 * for a total order and never regresses to a bare select. The `id` tie-break is
 * the half most likely to be "simplified" away — two rules created in the same
 * transaction share a `created_at`, and `created_at` alone is not a total order.
 *
 * ⚠️ This makes the answer STABLE, not AUTHORED. Which rule *should* win when two
 * overlap is an owner's ruling, and 0186 has no priority column to hold one.
 * Until it does, first-created wins — knowably, every time.
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readActivePwpRules } from "./rule-line-input";

type OrderCall = { column: string; ascending: boolean | undefined };

/** Records the chain the function builds, then resolves `rows` (or `error`). */
function recordingSb(opts: { rows?: unknown[]; error?: { message: string } }) {
  const tables: string[] = [];
  const eqs: Array<[string, unknown]> = [];
  const orders: OrderCall[] = [];

  const chain: Record<string, unknown> = {
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      return chain;
    },
    order(column: string, o?: { ascending?: boolean }) {
      orders.push({ column, ascending: o?.ascending });
      return chain;
    },
    then: (resolve: (v: unknown) => unknown) =>
      resolve(
        opts.error
          ? { data: null, error: opts.error }
          : { data: opts.rows ?? [], error: null },
      ),
  };

  const sb = {
    from(table: string) {
      tables.push(table);
      return { select: () => chain };
    },
  } as unknown as SupabaseClient;

  return { sb, tables, eqs, orders };
}

const ruleRow = (over: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-00000000aaaa",
  type: "pwp",
  trigger_category: "mattress",
  trigger_targets: [],
  reward_category: "bedframe",
  reward_targets: [],
  qty_per_trigger: 1,
  active: true,
  carry_forward: true,
  carry_forward_days: null,
  ...over,
});

describe("readActivePwpRules", () => {
  it("reads pwp_rules, filtered to active", () => {
    const { sb, tables, eqs } = recordingSb({ rows: [] });
    return readActivePwpRules(sb).then(() => {
      expect(tables).toEqual(["pwp_rules"]);
      expect(eqs).toEqual([["active", true]]);
    });
  });

  it("⭐ asks for a TOTAL order — created_at, then id as the tie-break", async () => {
    // The tie-break is the half most likely to be dropped as redundant. It is
    // not: two rules created in one transaction share a created_at, and the
    // resolver is greedy, so a tie is a coin flip over the customer's price.
    const { sb, orders } = recordingSb({ rows: [] });
    await readActivePwpRules(sb);
    expect(orders).toEqual([
      { column: "created_at", ascending: true },
      { column: "id", ascending: true },
    ]);
  });

  it("orders ASCENDING — first created wins, which is what the greedy resolver means by first", async () => {
    const { sb, orders } = recordingSb({ rows: [] });
    await readActivePwpRules(sb);
    expect(orders.every((o) => o.ascending === true)).toBe(true);
  });

  it("adapts the rows (parseRuleTargets ran) rather than returning raw DB shape", async () => {
    const { sb } = recordingSb({
      rows: [ruleRow({ id: "00000000-0000-4000-8000-00000000bbbb", qty_per_trigger: 3 })],
    });
    const out = await readActivePwpRules(sb);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.rules).toHaveLength(1);
      // camelCase = the adapter ran; a raw row would carry qty_per_trigger.
      expect(out.rules[0]!.qtyPerTrigger).toBe(3);
      expect(out.rules[0]!.triggerCategory).toBe("mattress");
      expect(Array.isArray(out.rules[0]!.triggerTargets)).toBe(true);
    }
  });

  it("preserves the order the database returned — it never re-sorts in memory", async () => {
    // The sort belongs to Postgres. Re-sorting here would be a SECOND arithmetic
    // for the same fact, which is the defect this function exists to remove.
    const a = "00000000-0000-4000-8000-0000000000a1";
    const b = "00000000-0000-4000-8000-0000000000b2";
    const { sb } = recordingSb({ rows: [ruleRow({ id: b }), ruleRow({ id: a })] });
    const out = await readActivePwpRules(sb);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.rules.map((r) => r.id)).toEqual([b, a]);
  });

  it("FAILS CLOSED on a read error — never a silent empty rule set", async () => {
    // An empty rule set is indistinguishable from "no promotions configured", so
    // swallowing the error would silently charge every reward at full price.
    const { sb } = recordingSb({ error: { message: "boom" } });
    const out = await readActivePwpRules(sb);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toBe("boom");
  });

  it("DORMANT: no active rules → ok with an empty list, no throw", async () => {
    const { sb } = recordingSb({ rows: [] });
    const out = await readActivePwpRules(sb);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.rules).toEqual([]);
  });
});
