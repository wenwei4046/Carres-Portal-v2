import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  hrChecklistToggleInput,
  hrEmployeePatchInput,
  hrRecordExitInput,
  hrRevealFieldInput,
  hrSetAccessInput,
  type HrEmployeeDetail,
  type HrPeopleSource,
} from "@carres/shared";
import { setAccountStatus } from "../lib/account-status";
import { requireHr } from "../lib/auth-guards";
import { adminClient, userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

/**
 * /api/hr/people — HR-P4 employee master (migration 0269, 2026-07-26).
 *
 * HR stays a keyhole role (0244 law): every read and write goes through a gated
 * SECURITY DEFINER RPC on the user's own JWT. service_role appears exactly once,
 * in the access door, because GoTrue admin sign-out requires it — and the guard
 * runs before it, per §4.4.
 *
 * The one thing to keep straight in here: an employee row is NOT created by this
 * router. People appear because they have a CRnnn code, and codes are minted at
 * the Team tab — THE account door. `hr_add_employee` exists for that door to
 * call; there is no POST /people.
 */
const hrPeopleRouter = new Hono<AppEnv>();

/** Map an RPC error onto a response. 42501 is the DEFINER gate saying no. */
function rpcFail(error: { code?: string; message: string }): never {
  if (error.code === "42501") throw new HTTPException(403, { message: "forbidden" });
  if (error.message.includes("employee_not_found")) {
    throw new HTTPException(404, { message: "employee_not_found" });
  }
  // Domain guards raised by the RPCs (exit_before_join, field_not_editable,
  // field_empty, invalid_reason…) are the caller's fault, not a server fault.
  const domain = [
    "exit_before_join",
    "field_not_editable",
    "field_not_revealable",
    "field_empty",
    "invalid_reason",
    "invalid_kind",
    "invalid_patch",
    "exit_date_required",
  ].find((k) => error.message.includes(k));
  if (domain) throw new HTTPException(422, { message: domain });
  throw new HTTPException(500, { message: error.message });
}

/** GET /api/hr/people — the roster. Carries no IC and no bank account. */
hrPeopleRouter.get("/", requireHr, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("hr_people_source");
  if (error) rpcFail(error);
  return c.json(data as unknown as HrPeopleSource);
});

/** GET /api/hr/people/:id — the drawer. Booleans for IC/bank, never values. */
hrPeopleRouter.get("/:id", requireHr, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("hr_employee_detail", {
    p_employee_id: c.req.param("id"),
  });
  if (error) rpcFail(error);
  return c.json(data as unknown as HrEmployeeDetail);
});

/** PATCH /api/hr/people/:id — profile edit. Exit fields are refused by both
 *  the zod schema and the RPC whitelist. */
hrPeopleRouter.patch("/:id", requireHr, async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const parsed = hrEmployeePatchInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("hr_upsert_employee", {
    p_employee_id: c.req.param("id"),
    p_patch: parsed.data,
  });
  if (error) rpcFail(error);
  return c.json({ ok: true });
});

/**
 * POST /api/hr/people/:id/reveal — hand over ONE masked value.
 *
 * A POST, not a GET, on purpose: this writes (the audit row) and must never be
 * cached, prefetched or logged in a URL. The RPC writes the trail in the same
 * transaction that reads the value, so there is no ordering in which a number
 * escapes untracked.
 */
hrPeopleRouter.post("/:id/reveal", requireHr, async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const parsed = hrRevealFieldInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: "unknown field" },
      422,
    );
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("hr_reveal_employee_field", {
    p_employee_id: c.req.param("id"),
    p_field: parsed.data.field,
  });
  if (error) rpcFail(error);
  return c.json({ field: parsed.data.field, value: data as unknown as string });
});

/** POST /api/hr/people/:id/exit — record the exit. Does NOT cut access; that is
 *  the deliberately separate act below. */
hrPeopleRouter.post("/:id/exit", requireHr, async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const parsed = hrRecordExitInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("hr_record_exit", {
    p_employee_id: c.req.param("id"),
    p_exit_date: parsed.data.exitDate,
    p_reason: parsed.data.reason,
    p_note: parsed.data.note ?? null,
  });
  if (error) rpcFail(error);
  return c.json({ ok: true });
});

/** POST /api/hr/people/:id/checklist — tick or untick one item. */
hrPeopleRouter.post("/:id/checklist", requireHr, async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const parsed = hrChecklistToggleInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: "invalid item" },
      422,
    );
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("hr_set_checklist_item", {
    p_employee_id: c.req.param("id"),
    p_kind: parsed.data.kind,
    p_item_key: parsed.data.itemKey,
    p_done: parsed.data.done,
  });
  if (error) rpcFail(error);
  return c.json({ ok: true });
});

/**
 * POST /api/hr/people/:id/access — THE NEW DOOR (Loo, 2026-07-26).
 *
 * Before this, only principal could disable a login, which left HR running an
 * offboarding flow that could not offboard. Loo's call: HR gets this one power.
 *
 * Scoped narrowly on purpose:
 *   * its own route, NOT a widened principal Accounts router — that one also
 *     creates accounts and rotates passwords;
 *   * `:id` here is the EMPLOYEE id, and the app_user_id is resolved from the
 *     employee row rather than taken from the client, so this endpoint cannot be
 *     pointed at an arbitrary account;
 *   * floor-only staff are rejected — they have no login to disable. Their
 *     revocation is `salespersons.active`, which staff_verify_pin (0233) already
 *     honours at the unlock screen (verified live 2026-07-26);
 *   * disabling a principal stays impossible (guarded in setAccountStatus).
 */
hrPeopleRouter.post("/:id/access", requireHr, async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const parsed = hrSetAccessInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: "invalid status" },
      422,
    );
  }

  // Resolve the target through the gated RPC on the CALLER's JWT. If they may
  // not read the employee, they may not touch their access either — the check
  // happens before service_role is ever constructed.
  const sb = userClient(c.env, c.var.auth.jwt);
  const detail = await sb.rpc("hr_employee_detail", { p_employee_id: c.req.param("id") });
  if (detail.error) rpcFail(detail.error);

  const appUserId = (detail.data as unknown as HrEmployeeDetail | null)?.appUserId ?? null;
  if (!appUserId) {
    return c.json(
      {
        error: "invalid_input",
        code: "no_login_to_disable",
        message:
          "This person signs in with a store PIN, not a portal login. " +
          "Deactivate them in the store's staff list instead.",
      },
      422,
    );
  }

  const result = await setAccountStatus(adminClient(c.env), {
    userId: appUserId,
    status: parsed.data.status,
    reason: parsed.data.reason,
    actorRole: c.var.auth.role,
    actorText: c.var.auth.email,
  });

  if (!result.ok) {
    if (result.code === "not_found") {
      return c.json({ error: "not_found", code: result.code, message: result.message }, 404);
    }
    if (result.code === "cannot_disable_principal") {
      return c.json(
        { error: "invalid_input", code: result.code, message: result.message },
        422,
      );
    }
    return c.json({ error: "rpc_failed", code: result.code, message: result.message }, 500);
  }

  return c.json({ ok: true, status: parsed.data.status });
});

export default hrPeopleRouter;
