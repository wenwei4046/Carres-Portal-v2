/**
 * SETTINGS → COMPANY · OFFICE · SETTINGS EDITORS (Carres Settings List
 * COM-01 · COM-02 · OFF-01..05 · TEAM-02 · SET-01, owner confirmed 9 Oct 2026).
 *
 *   GET  /company            the company identity + who may edit + its changes
 *   PUT  /company            save it (Jess or a named Company editor)
 *   GET  /office             the Office calendar + recorded holidays + changes
 *   PUT  /office             save weekdays / hours / flexi / lunch / region
 *   PUT  /office/holidays    save one year's Office public holidays
 *   GET  /editors            who edits which section (live + past grants)
 *   POST /editors/grant      Jess names a person for a section
 *   POST /editors/revoke     Jess removes that person
 *
 * Storage and the write gate are the database's (0668 + 0669): every write
 * calls a definer door that asks `settings_can_edit(section)` itself, and the
 * route asks the same question first so a refusal is a clean 403.
 *
 * Before 0669 is applied the reads answer `stored: false` with the owner
 * defaults, and the page never offers Edit.
 */
import { Hono, type Context } from "hono";
import {
  VERIFIED_COMPANY_PROFILE,
  COMPANY_PROFILE_FIELDS,
  DEFAULT_OFFICE_CALENDAR,
  companyProfileSaveInput,
  officeCalendarSaveInput,
  officeHolidaysSaveInput,
  settingsEditorGrantInput,
  type CompanyProfileValues,
  type SettingsChange,
  type SettingsEditorSection,
} from "@carres/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { canEditSettings, requireSettingsEditor } from "../../lib/settings-editor";
import { readOfficeCalendar } from "../../lib/office-calendar";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

const router = new Hono<AppEnv>();

function rpcFailure(error: { code?: string; message?: string; details?: string }) {
  if (error.details === "settings_changed") {
    return { status: 409 as const, body: { error: "settings_changed", code: "settings_changed", message: "Someone else saved these settings. Reload to see them." } };
  }
  const mapped = mapPgError(error);
  return { status: mapped.status, body: { ...mapped.body, detail: error.details ?? null } };
}

function profileOf(row: Record<string, unknown> | null): CompanyProfileValues {
  if (!row) return { ...VERIFIED_COMPANY_PROFILE };
  const out = {} as CompanyProfileValues;
  for (const f of COMPANY_PROFILE_FIELDS) {
    const v = row[f];
    out[f] = typeof v === "string" && v.trim() !== "" ? v : null;
  }
  return out;
}

async function changesOf(sb: SupabaseClient, section: "company" | "office"): Promise<SettingsChange[]> {
  const { data, error } = await sb
    .from("settings_changes")
    .select("id, what, old_value, new_value, reason, changed_at, actor:app_users!settings_changes_actor_id_fkey(name)")
    .eq("section", section)
    .order("changed_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map((r) => {
    const actor = (Array.isArray(r.actor) ? r.actor[0] : r.actor) as { name?: string | null } | null;
    return {
      id: Number(r.id),
      what: String(r.what),
      oldValue: r.old_value ?? null,
      newValue: r.new_value ?? null,
      reason: (r.reason as string | null) ?? null,
      actorName: actor?.name ?? null,
      changedAt: String(r.changed_at),
    };
  });
}

// ── Company ───────────────────────────────────────────────────────────────
router.get("/company", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const read = await sb.from("company_profile").select("*").eq("id", 1).maybeSingle();
  if (read.error || !read.data) {
    return c.json({ stored: false, values: { ...VERIFIED_COMPANY_PROFILE }, revision: null, canEdit: false, changes: [] });
  }
  const [canEdit, changes] = await Promise.all([
    canEditSettings(c.env, c.var.auth.jwt, "company", c.var.auth.role),
    changesOf(sb, "company"),
  ]);
  return c.json({
    stored: true,
    values: profileOf(read.data),
    revision: Number(read.data.revision),
    canEdit,
    changes,
  });
});

