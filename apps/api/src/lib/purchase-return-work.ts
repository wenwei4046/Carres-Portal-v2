/**
 * ⭐ PURCHASE RETURN WORK — the creation chain's obligations in the ONE Work
 * feed, and the doors whose facts complete them (Purchasing MASTER §9.6
 * creation door, owner approval 2026-09-25 · Workspace §6.1). Built the way
 * Repair Orders and Supplier Claims are: its own loader, one additive line in
 * `loadOperationWork`, and the PO projections in `work.ts` untouched.
 *
 *   purchase_return.issue                    `Return to supplier`, no PR   → POST /             (object: the claim)
 *   purchase_return.send                     no confirmed send             → POST /:id/send
 *   purchase_return.confirm_tomorrows_pickup day before Confirmed Pickup   → POST /:id/pickup-confirmation
 *   purchase_return.pickup_missed            date passed, nothing collected → POST /:id/pickup-confirmation
 *                                                                             (a new date) or Stock's Outbound handover
 *
 * Nothing here marks anything done: each door is wrapped, the object's
 * occurrences are probed before and after the write, and an occurrence that
 * left AND whose fact now holds is recorded Completed by its writer.
 */
import { Hono, type Context, type MiddlewareHandler } from "hono";
import {
  PURCHASE_RETURN_WORK_RULE,
  projectPurchaseReturnWork,
  purchaseReturnPickupState,
  purchaseReturnSendLine,
  type OperationWorkItem,
  type PurchaseReturnDetail,
  type PurchaseReturnPendingIssue,
  type WorkspaceDutyResolution,
} from "@carres/shared";
import type { AppEnv } from "../types";
import { todayIsoMYT } from "./today";
import { workCompletion, workCompletionDeps, type WorkCompletionDeps, type WorkCompletionSpec } from "./work-completion";

type Source = { pendingIssue: PurchaseReturnPendingIssue[]; returns: PurchaseReturnDetail[] };

async function returnReader(c: Context<AppEnv>): Promise<Hono<AppEnv>> {
  const { default: router } = await import("../routes/operation/purchase-returns");
  const internal = new Hono<AppEnv>();
  internal.use("*", async (child, next) => {
    child.set("auth", c.var.auth);
    await next();
  });
  internal.route("/purchase-returns", router);
  return internal;
}

async function readWorkSource(c: Context<AppEnv>): Promise<Source> {
  const res = await (await returnReader(c)).request("http://workspace.internal/purchase-returns/work-source", {}, c.env);
  if (!res.ok) throw new Error(`Purchase Return work source failed (${res.status})`);
  return (await res.json()) as Source;
}

