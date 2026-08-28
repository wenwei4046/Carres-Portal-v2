import { describe, it, expect } from "vitest";
import { recomputeStairCarry } from "./stair-carry-recompute";

/**
 * STAIR CARRY IS MONEY THE ORDER CAN HOLD (owner ruling YH, 2026-08-28).
 *
 * The fee was computed in the browser and written down nowhere, so the customer
 * signed a total the database could not describe and no payment door could
 * collect the difference. These pin what the SERVER now stamps.
 *
 * The invariant is the Card's acceptance, not the shape of the row:
 *   · a chargeable order gets ONE row whose value equals the signed fee
 *   · a non-chargeable order gets NO row, because RM 0 is noise
 *   · a config read that fails REFUSES, never silently prices at zero
 */

/** The rate row, plus the `addons` key lookup the FK guard makes. `keySeeded`
 *  false models a database where migration 0393 has not been applied yet — the
 *  state production was actually in on 2026-08-29. */
function sb(
  row: { free_up_to_floor: number; per_floor_per_item: number } | null,
  error: { message: string } | null = null,
  keySeeded = true,
) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "addons"
              ? { data: keySeeded ? { key: "STAIR_CARRY" } : null, error: null }
              : { data: row, error },
        }),
      }),
    }),
  } as unknown as Parameters<typeof recomputeStairCarry>[0];
}

const SEEDED = { free_up_to_floor: 2, per_floor_per_item: 50 };
const FIVE_ITEMS = [{ qty: 2 }, { qty: 2 }, { qty: 1 }];

describe("recomputeStairCarry — the fee the customer signed for, stamped", () => {
  it("stamps ONE row equal to the worked example in the Card", async () => {
    /* 5 items on the order, floor 3, no lift, 3 needing carry.
       (3 − 2) flights × RM50 × 3 items = RM150 — the exact figure the Card
       says was uncollectible by every door. */
    const r = await recomputeStairCarry(sb(SEEDED), FIVE_ITEMS, {
      floor: 3,
      hasLift: false,
      stairItems: 3,
    });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.fee).toBe(150);
    expect(r.addons).toEqual([
      { addonKey: "STAIR_CARRY", qty: 1, unitPrice: 150, attrs: null },
    ]);
  });

  it("writes NOTHING when there is a lift", async () => {
    const r = await recomputeStairCarry(sb(SEEDED), FIVE_ITEMS, {
      floor: 12,
      hasLift: true,
      stairItems: 5,
    });
    expect(r.status === "ok" && r.addons).toEqual([]);
  });

  it("writes NOTHING at or below the free floor", async () => {
    for (const floor of [1, 2]) {
      const r = await recomputeStairCarry(sb(SEEDED), FIVE_ITEMS, {
        floor,
        hasLift: false,
        stairItems: 5,
      });
      expect(r.status === "ok" && r.addons).toEqual([]);
    }
  });

  it("writes NOTHING when the count was never set — UNSET MEANS NONE stands", async () => {
    /* The 2026-08-27 ruling is untouched by this Card: an order nobody was
       asked about is charged nothing, and nothing is therefore stamped. */
    const r = await recomputeStairCarry(sb(SEEDED), FIVE_ITEMS, {
      floor: 5,
      hasLift: false,
      stairItems: null,
    });
    expect(r.status === "ok" && r.fee).toBe(0);
    expect(r.status === "ok" && r.addons).toEqual([]);
  });

  it("never prices more carries than the order holds", async () => {
    /* The clamp lives in `@carres/shared` and is exercised through the server
       path here, so the two sides cannot disagree about a stamped number.
       5 items, 99 typed → 5 charged: 3 flights × RM50 × 5 = RM750. */
    const r = await recomputeStairCarry(sb(SEEDED), FIVE_ITEMS, {
      floor: 5,
      hasLift: false,
      stairItems: 99,
    });
    expect(r.status === "ok" && r.fee).toBe(750);
  });

  it("REFUSES when the rate cannot be read, rather than pricing at zero", async () => {
    /* A fee silently priced at zero because a SELECT failed is a wrong number
       written onto a contract the customer signs. Fail closed. */
    const err = await recomputeStairCarry(sb(null, { message: "boom" }), FIVE_ITEMS, {
      floor: 5,
      hasLift: false,
      stairItems: 3,
    });
    expect(err.status).toBe("server_error");

    const missing = await recomputeStairCarry(sb(null), FIVE_ITEMS, {
      floor: 5,
      hasLift: false,
      stairItems: 3,
    });
    expect(missing.status).toBe("server_error");
  });

  it("CHARGES NOTHING rather than failing the sale when the key is not seeded", async () => {
    /* Found in production 2026-08-29. `order_addons.addon_key` is FK’d to
       `addons(key)`, migrations here are applied BY HAND, and the code reached
       production before 0393 did — so every stair-carry order died on
       `order_addons_addon_key_fkey`, because the create is one transaction and
       the FK aborted all of it.

       A missing fee is the state Carres was already in and the backfill
       recovers it. A shop that cannot take an order is not recoverable. */
    const r = await recomputeStairCarry(sb(SEEDED, null, false), FIVE_ITEMS, {
      floor: 3,
      hasLift: false,
      stairItems: 3,
    });
    expect(r.status).toBe("ok");
    expect(r.status === "ok" && r.addons).toEqual([]);
  });

  it("stays dormant on a zero rate — totals byte-identical, as 0184 does", async () => {
    const r = await recomputeStairCarry(
      sb({ free_up_to_floor: 2, per_floor_per_item: 0 }),
      FIVE_ITEMS,
      { floor: 5, hasLift: false, stairItems: 3 },
    );
    expect(r.status === "ok" && r.addons).toEqual([]);
  });
});
