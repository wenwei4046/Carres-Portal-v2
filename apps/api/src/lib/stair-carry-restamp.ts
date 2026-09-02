import type { SupabaseClient } from "@supabase/supabase-js";
import { STAIR_CARRY_ADDON_KEY } from "@carres/shared";
import { recomputeStairCarry } from "./stair-carry-recompute";

/**
 * RE-STAMP THE STAIR FEE AFTER THE INPUTS MOVED (owner ruling YH, 2026-08-29).
 *
 * 0393 stamps the fee at CREATE. But all three inputs stay editable afterwards:
 * `update_order` (0010) writes floor / lift / count from the POS, and
 * `sales_order_save_revision` (0327/0354) writes them from the office. Change a
 * floor from 1 to 3 and the stamped fee stayed at the old number — the order
 * then described a charge its own inputs no longer produce, which is the same
 * class of defect as the fee never being written down at all.
 *
 * ⭐ ONE ARITHMETIC, STILL. This reads the order's CURRENT inputs back and runs
 * the same `recomputeStairCarry` the create path runs, then hands the resulting
 * number to `order_stamp_stair_carry` (0394), which holds no formula of its own.
 * The alternative — a PL/pgSQL trigger — would have put the formula in SQL as
 * well as TypeScript, and two copies of one rule is the defect this whole Card
 * exists to close.
 *
 * ⭐ IT READS BACK RATHER THAN TRUSTING THE PATCH. A save may carry only
 * `delivery_floor`, leaving lift and count untouched, so the fee depends on
 * fields the request never mentioned. Reading the saved row is the only way to
 * price what the order now actually says.
 *
 * ⭐ IT NEVER FAILS THE SAVE. The save already succeeded and its revision is
 * minted; throwing here would tell the operator their edit failed when it did
 * not. A failure returns `false` and is logged by the caller — the fee is then
 * stale, which is the state we were already in before this existed, rather than
 * a lost edit.
 */

/** The three inputs, the line quantities the fee is priced from, and the fee
 *  that is on the order right now. */
interface OrderStairInputs {
  delivery_floor: number | null;
  delivery_has_lift: boolean | null;
  delivery_stair_items: number | null;
  order_lines: Array<{ qty: number }> | null;
  order_addons: Array<{ addon_key: string; qty: number; unit_price: number }> | null;
}

