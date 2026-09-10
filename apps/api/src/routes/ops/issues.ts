import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { addFaultOwnerInputSchema, addIssueMoneyInputSchema, buildIssueEnglish, createIssueInputSchema, issueActionResultInputSchema, issueReviewInputSchema } from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

const router = new Hono<AppEnv>();
const ISSUE_SELECT = "*, issue_actions(*), issue_links(*), issue_evidence(*), issue_staff_involvement(*), issue_fault_owners(*), issue_money_links(*), issue_reviews(*), issue_timeline(*)";

router.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt); const view = c.req.query("view") ?? "all";
  let q = sb.from("issues").select("*, issue_actions(*), issue_links(*), issue_fault_owners(*), issue_money_links(*)").order("observed_on", { ascending: false }).order("issue_no", { ascending: false });
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
  const body = await parse(c, createIssueInputSchema); const sb = userClient(c.env, c.var.auth.jwt);
  const officialEnglish = buildIssueEnglish(body.intake);
  const { data: issue, error } = await sb.from("issues").insert({
    problem_object: body.intake.problemObject, observed_problem: body.intake.observedProblem, source_module: body.sourceModule,
    business_impact: body.intake.impact, materiality: body.materiality, observed_on: body.intake.observedOn,
    affected_object: body.intake.affectedObject, official_english: officialEnglish, optional_detail: body.intake.optionalDetail ?? null,
    recorded_by: c.var.auth.id, found_by_kind: body.intake.foundByKind, found_by_name: body.intake.foundByName,
    review_requirement: body.materiality === "routine" ? "standard" : "full",
  }).select("id,issue_no").single();
  if (error || !issue) throw new HTTPException(500, { message: error?.message ?? "Issue was not recorded" });
  const { error: linkError } = await sb.from("issue_links").insert(body.intake.linkedObjects.map((link) => ({ issue_id: issue.id, object_kind: link.kind, object_id: link.id, object_label: link.label, created_by: c.var.auth.id })));
  if (linkError) throw new HTTPException(500, { message: linkError.message });
  const { error: evidenceError } = await sb.from("issue_evidence").insert(body.intake.evidence.map((proof) => ({ issue_id: issue.id, kind: proof.kind, label: `${proof.count} ${proof.kind.replaceAll("_", " ")}`, added_by: c.var.auth.id })));
  if (evidenceError) throw new HTTPException(500, { message: evidenceError.message });
  const { error: actionError } = await sb.from("issue_actions").insert({ issue_id: issue.id, sequence: 1, trigger: body.currentAction.trigger, owner_rule: body.currentAction.ownerRule, action: body.currentAction.action, recipient: body.currentAction.recipient, required_result: body.currentAction.requiredResult, due_on: body.currentAction.dueOn, opened_by: c.var.auth.id });
  if (actionError) throw new HTTPException(500, { message: actionError.message });
  await sb.from("issues").update({ status: "open" }).eq("id", issue.id);
  return c.json({ id: issue.id, issueNo: issue.issue_no, officialEnglish }, 201);
});

