/**
 * Warehouse Settings — the one wire contract and the ONE schedule arithmetic
 * (owner card 2026-09-09; `docs/stock/MASTER.md` §11 · §12.13).
 *
 * ⭐ THE PRECEDENCE LIVES HERE AND NOWHERE ELSE. `ERP-ARCHITECTURE` Law D: a
 * derived fact has ONE arithmetic, not two that currently agree. The API reads
 * the rows and calls `resolveWarehouseSchedule`; the page renders its answer.
 * There is deliberately no SQL copy of this ladder to drift from.
 *
 * The ladder, top wins:
 *
 *     Special Date override
 *   → Company closure            (the Site's own status is `closed`)
 *   → Applicable public-holiday policy
 *   → Normal weekly working hours
 *
 * and, when nothing above answers, `Not configured` — which is a real
 * answer, not a blank. Absence is stated (`feedback_verify_with_an_authenticated_read`:
 * an unreadable or unset value is never printed as a zero).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The two acts a Warehouse window can govern. They are separate because they
 *  are performed by different parties in different directions. */
export const WAREHOUSE_ACTIVITIES = ["receiving", "collection"] as const;
export type WarehouseActivity = (typeof WAREHOUSE_ACTIVITIES)[number];

export const WAREHOUSE_ACTIVITY_WORD: Record<WarehouseActivity, string> = {
  receiving: "Receiving hours",
  collection: "Collection hours",
};

/** 0 = Sunday … 6 = Saturday — the JavaScript and Postgres `dow` convention,
 *  displayed Monday-first because that is how the week is worked. */
export const WAREHOUSE_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_WORD: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export const SPECIAL_DATE_KINDS = [
  "closed_all_day",
  "receiving_unavailable",
  "collection_unavailable",
  "special_receiving_hours",
  "special_collection_hours",
] as const;
export type WarehouseSpecialDateKind = (typeof SPECIAL_DATE_KINDS)[number];

export const SPECIAL_DATE_WORD: Record<WarehouseSpecialDateKind, string> = {
  closed_all_day: "Closed all day",
  receiving_unavailable: "Receiving unavailable",
  collection_unavailable: "Collection unavailable",
  special_receiving_hours: "Special receiving hours",
  special_collection_hours: "Special collection hours",
};

export const HOLIDAY_AVAILABILITIES = [
  "closed",
  "receiving_only",
  "collection_only",
  "normal",
  "special",
] as const;
export type WarehouseHolidayAvailability = (typeof HOLIDAY_AVAILABILITIES)[number];

export const HOLIDAY_AVAILABILITY_WORD: Record<WarehouseHolidayAvailability, string> = {
  closed: "Closed",
  receiving_only: "Receiving only",
  collection_only: "Collection only",
  normal: "Normal working hours",
  special: "Special hours",
};

export const WAREHOUSE_CAPABILITY_KEYS = [
  "manage_warehouse_settings",
  "confirm_inbound_receipt",
  "confirm_collection_from_warehouse",
  "perform_stock_count",
] as const;
export type WarehouseCapabilityKey = (typeof WAREHOUSE_CAPABILITY_KEYS)[number];

/** The words that say a fact has no value yet. `Not configured` is a SETTING
 *  nobody has recorded; `Not assigned` is a PERSON nobody has named. They are
 *  different absences and the card names them separately. */
export const NOT_CONFIGURED = "Not configured" as const;
export const NOT_ASSIGNED = "Not assigned" as const;
export const NO_INDIVIDUAL_RECORDED = "No individual recorded" as const;

// ---------------------------------------------------------------------------
// The wire shapes
// ---------------------------------------------------------------------------

