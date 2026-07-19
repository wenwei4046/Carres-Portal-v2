import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  Adapters,
  DB,
  createStaffInputSchema,
  setStaffPinInputSchema,
  staffDtoSchema,
  staffListResponseSchema,
  staffReauthInputSchema,
  staffSessionResponseSchema,
  updateStaffInputSchema,
  verifyPinInputSchema,
  type StaffTierDto,
} from "@carres/shared";
import { adminClient, userClient } from "../lib/supabase";
import { getStaffContext, mintStaffToken } from "../lib/staff-token";
import type { AppEnv } from "../types";

/**
 * /api/staff — 0233 staff PIN login (Loo 2026-07-18).
 *
 * A store logs in once (email+password, unchanged). This surface adds the
 * per-person layer on top: a 6-digit PIN identifies WHO is at the POS, three
 * tiers ride on `salespersons.staff_role` (principal / manager / salesperson),
 * and every read/write carries a short-lived staff session token.
 *
 * Two caller shapes:
 *   - dealer / showroom / salesperson (the store login) — dealer scope from the
 *     JWT; their TIER comes from the staff token they PIN'd in with.
 *   - internal principal (Carres HQ) — passes `?dealerId=` and acts as
 *     principal-tier for that store (the Principal Accounts "Staff" drawer).
 *
 * PIN hashes never leave Postgres: only the service_role DEFINER fns
 * `staff_verify_pin` / `staff_set_pin` (and an EXISTS probe on the deny-all
 * ledger) reach `salesperson_pins`, via `adminClient`. Everything else is a
 * userClient read/write so RLS stays the dealer boundary.
 */
const staffRouter = new Hono<AppEnv>();

const STAFF_READ_ROLES = new Set<string>(["dealer", "showroom", "salesperson", "principal"]);
const DEALER_FAMILY_ROLES = new Set<string>(["dealer", "showroom", "salesperson"]);

// ---------------------------------------------------------------------------
// Shared resolvers
// ---------------------------------------------------------------------------

/**
 * The store this request targets + whether the caller is HQ acting on its
 * behalf. Dealer-family callers are pinned to their JWT dealer; an internal
 * principal names the store via `?dealerId=`.
 */
function resolveTargetDealer(c: Context<AppEnv>): { dealerId: string; internalPrincipal: boolean } {
  const auth = c.var.auth;
  if (DEALER_FAMILY_ROLES.has(auth.role)) {
    if (!auth.dealerId) throw new HTTPException(422, { message: "Caller has no dealer_id in JWT" });
    return { dealerId: auth.dealerId, internalPrincipal: false };
  }
  if (auth.role === "principal") {
    const q = new URL(c.req.url).searchParams.get("dealerId");
    if (!q || !z.string().uuid().safeParse(q).success) {
      throw new HTTPException(400, { message: "principal must pass a valid ?dealerId=" });
    }
    return { dealerId: q, internalPrincipal: true };
  }
  throw new HTTPException(403, { message: "Not permitted to manage staff" });
}

type MutationCaller = {
  dealerId: string;
  internalPrincipal: boolean;
  tier: StaffTierDto;
  oid: string | null;
  sid: string | null;
};

/**
 * Establish the caller's TIER for a management action. An internal principal is
 * principal-tier by role; a dealer-family caller derives tier from the staff
 * token they PIN'd (or reauth'd) in with — no token → 403 (they must identify
 * first). Salesperson-tier is caught per-route where its scope differs.
 */
async function resolveMutationCaller(c: Context<AppEnv>): Promise<MutationCaller> {
  const { dealerId, internalPrincipal } = resolveTargetDealer(c);
  if (internalPrincipal) {
    return { dealerId, internalPrincipal, tier: "principal", oid: null, sid: null };
  }
  const staff = await getStaffContext(c);
  if (!staff) {
    throw new HTTPException(403, { message: "Staff session required" });
  }
  return { dealerId, internalPrincipal, tier: staff.tier, oid: staff.oid, sid: staff.sid };
}

