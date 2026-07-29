/**
 * Purchasing settings — card P1 (migration 0303, Jess 2026-07-28).
 *
 * Every number the purchasing engine uses, and the ONE place each of them
 * is resolved. Before this module they were six hard-coded constants in
 * four files, three of which disagreed about how long a sofa takes.
 *
 * The numbers are §2 of `docs/PURCHASING-WORKING-FLOW.md`:
 *
 *   production working days   per supplier × category   (no default — see below)
 *   supplier work week        per supplier
 *   order-by buffer           one number, working days
 *   earliest sell             one number, CALENDAR days
 *   PO days                   weekday list
 *   logistics call            one number, working days before the delivery date
 *
 * **A missing production time is not a 7.** `productionWorkingDaysFor`
 * returns `null` when nobody has set a number for that supplier × category,
 * and the caller must then compute NO order-by date for that line — the
 * screen says `Set a number` instead (K1's rule: a quiet screen must mean
 * *watched and fine*, never *nobody looked*). Returning a silent default
 * here is exactly how `ops_order_control.balance` became a lock reading a
 * column nobody wrote.
 *
 * PURE — no I/O, no clock. The API loads the rows; this module only
 * answers questions about them, so the engine, the Settings screen and any
 * later consumer can never disagree about what a number means.
 */

import { z } from "zod";
import { DEFAULT_OFF_DAYS } from "./working-days";

/** The categories purchasing can buy. A guarantee or a service has no factory. */
export const PURCHASING_CATEGORIES = ["sofa", "bedframe", "mattress"] as const;
export type PurchasingCategory = (typeof PURCHASING_CATEGORIES)[number];

export function isPurchasingCategory(v: unknown): v is PurchasingCategory {
  return typeof v === "string" && (PURCHASING_CATEGORIES as readonly string[]).includes(v);
}

/** The single numbers a manager may edit one at a time. Mirrored by the
 *  CHECK inside `purchasing_set_number()` — a typo is refused by the
 *  database, not only by the browser. */
export const PURCHASING_NUMBER_KEYS = [
  "order_by_buffer_days",
  "earliest_sell_days",
  "logistics_call_working_days",
] as const;
export type PurchasingNumberKey = (typeof PURCHASING_NUMBER_KEYS)[number];

export function isPurchasingNumberKey(v: unknown): v is PurchasingNumberKey {
  return typeof v === "string" && (PURCHASING_NUMBER_KEYS as readonly string[]).includes(v);
}

/** The legal range for each single number — the same bounds as the SQL
 *  CHECK, so the form refuses what the database would refuse. */
export const PURCHASING_NUMBER_RANGE: Record<PurchasingNumberKey, { min: number; max: number }> = {
  order_by_buffer_days: { min: 0, max: 60 },
  earliest_sell_days: { min: 0, max: 365 },
  logistics_call_working_days: { min: 0, max: 30 },
};

/** Production working days are bounded by the SQL CHECK too. */
export const PRODUCTION_WORKING_DAYS_RANGE = { min: 1, max: 180 } as const;

export interface PurchasingProductionDays {
  supplierId: string;
  category: PurchasingCategory;
  workingDays: number;
}

export interface PurchasingSupplierRow {
  id: string;
  name: string;
  /** Categories this supplier actually owns SKUs for — the matrix is
   *  derived from the catalog, never drawn as every supplier × every
   *  category (live: 3 real pairs, 8 suppliers with no SKU at all). */
  categories: readonly PurchasingCategory[];
  /** Non-working weekdays, or null when nobody has set this factory's week. */
  offDays: readonly number[] | null;
}

/**
 * Where the goods go — card P4 (migration 0307, Loo 2026-07-29).
 *
 * A destination is NOT a warehouse. `purchase_orders.warehouse_id` answers
 * *where Carres records inventory*; this answers *where the supplier
 * physically sends the goods*, and the two are different questions with
 * different answers. `AL Sungai Buloh` and `HOUZS` are DELIVERY ADDRESSES and
 * are never `warehouses` rows — Carres has exactly one warehouse, and a second
 * warehouse entity would put goods we do not count into every stock rollup.
 */
