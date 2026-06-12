import { z } from "zod";

/**
 * Ops cockpit — Keep notes + Tasks board (migration 0162).
 * Behind the operation Gmail-style right rail.
 */

// ── Keep notes ────────────────────────────────────────────────────────────────
export const NOTE_COLORS = [
  "default",
  "yellow",
  "green",
  "blue",
  "pink",
  "purple",
] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const opsNoteSchema = z.object({
  id: z.string().uuid(),
  authorId: z.string().uuid(),
  authorName: z.string().nullable(),
  title: z.string().nullable(),
  content: z.string(),
  color: z.string().nullable(),
  pinned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OpsNote = z.infer<typeof opsNoteSchema>;

export const opsNotesListResponseSchema = z.object({
  notes: z.array(opsNoteSchema),
});
export type OpsNotesListResponse = z.infer<typeof opsNotesListResponseSchema>;

export const createOpsNoteInputSchema = z.object({
  title: z.string().trim().nullable().optional(),
  content: z.string().default(""),
  color: z.string().trim().nullable().optional(),
  pinned: z.boolean().optional(),
});
export type CreateOpsNoteInput = z.infer<typeof createOpsNoteInputSchema>;

export const updateOpsNoteInputSchema = z.object({
  title: z.string().trim().nullable().optional(),
  content: z.string().optional(),
  color: z.string().trim().nullable().optional(),
  pinned: z.boolean().optional(),
});
export type UpdateOpsNoteInput = z.infer<typeof updateOpsNoteInputSchema>;

// ── Tasks board ───────────────────────────────────────────────────────────────
export const TASK_STATUSES = ["open", "claimed", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ["normal", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const opsTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  detail: z.string().nullable(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  createdBy: z.string().uuid(),
  createdByName: z.string().nullable(),
  assignedTo: z.string().uuid().nullable(),
  assignedToName: z.string().nullable(),
  claimedBy: z.string().uuid().nullable(),
  claimedByName: z.string().nullable(),
  claimedAt: z.string().nullable(),
  slaMinutes: z.number().int(),
  dueAt: z.string().nullable(),
  doneAt: z.string().nullable(),
  relatedOrderId: z.string().uuid().nullable(),
  relatedSo: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  overdue: z.boolean(),
});
export type OpsTask = z.infer<typeof opsTaskSchema>;

export const opsTasksListResponseSchema = z.object({
  tasks: z.array(opsTaskSchema),
});
export type OpsTasksListResponse = z.infer<typeof opsTasksListResponseSchema>;

export const createOpsTaskInputSchema = z.object({
  title: z.string().min(1),
  detail: z.string().trim().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  slaMinutes: z.number().int().min(5).max(1440).optional(),
  relatedOrderId: z.string().uuid().nullable().optional(),
});
export type CreateOpsTaskInput = z.infer<typeof createOpsTaskInputSchema>;

/** PATCH — `action` drives the status transition + records who/when server-side. */
export const updateOpsTaskInputSchema = z.object({
  title: z.string().min(1).optional(),
  detail: z.string().trim().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  slaMinutes: z.number().int().min(5).max(1440).optional(),
  action: z.enum(["claim", "done", "reopen", "cancel"]).optional(),
});
export type UpdateOpsTaskInput = z.infer<typeof updateOpsTaskInputSchema>;

export const opsTeamMemberSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  role: z.string(),
});
export type OpsTeamMember = z.infer<typeof opsTeamMemberSchema>;
