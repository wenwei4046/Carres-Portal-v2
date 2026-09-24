/**
 * ⭐ PURCHASING'S COMPLETION FACTS (0581 · owner direction, Jess 2026-09-24).
 *
 *   issue_po                       (object: the Sales Order) a purchase order
 *                                  now serves the order — issued by SO Batch
 *   purchasing.supplier_reply      (object: the PO) an evidenced supplier
 *   purchasing.supplier_date_passed  answer for the PO's CURRENT version,
 *                                  recorded by this write
 *
 * The proof is the shared writer (work-completion.ts): the one-object probe
 * saw it open before the write, not after, AND the Purchasing fact holds.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { adminClient } from "./supabase";
import { probeOrderWorkLazily } from "./sales-order-work-completion";
import { workCompletion, type WorkCompletionDeps, type WorkCompletionSpec, workCompletionDeps } from "./work-completion";

// ── issue_po — the Sales Order is now served by a purchase order ──────────────

export interface IssuePoFacts {
  /** The purchase orders that serve this order (by `so` or `so_refs`). */
  purchaseOrderIds: string[];
}

export function issuePoResult(ruleKey: string, facts: IssuePoFacts): string | null {
  if (ruleKey !== "issue_po" || facts.purchaseOrderIds.length === 0) return null;
  return `purchase_orders=${[...facts.purchaseOrderIds].sort().join(",")}`;
}

export async function readIssuePoFacts(c: Context<AppEnv>, orderId: string): Promise<IssuePoFacts> {
  const admin = adminClient(c.env);
  const order = await admin.from("orders").select("so").eq("id", orderId).single();
  if (order.error) throw new Error(order.error.message);
  const so = (order.data as { so: number | null }).so;
  if (so === null) return { purchaseOrderIds: [] };
  // The same link the order list and the drawer use: `so` or `so_refs[]`.
  const pos = await admin
    .from("purchase_orders")
    .select("id, status")
    .or(`so.eq.${so},so_refs.cs.{${so}}`);
  if (pos.error) throw new Error(pos.error.message);
  return {
    purchaseOrderIds: ((pos.data ?? []) as Array<{ id: string; status: string | null }>)
      .filter((po) => po.status !== "cancelled")
      .map((po) => po.id),
  };
}

export function issuePoCompletionSpec(): WorkCompletionSpec<IssuePoFacts> {
  return {
    owner: "Purchasing",
    rules: ["issue_po"],
    probe: probeOrderWorkLazily,
    readFacts: (c, orderId) => readIssuePoFacts(c, orderId),
    result: issuePoResult,
  };
}

/** SO Batch names each order it buys for as `build::{orderId}::{build}`. */
export function orderIdsOfSoBatchSelections(body: unknown): string[] {
  const selections = (body as { selections?: Array<{ demandId?: unknown }> } | null)?.selections ?? [];
  const ids = new Set<string>();
  for (const selection of selections) {
    const match = /^build::([0-9a-f-]{36})::/i.exec(String(selection?.demandId ?? ""));
    if (match) ids.add(match[1]!);
  }
  return [...ids];
}

export function soBatchIssueWorkCompletion(
  deps: () => WorkCompletionDeps = workCompletionDeps,
): MiddlewareHandler<AppEnv> {
  return workCompletion({
    targets: async (c) => [{
      spec: issuePoCompletionSpec(),
      objectIds: orderIdsOfSoBatchSelections(await c.req.json().catch(() => null)),
    }],
  }, deps);
}

// ── the supplier's answer to the current PO version ───────────────────────────

export const SUPPLIER_REPLY_RULES = ["purchasing.supplier_reply", "purchasing.supplier_date_passed"] as const;

export interface SupplierReplyFacts {
  /** The latest evidenced answer for the PO's CURRENT version, or null. The
   *  probe already proved there was none the moment before this write. */
  answerId: string | null;
  poVersion: number;
}

export function supplierReplyResult(ruleKey: string, facts: SupplierReplyFacts): string | null {
  if (!(SUPPLIER_REPLY_RULES as readonly string[]).includes(ruleKey) || !facts.answerId) return null;
  return `po_supplier_promises=${facts.answerId}@v${facts.poVersion}`;
}

export async function readSupplierReplyFacts(
  c: Context<AppEnv>,
  poId: string,
): Promise<SupplierReplyFacts> {
  const admin = adminClient(c.env);
  const po = await admin.from("purchase_orders").select("version").eq("id", poId).single();
  if (po.error) throw new Error(po.error.message);
  const version = (po.data as { version: number | null }).version ?? 1;
  const answer = await admin
    .from("po_supplier_promises")
    .select("id")
    .eq("po_id", poId)
    .eq("po_version", version)
    .not("reported_at", "is", null)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (answer.error) throw new Error(answer.error.message);
  return { answerId: (answer.data as { id: string } | null)?.id ?? null, poVersion: version };
}

export async function probePurchaseOrderWorkLazily(c: Context<AppEnv>, poId: string) {
  return (await import("../routes/operation/work")).probePurchaseOrderWork(c, poId);
}

export function supplierReplyCompletionSpec(): WorkCompletionSpec<SupplierReplyFacts> {
  return {
    owner: "Purchasing",
    rules: SUPPLIER_REPLY_RULES,
    probe: probePurchaseOrderWorkLazily,
    readFacts: (c, poId) => readSupplierReplyFacts(c, poId),
    result: supplierReplyResult,
  };
}

export function supplierReplyWorkCompletion(
  opts: { when?: (c: Context<AppEnv>) => boolean | Promise<boolean> } = {},
  deps: () => WorkCompletionDeps = workCompletionDeps,
): MiddlewareHandler<AppEnv> {
  return workCompletion({
    when: opts.when,
    targets: (c) => {
      const poId = c.req.param("id");
      return poId ? [{ spec: supplierReplyCompletionSpec(), objectIds: [poId] }] : [];
    },
  }, deps);
}
