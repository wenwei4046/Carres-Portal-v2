import { Hono, type Context } from "hono";
import {
  resolveWarehouseSchedule,
  warehouseCapabilityGrantInput,
  warehouseImportHolidayCalendarInput,
  warehouseSaveSpecialDateInput,
  warehouseSetDetailsInput,
  warehouseSetHolidayPolicyInput,
  warehouseSetWorkingHoursInput,
  type WarehouseCapabilityKey,
  type WarehouseHolidayAvailability,
  type WarehouseCapabilityRow,
  type WarehouseSettingsResponse,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/warehouse-settings — `Page Header → Settings → Warehouse`
 * (migrations 0456 · 0457; `docs/stock/MASTER.md` §11 · §12.13).
 *
 *   GET  /                    the whole surface, plus `canEdit`
 *   PUT  /details             Warehouse Details
 *   PUT  /working-hours       the whole week, replaced in one transaction
 *   POST /special-dates       create or change ONE upcoming Special Date
 *   PUT  /holiday-policy      Public Holidays
 *   POST /holiday-calendar    import ONE verified, sourced calendar version
 *   POST /access/grant        one capability to one active person
 *   POST /access/revoke       take it back; the record survives
 *   GET  /schedule?date=      the resolved schedule and the rule that decided
 *
 * Every write is a gated `SECURITY DEFINER` RPC. The settings tables carry no
 * write policy at all, so PostgREST cannot be used to walk around this router
 * — `canEdit` decides only what RENDERS.
 *
 * **It edits CONFIGURATION, never Warehouse work.** No route here touches a
 * Unit, a stock quantity, a condition, a completed Inbound or Outbound record,
 * a Count result, a Month-end version, a Delivery date, an ETA, a route or a
 * customer's delivery information. The rule is enforced by there being no such
 * writer, not by a warning printed on the page.
 */
const warehouseSettingsRouter = new Hono<AppEnv>();

/** The Warehouse Settings surface governs ONE Site today. When a second
 *  governed Site exists, the caller names it; until then the one row answers,
 *  which is honest about what is configured rather than inventing a picker. */
async function primarySiteId(
  sb: ReturnType<typeof userClient>,
  requested?: string | null,
): Promise<string | null> {
  if (requested) return requested;
  const { data } = await sb.from("warehouses").select("id").order("created_at").limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

/**
 * Where each capability's grant BITES today, stated as a fact.
 *
 * `manage_warehouse_settings` is enforced by `warehouse_settings_gate()` —
 * 0457 widened that gate to read the grant, so giving it to somebody genuinely
 * lets them save this page. The three physical capabilities are RECORDED here
 * and their acts are still authorised by the doors that already own them; this
 * line says so rather than implying an enforcement that does not exist.
 */
const CAPABILITY_APPLIES_TO: Record<WarehouseCapabilityKey, string> = {
  manage_warehouse_settings: "Saving anything on this page.",
  confirm_inbound_receipt:
    "Recorded here. The receiving door still asks for GRN Duty, which Workspace → Staff & Duties assigns.",
  confirm_collection_from_warehouse:
    "Recorded here. The handover door still asks for the Warehouse operator signed in at the Site.",
  perform_stock_count: "Recorded here. Stock Counts are not built yet, so no door reads it.",
};

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

async function loadSettings(
  c: Context<AppEnv>,
  siteId: string,
): Promise<WarehouseSettingsResponse> {
  const sb = userClient(c.env, c.var.auth.jwt);

  const [
    siteR,
    profileR,
    partiesR,
    peopleR,
    hoursR,
    specialR,
    policyR,
    calendarsR,
    capsR,
    grantsR,
    changesR,
    canEditR,
  ] = await Promise.all([
    sb.from("warehouses").select("id, name, address").eq("id", siteId).maybeSingle(),
    sb
      .from("warehouse_site_profiles")
      .select(
        "status, operating_party_id, time_zone, key_contact_id, contact_number, updated_at",
      )
      .eq("site_id", siteId)
      .maybeSingle(),
    sb
      .from("stock_operating_parties")
      .select("id, name, kind, active")
      .eq("active", true)
      .order("name"),
    sb.from("app_users").select("id, name, status, role, title").order("name"),
    sb
      .from("warehouse_working_hours")
      .select("weekday, activity, closed, opens_at, closes_at")
      .eq("site_id", siteId),
    sb
      .from("warehouse_special_dates")
      .select(
        "id, on_date, kind, opens_at, closes_at, reason, created_by, created_at, updated_by, updated_at",
      )
      .eq("site_id", siteId)
      .order("on_date", { ascending: false }),
    sb
      .from("warehouse_holiday_policies")
      .select(
        "follow_public_holidays, country, state, observe_replacement, default_availability, special_opens_at, special_closes_at, updated_by, updated_at",
      )
      .eq("site_id", siteId)
      .maybeSingle(),
    sb
      .from("warehouse_holiday_calendars")
      .select(
        "id, country, state, version, source_name, source_reference, verified_at, imported_by, imported_at, active",
      )
      .order("imported_at", { ascending: false }),
    sb.from("warehouse_capabilities").select("key, label, helper, sort").order("sort"),
    sb
      .from("warehouse_capability_grants")
      .select("capability, user_id, granted_at, revoked_at")
      .is("revoked_at", null),
    sb
      .from("warehouse_setting_changes")
      .select("id, what, old_value, new_value, reason, actor_id, changed_at")
      .order("changed_at", { ascending: false })
      .limit(200),
    sb.rpc("warehouse_can_manage_settings"),
  ]);

  for (const r of [siteR, profileR, partiesR, peopleR, hoursR, specialR, policyR, calendarsR, capsR, grantsR, changesR]) {
    if (r.error) throw new Error(`warehouse settings: ${r.error.message}`);
  }
  const site = siteR.data as Row | null;
  if (!site) throw new Error("warehouse settings: unknown warehouse site");

  const peopleRows = (peopleR.data ?? []) as Row[];
  const personById = new Map(peopleRows.map((p) => [p.id as string, p]));
  const nameOf = (id: unknown) =>
    typeof id === "string" ? ((personById.get(id)?.name as string | undefined) ?? null) : null;

  const profile = (profileR.data ?? {}) as Row;
  const parties = (partiesR.data ?? []) as Row[];
  const keyContact = typeof profile.key_contact_id === "string"
    ? personById.get(profile.key_contact_id)
    : undefined;

  /* Only ACTIVE people may be newly chosen — as key contact or for access.
     Khor Yee and Samantha are disabled and therefore simply are not here.
     The list is not filtered to a role: the picker names real People. */
  const people = peopleRows
    .filter((p) => (p.status as string) === "active")
    .filter((p) => (p.role as string) !== "dealer")
    .map((p) => ({
      id: p.id as string,
      name: (p.name as string) ?? "",
      /* An individual's organisation, where the ERP actually records one. A
         Carres account is Carres — it is never dressed as partner personnel. */
      organisation: "Carres",
    }));

  const calendars = ((calendarsR.data ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    country: r.country as string,
    state: str(r.state),
    version: Number(r.version),
    sourceName: r.source_name as string,
    sourceReference: r.source_reference as string,
    verifiedAt: r.verified_at as string,
    importedByName: nameOf(r.imported_by),
    importedAt: r.imported_at as string,
    active: r.active === true,
    dateCount: 0,
  }));
  const activeCalendar = calendars.find((cal) => cal.active) ?? null;

  let holidayDates: WarehouseSettingsResponse["holidayDates"] = [];
  if (activeCalendar) {
    const datesR = await sb
      .from("warehouse_holiday_dates")
      .select("on_date, name, observed")
      .eq("calendar_id", activeCalendar.id)
      .order("on_date");
    if (datesR.error) throw new Error(`warehouse settings: ${datesR.error.message}`);
    holidayDates = ((datesR.data ?? []) as Row[]).map((r) => ({
      onDate: r.on_date as string,
      name: r.name as string,
      observed: r.observed === true,
    }));
    activeCalendar.dateCount = holidayDates.length;
  }

  const grants = (grantsR.data ?? []) as Row[];
  const capabilities: WarehouseCapabilityRow[] = ((capsR.data ?? []) as Row[]).map((cap) => {
    const key = cap.key as WarehouseCapabilityKey;
    return {
      key,
      label: cap.label as string,
      helper: cap.helper as string,
      appliesTo: CAPABILITY_APPLIES_TO[key] ?? "",
      holders: grants
        .filter((g) => g.capability === key)
        .map((g) => ({
          userId: g.user_id as string,
          /* The grant keeps the person it names even after they are disabled —
             history preserves identity; only the picker loses them. */
          name: nameOf(g.user_id) ?? "Not recorded",
          grantedAt: g.granted_at as string,
        })),
    };
  });

  const policy = policyR.data as Row | null;

  return {
    canEdit: canEditR.data === true,
    details: {
      siteId,
      name: (site.name as string) ?? "",
      address: str(site.address),
      status: ((profile.status as string) ?? "active") as "active" | "closed",
      operatingPartyId: str(profile.operating_party_id),
      operatingPartyName:
        (parties.find((p) => p.id === profile.operating_party_id)?.name as string | undefined) ??
        null,
      timeZone: (profile.time_zone as string) ?? "Asia/Kuala_Lumpur",
      keyContactId: str(profile.key_contact_id),
      keyContactName: (keyContact?.name as string | undefined) ?? null,
      keyContactOrganisation: keyContact ? "Carres" : null,
      keyContactActive: (keyContact?.status as string | undefined) === "active",
      contactNumber: str(profile.contact_number),
    },
    operatingParties: parties.map((p) => ({ id: p.id as string, name: p.name as string })),
    people,
    workingHours: ((hoursR.data ?? []) as Row[]).map((r) => ({
      weekday: Number(r.weekday),
      activity: r.activity as "receiving" | "collection",
      closed: r.closed === true,
      opensAt: str(r.opens_at),
      closesAt: str(r.closes_at),
    })),
    specialDates: ((specialR.data ?? []) as Row[]).map((r) => ({
      id: r.id as string,
      onDate: r.on_date as string,
      kind: r.kind as WarehouseSettingsResponse["specialDates"][number]["kind"],
      opensAt: str(r.opens_at),
      closesAt: str(r.closes_at),
      reason: r.reason as string,
      createdByName: nameOf(r.created_by),
      createdAt: r.created_at as string,
      updatedByName: nameOf(r.updated_by),
      updatedAt: r.updated_at as string,
    })),
    holidayPolicy: policy
      ? {
          followPublicHolidays: policy.follow_public_holidays === true,
          country: policy.country as string,
          state: str(policy.state),
          observeReplacement: policy.observe_replacement === true,
          defaultAvailability: policy.default_availability as WarehouseHolidayAvailability,
          specialOpensAt: str(policy.special_opens_at),
          specialClosesAt: str(policy.special_closes_at),
          updatedByName: nameOf(policy.updated_by),
          updatedAt: policy.updated_at as string,
        }
      : null,
    holidayCalendars: calendars,
    holidayDates,
    capabilities,
    changes: ((changesR.data ?? []) as Row[]).map((r) => ({
      id: r.id as string,
      what: r.what as string,
      oldValue: r.old_value,
      newValue: r.new_value,
      reason: str(r.reason),
      actorName: nameOf(r.actor_id),
      changedAt: r.changed_at as string,
    })),
  };
}

async function respond(c: Context<AppEnv>, siteId: string) {
  return c.json(await loadSettings(c, siteId));
}

warehouseSettingsRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  try {
    const siteId = await primarySiteId(sb, c.req.query("siteId"));
    if (!siteId) {
      return c.json(
        { error: "no_warehouse_site", code: "no_warehouse_site", message: "No warehouse site is configured." },
        404,
      );
    }
    return await respond(c, siteId);
  } catch (e) {
    return c.json(
      { error: "settings_unavailable", code: "settings_unavailable", message: (e as Error).message },
      500,
    );
  }
});

