/**
 * The shared Completed writer (0581 · owner rulings 2026-09-24), exercised
 * through the Sales Orders spec: only a module write whose own completion
 * fact now holds, on an occurrence the one-object probe showed open just
 * before, becomes `completed`.
 */
import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { OperationWorkItem } from "@carres/shared";
import type { AppEnv } from "../types";
import { salesOrderCompletionResult, type SalesOrderCompletionFacts } from "./sales-order-work-completion";
import {
  workCompletion,
  withWorkCompletion,
  type CompletedWrite,
  type WorkCompletionDeps,
  type WorkCompletionSpec,
} from "./work-completion";

const ME = "00000000-0000-4000-8000-0000000000aa";
const ORDER = "11111111-0000-4000-8000-000000000001";

function occurrence(ruleKey: string, extra: Partial<OperationWorkItem> = {}): OperationWorkItem {
  return {
    contractVersion: 2,
    id: `orders:${ORDER}:${ruleKey}`,
    module: "orders",
    ruleKey,
    ruleVersion: 1,
    object: { kind: "sales_order", id: ORDER, label: "SO-1318" },
    problem: "No delivery date",
    action: "Ask customer for a delivery date",
    recipient: null,
    requiredResult: "Customer Delivery exists",
    completionPredicate: "p",
    completionStatement: "s",
    owner: {
      rule: "salesperson", dutyKey: null, normal: null, activeCover: null, coverEvidence: null,
      acting: null, state: "not_assigned",
    },
    timing: {
      businessDueOn: "2026-09-16", actionOn: ruleKey === "ask_delivery_date" ? null : "2026-09-16",
      placement: ruleKey === "ask_delivery_date" ? "no_working_date" : "on_day",
      missedAge: { state: "not_calculable", workingDays: null, basis: null },
      eligibility: "eligible", noDateReason: ruleKey === "ask_delivery_date" ? "none" : null,
      calendar: {
        module: { key: "office", source: "s", state: "ready" },
        actor: { key: "a", source: "s", state: "ready" },
        holidayName: null,
      },
    },
    communication: null, blocker: null, nextConsequence: null,
    interaction: { mode: "open_module", fallbackDestination: "/x" },
    destination: "/x",
    observedAt: "2026-09-17T01:00:00.000Z",
    sourceVersion: "orders:v7",
    tone: "warning", locked: false, broken: false,
    ...extra,
  } as OperationWorkItem;
}

function harness(opts: {
  before: OperationWorkItem[] | Error;
  after: OperationWorkItem[] | Error;
  facts?: SalesOrderCompletionFacts | Error;
  recordFails?: boolean;
}) {
  const reads: string[] = [];
  const recorded: CompletedWrite[] = [];
  const logs: string[] = [];
  let call = 0;
  const spec = (rules: readonly string[]): WorkCompletionSpec<SalesOrderCompletionFacts> => ({
    owner: "Sales Orders",
    rules,
    probe: async (_c, orderId) => {
      call += 1;
      reads.push(`${call === 1 ? "before" : "after"}:${orderId}`);
      const next = call === 1 ? opts.before : opts.after;
      if (next instanceof Error) throw next;
      return next;
    },
    readFacts: async () => {
      const f = opts.facts ?? { deliveryDate: "2026-10-01", deliveryDateTbd: false, delayDecision: null, delayDecisionEta: null };
      if (f instanceof Error) throw f;
      return f;
    },
    result: salesOrderCompletionResult,
  });
  const deps: WorkCompletionDeps = {
    recordCompleted: async (_c, write) => {
      if (opts.recordFails) throw new Error("ledger down");
      recorded.push(write);
    },
    now: () => "2026-09-17T06:00:00.000Z",
    log: (message) => logs.push(message),
  };
  return { deps, spec, reads, recorded, logs };
}

async function run(
  h: ReturnType<typeof harness>,
  status = 200,
  rules: readonly string[] = ["ask_delivery_date"],
) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", { id: ME, role: "operation", jwt: "jwt" } as never);
    await next();
  });
  app.post("/orders/:id/date", async (c) =>
    withWorkCompletion(c, [{ spec: h.spec(rules), objectIds: [c.req.param("id")] }], async () => c.json({ ok: status < 400 }, status as 200), h.deps),
  );
  return app.request(`/orders/${ORDER}/date`, { method: "POST" });
}

