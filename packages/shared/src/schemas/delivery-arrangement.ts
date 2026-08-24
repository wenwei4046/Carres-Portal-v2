/**
 * THE DELIVERY ARRANGEMENT — Delivery's OWN record of how a scope will travel.
 *
 * Owner correction 2026-08-24, and it overwrites the claim that Delivery Work
 * "writes nothing":
 *
 * > "Write to the Delivery scope/Journey leg — not the Sales Order as
 * >  duplicated truth."
 *
 * ── WHY A NEW RECORD RATHER THAN `orders.delivery_partner_id` ───────────────
 *
 * Before this, picking a carrier wrote a column on `orders`. That is a Sales
 * Order row holding a Delivery fact, which Architecture Law A forbids — one
 * record, one owner — and it has three consequences that are not theoretical:
 *
 * 1. **A Journey cannot be expressed.** KL → JB → Singapore has TWO carriers.
 *    One column on the order can hold one of them, so the second leg's partner
 *    had nowhere to live and the workspace had to read it out of a jsonb blob
 *    the Sales Order also owns.
 * 2. **A change leaves no trace.** `Change logistics` requires a reason and a
 *    history (owner ruling); an UPDATE on a Sales Order column keeps neither.
 * 3. **Two writers, one column.** Sales' own doors set that column at Accept
 *    Proceed. Delivery setting it too meant the last writer won, silently.
 *
 * So the arrangement is its own row, keyed by the scope — `(order_id, leg)` —
 * and Delivery is its only writer. Sales Orders keeps the COMMERCIAL promise
 * (`orders.delivery_date`, the address, the goods); Delivery keeps the
 * OPERATIONAL arrangement. Neither reaches into the other.
 *
 * ── WHAT A SCOPE IS, AS A KEY ───────────────────────────────────────────────
 *
 * `leg = 0` is the whole-order trip (the normal case). `leg >= 1` is one leg of
 * a Delivery Journey, matching `orders.delivery_stops[].leg`. Two legs are two
 * arrangements with two partners and two dates, which is the entire point.
 */

import { z } from "zod";

/** `0` = the whole-order scope; `1..n` = a Delivery Journey leg. */
export const deliveryScopeLegSchema = z.number().int().min(0).max(20);

/**
 * A Klang Valley trip defaults to NETS (`docs/delivery/MASTER.md` §2). The
 * default is a SUGGESTION the operator can override, never a lock — the MASTER
 * is explicit that coverage is "configurable and audited, never hard-coded".
 */
export const DEFAULT_KV_LOGISTICS = "NETS";

/**
 * ⭐ CHANGING A CARRIER IS NOT THE SAME ACT AS PICKING ONE.
 *
 * Owner ruling: *"Never silently replace an existing Logistics Partner.
 * Changing an existing Partner uses governed `Change logistics`, requiring
 * reason and history."*
 *
 * The two verbs therefore travel in ONE request shape with ONE discriminator,
 * so the server can refuse a replacement that arrived dressed as an assignment.
 * A client that omits `reason` on a scope that already has a partner gets a 409
 * naming the scope — never a silent overwrite.
 */
export const CHANGE_LOGISTICS_REASONS = [
  { key: "partner_rejected", label: "Logistics partner rejected the job" },
  { key: "partner_capacity_full", label: "Logistics partner has no capacity" },
  { key: "wrong_coverage", label: "Wrong coverage for this address" },
  { key: "customer_request", label: "Customer asked for a change" },
  { key: "cost", label: "Better rate with another partner" },
  { key: "operational_correction", label: "Correcting an earlier mistake" },
] as const;

export type ChangeLogisticsReasonKey = (typeof CHANGE_LOGISTICS_REASONS)[number]["key"];

export const CHANGE_LOGISTICS_REASON_KEYS = CHANGE_LOGISTICS_REASONS.map((r) => r.key) as [
  ChangeLogisticsReasonKey,
  ...ChangeLogisticsReasonKey[],
];

export function changeLogisticsReasonLabel(key: string | null | undefined): string | null {
  return CHANGE_LOGISTICS_REASONS.find((r) => r.key === key)?.label ?? null;
}

