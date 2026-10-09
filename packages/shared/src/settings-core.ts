/**
 * SETTINGS → COMPANY · OFFICE · SETTINGS EDITORS — the request and response
 * shapes (Carres Settings List COM-01 · COM-02 · OFF-01..05 · TEAM-02 ·
 * SET-01, owner confirmed 9 Oct 2026). Storage: migrations 0668 + 0669.
 *
 * Who may edit: Jess, or a person she names for that section
 * (`settings_can_edit`). Every save keeps who · when · old → new · reason;
 * a reason is optional (a compulsory reason is not confirmed for Company).
 */
import { z } from "zod";

/** The Settings sections a person can be named to edit (0668). */
export const SETTINGS_EDITOR_SECTIONS = [
  "company",
  "office",
  "staff_duties",
  "sales_orders",
  "purchasing",
  "payment",
  "warehouse",
  "delivery",
  "issue_tracker",
] as const;
export type SettingsEditorSection = (typeof SETTINGS_EDITOR_SECTIONS)[number];

/** The company identity fields, in page order (COM-01 then COM-02). */
export const COMPANY_PROFILE_FIELDS = [
  "legal_name",
  "former_name",
  "registration_no",
  "address_line1",
  "address_line2",
  "address_line3",
  "postcode",
  "city",
  "country",
  "company_phone",
  "company_email",
  "support_name",
  "support_phone",
  "support_whatsapp",
  "support_email",
] as const;
export type CompanyProfileField = (typeof COMPANY_PROFILE_FIELDS)[number];
export type CompanyProfileValues = Record<CompanyProfileField, string | null>;

const optionalText = z.string().trim().max(200).nullable();
export const companyProfileValuesSchema = z.object({
  legal_name: z.string().trim().min(1).max(200),
  former_name: optionalText,
  registration_no: z.string().trim().min(1).max(60),
  address_line1: optionalText,
  address_line2: optionalText,
  address_line3: optionalText,
  postcode: optionalText,
  city: optionalText,
  country: optionalText,
  company_phone: optionalText,
  company_email: optionalText,
  support_name: optionalText,
  support_phone: optionalText,
  support_whatsapp: optionalText,
  support_email: optionalText,
});

const reason = z.string().trim().max(500).optional();
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const companyProfileSaveInput = z.object({
  values: companyProfileValuesSchema,
  revision,
  reason,
}).strict();
export type CompanyProfileSaveInput = z.infer<typeof companyProfileSaveInput>;

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const officeCalendarValuesSchema = z.object({
  work_days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  start_time: clockTime,
  end_time: clockTime,
  flexi_minutes: z.number().int().min(0).max(180),
  lunch_start: clockTime,
  lunch_end: clockTime,
  lunch_shift_minutes: z.number().int().min(0).max(120),
  holiday_region: z.string().trim().min(1).max(80),
}).refine((v) => v.start_time < v.end_time, { message: "end_before_start", path: ["end_time"] })
  .refine((v) => v.lunch_start < v.lunch_end && v.lunch_start >= v.start_time && v.lunch_end <= v.end_time, {
    message: "lunch_outside_hours",
    path: ["lunch_start"],
  });
export type OfficeCalendarValues = z.infer<typeof officeCalendarValuesSchema>;

export const officeCalendarSaveInput = z.object({
  values: officeCalendarValuesSchema,
  revision,
  reason,
}).strict();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const officeHolidaysSaveInput = z.object({
  year: z.number().int().min(2024).max(2100),
  holidays: z.array(z.object({ date: isoDate, name: z.string().trim().min(1).max(120) })).max(60),
  reason,
}).strict().refine((v) => v.holidays.every((h) => Number(h.date.slice(0, 4)) === v.year), {
  message: "date_outside_year",
  path: ["holidays"],
}).refine((v) => new Set(v.holidays.map((h) => h.date)).size === v.holidays.length, {
  message: "duplicate_date",
  path: ["holidays"],
});
export type OfficeHolidaysSaveInput = z.infer<typeof officeHolidaysSaveInput>;