export interface WarehouseWorkingHourRow {
  weekday: number;
  activity: WarehouseActivity;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export interface WarehouseSpecialDateRow {
  id: string;
  onDate: string;
  kind: WarehouseSpecialDateKind;
  opensAt: string | null;
  closesAt: string | null;
  reason: string;
  createdByName: string | null;
  createdAt: string;
  updatedByName: string | null;
  updatedAt: string;
}

export interface WarehouseSiteDetails {
  siteId: string;
  name: string;
  address: string | null;
  status: "active" | "closed";
  operatingPartyId: string | null;
  operatingPartyName: string | null;
  timeZone: string;
  keyContactId: string | null;
  keyContactName: string | null;
  keyContactOrganisation: string | null;
  keyContactActive: boolean;
  contactNumber: string | null;
}

export interface WarehouseHolidayPolicy {
  followPublicHolidays: boolean;
  country: string;
  state: string | null;
  observeReplacement: boolean;
  defaultAvailability: WarehouseHolidayAvailability;
  specialOpensAt: string | null;
  specialClosesAt: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

export interface WarehouseHolidayCalendar {
  id: string;
  country: string;
  state: string | null;
  version: number;
  sourceName: string;
  sourceReference: string;
  verifiedAt: string;
  importedByName: string | null;
  importedAt: string;
  active: boolean;
  dateCount: number;
}

export interface WarehouseHolidayDate {
  onDate: string;
  name: string;
  observed: boolean;
}

export interface WarehousePersonOption {
  id: string;
  name: string;
  organisation: string | null;
}

export interface WarehouseCapabilityRow {
  key: WarehouseCapabilityKey;
  label: string;
  helper: string;
  /** The door this grant governs today, in the operator's own words. It is a
   *  FACT about the system, so it never claims enforcement that is absent. */
  appliesTo: string;
  holders: Array<{ userId: string; name: string; grantedAt: string }>;
}

export interface WarehouseSettingChange {
  id: string;
  what: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  actorName: string | null;
  changedAt: string;
}

export interface WarehouseSettingsResponse {
  canEdit: boolean;
  details: WarehouseSiteDetails;
  operatingParties: Array<{ id: string; name: string }>;
  people: WarehousePersonOption[];
  workingHours: WarehouseWorkingHourRow[];
  specialDates: WarehouseSpecialDateRow[];
  holidayPolicy: WarehouseHolidayPolicy | null;
  holidayCalendars: WarehouseHolidayCalendar[];
  holidayDates: WarehouseHolidayDate[];
  capabilities: WarehouseCapabilityRow[];
  changes: WarehouseSettingChange[];
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const TIME = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "give a time like 09:00");
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "give a date like 2026-09-30");

export const warehouseSetDetailsInput = z.object({
  siteId: z.string().uuid(),
  name: z.string().trim().min(1),
  address: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["active", "closed"]),
  operatingPartyId: z.string().uuid().nullable().optional(),
  timeZone: z.string().trim().min(1),
  keyContactId: z.string().uuid().nullable().optional(),
  contactNumber: z.string().trim().max(60).nullable().optional(),
});
export type WarehouseSetDetailsInput = z.infer<typeof warehouseSetDetailsInput>;

export const warehouseWorkingHourInput = z
  .object({
    weekday: z.number().int().min(0).max(6),
    activity: z.enum(WAREHOUSE_ACTIVITIES),
    closed: z.boolean(),
    opensAt: TIME.nullable().optional(),
    closesAt: TIME.nullable().optional(),
  })
  .refine((r) => r.closed || (r.opensAt != null && r.closesAt != null), {
    message: "give both an opening and a closing time",
  })
  .refine((r) => r.closed || (r.opensAt ?? "") < (r.closesAt ?? ""), {
    message: "the closing time must be later than the opening time",
  });

export const warehouseSetWorkingHoursInput = z.object({
  siteId: z.string().uuid(),
  rows: z.array(warehouseWorkingHourInput).max(14),
});
export type WarehouseSetWorkingHoursInput = z.infer<typeof warehouseSetWorkingHoursInput>;

export const warehouseSaveSpecialDateInput = z
  .object({
    id: z.string().uuid().nullable().optional(),
    siteId: z.string().uuid(),
    onDate: ISO_DATE,
    kind: z.enum(SPECIAL_DATE_KINDS),
    opensAt: TIME.nullable().optional(),
    closesAt: TIME.nullable().optional(),
    reason: z.string().trim().min(1, "say why this date is different"),
  })
  .refine(
    (r) =>
      !isSpecialHoursKind(r.kind) ||
      (r.opensAt != null && r.closesAt != null && r.opensAt < r.closesAt),
    { message: "give both an opening and a closing time, and close after you open" },
  );
