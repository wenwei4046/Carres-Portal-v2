import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { monthKeyMYT, updateOpsPoDutyInput, type OpsPoDutyResponse } from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * ONE-RELEASE COMPATIBILITY ADAPTER.
 * Old Purchasing surfaces still consume this response. It owns no rota and
 * performs no cover arithmetic: PO and GRN come from the Workspace resolver.
 */
const poDutyRouter = new Hono<AppEnv>();

function requireOperationOrPrincipal(role: string): void {
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation or principal only" });
  }
}

type DutyRow = { month: string; user_id: string; assigned_by: null };
type Resolution = {
  actor_user_id?: string | null;
  acting_user_id?: string | null;
};

function malaysiaDate(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

async function resolveLegacyDuty(
  sb: ReturnType<typeof userClient>,
  dutyKey: "po_duty" | "grn_duty",
  onDate: string,
): Promise<DutyRow | null> {
  try {
    const { data, error } = await sb.rpc("workspace_resolve_duty", {
      p_duty_key: dutyKey,
      p_on: onDate,
    });
    if (error) return null;
    const resolved = data as Resolution | null;
    const actorId = resolved?.actor_user_id ?? resolved?.acting_user_id ?? null;
    if (!actorId) return null;
    return { month: onDate.slice(0, 7), user_id: actorId, assigned_by: null };
  } catch {
    return null;
  }
}

/** Temporary compatibility shape for remaining Purchasing consumers. */
export async function resolveCurrentPoDuty(
  sb: ReturnType<typeof userClient>,
): Promise<DutyRow | null> {
  return resolveLegacyDuty(sb, "po_duty", malaysiaDate());
}

poDutyRouter.get("/", async (c) => {
  requireOperationOrPrincipal(c.var.auth.role);
  const sb = userClient(c.env, c.var.auth.jwt);
  const onDate = malaysiaDate();
  const month = onDate.slice(0, 7);
  const [po, grn] = await Promise.all([
    resolveLegacyDuty(sb, "po_duty", onDate),
    resolveLegacyDuty(sb, "grn_duty", onDate),
  ]);
  const ids = [...new Set([po?.user_id, grn?.user_id].filter((id): id is string => Boolean(id)))];
  const people = ids.length > 0
    ? await sb.from("app_users").select("id, email, name").in("id", ids)
    : { data: [], error: null };
  const byId = new Map(
    ((people.data ?? []) as { id: string; email: string | null; name: string | null }[]).map((person) => [
      person.id,
      { email: person.email ?? "", name: person.name },
    ]),
  );
  const holder = (row: DutyRow | null) => row ? {
    userId: row.user_id,
    email: byId.get(row.user_id)?.email ?? "",
    name: byId.get(row.user_id)?.name ?? null,
    assignedBy: null,
  } : null;
  const body: OpsPoDutyResponse = {
    month,
    holder: holder(po),
    grnMonth: month,
    grnHolder: holder(grn),
  };
  return c.json(body);
});

poDutyRouter.put("/", async (c) => {
  requireOperationOrPrincipal(c.var.auth.role);
  if (c.var.auth.role !== "principal") {
    throw new HTTPException(403, { message: "Principal only" });
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = updateOpsPoDutyInput.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: "invalid_input",
      code: "invalid_param",
      message: `Invalid PO duty: ${parsed.error.issues[0]?.message ?? "validation failed"}`,
    }, 422);
  }
  const month = parsed.data.month ?? monthKeyMYT();
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString().slice(0, 10);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("workspace_assign_duty", {
    p_duty_key: "po_duty",
    p_holder_id: parsed.data.userId,
    p_effective_from: `${month}-01`,
    p_effective_until: lastDay,
    p_note: "Legacy PO Duty adapter",
  });
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json({ ok: true, month });
});

export default poDutyRouter;