/** 'showroom' when the store's login role is showroom (they cap at manager). */
async function resolveStoreKind(
  c: Context<AppEnv>,
  dealerId: string,
  internalPrincipal: boolean,
): Promise<"dealer" | "showroom"> {
  if (!internalPrincipal) {
    return c.var.auth.role === "showroom" ? "showroom" : "dealer";
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data } = await sb
    .from("app_users")
    .select("role")
    .eq("dealer_id", dealerId)
    .eq("role", "showroom")
    .limit(1);
  return (data?.length ?? 0) > 0 ? "showroom" : "dealer";
}

function toStaffDto(row: DB.SalespersonRow, hasPin: boolean) {
  return staffDtoSchema.parse({ ...Adapters.salespersonFromRow(row), hasPin });
}

// ---------------------------------------------------------------------------
// GET / — staff roster + activation + self link + store kind
// ---------------------------------------------------------------------------
staffRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (!STAFF_READ_ROLES.has(auth.role)) {
    throw new HTTPException(403, { message: "Not permitted to view staff" });
  }
  const { dealerId, internalPrincipal } = resolveTargetDealer(c);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("salespersons")
    .select("*")
    .eq("dealer_id", dealerId)
    .order("name");
  if (error) throw new HTTPException(500, { message: error.message });
  const rows = (data ?? []) as DB.SalespersonRow[];

  // hasPin: a single service_role IN-probe on the deny-all ledger (booleans
  // only — the hash never leaves Postgres). Empty roster → skip the probe.
  const withPin = new Set<string>();
  if (rows.length > 0) {
    const admin = adminClient(c.env);
    const { data: pinRows, error: pinErr } = await admin
      .from("salesperson_pins")
      .select("salesperson_id")
      .in("salesperson_id", rows.map((r) => r.id));
    if (pinErr) throw new HTTPException(500, { message: pinErr.message });
    for (const p of (pinRows ?? []) as Array<{ salesperson_id: string }>) {
      withPin.add(p.salesperson_id);
    }
  }

  const staff = rows.map((r) => toStaffDto(r, withPin.has(r.id)));
  const selfStaffId = rows.find((r) => r.user_id === auth.id)?.id ?? null;
  const storeKind = await resolveStoreKind(c, dealerId, internalPrincipal);

  return c.json(
    staffListResponseSchema.parse({
      staff,
      // Activated once ANY staff of this store has a PIN — flips the login gate.
      activated: withPin.size > 0,
      selfStaffId,
      storeKind,
    }),
  );
});

// ---------------------------------------------------------------------------
// POST /verify-pin — tap-a-tile PIN → staff session token
// ---------------------------------------------------------------------------
staffRouter.post("/verify-pin", async (c) => {
  const auth = c.var.auth;
  if (!DEALER_FAMILY_ROLES.has(auth.role)) {
    throw new HTTPException(403, { message: "Only a store login can verify a PIN" });
  }
  if (!auth.dealerId) throw new HTTPException(422, { message: "Caller has no dealer_id in JWT" });

  const parsed = verifyPinInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid body" },
      422,
    );
  }
  const { salespersonId, pin } = parsed.data;

  // Dealer-scope the target FIRST via RLS — a salespersonId outside the caller's
  // store is invisible (404), so the service_role verify fn is never asked about
  // another dealer's PIN.
  const sb = userClient(c.env, auth.jwt);
  const { data: row, error } = await sb
    .from("salespersons")
    .select("*")
    .eq("id", salespersonId)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!row || (row as DB.SalespersonRow).dealer_id !== auth.dealerId) {
    throw new HTTPException(404, { message: "Staff not found" });
  }
  const sp = row as DB.SalespersonRow;

  const admin = adminClient(c.env);
  const { data: result, error: rpcErr } = await admin.rpc("staff_verify_pin", {
    p_salesperson_id: salespersonId,
    p_pin: pin,
  });
  if (rpcErr) throw new HTTPException(500, { message: rpcErr.message });
  const status = (result as { status?: string } | null)?.status;

  if (status === "ok") {
    const token = await mintStaffToken(c.env, {
      sid: sp.id,
      did: auth.dealerId,
      oid: sp.outlet_id,
      tier: sp.staff_role,
    });
    return c.json(
      staffSessionResponseSchema.parse({
        token,
        staff: toStaffDto(sp, true),
        tier: sp.staff_role,
        outletId: sp.outlet_id,
      }),
    );
  }
  if (status === "bad_pin") {
    return c.json({ error: "bad_pin", remaining: (result as { remaining?: number }).remaining ?? 0 }, 401);
  }
  if (status === "locked") {
    return c.json({ error: "pin_locked", lockedUntil: (result as { locked_until?: string }).locked_until ?? null }, 423);
  }
  // no_pin (also covers inactive staff — the fn returns no_pin for those).
  return c.json({ error: "no_pin" }, 409);
});

