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

import { myHolidaySet } from "./my-holidays";
import { z } from "zod";
import { addWorkingDays, countWorkingDays, DEFAULT_OFF_DAYS, subtractWorkingDays } from "./working-days";

/** The categories purchasing can buy. A guarantee or a service has no factory. */
export const PURCHASING_CATEGORIES = ["sofa", "bedframe", "mattress"] as const;
export type PurchasingCategory = (typeof PURCHASING_CATEGORIES)[number];

export function isPurchasingCategory(v: unknown): v is PurchasingCategory {
  return typeof v === "string" && (PURCHASING_CATEGORIES as readonly string[]).includes(v);
}

/** The single numbers a manager may edit one at a time. Mirrored by the
 *  CHECK inside `purchasing_set_number()` — a typo is refused by the
 *  database, not only by the browser.
 *
 *  `manual_purchase_min_delivery_days` (0422) — CALENDAR days, like
 *  `earliest_sell_days`. The earliest Delivery Date a Manual Purchase may
 *  ask for is its Proceed Date + this many days; 0 means no floor. */
export const PURCHASING_NUMBER_KEYS = [
  "order_by_buffer_days",
  "earliest_sell_days",
  "logistics_call_working_days",
  "manual_purchase_min_delivery_days",
  /** 0602 · 0603 — WORKING days from the Supplier's receipt of a Repair Order
   *  to its return target (§9.7). Each RO snapshots it at receipt. */
  "repair_return_working_days",
  /** 0606 — Purchasing §9.5 `Reply waiting days` / `Extra days before
   *  escalation`, Office working days (owner-approved 2026-09-06). */
  "claim_reply_waiting_days",
  "claim_escalation_extra_days",
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
  manual_purchase_min_delivery_days: { min: 0, max: 365 },
  repair_return_working_days: { min: 1, max: 90 },
  claim_reply_waiting_days: { min: 1, max: 30 },
  claim_escalation_extra_days: { min: 1, max: 30 },
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
  /** 0530 — payment terms in days after the bill date. Null = not set. */
  termsDays?: number | null;
  /** 0383/0611 — the supplier's full address, printed on the PO and Repair
   *  Order PDFs. Null = not recorded. Optional for an older Worker. */
  address?: string | null;
  /** 0609/0611 — the Purchase Return `Return To` (Purchasing §9.6). Null =
   *  not recorded, and Issue Purchase Return refuses. Never the `address`. */
  returnAddress?: string | null;
}

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

export interface PurchasingDestinationSetting {
  id: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  active: boolean;
  /** A linked warehouse owns its own name and address. Purchasing Settings
   *  may choose it as the default, but does not duplicate Warehouse truth. */
  warehouseLinked: boolean;
}

/** A supplier Carres must collect from. The rule is maintained once in
 *  Purchasing Settings and then read by every PO issue door. */
export interface PurchasingSupplierCollectionSetting {
  supplierId: string;
  supplierName: string;
  destinationId: string | null;
  partnerId: string | null;
}

export interface PurchasingDeliveryPartnerSetting {
  id: string;
  name: string;
}

