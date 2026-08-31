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
import { PURCHASING_OFFICE_OFF_DAYS } from "./purchasing-supplier-calls";
import { z } from "zod";
import { addWorkingDays, DEFAULT_OFF_DAYS, subtractWorkingDays } from "./working-days";

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
  /**
   * WORKING days between the factory finishing and the goods reaching the
   * destination — the eighth purchasing number (Loo, 2026-08-03). Seeded 1
   * for every supplier: both factories are local, Nice Future is collected by
   * NETS and Ohana delivers.
   *
   * It exists so `purchase_orders.eta_date` can be stamped when a PO is
   * issued. Until it did, every PO born on To Order carried a NULL arrival,
   * and `purchasing_record_tomorrow_delivery` (0306, shipped) refuses to open
   * without one — a built, deployed supplier call that could never fire.
   */
  transitDays: number | null;
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
 * Transit working days for this factory — or `null` when nobody has set one.
 *
 * NEVER DEFAULTED. A null means the caller must say so rather than invent an
 * arrival date: P1's whole lesson is that a fallback is how a setting silently
 * stops mattering, and an `eta_date` nobody chose is a date the Receiving
 * queue would then treat as a measurement.
 */
export function transitDaysFor(
  settings: Pick<PurchasingSettings, "suppliers">,
  supplierId: string | null | undefined,
): number | null {
  if (!supplierId) return null;
  const row = settings.suppliers.find((s) => s.id === supplierId);
  return row?.transitDays ?? null;
}

/**
 * WHEN THE GOODS REACH US — **the ONE arithmetic, and there may never be a
 * second** (Loo's §4 Approved Evolution, 2026-08-05).
 *
 * It was written twice and the two copies disagreed:
 *
 *   `to-order.ts`                  today + production (FACTORY week)
 *                                        + transit    (OFFICE week)   ← Law 2A
 *   `OperationPurchaseOrders.tsx`  placed_at + production (FACTORY week)
 *                                                                     ← no transit
 *
 * Both live suppliers carry `transitDays = 1`, so the register was short by
 * exactly the day it forgot. Recomputed over the 16 dateless POs on production
 * (2026-08-05; no Malaysian public holiday falls between 1 and 19 Aug 2026)
 * **the missing day bites three rows**: `PO-2036` was silent where it should
 * read `same day`, and `PO-2049` + `PO-2042` read amber `same day` where the
 * truth is red `1d late`. **A page that under-warns is worse than one that says
 * nothing**, because silence is honest and a wrong colour is not.
 *
 * **TWO CALENDARS, NAMED** (Law 2A). Production is counted on the FACTORY's own
 * week — Ohana works Saturday and Nice Future does not — and transit on the
 * OFFICE week, because moving the goods is arranged by us. A caller that lets
 * `working-days.ts` default is counting on `[0]`, the WAREHOUSE week, which
 * nobody chose for this.
 *
 * **NULL IS A REAL ANSWER.** No production number, no transit number, or no
 * start date → no arrival at all, never a guessed one. P1 deleted exactly that
 * habit, and an arrival nobody chose is a date the register would then paint as
 * a measurement.
 *
 * `fromIso` is the day the clock starts, and it is the CALLER's fact: `today`
 * for a purchase order being born, `placed_at` for one already issued. Passing
 * it in is what lets both callers share this function without either of them
 * reading a clock inside it.
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
  const transit = transitDaysFor(settings, args.supplierId);
  if (production == null || transit == null) return null;
  const holidays = args.holidays ?? myHolidaySet();
  const ready = addWorkingDays(from, production, {
    offDays: workWeekOffDaysFor(settings, args.supplierId),
    holidays,
  });
  return arrivalFromReadyDate(settings, {
    supplierId: args.supplierId,
    readyDateIso: ready,
    holidays,
  });
}

/**
 * THE TRANSIT LEG on its own — when the goods reach us, counted from a day the
 * factory says they are FINISHED (Slice 1, Loo 2026-08-06: *"a ready date the
 * factory gives MOVES the expected arrival — and never overwrites it"*).
 *
 * `expectedArrivalOf` calls this for its own second half, so the two share ONE
 * spelling of `ready + transit on the OFFICE week` (Law 2A / Law D) — the
 * register's earlier bug was exactly a second spelling that forgot this leg.
 *
 * NULL IS A REAL ANSWER: no transit number for this supplier → no arrival,
 * never a guessed one (P1). `PO-2052` is the worked example: ready 12 Aug +
 * Ohana's 1 transit day = 13 Aug, while the self-computed arrival said 14 Aug.
 */
export function arrivalFromReadyDate(
  settings: Pick<PurchasingSettings, "suppliers">,
  args: {
    supplierId: string | null | undefined;
    readyDateIso: string | null | undefined;
    holidays?: ReadonlySet<string>;
  },
): string | null {
  const ready = (args.readyDateIso ?? "").slice(0, 10);
  if (ready.length !== 10) return null;
  const transit = transitDaysFor(settings, args.supplierId);
  if (transit == null) return null;
  return addWorkingDays(ready, transit, {
    offDays: PURCHASING_OFFICE_OFF_DAYS,
    holidays: args.holidays ?? myHolidaySet(),
  });
}

/**
 * WHEN THE ORDER MUST BE PLACED — the ONE inverse of `expectedArrivalOf`
 * (Purchasing Card 06; Law D: a derived fact has ONE arithmetic).
 *
 * The Manual Purchase `Order By` walks the requested Delivery Date BACKWARDS
 * through the same two legs the forward planner walks forwards, each on its
 * own named calendar (Law 2A):
 *
 *   Delivery Date
 *   − supplier transit working days            on the OFFICE week (Mon–Fri)
 *   − Supplier × Category production days      on that FACTORY's own week
 *   = Order By
 *
 * Sunday and Selangor public holidays are excluded by the same injected
 * holiday set. Manual Purchase never subtracts SO Safety days: its Delivery
 * Date is already goods arrival at Carres.
 *
 * NULL IS A REAL ANSWER. No production number, no transit number or no
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
  const transit = transitDaysFor(settings, args.supplierId);
  if (production == null || transit == null) return null;
  const holidays = args.holidays ?? myHolidaySet();
  const ready = subtractWorkingDays(delivery, transit, {
    offDays: PURCHASING_OFFICE_OFF_DAYS,
    holidays,
  });
  return subtractWorkingDays(ready, production, {
    offDays: workWeekOffDaysFor(settings, args.supplierId),
    holidays,
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
  suppliers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      categories: z.array(purchasingCategorySchema),
      offDays: z.array(z.number().int().min(0).max(6)).nullable(),
      transitDays: z.number().int().min(0).max(60).nullable(),
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
  if (on.length === 0) return "—";
  // Contiguous Mon-first runs read as a range; anything else is listed.
  const labels = on.map((w) => w.label);
  const isMonRun =
    on.every((w, i) => (i === 0 ? w.day === 1 : w.day === on[i - 1]!.day + 1)) && on[0]!.day === 1;
  return isMonRun && on.length > 2
    ? `${labels[0]}–${labels[labels.length - 1]}`
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
  return raw;
}
