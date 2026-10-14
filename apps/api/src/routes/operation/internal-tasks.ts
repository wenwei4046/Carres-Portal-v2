import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  internalTaskAddSchema,
  internalTaskOccurrenceId,
  internalTaskResultReference,
  internalTaskSchema,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { fail, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import { recordWorkCompleted, type CompletedWrite } from "../../lib/work-completion";
import type { AppEnv } from "../../types";

/**
 * INTERNAL TASKS (Workspace MASTER "Employee-created internal tasks", Jess
 * 2026-10-14; 0694): a task one employee adds for another with `+ Task`.
 *
 * Every write here touches the task and its own history, nothing else. No
 * route approves a request, issues or sends a PO, posts a receipt or completes
 * a delivery, and being given a task grants no permission: the three doors
 * admit the same Operation and Principal accounts whoever the assignee is.
 *
 * The Work ledger (0584) learns of a finished task through its one existing
 * completion door, so `Done` is read by every screen from the same record.
 */
const taskId = z.string().uuid();

const markDoneResult = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  dueOn: z.string().date(),
  doneAt: z.string().min(10),
  doneBy: z.string().uuid(),
  recorded: z.boolean(),
}).strict();

export function createInternalTasksRouter(
  recordCompleted: (c: Context<AppEnv>, write: CompletedWrite) => Promise<void> = recordWorkCompleted,
): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.post("/", requireOperation, async (c) => {
    const body = await parseJsonBody(c, internalTaskAddSchema);
    if (!body.ok) return c.json(body.body, body.status);
    const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("internal_task_add", {
      p_title: body.data.title,
      p_detail: body.data.detail,
      p_assigned_to: body.data.assignedTo,
      p_due_on: body.data.dueOn,
      p_request_key: body.data.idempotencyKey,
    });
    if (error) return fail(c, error);
    const id = taskId.parse(data);
    return c.json({ id, occurrenceId: internalTaskOccurrenceId(id) }, 201);
  });

  router.get("/:id", requireOperation, async (c) => {
    const id = taskId.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "not_found", code: "task_not_found", message: "task not found" }, 404);
    const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("internal_task_read", { p_task_id: id.data });
    if (error) return fail(c, error);
    return c.json(internalTaskSchema.parse(data));
  });

  router.post("/:id/done", requireOperation, async (c) => {
    const id = taskId.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "not_found", code: "task_not_found", message: "task not found" }, 404);
    const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("internal_task_mark_done", { p_task_id: id.data });
    if (error) return fail(c, error);
    const done = markDoneResult.parse(data);
    const occurrenceId = internalTaskOccurrenceId(done.id);
    /* The task IS done once its own record says so. The ledger write is the
       same on a repeat (one key per occurrence), so pressing again after a
       lost ledger write repairs `Done` and never makes a second completion. */
    try {
      await recordCompleted(c, {
        occurrenceId,
        actorId: done.doneBy,
        at: done.doneAt,
        actionOn: done.dueOn,
        objectLabel: done.title,
        resultReference: internalTaskResultReference(done.id),
        sourceVersion: `internal_task:${done.id}:done`,
        idempotencyKey: `completed:${occurrenceId}`,
      });
    } catch (ledgerError) {
      console.error("internal task done, Work completion not recorded", {
        occurrenceId,
        error: ledgerError instanceof Error ? ledgerError.message : String(ledgerError),
      });
      return c.json({ id: done.id, occurrenceId, doneAt: done.doneAt, completionRecorded: false });
    }
    return c.json({ id: done.id, occurrenceId, doneAt: done.doneAt, completionRecorded: true });
  });

  return router;
}

export default createInternalTasksRouter();
