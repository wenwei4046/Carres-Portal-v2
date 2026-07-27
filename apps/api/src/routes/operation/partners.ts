import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { setPartnerDeliveryRulesInput } from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/operation/partners
 *
 * Lightweight list of delivery partners — used by `DispatchModal` (M5 Task 2,
 * §18.3 spec) to populate the "Assign delivery partner" dropdown. Surfaces
 * `id`, `name`, `contact`, `zones` only (no rate cards, no fleet); the modal
 * shows partner name + zones in the option label and contact in the preview
 * panel beneath.
 *
 * Auth: operation-only via inline guard (mirrors orders.ts pattern). RLS
 * `partners_read` already lets HQ roles SELECT (0002_rls.sql:157), so the
 * user JWT is enough — no service_role.
 */
const operationPartnersRouter = new Hono<AppEnv>();

operationPartnersRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "operation only" });
  }
  await next();
});

operationPartnersRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("delivery_partners")
    // T9 (0283) — the carrier's own delivery rules ride the list every consumer
    // already fetches, so the drawer can show them without a second round trip.
    .select(
      "id, name, contact, zones, whatsapp_group_url, off_days, blackout_dates, daily_capacity, booking_lead_days",
    )
    .order("name", { ascending: true });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ partners: data ?? [] });
});

/**
 * PUT /api/operation/partners/:id/delivery-rules — T9 (migration 0283).
 *
 * The four facts a carrier states about itself: which weekdays it runs, the
 * dates it is not running at all, how many drops it takes in a day, and how
 * much notice it needs. They drive a WARNING on the booking confirm flow; they
 * never block one.
 *
 * The write goes through `set_partner_delivery_rules` (SECURITY DEFINER), not
 * a table UPDATE: `partners_principal_write` (0002) is principal-only, and
 * operation is exactly who maintains these rules — but an UPDATE policy cannot
 * be narrowed to four columns, so widening it would also hand out the partner's
 * name, contact and rate card. The RPC names the four columns and audits the
 * change (a delivery promise is made against these rules; changing them must
 * not be silent).
 *
 * The whole profile is sent every time — a partial patch would make "cleared
 * the blackout dates" and "did not mention them" the same request.
 */
operationPartnersRouter.put("/:id/delivery-rules", async (c) => {
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new HTTPException(404, { message: "Logistic partner not found" });
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = setPartnerDeliveryRulesInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid delivery rules at ${path}: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }
  // A partner that rests every day of the week is not a partner with a profile —
  // it is a partner to stop assigning. The DB CHECK says the same thing; this
  // says it in words the operator can act on.
  const offDays = Array.from(new Set(parsed.data.offDays)).sort();
  if (offDays.length >= 7) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: "A carrier must run on at least one day of the week",
      },
      422,
    );
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("set_partner_delivery_rules", {
    p_partner_id: id,
    p_off_days: offDays,
    p_blackout_dates: Array.from(new Set(parsed.data.blackoutDates)).sort(),
    p_daily_capacity: parsed.data.dailyCapacity,
    p_booking_lead_days: parsed.data.bookingLeadDays,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  const { data, error: readErr } = await sb
    .from("delivery_partners")
    .select(
      "id, name, contact, zones, whatsapp_group_url, off_days, blackout_dates, daily_capacity, booking_lead_days",
    )
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    const m = mapPgError(readErr);
    return c.json(m.body, m.status);
  }
  if (!data) throw new HTTPException(404, { message: "Logistic partner not found" });
  return c.json({ partner: data });
});

export default operationPartnersRouter;