router.get("/reports/:partyId", requireOperationOrPrincipal, async (c) => {
  const partyId = c.req.param("partyId"), month = c.req.query("month"); if (!/^\d{4}-\d{2}$/.test(month ?? "")) throw new HTTPException(400, { message: "Month must use YYYY-MM" });
  const start = `${month}-01`, end = new Date(`${month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data: party } = await sb.from("issue_related_parties").select("*").eq("id", partyId).single();
  const { data, error } = await sb.from("issue_fault_owners").select("*, issues(*, issue_links(*), issue_evidence(*), issue_money_links(*))").eq("related_party_id", partyId).is("superseded_by", null).gte("issues.observed_on", start).lt("issues.observed_on", end.toISOString().slice(0, 10));
  if (error) throw new HTTPException(500, { message: error.message });
  const rows = (data ?? []).map((owner: any) => { const issue = owner.issues; const money = issue?.issue_money_links ?? []; return { issueNo: issue?.issue_no, observedOn: issue?.observed_on, linkedObjects: issue?.issue_links ?? [], description: issue?.official_english, finding: owner.finding, actOrOmission: owner.act_or_omission, evidence: issue?.issue_evidence ?? [], response: owner.response, incurred: money.filter((m: any) => m.track === "incurred").reduce((s: number, m: any) => s + Number(m.amount), 0), recoverable: money.filter((m: any) => m.track === "recoverable" && m.cost_bearer_id === partyId).reduce((s: number, m: any) => s + Number(m.amount), 0), recovered: money.filter((m: any) => m.track === "recovered" && m.cost_bearer_id === partyId).reduce((s: number, m: any) => s + Number(m.amount), 0) }; });
  return c.json({ party, month, sections: { confirmed: rows.filter((r: any) => ["confirmed_fault","contributing_fault"].includes(r.finding)), waiting: rows.filter((r: any) => r.finding === "not_yet_confirmed"), disputed: rows.filter((r: any) => r.response === "disagree") }, totals: { distinctIssues: new Set(rows.map((r: any) => r.issueNo)).size, incurred: rows.reduce((s: number, r: any) => s + r.incurred, 0), recoverable: rows.reduce((s: number, r: any) => s + r.recoverable, 0), recovered: rows.reduce((s: number, r: any) => s + r.recovered, 0) } });
});

router.get("/:id", requireOperationOrPrincipal, async (c) => { const sb = userClient(c.env, c.var.auth.jwt); const { data, error } = await sb.from("issues").select(ISSUE_SELECT).eq("id", c.req.param("id")).single(); if (error || !data) throw new HTTPException(404, { message: "Issue not found" }); return c.json(data); });

router.post("/:id/actions/:actionId/result", requireOperationOrPrincipal, async (c) => { const body = await parse(c, issueActionResultInputSchema), sb = userClient(c.env, c.var.auth.jwt); const { data, error } = await sb.rpc("issue_record_action_result", { p_issue_id: c.req.param("id"), p_action_id: c.req.param("actionId"), p_result_code: body.resultCode, p_result: body.result, p_next_action: body.nextAction ?? null }); if (error) throw new HTTPException(error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 422, { message: error.message }); return c.json(data ?? {}); });

router.post("/:id/fault-owners", requireOperationOrPrincipal, async (c) => { const body = await parse(c, addFaultOwnerInputSchema), sb = userClient(c.env, c.var.auth.jwt); const { data, error } = await sb.from("issue_fault_owners").insert({ issue_id: c.req.param("id"), owner_kind: body.ownerKind, related_party_id: body.relatedPartyId ?? null, staff_id: body.staffId ?? null, owner_name: body.ownerName, finding: body.finding, act_or_omission: body.actOrOmission, response: body.response, response_detail: body.responseDetail ?? null, reviewer_id: c.var.auth.id, reviewed_at: new Date().toISOString(), created_by: c.var.auth.id }).select("id").single(); if (error) throw new HTTPException(500, { message: error.message }); return c.json(data, 201); });
router.post("/:id/money", requireOperationOrPrincipal, async (c) => { const body = await parse(c, addIssueMoneyInputSchema), sb = userClient(c.env, c.var.auth.jwt); const { data, error } = await sb.from("issue_money_links").insert({ issue_id: c.req.param("id"), track: body.track, amount: body.amount, currency: body.currency, event_date: body.eventDate, counterparty_name: body.counterpartyName, cost_bearer_id: body.costBearerId ?? null, reason: body.reason, finance_record_kind: body.financeRecordKind, finance_record_id: body.financeRecordId, recorded_by: c.var.auth.id }).select("id").single(); if (error) throw new HTTPException(500, { message: error.message }); return c.json(data, 201); });
router.post("/:id/review", requireOperationOrPrincipal, async (c) => { const body = await parse(c, issueReviewInputSchema), sb = userClient(c.env, c.var.auth.jwt); const { error } = await sb.from("issue_reviews").insert({ issue_id: c.req.param("id"), reviewer_id: c.var.auth.id, finding: body.finding, training_needed: body.trainingNeeded, sop_change_needed: body.sopChangeNeeded }); if (error) throw new HTTPException(500, { message: error.message }); await sb.from("issues").update({ status: "ready_to_close", discussed_on: body.discussedOn ?? null, training_result: body.trainingResult ?? null, sop_result: body.sopResult ?? null }).eq("id", c.req.param("id")); return c.json({ id: c.req.param("id") }); });

async function parse<S extends import("zod").ZodTypeAny>(c: import("hono").Context<AppEnv>, schema: S): Promise<import("zod").infer<S>> { let raw: unknown; try { raw = await c.req.json(); } catch { throw new HTTPException(400, { message: "Body must be valid JSON" }); } const parsed = schema.safeParse(raw); if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" }); return parsed.data; }
export default router;
