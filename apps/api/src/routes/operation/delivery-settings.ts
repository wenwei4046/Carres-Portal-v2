import { Hono, type Context } from "hono";
import {
  deliveryTemplateActiveInput,
  deliveryTemplateKeyInput,
  deliveryTemplateSaveInput,
  partnerCoverageInput,
  partnerDetailsInput,
  partnerDriverInput,
  partnerRulesInput,
  partnerScheduleInput,
  partnerServicesInput,
  partnerVehicleInput,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody, fail } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import { resolveActorNames } from "../../lib/actor-names";
import { loadPurchasingSettings } from "../../lib/purchasing-settings";
import type { AppEnv } from "../../types";

/**
 * /api/operation/delivery-settings — the `Delivery` group of the Settings
 * Workspace (Delivery MASTER §11, migration 0488).
 *
 * Thin on purpose: the manager gate, the one-default rule, the recorded change
 * and every validation the database can make live in the SQL doors. This
 * router reads the whole surface in one round trip and forwards each section's
 * save to its own RPC. It never reads a rota and never resolves a person —
 * `Access` links to Workspace → Staff & Duties and copies nothing.
 */
const deliverySettingsRouter = new Hono<AppEnv>();

const PARTNER_SELECT =
  "id, name, active, contact, zones, address, whatsapp_group_url, customer_phone, office_contact, " +
  "coverage, kv_default, off_days, blackout_dates, daily_capacity, booking_lead_days, pickup_days, " +
  "journey_regions, surcharge_areas, cutoff_time, handover_points, services, customer_contact_by, " +
  "record_on_behalf_allowed, proof_rules, operating_party_id";

deliverySettingsRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const [partnersR, driversR, vehiclesR, templatesR, changesR, accountsR, canR, purchasing] =
    await Promise.all([
      sb.from("delivery_partners").select(PARTNER_SELECT).order("name"),
      sb.from("partner_drivers").select("id, partner_id, name, phone, active").order("name"),
      sb
        .from("partner_fleet")
        .select("id, partner_id, plate, vehicle_type, capacity, driver_name, driver_phone, active")
        .order("plate"),
      sb
        .from("delivery_message_templates")
        .select("*")
        .order("purpose")
        .order("template_key")
        .order("version", { ascending: false }),
      sb
        .from("delivery_setting_changes")
        .select("id, what, partner_id, old_value, new_value, actor_id, changed_at")
        .order("changed_at", { ascending: false })
        .limit(200),
      sb.from("app_users").select("id, name, email, partner_id, status").eq("role", "partner"),
      sb.rpc("delivery_can_manage_settings"),
      loadPurchasingSettings(sb).catch(() => null),
    ]);
  for (const r of [partnersR, driversR, vehiclesR, templatesR, changesR, accountsR]) {
    if (r.error) {
      const m = mapPgError(r.error);
      return c.json(m.body, m.status);
    }
  }
  /* The change list names its actors through the one actor lookup — read
     once, never joined in the client. */
  const actorName = await resolveActorNames(
    sb,
    ((changesR.data ?? []) as Array<{ actor_id: string | null }>).map((r) => r.actor_id),
  );
  return c.json({
    partners: partnersR.data ?? [],
    drivers: driversR.data ?? [],
    vehicles: vehiclesR.data ?? [],
    templates: templatesR.data ?? [],
    changes: ((changesR.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      ...r,
      actor_name: actorName.get(r.actor_id as string) ?? null,
    })),
    partnerAccounts: accountsR.data ?? [],
    canEdit: canR.error ? false : Boolean(canR.data),
    /* Delivery Rules mirrors, read-only (§11): the contact lead lives in the
       shared `chase` setting — one home, never a second number here. */
    contactLeadWorkingDays: purchasing?.logisticsCallWorkingDays ?? null,
  });
});

async function rpc(c: Context<AppEnv>, fn: string, args: Record<string, unknown>) {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc(fn, args);
  if (error) return fail(c, error);
  return c.json(data ?? { ok: true });
}

deliverySettingsRouter.put("/partner/details", requireOperationOrPrincipal, async (c) => {
  const body = await parseJsonBody(c, partnerDetailsInput);
  if (!body.ok) return c.json(body.body, body.status);
  const d = body.data;
  return rpc(c, "delivery_set_partner_details", {
    p_partner_id: d.partnerId,
    p_name: d.name,
    p_active: d.active,
    p_customer_phone: d.customerPhone ?? null,
    p_office_contact: d.officeContact ?? null,
    p_address: d.address ?? null,
    p_whatsapp_group_url: d.whatsappGroupUrl ?? null,
  });
});

