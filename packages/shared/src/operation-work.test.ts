import { describe, expect, it } from "vitest";
import {
  operationWorkItemSchema,
  operationWorkStableId,
  type OperationWorkItem,
} from "./operation-work";

const item: OperationWorkItem = {
  id: "orders:SO-1318:missing_delivery_date",
  module: "orders",
  ruleKey: "missing_delivery_date",
  object: { kind: "sales_order", id: "order-1318", label: "SO-1318" },
  problem: "No delivery date",
  action: "Ask customer for a delivery date",
  recipient: "Customer",
  requiredResult: "Customer Delivery exists",
  completionFact: "orders.delivery_date exists",
  owner: {
    rule: "salesperson",
    dutyKey: null,
    normal: { userId: "shasha", name: "Shasha" },
    activeCover: { userId: "yujun", name: "Yu Jun" },
    acting: { userId: "yujun", name: "Yu Jun" },
    state: "covered",
  },
  timing: {
    dueOn: "2026-09-06",
    workingDaysLate: 0,
    bucket: "today",
  },
  destination: "/operation/orders/so/order-1318",
  tone: "warning",
  locked: false,
  broken: false,
};

describe("Operation Work wire contract", () => {
  it("carries object, two-line facts, ownership, closure, timing, and exact door", () => {
    expect(operationWorkItemSchema.parse(item)).toEqual(item);
  });

  it("mints one deterministic identity from module, object, and rule", () => {
    expect(operationWorkStableId("orders", "SO-1318", "missing_delivery_date")).toBe(
      "orders:SO-1318:missing_delivery_date",
    );
  });

  it("rejects an item with no authoritative completion fact or exact door", () => {
    expect(
      operationWorkItemSchema.safeParse({
        ...item,
        completionFact: "",
        destination: "work",
      }).success,
    ).toBe(false);
  });

  it("rejects owner names embedded into the action sentence", () => {
    expect(
      operationWorkItemSchema.safeParse({
        ...item,
        action: "Shasha · Ask customer for a delivery date",
      }).success,
    ).toBe(false);
  });
});

