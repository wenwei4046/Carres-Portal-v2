import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { addIssueMoneyInputSchema, buildIssueEnglish, createIssueInputSchema, issueActionResultInputSchema } from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { resolveActorNames } from "../../lib/actor-names";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

const router = new Hono<AppEnv>();
const ISSUE_SELECT = "*, issue_actions(*), issue_links(*), issue_evidence(*), issue_staff_involvement(*), issue_fault_owners(*), issue_money_links(*), issue_reviews(*), issue_timeline(*)";
const INVALID_CODES = ["22023", "23514", "23502", "23503", "22P02", "22007", "22008"];

router.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt); const view = c.req.query("view") ?? "all";
  // `Internal issues` filters on the embedded owner, so that embed must be an inner
  // join — a plain embed only empties the array and still returns every Issue.
  const owners = view === "internal" ? "issue_fault_owners!inner(*)" : "issue_fault_owners(*)";
  let q = sb.from("issues").select(`*, issue_actions(*), issue_links(*), ${owners}, issue_money_links(*)`).order("observed_on", { ascending: false }).order("issue_no", { ascending: false });
  if (view === "needs_triage") q = q.eq("status", "needs_triage");
  if (view === "open") q = q.not("status", "in", "(closed,voided)");
  if (view === "wednesday") q = q.or("discussed_on.is.null,status.not.in.(closed,voided)");
  if (view === "internal") q = q.eq("issue_fault_owners.owner_kind", "internal_staff");
  if (view === "waiting_response") q = q.eq("status", "waiting_response");
  if (view === "waiting_review") q = q.eq("status", "waiting_review");
  if (view === "closed") q = q.eq("status", "closed");
  if (view === "voided") q = q.eq("status", "voided");
  const { data, error } = await q; if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ items: data ?? [], total: data?.length ?? 0 });
});

router.get("/related-parties", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt); const { data, error } = await sb.from("issue_related_parties").select("*").eq("active", true).order("name");
  if (error) throw new HTTPException(500, { message: error.message }); return c.json({ items: data ?? [] });
});

router.get("/work-source", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.from("issue_actions").select("id,issue_id,trigger,owner_rule,action,recipient,required_result,due_on,issues!inner(issue_no,materiality)").eq("status", "open").order("due_on");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ actions: (data ?? []).map((row: any) => ({ id: row.id, issueId: row.issue_id, issueNo: row.issues.issue_no, trigger: row.trigger, ownerRule: row.owner_rule, action: row.action, recipient: row.recipient, requiredResult: row.required_result, dueOn: row.due_on, materiality: row.issues.materiality })) });
});
router.post("/related-parties", requireOperationOrPrincipal, async (c) => {
  const raw = await c.req.json<{ name?: string; kind?: string; reportContact?: string; reportRecipient?: string }>();
  if (!raw.name || !["supplier","logistics","warehouse","customer","other"].includes(raw.kind ?? "")) throw new HTTPException(400, { message: "Name and party type are required" });
  const sb = userClient(c.env, c.var.auth.jwt); const { data, error } = await sb.from("issue_related_parties").insert({ name: raw.name.trim(), kind: raw.kind, report_contact: raw.reportContact?.trim() || null, report_recipient: raw.reportRecipient?.trim() || null }).select("*").single();
  if (error) throw new HTTPException(500, { message: error.message }); return c.json(data, 201);
});

