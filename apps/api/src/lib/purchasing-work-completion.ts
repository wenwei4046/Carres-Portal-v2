/**
 * ⭐ PURCHASING'S COMPLETION FACTS (0584 · owner direction, Jess 2026-09-24).
 *
 *   issue_po                       (object: the Sales Order) a purchase order
 *                                  now serves the order — issued by SO Batch.
 *                                  The PO then waits for goods; silence from
 *                                  the supplier is not work.
 *   purchasing.supplier_date_passed  (object: the PO) a new governed supplier
 *                                  answer on the CURRENT version — a delay
 *                                  carries a governed reason, a new date and
 *                                  at least one WhatsApp screenshot (0585)
 *   purchasing.confirm_tomorrows_delivery  (object: the PO, one occurrence
 *                                  per effective date) the Supplier DO or an
 *                                  evidenced confirmation for that exact date
 *                                  and the PO's own Warehouse (0585)
 *
 * `purchasing.supplier_reply` — waiting for an immediate answer after sending
 * — is RETIRED (2026-09-24) and completes nothing here.
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

export const SUPPLIER_REPLY_RULES = ["purchasing.supplier_date_passed"] as const;

export interface SupplierReplyFacts {
  /** The latest evidenced answer for the PO's CURRENT version, or null. The
   *  probe already proved there was none the moment before this write. */
  answerId: string | null;
  poVersion: number;
  /** The screenshots kept for that answer (0585). */
  screenshotCount: number;
}

export function supplierReplyResult(ruleKey: string, facts: SupplierReplyFacts): string | null {
  if (!(SUPPLIER_REPLY_RULES as readonly string[]).includes(ruleKey) || !facts.answerId) return null;
  // A governed answer carries its WhatsApp screenshot (owner ruling 2026-09-24).
  if (facts.screenshotCount < 1) return null;
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
  const answerId = (answer.data as { id: string } | null)?.id ?? null;
  let screenshotCount = 0;
  if (answerId) {
    const shots = await admin
      .from("po_supplier_answer_screenshots")
      .select("id", { count: "exact", head: true })
      .eq("answer_id", answerId);
    if (shots.error) throw new Error(shots.error.message);
    screenshotCount = shots.count ?? 0;
  }
  return { answerId, poVersion: version, screenshotCount };
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

// ── the day-before check: Supplier DO or evidenced confirmation ──────────────

export const ARRIVAL_CONFIRMATION_RULES = ["purchasing.confirm_tomorrows_delivery"] as const;

export interface ArrivalConfirmationFacts {
  /** The latest confirmation on the PO's CURRENT version, or null. */
  confirmation: { id: string; kind: string; forDate: string } | null;
  poVersion: number;
}

export function arrivalConfirmationResult(ruleKey: string, facts: ArrivalConfirmationFacts): string | null {
  if (!(ARRIVAL_CONFIRMATION_RULES as readonly string[]).includes(ruleKey) || !facts.confirmation) return null;
  const { id, kind, forDate } = facts.confirmation;
  return `po_arrival_confirmations=${id}:${kind}@${forDate}·v${facts.poVersion}`;
}

export async function readArrivalConfirmationFacts(c: Context<AppEnv>, poId: string): Promise<ArrivalConfirmationFacts> {
  const admin = adminClient(c.env);
  const po = await admin.from("purchase_orders").select("version").eq("id", poId).single();
  if (po.error) throw new Error(po.error.message);
  const version = (po.data as { version: number | null }).version ?? 1;
  const row = await admin
    .from("po_arrival_confirmations")
    .select("id, kind, for_date")
    .eq("po_id", poId)
    .eq("po_version", version)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (row.error) throw new Error(row.error.message);
  const data = row.data as { id: string; kind: string; for_date: string } | null;
  return { confirmation: data ? { id: data.id, kind: data.kind, forDate: data.for_date } : null, poVersion: version };
}

export function arrivalConfirmationCompletionSpec(): WorkCompletionSpec<ArrivalConfirmationFacts> {
  return {
    owner: "Purchasing",
    rules: ARRIVAL_CONFIRMATION_RULES,
    probe: probePurchaseOrderWorkLazily,
    readFacts: (c, poId) => readArrivalConfirmationFacts(c, poId),
    result: arrivalConfirmationResult,
  };
}

export function arrivalConfirmationWorkCompletion(
  opts: { when?: (c: Context<AppEnv>) => boolean | Promise<boolean> } = {},
  deps: () => WorkCompletionDeps = workCompletionDeps,
): MiddlewareHandler<AppEnv> {
  return workCompletion({
    when: opts.when,
    targets: (c) => {
      const poId = c.req.param("id");
      return poId ? [{ spec: arrivalConfirmationCompletionSpec(), objectIds: [poId] }] : [];
    },
  }, deps);
}