export interface PurchasingDestination {
  id: string;
  /** The SAVED name, printed verbatim on the PO and the external document.
   *  `HOUZS` is deliberately shorter than "HOUZS Balakong" — do not
   *  "complete" it (COPY-STANDARD). */
  name: string;
  /** Null when nobody has set one. A destination linked to one of our own
   *  warehouses derives its address from that warehouse record and can never
   *  carry its own — that is a DB constraint, not a convention. */
  address: string | null;
  /** True when this destination is one of our own warehouses. Only these
   *  produce Carres inventory records; the others deliberately produce none. */
  linkedToWarehouse: boolean;
  isDefault: boolean;
}

/** A supplier that does not deliver: someone collects for it, and the PO can
 *  only ever say one thing. Stored as FACTS (0307 §Q3) — never as a sentence,
 *  which would give a locked word a second home. */
export interface PurchasingSupplierCollection {
  supplierId: string;
  fixedDestinationId: string | null;
  collectedByPartnerId: string | null;
}

/**
 * The locked sentence, composed from the three facts.
 *
 * COPY-STANDARD (Loo 2026-07-29) rules it exactly:
 *   `NETS collects from Nice Future and delivers to Carres Klang.`
 *
 * Composed rather than stored, and composed HERE rather than in each screen,
 * so the PO, the external document and Settings cannot spell it three ways.
 * Returns null when the facts are incomplete — a half-sentence about who
 * collects our goods is worse than none.
 */
export function supplierCollectionSentence(facts: {
  partnerName: string | null | undefined;
  supplierName: string | null | undefined;
  destinationName: string | null | undefined;
}): string | null {
  const { partnerName, supplierName, destinationName } = facts;
  if (!partnerName || !supplierName || !destinationName) return null;
  return `${partnerName} collects from ${supplierName} and delivers to ${destinationName}.`;
}

/** Settings' own word for a destination nobody has given an address. It
 *  appears in manager Settings ONLY and must never reach a PO, the external
 *  document, or an error a store reads (handoff §7). */
export const DESTINATION_ADDRESS_UNSET = "Address not set";

/** One edit: who, when, and what it was before. */
export interface PurchasingSettingChange {
  settingKey: string;
  supplierId: string | null;
  category: string | null;
  oldValue: string | null;
  newValue: string;
  changedBy: string | null;
  changedAt: string;
}

export interface PurchasingSettings {
  orderByBufferDays: number;
  earliestSellDays: number;
  logisticsCallWorkingDays: number;
  poDays: readonly number[];
  suppliers: readonly PurchasingSupplierRow[];
  productionDays: readonly PurchasingProductionDays[];
  /** P4 — the three destinations a PO may name. */
  destinations: readonly PurchasingDestination[];
  /** P4 — the suppliers that do not deliver. Empty for everyone else. */
  supplierCollection: readonly PurchasingSupplierCollection[];
  /** The most recent change per setting — the line under each row. */
  lastChanges: readonly PurchasingSettingChange[];
  /** May THIS caller edit? Hiding a control is a courtesy; the RPC gate
   *  is the protection. */
  canEdit: boolean;
}

// ── Resolvers ───────────────────────────────────────────────────────────────

/**
 * How long this factory takes to make this kind of item, in working days —
 * or `null` when nobody has set a number.
 *
 * NULL IS A REAL ANSWER. The caller must not substitute one: an order-by
 * date computed from a guessed production time is a date the factory never
 * agreed to, and it looks exactly like a date it did.
 */
export function productionWorkingDaysFor(
  settings: Pick<PurchasingSettings, "productionDays">,
  supplierId: string | null | undefined,
  category: string | null | undefined,
): number | null {
  if (!supplierId || !category) return null;
  const row = settings.productionDays.find(
    (p) => p.supplierId === supplierId && p.category === category,
  );
  return row ? row.workingDays : null;
}