export async function restampStairCarry(
  sb: SupabaseClient,
  orderId: string,
): Promise<{ ok: true; fee: number } | { ok: false; reason: string }> {
  /* THE CONTRACT IS "NEVER FAILS THE SAVE", so it is enforced here rather than
     merely intended. Returning an error object is not enough: a THROWN error
     from the client or the RPC would escape into the route and 500 a save that
     had already succeeded — telling the operator their edit was lost when it
     was not. Caught once, at the boundary that makes the promise. */
  try {
    return await restamp(sb, orderId);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

async function restamp(
  sb: SupabaseClient,
  orderId: string,
): Promise<{ ok: true; fee: number } | { ok: false; reason: string }> {
  const { data, error } = await sb
    .from("orders")
    .select(
      "delivery_floor, delivery_has_lift, delivery_stair_items, " +
        "order_lines(qty), order_addons(addon_key, qty, unit_price)",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) return { ok: false, reason: `read order: ${error.message}` };
  if (!data) return { ok: false, reason: "order not found" };

  const row = data as unknown as OrderStairInputs;
  const recompute = await recomputeStairCarry(sb, row.order_lines ?? [], {
    floor: row.delivery_floor ?? 0,
    hasLift: row.delivery_has_lift ?? false,
    stairItems: row.delivery_stair_items,
  });
  if (recompute.status !== "ok") return { ok: false, reason: recompute.message };

  /* ⭐ A FEE THAT HAS NOT MOVED IS NOT RE-WRITTEN (YH, 2026-09-02).
     `order_stamp_stair_carry` (0394) DELETES the row and re-INSERTS it, so
     every call is a real write even when the number is identical. And the
     callers fire far more often than the fee changes:
       · `touchesStairInputs` tests whether the KEY is present, and the office
         form sends all three on every save — so a phone-number correction
         re-stamps.
       · `restampAfterLineWrite` fires on every line write, but the count is
         CLAMPED (`stairCarryCount`), so adding a 6th item to an order that
         carries 2 changes nothing about the fee.
     Comparing the computed fee with the one already on the order turns both of
     those into no-ops. `0` is a real value here — it means "no row" — so the
     stored side reads a missing row as 0 rather than as unknown.
     ⛔ THIS DOES NOT FIX THE RATE. If `floor_config` moved, the recomputed fee
     legitimately differs and this still re-stamps — at TODAY's rate, on an
     order the customer already signed. That is the defect `0414` closes by
     pinning the rate to the order; this only stops the pointless writes that
     make it fire. Said plainly so nobody reads this as the whole fix. */
  const stored = (row.order_addons ?? []).find((a) => a.addon_key === STAIR_CARRY_ADDON_KEY);
  const storedFee = stored ? Number(stored.unit_price) * Number(stored.qty) : 0;
  if (storedFee === recompute.fee) return { ok: true, fee: recompute.fee };

  const { error: stampError } = await sb.rpc("order_stamp_stair_carry", {
    p_order_id: orderId,
    p_fee: recompute.fee,
  });
  if (stampError) return { ok: false, reason: `stamp: ${stampError.message}` };
  return { ok: true, fee: recompute.fee };
}

/**
 * ⭐ AFTER A LINE WRITE, ALWAYS (YH, 2026-09-01 — the one 🔴 on the open list,
 * and live money in shipped code).
 *
 * The fee is `count × floors × rate`, and `count` is CLAMPED to the number of
 * items on the order. So the GOODS are the fourth input, and they never arrive
 * through a header patch — they arrive through `add_order_lines` and
 * `replace_order_lines`.
 *
 * Sell 3 items to a 3rd floor with no lift and the order stamps a fee for 3.
 * Remove one and the stored charge stays priced for 3 while every screen
 * recomputes 2. One order, two numbers, and the stored one is what the customer
 * is billed.
 *
 * ⛔ NO PREDICATE HERE, deliberately. `touchesStairInputs` reads a header patch
 * to decide whether a round-trip is worth paying for; a line door has no header
 * to read and a line write ALWAYS moves the count, so there is nothing to test.
 *
 * ⛔ AND IT NEVER FAILS THE WRITE, like every other caller. The lines are
 * already committed and the change request already decided; throwing here would
 * tell the operator their edit was lost when it was not. A stale fee is the
 * state we were in before this existed — a lost edit is not.
 *
 * FOUR DOORS CALL THIS: the two direct place-lane writers and the two
 * change-request APPROVE paths that write lines. It is a function rather than
 * four pasted blocks because a fifth line door is how this bug comes back.
 */
export async function restampAfterLineWrite(
  sb: SupabaseClient,
  orderId: string,
): Promise<void> {
  const restamp = await restampStairCarry(sb, orderId);
  if (!restamp.ok) {
    console.error("stair carry re-stamp failed", { orderId, reason: restamp.reason });
  }
}

/**
 * The header keys whose movement changes the fee. A save that touches none of
 * them cannot move it, so it does not pay for a read and an RPC round-trip.
 *
 * ⚠️ THESE ARE ONLY THREE OF THE FOUR INPUTS, and that was the bug. The item
 * count is the fourth and it does not travel in a header patch — see
 * `restampAfterLineWrite` above. This predicate stays exactly what its name
 * says: the HEADER test.
 */
export const STAIR_INPUT_KEYS = [
  "delivery_floor",
  "delivery_has_lift",
  "delivery_stair_items",
] as const;

export function touchesStairInputs(header: Record<string, unknown> | null | undefined): boolean {
  if (!header) return false;
  return STAIR_INPUT_KEYS.some((k) => k in header);
}
