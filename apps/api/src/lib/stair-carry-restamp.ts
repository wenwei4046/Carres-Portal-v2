import type { SupabaseClient } from "@supabase/supabase-js";
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

/** The three inputs plus the line quantities the fee is priced from. */
interface OrderStairInputs {
  delivery_floor: number | null;
  delivery_has_lift: boolean | null;
  delivery_stair_items: number | null;
  order_lines: Array<{ qty: number }> | null;
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
    .select("delivery_floor, delivery_has_lift, delivery_stair_items, order_lines(qty)")
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

  const { error: stampError } = await sb.rpc("order_stamp_stair_carry", {
    p_order_id: orderId,
    p_fee: recompute.fee,
  });
  if (stampError) return { ok: false, reason: `stamp: ${stampError.message}` };
  return { ok: true, fee: recompute.fee };
}

/** The header keys whose movement changes the fee. A save that touches none of
 *  them cannot move it, so it does not pay for a read and an RPC round-trip. */
export const STAIR_INPUT_KEYS = [
  "delivery_floor",
  "delivery_has_lift",
  "delivery_stair_items",
] as const;

export function touchesStairInputs(header: Record<string, unknown> | null | undefined): boolean {
  if (!header) return false;
  return STAIR_INPUT_KEYS.some((k) => k in header);
}
