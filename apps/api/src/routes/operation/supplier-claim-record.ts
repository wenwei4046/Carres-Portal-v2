/**
 * ⭐ THE SUPPLIER CLAIM RECORD'S READS (Purchasing MASTER §9.5, owner approval
 * 2026-09-25) — mounted on the Supplier Claims router.
 *
 *   GET /work-source   every open claim's Work facts (ask · send · reply)
 *   GET /:id/record    the record page's Supplier / Result / Documents /
 *                      History facts: every reply with its scope, date and
 *                      signed evidence; every confirmed send; the claim's
 *                      Units; who holds PO Duty and the
 *                      Purchasing Approver today; linked RO / PRTN doors
 *
 * Every read goes through the caller's JWT (RLS is the boundary); evidence
 * URLs are signed with the service client only after that read succeeded.
 */
import type { Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
import { chunk } from "../../lib/purchase-demand-read";
import { adminClient, userClient } from "../../lib/supabase";
import { resolveActorNames } from "../../lib/actor-names";
import type { AppEnv } from "../../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
const PAGE = 200;
const SIGNED_URL_TTL_SECONDS = 3600;

async function readAll<T>(ids: readonly string[], query: (batch: string[]) => { range: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }> }): Promise<T[]> {
  const out: T[] = [];
  for (const batch of chunk([...new Set(ids)])) {
    for (let from = 0; ; from += PAGE) {
      const r = await query(batch).range(from, from + PAGE - 1);
      if (r.error) throw r.error;
      const rows = r.data ?? [];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
  }
  return out;
}

export interface ClaimUnitFact {
  id: string;
  unit_code: string | null;
  identity_scope: string;
  qty: number | null;
  status: string | null;
}
export interface ClaimReplyScopeFact {
  scope: "claim" | "units";
  unit_ids: string[];
  supplier_date: string | null;
}

/**
 * The register's extra facts, each read on its own and each allowed to fail
 * ALONE: a failed Unit read prints `Units could not be loaded` on the row, a
 * failed send read leaves `sent` unknown (null), never `false`.
 */
export async function readClaimFacts(sb: Sb, claims: ReadonlyArray<Record<string, unknown>>): Promise<{
  units: Map<string, ClaimUnitFact[]> | null;
  sent: Set<string> | null;
  replies: Map<string, ClaimReplyScopeFact> | null;
}> {
  const ids = claims.map((r) => String(r.id));
  const replyIds = claims.map((r) => r.supplier_response_reply_id).filter(Boolean).map(String);
  const attempt = async <T>(read: () => Promise<T>): Promise<T | null> => {
    try {
      return await read();
    } catch {
      return null;
    }
  };
  const [units, sent, replies] = await Promise.all([
    attempt(async () => {
      const rows = ids.length ? await readAll<Record<string, unknown>>(ids, (b) => sb.from("ops_stock_items").select("id, unit_code, identity_scope, qty, status, hold_claim_id").in("hold_claim_id", b)) : [];
      const m = new Map<string, ClaimUnitFact[]>();
      for (const u of rows) {
        const key = String(u.hold_claim_id);
        m.set(key, [...(m.get(key) ?? []), { id: String(u.id), unit_code: (u.unit_code as string | null) ?? null, identity_scope: String(u.identity_scope ?? "unit"), qty: (u.qty as number | null) ?? null, status: (u.status as string | null) ?? null }]);
      }
      return m;
    }),
    attempt(async () => {
      const rows = ids.length ? await readAll<Record<string, unknown>>(ids, (b) => sb.from("document_sends").select("document_id").eq("document_kind", "supplier_claim").in("document_id", b)) : [];
      return new Set(rows.map((r) => String(r.document_id)));
    }),
    attempt(async () => {
      const rows = replyIds.length ? await readAll<Record<string, unknown>>(replyIds, (b) => sb.from("supplier_claim_replies").select("id, scope, unit_ids, supplier_date").in("id", b)) : [];
      return new Map(rows.map((r) => [String(r.id), { scope: r.scope as "claim" | "units", unit_ids: (r.unit_ids as string[]) ?? [], supplier_date: (r.supplier_date as string | null) ?? null }]));
    }),
  ]);
  return { units, sent, replies };
}

async function dutyActorName(sb: Sb, key: string): Promise<string | null> {
  try {
    const r = await sb.rpc("workspace_resolve_duty", { p_duty_key: key, p_on: null });
    const actor = r?.error ? null : r?.data?.actor_user_id;
    if (typeof actor !== "string" || !actor) return null;
    return (await resolveActorNames(sb, [actor])).get(actor) ?? null;
  } catch {
    return null;
  }
}

export function registerSupplierClaimRecordRoutes(
  router: Hono<AppEnv>,
  gate: (c: Context<AppEnv>) => void,
): void {
  router.get("/work-source", async (c) => {
    gate(c);
    const sb = userClient(c.env, c.var.auth.jwt);
    const claims: Array<Record<string, unknown>> = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from("supplier_claims")
        .select("id, claim_no, status, supplier_id, requested_action, requested_at, supplier_response, reply_waiting_days, escalation_extra_days")
        .eq("status", "open")
        .not("requested_at", "is", null)
        .is("supplier_response", null)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) {
        const m = mapPgError(error);
        return c.json(m.body, m.status);
      }
      claims.push(...(data ?? []));
      if ((data ?? []).length < PAGE) break;
    }
    const ids = claims.map((r) => String(r.id));
    const sentRows = ids.length ? await readAll<Record<string, unknown>>(ids, (b) => sb.from("document_sends").select("document_id").eq("document_kind", "supplier_claim").in("document_id", b)) : [];
    const sent = new Set(sentRows.map((r) => String(r.document_id)));
    const supplierIds = [...new Set(claims.map((r) => r.supplier_id).filter(Boolean).map(String))];
    const suppliers = supplierIds.length ? await readAll<Record<string, unknown>>(supplierIds, (b) => sb.from("suppliers").select("id, name").in("id", b)) : [];
    const names = new Map(suppliers.map((s) => [String(s.id), String(s.name)]));
    return c.json({
      claims: claims.map((r) => ({
        id: String(r.id),
        claim_no: (r.claim_no as string | null) ?? null,
        status: String(r.status),
        supplier_name: names.get(String(r.supplier_id)) ?? null,
        requested_action: (r.requested_action as string | null) ?? null,
        requested_at: (r.requested_at as string | null) ?? null,
        supplier_response: (r.supplier_response as string | null) ?? null,
        sent: sent.has(String(r.id)),
        // 0607 — the timing snapshotted with the ask; the live setting never moves it.
        reply_waiting_days: (r.reply_waiting_days as number | null) ?? null,
        escalation_extra_days: (r.escalation_extra_days as number | null) ?? null,
      })),
    });
  });

  router.get("/:id/record", async (c) => {
    gate(c);
    const sb = userClient(c.env, c.var.auth.jwt);
    const id = c.req.param("id");
    const { data: claim, error } = await sb
      .from("supplier_claims")
      .select("id, claim_no, requested_by, requested_at, responded_by, supplier_response_reply_id")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    if (!claim) throw new HTTPException(404, { message: "claim not found" });

    const [replies, sends, units, repairs, returns] = await Promise.all([
      sb.from("supplier_claim_replies").select("*").eq("claim_id", id).order("recorded_at", { ascending: true }),
      sb.from("document_sends").select("id, version, recipient, channel, note, sent_by, sent_at").eq("document_kind", "supplier_claim").eq("document_id", id).order("sent_at", { ascending: true }),
      sb.from("ops_stock_items").select("id, unit_code, identity_scope, qty, status").eq("hold_claim_id", id),
      sb.from("repair_orders").select("id, ro_no").eq("supplier_claim_id", id),
      sb.from("purchase_returns").select("id, pr_no").eq("supplier_claim_id", id),
    ]);
    for (const r of [replies, sends, units]) {
      if (r.error) {
        const m = mapPgError(r.error);
        return c.json(m.body, m.status);
      }
    }
    const replyRows = (replies.data ?? []) as Array<Record<string, unknown>>;
    const sendRows = (sends.data ?? []) as Array<Record<string, unknown>>;
    const actorIds = [
      claim.requested_by, claim.responded_by,
      ...replyRows.map((r) => r.recorded_by), ...sendRows.map((s) => s.sent_by),
    ].filter(Boolean) as string[];
    const names = await resolveActorNames(sb, actorIds);
    const admin = adminClient(c.env);
    const signed = async (path: string) => {
      const { data } = await admin.storage.from("issue-evidence").createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      return data?.signedUrl ?? null;
    };
    const [poDutyName, approverName] = await Promise.all([
      dutyActorName(sb, "po_duty"),
      dutyActorName(sb, "purchasing_approver"),
    ]);
    return c.json({
      replies: await Promise.all(replyRows.map(async (r) => ({
        id: String(r.id),
        response: String(r.response),
        scope: r.scope,
        unit_ids: (r.unit_ids as string[]) ?? [],
        supplier_date: r.supplier_date ?? null,
        note: r.note ?? null,
        spoke_with: r.spoke_with ?? null,
        spoken_at: r.spoken_at ?? null,
        recorded_at: r.recorded_at,
        recorded_by_name: names.get(String(r.recorded_by)) ?? null,
        formal_at: r.formal_at ?? null,
        current: String(r.id) === String(claim.supplier_response_reply_id ?? ""),
        evidence: await Promise.all(((r.evidence as Array<{ path: string; kind: string }>) ?? []).map(async (e) => ({ ...e, url: await signed(e.path) }))),
      }))),
      sends: sendRows.map((s) => ({ ...s, sent_by_name: names.get(String(s.sent_by)) ?? null })),
      units: units.data ?? [],
      requested_by_name: claim.requested_by ? (names.get(String(claim.requested_by)) ?? null) : null,
      repair_orders: repairs.error ? null : (repairs.data ?? []),
      purchase_returns: returns.error ? null : (returns.data ?? []),
      // No Authorised Outcome writer exists yet (§9.5): `Plan Repair` needs the
      // server to confirm outcome Repair, exact Units and the actor's permission.
      authorised_outcome: null,
      plan_repair: { allowed: false, missing: "Authorised Outcome" },
      po_duty_name: poDutyName,
      approver_name: approverName,
    });
  });
}
