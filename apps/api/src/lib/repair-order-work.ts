/**
 * ⭐ REPAIR ORDER WORK — the RO's obligations in the ONE Work feed, and the
 * doors whose facts complete them (Purchasing MASTER §9.7 · §10, Workspace §6).
 *
 * The projector is `repairOrderWorkItems` (shared) over the RO object read —
 * the same `assemble` the register and the object page print — so Work, the
 * object page's CURRENT ACTION and the completion probe read ONE set of facts.
 *
 * Completion (the 0584 writer, `work-completion.ts`): each door is wrapped, the
 * RO's occurrences are probed before and after the write, and an occurrence
 * that left AND whose RO fact now holds is recorded Completed by the person
 * who wrote it. Nothing here marks anything done by itself:
 *
 *   POST /:id/issue             repair_order.issue              confirmed send of the current version
 *   POST /:id/supplier-receipt  repair_order.confirm_receipt    evidenced Supplier receipt
 *   POST /:id/owner-consent     repair_order.owner_consent      `given` consent for every such Unit
 *   POST /:id/cancel            repair_order.return_date_passed the RO cancelled (an authorised outcome)
 *   Receiving arrival post      repair_order.return_date_passed every Unit received back (GRN)
 *
 * `POST /:id/supplier-reply` is deliberately NOT wrapped: a Supplier reply or
 * a new Supplier date never completes the return follow-up (2026-09-28).
 */
import { Hono, type Context, type MiddlewareHandler } from "hono";
import {
  REPAIR_ORDER_WORK_RULE,
  projectRepairOrderWork,
  repairOrderConsentOutstanding,
  type OperationWorkItem,
  type RepairOrderDetail,
  type WorkspaceDutyResolution,
} from "@carres/shared";
import type { PurchasingOfficeDays } from "@carres/shared";
import type { AppEnv } from "../types";
import { userClient } from "./supabase";
import { todayIsoMYT } from "./today";
import { workCompletion, workCompletionDeps, type WorkCompletionDeps, type WorkCompletionSpec } from "./work-completion";

/** The one mapping lives in `@carres/shared` (the feed, this probe and the
 *  dev preview run the same function). */
export { projectRepairOrderWork, repairOrderDestination } from "@carres/shared";

/** The Work feed's Repair Order entry: every open RO (`GET /work-source`,
 *  the object page's own shape) projected for PO Duty. Its own function so the
 *  PO projections in `work.ts` stay untouched; a failed read fails the
 *  Purchasing source honestly rather than showing an empty repair desk. */
export async function loadRepairOrderWork(
  c: Context<AppEnv>,
  /** `holidays` = the stored Office calendar (`officeWorkingDayOptions`: weekdays + holidays,
   *  Settings → Office); absent ⇒ Monday–Friday with the built-in list. */
  input: { poDuty: WorkspaceDutyResolution | null; today: string; observedAt: string; holidays?: PurchasingOfficeDays },
): Promise<OperationWorkItem[]> {
  const res = await (await repairOrderReader(c)).request("http://workspace.internal/repair-orders/work-source", {}, c.env);
  if (!res.ok) throw new Error(`Repair Order work source failed (${res.status})`);
  const { repairOrders } = (await res.json()) as { repairOrders: RepairOrderDetail[] };
  return projectRepairOrderWork({ repairOrders, ...input });
}

async function repairOrderReader(c: Context<AppEnv>): Promise<Hono<AppEnv>> {
  const { default: router } = await import("../routes/operation/repair-orders");
  const internal = new Hono<AppEnv>();
  internal.use("*", async (child, next) => {
    child.set("auth", c.var.auth);
    await next();
  });
  internal.route("/repair-orders", router);
  return internal;
}

