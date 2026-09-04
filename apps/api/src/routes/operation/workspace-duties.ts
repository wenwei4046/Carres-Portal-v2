import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { workspaceDutyKeySchema } from "@carres/shared";
import { z } from "zod";
import {
  parseWorkspaceDutyResolution,
  workspaceDutyAssignmentInputSchema,
  workspaceDutyDateSchema,
  workspaceStaffUnavailabilityInputSchema,
} from "../../lib/workspace-duty";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { adminClient, userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

const workspaceDutiesRouter = new Hono<AppEnv>();
export const workspaceUnavailabilityRouter = new Hono<AppEnv>();

const INTERNAL_ROLES = new Set(["principal", "operation", "finance", "bd", "hr", "salesperson", "showroom"]);

function requireWorkspaceStaff(role: string) {
  if (!INTERNAL_ROLES.has(role)) {
    throw new HTTPException(403, { message: "Carres staff only" });
  }
}

function malaysiaDate(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

type DutyRow = { duty_key: string; name: string; description: string };
type AssignmentRow = {
  id: string;
  duty_key: string;
  primary_user_id: string;
  buddy_user_id: string | null;
  starts_on: string;
  ends_on: string | null;
};
type StaffRow = { id: string; name: string | null; status: string };

workspaceDutiesRouter.get("/", async (c) => {
  requireWorkspaceStaff(c.var.auth.role);
  const parsedDate = workspaceDutyDateSchema.safeParse(c.req.query("on") ?? malaysiaDate());
  if (!parsedDate.success) {
    throw new HTTPException(422, { message: parsedDate.error.issues[0]?.message ?? "invalid date" });
  }
  const onDate = parsedDate.data;
  const admin = adminClient(c.env);
  const [dutiesResult, assignmentsResult, staffResult] = await Promise.all([
    admin.from("workspace_owner_duties").select("duty_key, name, description").eq("active", true).order("name"),
    admin.from("workspace_duty_assignments").select("id, duty_key, primary_user_id, buddy_user_id, starts_on, ends_on"),
    admin.from("app_users").select("id, name, status").order("name"),
  ]);
  const failure = dutiesResult.error ?? assignmentsResult.error ?? staffResult.error;
  if (failure) throw new HTTPException(500, { message: failure.message });

  const duties = (dutiesResult.data ?? []) as DutyRow[];
  const assignments = (assignmentsResult.data ?? []) as AssignmentRow[];
  const staff = (staffResult.data ?? []) as StaffRow[];
  const names = new Map(staff.map((person) => [person.id, person.name]));
  const sb = userClient(c.env, c.var.auth.jwt);

  const rows = await Promise.all(duties.map(async (duty) => {
    const { data, error } = await sb.rpc("workspace_resolve_duty", {
      p_duty_key: duty.duty_key,
      p_on: onDate,
    });
    if (error) {
      const mapped = mapPgError(error);
      throw new HTTPException(mapped.status, { message: mapped.body.message });
    }
    const assignment = assignments.find((item) =>
      item.duty_key === duty.duty_key &&
      item.starts_on <= onDate &&
      (item.ends_on === null || item.ends_on >= onDate));
    return {
      key: duty.duty_key,
      name: duty.name,
      description: duty.description,
      assignment: assignment ? {
        id: assignment.id,
        dutyKey: assignment.duty_key,
        primaryUserId: assignment.primary_user_id,
        buddyUserId: assignment.buddy_user_id,
        startsOn: assignment.starts_on,
        endsOn: assignment.ends_on,
      } : null,
      resolution: parseWorkspaceDutyResolution(data, names),
    };
  }));

  return c.json({
    onDate,
    canEdit: c.var.auth.role === "principal",
    duties: rows,
    staff: staff.filter((person) => person.status === "active").map((person) => ({
      userId: person.id,
      name: person.name,
    })),
  });
});

workspaceDutiesRouter.post("/:key/assignment", async (c) => {
  if (c.var.auth.role !== "principal") {
    throw new HTTPException(403, { message: "Principal only" });
  }
  const key = workspaceDutyKeySchema.safeParse(c.req.param("key"));
  if (!key.success) throw new HTTPException(422, { message: "Invalid Duty key" });
  const body = await parseJsonBody(c, workspaceDutyAssignmentInputSchema);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("workspace_set_duty_assignment", {
    p_duty_key: key.data,
    p_primary_user_id: body.data.primaryUserId,
    p_buddy_user_id: body.data.buddyUserId,
    p_starts_on: body.data.startsOn,
    p_ends_on: body.data.endsOn,
  });
  if (error) {
    const mapped = error.code === "23P01"
      ? { status: 409 as const, body: { message: "A Duty assignment already covers these dates" } }
      : mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json({ ok: true, assignmentId: data });
});

workspaceUnavailabilityRouter.post("/:userId/unavailability", async (c) => {
  if (c.var.auth.role !== "hr" && c.var.auth.role !== "principal") {
    throw new HTTPException(403, { message: "HR or Principal only" });
  }
  const userId = c.req.param("userId");
  if (!z.string().uuid().safeParse(userId).success) {
    throw new HTTPException(422, { message: "Invalid staff ID" });
  }
  const body = await parseJsonBody(c, workspaceStaffUnavailabilityInputSchema);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("hr_set_staff_unavailability", {
    p_user_id: userId,
    p_starts_on: body.data.startsOn,
    p_ends_on: body.data.endsOn,
    p_reason: body.data.reason ?? null,
  });
  if (error) {
    const mapped = error.code === "23P01"
      ? { status: 409 as const, body: { message: "Unavailability already covers these dates" } }
      : mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json({ ok: true, unavailabilityId: data });
});

export default workspaceDutiesRouter;