warehouseSettingsRouter.get("/schedule", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const date = c.req.query("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: "bad_date", code: "bad_date", message: "Give a date like 2026-09-30." }, 400);
  }
  try {
    const siteId = await primarySiteId(sb, c.req.query("siteId"));
    if (!siteId) {
      return c.json({ error: "no_warehouse_site", code: "no_warehouse_site", message: "No warehouse site is configured." }, 404);
    }
    const s = await loadSettings(c, siteId);
    return c.json(
      resolveWarehouseSchedule({
        date,
        siteStatus: s.details.status,
        workingHours: s.workingHours,
        specialDates: s.specialDates,
        holidayPolicy: s.holidayPolicy,
        holidayDates: s.holidayDates,
      }),
    );
  } catch (e) {
    return c.json(
      { error: "settings_unavailable", code: "settings_unavailable", message: (e as Error).message },
      500,
    );
  }
});

warehouseSettingsRouter.put("/details", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseJsonBody(c, warehouseSetDetailsInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("warehouse_set_site_details", {
    p_site_id: parsed.data.siteId,
    p_name: parsed.data.name,
    p_address: parsed.data.address ?? null,
    p_status: parsed.data.status,
    p_operating_party_id: parsed.data.operatingPartyId ?? null,
    p_time_zone: parsed.data.timeZone,
    p_key_contact_id: parsed.data.keyContactId ?? null,
    p_contact_number: parsed.data.contactNumber ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return respond(c, parsed.data.siteId);
});

warehouseSettingsRouter.put("/working-hours", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseJsonBody(c, warehouseSetWorkingHoursInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("warehouse_set_working_hours", {
    p_site_id: parsed.data.siteId,
    p_rows: parsed.data.rows,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return respond(c, parsed.data.siteId);
});

warehouseSettingsRouter.post("/special-dates", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseJsonBody(c, warehouseSaveSpecialDateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("warehouse_save_special_date", {
    p_id: parsed.data.id ?? null,
    p_site_id: parsed.data.siteId,
    p_on_date: parsed.data.onDate,
    p_kind: parsed.data.kind,
    p_opens_at: parsed.data.opensAt ?? null,
    p_closes_at: parsed.data.closesAt ?? null,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return respond(c, parsed.data.siteId);
});

warehouseSettingsRouter.put("/holiday-policy", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseJsonBody(c, warehouseSetHolidayPolicyInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("warehouse_set_holiday_policy", {
    p_site_id: parsed.data.siteId,
    p_follow: parsed.data.followPublicHolidays,
    p_country: parsed.data.country,
    p_state: parsed.data.state ?? null,
    p_observe_replacement: parsed.data.observeReplacement,
    p_default_availability: parsed.data.defaultAvailability,
    p_opens_at: parsed.data.specialOpensAt ?? null,
    p_closes_at: parsed.data.specialClosesAt ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return respond(c, parsed.data.siteId);
});

warehouseSettingsRouter.post("/holiday-calendar", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseJsonBody(c, warehouseImportHolidayCalendarInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("warehouse_import_holiday_calendar", {
    p_country: parsed.data.country,
    p_state: parsed.data.state ?? null,
    p_source_name: parsed.data.sourceName,
    p_source_reference: parsed.data.sourceReference,
    p_verified_at: parsed.data.verifiedAt,
    p_dates: parsed.data.dates,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const siteId = await primarySiteId(sb, c.req.query("siteId"));
  return respond(c, siteId as string);
});

for (const act of ["grant", "revoke"] as const) {
  warehouseSettingsRouter.post(`/access/${act}`, requireOperationOrPrincipal, async (c) => {
    const parsed = await parseJsonBody(c, warehouseCapabilityGrantInput);
    if (!parsed.ok) return c.json(parsed.body, parsed.status);
    const sb = userClient(c.env, c.var.auth.jwt);
    const { error } = await sb.rpc(
      act === "grant" ? "warehouse_grant_capability" : "warehouse_revoke_capability",
      { p_capability: parsed.data.capability, p_user_id: parsed.data.userId },
    );
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    const siteId = await primarySiteId(sb, c.req.query("siteId"));
    return respond(c, siteId as string);
  });
}

export default warehouseSettingsRouter;
