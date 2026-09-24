/**
 * The Work lifecycle doors on `/api/operation/work` (0581, owner rulings
 * 2026-09-24): the read attaches To do / Waiting from the ledger, and the two
 * staff doors record a send or a reply against the CURRENT open occurrence.
 */
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { OperationWorkItem, OperationWorkResponse, WorkOccurrenceEvent } from "@carres/shared";
import { composeOperationWorkResponse, createOperationWorkRouter, type WorkLedger, WorkLedgerRefusal } from "./work";
import type { AppEnv } from "../../types";

const ME = "00000000-0000-4000-8000-0000000000aa";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const OCC = "orders:order-1:missing_delivery_date";

const item: OperationWorkItem = {
  contractVersion: 2,
  id: OCC,
  module: "orders",
  ruleKey: "missing_delivery_date",
  ruleVersion: 1,
  object: { kind: "sales_order", id: "order-1", label: "SO-1318" },
  problem: "No delivery date",
  action: "Ask customer for a delivery date",
  recipient: "Customer",
  requiredResult: "Customer Delivery exists",
  completionPredicate: "orders.delivery_date exists",
  completionStatement: "The customer delivery date is recorded",
  owner: {
    rule: "salesperson", dutyKey: null,
    normal: { userId: ME, name: "Shasha" }, activeCover: null, coverEvidence: null,
    acting: { userId: ME, name: "Shasha" }, state: "primary",
  },
  timing: {
    businessDueOn: "2026-09-17", actionOn: "2026-09-17", placement: "on_day",
    missedAge: { state: "counted", workingDays: 0, basis: { calendarKey: "office", from: "2026-09-17", to: "2026-09-17" } },
    eligibility: "eligible", noDateReason: null,
    calendar: {
      module: { key: "office", source: "purchasing_settings", state: "ready" },
      actor: { key: "person:shasha", source: "people", state: "ready" },
      holidayName: null,
    },
  },
  communication: null, blocker: null, nextConsequence: null,
  interaction: { mode: "open_module", fallbackDestination: "/operation/orders/so/order-1" },
  destination: "/operation/orders/so/order-1",
  observedAt: "2026-09-17T01:00:00.000Z",
  sourceVersion: "orders:v7",
  tone: "warning", locked: false, broken: false,
};

const SOURCES = ["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const;
function feed(items: OperationWorkItem[]): OperationWorkResponse {
  return composeOperationWorkResponse(
    SOURCES.map((key) => ({
      health: { key, state: "healthy" as const, observedAt: "2026-09-17T01:00:00.000Z", lastSuccessfulAt: "2026-09-17T01:00:00.000Z", errorLabel: null },
      items: key === "orders" ? items : [],
    })),
    [],
    "2026-09-17",
  );
}

/** An in-memory ledger with the 0581 doors' rules. */
function memoryLedger(rows: WorkOccurrenceEvent[] = []) {
  const calls: Array<Record<string, unknown>> = [];
  let n = 0;
  const ledger: WorkLedger = {
    async read(_c, ids) { return rows.filter((r) => ids.includes(r.occurrenceId)); },
    async recordRequestSent(_c, args) {
      calls.push({ kind: "request_sent", ...args });
      if (args.channel === ("fax" as never)) throw new WorkLedgerRefusal("invalid", "bad channel");
      n += 1;
      const row: WorkOccurrenceEvent = {
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        occurrenceId: args.occurrenceId, event: "request_sent", actorId: ME,
        at: `2026-09-17T0${n}:00:00.000Z`, channel: args.channel,
        contactKind: args.contactKind, contactId: args.contactId, replyDueOn: args.replyDueOn,
        resultReference: null, sourceVersion: args.sourceVersion,
      };
      rows.push(row);
      return row.id;
    },
    async recordReplyReceived(_c, args) {
      calls.push({ kind: "reply_received", ...args });
      const latest = rows.filter((r) => r.occurrenceId === args.occurrenceId).at(-1);
      if (latest?.event !== "request_sent") throw new WorkLedgerRefusal("work_occurrence_not_waiting", "not waiting");
      n += 1;
      const row: WorkOccurrenceEvent = {
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        occurrenceId: args.occurrenceId, event: "reply_received", actorId: ME,
        at: `2026-09-17T0${n}:00:00.000Z`, channel: args.channel,
        contactKind: args.contactKind, contactId: args.contactId, replyDueOn: null,
        resultReference: null, sourceVersion: args.sourceVersion,
      };
      rows.push(row);
      return row.id;
    },
  };
  return { ledger, calls, rows };
}

function app(items: OperationWorkItem[], ledger: WorkLedger, role = "operation") {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("auth", { id: ME, email: "sha@carres.test", role, dealerId: null, supplierId: null, partnerId: null, outletId: null, warehouseId: null, jwt: "jwt" } as never);
    await next();
  });
  a.route("/api/operation/work", createOperationWorkRouter(async () => feed(items), ledger));
  return a;
}