router.post("/", requireOperationOrPrincipal, async (c) => {
  const input = await parseOrRefuse(c, createIssueInputSchema); if (!input.ok) return input.res;
  const body = input.data, sb = userClient(c.env, c.var.auth.jwt);
  const officialEnglish = buildIssueEnglish(body.intake);
  // ONE door (0526): the Issue, its links, proof and first action commit together or
  // not at all, and the same request id answers with the Issue it already recorded.
  const { data, error } = await sb.rpc("issue_record_issue", {
    p_request_id: body.requestId,
    p_issue: {
      problem_object: body.intake.problemObject, observed_problem: body.intake.observedProblem, source_module: body.sourceModule,
      business_impact: body.intake.impact, materiality: body.materiality, observed_on: body.intake.observedOn,
      affected_object: body.intake.affectedObject, official_english: officialEnglish, optional_detail: body.intake.optionalDetail ?? null,
      found_by_kind: body.intake.foundByKind, found_by_name: body.intake.foundByName,
    },
    p_links: body.intake.linkedObjects.map((link) => ({ kind: link.kind, id: link.id, label: link.label })),
    p_evidence: body.intake.evidence.map((proof) => ({ kind: proof.kind, label: `${proof.count} ${proof.kind.replaceAll("_", " ")}` })),
    p_action: body.currentAction,
  });
  if (error || !data) {
    const code = error?.code ?? "", message = error?.message ?? "Issue was not recorded";
    if (code === "42501") return c.json({ error: "forbidden", code: "forbidden", message, actingPerson: null }, 403);
    if (code === "23505") return c.json({ error: "conflict", code: "request_already_used", message }, 409);
    if (INVALID_CODES.includes(code)) return c.json({ error: "invalid_param", code: "invalid_param", message }, 422);
    return c.json({ error: "rpc_failed", code: "rpc_failed", message }, 500);
  }
  const issue = data as { id: string; issue_no: string; official_english: string; replayed: boolean };
  return c.json({ id: issue.id, issueNo: issue.issue_no, officialEnglish: issue.official_english, replayed: issue.replayed === true }, issue.replayed ? 200 : 201);
});