// ---------------------------------------------------------------------------
// POST /reauth — re-prove the store password → owner-mode token
// (setup wizard + "Forgot PIN"). dealer → principal tier, showroom → manager.
// ---------------------------------------------------------------------------
staffRouter.post("/reauth", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "dealer" && auth.role !== "showroom") {
    throw new HTTPException(403, { message: "Only a store owner login can re-auth" });
  }
  if (!auth.dealerId) throw new HTTPException(422, { message: "Caller has no dealer_id in JWT" });

  const parsed = staffReauthInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid body" },
      422,
    );
  }

  // Server-side password grant against GoTrue with the caller's own email. The
  // anon key is the apikey; the user JWT is NOT forwarded (this re-proves the
  // password, it does not act as the user).
  let grantOk = false;
  try {
    const res = await fetch(`${c.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: c.env.SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: auth.email, password: parsed.data.password }),
    });
    grantOk = res.ok;
  } catch {
    throw new HTTPException(502, { message: "Auth service unreachable" });
  }
  if (!grantOk) {
    return c.json({ error: "bad_password" }, 401);
  }

  // Owner-mode = the PASSWORD-proven store authority. Deliberately NOT bound
  // to any legacy salespersons.user_id link — a linked row must never
  // downgrade (or outlet-bind) the store credential (the prod showroom login
  // carries exactly such a salesperson-tier link). sid stays null; the wizard
  // / Settings decide which staff identity to create or claim.
  const ownerTier: StaffTierDto = auth.role === "showroom" ? "manager" : "principal";
  const token = await mintStaffToken(c.env, {
    sid: null,
    did: auth.dealerId,
    oid: null,
    tier: ownerTier,
  });
  return c.json(
    staffSessionResponseSchema.parse({ token, staff: null, tier: ownerTier, outletId: null }),
  );
});

// ---------------------------------------------------------------------------
// POST /self-token — salesperson-role login → token from its linked row
// ---------------------------------------------------------------------------
staffRouter.post("/self-token", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "salesperson") {
    throw new HTTPException(403, { message: "self-token is for salesperson logins" });
  }
  if (!auth.dealerId) throw new HTTPException(422, { message: "Caller has no dealer_id in JWT" });

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("salespersons")
    .select("*")
    .eq("user_id", auth.id)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) {
    return c.json({ error: "unlinked" }, 409);
  }
  const sp = data as DB.SalespersonRow;
  const token = await mintStaffToken(c.env, {
    sid: sp.id,
    did: auth.dealerId,
    oid: sp.outlet_id,
    tier: sp.staff_role,
  });
  return c.json(
    staffSessionResponseSchema.parse({
      token,
      staff: toStaffDto(sp, false),
      tier: sp.staff_role,
      outletId: sp.outlet_id,
    }),
  );
});

// ---------------------------------------------------------------------------
// POST / — create a staff member (tier-gated)
// ---------------------------------------------------------------------------
staffRouter.post("/", async (c) => {
  const caller = await resolveMutationCaller(c);
  if (caller.tier === "salesperson") {
    throw new HTTPException(403, { message: "Salespersons cannot create staff" });
  }

  const parsed = createStaffInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid body" },
      422,
    );
  }
  const input = parsed.data;

  // Tier authority.
  let outletId: string | null = input.outletId ?? null;
  if (caller.tier === "manager") {
    // sid === null ⇔ owner-mode: the password-proven store credential minted
    // by /reauth (showroom bootstrap + forgot-PIN recovery). It acts as the
    // store's admin — may create managers too, never a store principal.
    if (caller.sid === null) {
      if (input.staffRole === "principal") {
        throw new HTTPException(403, { message: "Showroom stores cannot have a store principal" });
      }
    } else {
      if (input.staffRole !== "salesperson") {
        throw new HTTPException(403, { message: "Managers can only create salespersons" });
      }
      // A manager's staff always land in the manager's own outlet.
      outletId = caller.oid;
    }
  } else {
    // principal-tier — showrooms have no store-principal (Carres is theirs).
    if (input.staffRole === "principal") {
      const storeKind = await resolveStoreKind(c, caller.dealerId, caller.internalPrincipal);
      if (storeKind === "showroom") {
        throw new HTTPException(403, { message: "Showroom stores cannot have a store principal" });
      }
    }
  }

  const sb = userClient(c.env, c.var.auth.jwt);

  // An outlet reference must belong to THIS store — the bare FK would accept
  // any dealer's outlet.
  if (outletId) {
    const { data: outletRow, error: outletErr } = await sb
      .from("outlets")
      .select("id, dealer_id")
      .eq("id", outletId)
      .maybeSingle();
    if (outletErr) throw new HTTPException(500, { message: outletErr.message });
    if (!outletRow || (outletRow as { dealer_id: string }).dealer_id !== caller.dealerId) {
      throw new HTTPException(422, { message: "Outlet does not belong to this store" });
    }
  }

  const { data, error } = await sb
    .from("salespersons")
    .insert({
      dealer_id: caller.dealerId,
      outlet_id: outletId,
      name: input.name,
      phone: input.phone ?? null,
      staff_role: input.staffRole,
      color: input.color ?? null,
      active: true,
      // 0241 profile fields.
      email: input.email ?? null,
      birthday: input.birthday ?? null,
      gender: input.gender ?? null,
    })
    .select("*")
    .single();
  if (error) throw new HTTPException(500, { message: error.message });
  const sp = data as DB.SalespersonRow;

  // Optional initial PIN via the service_role DEFINER setter.
  if (input.pin) {
    const admin = adminClient(c.env);
    const { error: pinErr } = await admin.rpc("staff_set_pin", { p_salesperson_id: sp.id, p_pin: input.pin });
    if (pinErr) throw new HTTPException(500, { message: pinErr.message });
  }

  return c.json(toStaffDto(sp, !!input.pin), 201);
});

// ---------------------------------------------------------------------------
// PATCH /:id — edit a staff member (tier-gated fields)
// ---------------------------------------------------------------------------
staffRouter.patch("/:id", async (c) => {
  const caller = await resolveMutationCaller(c);
  if (caller.tier === "salesperson") {
    throw new HTTPException(403, { message: "Salespersons cannot edit staff" });
  }
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    throw new HTTPException(422, { message: "invalid uuid" });
  }

  const parsed = updateStaffInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid body" },
      422,
    );
  }
  const patch = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data: existing, error: findErr } = await sb
    .from("salespersons")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (findErr) throw new HTTPException(500, { message: findErr.message });
  if (!existing || (existing as DB.SalespersonRow).dealer_id !== caller.dealerId) {
    throw new HTTPException(404, { message: "Staff not found" });
  }
  const target = existing as DB.SalespersonRow;

  if (caller.tier === "manager") {
    // Managers touch only name/color/active. Tier + outlet moves are
    // principal-only (for showrooms that means the Carres principal).
    if (patch.staffRole !== undefined || patch.outletId !== undefined) {
      throw new HTTPException(403, { message: "Only a principal can change tier or outlet" });
    }
    // Real managers reach only their own outlet's salespersons; owner-mode
    // (sid null, password-proven via /reauth) reaches the whole store.
    if (
      caller.sid !== null &&
      (target.staff_role !== "salesperson" || target.outlet_id !== caller.oid)
    ) {
      throw new HTTPException(403, { message: "Managers can only edit their own outlet's salespersons" });
    }
  }

  // An outlet move must stay inside THIS store (same guard as create).
  if (caller.tier === "principal" && patch.outletId) {
    const { data: outletRow, error: outletErr } = await sb
      .from("outlets")
      .select("id, dealer_id")
      .eq("id", patch.outletId)
      .maybeSingle();
    if (outletErr) throw new HTTPException(500, { message: outletErr.message });
    if (!outletRow || (outletRow as { dealer_id: string }).dealer_id !== caller.dealerId) {
      throw new HTTPException(422, { message: "Outlet does not belong to this store" });
    }
  }

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.color !== undefined) update.color = patch.color;
  if (patch.active !== undefined) update.active = patch.active;
  // 0241 profile fields — same edit scope as name/color.
  if (patch.email !== undefined) update.email = patch.email;
  if (patch.birthday !== undefined) update.birthday = patch.birthday;
  if (patch.gender !== undefined) update.gender = patch.gender;
  if (caller.tier === "principal") {
    if (patch.staffRole !== undefined) update.staff_role = patch.staffRole;
    if (patch.outletId !== undefined) update.outlet_id = patch.outletId;
  }

  const { data, error } = await sb
    .from("salespersons")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new HTTPException(500, { message: error.message });
  const sp = data as DB.SalespersonRow;

  // hasPin for the response DTO.
  const admin = adminClient(c.env);
  const { data: pinRow } = await admin
    .from("salesperson_pins")
    .select("salesperson_id")
    .eq("salesperson_id", id)
    .maybeSingle();
  return c.json(toStaffDto(sp, !!pinRow));
});

// ---------------------------------------------------------------------------
// POST /:id/pin — set / reset a staff PIN (tier-scoped)
// ---------------------------------------------------------------------------
staffRouter.post("/:id/pin", async (c) => {
  const caller = await resolveMutationCaller(c);
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    throw new HTTPException(422, { message: "invalid uuid" });
  }

  const parsed = setStaffPinInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid body" },
      422,
    );
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data: existing, error: findErr } = await sb
    .from("salespersons")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (findErr) throw new HTTPException(500, { message: findErr.message });
  if (!existing || (existing as DB.SalespersonRow).dealer_id !== caller.dealerId) {
    throw new HTTPException(404, { message: "Staff not found" });
  }
  const target = existing as DB.SalespersonRow;

  // Scope: principal → anyone; manager → own-outlet salespersons + self
  // (owner-mode manager, sid null from /reauth, reaches the whole store —
  // that's the showroom forgot-PIN recovery path); salesperson → self only.
  const isSelf = caller.sid !== null && caller.sid === target.id;
  if (caller.tier === "manager") {
    const ownOutletSalesperson =
      target.staff_role === "salesperson" && target.outlet_id === caller.oid;
    if (caller.sid !== null && !ownOutletSalesperson && !isSelf) {
      throw new HTTPException(403, { message: "Managers can only set their own outlet's PINs" });
    }
  } else if (caller.tier === "salesperson") {
    if (!isSelf) throw new HTTPException(403, { message: "Salespersons can only set their own PIN" });
  }

  const admin = adminClient(c.env);
  const { error } = await admin.rpc("staff_set_pin", { p_salesperson_id: id, p_pin: parsed.data.pin });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ id, ok: true });
});

export default staffRouter;
