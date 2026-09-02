import type { SupabaseClient } from "@supabase/supabase-js";
import { STAIR_CARRY_ADDON_KEY, stairCarryCount, stairCarryFee } from "@carres/shared";

/**
 * STAIR CARRY, STAMPED ONTO THE ORDER (owner ruling YH, 2026-08-28).
 *
 * > "If stair carry requires money for it, it should be included — whether it's
 * >  paid on the carry day or before, it still needs to be paid."
 *
 * The fee was computed in the browser on every render and written down nowhere.
 * The customer signed a screen that itemised it twice and folded it into the
 * headline total; the order's own total was `lines + addons` only; every
 * payment door capped against that total, so Stripe returned 422 before Stripe
 * was called and cash top-up answered "already fully paid". Nothing in the
 * portal could collect the difference.
 *
 * ⭐ THIS IS 0184'S ROAD, NOT A NEW ONE. `delivery-fee-recompute` already
 * computes a fee server-side and appends `order_addons` rows whose real figure
 * rides `qty`/`unit_price` because `addons.price` is a fixed per-key price.
 * Stair carry is the fourth such key and behaves identically.
 *
 * ⭐ STAMPED, NEVER RE-DERIVED. `floor_config.per_floor_per_item` is a live
 * singleton a principal can PATCH. Because no order stored its fee, changing
 * that rate silently repriced the displayed stair carry on every historic
 * order — a charge a customer signed for moving because a rate changed
 * afterwards. Writing the row at the order fixes that as a side effect, and it
 * is the reason this must be a stored row rather than a computed column.
 *
 * ⭐ ZERO WRITES NOTHING. A lift, a floor at or below the free floor, or an
 * unset count all mean no charge — and a RM 0 addon row is noise on every
 * surface that reads the order. Dormant config therefore leaves totals
 * byte-identical, exactly as 0184's does.
 */

export interface StairCarryRecomputeContext {
  floor: number;
  hasLift: boolean;
  stairItems: number | null | undefined;
  /** ⭐ THE RATE THIS ORDER WAS PRICED AT (0414), when it has one.
   *
   *  YH, 2026-08-28, `docs/orders/MASTER.md` §405-410, APPROVED / LOCKED: *"the
   *  fee must be STAMPED at the order, not re-derived. A charge the customer
   *  signed for may not move because a rate changed afterwards."*
   *
   *  Present = re-price with the order's OWN rate, so a later change to
   *  `floor_config` cannot reach it. Absent = the order was stamped before
   *  0414, or 0414 is not applied yet; the live config is then the only rate
   *  there is, exactly as before. Both halves must be present to be used — a
   *  rate without its free band prices a different fee. */
  pinned?: { perFloorPerItem: number; freeUpToFloor: number } | null;
}

/** Mirrors `OrderAddonInput` — the shape `payload.addons[]` already carries. */
export interface StairCarryAddon {
  addonKey: string;
  qty: number;
  unitPrice: number;
  attrs: null;
}

export type StairCarryRecomputeOutcome =
  | {
      status: "ok";
      addons: StairCarryAddon[];
      fee: number;
      /** 0414 — the rate this fee was priced at, so the caller can record it on
       *  the order the first time. Absent when no rate could apply (a lift, or
       *  a count nobody set) and `floor_config` was therefore never read. */
      rate?: { perFloorPerItem: number; freeUpToFloor: number };
    }
  | { status: "server_error"; message: string };

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * @param lines the VERIFIED line set — the same `finalLines` the delivery
 *        recompute receives, so the item count the fee prices is the one the
 *        order actually stores.
 */