router.put("/company", requireSettingsEditor("company"), async (c) => {
  const parsed = await parseJsonBody(c, companyProfileSaveInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("settings_save_company_profile", {
    p_values: parsed.data.values,
    p_revision: parsed.data.revision,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) {
    const f = rpcFailure(error);
    return c.json(f.body, f.status);
  }
  return c.json({ ok: true });
});

// ── Office ────────────────────────────────────────────────────────────────
router.get("/office", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const office = await readOfficeCalendar(sb);
  const d = DEFAULT_OFFICE_CALENDAR;
  const time = (v: unknown, fallback: string) => (typeof v === "string" ? v.slice(0, 5) : fallback);
  const row = office.row;
  const values = {
    work_days: row && Array.isArray(row.work_days) ? (row.work_days as number[]).map(Number) : [...d.workDays],
    start_time: time(row?.start_time, d.start),
    end_time: time(row?.end_time, d.end),
    flexi_minutes: row ? Number(row.flexi_minutes) : d.flexiMinutes,
    lunch_start: time(row?.lunch_start, d.lunchStart),
    lunch_end: time(row?.lunch_end, d.lunchEnd),
    lunch_shift_minutes: row ? Number(row.lunch_shift_minutes) : d.lunchShiftMinutes,
    holiday_region: row && typeof row.holiday_region === "string" ? row.holiday_region : d.holidayRegion,
  };
  if (!office.stored) {
    return c.json({ stored: false, values, revision: null, holidays: [], canEdit: false, changes: [] });
  }
  const [canEdit, changes] = await Promise.all([
    canEditSettings(c.env, c.var.auth.jwt, "office", c.var.auth.role),
    changesOf(sb, "office"),
  ]);
  return c.json({
    stored: true,
    values,
    revision: Number(row?.revision ?? 1),
    holidays: office.holidays,
    canEdit,
    changes,
  });
});

router.put("/office", requireSettingsEditor("office"), async (c) => {
  const parsed = await parseJsonBody(c, officeCalendarSaveInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("settings_save_office_calendar", {
    p_values: parsed.data.values,
    p_revision: parsed.data.revision,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) {
    const f = rpcFailure(error);
    return c.json(f.body, f.status);
  }
  return c.json({ ok: true });
});

router.put("/office/holidays", requireSettingsEditor("office"), async (c) => {
  const parsed = await parseJsonBody(c, officeHolidaysSaveInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("settings_save_office_holidays", {
    p_year: parsed.data.year,
    p_holidays: parsed.data.holidays,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) {
    const f = rpcFailure(error);
    return c.json(f.body, f.status);
  }
  return c.json({ ok: true });
});

// ── Settings editors (TEAM-02) ────────────────────────────────────────────
router.get("/editors", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const canManage = c.var.auth.role === "principal";
  const [grants, people] = await Promise.all([
    sb
      .from("settings_section_editors")
      .select("id, section, user_id, granted_at, revoked_at, person:app_users!settings_section_editors_user_id_fkey(name), granter:app_users!settings_section_editors_granted_by_fkey(name), revoker:app_users!settings_section_editors_revoked_by_fkey(name)")
      .order("granted_at", { ascending: false })
      .limit(200),
    sb
      .from("app_users")
      .select("id, name, role, status, is_person")
      .in("role", ["operation", "finance", "hr", "principal"])
      .eq("status", "active")
      .order("name"),
  ]);
  if (grants.error) {
    return c.json({ stored: false, canManage: false, grants: [], people: [] });
  }
  const one = (v: unknown) => ((Array.isArray(v) ? v[0] : v) as { name?: string | null } | null)?.name ?? null;
  return c.json({
    stored: true,
    canManage,
    grants: (grants.data ?? []).map((g) => ({
      id: String(g.id),
      section: g.section as SettingsEditorSection,
      userId: String(g.user_id),
      userName: one(g.person),
      grantedByName: one(g.granter),
      grantedAt: String(g.granted_at),
      revokedByName: one(g.revoker),
      revokedAt: (g.revoked_at as string | null) ?? null,
    })),
    people: (people.data ?? [])
      .filter((p) => p.is_person !== false && p.role !== "principal")
      .map((p) => ({ id: String(p.id), name: String(p.name ?? "") }))
      .filter((p) => p.name.trim() !== ""),
  });
});

async function editorDoor(c: Context<AppEnv>, fn: "settings_grant_section_editor" | "settings_revoke_section_editor") {
  if (c.var.auth.role !== "principal") {
    return c.json({ error: "forbidden", code: "forbidden", message: "Only Jess may name Settings editors." }, 403);
  }
  const parsed = await parseJsonBody(c, settingsEditorGrantInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc(fn, { p_section: parsed.data.section, p_user_id: parsed.data.userId });
  if (error) {
    const f = rpcFailure(error);
    return c.json(f.body, f.status);
  }
  return c.json({ ok: true });
}
router.post("/editors/grant", requireOperationOrPrincipal, (c) => editorDoor(c, "settings_grant_section_editor"));
router.post("/editors/revoke", requireOperationOrPrincipal, (c) => editorDoor(c, "settings_revoke_section_editor"));

export default router;

/**
 * GET /api/company-profile — the company identity every printed document
 * carries, for ANY signed-in account (a dealer's SO PDF prints it too).
 * Falls back to the verified built-in identity when the stored profile is
 * not readable, so a document never prints a blank letterhead.
 */
export const companyProfileReadRouter = new Hono<AppEnv>();
companyProfileReadRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const read = await sb.from("company_profile").select("*").eq("id", 1).maybeSingle();
  return c.json({ stored: !read.error && !!read.data, values: profileOf(read.error ? null : read.data) });
});
