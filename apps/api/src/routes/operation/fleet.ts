import { Hono } from "hono";
import {
  deliveryZoneInput, fleetCrewConfirmInput, fleetCrewLeaveInput, fleetHealthInput, fleetPositionInput, rateCardInput,
} from "@carres/shared/fleet";
import { requireOperation } from "../../lib/auth-guards";
import { fail, parseJsonBody } from "../../lib/route-helpers";
import { requireSettingsEditor } from "../../lib/settings-editor";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/fleet — Carres' own lorries (migration 0724).
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): Fleet Day crew planning,
 * run sheets, Live Map, Lorry Capacity and Crew Leave, the Houzs way. Jess was
 * not part of this decision.
 *
 *   GET    /?from=&to=   the own-fleet company, its lorries and crew (Settings →
 *                        Logistics Vehicles and Drivers), crew leave, confirmed
 *                        crew (60 days back for proposals), stops, last positions
 *   POST   /crew         confirm one lorry's crew for a day (fleet_confirm_crew)
 *   POST   /leave        record crew leave
 *   DELETE /leave/:id    remove a leave row recorded by mistake
 *   POST   /positions    a tracker or driver app posts where a lorry is
 *   (0725) POST /health  a lorry's PUSPAKOM, road tax, insurance, service dates
 *   GET    /pricing      Logistics companies, Delivery Zones and Rate Cards
 *   POST   /zones · DELETE /zones/:id   a zone and its postcode ranges
 *   POST   /rates · DELETE /rates/:id   a company's rate card for a zone
 *   Zones and rates are Delivery settings: the people named for them write.
 *
 * Every rule lives in the SQL door and row security; the caller's own token
 * reaches them.
 */
const router = new Hono<AppEnv>();
router.use("*", requireOperation);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

