import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesOrderChangeSide } from "@carres/shared";
import { STAIR_CARRY_ADDON_KEY } from "@carres/shared";
import { recomputeStairCarry } from "./stair-carry-recompute";

/** The existing stair arithmetic, evaluated before evidence/approval and checked
 * again against its inputs under the apply lock. No delivery/service price engine. */
export async function priceStaffAmendment(
  sb: SupabaseClient, orderId: string, proposed: Record<string, unknown>,
  opened?: SalesOrderChangeSide,
): Promise<{ proposed: Record<string, unknown>; quote: Record<string, unknown> | null }> {
  // A client never authors the system quote, including on the preview door.
  const clean = { ...proposed }; delete clean._stair_quote;
  const header = (clean.header ?? {}) as Record<string, unknown>;
  if (!clean.lines && !["delivery_floor", "delivery_has_lift", "delivery_stair_items"].some(k => k in header)) {
    return { proposed: clean, quote: null };
  }
  const { data: order, error } = await sb.from("orders")
    .select("delivery_floor,delivery_has_lift,delivery_stair_items,stair_rate_per_floor_per_item,stair_rate_free_up_to_floor,order_lines(id,sku,qty,unit_price,attrs),order_addons(id,addon_key,qty,unit_price,attrs)")
    .eq("id", orderId).maybeSingle();
  if (error || !order) throw new Error(error?.message ?? "Order not found");
  const before = opened ?? { header: order, lines: order.order_lines ?? [], addons: order.order_addons ?? [] };
  const afterHeader = { ...before.header, ...header };
  const lines = (clean.lines ?? before.lines) as Array<{ qty: number }>;
  const inputs = (h: Record<string, unknown>, rows: ReadonlyArray<{ qty: number }>) => ({
    floor: Number(h.delivery_floor ?? 1), has_lift: Boolean(h.delivery_has_lift),
    stair_items: h.delivery_stair_items == null ? null : Number(h.delivery_stair_items),
    items_total: rows.reduce((n, l) => n + Number(l.qty), 0),
  });
  const next = inputs(afterHeader, lines);
  if (JSON.stringify(next) === JSON.stringify(inputs(before.header, before.lines))) return { proposed: clean, quote: null };
  const pinned = {
    rate: order.stair_rate_per_floor_per_item == null ? null : Number(order.stair_rate_per_floor_per_item),
    free: order.stair_rate_free_up_to_floor == null ? null : Number(order.stair_rate_free_up_to_floor),
  };
  const result = await recomputeStairCarry(sb, lines, {
    floor: next.floor, hasLift: next.has_lift, stairItems: next.stair_items,
    pinned: pinned.rate != null && pinned.free != null ? { perFloorPerItem: pinned.rate, freeUpToFloor: pinned.free } : null,
    requireAddon: true,
  });
  if (result.status !== "ok") throw new Error(result.message);
  const previousFee = before.addons.filter(a => a.addon_key === STAIR_CARRY_ADDON_KEY).reduce((n,a) => n + Number(a.qty) * Number(a.unit_price), 0);
  const quote = { inputs: next, expected_pinned: pinned, rate: result.rate ?? null, fee: result.fee, previous_fee: previousFee };
  const addons = (clean.addons ?? before.addons) as SalesOrderChangeSide["addons"];
  const old = addons.find(a => a.addon_key === STAIR_CARRY_ADDON_KEY);
  const priced = addons.filter(a => a.addon_key !== STAIR_CARRY_ADDON_KEY);
  if (result.fee > 0) priced.push({ ...(old?.id ? { id: old.id } : {}), addon_key: STAIR_CARRY_ADDON_KEY, qty: 1, unit_price: result.fee, attrs: null });
  return { proposed: { ...clean, ...(clean.addons || result.fee !== previousFee ? { addons: priced } : {}), _stair_quote: quote }, quote };
}

export function sameStairQuote(a: unknown, b: unknown): boolean {
  // Fixed schema/order; reject malformed, missing or moved quotes rather than
  // silently recording evidence against a different amount.
  const key = (x: unknown) => {
    if (!x || typeof x !== "object") return null;
    const q = x as { inputs?: Record<string, unknown>; expected_pinned?: Record<string, unknown>; rate?: Record<string, unknown>; fee?: unknown; previous_fee?: unknown };
    return JSON.stringify([q.inputs?.floor,q.inputs?.has_lift,q.inputs?.stair_items,q.inputs?.items_total,
      q.expected_pinned?.rate,q.expected_pinned?.free,q.rate?.perFloorPerItem ?? null,q.rate?.freeUpToFloor ?? null,q.fee,q.previous_fee]);
  };
  return key(a) === key(b);
}
