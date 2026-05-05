import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createLpAccountSchema } from "@carres/shared";
import { adminClient, userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/principal/partners — Phase 4.5 Chunk 1 (Task 19).
 *
 * POST / — Atomically create a Logistics Partner (LP) account.
 *
 * Three-step write (service_role required because step 2 calls
 * `auth.admin.createUser` which only works with the service-role key):
 *   1. INSERT delivery_partners (companyName, contactNumber+address)
 *   2. auth.admin.createUser(email derived from partner_id, password, email_confirm=true)
 *   3. INSERT app_users { id=auth.user.id, role='partner', partner_id=(1).id, name }
 *
 * Rollback strategy on each failure (best-effort — no DB transaction available
 * across auth + table writes):
 *   - step 2 fails → DELETE delivery_partners (1)
 *   - step 3 fails → DELETE auth.user (2) + DELETE delivery_partners (1)
 *
 * Address handling: `delivery_partners.address` is a dedicated nullable
 * column added in migration 0048 (closes carry-forward
 * `phase-4.5-chunk-1-lp-address-column`). The pre-0048 hack of folding
 * `${contactNumber} · ${address}` into `contact` was retired with that
 * migration's idempotent backfill, which split any concat'd rows back apart.
 *
 * RED LINE: this is one of the few routes that uses `adminClient` (service_role).
 * Per CLAUDE.md §4.4, the service-role key never touches the user JWT path —
 * we never forward the caller's JWT to the admin client.
 */
const principalPartnersRouter = new Hono<AppEnv>();

// Inline principal-only guard (matches dealers.ts pattern, fast 403).
principalPartnersRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "principal") {
    throw new HTTPException(403, { message: "Only principal can create LP accounts" });
  }
  await next();
});

principalPartnersRouter.post("/", async (c) => {
  // Parse + validate body. zod failures → 422 with stable error contract.
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const parsed = createLpAccountSchema.safeParse(raw);
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
  const body = parsed.data;

  const sb = adminClient(c.env);
  const auth = c.var.auth;

  // Step 1: insert delivery_partners row. Migration 0048 split phone +
  // address into separate columns; both go into the row directly.
  const dpInsert = await sb
    .from("delivery_partners")
    .insert({
      name: body.companyName,
      contact: body.contactNumber,
      address: body.address,
    })
    .select()
    .single();

  if (dpInsert.error || !dpInsert.data) {
    return c.json(
      {
        error: "rpc_failed",
        code: "delivery_partners_insert_failed",
        message: dpInsert.error?.message ?? "delivery_partners insert failed",
      },
      500,
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partnerId = (dpInsert.data as any).id as string;
  const email = `lp-${partnerId.slice(0, 8)}@carres.local`;

  // Step 2: create auth.users via service_role admin API.
  const userResult = await sb.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
  });

  if (userResult.error || !userResult.data?.user) {
    // Rollback: best-effort delete delivery_partners row.
    await sb.from("delivery_partners").delete().eq("id", partnerId);
    return c.json(
      {
        error: "rpc_failed",
        code: "auth_user_create_failed",
        message: userResult.error?.message ?? "auth.admin.createUser failed",
      },
      500,
    );
  }
  const authUserId = userResult.data.user.id;

  // Step 3: insert app_users row linking auth.user → partner_id with role='partner'.
  // CHECK constraint app_users_partner_id_iff_role_partner (migration 0041)
  // enforces partner_id NOT NULL when role='partner'.
  const appUserInsert = await sb.from("app_users").insert({
    id: authUserId,
    email,
    name: body.companyName,
    role: "partner",
    partner_id: partnerId,
  });

  if (appUserInsert.error) {
    // Rollback: delete auth.user + delivery_partners.
    await sb.auth.admin.deleteUser(authUserId);
    await sb.from("delivery_partners").delete().eq("id", partnerId);
    return c.json(
      {
        error: "rpc_failed",
        code: "app_users_insert_failed",
        message: appUserInsert.error.message,
      },
      500,
    );
  }

  // Audit log entry — non-blocking (success even if audit insert fails).
  await sb.from("audit_log").insert({
    role: "principal",
    actor_text: auth.email || "principal",
    action: `Created LP account ${body.companyName} (partner_id=${partnerId})`,
    ref: partnerId,
  });

  return c.json({ partner_id: partnerId, auth_user_id: authUserId, email }, 201);
});

/**
 * GET / — list LP accounts.
 *
 * Read path uses `userClient` (forwards caller JWT) so RLS on
 * `delivery_partners` applies. Schema (post-0048): id, name, contact,
 * address, zones, onboarded_date, rate_card. The `address` column is
 * nullable — legacy rows pre-Task-19 may not have one.
 */
principalPartnersRouter.get("/", async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("delivery_partners")
    .select("id,name,contact,address,zones,onboarded_date,rate_card");

  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

export default principalPartnersRouter;