export async function recomputeStairCarry(
  sb: SupabaseClient,
  lines: ReadonlyArray<{ qty: number }>,
  ctx: StairCarryRecomputeContext,
): Promise<StairCarryRecomputeOutcome> {
  const itemsTotal = lines.reduce((n, l) => n + l.qty, 0);

  /* ⭐ ASK THE RATE ONLY WHEN IT COULD MATTER.

     A lift, or a count nobody set, means no charge WHATEVER the rate is — so
     reading `floor_config` there buys nothing, and failing closed on it would
     refuse an order over a number that could not have applied. Most orders
     take this branch and never touch the table.

     `stairCarryCount` is the shared clamp, so "nobody set it" means exactly
     what it means on the POS. */
  if (ctx.hasLift || stairCarryCount(itemsTotal, ctx.stairItems) === 0) {
    return { status: "ok", addons: [], fee: 0 };
  }

  /* ⭐ THE ORDER'S OWN RATE WINS, AND THE READ IS SKIPPED ENTIRELY (0414).
     A pinned order is priced at the rate it agreed to, so `floor_config` is
     not consulted at all — which is the ruling expressed as code rather than
     as a comment: there is no path here by which a rate change reaches it. */
  if (ctx.pinned) {
    const pinnedFee = round2(
      stairCarryFee(
        { floor: ctx.floor, hasLift: ctx.hasLift, stairItems: ctx.stairItems, itemsTotal },
        ctx.pinned as Parameters<typeof stairCarryFee>[1],
      ),
    );
    return pinnedFee <= 0
      ? { status: "ok", addons: [], fee: 0, rate: ctx.pinned }
      : {
          status: "ok",
          fee: pinnedFee,
          rate: ctx.pinned,
          addons: [{ addonKey: STAIR_CARRY_ADDON_KEY, qty: 1, unitPrice: pinnedFee, attrs: null }],
        };
  }

  /* Past here a fee CAN apply, so the rate is load-bearing and this fails
     CLOSED, as the delivery recompute does. A fee silently priced at zero
     because a SELECT failed is a wrong number written onto a contract the
     customer signs — worse than refusing the create. */
  const { data, error } = await sb
    .from("floor_config")
    .select("free_up_to_floor, per_floor_per_item")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    return { status: "server_error", message: "Could not read floor_config" };
  }
  if (!data) {
    return { status: "server_error", message: "floor_config row missing" };
  }

  const fee = round2(
    stairCarryFee(
      {
        floor: ctx.floor,
        hasLift: ctx.hasLift,
        stairItems: ctx.stairItems,
        itemsTotal,
      },
      {
        // `floor_config` is the DB row; `FloorConfigDto` is the camelCase view
        // of it. Named here rather than passed through an adapter so the two
        // spellings meet in exactly one place.
        freeUpToFloor: Number(data.free_up_to_floor),
        perFloorPerItem: Number(data.per_floor_per_item),
      } as Parameters<typeof stairCarryFee>[1],
    ),
  );

  const usedRate = {
    freeUpToFloor: Number(data.free_up_to_floor),
    perFloorPerItem: Number(data.per_floor_per_item),
  };
  if (fee <= 0) return { status: "ok", addons: [], fee: 0, rate: usedRate };

  /* ⛔ THE KEY MUST EXIST BEFORE THE ROW CAN REFERENCE IT.

     `order_addons.addon_key` is FK’d to `addons(key)` (0001_init). Migrations
     here are applied BY HAND, so code can reach production before its
     migration does — and on 2026-08-29 it did: every stair-carry order failed
     to submit with `order_addons_addon_key_fkey`, because the whole create is
     one transaction and the FK aborted it.

     A missing fee is the state Carres was already in and is recoverable with
     the backfill. A shop that cannot take an order is not. So this degrades
     LOUDLY rather than failing the sale: no row, a console error naming the
     migration, and the order goes through.

     One extra read, and only on an order that would actually be charged. */
  const { data: key, error: keyError } = await sb
    .from("addons")
    .select("key")
    .eq("key", STAIR_CARRY_ADDON_KEY)
    .maybeSingle();
  if (keyError || !key) {
    console.error(
      `stair carry NOT charged (RM${fee}): the '${STAIR_CARRY_ADDON_KEY}' addon key is missing. ` +
        "Apply migration 0393, then run `pnpm backfill:stair-carry -- --apply`.",
    );
    return { status: "ok", addons: [], fee: 0, rate: usedRate };
  }

  /* qty 1 × the whole fee, matching the DELIVERY rows. The per-item breakdown
     is not re-stated here: the count that produced it is already stored on the
     order (`delivery_stair_items`), and a second copy of it on the addon row
     would be a second arithmetic for one number. */
  return {
    status: "ok",
    fee,
    rate: usedRate,
    addons: [{ addonKey: STAIR_CARRY_ADDON_KEY, qty: 1, unitPrice: fee, attrs: null }],
  };
}