export interface PurchasingSettings {
  orderByBufferDays: number;
  earliestSellDays: number;
  logisticsCallWorkingDays: number;
  poDays: readonly number[];
  /** 0422 — CALENDAR days after the Proceed Date; the earliest Delivery
   *  Date a Manual Purchase may ask for. 0 means no floor. */
  manualPurchaseMinDeliveryDays: number;
  suppliers: readonly PurchasingSupplierRow[];
  productionDays: readonly PurchasingProductionDays[];
  destinations: readonly PurchasingDestinationSetting[];
  /** Optional on the TypeScript shape for compatibility with older internal
   *  consumers; the live Settings response always supplies both arrays. */
  supplierCollections?: readonly PurchasingSupplierCollectionSetting[];
  deliveryPartners?: readonly PurchasingDeliveryPartnerSetting[];
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
 * WHEN THE GOODS REACH US — **the ONE arithmetic, and there may never be a
 * second** (Loo's §4 Approved Evolution, 2026-08-05).
 *
 * ```
 * arrival = fromIso + Supplier × Category production working days
 *           (on THIS factory's own work week — Ohana works Saturday,
 *            Nice Future does not)
 * ```
 *
 * The supplier transit leg was removed by owner ruling (Jess, 2026-09-29):
 * arrival is the factory's production days only, so this now returns exactly
 * what `poDeliveryDateOf` returns for the same inputs.
 *
 * **NULL IS A REAL ANSWER.** No production number or no start date → no
 * arrival at all, never a guessed one (P1).
 *
 * `fromIso` is the day the clock starts, and it is the CALLER's fact: `today`
 * for a purchase order being born, `placed_at` for one already issued.
 */
export function expectedArrivalOf(
  settings: Pick<PurchasingSettings, "productionDays" | "suppliers">,
  args: {
    supplierId: string | null | undefined;
    category: string | null | undefined;
    fromIso: string | null | undefined;
    /** Malaysian public holidays. Omitted → the live Selangor set. */
    holidays?: ReadonlySet<string>;
  },
): string | null {
  const from = (args.fromIso ?? "").slice(0, 10);
  if (from.length !== 10) return null;
  const production = productionWorkingDaysFor(settings, args.supplierId, args.category);
  if (production == null) return null;
  return addWorkingDays(from, production, {
    offDays: workWeekOffDaysFor(settings, args.supplierId),
    holidays: args.holidays ?? myHolidaySet(),
  });
}

/**
 * ⭐ THE PO DELIVERY DATE — OWNER RULING (Jess, 2026-09-22), the ONE arithmetic
 * behind the date a Purchase Order is born with.
 *
 * ```
 * PO Delivery Date = PO Date + n Settings working days
 * ```
 *
 * `n` is EXACTLY the recorded Supplier × Category production number: Settings
 * 14 means 14, Settings 10 means 10. Weekends and public holidays are
 * skipped on THIS supplier's own work week, because the number is a promise
 * the factory makes about its own days.
 *
 * Since the supplier transit leg was removed (owner ruling 2026-09-29),
 * `expectedArrivalOf` returns the same date for the same inputs.
 *
 * NULL IS A REAL ANSWER: no production number for this supplier × category,
 * or no PO Date → no date at all. The paper then prints `PO Delivery Date :
 * Not recorded` rather than a date nobody chose (P1's rule).
 *
 * `poDateIso` is the CALLER's fact — the day the purchase order is raised.
 */
export function poDeliveryDateOf(
  settings: Pick<PurchasingSettings, "productionDays" | "suppliers">,
  args: {
    supplierId: string | null | undefined;
    category: string | null | undefined;
    poDateIso: string | null | undefined;
    /** Malaysian public holidays. Omitted → the live Selangor set. */
    holidays?: ReadonlySet<string>;
  },
): string | null {
  const from = (args.poDateIso ?? "").slice(0, 10);
  if (from.length !== 10) return null;
  const production = productionWorkingDaysFor(settings, args.supplierId, args.category);
  if (production == null) return null;
  return addWorkingDays(from, production, {
    offDays: workWeekOffDaysFor(settings, args.supplierId),
    holidays: args.holidays ?? myHolidaySet(),
  });
}

/**
 * The `{n}` in the PO's printed `PO {n}-Day Delivery Date` (owner ruling
 * 2026-09-22, PO-PDF-STANDARD §2): the supplier's working days from the PO Date
 * to the PO Delivery Date — counted on THIS supplier's work week and the
 * holiday set, by the same working-day functions that stamped the date — it
 * counts what the dates say, never the raw Settings number.
 *
 * NULL IS A REAL ANSWER: no PO Date or no delivery date → no number, and the
 * paper prints the plain `PO Delivery Date` label instead of inventing one.
 */
export function poDeliveryWorkingDays(
  settings: Pick<PurchasingSettings, "suppliers">,
  args: {
    supplierId: string | null | undefined;
    poDateIso: string | null | undefined;
    deliveryDateIso: string | null | undefined;
    holidays?: ReadonlySet<string>;
  },
): number | null {
  const from = (args.poDateIso ?? "").slice(0, 10);
  const to = (args.deliveryDateIso ?? "").slice(0, 10);
  if (from.length !== 10 || to.length !== 10 || to <= from) return null;
  return countWorkingDays(from, to, {
    offDays: workWeekOffDaysFor(settings, args.supplierId),
    holidays: args.holidays ?? myHolidaySet(),
  });
}

/**
 * When the goods reach us, counted from a day the factory says they are
 * FINISHED (Slice 1, Loo 2026-08-06: a ready date the factory gives MOVES the
 * expected arrival — and never overwrites it).
 *
 * The supplier transit leg was removed by owner ruling (Jess, 2026-09-29), so
 * the arrival IS the ready date. The function stays so every caller keeps one
 * spelling. NULL only for a missing or malformed ready date.
 */
export function arrivalFromReadyDate(
  settings: Pick<PurchasingSettings, "suppliers">,
  args: {
    supplierId: string | null | undefined;
    readyDateIso: string | null | undefined;
    holidays?: ReadonlySet<string>;
  },
): string | null {
  void settings;
  const ready = (args.readyDateIso ?? "").slice(0, 10);
  if (ready.length !== 10) return null;
  return ready;
}

/**
 * WHEN THE ORDER MUST BE PLACED — the ONE inverse of `expectedArrivalOf`
 * (Purchasing Card 06; Law D: a derived fact has ONE arithmetic).
 *
 * The Manual Purchase `Order By` walks the requested Delivery Date BACKWARDS
 * through the same production leg the forward planner walks forwards:
 *
 *   Delivery Date
 *   − Supplier × Category production days      on that FACTORY's own week
 *   = Order By
 *
 * The supplier transit leg was removed by owner ruling (Jess, 2026-09-29).
 *
 * Sunday and Selangor public holidays are excluded by the same injected
 * holiday set. Manual Purchase never subtracts SO Safety days: its Delivery
 * Date is already goods arrival at Carres.
 *
 * NULL IS A REAL ANSWER. No production number or no
 * Delivery Date → no Order By, never a guessed one — the screen names the
 * missing Settings fact instead (P1's rule, unchanged).
 */
export function orderByFromDeliveryDate(
  settings: Pick<PurchasingSettings, "productionDays" | "suppliers">,
  args: {
    supplierId: string | null | undefined;
    category: string | null | undefined;
    deliveryDateIso: string | null | undefined;
    /** Malaysian public holidays. Omitted → the live Selangor set. */
    holidays?: ReadonlySet<string>;
  },
): string | null {
  const delivery = (args.deliveryDateIso ?? "").slice(0, 10);
  if (delivery.length !== 10) return null;
  const production = productionWorkingDaysFor(settings, args.supplierId, args.category);
  if (production == null) return null;
  return subtractWorkingDays(delivery, production, {
    offDays: workWeekOffDaysFor(settings, args.supplierId),
    holidays: args.holidays ?? myHolidaySet(),
  });
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
  /** 0585 · the daily PO windows (MASTER §5.6.1). Optional so a browser on
   *  this build still reads an older Worker. */
  poWindows: z
    .object({ first: z.string(), second: z.string().nullable(), secondEnabled: z.boolean() })
    .optional(),
  manualPurchaseMinDeliveryDays: z.number().int(),
  /** 0602 · `Repair return target`. Optional: read by the Settings route only. */
  repairReturnWorkingDays: z.number().int().optional(),
  /** 0606 · Supplier Claims reply timing. Optional: read by the Settings route only. */
  claimReplyWaitingDays: z.number().int().optional(),
  claimEscalationExtraDays: z.number().int().optional(),
  suppliers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      categories: z.array(purchasingCategorySchema),
      offDays: z.array(z.number().int().min(0).max(6)).nullable(),
      termsDays: z.number().int().min(0).nullable().optional(),
      /** 0611 · the two supplier addresses. Optional for an older Worker. */
      address: z.string().nullable().optional(),
      returnAddress: z.string().nullable().optional(),
      /** 0585 · the supplier's own earlier last PO time (`HH:MM`); null =
       *  the standard PO windows. Optional for an older Worker. */
      poCutoff: z.string().nullable().optional(),
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
      id: z.string().uuid(),
      name: z.string(),
      address: z.string().nullable(),
      isDefault: z.boolean(),
      active: z.boolean(),
      warehouseLinked: z.boolean(),
    }),
  ),
  supplierCollections: z
    .array(
      z.object({
        supplierId: z.string().uuid(),
        supplierName: z.string(),
        destinationId: z.string().uuid().nullable(),
        partnerId: z.string().uuid().nullable(),
      }),
    )
    .optional(),
  deliveryPartners: z
    .array(z.object({ id: z.string().uuid(), name: z.string() }))
    .optional(),
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

