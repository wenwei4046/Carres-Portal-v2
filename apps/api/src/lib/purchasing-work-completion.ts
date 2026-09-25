/**
 * ⭐ PURCHASING'S COMPLETION FACTS (0584 · owner direction, Jess 2026-09-24).
 *
 *   purchasing.po_window           (object: the PO window) no eligible demand
 *                                  is left in the window and every PO issued
 *                                  from it has its CURRENT version marked
 *                                  `PO sent to supplier` (po_sends
 *                                  confirmed_sent). Opening WhatsApp or email
 *                                  completes nothing. The PO then waits for
 *                                  goods; silence from the supplier is not work.
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
import { workCompletion, type WorkCompletionDeps, type WorkCompletionSpec, workCompletionDeps } from "./work-completion";

// ── purchasing.po_window — every PO the window issued is marked sent ─────────

export interface PoWindowSendFacts {
  /** Every PO issued from the window (Work's own window model). */
  poIds: string[];
  /** Eligible demand lines still unbought in the window. */
  demandLeft: number;
  /** TRUE only when the window issued at least one PO and all are sent. */
  allSent: boolean;
}

export function poWindowResult(ruleKey: string, facts: PoWindowSendFacts): string | null {
  if (ruleKey !== "purchasing.po_window" || !facts.allSent || facts.demandLeft > 0) return null;
  return `po_sends=${[...facts.poIds].sort().join(",")}`;
}

export function poWindowCompletionSpec(): WorkCompletionSpec<PoWindowSendFacts> {
  return {
    owner: "Purchasing",
    rules: ["purchasing.po_window"],
    probe: async (c, windowKey) => (await import("../routes/operation/work")).probePoWindowWork(c, windowKey),
    readFacts: async (c, windowKey) => (await import("../routes/operation/work")).poWindowSendFacts(c, windowKey),
    result: poWindowResult,
  };
}

/** `PO sent to supplier` — the one act that can close a PO window. The
 *  windows are named BEFORE the write, from the same model the feed runs. */
export function poSentWorkCompletion(
  deps: () => WorkCompletionDeps = workCompletionDeps,
): MiddlewareHandler<AppEnv> {
  return workCompletion({
    targets: async (c) => [{
      spec: poWindowCompletionSpec(),
      objectIds: await (await import("../routes/operation/work")).poWindowKeysServing(c, c.req.param("id") ?? ""),
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
