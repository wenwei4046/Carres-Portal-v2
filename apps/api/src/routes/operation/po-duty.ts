import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  isOpsManager,
  monthKeyMYT,
  pickNextDutyHolder,
  updateOpsPoDutyInput,
  type OpsPoDutyResponse,
} from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * PO duty rotation (migration 0236, Jess locked spec 2026-07-18).
 *
 *   GET /api/operation/po-duty  — this month's holder; lazily auto-fills the
 *                                 month from the rotation when missing.
 *   PUT /api/operation/po-duty  — management override of a month's holder.
 *
 * FAILS SOFT: on a DB that predates 0236 (relation missing) GET returns
 * holder:null — the whole duty layer stays dormant and Raise PO behaves as
 * before. One person controls POs per calendar month (人分单,货合买);
 * management can always raise POs regardless (gate lives in pos.ts).
 */
const poDutyRouter = new Hono<AppEnv>();

function requireOperationOrPrincipal(
  role: string,
): asserts role is "operation" | "principal" {
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation or principal only" });
  }
}

/** Resolve (and lazily fill) the CURRENT month's duty row. Shared by GET here
 *  and the pos.ts create-PO gate. Returns null when dormant (missing table /
 *  empty pool / no row could be created). */
export async function resolveCurrentPoDuty(
  sb: ReturnType<typeof userClient>,
): Promise<{ month: string; user_id: string; assigned_by: string | null } | null> {
  const month = monthKeyMYT();
  const cur = await sb
    .from("ops_po_duty")
    .select("month, user_id, assigned_by")
    .eq("month", month)
    .maybeSingle();
  // Relation missing (pre-0236 DB) or any read error → dormant, never block.
  if (cur.error) return null;
  if (cur.data) return cur.data as { month: string; user_id: string; assigned_by: string | null };

  // Lazy auto-fill: rotation over the assignment pool (fewest months served,
  // deterministic — see pickNextDutyHolder). Pool = ops_staff_settings rows
  // whose account is still active operation.
  const [settings, users, history] = await Promise.all([
    sb.from("ops_staff_settings").select("user_id"),
    sb.from("app_users").select("id, status").eq("role", "operation"),
    sb.from("ops_po_duty").select("month, user_id"),
  ]);
  if (settings.error || users.error || history.error) return null;
  const activeIds = new Set(
    (users.data ?? [])
      .filter((u) => ((u.status as string | null) ?? "active") === "active")
      .map((u) => u.id as string),
  );
  const poolIds = (settings.data ?? [])
    .map((s) => s.user_id as string)
    .filter((id) => activeIds.has(id));
  const picked = pickNextDutyHolder(
    (history.data ?? []) as { month: string; user_id: string }[],
    poolIds,
  );
  if (!picked) return null;

  // Two sessions may race to fill the same month — the PK + do-nothing insert
  // makes the first writer win; re-read to converge on the same holder.
  await sb
    .from("ops_po_duty")
    .upsert({ month, user_id: picked }, { onConflict: "month", ignoreDuplicates: true });
  const after = await sb
    .from("ops_po_duty")
    .select("month, user_id, assigned_by")
    .eq("month", month)
    .maybeSingle();
  if (after.error || !after.data) return null;
  return after.data as { month: string; user_id: string; assigned_by: string | null };
}

// GET / — this month's holder, enriched with email/name for the UI badge.
poDutyRouter.get("/", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const sb = userClient(c.env, auth.jwt);

  const duty = await resolveCurrentPoDuty(sb);
  const month = monthKeyMYT();
  if (!duty) {
    const body: OpsPoDutyResponse = { month, holder: null };
    return c.json(body);
  }
  const user = await sb
    .from("app_users")
    .select("id, email, name")
    .eq("id", duty.user_id)
    .maybeSingle();
  const body: OpsPoDutyResponse = {
    month: duty.month,
    holder: {
      userId: duty.user_id,
      email: (user.data?.email as string | undefined) ?? "",
      name: (user.data?.name as string | null | undefined) ?? null,
      assignedBy: duty.assigned_by,
    },
  };
  return c.json(body);
});

// PUT / — management override ({userId, month?}; month defaults to current).
poDutyRouter.put("/", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  if (!isOpsManager(auth.role, auth.email)) {
    throw new HTTPException(403, {
      message: "Only management can change the PO duty holder",
    });
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = updateOpsPoDutyInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid PO duty: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const month = parsed.data.month ?? monthKeyMYT();
  const { error } = await sb.from("ops_po_duty").upsert(
    {
      month,
      user_id: parsed.data.userId,
      assigned_by: auth.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "month" },
  );
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true, month });
});

export default poDutyRouter;
