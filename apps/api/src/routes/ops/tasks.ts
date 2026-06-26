import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createOpsTaskInputSchema,
  updateOpsTaskInputSchema,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Tasks board (migration 0162) — COO/manager assigns work to the operation
 * team; staff CLAIM a task (records who took it) + mark it done. A 1-hour SLA
 * (sla_minutes, default 60) drives an in-app overdue flag (open past SLA),
 * surfaced as a red sidebar badge via /operation/badges (tasksOverdue).
 *
 *   GET    /          — full feed (joined member names + overdue) via RPC
 *   GET    /members   — operation+principal staff for the assign dropdown
 *   POST   /          — create (created_by = authed user)
 *   PATCH  /:id       — claim / done / reopen / cancel / edit (claimed_by = authed user)
 *   DELETE /:id       — delete
 */
const tasksRouter = new Hono<AppEnv>();

tasksRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_tasks_feed");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ tasks: (data ?? []).map(shape) });
});

tasksRouter.get("/members", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_team_members");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ members: data ?? [] });
});

tasksRouter.post("/", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, createOpsTaskInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("ops_tasks")
    .insert({
      title: parsed.title,
      detail: parsed.detail ?? null,
      created_by: c.var.auth.id,
      assigned_to: parsed.assignedTo ?? null,
      priority: parsed.priority ?? "normal",
      sla_minutes: parsed.slaMinutes ?? 60,
      due_at: parsed.dueAt ?? null,
      related_order_id: parsed.relatedOrderId ?? null,
      // escalate-on-create: a follow-up can be raised straight to the principal.
      escalated_at: parsed.escalateReason ? new Date().toISOString() : null,
      escalate_reason: parsed.escalateReason ?? null,
      escalate_note: parsed.escalateNote ?? null,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new HTTPException(500, { message: error?.message ?? "Insert failed" });
  return c.json({ id: data.id }, 201);
});

tasksRouter.patch("/:id", requireOperationOrPrincipal, async (c) => {
  const id = c.req.param("id");
  const parsed = await parseBody(c, updateOpsTaskInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const patch: Record<string, unknown> = {};
  if (parsed.title !== undefined) patch.title = parsed.title;
  if (parsed.detail !== undefined) patch.detail = parsed.detail;
  if (parsed.assignedTo !== undefined) patch.assigned_to = parsed.assignedTo;
  if (parsed.priority !== undefined) patch.priority = parsed.priority;
  if (parsed.slaMinutes !== undefined) patch.sla_minutes = parsed.slaMinutes;
  if (parsed.dueAt !== undefined) patch.due_at = parsed.dueAt;
  if (parsed.escalateReason !== undefined) patch.escalate_reason = parsed.escalateReason;
  if (parsed.escalateNote !== undefined) patch.escalate_note = parsed.escalateNote;
  // `action` records who/when server-side (claimed_by = the authed user).
  const now = new Date().toISOString();
  switch (parsed.action) {
    case "claim":
      patch.status = "claimed";
      patch.claimed_by = c.var.auth.id;
      patch.claimed_at = now;
      break;
    case "done": {
      patch.status = "done";
      patch.done_at = now;
      // Record who completed it: if nobody had claimed the task, whoever ticks
      // it done becomes the recorded doer — so the COO always sees who did it.
      const { data: cur } = await sb
        .from("ops_tasks")
        .select("claimed_by")
        .eq("id", id)
        .single();
      if (cur && !cur.claimed_by) {
        patch.claimed_by = c.var.auth.id;
        patch.claimed_at = now;
      }
      break;
    }
    case "reopen":
      patch.status = "open";
      patch.claimed_by = null;
      patch.claimed_at = null;
      patch.done_at = null;
      break;
    case "cancel":
      patch.status = "cancelled";
      break;
    case "escalate":
      // raise an existing follow-up to the principal (reason/note arrive above).
      patch.escalated_at = now;
      break;
    default:
      break;
  }
  const { error } = await sb.from("ops_tasks").update(patch).eq("id", id);
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ id });
});

tasksRouter.delete("/:id", requireOperationOrPrincipal, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from("ops_tasks").delete().eq("id", id);
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ id });
});

interface RawTaskFeed {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  priority: string;
  created_by: string;
  created_by_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  claimed_by: string | null;
  claimed_by_name: string | null;
  claimed_at: string | null;
  sla_minutes: number;
  due_at: string | null;
  done_at: string | null;
  related_order_id: string | null;
  related_so: number | null;
  escalated_at: string | null;
  escalate_reason: string | null;
  escalate_note: string | null;
  created_at: string;
  updated_at: string;
  overdue: boolean;
}

function shape(r: RawTaskFeed) {
  return {
    id: r.id,
    title: r.title,
    detail: r.detail,
    status: r.status,
    priority: r.priority,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    assignedTo: r.assigned_to,
    assignedToName: r.assigned_to_name,
    claimedBy: r.claimed_by,
    claimedByName: r.claimed_by_name,
    claimedAt: r.claimed_at,
    slaMinutes: r.sla_minutes,
    dueAt: r.due_at,
    doneAt: r.done_at,
    relatedOrderId: r.related_order_id,
    relatedSo: r.related_so,
    escalatedAt: r.escalated_at,
    escalateReason: r.escalate_reason,
    escalateNote: r.escalate_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    overdue: r.overdue,
  };
}

async function parseBody<S extends import("zod").ZodTypeAny>(
  c: import("hono").Context<AppEnv>,
  schema: S,
): Promise<import("zod").infer<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new HTTPException(400, {
      message: "Invalid input: " + parsed.error.issues[0]?.message,
    });
  return parsed.data;
}

export default tasksRouter;