/** One scope named by its two parts. */
export const deliveryScopeRefSchema = z.object({
  orderId: z.string().uuid(),
  leg: deliveryScopeLegSchema.default(0),
});
export type DeliveryScopeRef = z.infer<typeof deliveryScopeRefSchema>;

/**
 * ASSIGN LOGISTICS — one partner onto one or many scopes, in ONE transaction.
 *
 * The bulk shape is the owner's: *"Allow one or multiple selected Delivery
 * scopes."* It is deliberately NOT a loop of single writes on the client — a
 * half-applied assignment across eleven scopes is a state nobody can read back,
 * and the operator would have no way to tell which four took.
 */
export const assignLogisticsInputSchema = z.object({
  scopes: z.array(deliveryScopeRefSchema).min(1).max(200),
  partnerId: z.string().uuid(),
  /** REQUIRED when any named scope already carries a different partner. */
  reason: z.enum(CHANGE_LOGISTICS_REASON_KEYS).nullish(),
  note: z.string().trim().max(500).nullish(),
});
export type AssignLogisticsInput = z.infer<typeof assignLogisticsInputSchema>;

/**
 * SAVE DELIVERY — the Edit Delivery form's whole payload for ONE scope.
 *
 * Every field here is Delivery-owned. The customer, the address, the building
 * facts and the promised `Customer Delivery` date are absent BY DESIGN: the
 * form shows them read-only and sends the operator to the Sales Order to change
 * one. A field this schema does not accept cannot be written from Delivery even
 * by a hand-made request.
 */
export const saveDeliveryArrangementInputSchema = z.object({
  partnerId: z.string().uuid().nullish(),
  /** Delivery's agreed operational date — a bare business date, never a stamp. */
  confirmedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Confirmed Delivery must be a date")
    .nullish(),
  /** The customer's agreed window, e.g. `Afternoon (12pm–3pm)`. */
  confirmedTime: z.string().trim().max(60).nullish(),
  /** When the crew expects to arrive — narrower than the window, and optional. */
  expectedArrival: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected arrival time must be a time")
    .nullish(),
  logisticsNote: z.string().trim().max(2000).nullish(),
  /** Storage path of the partner's ACTUAL reply — prepared/sent is not confirmed. */
  replyProofPath: z.string().trim().max(400).nullish(),
  /** Condo trips only; the building needs a name and a plate in advance. */
  driverName: z.string().trim().max(120).nullish(),
  vehicle: z.string().trim().max(60).nullish(),
  /** Required when the save CHANGES an existing partner. */
  reason: z.enum(CHANGE_LOGISTICS_REASON_KEYS).nullish(),
});
export type SaveDeliveryArrangementInput = z.infer<typeof saveDeliveryArrangementInputSchema>;

/** One arrangement as the API returns it. */
export interface DeliveryArrangementRow {
  id: string;
  order_id: string;
  leg: number;
  partner_id: string | null;
  partner_name: string | null;
  confirmed_date: string | null;
  confirmed_time: string | null;
  expected_arrival: string | null;
  logistics_note: string | null;
  reply_proof_path: string | null;
  driver_name: string | null;
  vehicle: string | null;
  updated_at: string;
  updated_by: string | null;
}

/** One line of the arrangement's own history — every partner change, forever. */
export interface DeliveryArrangementEventRow {
  id: string;
  arrangement_id: string;
  event: "assigned" | "changed" | "cleared";
  from_partner_name: string | null;
  to_partner_name: string | null;
  reason_key: string | null;
  reason_label: string | null;
  note: string | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
  recorded_at: string;
}

/**
 * Is this save a CHANGE (needs a reason) or a first ASSIGNMENT (does not)?
 *
 * One predicate, run on both sides: the dialog uses it to decide whether to ask
 * for a reason, and the route uses it to decide whether to refuse. Two copies
 * would mean a form that asks and a server that does not care, or worse.
 */
export function isLogisticsChange(
  currentPartnerId: string | null | undefined,
  nextPartnerId: string | null | undefined,
): boolean {
  if (!nextPartnerId) return false;
  if (!currentPartnerId) return false;
  return currentPartnerId !== nextPartnerId;
}