const purchasingDestinationName = z.string().trim().min(1).max(120);
const purchasingDestinationAddress = z
  .union([z.string().trim().max(500), z.null()])
  .transform((value) => (value === "" ? null : value));

export const purchasingCreateDestinationInput = z
  .object({
    name: purchasingDestinationName,
    address: purchasingDestinationAddress.default(null),
  })
  .strict();
export type PurchasingCreateDestinationInput = z.infer<
  typeof purchasingCreateDestinationInput
>;

export const purchasingUpdateDestinationInput = z
  .object({
    name: purchasingDestinationName,
    address: purchasingDestinationAddress,
    active: z.boolean(),
    isDefault: z.boolean(),
  })
  .strict()
  .refine((value) => value.active || !value.isDefault, {
    message: "The default Deliver To must stay available.",
    path: ["active"],
  });
export type PurchasingUpdateDestinationInput = z.infer<
  typeof purchasingUpdateDestinationInput
>;

export const purchasingSetSupplierCollectionInput = z
  .object({
    destinationId: z.string().uuid(),
    partnerId: z.string().uuid(),
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

/** `HH:MM`, 24-hour, Malaysia wall clock — what an `<input type="time">` sends. */
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 11:30.");

/**
 * 0585 · `First PO window` · `Second PO window` + its on/off switch
 * (MASTER §5.6.1, owner 2026-09-24/25). The SQL door re-checks both rules.
 */
export const purchasingSetPoWindowsInput = z
  .object({ first: clockTime, second: clockTime.nullable(), secondEnabled: z.boolean() })
  .strict()
  .refine((v) => !v.secondEnabled || v.second != null, {
    message: "The second PO window needs a time.",
    path: ["second"],
  })
  .refine((v) => v.second == null || v.second > v.first, {
    message: "The second PO window must be later than the first.",
    path: ["second"],
  });
export type PurchasingSetPoWindowsInput = z.infer<typeof purchasingSetPoWindowsInput>;

/** 0585 · one supplier's `Last PO time` (null = use the PO windows). The SQL
 *  door refuses a time that is not earlier than the last PO window. */
export const purchasingSetSupplierPoCutoffInput = z
  .object({ supplierId: z.string().uuid(), cutoff: clockTime.nullable() })
  .strict();
export type PurchasingSetSupplierPoCutoffInput = z.infer<typeof purchasingSetSupplierPoCutoffInput>;

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

/** 0530 — one supplier's payment terms in days; null clears it. */
export const purchasingSetSupplierTermsDaysInput = z
  .object({
    supplierId: z.string().uuid(),
    days: z.number().int().min(0).max(365).nullable(),
  })
  .strict();
export type PurchasingSetSupplierTermsDaysInput = z.infer<typeof purchasingSetSupplierTermsDaysInput>;

/** 0611 — one supplier address at a time: `address` (PO / Repair Order PDF)
 *  or `returnAddress` (Purchase Return `Return To`). Blank clears it; the
 *  door trims and saves NULL. Saving one never touches the other. */
export const SUPPLIER_ADDRESS_MAX = 500;
export const purchasingSetSupplierAddressInput = z
  .object({
    supplierId: z.string().uuid(),
    kind: z.enum(["address", "returnAddress"]),
    text: z.string().max(SUPPLIER_ADDRESS_MAX),
  })
  .strict();
export type PurchasingSetSupplierAddressInput = z.infer<typeof purchasingSetSupplierAddressInput>;

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

/**
 * A LIST OF WEEKDAYS, AS DAYS — `[1,3,5]` → `Mon Wed Fri`, `[1,2,3,4,5]` →
 * `Mon–Fri`.
 *
 * Extracted from `workWeekLabel` by card P20.4 rather than written fresh, and
 * that is the point: the work week stores the days a factory is OFF and PO days
 * stores the days the office SENDS, so the two arrive as opposite lists — but
 * they must READ the same, or `Mon–Fri` means one thing in one row of Settings
 * and something else in the next. Architecture law D: a derived fact has ONE
 * arithmetic.
 */
export function weekdayListLabel(days: readonly number[]): string {
  const on = WEEKDAYS.filter((w) => days.includes(w.day));
  if (on.length === 0) return "";
  // Contiguous Mon-first runs read as a range; anything else is listed.
  const labels = on.map((w) => w.label);
  const isMonRun =
    on.every((w, i) => (i === 0 ? w.day === 1 : w.day === on[i - 1]!.day + 1)) && on[0]!.day === 1;
  return isMonRun && on.length > 2
    ? `${labels[0]} to ${labels[labels.length - 1]}`
    : labels.join(" ");
}

/** `{0,6}` → `Mon–Fri`. The work week stated as the days it WORKS, because
 *  that is how a factory answers the phone. */
export function workWeekLabel(offDays: readonly number[] | null | undefined): string {
  const off = new Set(offDays ?? DEFAULT_OFF_DAYS);
  // Sunday is never in WEEKDAYS, so it can never show as a working day here
  // even if a row somehow failed to store it as off.
  return weekdayListLabel(WEEKDAYS.filter((w) => !off.has(w.day)).map((w) => w.day));
}

/**
 * A Postgres `int[]` as it comes back in the audit trail — `"{0,6}"` → `[0, 6]`.
 *
 * `purchasing_setting_changes.old_value` / `.new_value` are plain `text`, and
 * the two array-valued keys are written with `v_old::text`, so the history
 * carries the DATABASE's spelling of an array. A screen that prints it raw
 * prints `{0}`, which is what card P20.4 found on the live page.
 *
 * `null`, `""` and `"{}"` all mean *nothing recorded* and return `[]`, so a
 * caller never has to tell three empties apart. Anything that is not an integer
 * is dropped rather than becoming `NaN` — a history line is not worth a crash.
 */
export function parsePgIntArray(value: string | null | undefined): number[] {
  const inner = (value ?? "").trim().replace(/^\{/, "").replace(/\}$/, "").trim();
  if (inner === "") return [];
  return inner
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));
}