/** The RO object read, as the caller (RLS), through the RO router itself. */
export async function readRepairOrderDetail(c: Context<AppEnv>, roId: string): Promise<RepairOrderDetail | null> {
  const res = await (await repairOrderReader(c)).request(`http://workspace.internal/repair-orders/${encodeURIComponent(roId)}`, {}, c.env);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Repair Order read failed (${res.status})`);
  return ((await res.json()) as { repairOrder: RepairOrderDetail }).repairOrder;
}

/** ONE RO, ONE PROJECTOR — each occurrence on its current ledger identity.
 *  PO Duty decides WHO, never WHETHER, so it is not read here. */
export async function probeRepairOrderWork(c: Context<AppEnv>, roId: string): Promise<OperationWorkItem[] | null> {
  const ro = await readRepairOrderDetail(c, roId);
  if (!ro) return null;
  const items = projectRepairOrderWork({ repairOrders: [ro], poDuty: null, today: todayIsoMYT() });
  const { readWorkLedger, supabaseWorkLedger } = await import("../routes/operation/work");
  const { currentId } = await readWorkLedger(c, supabaseWorkLedger, items.map((item) => item.id));
  return items.map((item) => ({ ...item, id: currentId.get(item.id) ?? item.id }));
}

/** The RO fact that closed a rule, or null while it does not hold. */
export function repairOrderWorkResult(ruleKey: string, ro: RepairOrderDetail | null): string | null {
  if (!ro) return null;
  switch (ruleKey) {
    case REPAIR_ORDER_WORK_RULE.issue:
      return ro.issued ? `document_sends=repair_order:${ro.id}@v${ro.version}` : null;
    case REPAIR_ORDER_WORK_RULE.confirmReceipt:
      return ro.supplier_received_at ? `repair_orders.supplier_received_at=${ro.supplier_received_at}` : null;
    case REPAIR_ORDER_WORK_RULE.returnDatePassed: {
      if (ro.cancelled_at) return `repair_orders.cancelled_at=${ro.cancelled_at}`;
      if (ro.units.length === 0 || ro.units.some((u) => !u.goods_received_date)) return null;
      const grns = [...new Set(ro.units.map((u) => u.grn_no).filter((g): g is string => Boolean(g)))].sort();
      return `grn=${grns.join(",") || "posted"}`;
    }
    case REPAIR_ORDER_WORK_RULE.ownerConsent: {
      if (ro.cancelled_at || repairOrderConsentOutstanding(ro).length > 0) return null;
      const given = ro.consents.filter((c) => c.outcome === "given").map((c) => c.id);
      return given.length ? `repair_order_owner_consents=${given.join(",")}` : null;
    }
    default:
      return null;
  }
}

export function repairOrderCompletionSpec(rules: readonly string[]): WorkCompletionSpec<RepairOrderDetail | null> {
  return {
    owner: "Purchasing",
    rules,
    probe: probeRepairOrderWork,
    readFacts: (c, roId) => readRepairOrderDetail(c, roId),
    result: repairOrderWorkResult,
  };
}

/** In front of one RO door: completes exactly the rules that door can. */
export function repairOrderWorkCompletion(
  rules: readonly string[],
  deps: () => WorkCompletionDeps = workCompletionDeps,
): MiddlewareHandler<AppEnv> {
  return workCompletion({
    targets: (c) => {
      const roId = c.req.param("id");
      return roId ? [{ spec: repairOrderCompletionSpec(rules), objectIds: [roId] }] : [];
    },
  }, deps);
}

/** In front of Receiving's arrival post: a repair-return source names its RO;
 *  every other arrival source observes nothing. */
export function repairOrderReturnWorkCompletion(
  deps: () => WorkCompletionDeps = workCompletionDeps,
): MiddlewareHandler<AppEnv> {
  return workCompletion({
    targets: async (c) => {
      const sourceId = c.req.param("sourceId");
      if (!sourceId || !/^[0-9a-f-]{36}$/i.test(sourceId)) return [];
      const { data, error } = await userClient(c.env, c.var.auth.jwt)
        .from("arrival_sources").select("repair_order_id").eq("id", sourceId).maybeSingle();
      if (error) throw new Error(error.message);
      const roId = (data as { repair_order_id: string | null } | null)?.repair_order_id ?? null;
      return roId ? [{ spec: repairOrderCompletionSpec([REPAIR_ORDER_WORK_RULE.returnDatePassed]), objectIds: [roId] }] : [];
    },
  }, deps);
}