async function readReturn(c: Context<AppEnv>, id: string): Promise<PurchaseReturnDetail | null> {
  const res = await (await returnReader(c)).request(`http://workspace.internal/purchase-returns/${encodeURIComponent(id)}`, {}, c.env);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Purchase Return read failed (${res.status})`);
  return ((await res.json()) as { purchaseReturn: PurchaseReturnDetail }).purchaseReturn;
}

/** The Work feed's Purchase Return entry. A failed read fails the Purchasing
 *  source honestly rather than showing an empty return desk. */
export async function loadPurchaseReturnWork(
  c: Context<AppEnv>,
  input: { poDuty: WorkspaceDutyResolution | null; today: string; observedAt: string },
): Promise<OperationWorkItem[]> {
  return projectPurchaseReturnWork({ ...(await readWorkSource(c)), ...input });
}

/** ONE object (a claim for `issue`, a PR otherwise), ONE projector — each
 *  occurrence on its current ledger identity. */
async function probe(c: Context<AppEnv>, objectId: string, kind: "claim" | "return"): Promise<OperationWorkItem[] | null> {
  const source = await readWorkSource(c);
  const scoped: Source = kind === "claim"
    ? { pendingIssue: source.pendingIssue.filter((p) => p.id === objectId), returns: [] }
    : { pendingIssue: [], returns: source.returns.filter((r) => r.id === objectId) };
  const items = projectPurchaseReturnWork({ ...scoped, poDuty: null, today: todayIsoMYT() });
  const { readWorkLedger, supabaseWorkLedger } = await import("../routes/operation/work");
  const { currentId } = await readWorkLedger(c, supabaseWorkLedger, items.map((item) => item.id));
  return items.map((item) => ({ ...item, id: currentId.get(item.id) ?? item.id }));
}

type ClaimFacts = { returnIds: string[] } | null;

/** The fact that closed a rule, or null while it does not hold. */
export function purchaseReturnWorkResult(ruleKey: string, facts: PurchaseReturnDetail | ClaimFacts | null, today: string = todayIsoMYT()): string | null {
  if (!facts) return null;
  if ("returnIds" in facts) {
    return ruleKey === PURCHASE_RETURN_WORK_RULE.issue && facts.returnIds.length ? `purchase_returns=${facts.returnIds.join(",")}` : null;
  }
  const pr = facts;
  switch (ruleKey) {
    case PURCHASE_RETURN_WORK_RULE.send:
      return purchaseReturnSendLine(pr).sent ? `document_sends=purchase_return:${pr.id}` : null;
    case PURCHASE_RETURN_WORK_RULE.confirmTomorrowsPickup: {
      const latest = pr.confirmations[pr.confirmations.length - 1];
      return latest && latest.confirmed_pickup_date === pr.confirmed_pickup_date ? `purchase_return_pickup_confirmations=${latest.recorded_at}` : null;
    }
    case PURCHASE_RETURN_WORK_RULE.pickupMissed: {
      if (purchaseReturnPickupState(pr) !== "Not picked up") return "stock_outbound=collected";
      const latest = pr.confirmations[pr.confirmations.length - 1];
      return latest && pr.confirmed_pickup_date && pr.confirmed_pickup_date >= today ? `purchase_return_pickup_confirmations=${latest.recorded_at}` : null;
    }
    default:
      return null;
  }
}

const DOOR_RULES = {
  issue: [PURCHASE_RETURN_WORK_RULE.issue],
  send: [PURCHASE_RETURN_WORK_RULE.send],
  pickup: [PURCHASE_RETURN_WORK_RULE.confirmTomorrowsPickup, PURCHASE_RETURN_WORK_RULE.pickupMissed],
} as const;

function spec(door: keyof typeof DOOR_RULES): WorkCompletionSpec<PurchaseReturnDetail | ClaimFacts | null> {
  const kind = door === "issue" ? "claim" : "return";
  return {
    owner: "Purchasing",
    rules: DOOR_RULES[door],
    probe: (c, id) => probe(c, id, kind),
    readFacts: async (c, id) => {
      if (kind === "return") return readReturn(c, id);
      const res = await (await returnReader(c)).request(`http://workspace.internal/purchase-returns?claim=${encodeURIComponent(id)}`, {}, c.env);
      if (!res.ok) throw new Error(`Purchase Return read failed (${res.status})`);
      const body = (await res.json()) as { returns: PurchaseReturnDetail[] };
      return { returnIds: body.returns.map((r) => r.id) };
    },
    result: (ruleKey, facts) => purchaseReturnWorkResult(ruleKey, facts),
  };
}

/** In front of one Purchase Return door: completes exactly the rules that door
 *  can. The issue door's object is the claim named in its body. */
export function purchaseReturnWorkCompletion(
  door: keyof typeof DOOR_RULES,
  deps: () => WorkCompletionDeps = workCompletionDeps,
): MiddlewareHandler<AppEnv> {
  return workCompletion({
    targets: async (c) => {
      if (door === "issue") {
        let claimId: unknown = null;
        try {
          claimId = ((await c.req.json()) as { claim_id?: unknown }).claim_id;
        } catch {
          claimId = null;
        }
        return typeof claimId === "string" && /^[0-9a-f-]{36}$/i.test(claimId) ? [{ spec: spec(door), objectIds: [claimId] }] : [];
      }
      const id = c.req.param("id");
      return id ? [{ spec: spec(door), objectIds: [id] }] : [];
    },
  }, deps);
}
