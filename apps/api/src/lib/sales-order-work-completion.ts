/**
 * ⭐ SALES ORDERS' COMPLETION FACTS (0584 · owner rulings, Jess 2026-09-24).
 *
 * Sales Orders owns two Work rules whose completion fact is a Sales Orders
 * write:
 *
 *   ask_delivery_date   the Requested Delivery Date, or the customer's own
 *                       "not yet" (orders.delivery_date / delivery_date_tbd)
 *   delay_planning      the delay decision about the supplier date
 *                       (ops_order_control.delay_decision)
 *
 * (`issue_po` and `confirm_ready_date` close on Purchasing's facts — see
 * purchasing-work-completion.ts; `resolve_payment_exception` is Finance's and
 * `issue_delivery_order` the system's.) The proof itself is the shared
 * writer in work-completion.ts, probing only THIS order.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { adminClient } from "./supabase";
import { workCompletion, type WorkCompletionDeps, type WorkCompletionSpec, workCompletionDeps } from "./work-completion";

export const SALES_ORDER_COMPLETION_RULES = ["ask_delivery_date", "delay_planning"] as const;
export type SalesOrderCompletionRule = (typeof SALES_ORDER_COMPLETION_RULES)[number];

/** The Sales Orders facts that close its two rules, read after the write. */
export interface SalesOrderCompletionFacts {
  deliveryDate: string | null;
  deliveryDateTbd: boolean;
  delayDecision: string | null;
  delayDecisionEta: string | null;
}

/** The Sales Orders result that closed a rule, or null while it does not hold. */
export function salesOrderCompletionResult(ruleKey: string, facts: SalesOrderCompletionFacts): string | null {
  if (ruleKey === "ask_delivery_date") {
    if (facts.deliveryDate) return `orders.delivery_date=${facts.deliveryDate}`;
    if (facts.deliveryDateTbd) return "orders.delivery_date_tbd";
    return null;
  }
  if (ruleKey === "delay_planning" && facts.delayDecision) {
    return `ops_order_control.delay_decision=${facts.delayDecision}${facts.delayDecisionEta ? `@${facts.delayDecisionEta}` : ""}`;
  }
  return null;
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

/** The one-order probe, loaded lazily: the Work route imports the Sales
 *  Orders routers, so a static import here would be a cycle. */
export async function probeOrderWorkLazily(c: Context<AppEnv>, orderId: string) {
  return (await import("../routes/operation/work")).probeOrderWork(c, orderId);
}

export function salesOrderCompletionSpec(
  rules: readonly SalesOrderCompletionRule[],
): WorkCompletionSpec<SalesOrderCompletionFacts> {
  return {
    owner: "Sales Orders",
    rules,
    probe: probeOrderWorkLazily,
    readFacts: (c, orderId) => readSalesOrderCompletionFacts(c, orderId),
    result: salesOrderCompletionResult,
  };
}

/** A Sales Orders door: THIS order, THIS door's rules. */
export function salesOrderWorkCompletion(
  opts: {
    rules: readonly SalesOrderCompletionRule[];
    orderId: (c: Context<AppEnv>) => string | null | Promise<string | null>;
    when?: (c: Context<AppEnv>) => boolean | Promise<boolean>;
  },
  deps: () => WorkCompletionDeps = workCompletionDeps,
): MiddlewareHandler<AppEnv> {
  return workCompletion({
    when: opts.when,
    targets: async (c) => {
      const orderId = await opts.orderId(c);
      return orderId ? [{ spec: salesOrderCompletionSpec(opts.rules), objectIds: [orderId] }] : [];
    },
  }, deps);
}

/** A body that sets or answers the Requested Delivery Date. */
export async function bodyTouchesDeliveryDate(c: Context<AppEnv>): Promise<boolean> {
  const body = (await c.req.json().catch(() => null)) as { header?: Record<string, unknown> } | null;
  const header = body?.header;
  return Boolean(header && ("delivery_date" in header || "delivery_date_tbd" in header));
}
