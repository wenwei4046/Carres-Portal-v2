import { workspaceDutyKeySchema, workspaceDutyResolutionSchema } from "@carres/shared";
import { z } from "zod";

export const workspaceDutyDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Expected a valid ISO calendar date");

export const workspaceDutyAssignmentInputSchema = z
  .object({
    primaryUserId: z.string().uuid(),
    buddyUserId: z.string().uuid().nullable().default(null),
    startsOn: workspaceDutyDateSchema,
    endsOn: workspaceDutyDateSchema.nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.primaryUserId === value.buddyUserId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["buddyUserId"],
        message: "Primary and Buddy must be different people",
      });
    }
    if (value.endsOn !== null && value.endsOn < value.startsOn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsOn"],
        message: "End date cannot be before start date",
      });
    }
  });

export const workspaceStaffUnavailabilityInputSchema = z
  .object({
    startsOn: workspaceDutyDateSchema,
    endsOn: workspaceDutyDateSchema,
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endsOn < value.startsOn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsOn"],
        message: "End date cannot be before start date",
      });
    }
  });

const sqlResolutionSchema = z
  .object({
    duty_key: workspaceDutyKeySchema,
    on_date: workspaceDutyDateSchema,
    normal_user_id: z.string().uuid().nullable(),
    buddy_user_id: z.string().uuid().nullable(),
    active_cover_user_id: z.string().uuid().nullable(),
    acting_user_id: z.string().uuid().nullable(),
    state: z.enum(["primary", "covered", "not_assigned"]),
    assignment_id: z.string().uuid().nullable(),
  })
  .strict();

export function parseWorkspaceDutyResolution(
  raw: unknown,
  people: ReadonlyMap<string, string | null>,
) {
  const sql = sqlResolutionSchema.parse(raw);
  const person = (userId: string | null) =>
    userId === null ? null : { userId, name: people.get(userId) ?? null };

  return workspaceDutyResolutionSchema.parse({
    dutyKey: sql.duty_key,
    onDate: sql.on_date,
    normalOwner: person(sql.normal_user_id),
    buddy: person(sql.buddy_user_id),
    activeCover: person(sql.active_cover_user_id),
    actingPerson: person(sql.acting_user_id),
    state: sql.state,
    assignmentId: sql.assignment_id,
  });
}
