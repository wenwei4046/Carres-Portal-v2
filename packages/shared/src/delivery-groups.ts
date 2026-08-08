/**
 * T8 · Delivery groups — what may travel apart, and what may never (Jess,
 * 2026-07-27, verbatim ruling):
 *
 *   mattress + bed frame  = together (HARD, never split)
 *   sofa                  = prefer together but MAY go as a second trip
 *                           (SOFT — ASK the customer wait-vs-split, never auto-split)
 *   pillow / protector    = NEVER block a delivery (back-order them)
 *
 * The HARD half is encoded as STRUCTURE, not as a rule someone can bypass:
 * mattress and bed frame are not two groups with a "keep together" flag — they
 * are ONE group. There is no code path that can put a mattress on a truck
 * without its frame, because no code path can address them separately.
 *
 * The SOFT half is the only split this module allows: bed set ↔ sofa, and only
 * when a human passes the customer's answer in (`deliverGroups` on the confirm
 * endpoint). Nothing here decides to split on its own — "never auto-split" is
 * satisfied by having no default: omit the scope and you get the whole order,
 * exactly as before T8.
 *
 * Accessories and service charges carry NO group. They are not "a group that
 * always passes" — they are outside the question entirely, which is why a
 * missing RM39 pillow cannot hold a RM5,000 bed set. (That half was already
 * true before T8: `lineReadiness` returns "reserved" for every `acc` line, and
 * the gate skips `service` lines. This module makes the reason explicit rather
 * than leaving it as a happy accident two files away.)
 *
 * D9 (2026-08-08) — an UNKNOWN line is groupless too, and for the OPPOSITE
 * reason. A pillow is outside the question because we know what it is and know
 * it cannot hold a truck. An unrecognised SKU is outside it because we cannot
 * put it in either group — and "outside the question" must never be read as
 * "passes". `unknownGoodsSkus` names them so the booking gate can refuse
 * instead of quietly counting a groupless line as one more thing that never
 * blocks. Until D9 that difference did not exist and every unknown line took
 * the pillow's exit.
 *
 * PURE — no I/O, no clock. The API gate and the drawer read THIS, so the
 * question "what is one delivery?" has one answer (the HR-P5 no-second-engine
 * lesson).
 */

import { lineCategory, lineKind } from "./line-category";

/** The two things that can travel on their own trip. */
export type DeliveryGroupKey = "bed" | "sofa";

export interface DeliveryGroupDef {
  key: DeliveryGroupKey;
  /** Operator-facing name — plain words, no jargon (COPY-STANDARD rule 9). */
  label: string;
  /** Why these lines are one group; shown as the split dialog's help text. */
  description: string;
}

export const DELIVERY_GROUPS = [
  {
    key: "bed",
    label: "Bed set",
    description:
      "Mattress and bed frame always go together — never send one without the other",
  },
  {
    key: "sofa",
    label: "Sofa",
    description: "Can go on a second trip if the customer agrees to wait for it",
  },
] as const satisfies readonly DeliveryGroupDef[];

export const DELIVERY_GROUP_KEYS = DELIVERY_GROUPS.map((g) => g.key) as [
  DeliveryGroupKey,
  ...DeliveryGroupKey[],
];

export function deliveryGroupDef(key: DeliveryGroupKey): DeliveryGroupDef {
  const def = DELIVERY_GROUPS.find((g) => g.key === key);
  // Unreachable for a typed key; throwing beats a silent wrong group.
  if (!def) throw new Error(`delivery-groups: unknown group "${key}"`);
  return def;
}

export function deliveryGroupLabel(key: DeliveryGroupKey): string {
  return deliveryGroupDef(key).label;
}

/**
 * Which delivery group a line belongs to — or null when the line cannot be
 * placed in one. **`null` is not a pass.** Two very different lines answer
 * null: a recognised accessory / service charge (`isOutsideTheTrip`), which is
 * genuinely outside the question, and an unrecognised SKU (`isUnknownGood`),
 * which nobody can place. Ask WHICH — never treat a bare null as harmless.
 *
 * Mattress AND bedframe both answer "bed": that single line IS the hard rule.
 */
export function deliveryGroupOf(sku: string): DeliveryGroupKey | null {
  const cat = lineCategory(sku);
  if (lineKind(sku) !== "core") return null; // acc + service + unknown
  if (cat === "mattress" || cat === "bedframe") return "bed";
  if (cat === "sofa") return "sofa";
  return null;
}

/** D9 — nothing recognised this SKU, so no group can hold it and no rule may
 *  declare it safe. */
export function isUnknownGood(sku: string): boolean {
  return lineKind(sku) === "unknown";
}

/** D9 — a line that is groupless BECAUSE we know what it is: a recognised
 *  accessory or a service charge. This is the only groupless line a delivery
 *  is allowed to ignore. */
export function isOutsideTheTrip(sku: string): boolean {
  const kind = lineKind(sku);
  return kind === "acc" || kind === "service";
}

/** Every line on the order that nothing recognised, de-duplicated, in the
 *  order they appear — what a delivery gate must refuse on and what an
 *  operator has to name before the goods question can be answered at all. */
export function unknownGoodsSkus(lines: { sku: string }[]): string[] {
  const out: string[] = [];
  for (const l of lines)
    if (isUnknownGood(l.sku) && !out.includes(l.sku)) out.push(l.sku);
  return out;
}

/**
 * The delivery groups an order actually has, in trip order (bed before sofa —
 * the bed set is the reason the customer took delivery). An order of pillows
 * alone has NO groups, and a group-less order is vacuously deliverable.
 */
export function orderDeliveryGroups(
  lines: { sku: string }[],
): DeliveryGroupKey[] {
  const present = new Set<DeliveryGroupKey>();
  for (const l of lines) {
    const g = deliveryGroupOf(l.sku);
    if (g) present.add(g);
  }
  return DELIVERY_GROUP_KEYS.filter((k) => present.has(k));
}

/**
 * Human sentence for a trip's scope — used by the drawer row and the activity
 * line. Full scope says nothing special (a normal delivery is not news); a
 * partial scope names BOTH halves, because "Bed set" alone does not tell an
 * operator that a sofa is still owed.
 */
export function deliveryScopeSentence(
  scope: DeliveryGroupKey[],
  allGroups: DeliveryGroupKey[],
): string | null {
  const waiting = allGroups.filter((g) => !scope.includes(g));
  if (waiting.length === 0) return null;
  const going = scope.map(deliveryGroupLabel).join(" + ");
  const later = waiting.map(deliveryGroupLabel).join(" + ");
  return `${going} only — ${later} follows on a second trip`;
}