router.get("/", async (c) => {
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? from;
  if (!DAY.test(from) || !DAY.test(to) || to < from) {
    return c.json({ error: "invalid_input", code: "invalid_param", message: "from and to are dates" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const companyR = await sb.from("delivery_partners").select("id, name").eq("own_fleet", true).maybeSingle();
  if (companyR.error) return fail(c, companyR.error);
  const company = companyR.data as { id: string; name: string } | null;
  if (!company) return c.json({ company: null, lorries: [], crew: [], leave: [], crewDays: [], stops: [], positions: [] });

  const [lorriesR, crewR, leaveR, daysR, stopsR, posR] = await Promise.all([
    sb.from("partner_fleet").select("id, plate, vehicle_type, capacity, driver_name, driver_phone, active, puspakom_due, road_tax_due, insurance_due, service_due").eq("partner_id", company.id).order("plate"),
    sb.from("partner_drivers").select("id, name, phone, role, active").eq("partner_id", company.id).order("name"),
    sb.from("fleet_crew_leave").select("id, crew_id, from_date, to_date, reason").gte("to_date", shift(from, -60)).order("from_date", { ascending: false }),
    sb.from("fleet_day_crew").select("day, vehicle_id, driver_id, helper_id").gte("day", shift(from, -60)).lte("day", to),
    sb.rpc("fleet_stops", { p_from: from, p_to: to }),
    sb.rpc("fleet_last_positions"),
  ]);
  for (const r of [lorriesR, crewR, leaveR, daysR, stopsR, posR]) if (r.error) return fail(c, r.error);
  type Row = Record<string, unknown>;
  const rows = (r: { data: unknown }) => (r.data ?? []) as Row[];
  return c.json({
    company,
    lorries: rows(lorriesR).map((r) => ({
      id: r.id, plate: r.plate, vehicleType: r.vehicle_type, capacity: r.capacity ?? null,
      templateDriverName: r.driver_name ?? null, templateDriverPhone: r.driver_phone ?? null, active: r.active !== false,
      puspakomDue: r.puspakom_due ?? null, roadTaxDue: r.road_tax_due ?? null,
      insuranceDue: r.insurance_due ?? null, serviceDue: r.service_due ?? null,
    })),
    crew: rows(crewR).map((r) => ({ id: r.id, name: r.name, phone: r.phone ?? null, role: r.role ?? "driver", active: r.active !== false })),
    leave: rows(leaveR).map((r) => ({ id: r.id, crewId: r.crew_id, fromDate: r.from_date, toDate: r.to_date, reason: r.reason })),
    crewDays: rows(daysR).map((r) => ({ day: r.day, vehicleId: r.vehicle_id, driverId: r.driver_id ?? null, helperId: r.helper_id ?? null })),
    stops: rows(stopsR).map((r) => ({
      day: r.day, vehicleId: r.vehicle_id ?? null, plate: r.plate ?? null, orderId: r.order_id, leg: Number(r.leg ?? 0),
      so: r.so ?? null, customerName: r.customer_name, customerPhone: r.customer_phone ?? null,
      customerAddress: r.customer_address ?? null, confirmedTime: r.confirmed_time ?? null,
      expectedArrival: r.expected_arrival ? String(r.expected_arrival).slice(0, 5) : null, revenue: Number(r.revenue ?? 0),
    })),
    positions: rows(posR).map((r) => ({
      vehicleId: r.vehicle_id, lat: Number(r.lat), lng: Number(r.lng), recordedAt: r.recorded_at, source: r.source,
    })),
  });
});

router.post("/crew", async (c) => {
  const body = await parseJsonBody(c, fleetCrewConfirmInput);
  if (!body.ok) return c.json(body.body, body.status);
  const d = body.data;
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("fleet_confirm_crew", {
    p_day: d.day, p_vehicle_id: d.vehicleId, p_driver_id: d.driverId, p_helper_id: d.helperId,
  });
  if (error) return fail(c, error);
  return c.json(data);
});

router.post("/leave", async (c) => {
  const body = await parseJsonBody(c, fleetCrewLeaveInput);
  if (!body.ok) return c.json(body.body, body.status);
  const d = body.data;
  const { data, error } = await userClient(c.env, c.var.auth.jwt)
    .from("fleet_crew_leave")
    .insert({ crew_id: d.crewId, from_date: d.fromDate, to_date: d.toDate, reason: d.reason })
    .select("id")
    .single();
  if (error) return fail(c, error);
  return c.json(data, 201);
});

router.delete("/leave/:id", async (c) => {
  const { error } = await userClient(c.env, c.var.auth.jwt).from("fleet_crew_leave").delete().eq("id", c.req.param("id"));
  if (error) return fail(c, error);
  return c.json({ ok: true });
});

router.post("/positions", async (c) => {
  const body = await parseJsonBody(c, fleetPositionInput);
  if (!body.ok) return c.json(body.body, body.status);
  const d = body.data;
  const { error } = await userClient(c.env, c.var.auth.jwt).from("fleet_lorry_positions").insert({
    vehicle_id: d.vehicleId, lat: d.lat, lng: d.lng, source: d.source,
    ...(d.recordedAt ? { recorded_at: d.recordedAt } : {}),
  });
  if (error) return fail(c, error);
  return c.json({ ok: true }, 201);
});

/* ── 0725 · Fleet Health, Delivery Zones, Rate Cards (Weisiang's decision
   2026-10-22, Houzs way; Jess was not part of this decision) ── */

router.post("/health", async (c) => {
  const body = await parseJsonBody(c, fleetHealthInput);
  if (!body.ok) return c.json(body.body, body.status);
  const d = body.data;
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("fleet_save_lorry_health", {
    p_vehicle_id: d.vehicleId, p_puspakom: d.puspakomDue, p_road_tax: d.roadTaxDue,
    p_insurance: d.insuranceDue, p_service: d.serviceDue,
  });
  if (error) return fail(c, error);
  return c.json(data);
});

router.get("/pricing", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const [partnersR, zonesR, ratesR] = await Promise.all([
    sb.from("delivery_partners").select("id, name, own_fleet, active").order("name"),
    sb.from("delivery_zones").select("id, name, postcodes").order("name"),
    sb.from("delivery_rate_cards").select("id, partner_id, zone_id, basis, first_unit, second_unit, further_unit, min_charge"),
  ]);
  for (const r of [partnersR, zonesR, ratesR]) if (r.error) return fail(c, r.error);
  type Row = Record<string, unknown>;
  const rows = (r: { data: unknown }) => (r.data ?? []) as Row[];
  return c.json({
    companies: rows(partnersR).map((r) => ({ id: r.id, name: r.name, ownFleet: r.own_fleet === true, active: r.active !== false })),
    zones: rows(zonesR).map((r) => ({ id: r.id, name: r.name, postcodes: (r.postcodes ?? []) as string[] })),
    rates: rows(ratesR).map((r) => ({
      id: r.id, partnerId: r.partner_id, zoneId: r.zone_id ?? null, basis: r.basis,
      firstUnit: Number(r.first_unit), secondUnit: Number(r.second_unit),
      furtherUnit: Number(r.further_unit), minCharge: Number(r.min_charge),
    })),
  });
});

router.post("/zones", requireSettingsEditor("delivery"), async (c) => {
  const body = await parseJsonBody(c, deliveryZoneInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { id, name, postcodes } = body.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const row = { name, postcodes: postcodes.filter(Boolean) };
  const r = id
    ? await sb.from("delivery_zones").update(row).eq("id", id).select("id").single()
    : await sb.from("delivery_zones").insert(row).select("id").single();
  if (r.error) return fail(c, r.error);
  return c.json(r.data);
});

router.delete("/zones/:id", requireSettingsEditor("delivery"), async (c) => {
  const { error } = await userClient(c.env, c.var.auth.jwt).from("delivery_zones").delete().eq("id", c.req.param("id"));
  // 23001 restrict_violation: rate cards still point at the zone (0725 on delete restrict); they are never removed with it.
  if (error?.code === "23001") return c.json({ error: "conflict", code: "zone_has_rates", message: "Remove this zone's rate cards first." }, 409);
  if (error) return fail(c, error);
  return c.json({ ok: true });
});

router.post("/rates", requireSettingsEditor("delivery"), async (c) => {
  const body = await parseJsonBody(c, rateCardInput);
  if (!body.ok) return c.json(body.body, body.status);
  const d = body.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const row = {
    partner_id: d.partnerId, zone_id: d.zoneId, basis: d.basis, first_unit: d.firstUnit,
    second_unit: d.secondUnit, further_unit: d.furtherUnit, min_charge: d.minCharge,
  };
  const r = d.id
    ? await sb.from("delivery_rate_cards").update(row).eq("id", d.id).select("id").single()
    : await sb.from("delivery_rate_cards").insert(row).select("id").single();
  if (r.error) return fail(c, r.error);
  return c.json(r.data);
});

router.delete("/rates/:id", requireSettingsEditor("delivery"), async (c) => {
  const { error } = await userClient(c.env, c.var.auth.jwt).from("delivery_rate_cards").delete().eq("id", c.req.param("id"));
  if (error) return fail(c, error);
  return c.json({ ok: true });
});

export default router;
