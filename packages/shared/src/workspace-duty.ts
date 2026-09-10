import { z } from "zod";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Expected a valid ISO calendar date");

/** Stable business-role key. A Duty identifies responsibility, never a person. */
export const workspaceDutyKeySchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z][a-z0-9_]{2,39}$/, {
    message: "Use the stable Workspace Duty key, not a name or email address",
  });

export const workspaceDutyPersonSchema = z
  .object({
    userId: z.string().uuid(),
    name: z.string().trim().min(1).nullable(),
  })
  .strict();

export type WorkspaceDutyPerson = z.infer<typeof workspaceDutyPersonSchema>;

/** One resolver answer. Normal ownership and today's cover remain separate facts. */
export const workspaceDutyResolutionSchema = z
  .object({
    dutyKey: workspaceDutyKeySchema,
    siteId: z.string().uuid().optional(),
    onDate: isoDateSchema,
    normalOwner: workspaceDutyPersonSchema.nullable(),
    buddy: workspaceDutyPersonSchema.nullable(),
    activeCover: workspaceDutyPersonSchema.nullable(),
    actingPerson: workspaceDutyPersonSchema.nullable(),
    state: z.enum(["primary", "covered", "not_assigned"]),
    assignmentId: z.string().uuid().nullable(),
  })
  .strict()
  .superRefine((resolution, context) => {
    const invalid = (message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["state"], message });

    if (resolution.state === "not_assigned") {
      if (
        resolution.normalOwner !== null ||
        resolution.buddy !== null ||
        resolution.activeCover !== null ||
        resolution.actingPerson !== null ||
        resolution.assignmentId !== null
      ) {
        invalid("A not-assigned Duty cannot contain assignment or owner facts");
      }
      return;
    }

    if (resolution.normalOwner === null || resolution.actingPerson === null || resolution.assignmentId === null) {
      invalid("An assigned Duty requires its normal owner, acting person, and assignment");
      return;
    }

    if (resolution.state === "primary") {
      if (
        resolution.activeCover !== null ||
        resolution.actingPerson.userId !== resolution.normalOwner.userId
      ) {
        invalid("Primary state means the normal owner is acting without cover");
      }
      return;
    }

    if (
      resolution.activeCover === null ||
      resolution.actingPerson.userId !== resolution.activeCover.userId ||
      resolution.activeCover.userId === resolution.normalOwner.userId
    ) {
      invalid("Covered state requires a different active cover who is the acting person");
    }
  });

export type WorkspaceDutyResolution = z.infer<typeof workspaceDutyResolutionSchema>;

/** Immutable evidence recorded when a person completes a Duty-owned action. */
export const workspaceActionActorEvidenceSchema = z
  .object({
    dutyKey: workspaceDutyKeySchema,
    siteId: z.string().uuid().optional(),
    onDate: isoDateSchema,
    normalOwnerUserId: z.string().uuid().nullable(),
    activeCoverUserId: z.string().uuid().nullable(),
    actualActorUserId: z.string().uuid(),
    assignmentId: z.string().uuid().nullable(),
  })
  .strict();

export type WorkspaceActionActorEvidence = z.infer<typeof workspaceActionActorEvidenceSchema>;

/** Scoped duties use the same Workspace authority; module callers never derive owners. */
export const WORKSPACE_SCOPED_RPCS = {
  resolve: "workspace_resolve_scoped_duty",
  assign: "workspace_assign_scoped_duty",
  cover: "workspace_cover_scoped_duty",
} as const;
