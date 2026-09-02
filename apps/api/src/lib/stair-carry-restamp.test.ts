import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  restampAfterLineWrite,
  restampStairCarry,
  touchesStairInputs,
} from "./stair-carry-restamp";

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
 *   · a fee that has NOT moved is not re-written at all
 *
 * ⭐ THE FIXTURES CARRY `order_addons` NOW (YH, 2026-09-02). They did not, so
 * every stub read as "no stair row on the order, fee 0". That was invisible
 * while every call wrote unconditionally; once a re-stamp skips an unchanged
 * fee, a fixture with no row cannot express the REMOVAL case — 0 to 0 is
 * correctly nothing to do, and 150 to 0 must still delete the row. A fixture
 * that cannot tell those apart is not testing the thing.
 */

function sb(opts: {
  /** Include `order_addons` to say what fee is on the order NOW. Omit it and
   *  the order reads as carrying no stair row, i.e. a stored fee of 0. */
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
          /* The order IS carrying a fee — otherwise "removes the row" has
             nothing to remove and the skip is the correct answer. */
          order_addons: [{ addon_key: "STAIR_CARRY", qty: 1, unit_price: 150 }],
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

/**
 * ⭐ THE GOODS ARE THE FOURTH INPUT (YH, 2026-09-01 — the one 🔴 on the open
 * list, and live money in shipped code).
 *
 * The fee is `count × floors × rate` and `count` is CLAMPED to the number of
 * items on the order, so the goods price it as surely as the floor does. But
 * they never arrive through a header patch, and only the three header fields
 * re-stamped — so removing an item from a clamped order left the stored charge
 * priced for the old count while every screen recomputed the new one.
 *
 * These pin the ARITHMETIC moving with the goods, and the promise that a line
 * write is never failed by a fee.
 */
describe("the stair fee follows the GOODS, not only the floor", () => {
  /* THE CLAMPED ORDER, which is the whole case. The customer asked for 3
     items carried up, so `delivery_stair_items` is 3 — and `stairCarryCount`
     clamps that to however many items the order actually holds. An unset count
     means NONE (YH, 2026-08-27), so a null here would price zero and prove
     nothing. */
  const at3rdNoLift = (items: number) => ({
    delivery_floor: 3,
    delivery_has_lift: false,
    delivery_stair_items: 3,
    order_lines: Array.from({ length: items }, () => ({ qty: 1 })),
  });

  it("re-prices when an item leaves a clamped order", async () => {
    /* 3 items, 3rd floor, free to 2F, RM 50 per floor per item.
       One floor above free × 3 items × RM 50 = RM 150. */
    const three: Array<{ name: string; args: unknown }> = [];
    await restampAfterLineWrite(sb({ order: at3rdNoLift(3), calls: three }), ORDER);
    expect((three[0].args as { p_fee: number }).p_fee).toBe(150);

    /* Take one item off. The stored fee MUST fall to RM 100 — before this it
       stayed at 150 while the screen said 100. */
    const two: Array<{ name: string; args: unknown }> = [];
    await restampAfterLineWrite(sb({ order: at3rdNoLift(2), calls: two }), ORDER);
    expect(two[0].name).toBe("order_stamp_stair_carry");
    expect((two[0].args as { p_fee: number }).p_fee).toBe(100);
  });

  it("stamps zero when the last chargeable item leaves — removing the row", async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    /* The order was carrying RM 150; every item has now gone, so the fee falls
       to 0 and the row must be DELETED. 0 is a real value here. */
    const order = {
      ...at3rdNoLift(0),
      order_addons: [{ addon_key: "STAIR_CARRY", qty: 1, unit_price: 150 }],
    };
    await restampAfterLineWrite(sb({ order, calls }), ORDER);
    expect((calls[0].args as { p_fee: number }).p_fee).toBe(0);
  });

  /* ⭐ AND THE COMMON CASE WRITES NOTHING AT ALL. `order_stamp_stair_carry`
     deletes and re-inserts, so an unchanged fee was a real write every time —
     on every office save, because the form sends all three keys whether they
     moved or not, and on every line write, because the count is clamped and a
     sixth item does not change a fee priced for two. */
  it("writes nothing when the fee has not moved", async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const order = {
      ...at3rdNoLift(3),
      /* 1 floor above the free 2F x 3 items x RM 50 = RM 150, which is exactly
         what the order already carries. */
      order_addons: [{ addon_key: "STAIR_CARRY", qty: 1, unit_price: 150 }],
    };
    const r = await restampAfterLineWrite(sb({ order, calls }), ORDER);
    expect(r).toBeUndefined();
    expect(calls, "no stamp call at all").toHaveLength(0);
  });

  it("still writes when the fee genuinely moves", async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const order = {
      ...at3rdNoLift(2),
      order_addons: [{ addon_key: "STAIR_CARRY", qty: 1, unit_price: 150 }],
    };
    await restampAfterLineWrite(sb({ order, calls }), ORDER);
    expect((calls[0].args as { p_fee: number }).p_fee).toBe(100);
  });

  it("never throws over a committed line write, even when the stamp refuses", async () => {
    /* The lines are already written and the change request already decided.
       Throwing here would report a lost edit that was not lost. */
    await expect(
      restampAfterLineWrite(sb({ order: at3rdNoLift(2), rpcError: { message: "nope" } }), ORDER),
    ).resolves.toBeUndefined();
  });

  it("never throws when the order cannot be read at all", async () => {
    await expect(
      restampAfterLineWrite(sb({ order: null }), ORDER),
    ).resolves.toBeUndefined();
  });
});

/**
 * EVERY DOOR THAT WRITES LINES RE-STAMPS, and a fifth one has to as well.
 *
 * This is a SOURCE SCAN because the alternative is four route integration
 * tests that each prove the same one line is present. It pins the pairing that
 * matters: a call to `add_order_lines` or `replace_order_lines` is followed by
 * a re-stamp before the route answers. A new line door added without one fails
 * here, which is the only way this defect does not come back.
 */
describe("no line-writing door ships without a re-stamp", () => {
  const routes = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../routes/orders.ts"),
    "utf8",
  );

  it("pairs every add/replace RPC with a re-stamp", () => {
    const writers = routes.match(/sb\.rpc\("(add_order_lines|replace_order_lines)"/g) ?? [];
    const restamps = routes.match(/await restampAfterLineWrite\(sb, id\);/g) ?? [];
    expect(writers.length, "the four known line doors").toBe(4);
    expect(restamps.length, "one re-stamp per line door").toBe(writers.length);
  });

  it("does not re-stamp after doors that write no lines", () => {
    /* `reject_order_change_request` and `edit_order_addon` sit in the same
       decide handler and move no line count — a re-stamp there would be a
       round-trip for nothing, and `edit_order_addon` is refused on the four
       server-computed keys anyway. */
    for (const rpc of ["reject_order_change_request", "edit_order_addon"]) {
      const at = routes.indexOf(`sb.rpc("${rpc}"`);
      expect(at, `${rpc} is still called`).toBeGreaterThan(-1);
      const after = routes.slice(at, routes.indexOf("fetchAndShapeOrder", at));
      expect(after, `${rpc} must not re-stamp`).not.toContain("restampAfterLineWrite");
    }
  });
});
