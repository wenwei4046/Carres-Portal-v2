import type { Context } from "hono";
import { operationWorkItemFromProjection, type OperationWorkItem, type WorkspaceDutyResolution } from "@carres/shared";
import type { AppEnv } from "../types";
import { userClient } from "./supabase";
import { todayIsoMYT } from "./today";
import { workCompletion, type WorkCompletionSpec } from "./work-completion";

const RULES = ["orders.amendment_supplier", "orders.amendment_sales"] as const;
type Gates = { supplier_waiting: unknown[]; sales_approval_required: boolean; sales_approval_recorded: boolean };
type Row = { id: string; order_id: string; status: string; so: number; gates: Gates };

// The amendment owns the facts. Work only reads its existing policy; no task
// table, second routing policy, calendar deadline or manual completion.
async function read(c: Context<AppEnv>, id?: string): Promise<Row[]> {
  const sb = userClient(c.env, c.var.auth.jwt);
  const rows: Row[] = [];
  let after: string | null = null;
  for (;;) {
    const result = await sb.rpc("sales_order_amendment_work", { p_id: id ?? null, p_after: after });
    if (result.error) throw new Error(result.error.message);
    const page = (result.data ?? []) as Row[];
    rows.push(...page);
    if (page.length < 200) break;
    after = page[page.length - 1]!.id;
  }
  return rows;
}

export async function loadAmendmentWork(c: Context<AppEnv>, opts: {
  poDuty?: WorkspaceDutyResolution | null; salesApprover?: WorkspaceDutyResolution | null; id?: string;
} = {}): Promise<OperationWorkItem[]> {
  const rows = await read(c, opts.id);
  return rows.flatMap((a) => {
    if (!["submitted", "issued", "accepted"].includes(a.status)) return [];
    return RULES.flatMap((ruleKey) => {
      const supplier = ruleKey === RULES[0];
      if (supplier ? a.gates.supplier_waiting.length === 0 : !a.gates.sales_approval_required || a.gates.sales_approval_recorded) return [];
      const duty = supplier ? "po_duty" : "sales_approver";
      const owner = supplier ? opts.poDuty : opts.salesApprover;
      const action = supplier ? "Record supplier answer" : "Review amendment";
      return [operationWorkItemFromProjection({
        ruleKey, module: "orders", soRef: `SO-${a.so}`, orderId: a.order_id, action,
        ownerRule: duty, ownerDutyKey: duty, normalOwner: owner?.normalOwner ?? null,
        activeCover: owner?.activeCover ?? null, actingPerson: owner?.actingPerson ?? null,
        ownerState: owner?.state ?? "not_assigned", ownerName: owner?.actingPerson?.name ?? null,
        ownerUserId: owner?.actingPerson?.userId ?? null, ownerDuty: supplier ? "PO Duty" : "Sales Approver",
        tone: "info", locked: false, broken: false, dueIso: null, workingDaysLate: 0,
      }, {
        object: { kind: "sales_order", id: a.id, label: `SO-${a.so}` },
        problem: "Amendment request", recipient: null, requiredResult: supplier ? "Supplier answer recorded" : "Amendment decision recorded",
        destination: `/operation/orders/so/${a.order_id}`, today: todayIsoMYT(),
      })];
    });
  });
}

const spec: WorkCompletionSpec<Row | null> = {
  owner: "Sales Orders", rules: RULES,
  probe: async (c, id) => {
    const items = await loadAmendmentWork(c, { id });
    const { readWorkLedger, supabaseWorkLedger } = await import("../routes/operation/work");
    const { currentId } = await readWorkLedger(c, supabaseWorkLedger, items.map((i) => i.id));
    return items.map((item) => ({ ...item, id: currentId.get(item.id) ?? item.id }));
  },
  readFacts: async (c, id) => (await read(c, id))[0] ?? null,
  result: (rule, a) => {
    if (!a) return null;
    if (a.status === "withdrawn") return null;
    if (a.status === "rejected") return rule === RULES[1] ? "sales_order_amendments.status=rejected" : null;
    if (a.status === "applied") return "sales_order_amendments.status=applied";
    if (rule === RULES[0] && a.gates.supplier_waiting.length === 0) return "supplier_confirmations";
    if (rule === RULES[1] && a.gates.sales_approval_recorded) return "sales_approved_terms";
    return null;
  },
};

export const amendmentWorkCompletion = () => workCompletion({
  targets: (c) => { const id = c.req.param("amendmentId"); return id ? [{ spec, objectIds: [id] }] : []; },
});
