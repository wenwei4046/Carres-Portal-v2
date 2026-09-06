import { describe, expect, it } from "vitest";
import type { OperationWorkItem } from "@carres/shared";
import {
  composeOperationWorkResponse,
  projectManualPurchaseWork,
  projectReceivingWork,
  projectSalesOrderWork,
} from "./work";

const base: OperationWorkItem = {
  id: "orders:SO-1318:missing_delivery_date",
  module: "orders",
  ruleKey: "missing_delivery_date",
  object: { kind: "sales_order", id: "order-1", label: "SO-1318" },
  problem: "No delivery date",
  action: "Ask customer for a delivery date",
  recipient: "Customer",
  requiredResult: "Customer Delivery exists",
  completionFact: "orders.delivery_date exists",
  owner: {
    rule: "salesperson",
    dutyKey: null,
    normal: { userId: "shasha", name: "Shasha" },
    activeCover: null,
    acting: { userId: "shasha", name: "Shasha" },
    state: "primary",
  },
  timing: { dueOn: "2026-09-06", workingDaysLate: 0, bucket: "today" },
  destination: "/operation/orders/so/order-1",
  tone: "warning",
  locked: false,
  broken: false,
};

describe("operation Work response composition", () => {
  it("returns one validated set and removes only duplicate stable identities", () => {
    const receiving: OperationWorkItem = {
      ...base,
      id: "receiving:PO-2041:receiving.check_in",
      module: "receiving",
      ruleKey: "receiving.check_in",
      object: { kind: "receiving", id: "receipt-1", label: "PO-2041" },
      problem: "Goods arrived · GRN not posted",
      action: "Check in PO-2041 from Nice Future",
      requiredResult: "GRN posted",
      completionFact: "a posted Receiving Session",
      destination: "/operation?tab=receiving&session=receipt-1",
    };
    const response = composeOperationWorkResponse(
      [[base, base], [receiving]],
      [{ userId: "shasha", name: "Shasha", email: "shasha@carres.test" }],
      "2026-09-06",
    );

    expect(response.items.map((item) => item.id)).toEqual([base.id, receiving.id]);
    expect(response.staff).toHaveLength(1);
    expect(response.generatedOn).toBe("2026-09-06");
  });

  it("rejects an invalid module projection instead of returning a false empty desk", () => {
    expect(() =>
      composeOperationWorkResponse(
        [[{ ...base, completionFact: "" } as OperationWorkItem]],
        [],
        "2026-09-06",
      ),
    ).toThrow();
  });

  it("projects submitted Receiving facts with GRN Duty cover and an exact session door", () => {
    const items = projectReceivingWork({
      source: {
        submitted: [{
          id: "receipt-1",
          po_id: "PO-2041",
          supplier_name: "Nice Future",
          goods_received_at: "2026-09-05",
          submitted_at: "2026-09-05T09:00:00Z",
        }],
        arrivalsDue: [],
      },
      duty: {
        dutyKey: "grn_duty",
        onDate: "2026-09-06",
        normalOwner: { userId: "shasha", name: "Shasha" },
        buddy: { userId: "yujun", name: "Yu Jun" },
        activeCover: { userId: "yujun", name: "Yu Jun" },
        actingPerson: { userId: "yujun", name: "Yu Jun" },
        state: "covered",
        assignmentId: "assignment-1",
      },
      today: "2026-09-06",
      workingDaysLate: () => 1,
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.owner.normal?.userId).toBe("shasha");
    expect(items[0]?.owner.acting?.userId).toBe("yujun");
    expect(items[0]?.destination).toBe(
      "/operation?tab=receiving&session=receipt-1",
    );
    expect(items[0]?.problem).toBe("Goods arrived · GRN not posted");
  });

  it("keeps Manual Purchase approval and PO issuance as separately owned actions", () => {
    const common = {
      requestId: "request-1",
      context: "Manual Purchase · Office use · Klang · Nice Future",
      remainingQty: 2,
      orderBy: "2026-09-06",
      hasPos: false,
      posAllSent: false,
    } as const;
    const poDuty = {
      dutyKey: "po_duty",
      onDate: "2026-09-06",
      normalOwner: { userId: "shasha", name: "Shasha" },
      buddy: { userId: "yujun", name: "Yu Jun" },
      activeCover: { userId: "yujun", name: "Yu Jun" },
      actingPerson: { userId: "yujun", name: "Yu Jun" },
      state: "covered" as const,
      assignmentId: "assignment-1",
    };
    const approval = projectManualPurchaseWork({
      requests: [{ ...common, status: "waiting_approval" }],
      approver: { userId: "jess", name: "Jess" },
      poDuty,
      today: "2026-09-06",
    });
    const issuance = projectManualPurchaseWork({
      requests: [{ ...common, status: "ready_to_order" }],
      approver: { userId: "jess", name: "Jess" },
      poDuty,
      today: "2026-09-06",
    });

    expect(approval[0]?.action).toBe("Approve purchase");
    expect(approval[0]?.owner.acting?.userId).toBe("jess");
    expect(approval[0]?.completionFact).toContain("stored approval or refusal");
    expect(issuance[0]?.action).toBe("Issue PO");
    expect(issuance[0]?.owner.normal?.userId).toBe("shasha");
    expect(issuance[0]?.owner.acting?.userId).toBe("yujun");
    expect(issuance[0]?.destination).toBe(
      "/operation?tab=manual-purchase&mp=request-1",
    );
  });

  it("projects separate Sales Order actions with their own owner rules", () => {
    const poDuty = {
      dutyKey: "po_duty",
      onDate: "2026-09-06",
      normalOwner: { userId: "po-normal", name: "Po Normal" },
      buddy: null,
      activeCover: null,
      actingPerson: { userId: "po-normal", name: "Po Normal" },
      state: "primary" as const,
      assignmentId: "assignment-2",
    };
    const items = projectSalesOrderWork({
      open: [{ key: "issue_po", track: "goods", tone: "warning" }],
      context: {
        orderId: "order-1318",
        so: 1318,
        picName: "Order PIC",
        picUserId: "pic-1",
        dutyResolutions: { po_duty: poDuty },
        salespersonName: "Shasha",
        askDeliveryDate: true,
        promisedDateIso: null,
        confirmedDateIso: null,
        deliveredAtIso: null,
        delayDetectedAtIso: null,
        delayDecisionAtIso: null,
      },
      customer: "Tan Qu Qu",
      today: "2026-09-06",
    });

    const issuePo = items.find((item) => item.ruleKey === "issue_po");
    const askDate = items.find((item) => item.ruleKey === "ask_delivery_date");
    expect(issuePo?.owner.rule).toBe("po_duty");
    expect(issuePo?.owner.acting?.userId).toBe("po-normal");
    expect(askDate?.owner.rule).toBe("salesperson");
    expect(askDate?.owner.acting?.name).toBe("Shasha");
    expect(askDate?.object.label).toBe("SO-1318");
    expect(askDate?.problem).toBe("No delivery date");
    expect(askDate?.destination).toBe("/operation/orders/so/order-1318");
  });
});
