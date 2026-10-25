import { readWarehouseReceivingWorkFact } from "./receiving-work-facts";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { userClient } from "./supabase";
import { workCompletion, workCompletionDeps, type WorkCompletionDeps, type WorkCompletionSpec } from "./work-completion";

export interface ReceivingPostFacts {
  receiptId: string;
  status: string | null;
  grnNo: string | null;
  postedBy: string | null;
  actorId: string;
  postedEventId: string | null;
}

/** A saved report, a refusal or send-back is never a completed receiving. */
export function receivingPostResult(rule: string, facts: ReceivingPostFacts): string | null {
  if (rule !== "receiving.check_in" || facts.status !== "posted" || !facts.grnNo
      || facts.postedBy !== facts.actorId || !facts.postedEventId) return null;
  return `warehouse_receipts=${facts.receiptId};grn=${facts.grnNo};receiving_events=${facts.postedEventId}`;
}

export function receivingCompletionSpec(): WorkCompletionSpec<ReceivingPostFacts> {
  return {
    owner: "Receiving",
    rules: ["receiving.check_in"],
    probe: async (c, id) => (await import("../routes/operation/work")).probeReceivingWork(c, id),
    readFacts: async (c, id, since) => {
      if(c.var.auth.role === "warehouse"){
        const scoped=await readWarehouseReceivingWorkFact(c,id,since);
        return {receiptId:id,status:scoped.receipt.status,grnNo:scoped.receipt.grn_no,postedBy:scoped.receipt.posted_by,actorId:c.var.auth.id,postedEventId:scoped.posted_event_id};
      }
      const sb = userClient(c.env, c.var.auth.jwt);
      const [receipt, events] = await Promise.all([
        sb.from("warehouse_receipts").select("id,status,grn_no,posted_by").eq("id", id).maybeSingle(),
        sb.from("receiving_events").select("id").eq("receipt_id", id).eq("event", "posted")
          .eq("actor_id", c.var.auth.id).gte("event_at", since).order("event_at", { ascending: false }).limit(1),
      ]);
      if (receipt.error || events.error || !receipt.data) throw new Error("Receiving completion could not be read");
      return { receiptId: id, status: receipt.data.status, grnNo: receipt.data.grn_no,
        postedBy: receipt.data.posted_by, actorId: c.var.auth.id, postedEventId: events.data?.[0]?.id ?? null };
    },
    result: receivingPostResult,
  };
}

/** Observe the existing post door; permissions and the atomic Stock writer remain its own. */
export function receivingPostedWorkCompletion(deps: () => WorkCompletionDeps = workCompletionDeps): MiddlewareHandler<AppEnv> {
  return workCompletion({ targets: c => [{ spec: receivingCompletionSpec(), objectIds: [c.req.param("id") ?? ""] }] }, deps);
}