export type WarehouseSaveSpecialDateInput = z.infer<typeof warehouseSaveSpecialDateInput>;

export const warehouseSetHolidayPolicyInput = z
  .object({
    siteId: z.string().uuid(),
    followPublicHolidays: z.boolean(),
    country: z.string().trim().min(1),
    state: z.string().trim().nullable().optional(),
    observeReplacement: z.boolean(),
    defaultAvailability: z.enum(HOLIDAY_AVAILABILITIES),
    specialOpensAt: TIME.nullable().optional(),
    specialClosesAt: TIME.nullable().optional(),
  })
  .refine(
    (r) =>
      r.defaultAvailability !== "special" ||
      (r.specialOpensAt != null &&
        r.specialClosesAt != null &&
        r.specialOpensAt < r.specialClosesAt),
    { message: "give both an opening and a closing time, and close after you open" },
  );
export type WarehouseSetHolidayPolicyInput = z.infer<typeof warehouseSetHolidayPolicyInput>;

export const warehouseImportHolidayCalendarInput = z.object({
  country: z.string().trim().min(1),
  state: z.string().trim().nullable().optional(),
  sourceName: z.string().trim().min(1, "name the source this calendar came from"),
  sourceReference: z.string().trim().min(1, "give the source reference"),
  verifiedAt: z.string().min(1, "say when this calendar was verified"),
  dates: z
    .array(
      z.object({
        date: ISO_DATE,
        name: z.string().trim().min(1),
        observed: z.boolean().optional(),
      }),
    )
    .min(1, "an import with no date is not a calendar"),
});
export type WarehouseImportHolidayCalendarInput = z.infer<
  typeof warehouseImportHolidayCalendarInput
>;

export const warehouseCapabilityGrantInput = z.object({
  capability: z.enum(WAREHOUSE_CAPABILITY_KEYS),
  userId: z.string().uuid(),
});
export type WarehouseCapabilityGrantInput = z.infer<typeof warehouseCapabilityGrantInput>;

export function isSpecialHoursKind(kind: WarehouseSpecialDateKind): boolean {
  return kind === "special_receiving_hours" || kind === "special_collection_hours";
}

// ---------------------------------------------------------------------------
// THE ONE SCHEDULE ARITHMETIC
// ---------------------------------------------------------------------------

/** What one activity may do on one date. `not_configured` is deliberately its
 *  own value: "nobody said" is not "closed". */
export type WarehouseAvailability = "open" | "closed" | "not_configured";

/** The card's five reason words — the resolved schedule must say WHY. */
export type WarehouseScheduleReason =
  | "Special hours"
  | "Company closure"
  | `${string} public holiday`
  | "Normal working hours"
  | "Not configured";

export interface WarehouseActivitySchedule {
  availability: WarehouseAvailability;
  opensAt: string | null;
  closesAt: string | null;
}

export interface WarehouseResolvedSchedule {
  date: string;
  reason: WarehouseScheduleReason;
  receiving: WarehouseActivitySchedule;
  collection: WarehouseActivitySchedule;
}

export interface WarehouseScheduleInput {
  date: string;
  siteStatus: "active" | "closed";
  workingHours: readonly WarehouseWorkingHourRow[];
  specialDates: readonly Pick<
    WarehouseSpecialDateRow,
    "onDate" | "kind" | "opensAt" | "closesAt"
  >[];
  holidayPolicy: Pick<
    WarehouseHolidayPolicy,
    | "followPublicHolidays"
    | "state"
    | "country"
    | "observeReplacement"
    | "defaultAvailability"
    | "specialOpensAt"
    | "specialClosesAt"
  > | null;
  holidayDates: readonly WarehouseHolidayDate[];
}

const CLOSED: WarehouseActivitySchedule = {
  availability: "closed",
  opensAt: null,
  closesAt: null,
};
const UNCONFIGURED: WarehouseActivitySchedule = {
  availability: "not_configured",
  opensAt: null,
  closesAt: null,
};

/** 0 = Sunday. A calendar date has no timezone, so a UTC anchor reads its
 *  weekday without any offset arithmetic (the `working-days.ts` convention). */