describe("the Sales Orders Completed writer", () => {
  it("an occurrence open before and gone after, with the date now recorded, is completed by the person who wrote it", async () => {
    const h = harness({ before: [occurrence("ask_delivery_date")], after: [] });
    const response = await run(h);
    expect(response.status).toBe(200);
    // Only THIS order is read — twice, never the whole Work feed.
    expect(h.reads).toEqual([`before:${ORDER}`, `after:${ORDER}`]);
    expect(h.recorded).toEqual([{
      occurrenceId: `orders:${ORDER}:ask_delivery_date`,
      actorId: ME,
      at: "2026-09-17T06:00:00.000Z",
      actionOn: null,
      objectLabel: "SO-1318",
      resultReference: "orders.delivery_date=2026-10-01",
      sourceVersion: "orders:v7",
      idempotencyKey: `completed:orders:${ORDER}:ask_delivery_date`,
    }]);
  });

  it("the customer's own 'not yet' is the result too", async () => {
    const h = harness({
      before: [occurrence("ask_delivery_date")], after: [],
      facts: { deliveryDate: null, deliveryDateTbd: true, delayDecision: null, delayDecisionEta: null },
    });
    await run(h);
    expect(h.recorded[0]?.resultReference).toBe("orders.delivery_date_tbd");
  });

  it("a delay decision completes delay_planning with its Work date", async () => {
    const h = harness({
      before: [occurrence("delay_planning")], after: [],
      facts: { deliveryDate: "2026-09-30", deliveryDateTbd: false, delayDecision: "new_date", delayDecisionEta: "2026-10-05" },
    });
    await run(h, 200, ["delay_planning"]);
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0]).toMatchObject({ actionOn: "2026-09-16", resultReference: "ops_order_control.delay_decision=new_date@2026-10-05" });
  });

  it("a refused Sales Orders write records nothing and reads Work only once", async () => {
    const h = harness({ before: [occurrence("ask_delivery_date")], after: [] });
    expect((await run(h, 422)).status).toBe(422);
    expect(h.recorded).toEqual([]);
    expect(h.reads).toEqual([`before:${ORDER}`]);
  });

  it("an occurrence still open after the write is not completed", async () => {
    const h = harness({ before: [occurrence("ask_delivery_date")], after: [occurrence("ask_delivery_date")] });
    await run(h);
    expect(h.recorded).toEqual([]);
  });

  it("an occurrence that left Work without its Sales Orders fact is not a completion", async () => {
    const h = harness({
      before: [occurrence("ask_delivery_date")], after: [],
      facts: { deliveryDate: null, deliveryDateTbd: false, delayDecision: null, delayDecisionEta: null },
    });
    await run(h);
    expect(h.recorded).toEqual([]);
    expect(h.logs).toContain("work left without its completion fact: not recorded as completed");
  });

  it("work never shown as open is never completed (no second admission rule)", async () => {
    const h = harness({ before: [], after: [] });
    await run(h);
    expect(h.recorded).toEqual([]);
    expect(h.reads).toEqual([`before:${ORDER}`]);
  });

  it("an unreadable Work feed before or after records nothing, and the Sales Orders write still stands", async () => {
    const first = harness({ before: new Error("feed down"), after: [] });
    expect((await run(first)).status).toBe(200);
    expect(first.recorded).toEqual([]);
    expect(first.logs[0]).toMatch(/^work completion unknown/);
    const second = harness({ before: [occurrence("ask_delivery_date")], after: new Error("feed down") });
    expect((await run(second)).status).toBe(200);
    expect(second.recorded).toEqual([]);
  });

  it("unreadable facts record nothing", async () => {
    const h = harness({ before: [occurrence("ask_delivery_date")], after: [], facts: new Error("db down") });
    expect((await run(h)).status).toBe(200);
    expect(h.recorded).toEqual([]);
  });

  it("a ledger failure never undoes the write the operator already made", async () => {
    const h = harness({ before: [occurrence("ask_delivery_date")], after: [], recordFails: true });
    const response = await run(h);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(h.logs).toContain("work completion could not be recorded");
  });

  it("a door completes only its own rules", async () => {
    const h = harness({
      before: [occurrence("ask_delivery_date"), occurrence("delay_planning")], after: [],
      facts: { deliveryDate: "2026-10-01", deliveryDateTbd: false, delayDecision: "keep", delayDecisionEta: "2026-09-20" },
    });
    await run(h, 200, ["delay_planning"]);
    expect(h.recorded.map((w) => w.occurrenceId)).toEqual([`orders:${ORDER}:delay_planning`]);
  });

  it("completes the CURRENT generation of a recurring problem", async () => {
    const current = occurrence("delay_planning", { id: `orders:${ORDER}:delay_planning:g2` });
    const h = harness({
      before: [current], after: [],
      facts: { deliveryDate: null, deliveryDateTbd: false, delayDecision: "keep", delayDecisionEta: "2026-09-20" },
    });
    await run(h, 200, ["delay_planning"]);
    expect(h.recorded[0]).toMatchObject({
      occurrenceId: `orders:${ORDER}:delay_planning:g2`,
      idempotencyKey: `completed:orders:${ORDER}:delay_planning:g2`,
    });
  });
});

describe("workCompletion middleware", () => {
  it("wraps the door without touching its handler, and skips both Work reads when the write cannot complete anything", async () => {
    const h = harness({ before: [occurrence("ask_delivery_date")], after: [] });
    const handler = vi.fn(async (c) => c.json({ saved: true }, 201));
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("auth", { id: ME, role: "operation", jwt: "jwt" } as never);
      await next();
    });
    let touches = true;
    app.post(
      "/orders/:id/save",
      workCompletion({ targets: (c) => [{ spec: h.spec(["ask_delivery_date"]), objectIds: [c.req.param("id") ?? ""] }], when: () => touches }, () => h.deps),
      handler,
    );
    let response = await app.request(`/orders/${ORDER}/save`, { method: "POST" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ saved: true });
    expect(h.recorded).toHaveLength(1);

    touches = false;
    const skip = harness({ before: [occurrence("ask_delivery_date")], after: [] });
    const app2 = new Hono<AppEnv>();
    app2.use("*", async (c, next) => {
      c.set("auth", { id: ME, role: "operation", jwt: "jwt" } as never);
      await next();
    });
    app2.post("/orders/:id/save", workCompletion({ targets: (c) => [{ spec: skip.spec(["ask_delivery_date"]), objectIds: [c.req.param("id") ?? ""] }], when: () => touches }, () => skip.deps), handler);
    response = await app2.request(`/orders/${ORDER}/save`, { method: "POST" });
    expect(response.status).toBe(201);
    expect(skip.reads).toEqual([]);
    expect(skip.recorded).toEqual([]);
  });
});
