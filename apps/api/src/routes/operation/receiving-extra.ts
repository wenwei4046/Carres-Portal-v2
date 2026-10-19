import { receivingActorNames } from "../../lib/receiving-actor-names";
import { Hono } from "hono";
import { z } from "zod";
import { requireOperation } from "../../lib/auth-guards";
import { IN_URL_MAX, mapPgError, parseJsonBody, readAllPages } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

const router = new Hono<AppEnv>();
const uuid = z.string().uuid();
const noteInput = z.object({ note: z.string().trim().min(1).max(2000), key: uuid }).strict();
const noteResult = z.object({ id: uuid, custody_id: uuid, actor_id: uuid, request_key: uuid, note: z.string(), recorded_at: z.string().min(1) });
const unavailable = { code: "receiving_extra_unavailable" };
const missing = (error: { code?: string }) => ["PGRST205", "42P01", "PGRST202", "42883"].includes(error.code ?? "");

// An observation and an investigation note never accept goods or end custody.
router.get("/:id/extra-custody", requireOperation, async c => {
  const id = uuid.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ message: "Invalid Receiving" }, 422);
  const sb = userClient(c.env, c.var.auth.jwt);
  const receipt = await sb.from("warehouse_receipts").select("id,grn_no,extra_lines").eq("id", id.data).maybeSingle();
  if (receipt.error) { const m = mapPgError(receipt.error); return c.json(m.body, m.status); }
  if (!receipt.data) return c.json({ message: "Receiving not found" }, 404);
  const custody = await readAllPages((from, to) => sb.from("receiving_extra_custody").select("*").eq("receipt_id", id.data).order("extra_ordinal").order("id").range(from, to));
  if ("error" in custody) {
    if (missing(custody.error)) return c.json(unavailable, 503);
    const m = mapPgError(custody.error); return c.json(m.body, m.status);
  }
  if ("tooMany" in custody) return c.json({ code: "too_many_rows" }, 422);
  if (!custody.rows.length && Array.isArray(receipt.data.extra_lines) && receipt.data.extra_lines.length) return c.json(unavailable, 503);
  if (!custody.rows.length) return c.json({ custody: [], notes: [], actorNames: {}, siteNames: {} });
  const ids = custody.rows.map(row => String(row.id));
  const noteRows: Record<string, unknown>[] = [];
  for (let start = 0; start < ids.length; start += IN_URL_MAX) {
    const batch = await readAllPages((from, to) => sb.from("receiving_extra_custody_notes").select("*").in("custody_id", ids.slice(start, start + IN_URL_MAX)).order("recorded_at").order("id").range(from, to));
    if ("error" in batch) {
      if (missing(batch.error)) return c.json(unavailable, 503);
      const m = mapPgError(batch.error); return c.json(m.body, m.status);
    }
    if ("tooMany" in batch) return c.json({ code: "too_many_rows" }, 422);
    noteRows.push(...batch.rows);
  }
  const notes = { rows: noteRows.sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)) || String(a.id).localeCompare(String(b.id))) };
  // Names are optional display facts. Never discard a custody record for an absent name.
  const names = async (table: string, keys: string[], field: string) => {
    if (!keys.length) return {};
    const entries: Array<[string, string]> = [];
    for (let start = 0; start < keys.length; start += IN_URL_MAX) {
      const result = await readAllPages((from, to) => sb.from(table).select(`id,${field}`).in("id", keys.slice(start, start + IN_URL_MAX)).order("id").range(from, to));
      if (!("rows" in result)) return {};
      for (const row of result.rows) if (typeof row[field] === "string" && row[field].trim()) entries.push([String(row.id), row[field]]);
    }
    return Object.fromEntries(entries);
  };
  const actorIds = [...new Set([...custody.rows.map(row => row.recorded_by), ...notes.rows.map(row => row.actor_id)].filter((id): id is string => typeof id === "string"))];
  const sites = [...new Set(custody.rows.map(row => row.actual_site_id).filter((id): id is string => typeof id === "string"))];
  const holders = [...new Set(custody.rows.map(row => row.holder_party_id).filter((id): id is string => typeof id === "string"))];
  const [actorNames, siteNames, holderNames] = await Promise.all([names("app_users", actorIds, "name"), names("warehouses", sites, "name"), names("stock_operating_parties", holders, "name")]);
  try {
    const recorded = await receivingActorNames(sb, id.data, actorIds);
    Object.assign(actorNames, recorded ?? {});
  } catch { return c.json({ code: "receiving_extra_actor_names_unavailable" }, 503); }
  // This is observation provenance only, never a verified source for the Extra goods.
  return c.json({ custody: custody.rows, notes: notes.rows, actorNames, siteNames, holderNames,
    recorded_with: { receipt_id: id.data, grn_no: receipt.data.grn_no ?? null } });
});

router.post("/:id/extra-custody/:custodyId/notes", requireOperation, async c => {
  const id = uuid.safeParse(c.req.param("id"));
  const custodyId = uuid.safeParse(c.req.param("custodyId"));
  if (!id.success || !custodyId.success) return c.json({ message: "Invalid Receiving" }, 422);
  const input = await parseJsonBody(c, noteInput);
  if (!input.ok) return c.json(input.body, input.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const custody = await sb.from("receiving_extra_custody").select("id").eq("receipt_id", id.data).eq("id", custodyId.data).maybeSingle();
  if (custody.error) {
    if (missing(custody.error)) return c.json(unavailable, 503);
    const m = mapPgError(custody.error); return c.json(m.body, m.status);
  }
  if (!custody.data) return c.json({ message: "Receiving not found" }, 404);
  const saved = await sb.rpc("receiving_extra_custody_note", { p_custody_id: custodyId.data, p_note: input.data.note, p_key: input.data.key });
  if (saved.error) {
    if (missing(saved.error)) return c.json(unavailable, 503);
    const m = mapPgError(saved.error); return c.json(m.body, m.status);
  }
  const result = noteResult.safeParse(saved.data);
  if (!result.success || result.data.custody_id !== custodyId.data || result.data.actor_id !== c.var.auth.id || result.data.request_key !== input.data.key || result.data.note !== input.data.note) return c.json({ code: "receiving_extra_unknown" }, 502);
  return c.json(result.data, 201);
});
export default router;
