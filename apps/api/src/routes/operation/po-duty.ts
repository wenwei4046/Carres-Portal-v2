import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  grnDutyMonth,
  monthKeyMYT,
  pickNextDutyHolder,
  updateOpsPoDutyInput,
  type OpsPoDutyResponse,
} from "@carres/shared";
import { requireDuty } from "../../lib/duties";
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

type DutyRow = { month: string; user_id: string; assigned_by: string | null };

/** Resolve (and lazily fill) the CURRENT month's duty row. Shared by GET here
 *  and the pos.ts create-PO gate. Returns null when dormant (missing table /
 *  empty pool / no row could be created). */
export async function resolveCurrentPoDuty(
  sb: ReturnType<typeof userClient>,
): Promise<DutyRow | null> {
  return resolveDutyMonth(sb, monthKeyMYT());
}

/**
 * Resolve (and lazily fill) ONE month of the rota.
 *
 * Generalised 2026-08-15 from the current-month-only version. The GRN duty
 * holder is the NEXT month's row of this same rota (`grnDutyMonth` — the
 * locked offset-1 duty model), so the Team panel's `GRN DUTY` row needs the
 * identical machinery pointed at a different month. **One rota, one
 * auto-assignment, no second store** (`purchasing/MASTER.md` §2.2).
 *
 * `excludeUserId` keeps segregation of duties: the person who ORDERS never
 * RECEIVES, so the GRN month never auto-fills with the current PO holder —
 * unless they are the only assignable person left, in which case one person
 * genuinely does both and saying so is more honest than showing nobody.
 */
export async function resolveDutyMonth(
  sb: ReturnType<typeof userClient>,
  month: string,
  excludeUserId?: string | null,
): Promise<DutyRow | null> {
  // The doc above promises "dormant, never block" — so a THROW has to degrade
  // exactly like an error RESULT does. Without this, an unexpected client
  // shape turns a dormant OPTIONAL feature into a 500 on the PO create path,
  // which is the precise opposite of what this gate is for.
  try {
    return await resolveDutyMonthImpl(sb, month, excludeUserId ?? null);
  } catch {
    return null;
  }
}

async function resolveDutyMonthImpl(
  sb: ReturnType<typeof userClient>,
  month: string,
  excludeUserId: string | null,
): Promise<DutyRow | null> {
  const cur = await sb
    .from("ops_po_duty")
    .select("month, user_id, assigned_by")
    .eq("month", month)
    .maybeSingle();
  // Relation missing (pre-0236 DB) or any read error → dormant, never block.
  if (cur.error) return null;
  if (cur.data) return cur.data as DutyRow;

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
  // Segregation of duties, but never at the cost of showing nobody: the
  // exclusion applies only while somebody else can actually take the duty.
  const eligible =
    excludeUserId && poolIds.length > 1
      ? poolIds.filter((id) => id !== excludeUserId)
      : poolIds;
  const picked = pickNextDutyHolder(
    (history.data ?? []) as { month: string; user_id: string }[],
    eligible,
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
  return after.data as DutyRow;
}

// GET / — this month's holder, enriched with email/name for the UI badge.
poDutyRouter.get("/", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const sb = userClient(c.env, auth.jwt);

  const duty = await resolveCurrentPoDuty(sb);
  const month = monthKeyMYT();
  const grnMonth = grnDutyMonth(month);
  if (!duty) {
    const body: OpsPoDutyResponse = { month, holder: null, grnMonth, grnHolder: null };
    return c.json(body);
  }

  // GRN DUTY (purchasing/MASTER.md §2.2, approved 2026-08-06 · built
  // 2026-08-15). The receiver is the NEXT month's row of this same rota, so
  // the person who ordered never receives. It is auto-assigned through the
  // identical rotation — the panel used to derive it on the client from a
  // roster that starts at the current month, so it looked backwards, found
  // nothing and printed `Not assigned` every single month.
  const grn = await resolveDutyMonth(sb, grnMonth, duty.user_id);

  // DUTY board roster (Jess 2026-07-19): this month + every future month
  // already written (0236 seeds Jul/Aug/Sep) — the whole team sees the
  // rotation, not just today's holder. One name-enrichment round-trip.
  const rosterRows = await sb
    .from("ops_po_duty")
    .select("month, user_id")
    .gte("month", month)
    .order("month")
    .limit(6);
  const rows = (rosterRows.data ?? []) as { month: string; user_id: string }[];
  const ids = [
    ...new Set(
      [duty.user_id, grn?.user_id, ...rows.map((r) => r.user_id)].filter(Boolean) as string[],
    ),
  ];
  const users = await sb.from("app_users").select("id, email, name").in("id", ids);
  const byId = new Map(
    (users.data ?? []).map((u) => [
      u.id as string,
      { email: (u.email as string) ?? "", name: (u.name as string | null) ?? null },
    ]),
  );

  const holderUser = byId.get(duty.user_id);
  const grnUser = grn ? byId.get(grn.user_id) : undefined;
  const body: OpsPoDutyResponse = {
    month: duty.month,
    holder: {
      userId: duty.user_id,
      email: holderUser?.email ?? "",
      name: holderUser?.name ?? null,
      assignedBy: duty.assigned_by,
    },
    grnMonth,
    grnHolder: grn
      ? {
          userId: grn.user_id,
          email: grnUser?.email ?? "",
          name: grnUser?.name ?? null,
          assignedBy: grn.assigned_by,
        }
      : null,
    roster: rows.map((r) => ({
      month: r.month,
      userId: r.user_id,
      email: byId.get(r.user_id)?.email ?? "",
      name: byId.get(r.user_id)?.name ?? null,
    })),
  };
  return c.json(body);
});

// PUT / — management override ({userId, month?}; month defaults to current).
poDutyRouter.put("/", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  // STRICTER than the ops_manager duty (Jess 2026-07-19: roster edits are
  // HERS) — the shared operation@ login must not rewrite the rotation.
  // HR-P2 (0260): the grant now rides the `po_duty_editor` duty key on her
  // position (COO), with the legacy email list as the one-release fallback.
  await requireDuty(
    c,
    "po_duty_editor",
    "Only the PO duty roster editor (or principal) can change the roster",
  );

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