deliverySettingsRouter.put("/partner/coverage", requireOperationOrPrincipal, async (c) => {
  const body = await parseJsonBody(c, partnerCoverageInput);
  if (!body.ok) return c.json(body.body, body.status);
  return rpc(c, "delivery_set_partner_coverage", {
    p_partner_id: body.data.partnerId,
    p_coverage: body.data.coverage,
    p_kv_default: body.data.kvDefault,
  });
});

deliverySettingsRouter.put("/partner/schedule", requireOperationOrPrincipal, async (c) => {
  const body = await parseJsonBody(c, partnerScheduleInput);
  if (!body.ok) return c.json(body.body, body.status);
  return rpc(c, "delivery_set_partner_schedule", {
    p_partner_id: body.data.partnerId,
    p_cutoff_time: body.data.cutoffTime ?? null,
    p_handover_points: body.data.handoverPoints,
  });
});

deliverySettingsRouter.put("/partner/services", requireOperationOrPrincipal, async (c) => {
  const body = await parseJsonBody(c, partnerServicesInput);
  if (!body.ok) return c.json(body.body, body.status);
  return rpc(c, "delivery_set_partner_services", {
    p_partner_id: body.data.partnerId,
    p_services: body.data.services,
  });
});

deliverySettingsRouter.put("/partner/rules", requireOperationOrPrincipal, async (c) => {
  const body = await parseJsonBody(c, partnerRulesInput);
  if (!body.ok) return c.json(body.body, body.status);
  return rpc(c, "delivery_set_partner_rules", {
    p_partner_id: body.data.partnerId,
    p_customer_contact_by: body.data.customerContactBy,
    p_record_on_behalf_allowed: body.data.recordOnBehalfAllowed,
    p_proof_rules: body.data.proofRules,
  });
});

deliverySettingsRouter.post("/partner/driver", requireOperationOrPrincipal, async (c) => {
  const body = await parseJsonBody(c, partnerDriverInput);
  if (!body.ok) return c.json(body.body, body.status);
  const d = body.data;
  return rpc(c, "delivery_save_partner_driver", {
    p_partner_id: d.partnerId,
    p_driver_id: d.driverId ?? null,
    p_name: d.name,
    p_phone: d.phone ?? null,
    p_active: d.active,
  });
});

deliverySettingsRouter.post("/partner/vehicle", requireOperationOrPrincipal, async (c) => {
  const body = await parseJsonBody(c, partnerVehicleInput);
  if (!body.ok) return c.json(body.body, body.status);
  const d = body.data;
  return rpc(c, "delivery_save_partner_vehicle", {
    p_partner_id: d.partnerId,
    p_vehicle_id: d.vehicleId ?? null,
    p_plate: d.plate,
    p_vehicle_type: d.vehicleType,
    p_capacity: d.capacity ?? null,
    p_driver_name: d.driverName ?? null,
    p_driver_phone: d.driverPhone ?? null,
    p_active: d.active,
  });
});

deliverySettingsRouter.post("/templates/save", requireOperationOrPrincipal, async (c) => {
  const body = await parseJsonBody(c, deliveryTemplateSaveInput);
  if (!body.ok) return c.json(body.body, body.status);
  const d = body.data;
  return rpc(c, "delivery_template_save", {
    p_template_key: d.templateKey ?? null,
    p_purpose: d.purpose,
    p_channel: d.channel,
    p_name: d.name,
    p_body: d.body,
  });
});

deliverySettingsRouter.post("/templates/set-default", requireOperationOrPrincipal, async (c) => {
  const body = await parseJsonBody(c, deliveryTemplateKeyInput);
  if (!body.ok) return c.json(body.body, body.status);
  return rpc(c, "delivery_template_set_default", { p_template_key: body.data.templateKey });
});

deliverySettingsRouter.post("/templates/set-active", requireOperationOrPrincipal, async (c) => {
  const body = await parseJsonBody(c, deliveryTemplateActiveInput);
  if (!body.ok) return c.json(body.body, body.status);
  return rpc(c, "delivery_template_set_active", {
    p_template_key: body.data.templateKey,
    p_active: body.data.active,
  });
});

export default deliverySettingsRouter;
