import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 7 Sprint 3 — Partner Fleet CRUD.
 *
 * Mounted at `/api/partner/fleet`. Routes:
 *   GET  /              list this partner's vehicles
 *   POST /              create a new vehicle
 *   PATCH /:id          update an existing vehicle
 *   DELETE /:id         delete a vehicle
 *
 * RLS on partner_fleet (0002:162) scopes reads + writes to
 * partner_id = auth.app_partner_id() (or principal). The route trusts
 * RLS — we only enforce the role gate at the entry boundary.
 *
 * Schema (per 0001:109): id, partner_id, plate, vehicle_type, capacity,
 * driver_name, driver_phone, created_at. partner_id is server-set from
 * the JWT to prevent cross-tenant inserts.
 */
const partnerFleetRouter = new Hono<AppEnv>();

const fleetCreateSchema = z.object({
  plate:        z.string().trim().min(1).max(32),
  vehicleType:  z.string().trim().min(1).max(64),
  capacity:     z.string().trim().max(64).optional().nullable(),
  driverName:   z.string().trim().max(120).optional().nullable(),
  driverPhone:  z.string().trim().max(40).optional().nullable(),
});

const fleetUpdateSchema = fleetCreateSchema.partial();

partnerFleetRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Partner role with partner_id required" });
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("partner_fleet")
    .select("id, partner_id, plate, vehicle_type, capacity, driver_name, driver_phone, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

partnerFleetRouter.post("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Partner role with partner_id required" });
  }
  const raw = await c.req.json().catch(() => ({}));
  const parsed = fleetCreateSchema.safeParse(raw);
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
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("partner_fleet")
    .insert({
      partner_id:   auth.partnerId,                       // server-set
      plate:        parsed.data.plate,
      vehicle_type: parsed.data.vehicleType,
      capacity:     parsed.data.capacity ?? null,
      driver_name:  parsed.data.driverName ?? null,
      driver_phone: parsed.data.driverPhone ?? null,
    })
    .select("*")
    .single();
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

partnerFleetRouter.patch("/:id", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Partner role with partner_id required" });
  }
  const id = c.req.param("id");
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json(
      { error: "invalid_id", code: "invalid_param", message: "id must be a uuid" },
      422,
    );
  }
  const raw = await c.req.json().catch(() => ({}));
  const parsed = fleetUpdateSchema.safeParse(raw);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = {};
  if (parsed.data.plate !== undefined)       update.plate = parsed.data.plate;
  if (parsed.data.vehicleType !== undefined) update.vehicle_type = parsed.data.vehicleType;
  if (parsed.data.capacity !== undefined)    update.capacity = parsed.data.capacity ?? null;
  if (parsed.data.driverName !== undefined)  update.driver_name = parsed.data.driverName ?? null;
  if (parsed.data.driverPhone !== undefined) update.driver_phone = parsed.data.driverPhone ?? null;

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("partner_fleet")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "Vehicle not found" }, 404);
  }
  return c.json(data);
});

partnerFleetRouter.delete("/:id", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Partner role with partner_id required" });
  }
  const id = c.req.param("id");
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json(
      { error: "invalid_id", code: "invalid_param", message: "id must be a uuid" },
      422,
    );
  }
  const sb = userClient(c.env, auth.jwt);
  const { error } = await sb.from("partner_fleet").delete().eq("id", id);
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ id, deleted: true });
});

export default partnerFleetRouter;
