import { describe, expect, it } from "vitest";
import {
  operationWorkItemFromProjection,
  operationWorkItemSchema,
  operationWorkStableId,
  type OperationWorkItem,
} from "./operation-work";
import type { WorkItem } from "./work-engine";

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
      destination: "/operation?tab=receiving&session=receipt-1",
      today: "2026-09-06",
    });

    expect(adapted.owner.normal?.name).toBe("Shasha");
    expect(adapted.owner.acting?.name).toBe("Yu Jun");
    expect(adapted.timing.bucket).toBe("overdue");
    expect(adapted.completionFact).toContain("posted Receiving Session");
  });
});
