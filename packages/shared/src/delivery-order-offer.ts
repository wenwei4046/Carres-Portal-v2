/**
 * NEW DELIVERY ORDER — what an office-opened DO may still carry.
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH 2026-10-23):
 * office staff may open a Delivery Order from a Sales Order's lines, the Houzs
 * way. It overturns Jess's "the system issues the DO, no New DO control" rule
 * (docs/delivery/MASTER.md §3, §15; docs/orders/MASTER.md); Jess was not part
 * of the decision.
 *
 * The DO engine's unit of goods is the DELIVERY GROUP (`delivery-groups.ts`):
 * a DO carries the whole order (`trip_groups` NULL) or named groups. So the
 * office picks groups, and the lines inside a group travel together, exactly
 * as every other DO. A group already on a live DO is never offered again.
 *
 * ponytail: whole lines and groups only. A part quantity of one line (Houzs's
 * 1..remaining picker) needs DO lines the engine does not store yet.
 */
import { orderDeliveryGroups, type DeliveryGroupKey } from "./delivery-groups";

export interface DeliveryOrderOfferDoc {
  leg: number | null;
  trip_groups: ReadonlyArray<string> | null;
  voided_at: string | null;
}

export interface DeliveryOrderOffer {
  /** Groups not on any live DO of this order. */
  groups: DeliveryGroupKey[];
  /** No live DO at all: the whole order (accessories included) may go. */
  whole: boolean;
  /** The order travels on a Delivery Journey; its legs issue their own DOs. */
  journey: boolean;
}

export function deliveryOrderOffer(
  lines: ReadonlyArray<{ sku: string }>,
  docs: ReadonlyArray<DeliveryOrderOfferDoc>,
): DeliveryOrderOffer {
  const live = docs.filter((d) => !d.voided_at);
  if (live.some((d) => Number(d.leg ?? 0) > 0)) return { groups: [], whole: false, journey: true };
  if (live.some((d) => !d.trip_groups || d.trip_groups.length === 0)) {
    return { groups: [], whole: false, journey: false };
  }
  const carried = new Set(live.flatMap((d) => d.trip_groups ?? []));
  return {
    groups: orderDeliveryGroups([...lines]).filter((g) => !carried.has(g)),
    whole: live.length === 0,
    journey: false,
  };
}

export type DeliveryOrderScope =
  | { ok: true; scope: DeliveryGroupKey[] | null }
  | { ok: false; reason: "already_on_a_delivery_order" | "nothing_picked" };

/** The picked groups as the DO's scope: NULL = the whole order. */
export function deliveryOrderScopeOf(
  offer: DeliveryOrderOffer,
  picked: ReadonlyArray<string>,
): DeliveryOrderScope {
  if (!offer.whole && offer.groups.length === 0) return { ok: false, reason: "already_on_a_delivery_order" };
  const offered = new Set<string>(offer.groups);
  if (picked.some((g) => !offered.has(g))) return { ok: false, reason: "already_on_a_delivery_order" };
  const scope = offer.groups.filter((g) => picked.includes(g));
  if (offer.whole && scope.length === offer.groups.length) return { ok: true, scope: null };
  if (scope.length === 0) return { ok: false, reason: "nothing_picked" };
  return { ok: true, scope };
}
