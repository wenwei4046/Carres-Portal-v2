import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { deliveryDayRefusal } from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { readDeliveryCalendar } from "../../lib/delivery-calendar";
import { deliveryOrderLookup } from "../../lib/delivery-order-lookup";
import { fail, parseBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Delivery Planning, DP Orders, Auto-schedule and Trips — migration 0723.
 *
 * Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp 2026-10-22): office
 * staff plan delivery dates and trips with a time slot per stop, the Houzs way.
 * This overturns Jess's Delivery MASTER §8 / §14.3 / §15 rules (no Trips,
 * Regions or Schedule destination, no automatic allocation, no ordered stops);
 * Jess was not part of this decision.
 *
 * The plan rides the existing arrangement row (0386, one per order + leg): no
 * second trip table. Every write is one SECURITY DEFINER door; this router reads
 * and passes through. Holidays are checked here because the calendar lives here.
 */
const router = new Hono<AppEnv>();
const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a delivery date");
const leg = z.number().int().min(0).max(20).default(0);
const text = (max: number) => z.string().trim().max(max).nullish();

/** Everything the four pages read, in one round trip. */
router.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const [orders, regions, rules, companies, cancelled] = await Promise.all([
    sb
      .from("orders")
      .select(
        "id, so, customer_name, customer_address, customer_address_line1, customer_address_city, customer_address_state, customer_address_postcode, delivery_date, delivery_date_tbd, entry_data",
      )
      .in("status", ["place", "proceed_order"])
      .order("delivery_date", { ascending: true, nullsFirst: false })
      .limit(2000),
    sb.from("delivery_regions").select("state, region, per_day").order("region").order("state"),
    sb.from("delivery_residence_rules").select("building_type, note").order("building_type"),
    sb.from("delivery_partners").select("id, name").order("name"),
    sb
      .from("ops_delivery_arrangement_events")
      .select("id, order_id, leg, note, recorded_at, from_partner_id")
      .eq("event", "job_cancelled")
      .order("recorded_at", { ascending: false })
      .limit(500),
  ]);
  for (const r of [orders, regions, rules, companies, cancelled]) if (r.error) return fail(c, r.error);
  const ids = (orders.data ?? []).map((o) => o.id as string);
  const cancelledIds = [...new Set((cancelled.data ?? []).map((e) => e.order_id as string))];
  const scopeIds = [...new Set([...ids, ...cancelledIds])];
  // ponytail: one `in (...)` per 200 ids; an RPC if open orders ever pass a few thousand.
  const arrangements: Record<string, unknown>[] = [];
  const dos: Record<string, unknown>[] = [];
  const soOf: Record<string, unknown>[] = [];
  for (let i = 0; i < scopeIds.length; i += 200) {
    const slice = scopeIds.slice(i, i + 200);
    const [a, d, s] = await Promise.all([
      sb
        .from("ops_delivery_arrangements")
        .select("order_id, leg, partner_id, confirmed_date, confirmed_time, planned_date, stop_seq, time_slot, vehicle")
        .in("order_id", slice),
      sb
        .from("ops_delivery_orders")
        .select("order_id, leg, do_number, issued_at")
        .in("order_id", slice)
        .is("voided_at", null)
        .order("issued_at", { ascending: false }),
      sb.from("orders").select("id, so, customer_name").in("id", slice.filter((x) => !ids.includes(x))),
    ]);
    for (const r of [a, d, s]) if (r.error) return fail(c, r.error);
    arrangements.push(...(a.data ?? []));
    dos.push(...(d.data ?? []));
    soOf.push(...(s.data ?? []));
  }
  return c.json({
    orders: orders.data ?? [],
    closedOrders: soOf,
    arrangements,
    deliveryOrders: dos,
    regions: regions.data ?? [],
    residenceRules: rules.data ?? [],
    companies: companies.data ?? [],
    cancelled: cancelled.data ?? [],
  });
});

