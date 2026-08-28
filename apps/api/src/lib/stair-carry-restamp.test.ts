import { describe, it, expect } from "vitest";
import { restampStairCarry, touchesStairInputs } from "./stair-carry-restamp";

/**
 * A STAIR FEE FOLLOWS THE FLOOR THAT CHANGED (owner ruling YH, 2026-08-29).
 *
 * 0393 stamps the fee at create; all three inputs stay editable afterwards. Move
 * a floor from 1 to 3 and the stamped fee stayed at the old number — an order
 * describing a charge its own inputs no longer produce.
 *
 * These pin the invariants, not the plumbing:
 *   · the fee is priced from the SAVED row, never from the patch
 *   · a save that cannot move the fee does not pay for the round-trip
 *   · a re-stamp that fails REPORTS, and never throws over a saved edit
 */

function sb(opts: {
  order?: Record<string, unknown> | null;
  orderError?: { message: string } | null;
  rpcError?: { message: string } | null;
  calls?: Array<{ name: string; args: unknown }>;
}) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "floor_config"
              ? { data: { free_up_to_floor: 2, per_floor_per_item: 50 }, error: null }
              : { data: opts.order ?? null, error: opts.orderError ?? null },
        }),
      }),
    }),
    rpc: async (name: string, args: unknown) => {
      opts.calls?.push({ name, args });
      return { data: null, error: opts.rpcError ?? null };
    },
  } as unknown as Parameters<typeof restampStairCarry>[0];
}

const ORDER = "00000000-0000-0000-0000-0000000000aa";

describe("touchesStairInputs — only pay for the round-trip when the fee can move", () => {
  it("is true for each of the three inputs", () => {
    expect(touchesStairInputs({ delivery_floor: 3 })).toBe(true);
    expect(touchesStairInputs({ delivery_has_lift: true })).toBe(true);
    expect(touchesStairInputs({ delivery_stair_items: 2 })).toBe(true);
  });

  it("is false for a save that cannot change the fee", () => {
    expect(touchesStairInputs({ customer_name: "Kong Chai Yin" })).toBe(false);
    expect(touchesStairInputs({})).toBe(false);
    expect(touchesStairInputs(null)).toBe(false);
  });

  it("is true even when the value is false or null — the KEY is the signal", () => {
    /* Turning the lift OFF, or clearing the count, both change the money. A
       truthiness check here would have missed exactly the edits that matter. */
    expect(touchesStairInputs({ delivery_has_lift: false })).toBe(true);
    expect(touchesStairInputs({ delivery_stair_items: null })).toBe(true);
  });
});

describe("restampStairCarry — the fee is priced from the SAVED row", () => {
  it("re-prices from the order as it now stands, not from the patch", async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    /* A save may carry only `delivery_floor`, leaving lift and count untouched —
       so the fee depends on fields the request never mentioned. 5 items, floor 3,
       no lift, 3 carried: (3 − 2) × RM50 × 3 = RM150. */
    const r = await restampStairCarry(
      sb({
        order: {
          delivery_floor: 3,
          delivery_has_lift: false,
          delivery_stair_items: 3,
          order_lines: [{ qty: 2 }, { qty: 2 }, { qty: 1 }],
        },
        calls,
      }),
      ORDER,
    );
    expect(r).toEqual({ ok: true, fee: 150 });
    expect(calls).toEqual([
      { name: "order_stamp_stair_carry", args: { p_order_id: ORDER, p_fee: 150 } },
    ]);
  });

  it("stamps ZERO when a lift is added — which REMOVES the row, not writes a 0 one", async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const r = await restampStairCarry(
      sb({
        order: {
          delivery_floor: 3,
          delivery_has_lift: true,
          delivery_stair_items: 3,
          order_lines: [{ qty: 3 }],
        },
        calls,
      }),
      ORDER,
    );
    expect(r).toEqual({ ok: true, fee: 0 });
    /* 0394 deletes on 0. The call still HAPPENS — an order that used to carry a
       fee and no longer should must lose the row, and only the stamp can do it. */
    expect(calls).toEqual([
      { name: "order_stamp_stair_carry", args: { p_order_id: ORDER, p_fee: 0 } },
    ]);
  });

  it("REPORTS rather than throws when the order cannot be read", async () => {
    const r = await restampStairCarry(sb({ orderError: { message: "boom" } }), ORDER);
    expect(r.ok).toBe(false);
  });

  it("REPORTS rather than throws when the stamp itself fails", async () => {
    /* The save already succeeded and its revision is minted. Throwing here would
       tell the operator their edit failed when it did not; a stale fee is the
       state we were already in. */
    const r = await restampStairCarry(
      sb({
        order: {
          delivery_floor: 3,
          delivery_has_lift: false,
          delivery_stair_items: 1,
          order_lines: [{ qty: 1 }],
        },
        rpcError: { message: "denied" },
      }),
      ORDER,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("denied");
  });

  it("NEVER throws — not even when the client itself does", async () => {
    /* Found by a real failure: a THROWN error (not a returned one) escaped into
       the save route and 500’d a save that had already succeeded, telling the
       operator their edit was lost when it was not. The promise "never fails the
       save" has to be enforced, not merely written down. */
    const exploding = {
      from: () => {
        throw new Error("client exploded");
      },
      rpc: async () => ({ data: null, error: null }),
    } as unknown as Parameters<typeof restampStairCarry>[0];
    const r = await restampStairCarry(exploding, ORDER);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("client exploded");
  });

  it("REPORTS when the order is gone", async () => {
    const r = await restampStairCarry(sb({ order: null }), ORDER);
    expect(r).toEqual({ ok: false, reason: "order not found" });
  });
});