export function weekdayOfIsoDate(date: string): number {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function weeklyFor(
  rows: readonly WarehouseWorkingHourRow[],
  weekday: number,
  activity: WarehouseActivity,
): WarehouseActivitySchedule {
  const row = rows.find((r) => r.weekday === weekday && r.activity === activity);
  if (!row) return UNCONFIGURED;
  if (row.closed) return CLOSED;
  return { availability: "open", opensAt: row.opensAt, closesAt: row.closesAt };
}

/**
 * The ladder. Every branch returns a REASON as well as an answer, because an
 * operator who is told the Warehouse is shut has to be able to see which rule
 * shut it — that is the difference between a schedule and a wall.
 */
export function resolveWarehouseSchedule(
  input: WarehouseScheduleInput,
): WarehouseResolvedSchedule {
  const { date } = input;
  const weekday = weekdayOfIsoDate(date);
  const weeklyReceiving = weeklyFor(input.workingHours, weekday, "receiving");
  const weeklyCollection = weeklyFor(input.workingHours, weekday, "collection");

  // 1 · a Special Date overrides everything below it, including a closure.
  const special = input.specialDates.filter((s) => s.onDate === date);
  if (special.length > 0) {
    let receiving = weeklyReceiving;
    let collection = weeklyCollection;
    for (const s of special) {
      switch (s.kind) {
        case "closed_all_day":
          receiving = CLOSED;
          collection = CLOSED;
          break;
        case "receiving_unavailable":
          receiving = CLOSED;
          break;
        case "collection_unavailable":
          collection = CLOSED;
          break;
        case "special_receiving_hours":
          receiving = { availability: "open", opensAt: s.opensAt, closesAt: s.closesAt };
          break;
        case "special_collection_hours":
          collection = { availability: "open", opensAt: s.opensAt, closesAt: s.closesAt };
          break;
      }
    }
    return { date, reason: "Special hours", receiving, collection };
  }

  // 2 · the Site itself is closed.
  if (input.siteStatus === "closed") {
    return { date, reason: "Company closure", receiving: CLOSED, collection: CLOSED };
  }

  // 3 · the public-holiday policy, but only when one was SAVED and switched on.
  const policy = input.holidayPolicy;
  if (policy?.followPublicHolidays) {
    const hit = input.holidayDates.find(
      (h) => h.onDate === date && (policy.observeReplacement || !h.observed),
    );
    if (hit) {
      const where = policy.state ?? policy.country;
      const reason = `${where} public holiday` as WarehouseScheduleReason;
      switch (policy.defaultAvailability) {
        case "closed":
          return { date, reason, receiving: CLOSED, collection: CLOSED };
        case "receiving_only":
          return { date, reason, receiving: weeklyReceiving, collection: CLOSED };
        case "collection_only":
          return { date, reason, receiving: CLOSED, collection: weeklyCollection };
        case "normal":
          return { date, reason, receiving: weeklyReceiving, collection: weeklyCollection };
        case "special": {
          const hours: WarehouseActivitySchedule = {
            availability: "open",
            opensAt: policy.specialOpensAt,
            closesAt: policy.specialClosesAt,
          };
          return { date, reason, receiving: hours, collection: hours };
        }
      }
    }
  }

  // 4 · the ordinary week — or the honest statement that nobody has set one.
  if (
    weeklyReceiving.availability === "not_configured" &&
    weeklyCollection.availability === "not_configured"
  ) {
    return {
      date,
      reason: "Not configured",
      receiving: UNCONFIGURED,
      collection: UNCONFIGURED,
    };
  }
  return {
    date,
    reason: "Normal working hours",
    receiving: weeklyReceiving,
    collection: weeklyCollection,
  };
}

/** `09:00` from `09:00:00`. A stored `time` carries seconds nobody reads. */
export function hhmm(t: string | null | undefined): string | null {
  return t == null ? null : t.slice(0, 5);
}

/** One activity's cell, in the operator's words. */
export function scheduleCellWord(s: WarehouseActivitySchedule): string {
  if (s.availability === "not_configured") return NOT_CONFIGURED;
  if (s.availability === "closed") return "Closed";
  return `${hhmm(s.opensAt) ?? ""}–${hhmm(s.closesAt) ?? ""}`;
}