/**
 * WHAT ONE AUDITED SETTING VALUE READS AS ON SCREEN (card P20.4).
 *
 * Every key but two stores a single number and prints as itself. The two that
 * do not are the reason this function exists:
 *
 *   `supplier_work_week`  stores the days a factory is OFF   → `workWeekLabel`
 *   `po_days`             stores the days the office SENDS   → `weekdayListLabel`
 *
 * Both were reaching the screen as the raw Postgres array literal. Measured in
 * production 2026-08-08: the whole audit trail was two rows, both
 * `supplier_work_week`, so the Settings page printed `· was {0}` and
 * `· was {0,6}` — a work week stated in a syntax nobody at Carres reads, on the
 * one screen whose job is to say what a number USED to be. `po_days` had no
 * history yet and had the identical defect waiting for the first change.
 *
 * It returns `null` for a value that says nothing, so the caller renders no
 * fragment at all rather than `was —`.
 */
export function settingValueLabel(
  settingKey: string,
  value: string | null | undefined,
): string | null {
  const raw = (value ?? "").trim();
  if (raw === "") return null;
  if (settingKey === "supplier_work_week") return workWeekLabel(parsePgIntArray(raw));
  if (settingKey === "po_days") return weekdayListLabel(parsePgIntArray(raw));
  if (settingKey === "po_windows") return poWindowsHistoryLabel(raw);
  if (settingKey === "supplier_po_cutoff") return clockWordOf(raw) ?? raw;
  return raw;
}

/**
 * 0585 records a PO-window change as `11:30:00 · 16:00:00 · on` (the second
 * time may be absent). The history line reads it in the screen's clock words
 * — `11:30 AM and 4:00 PM` · `11:30 AM, second window off` — never the
 * database's spelling, never a dash.
 */
/** `11:30` / `11:30:00` → `11:30 AM`; anything else → null. */
export function clockWordOf(t: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

export function poWindowsHistoryLabel(raw: string): string {
  const [first, second, state] = raw.split("·").map((part) => part.trim());
  const one = clockWordOf(first);
  if (!one) return raw;
  const two = clockWordOf(second);
  return state === "on" && two ? `${one} and ${two}` : `${one}, second window off`;
}
