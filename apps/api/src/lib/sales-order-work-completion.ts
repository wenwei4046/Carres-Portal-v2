/**
 * ⭐ THE SALES ORDERS COMPLETED WRITER (0581 · owner rulings, Jess 2026-09-24).
 *
 * Only the owning module's completion fact produces `completed`; Work never
 * marks anything done. Sales Orders owns two Work rules whose completion fact
 * is a Sales Orders write:
 *
 *   ask_delivery_date   the Requested Delivery Date, or the customer's own
 *                       "not yet" (orders.delivery_date / delivery_date_tbd)
 *   delay_planning      the delay decision about the supplier date
 *                       (ops_order_control.delay_decision)
 *
 * (`issue_po` and `confirm_ready_date` close on Purchasing's facts,
 * `resolve_payment_exception` on Finance's, and `issue_delivery_order` is the
 * system's — their writers belong to those modules.)
 *
 * HOW A COMPLETION IS PROVEN — one arithmetic, no second admission rule, and
 * only THIS order and THIS door's rules are ever read (owner correction
 * 2026-09-24 — never the whole Work feed):
 *   1. BEFORE the write, `probeOrderWork` runs the Work projector over this
 *      one order and keeps its open occurrences of the door's rules, with
 *      their current identity, Work date, document reference and version.
 *   2. The Sales Orders door performs ITS write. A refused write records
 *      nothing.
 *   3. AFTER it, the same probe again. An occurrence that was open and is now
 *      gone, AND whose Sales Orders completion fact now holds, is completed —
 *      by the person who performed the write, at that moment.
 * Anything unknown (an order that cannot be read, a fact that cannot be read)
 * records NOTHING and says so in the log: a missing Completed row is honest,
 * a guessed one is not. A recorder failure never undoes the Sales Orders write
 * the operator already made.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { OperationWorkItem } from "@carres/shared";
import type { AppEnv } from "../types";
import { adminClient } from "./supabase";

export const SALES_ORDER_COMPLETION_RULES = ["ask_delivery_date", "delay_planning"] as const;
export type SalesOrderCompletionRule = (typeof SALES_ORDER_COMPLETION_RULES)[number];

export interface SalesOrderOpenOccurrence {
  occurrenceId: string;
  ruleKey: SalesOrderCompletionRule;
  /** The original Work date (null = No working date). */
  actionOn: string | null;
  /** The document reference, `SO-1318`. */
  objectLabel: string;
  sourceVersion: string;
}

/** The Sales Orders facts that close its two rules, read after the write. */
export interface SalesOrderCompletionFacts {
  deliveryDate: string | null;
  deliveryDateTbd: boolean;
  delayDecision: string | null;
  delayDecisionEta: string | null;
}

export interface CompletedWrite {
  occurrenceId: string;
  actorId: string;
  at: string;
  actionOn: string | null;
  objectLabel: string;
  resultReference: string;
  sourceVersion: string;
  idempotencyKey: string;
}

export interface SalesOrderCompletionDeps {
  /** This order's Work occurrences on their current identities (null = an
   *  order Work does not admit). Never the whole feed. */
  probe: (c: Context<AppEnv>, orderId: string) => Promise<OperationWorkItem[] | null>;
  readFacts: (c: Context<AppEnv>, orderId: string) => Promise<SalesOrderCompletionFacts>;
  recordCompleted: (c: Context<AppEnv>, write: CompletedWrite) => Promise<void>;
  now: () => string;
  log: (message: string, detail: Record<string, unknown>) => void;
}

function isCompletionRule(key: string): key is SalesOrderCompletionRule {
  return (SALES_ORDER_COMPLETION_RULES as readonly string[]).includes(key);
}

/** This order's open Sales Orders occurrences in one Work read. */
export function openSalesOrderOccurrences(
  items: readonly OperationWorkItem[],
  orderId: string,
): SalesOrderOpenOccurrence[] {
  return items
    .filter((item) => item.module === "orders" && item.object.id === orderId && isCompletionRule(item.ruleKey))
    .map((item) => ({
      occurrenceId: item.id,
      ruleKey: item.ruleKey as SalesOrderCompletionRule,
      actionOn: item.timing.actionOn,
      objectLabel: item.object.label,
      sourceVersion: item.sourceVersion,
    }));
}

/** The Sales Orders result that closed a rule, or null while it does not hold. */
export function salesOrderCompletionResult(
  ruleKey: SalesOrderCompletionRule,
  facts: SalesOrderCompletionFacts,
): string | null {
  if (ruleKey === "ask_delivery_date") {
    if (facts.deliveryDate) return `orders.delivery_date=${facts.deliveryDate}`;
    if (facts.deliveryDateTbd) return "orders.delivery_date_tbd";
    return null;
  }
  if (facts.delayDecision) {
    return `ops_order_control.delay_decision=${facts.delayDecision}${facts.delayDecisionEta ? `@${facts.delayDecisionEta}` : ""}`;
  }
  return null;
}