/**
 * This factory's non-working weekdays.
 *
 * Falls back to the portal-wide working-day definition (Sunday off, Mon–Sat)
 * — NOT to a purchasing constant. A supplier with no work week also has no
 * production time, so it is already excluded from planning before this is
 * ever asked; the fallback exists so a half-configured supplier cannot make
 * the date engine throw.
 */
export function workWeekOffDaysFor(
  settings: Pick<PurchasingSettings, "suppliers">,
  supplierId: string | null | undefined,
): readonly number[] {
  if (!supplierId) return DEFAULT_OFF_DAYS;
  const row = settings.suppliers.find((s) => s.id === supplierId);
  return row?.offDays && row.offDays.length > 0 ? row.offDays : DEFAULT_OFF_DAYS;
}

/**
 * The supplier × category pairs that have demand but no number — what the
 * To Order tab names out loud instead of quietly planning them wrong.
 */
export function unratedPairs(
  settings: Pick<PurchasingSettings, "productionDays">,
  demand: readonly { supplierId: string; category: string }[],
): { supplierId: string; category: string }[] {
  const seen = new Set<string>();
  const out: { supplierId: string; category: string }[] = [];
  for (const d of demand) {
    if (productionWorkingDaysFor(settings, d.supplierId, d.category) != null) continue;
    const key = `${d.supplierId}::${d.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ supplierId: d.supplierId, category: d.category });
  }
  return out;
}

/**
 * The urgent-bypass window for an order that is short on these categories:
 * the LONGEST production time any factory quotes for them.
 *
 * The longest is the safe one — it flags the order early rather than late,
 * and the alternative (pick a supplier) is a question the Orders list cannot
 * answer: a short line knows its category, not yet which factory will make it.
 * Returns 0 when nobody has set a number for any of them, and 0 never
 * triggers a bypass — an unrated category cannot make an order urgent, the
 * same silence `Set a number` buys everywhere else.
 */
export function purchasingUrgentWindowDays(
  settings: Pick<PurchasingSettings, "productionDays">,
  categories: readonly (string | null | undefined)[],
): number {
  let max = 0;
  for (const row of settings.productionDays) {
    if (!categories.includes(row.category)) continue;
    if (row.workingDays > max) max = row.workingDays;
  }
  return max;
}

/** The most recent change for one row of the screen, or null. */
export function lastChangeFor(
  settings: Pick<PurchasingSettings, "lastChanges">,
  settingKey: string,
  supplierId: string | null = null,
  category: string | null = null,
): PurchasingSettingChange | null {
  return (
    settings.lastChanges.find(
      (c) =>
        c.settingKey === settingKey &&
        (c.supplierId ?? null) === supplierId &&
        (c.category ?? null) === category,
    ) ?? null
  );
}

// ── The wire ────────────────────────────────────────────────────────────────

const weekdayList = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7);

export const purchasingCategorySchema = z.enum(PURCHASING_CATEGORIES);

export const purchasingSettingsResponseSchema = z.object({
  orderByBufferDays: z.number().int(),
  earliestSellDays: z.number().int(),
  logisticsCallWorkingDays: z.number().int(),
  poDays: weekdayList,
  suppliers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      categories: z.array(purchasingCategorySchema),
      offDays: z.array(z.number().int().min(0).max(6)).nullable(),
    }),
  ),
  productionDays: z.array(
    z.object({
      supplierId: z.string(),
      category: purchasingCategorySchema,
      workingDays: z.number().int(),
    }),
  ),
  destinations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      address: z.string().nullable(),
      linkedToWarehouse: z.boolean(),
      isDefault: z.boolean(),
    }),
  ),
  supplierCollection: z.array(
    z.object({
      supplierId: z.string(),
      fixedDestinationId: z.string().nullable(),
      collectedByPartnerId: z.string().nullable(),
    }),
  ),
  lastChanges: z.array(
    z.object({
      settingKey: z.string(),
      supplierId: z.string().nullable(),
      category: z.string().nullable(),
      oldValue: z.string().nullable(),
      newValue: z.string(),
      changedBy: z.string().nullable(),
      changedAt: z.string(),
    }),
  ),
  canEdit: z.boolean(),
});
export type PurchasingSettingsResponse = z.infer<typeof purchasingSettingsResponseSchema>;

/** P4 — a manager gives an external destination its address. Only the two
 *  external destinations are editable; the RPC refuses one linked to a
 *  warehouse (`address_comes_from_the_warehouse`). */
export const purchasingSetDestinationAddressInput = z
  .object({
    destinationId: z.string().uuid(),
    address: z.string().trim().min(1).max(500),
  })
  .strict();
export type PurchasingSetDestinationAddressInput = z.infer<
  typeof purchasingSetDestinationAddressInput
>;

/** P4 — a manager records that a supplier does not deliver: who collects, and
 *  the ONE destination its POs may name. Both nullable so the rule can be
 *  cleared as well as set. */
export const purchasingSetSupplierCollectionInput = z
  .object({
    supplierId: z.string().uuid(),
    destinationId: z.string().uuid().nullable(),
    partnerId: z.string().uuid().nullable(),
  })
  .strict();
export type PurchasingSetSupplierCollectionInput = z.infer<
  typeof purchasingSetSupplierCollectionInput
>;

export const purchasingSetNumberInput = z
  .object({
    key: z.enum(PURCHASING_NUMBER_KEYS),
    value: z.number().int().min(0).max(365),
  })
  .strict();
export type PurchasingSetNumberInput = z.infer<typeof purchasingSetNumberInput>;

export const purchasingSetPoDaysInput = z.object({ days: weekdayList }).strict();
export type PurchasingSetPoDaysInput = z.infer<typeof purchasingSetPoDaysInput>;

export const purchasingSetProductionDaysInput = z
  .object({
    supplierId: z.string().uuid(),
    category: purchasingCategorySchema,
    /** null clears the number — the pair goes back to `Set a number`. */
    days: z
      .number()
      .int()
      .min(PRODUCTION_WORKING_DAYS_RANGE.min)
      .max(PRODUCTION_WORKING_DAYS_RANGE.max)
      .nullable(),
  })
  .strict();
export type PurchasingSetProductionDaysInput = z.infer<typeof purchasingSetProductionDaysInput>;

export const purchasingSetWorkWeekInput = z
  .object({
    supplierId: z.string().uuid(),
    offDays: z.array(z.number().int().min(0).max(6)).min(1).max(6),
  })
  .strict();
export type PurchasingSetWorkWeekInput = z.infer<typeof purchasingSetWorkWeekInput>;

/**
 * The days a picker may offer, Monday first.
 *
 * **Sunday is not here on purpose** (P1, Jess 2026-07-28). It is a non-working
 * day for everyone — the portal-wide working-day definition — so a Sunday
 * checkbox would read as though a phone call could buy one. The same reason
 * T9 refuses to give a logistics company a Sunday rule of its own.
 */
export const WEEKDAYS: readonly { day: number; label: string }[] = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
];

/** Sunday, kept as a named constant because the work week STORES it (every
 *  factory is closed) even though no picker ever offers it. */
export const SUNDAY = 0;

/** `{0,6}` → `Mon–Fri`. The work week stated as the days it WORKS, because
 *  that is how a factory answers the phone. */
export function workWeekLabel(offDays: readonly number[] | null | undefined): string {
  const off = new Set(offDays ?? DEFAULT_OFF_DAYS);
  // Sunday is never in WEEKDAYS, so it can never show as a working day here
  // even if a row somehow failed to store it as off.
  const on = WEEKDAYS.filter((w) => !off.has(w.day));
  if (on.length === 0) return "—";
  // Contiguous Mon-first runs read as a range; anything else is listed.
  const labels = on.map((w) => w.label);
  const isMonRun =
    on.every((w, i) => (i === 0 ? w.day === 1 : w.day === on[i - 1].day + 1)) && on[0].day === 1;
  return isMonRun && on.length > 2
    ? `${labels[0]}–${labels[labels.length - 1]}`
    : labels.join(" ");
}
