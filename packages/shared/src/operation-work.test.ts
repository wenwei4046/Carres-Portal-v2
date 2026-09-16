import { describe, expect, it } from "vitest";
import {
  operationWorkItemFromProjection,
  operationWorkItemSchema,
  operationWorkResponseSchema,
  operationWorkStableId,
  type OperationWorkItem,
} from "./operation-work";
import type { WorkItem } from "./work-engine";

const item: OperationWorkItem = {
  contractVersion: 2,
  id: "orders:SO-1318:missing_delivery_date",
  module: "orders",
  ruleKey: "missing_delivery_date",
  object: { kind: "sales_order", id: "order-1318", label: "SO-1318" },
  problem: "No delivery date",
  action: "Ask customer for a delivery date",
  recipient: "Customer",
  requiredResult: "Customer Delivery exists",
  completionPredicate: "orders.delivery_date exists",
  completionStatement: "The customer delivery date is recorded",
  owner: {
    rule: "salesperson",
    dutyKey: null,
    normal: { userId: "shasha", name: "Shasha" },
    activeCover: { userId: "yujun", name: "Yu Jun" },
    acting: { userId: "yujun", name: "Yu Jun" },
    state: "covered",
  },
  timing: {
    businessDueOn: "2026-09-06",
    actionOn: "2026-09-06",
    workingDaysMissed: 0,
    state: "scheduled",
    noDateReason: null,
    calendar: {
      module: { key: "office", source: "purchasing_settings", state: "ready" },
      actor: { key: "person:yujun", source: "people", state: "ready" },
      holidayName: null,
    },
  },
  communication: null,
  blocker: null,
  nextConsequence: null,
  destination: "/operation/orders/so/order-1318",
  observedAt: "2026-09-06T01:00:00.000Z",
  tone: "warning",
  locked: false,
  broken: false,
};

describe("Operation Work wire contract", () => {
  it("carries object, two-line facts, ownership, closure, timing, and exact door", () => {
    expect(operationWorkItemSchema.parse(item)).toEqual(item);
  });

  it("mints one deterministic identity from module, object, and rule", () => {
    expect(operationWorkStableId("orders", "order-1318", "missing_delivery_date")).toBe(
      "orders:order-1318:missing_delivery_date",
    );
  });

  it("rejects an item with no authoritative completion predicate, readable statement, or exact door", () => {
    expect(
      operationWorkItemSchema.safeParse({
        ...item,
        completionPredicate: "",
        completionStatement: "",
        destination: "work",
      }).success,
    ).toBe(false);
  });

  it("keeps a Saturday business deadline separate from its Friday action date", () => {
    const parsed = operationWorkItemSchema.parse({
      ...item,
      timing: {
        ...item.timing,
        businessDueOn: "2026-09-19",
        actionOn: "2026-09-18",
      },
    });
    expect(parsed.timing).toMatchObject({
      businessDueOn: "2026-09-19",
      actionOn: "2026-09-18",
    });
  });

  it("keeps calendar not-configured distinct from calendar read failure", () => {
    const notConfigured = operationWorkItemSchema.parse({
      ...item,
      timing: {
        ...item.timing,
        calendar: {
          ...item.timing.calendar,
          actor: { key: "person:yujun", source: "people", state: "not_configured" },
        },
      },
    });
    const readFailed = operationWorkItemSchema.parse({
      ...item,
      timing: {
        ...item.timing,
        calendar: {
          ...item.timing.calendar,
          actor: { key: "person:yujun", source: "people", state: "read_failed" },
        },
      },
    });
    expect(notConfigured.timing.calendar.actor.state).toBe("not_configured");
    expect(readFailed.timing.calendar.actor.state).toBe("read_failed");
  });

  it("requires health for every admitted response source", () => {
    const response = operationWorkResponseSchema.parse({
      contractVersion: 2,
      complete: false,
      items: [item],
      staff: [],
      generatedOn: "2026-09-06",
      sources: [
        { key: "orders", state: "healthy", observedAt: item.observedAt, lastSuccessfulAt: item.observedAt, errorLabel: null },
        { key: "purchasing", state: "healthy", observedAt: item.observedAt, lastSuccessfulAt: item.observedAt, errorLabel: null },
        { key: "receiving", state: "failed", observedAt: null, lastSuccessfulAt: null, errorLabel: "Could not refresh Receiving" },
        { key: "delivery", state: "healthy", observedAt: item.observedAt, lastSuccessfulAt: item.observedAt, errorLabel: null },
        { key: "payment", state: "healthy", observedAt: item.observedAt, lastSuccessfulAt: item.observedAt, errorLabel: null },
        { key: "issue_tracker", state: "healthy", observedAt: item.observedAt, lastSuccessfulAt: item.observedAt, errorLabel: null },
      ],
      counts: { all: 1, byDay: { "2026-09-06": 1 }, byModule: { orders: 1 }, byOwner: { yujun: 1 } },
    });
    expect(response.sources).toHaveLength(6);
    expect(response.complete).toBe(false);
  });

  it("rejects owner names embedded into the action sentence", () => {
    expect(
      operationWorkItemSchema.safeParse({
        ...item,
        action: "Shasha · Ask customer for a delivery date",
      }).success,
    ).toBe(false);
  });

  it("adapts a module projection without changing its owner identities", () => {
    const projection: WorkItem = {
      ruleKey: "receiving.check_in",
      module: "receiving",
      soRef: "Receiving · Nice Future",
      orderId: "receipt-1",
      action: "Check in PO-2041 from Nice Future",
      ownerRule: "grn_duty",
      ownerDutyKey: "grn_duty",
      normalOwner: { userId: "shasha", name: "Shasha" },
      activeCover: { userId: "yujun", name: "Yu Jun" },
      actingPerson: { userId: "yujun", name: "Yu Jun" },
      ownerState: "covered",
      ownerName: "Yu Jun",
      ownerUserId: "yujun",
      tone: "warning",
      locked: false,
      broken: false,
      dueIso: "2026-09-05",
      workingDaysLate: 1,
    };

    const adapted = operationWorkItemFromProjection(projection, {
      object: { kind: "receiving", id: "receipt-1", label: "PO-2041" },
      problem: "Goods arrived · GRN not posted",
      recipient: "Nice Future",
      requiredResult: "GRN posted",
      completionStatement: "The GRN is posted",
      destination: "/operation?tab=receiving&session=receipt-1",
      today: "2026-09-06",
      calendar: {
        module: { key: "warehouse", source: "warehouse_settings", state: "ready" },
        actor: { key: "person:yujun", source: "people", state: "ready" },
        holidayName: null,
      },
      observedAt: "2026-09-06T01:00:00.000Z",
    });

    expect(adapted.owner.normal?.name).toBe("Shasha");
    expect(adapted.owner.acting?.name).toBe("Yu Jun");
    expect(adapted.timing.state).toBe("missed");
    expect(adapted.completionPredicate).toContain("posted Receiving Session");
    expect(adapted.completionStatement).toBe("The GRN is posted");
  });
});