async function snapshot(
  c: Context<AppEnv>,
  orderId: string,
  deps: SalesOrderCompletionDeps,
  stage: "before" | "after",
): Promise<SalesOrderOpenOccurrence[] | null> {
  try {
    return openSalesOrderOccurrences((await deps.probe(c, orderId)) ?? [], orderId);
  } catch (error) {
    deps.log("work completion unknown: the order's Work could not be read", {
      orderId, stage, error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Wrap one Sales Orders door. `write` is the door's own handler body; its
 * Response is returned unchanged.
 */
export async function withSalesOrderWorkCompletion(
  c: Context<AppEnv>,
  orderId: string,
  /** The rules THIS door's write can complete — nothing else is observed. */
  rules: readonly SalesOrderCompletionRule[],
  write: () => Promise<Response>,
  deps: SalesOrderCompletionDeps,
): Promise<Response> {
  const before = (await snapshot(c, orderId, deps, "before"))
    ?.filter((occurrence) => rules.includes(occurrence.ruleKey)) ?? null;
  const response = await write();
  if (!response.ok || !before || before.length === 0) return response;

  const after = await snapshot(c, orderId, deps, "after");
  if (!after) return response;
  const stillOpen = new Set(after.map((occurrence) => occurrence.occurrenceId));
  const closed = before.filter((occurrence) => !stillOpen.has(occurrence.occurrenceId));
  if (closed.length === 0) return response;

  let facts: SalesOrderCompletionFacts;
  try {
    facts = await deps.readFacts(c, orderId);
  } catch (error) {
    deps.log("work completion unknown: the Sales Orders facts could not be read", {
      orderId, error: error instanceof Error ? error.message : String(error),
    });
    return response;
  }

  const at = deps.now();
  for (const occurrence of closed) {
    const result = salesOrderCompletionResult(occurrence.ruleKey, facts);
    if (!result) {
      // It left Work for a reason that is not this module's result (the order
      // was cancelled, the goods became ready): that is not a completion.
      deps.log("work left without its completion fact: not recorded as completed", {
        orderId, occurrenceId: occurrence.occurrenceId,
      });
      continue;
    }
    try {
      await deps.recordCompleted(c, {
        occurrenceId: occurrence.occurrenceId,
        actorId: c.var.auth.id,
        at,
        actionOn: occurrence.actionOn,
        objectLabel: occurrence.objectLabel,
        resultReference: result,
        sourceVersion: occurrence.sourceVersion,
        idempotencyKey: `completed:${occurrence.occurrenceId}`,
      });
    } catch (error) {
      deps.log("work completion could not be recorded", {
        orderId, occurrenceId: occurrence.occurrenceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return response;
}

/** The facts, read with the service role: the recorder must see the row even
 *  when the caller's own RLS view of `ops_order_control` is narrower. */
export async function readSalesOrderCompletionFacts(
  c: Context<AppEnv>,
  orderId: string,
): Promise<SalesOrderCompletionFacts> {
  const admin = adminClient(c.env);
  const [order, control] = await Promise.all([
    admin.from("orders").select("delivery_date, delivery_date_tbd").eq("id", orderId).single(),
    admin.from("ops_order_control").select("delay_decision, delay_decision_eta").eq("order_id", orderId).maybeSingle(),
  ]);
  if (order.error) throw new Error(order.error.message);
  if (control.error) throw new Error(control.error.message);
  const o = order.data as { delivery_date: string | null; delivery_date_tbd: boolean | null };
  const k = control.data as { delay_decision: string | null; delay_decision_eta: string | null } | null;
  return {
    deliveryDate: o.delivery_date,
    deliveryDateTbd: o.delivery_date_tbd === true,
    delayDecision: k?.delay_decision ?? null,
    delayDecisionEta: k?.delay_decision_eta ?? null,
  };
}

/** The 0581 completion door — the service role only. Replays are idempotent. */
export async function recordWorkCompleted(c: Context<AppEnv>, write: CompletedWrite): Promise<void> {
  const { error } = await adminClient(c.env).rpc("work_record_completed", {
    p_occurrence_id: write.occurrenceId,
    p_actor_id: write.actorId,
    p_at: write.at,
    p_action_on: write.actionOn,
    p_object_label: write.objectLabel,
    p_result_reference: write.resultReference,
    p_source_version: write.sourceVersion,
    p_idempotency_key: write.idempotencyKey,
  });
  if (error) throw new Error(`${error.details ?? error.code ?? ""} ${error.message}`.trim());
}

/** The production wiring. The probe is loaded lazily: the Work route
 *  imports the Sales Orders routers, so a static import here would be a cycle. */
export function salesOrderCompletionDeps(): SalesOrderCompletionDeps {
  return {
    probe: async (c, orderId) => (await import("../routes/operation/work")).probeOrderWork(c, orderId),
    readFacts: readSalesOrderCompletionFacts,
    recordCompleted: recordWorkCompleted,
    now: () => new Date().toISOString(),
    log: (message, detail) => console.warn(`[work completion] ${message}`, detail),
  };
}

/**
 * The same writer as a middleware in front of a Sales Orders door, so the
 * door's own handler is not touched. `orderId` names the order the write is
 * about (null = not an order write: nothing is observed); `when` skips the two
 * Work reads for a write that cannot touch a completion fact.
 */
export function salesOrderWorkCompletion(
  opts: {
    /** The rules this door's write can complete. */
    rules: readonly SalesOrderCompletionRule[];
    orderId: (c: Context<AppEnv>) => string | null | Promise<string | null>;
    when?: (c: Context<AppEnv>) => boolean | Promise<boolean>;
  },
  deps: () => SalesOrderCompletionDeps = salesOrderCompletionDeps,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const orderId = await opts.orderId(c);
    if (!orderId || (opts.when && !(await opts.when(c)))) {
      await next();
      return;
    }
    await withSalesOrderWorkCompletion(c, orderId, opts.rules, async () => {
      await next();
      return c.res;
    }, deps());
  };
}

/** A body that sets or answers the Requested Delivery Date. */
export async function bodyTouchesDeliveryDate(c: Context<AppEnv>): Promise<boolean> {
  const body = (await c.req.json().catch(() => null)) as { header?: Record<string, unknown> } | null;
  const header = body?.header;
  return Boolean(header && ("delivery_date" in header || "delivery_date_tbd" in header));
}
