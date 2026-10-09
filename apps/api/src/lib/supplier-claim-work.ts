/**
 * ⭐ SUPPLIER CLAIM WORK — the claim's obligations in the ONE Work feed, and
 * the doors whose facts complete them (Purchasing MASTER §9.5, owner approval
 * 2026-09-25 · Workspace §6.1). Built the way Repair Orders are
 * (`repair-order-work.ts`): its own loader, one additive line in
 * `loadOperationWork`, and the PO projections in `work.ts` untouched.
 *
 *   claims.issue_claim         ask recorded, no confirmed send  → POST /:id/send
 *   claims.obtain_reply        sent, no reply                   → POST /:id/response
 *   claims.no_reply_decision   Extra days passed, no reply      → POST /:id/response
 *
 * Nothing here marks anything done: each door is wrapped, the claim's
 * occurrences are probed before and after the write, and an occurrence that
 * left AND whose claim fact now holds is recorded Completed by its writer.
 */
import { Hono, type Context, type MiddlewareHandler } from "hono";
import {
  SUPPLIER_CLAIM_WORK_RULE,
  projectSupplierClaimWork,
  type OperationWorkItem,
  type SupplierClaimFacts,
  type WorkspaceDutyResolution,
} from "@carres/shared";
import type { PurchasingOfficeDays } from "@carres/shared";
import type { AppEnv } from "../types";
import { todayIsoMYT } from "./today";
import { workCompletion, workCompletionDeps, type WorkCompletionDeps, type WorkCompletionSpec } from "./work-completion";

async function claimReader(c: Context<AppEnv>): Promise<Hono<AppEnv>> {
  const { default: router } = await import("../routes/operation/supplier-claims");
  const internal = new Hono<AppEnv>();
  internal.use("*", async (child, next) => {
    child.set("auth", c.var.auth);
    await next();
  });
  internal.route("/supplier-claims", router);
  return internal;
}

type Source = { claims: SupplierClaimFacts[] };

async function readWorkSource(c: Context<AppEnv>): Promise<Source> {
  const res = await (await claimReader(c)).request("http://workspace.internal/supplier-claims/work-source", {}, c.env);
  if (!res.ok) throw new Error(`Supplier Claim work source failed (${res.status})`);
  return (await res.json()) as Source;
}

/** The Work feed's Supplier Claim entry. A failed read fails the Purchasing
 *  source honestly rather than showing an empty claim desk. */
export async function loadSupplierClaimWork(
  c: Context<AppEnv>,
  /** `holidays` = the stored Office calendar (`officeWorkingDayOptions`: weekdays + holidays,
   *  Settings → Office); absent ⇒ Monday–Friday with the built-in list. */
  input: { poDuty: WorkspaceDutyResolution | null; approver: WorkspaceDutyResolution | null; today: string; observedAt: string; holidays?: PurchasingOfficeDays },
): Promise<OperationWorkItem[]> {
  const { claims } = await readWorkSource(c);
  return projectSupplierClaimWork({ claims, ...input });
}

/** ONE claim, ONE projector — each occurrence on its current ledger identity. */
export async function probeSupplierClaimWork(c: Context<AppEnv>, claimId: string): Promise<OperationWorkItem[] | null> {
  const { claims } = await readWorkSource(c);
  const claim = claims.find((row) => row.id === claimId);
  if (!claim) return [];
  const items = projectSupplierClaimWork({ claims: [claim], poDuty: null, approver: null, today: todayIsoMYT() });
  const { readWorkLedger, supabaseWorkLedger } = await import("../routes/operation/work");
  const { currentId } = await readWorkLedger(c, supabaseWorkLedger, items.map((item) => item.id));
  return items.map((item) => ({ ...item, id: currentId.get(item.id) ?? item.id }));
}

type ClaimFacts = { sent: boolean; replyId: string | null } | null;

async function readClaimCompletionFacts(c: Context<AppEnv>, claimId: string): Promise<ClaimFacts> {
  const res = await (await claimReader(c)).request(`http://workspace.internal/supplier-claims/${encodeURIComponent(claimId)}/record`, {}, c.env);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Supplier Claim read failed (${res.status})`);
  const body = (await res.json()) as { sends: unknown[]; replies: Array<{ id: string; current: boolean }> };
  return { sent: body.sends.length > 0, replyId: body.replies.find((r) => r.current)?.id ?? null };
}

/** The claim fact that closed a rule, or null while it does not hold. */
export function supplierClaimWorkResult(ruleKey: string, facts: ClaimFacts): string | null {
  if (!facts) return null;
  switch (ruleKey) {
    case SUPPLIER_CLAIM_WORK_RULE.issueClaim:
      return facts.sent ? "document_sends=supplier_claim" : null;
    case SUPPLIER_CLAIM_WORK_RULE.obtainReply:
    case SUPPLIER_CLAIM_WORK_RULE.noReplyDecision:
      return facts.replyId ? `supplier_claim_replies=${facts.replyId}` : null;
    default:
      return null;
  }
}

export function supplierClaimCompletionSpec(rules: readonly string[]): WorkCompletionSpec<ClaimFacts> {
  return {
    owner: "Purchasing",
    rules,
    probe: probeSupplierClaimWork,
    readFacts: (c, claimId) => readClaimCompletionFacts(c, claimId),
    result: supplierClaimWorkResult,
  };
}

/** In front of one claim door: completes exactly the rules that door can. */
export function supplierClaimWorkCompletion(
  rules: readonly string[],
  deps: () => WorkCompletionDeps = workCompletionDeps,
): MiddlewareHandler<AppEnv> {
  return workCompletion({
    targets: (c) => {
      const id = c.req.param("id");
      return id ? [{ spec: supplierClaimCompletionSpec(rules), objectIds: [id] }] : [];
    },
  }, deps);
}
