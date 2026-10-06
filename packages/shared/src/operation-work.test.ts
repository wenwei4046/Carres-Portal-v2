import { describe, expect, it } from "vitest";
import {
  operationWorkItemFromProjection,
  operationWorkItemSchema,
  operationWorkResponseSchema,
  operationWorkSourceKeySchema,
  operationWorkStableId,
  type OperationWorkItem,
} from "./operation-work";
import type { WorkItem } from "./work-engine";

const item: OperationWorkItem = {
  contractVersion: 2,
  id: "orders:SO-1318:missing_delivery_date",
  module: "orders",
  ruleKey: "missing_delivery_date",
  ruleVersion: 1,
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
    coverEvidence: { id: "cover-1", startsOn: "2026-09-06", endsOn: "2026-09-08" },
    acting: { userId: "yujun", name: "Yu Jun" },
    state: "covered",
  },
  timing: {
    businessDueOn: "2026-09-06",
    actionOn: "2026-09-06",
    placement: "on_day",
    missedAge: {
      state: "counted",
      workingDays: 0,
      basis: { calendarKey: "office+person:yujun", from: "2026-09-06", to: "2026-09-06" },
    },
    eligibility: "eligible",
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
  interaction: {
    mode: "open_module",
    fallbackDestination: "/operation/orders/so/order-1318",
  },
  destination: "/operation/orders/so/order-1318",
  observedAt: "2026-09-06T01:00:00.000Z",
  sourceVersion: "orders:2026-09-06T01:00:00.000Z",
  tone: "warning",
  locked: false,
  broken: false,
};

describe("Operation Work wire contract", () => {
  it("carries object, two-line facts, ownership, closure, timing, and exact door", () => {
    expect(operationWorkItemSchema.parse(item)).toEqual(item);
  });

  it("requires an explicit viewer-resolved interaction mode", () => {
    const withoutInteraction = { ...item } as Record<string, unknown>;
    delete withoutInteraction.interaction;
    expect(operationWorkItemSchema.safeParse(withoutInteraction).success).toBe(false);
  });

  it("carries every admission fact for an embedded owning-module action", () => {
    const embedded = operationWorkItemSchema.parse({
      ...item,
      module: "delivery",
      ruleKey: "check_delivery_proof",
      interaction: {
        mode: "embedded",
        actionKey: "delivery.proof_review",
        componentKey: "delivery.proof_review",
        capability: "delivery_proof_review",
        inputContract: "delivery.proof_review.v1",
        evidenceContract: "delivery.attempt_evidence.v1",
        idempotencyKey: "delivery:do-1:proof-review:source-v1",
        staleVersion: "source-v1",
        staleRefusal: "The delivery proof changed. Review the latest proof.",
        successReceipt: "Delivery proof review recorded",
        fallbackDestination: "/operation/delivery-orders/do-1",
      },
    });
    expect(embedded.interaction.mode).toBe("embedded");
  });

  it("requires a reason when the viewer has read-only interaction", () => {
    expect(operationWorkItemSchema.safeParse({
      ...item,
      interaction: {
        mode: "read_only",
        reason: "",
        fallbackDestination: item.destination,
      },
    }).success).toBe(false);
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
        missedAge: { state: "not_calculable", workingDays: null, basis: null },
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
        missedAge: { state: "not_calculable", workingDays: null, basis: null },
        calendar: {
          ...item.timing.calendar,
          actor: { key: "person:yujun", source: "people", state: "read_failed" },
        },
      },
    });
    expect(notConfigured.timing.calendar.actor.state).toBe("not_configured");
    expect(readFailed.timing.calendar.actor.state).toBe("read_failed");
  });

  it("keeps a past action in Missed when its calendar cannot calculate the age", () => {
    const parsed = operationWorkItemSchema.parse({
      ...item,
      timing: {
        ...item.timing,
        actionOn: "2026-09-05",
        placement: "missed",
        missedAge: { state: "not_calculable", workingDays: null, basis: null },
        calendar: {
          ...item.timing.calendar,
          actor: { key: "person:yujun", source: "people", state: "read_failed" },
        },
      },
    });
    expect(parsed.timing.placement).toBe("missed");
    expect(parsed.timing.missedAge).toEqual({ state: "not_calculable", workingDays: null, basis: null });
  });

  it("rejects complete when any requested source is not current", () => {
    const sources = operationWorkSourceKeySchema.options.map((key) => ({
      key,
      state: key === "receiving" ? "failed" as const : "healthy" as const,
      observedAt: item.observedAt,
      lastSuccessfulAt: item.observedAt,
      errorLabel: key === "receiving" ? "Could not refresh Receiving" : null,
    }));
    expect(operationWorkResponseSchema.safeParse({
      contractVersion: 2,
      complete: true,
      items: [item],
      staff: [],
      generatedOn: "2026-09-06",
      closureReceipt: null,
      sources,
    }).success).toBe(false);
  });

  it("requires health for every admitted response source", () => {
    const response = operationWorkResponseSchema.parse({
      contractVersion: 2,
      complete: false,
      items: [item],
      staff: [],
      generatedOn: "2026-09-06",
      closureReceipt: null,
      sources: [
        { key: "orders", state: "healthy", observedAt: item.observedAt, lastSuccessfulAt: item.observedAt, errorLabel: null },
        { key: "purchasing", state: "healthy", observedAt: item.observedAt, lastSuccessfulAt: item.observedAt, errorLabel: null },
        { key: "receiving", state: "failed", observedAt: null, lastSuccessfulAt: null, errorLabel: "Could not refresh Receiving" },
        { key: "delivery", state: "healthy", observedAt: item.observedAt, lastSuccessfulAt: item.observedAt, errorLabel: null },
        { key: "payment", state: "healthy", observedAt: item.observedAt, lastSuccessfulAt: item.observedAt, errorLabel: null },
        { key: "issue_tracker", state: "healthy", observedAt: item.observedAt, lastSuccessfulAt: item.observedAt, errorLabel: null },
      ],
    });
    expect(response.sources).toHaveLength(6);
    expect(response.complete).toBe(false);
  });

  it("accepts only an authoritative, source-versioned closure receipt", () => {
    const receipt = {
      occurrenceId: item.id,
      result: "Proof Accepted",
      actor: { userId: "yujun", name: "Yu Jun" },
      reason: null,
      closedAt: "2026-09-06T02:00:00.000Z",
      sourceVersion: "delivery:review:r1",
    };
    const parsed = operationWorkResponseSchema.parse({
      contractVersion: 2,
      complete: true,
      items: [],
      staff: [],
      generatedOn: "2026-09-06",
      closureReceipt: receipt,
      sources: operationWorkSourceKeySchema.options.map((key) => ({
        key,
        state: "healthy" as const,
        observedAt: item.observedAt,
        lastSuccessfulAt: item.observedAt,
        errorLabel: null,
      })),
    });
    expect(parsed.closureReceipt).toEqual(receipt);
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
    expect(adapted.timing.placement).toBe("missed");
    expect(adapted.completionPredicate).toContain("posted Receiving Session");
    expect(adapted.completionStatement).toBe("The GRN is posted");
  });
});