async function refuseHoliday(c: Context<AppEnv>, date: string) {
  const { calendar } = await readDeliveryCalendar(userClient(c.env, c.var.auth.jwt));
  const refusal = deliveryDayRefusal(calendar, date);
  if (refusal === "sunday") throw new HTTPException(400, { message: "Sunday is not a delivery day" });
  if (refusal === "holiday") throw new HTTPException(400, { message: "A Malaysian public holiday is not a delivery day" });
}

const planSchema = z.object({
  date: isoDate,
  partnerId: uuid.nullish(),
  vehicle: text(60),
  timeSlot: text(60),
});

async function planDate(
  c: Context<AppEnv>,
  orderId: string,
  legNo: number,
  body: z.infer<typeof planSchema>,
) {
  await refuseHoliday(c, body.date);
  return userClient(c.env, c.var.auth.jwt).rpc("delivery_plan_date", {
    p_order_id: orderId,
    p_leg: legNo,
    p_date: body.date,
    p_partner_id: body.partnerId ?? null,
    p_vehicle: body.vehicle ?? null,
    p_time_slot: body.timeSlot ?? null,
  });
}

/** Auto-schedule's confirm, and Delivery Planning's own date: one order + leg. */
router.post("/date", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, planSchema.extend({ orderId: uuid, leg }));
  const { data, error } = await planDate(c, body.orderId, body.leg, body);
  if (error) return fail(c, error);
  return c.json(data);
});

/** DP Orders: a delivery job against a Delivery Order. */
router.post("/jobs", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, planSchema.extend({ doNumber: z.string().trim().min(1, "Write the DO No").max(40) }));
  const look = deliveryOrderLookup(body.doNumber);
  const { data: doc, error } = await userClient(c.env, c.var.auth.jwt)
    .from("ops_delivery_orders")
    .select("order_id, leg")
    .eq(look.column, look.value)
    .is("voided_at", null)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return fail(c, error);
  if (!doc) return c.json({ error: "not_found", message: `${body.doNumber} is not a Delivery Order` }, 404);
  const res = await planDate(c, doc.order_id as string, Number(doc.leg ?? 0), body);
  if (res.error) return fail(c, res.error);
  return c.json(res.data, 201);
});

/** Trips: a stop's place and time slot. */
router.post("/stop", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(
    c,
    z.object({ orderId: uuid, leg, seq: z.number().int().min(1).max(999), timeSlot: z.string().trim().min(1, "Every stop needs a time slot").max(60) }),
  );
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("delivery_plan_stop", {
    p_order_id: body.orderId,
    p_leg: body.leg,
    p_seq: body.seq,
    p_time_slot: body.timeSlot,
  });
  if (error) return fail(c, error);
  return c.json(data);
});

/** DP Orders / Trips: cancel a delivery job, with a reason. */
router.post("/cancel", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, z.object({ orderId: uuid, leg, reason: z.string().trim().min(1, "Write the reason").max(500) }));
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("delivery_plan_cancel", {
    p_order_id: body.orderId,
    p_leg: body.leg,
    p_reason: body.reason,
  });
  if (error) return fail(c, error);
  return c.json(data);
});

/** Regions: add or change one state's region and deliveries a day. */
router.put("/regions", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(
    c,
    z.object({
      state: z.string().trim().min(1, "Write the state").max(60),
      region: z.string().trim().min(1, "Write the region").max(60),
      perDay: z.number().int().min(1).max(500),
    }),
  );
  const { error } = await userClient(c.env, c.var.auth.jwt)
    .from("delivery_regions")
    .upsert({ state: body.state, region: body.region, per_day: body.perDay, updated_by: c.var.auth.id, updated_at: new Date().toISOString() });
  if (error) return fail(c, error);
  return c.json({ ok: true });
});

router.put("/residence-rules", requireOperationOrPrincipal, async (c) => {
  const body = await parseBody(c, z.object({ buildingType: z.string().trim().min(1).max(40), note: z.string().trim().max(500) }));
  const { error } = await userClient(c.env, c.var.auth.jwt)
    .from("delivery_residence_rules")
    .upsert({ building_type: body.buildingType, note: body.note, updated_by: c.var.auth.id, updated_at: new Date().toISOString() });
  if (error) return fail(c, error);
  return c.json({ ok: true });
});

export default router;