/** One saved change: who · when · old → new · reason. */
export const settingsChangeSchema = z.object({
  id: z.number(),
  what: z.string(),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  reason: z.string().nullable(),
  actorName: z.string().nullable(),
  changedAt: z.string(),
});
export type SettingsChange = z.infer<typeof settingsChangeSchema>;

/** The stored state of a section: `stored` false means the storage is not
 *  installed yet (migration not applied) — the page then shows the owner
 *  defaults read-only and never offers Edit. */
export const companyProfileResponseSchema = z.object({
  stored: z.boolean(),
  values: companyProfileValuesSchema,
  revision: z.number().nullable(),
  canEdit: z.boolean(),
  changes: z.array(settingsChangeSchema),
});
export type CompanyProfileResponse = z.infer<typeof companyProfileResponseSchema>;

export const officeCalendarResponseSchema = z.object({
  stored: z.boolean(),
  values: z.object({
    work_days: z.array(z.number()),
    start_time: z.string(),
    end_time: z.string(),
    flexi_minutes: z.number(),
    lunch_start: z.string(),
    lunch_end: z.string(),
    lunch_shift_minutes: z.number(),
    holiday_region: z.string(),
  }),
  revision: z.number().nullable(),
  /** Recorded Office holidays (every year). */
  holidays: z.array(z.object({ date: z.string(), name: z.string() })),
  canEdit: z.boolean(),
  changes: z.array(settingsChangeSchema),
});
export type OfficeCalendarResponse = z.infer<typeof officeCalendarResponseSchema>;

export const settingsEditorGrantInput = z.object({
  section: z.enum(SETTINGS_EDITOR_SECTIONS),
  userId: z.string().uuid(),
}).strict();

export const settingsEditorsResponseSchema = z.object({
  stored: z.boolean(),
  canManage: z.boolean(),
  /** Live and past grants, newest first. */
  grants: z.array(z.object({
    id: z.string(),
    section: z.enum(SETTINGS_EDITOR_SECTIONS),
    userId: z.string(),
    userName: z.string().nullable(),
    grantedByName: z.string().nullable(),
    grantedAt: z.string(),
    revokedByName: z.string().nullable(),
    revokedAt: z.string().nullable(),
  })),
  /** Active internal people who may be named. */
  people: z.array(z.object({ id: z.string(), name: z.string() })),
  /** The owner accounts (principal) — they change every section. */
  owners: z.array(z.string()),
});
export type SettingsEditorsResponse = z.infer<typeof settingsEditorsResponseSchema>;

/** The verified company identity (owner's letterhead, 9 Oct 2026) — the
 *  built-in values the documents print until the stored profile is read. */
export const VERIFIED_COMPANY_PROFILE: CompanyProfileValues = Object.freeze({
  legal_name: "CARRES SDN. BHD.",
  former_name: "CARRESS SDN. BHD.",
  registration_no: "202401055306 (1601150-X)",
  address_line1: "E-28-02 & E-28-03, MENARA SUEZCAP 2",
  address_line2: "KL GATEWAY, NO. 2, JALAN KERINCHI",
  address_line3: "GERBANG KERINCHI LESTARI",
  postcode: "59200",
  city: "KUALA LUMPUR",
  country: null,
  company_phone: null,
  company_email: null,
  support_name: "Carres Support Team",
  support_phone: "011-6133 8862",
  support_whatsapp: null,
  support_email: null,
}) as CompanyProfileValues;

/** The registered address as printed lines (blank parts dropped, postcode
 *  and city on one line). */
export function companyAddressLines(p: Pick<CompanyProfileValues,
  "address_line1" | "address_line2" | "address_line3" | "postcode" | "city" | "country">): string[] {
  const place = [p.postcode, p.city].filter((v) => v && v.trim()).join(" ");
  return [p.address_line1, p.address_line2, p.address_line3, place || null, p.country]
    .filter((v): v is string => !!v && v.trim() !== "");
}