router.get("/reports/:partyId", requireOperationOrPrincipal, async (c) => {
  const partyId = c.req.param("partyId"), month = c.req.query("month"); if (!/^\d{4}-\d{2}$/.test(month ?? "")) throw new HTTPException(400, { message: "Month must use YYYY-MM" });
  const start = `${month}-01`, end = new Date(`${month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1); const endDay = end.toISOString().slice(0, 10);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data: party } = await sb.from("issue_related_parties").select("*").eq("id", partyId).single();
  // `issues!inner` makes the database drop owners of other months; the range is
  // re-checked here so a null or out-of-month Issue can never be counted.
  const { data, error } = await sb.from("issue_fault_owners").select("*, issues!inner(*, issue_links(*), issue_evidence(*), issue_money_links(*))").eq("related_party_id", partyId).is("superseded_by", null).gte("issues.observed_on", start).lt("issues.observed_on", endDay);
  if (error) throw new HTTPException(500, { message: error.message });
  const inMonth = (data ?? []).filter((owner: any) => owner.issues && owner.issues.observed_on >= start && owner.issues.observed_on < endDay);
  const rows = inMonth.map((owner: any) => { const issue = owner.issues; const money = issue.issue_money_links ?? []; return { issueId: issue.id, issueNo: issue.issue_no, observedOn: issue.observed_on, linkedObjects: issue.issue_links ?? [], description: issue.official_english, finding: owner.finding, actOrOmission: owner.act_or_omission, evidence: issue.issue_evidence ?? [], response: owner.response, incurred: money.filter((m: any) => m.track === "incurred").reduce((s: number, m: any) => s + Number(m.amount), 0), recoverable: money.filter((m: any) => m.track === "recoverable" && m.cost_bearer_id === partyId).reduce((s: number, m: any) => s + Number(m.amount), 0), recovered: money.filter((m: any) => m.track === "recovered" && m.cost_bearer_id === partyId).reduce((s: number, m: any) => s + Number(m.amount), 0) }; });
  // ONE SECTION PER ROW. A party that disagrees is Disputed, whatever the finding.
  // Otherwise a confirmed or contributing fault is Confirmed, and a not-yet-confirmed
  // finding is Waiting. Totals count each Issue once.
  const disputed = rows.filter((r: any) => r.response === "disagree");
  const confirmed = rows.filter((r: any) => r.response !== "disagree" && ["confirmed_fault","contributing_fault"].includes(r.finding));
  const waiting = rows.filter((r: any) => r.response !== "disagree" && r.finding === "not_yet_confirmed");
  const perIssue = [...new Map([...confirmed, ...waiting, ...disputed].map((r: any) => [r.issueId, r])).values()];
  const sum = (key: "incurred" | "recoverable" | "recovered") => perIssue.reduce((s: number, r: any) => s + r[key], 0);
  return c.json({ party, month, sections: { confirmed, waiting, disputed }, totals: { distinctIssues: perIssue.length, incurred: sum("incurred"), recoverable: sum("recoverable"), recovered: sum("recovered") } });
});

router.get("/:id", requireOperationOrPrincipal, async (c) => { const sb = userClient(c.env, c.var.auth.jwt); const { data, error } = await sb.from("issues").select(ISSUE_SELECT).eq("id", c.req.param("id")).single(); if (error || !data) throw new HTTPException(404, { message: "Issue not found" }); return c.json(data); });

router.post("/:id/actions/:actionId/result", requireOperationOrPrincipal, async (c) => {
  const input = await parseOrRefuse(c, issueActionResultInputSchema); if (!input.ok) return input.res;
  const body = input.data, sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("issue_record_action_result", { p_issue_id: c.req.param("id"), p_action_id: c.req.param("actionId"), p_result_code: body.resultCode, p_result: body.result, p_next_action: body.nextAction ?? null });
  if (!error) return c.json(data ?? {});
  if (error.code === "42501") return c.json({ error: "forbidden", code: "forbidden", message: error.message, actingPerson: await actingPersonFor(sb, c.req.param("actionId")) }, 403);
  if (error.code === "P0002") return c.json({ error: "not_found", code: "action_changed", message: error.message }, 404);
  if (INVALID_CODES.includes(error.code ?? "")) return c.json({ error: "invalid_param", code: "invalid_param", message: error.message }, 422);
  return c.json({ error: "rpc_failed", code: "rpc_failed", message: error.message }, 500);
});

/** Who records this action today: the shared resolver's actor, by name. Fails soft to null. */
async function actingPersonFor(sb: any, actionId: string): Promise<string | null> {
  try {
    const action = await sb.from("issue_actions").select("owner_rule").eq("id", actionId).single();
    const rule = action?.data?.owner_rule;
    if (!rule) return null;
    const duty = await sb.rpc("workspace_resolve_duty", { p_duty_key: rule, p_on: null });
    const actor = duty?.error ? null : duty?.data?.actor_user_id;
    if (typeof actor !== "string" || !actor) return null;
    return (await resolveActorNames(sb, [actor])).get(actor) ?? null;
  } catch {
    return null;
  }
}

router.post("/:id/money", requireOperationOrPrincipal, async (c) => { const body = await parse(c, addIssueMoneyInputSchema), sb = userClient(c.env, c.var.auth.jwt); const { data, error } = await sb.from("issue_money_links").insert({ issue_id: c.req.param("id"), track: body.track, amount: body.amount, currency: body.currency, event_date: body.eventDate, counterparty_name: body.counterpartyName, cost_bearer_id: body.costBearerId ?? null, reason: body.reason, finance_record_kind: body.financeRecordKind, finance_record_id: body.financeRecordId, recorded_by: c.var.auth.id }).select("id").single(); if (error) throw new HTTPException(500, { message: error.message }); return c.json(data, 201); });

async function parse<S extends import("zod").ZodTypeAny>(c: import("hono").Context<AppEnv>, schema: S): Promise<import("zod").infer<S>> { let raw: unknown; try { raw = await c.req.json(); } catch { throw new HTTPException(400, { message: "Body must be valid JSON" }); } const parsed = schema.safeParse(raw); if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" }); return parsed.data; }

/** Like `parse`, but a refusal names the field (`path`) so the dialog can point at the step that is wrong. */
async function parseOrRefuse<S extends import("zod").ZodTypeAny>(c: import("hono").Context<AppEnv>, schema: S): Promise<{ ok: true; data: import("zod").infer<S> } | { ok: false; res: Response }> {
  let raw: unknown; try { raw = await c.req.json(); } catch { return { ok: false, res: c.json({ error: "invalid_input", code: "invalid_input", message: "Body must be valid JSON", path: "" }, 400) }; }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const first = parsed.error.issues[0];
  return { ok: false, res: c.json({ error: "invalid_input", code: "invalid_input", message: first?.message ?? "Invalid input", path: first?.path.join(".") ?? "" }, 400) };
}
export default router;