const post = (a: Hono<AppEnv>, path: string, body: unknown) =>
  a.request(`/api/operation/work/${encodeURIComponent(OCC)}/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

const SEND = { channel: "whatsapp", contactKind: "customer", contactId: CUSTOMER, sourceVersion: "orders:v7", idempotencyKey: "send-0001-abcd" };

describe("GET /api/operation/work attaches the lifecycle from the ledger", () => {
  it("an occurrence with no events is To do; a recorded send is Waiting", async () => {
    const { ledger } = memoryLedger();
    const a = app([item], ledger);
    let body = await (await a.request("/api/operation/work")).json() as OperationWorkResponse;
    expect(body.items[0]!.lifecycle?.state).toBe("to_do");
    expect((await post(a, "request-sent", SEND)).status).toBe(201);
    body = await (await a.request("/api/operation/work")).json() as OperationWorkResponse;
    expect(body.items[0]!.lifecycle).toMatchObject({ state: "waiting", channel: "whatsapp", contactKind: "customer", replyDueOn: "2026-09-18" });
  });

  it("a ledger that cannot be read fails the read instead of pretending everything is To do", async () => {
    const { ledger } = memoryLedger();
    ledger.read = async () => { throw new Error("down"); };
    const response = await app([item], ledger).request("/api/operation/work");
    expect(response.status).toBe(503);
  });
});

describe("POST …/request-sent", () => {
  it("records against the current open occurrence with a Malaysian working-day reply date, and answers Waiting", async () => {
    const { ledger, calls } = memoryLedger();
    const response = await post(app([item], ledger), "request-sent", SEND);
    expect(response.status).toBe(201);
    const body = await response.json() as { lifecycle: { state: string } };
    expect(body.lifecycle.state).toBe("waiting");
    // Thu 17 Sep + 1 office working day = Fri 18 Sep.
    expect(calls).toEqual([{ kind: "request_sent", occurrenceId: OCC, channel: "whatsapp", contactKind: "customer", contactId: CUSTOMER, replyDueOn: "2026-09-18", sourceVersion: "orders:v7", idempotencyKey: "send-0001-abcd" }]);
  });

  it("refuses work that is no longer open — a completed occurrence is never reopened", async () => {
    const { ledger, calls } = memoryLedger();
    const response = await post(app([], ledger), "request-sent", SEND);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "work_occurrence_not_open" });
    expect(calls).toEqual([]);
  });

  it("refuses a stale source version", async () => {
    const { ledger, calls } = memoryLedger();
    const response = await post(app([item], ledger), "request-sent", { ...SEND, sourceVersion: "orders:v6" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "work_stale" });
    expect(calls).toEqual([]);
  });

  it("refuses an unknown channel or contact kind, and a kind without an id", async () => {
    const { ledger } = memoryLedger();
    const a = app([item], ledger);
    expect((await post(a, "request-sent", { ...SEND, channel: "fax" })).status).toBe(422);
    expect((await post(a, "request-sent", { ...SEND, contactKind: "staff" })).status).toBe(422);
    expect((await post(a, "request-sent", { ...SEND, contactId: null })).status).toBe(422);
  });

  it("accepts a send with no known contact", async () => {
    const { ledger } = memoryLedger();
    expect((await post(app([item], ledger), "request-sent", { ...SEND, contactKind: null, contactId: null })).status).toBe(201);
  });

  it("is Operation's", async () => {
    const { ledger } = memoryLedger();
    expect((await post(app([item], ledger, "dealer"), "request-sent", SEND)).status).toBe(403);
  });
});

describe("POST …/reply-received", () => {
  it("returns Waiting work to To do", async () => {
    const { ledger } = memoryLedger();
    const a = app([item], ledger);
    await post(a, "request-sent", SEND);
    const response = await post(a, "reply-received", { channel: "whatsapp", contactKind: "customer", contactId: CUSTOMER, sourceVersion: "orders:v7", idempotencyKey: "reply-0001-abcd" });
    expect(response.status).toBe(201);
    expect((await response.json() as { lifecycle: { state: string } }).lifecycle.state).toBe("to_do");
  });

  it("refuses work that is not waiting, with the ledger's own reason", async () => {
    const { ledger } = memoryLedger();
    const response = await post(app([item], ledger), "reply-received", { channel: "whatsapp", contactKind: null, contactId: null, sourceVersion: "orders:v7", idempotencyKey: "reply-0002-abcd" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "work_occurrence_not_waiting" });
  });

  it("refuses a reply once the module's completion fact is true (the work is no longer open)", async () => {
    const { ledger } = memoryLedger();
    const response = await post(app([], ledger), "reply-received", { channel: "whatsapp", contactKind: null, contactId: null, sourceVersion: "orders:v7", idempotencyKey: "reply-0003-abcd" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "work_occurrence_not_open" });
  });
});
