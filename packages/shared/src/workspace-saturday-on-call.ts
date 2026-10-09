import { z } from "zod";

/**
 * Saturday on-call (migration 0671; owner rule 9 Oct 2026, `Carres Settings
 * List.md` WS-12 and "Saturday on-call boundary"; docs/workspace/MASTER.md
 * §4.4 "Saturday on-call coverage is separate").
 *
 * Rotating contact coverage: answer customer, driver and warehouse calls and
 * WhatsApp, record any follow-up. It is NOT a Duty, NOT Saturday Office
 * attendance and it never moves a routine Task. Default 9:00 AM to 6:00 PM,
 * editable. Rotation frequency is not decided, so nothing rotates by itself:
 * an editor names the person per Saturday. A person on leave that Saturday is
 * flagged, never replaced.
 */

export const SATURDAY_ON_CALL_DEFAULT_WINDOW = { startsAt: "09:00", endsAt: "18:00" } as const;

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A real calendar Saturday (UTC arithmetic on a date-only string). */
export function isSaturdayIso(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day && d.getUTCDay() === 6;
}

export const saturdayOnCallWindowSchema = z
  .object({ startsAt: clock, endsAt: clock })
  .strict()
  .refine((v) => v.startsAt < v.endsAt, { path: ["endsAt"], message: "invalid_window" });

export const saturdayOnCallWindowInput = z
  .object({
    startsAt: clock,
    endsAt: clock,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .refine((v) => v.startsAt < v.endsAt, { path: ["endsAt"], message: "invalid_window" });
export type SaturdayOnCallWindowInput = z.infer<typeof saturdayOnCallWindowInput>;

export const saturdayOnCallSetInput = z
  .object({
    personId: z.string().uuid().nullable(),
    coverPersonId: z.string().uuid().nullable().optional(),
    note: z.string().max(200).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.coverPersonId && !v.personId) {
      ctx.addIssue({ code: "custom", path: ["personId"], message: "invalid_person" });
    }
    if (v.coverPersonId && v.coverPersonId === v.personId) {
      ctx.addIssue({ code: "custom", path: ["coverPersonId"], message: "cover_is_person" });
    }
  });
export type SaturdayOnCallSetInput = z.infer<typeof saturdayOnCallSetInput>;

export const saturdayOnCallDaySchema = z.object({
  saturday: isoDay,
  personId: z.string().uuid().nullable(),
  personName: z.string().nullable(),
  personOnLeave: z.boolean(),
  coverPersonId: z.string().uuid().nullable(),
  coverName: z.string().nullable(),
  coverOnLeave: z.boolean(),
  note: z.string().nullable(),
});
export type SaturdayOnCallDay = z.infer<typeof saturdayOnCallDaySchema>;

export const saturdayOnCallResponseSchema = z.object({
  window: z.object({ startsAt: clock, endsAt: clock, revision: z.number().int().positive() }),
  canEdit: z.boolean(),
  saturdays: z.array(saturdayOnCallDaySchema),
  people: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
});
export type SaturdayOnCallResponse = z.infer<typeof saturdayOnCallResponseSchema>;
