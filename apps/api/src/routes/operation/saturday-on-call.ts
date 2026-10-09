import { Hono } from "hono";
import {
  isSaturdayIso,
  saturdayOnCallResponseSchema,
  saturdayOnCallSetInput,
  saturdayOnCallWindowInput,
} from "@carres/shared/workspace-saturday-on-call";
import { requireOperation } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/saturday-on-call — the Saturday on-call section of Settings →
 * Staff & Duties (migration 0671; owner rule 9 Oct 2026, WS-12).
 *
 *   GET  /              the time window, the next Saturdays (this one first)
 *                       with their person, cover and leave flag, `canEdit`,
 *                       and — for an editor — the people to choose from
 *   PUT  /window        save the time window (revision-checked, history kept)
 *   PUT  /:saturday     name the on-call person and optional cover for one
 *                       Saturday (appended; a null person clears it)
 *
 * Not a Duty: nothing here touches the Duty records, Office days, deadlines or
 * routine Tasks. Editors are Staff & Duties editors (`_settings_require_editor`
 * in SQL); every rule is the database's, and refusals travel as codes only.
 */
const router = new Hono<AppEnv>();

const REFUSALS = new Set([
  "not_settings_editor",
  "invalid_window",
  "settings_changed",
  "not_saturday",
  "invalid_saturday",
  "invalid_person",
  "invalid_cover",
  "cover_is_person",
  "text_too_long",
]);

function refusal(error: { code?: string; message?: string; details?: string }) {
  const { status } = mapPgError(error);
  const code = REFUSALS.has(error.details ?? "") ? error.details! : "unknown";
  return { status, body: { error: code, code, message: code } };
}

type Row = {
  window: { starts_at: string; ends_at: string; revision: number };
  can_edit: boolean;
  saturdays: Array<{
    saturday: string; person_id: string | null; person_name: string | null; person_on_leave: boolean;
    cover_person_id: string | null; cover_name: string | null; cover_on_leave: boolean; note: string | null;
  }>;
  people: Array<{ id: string; name: string }>;
};

router.get("/", requireOperation, async (c) => {
  const weeks = Number(c.req.query("weeks") ?? "6");
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 26) {
    return c.json({ error: "invalid_input", code: "invalid_param", message: "invalid_param" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("workspace_saturday_on_call_read", { p_weeks: weeks });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const r = data as Row;
  return c.json(saturdayOnCallResponseSchema.parse({
    window: { startsAt: r.window.starts_at, endsAt: r.window.ends_at, revision: r.window.revision },
    canEdit: r.can_edit === true,
    saturdays: r.saturdays.map((d) => ({
      saturday: d.saturday,
      personId: d.person_id,
      personName: d.person_name,
      personOnLeave: d.person_on_leave,
      coverPersonId: d.cover_person_id,
      coverName: d.cover_name,
      coverOnLeave: d.cover_on_leave,
      note: d.note,
    })),
    people: r.people,
  }));
});

router.put("/window", requireOperation, async (c) => {
  const body = await parseJsonBody(c, saturdayOnCallWindowInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("workspace_saturday_on_call_save_window", {
    p_starts_at: body.data.startsAt,
    p_ends_at: body.data.endsAt,
    p_revision: body.data.revision,
  });
  if (error) {
    const r = refusal(error);
    return c.json(r.body, r.status);
  }
  const w = data as { starts_at: string; ends_at: string; revision: number };
  return c.json({ startsAt: w.starts_at.slice(0, 5), endsAt: w.ends_at.slice(0, 5), revision: w.revision });
});

router.put("/:saturday", requireOperation, async (c) => {
  const saturday = c.req.param("saturday");
  if (!isSaturdayIso(saturday)) {
    return c.json({ error: "not_saturday", code: "not_saturday", message: "not_saturday" }, 422);
  }
  const body = await parseJsonBody(c, saturdayOnCallSetInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("workspace_saturday_on_call_set", {
    p_saturday: saturday,
    p_person_id: body.data.personId,
    p_cover_person_id: body.data.coverPersonId ?? null,
    p_note: body.data.note ?? null,
  });
  if (error) {
    const r = refusal(error);
    return c.json(r.body, r.status);
  }
  return c.json(data);
});

export default router;
