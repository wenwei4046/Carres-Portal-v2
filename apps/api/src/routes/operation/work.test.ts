import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { OperationWorkItem } from "@carres/shared";
import {
  composeOperationWorkResponse,
  createOperationWorkRouter,
  manualPurchaseWorkInputsFromRegister,
  receivingWorkSourceFromModuleFacts,
  projectManualPurchaseWork,
  projectPurchaseOrderReplyWork,
  projectReceivingWork,
  projectSalesOrderWork,
  projectSalesOrdersFromModuleFacts,
} from "./work";
import type { AppEnv } from "../../types";

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
  it("serves the one composed response from GET /api/operation/work", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("auth", {
        id: "user-1",
        email: "ops@carres.test",
        role: "operation",
        dealerId: null,
        supplierId: null,
        partnerId: null,
        outletId: null,
        warehouseId: null,
        jwt: "jwt",
      });
      await next();
    });
    app.route(
      "/api/operation/work",
      createOperationWorkRouter(async () =>
        composeOperationWorkResponse([[base]], [], "2026-09-06"),
      ),
    );

    const response = await app.request("/api/operation/work");
    expect(response.status).toBe(200);
    const body = await response.json() as { items: OperationWorkItem[] };
    expect(body.items).toHaveLength(1);
  });

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

  it("presents Delivery-owned actions as Delivery objects with Delivery doors", () => {
    const context = {
      orderId: "order-2041",
      so: 2041,
      picName: "Operation PIC",
      picUserId: "pic-1",
      promisedDateIso: "2026-09-08",
      confirmedDateIso: "2026-09-08",
      deliveredAtIso: null,
      delayDetectedAtIso: null,
      delayDecisionAtIso: null,
    };
    const [arrangement] = projectSalesOrderWork({
      open: [{ key: "confirm_delivery_date", track: "delivery", tone: "warning" }],
      context: { ...context, confirmedDateIso: null },
      customer: "Tan Qu Qu",
      today: "2026-09-07",
    });
    expect(arrangement).toMatchObject({
      module: "delivery",
      object: { kind: "delivery_scope", id: "order-2041", label: "SO-2041" },
      destination: "/operation/delivery/edit/order-2041",
    });

    const [run] = projectSalesOrderWork({
      open: [{ key: "deliver_today", track: "delivery", tone: "danger" }],
      context,
      customer: "Tan Qu Qu",
      deliveryOrderNumber: "DO-2041",
      today: "2026-09-08",
    });
    expect(run).toMatchObject({
      id: "delivery:DO-2041:deliver_today",
      module: "delivery",
      object: { kind: "delivery_order", id: "DO-2041", label: "DO-2041" },
      destination: "/operation/delivery-orders/DO-2041",
    });
    expect(run?.action).not.toContain("Operation PIC");
  });

  it("derives Manual Purchase projector input from the module register facts", () => {
    const inputs = manualPurchaseWorkInputsFromRegister({
      requests: [{
        id: "request-2",
        purpose: "ready_stock",
        destination_id: "destination-1",
        why: "Printer toner",
        approval_required: false,
        approved_at: null,
        refused_at: null,
        refuse_reason: null,
        for_service_case_id: null,
        for_staff_user_id: null,
        for_subsidiary_name: null,
      }],
      lines: [{
        request_id: "request-2",
        qty: 2,
        approved_qty: 2,
        issued_qty: 0,
        cancelled_at: null,
        po_id: null,
        po_ids: [],
        supplier_id: "supplier-1",
        order_by: "2026-09-08",
      }],
      destinations: [{ id: "destination-1", name: "Klang" }],
      suppliers: [{ id: "supplier-1", name: "Nice Future" }],
      users: [],
      serviceCases: [],
      pos: [],
    });

    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.status).toBe("ready_to_order");
    expect(inputs[0]?.remainingQty).toBe(2);
    expect(inputs[0]?.recipient).toBe("Nice Future");
    expect(inputs[0]?.context).toContain("Ready Stock");
  });

  it("derives Receiving source only from submitted counts and open PO arrival facts", () => {
    const source = receivingWorkSourceFromModuleFacts({
      receipts: [{
        id: "receipt-1",
        po_id: "PO-1",
        supplier_name: "Nice Future",
        status: "submitted",
        goods_received_at: "2026-09-06",
        submitted_at: "2026-09-06T08:00:00Z",
      }, {
        id: "receipt-2",
        po_id: "PO-2",
        supplier_name: "Done Supplier",
        status: "posted",
        goods_received_at: "2026-09-05",
        submitted_at: "2026-09-05T08:00:00Z",
      }],
      pos: [{
        id: "PO-3",
        status: "open",
        supplier_id: "supplier-3",
        eta_date: "2026-09-06",
        purchase_order_lines: [{ qty: 5, received_qty: 2 }],
      }, {
        id: "PO-4",
        status: "received",
        supplier_id: "supplier-4",
        eta_date: "2026-09-06",
        purchase_order_lines: [{ qty: 5, received_qty: 0 }],
      }],
      suppliers: [
        { id: "supplier-3", name: "Arrival Supplier" },
        { id: "supplier-4", name: "Closed Supplier" },
      ],
    });

    expect(source.submitted.map((row) => row.id)).toEqual(["receipt-1"]);
    expect(source.arrivalsDue).toEqual([{
      po_id: "PO-3",
      supplier_name: "Arrival Supplier",
      eta_date: "2026-09-06",
      pending_qty: 3,
    }]);
  });

  it("projects an Orders route row through shared signals and per-action owners", () => {
    const items = projectSalesOrdersFromModuleFacts({
      orders: [{
        id: "order-9",
        so: 1309,
        status: "proceed_order",
        operation_stage: "in_production",
        customer_name: "Tan Qu Qu",
        delivery_date: null,
        delivery_date_tbd: false,
        placed_at: "2026-09-01",
        do_number: null,
        paid: 0,
        ops_assigned_logistic: null,
        delivery_partner_id: null,
        salesperson_id: "sales-1",
        salespersons: { name: "Shasha" },
        po_skus: [],
        order_lines: [{ sku: "SOFA-1", qty: 1, unit_price: 1000 }],
        order_addons: [],
        order_supplier_threads: [],
        order_finance_exceptions: [],
        ops_sofa_loans: [],
        ops_order_control: {
          assigned_staff: "pic-1",
          booking_stage: null,
          confirmed_date: null,
          delivery_photos: [],
          line_etas: null,
          line_stock_status: null,
        },
      }],
      stock: [{ sku: "SOFA-1", available: 0 }],
      staff: [{ user_id: "pic-1", name: "Order PIC", email: "pic@carres.test" }],
      dutyResolutions: {
        po_duty: {
          dutyKey: "po_duty",
          onDate: "2026-09-06",
          normalOwner: { userId: "po-1", name: "PO Person" },
          buddy: null,
          activeCover: null,
          actingPerson: { userId: "po-1", name: "PO Person" },
          state: "primary",
          assignmentId: "assignment-3",
        },
      },
      today: "2026-09-06",
      safetyDays: 3,
    });

    expect(items.find((item) => item.ruleKey === "issue_po")?.owner.acting?.userId)
      .toBe("po-1");
    expect(items.find((item) => item.ruleKey === "ask_delivery_date")?.owner.acting?.name)
      .toBe("Shasha");
  });

  it("admits supplier reply work from the owning PO facts with PO Duty and the exact PO door", () => {
    const person = { userId: "po-duty", name: "Yu Jun" };
    const [item] = projectPurchaseOrderReplyWork({
      pos: [{
        id: "PO-2041",
        supplier_id: "supplier-1",
        status: "open",
        version: 2,
        promises: [],
        sends: [{
          kind: "confirmed_sent",
          channel: "whatsapp",
          sent_at: "2026-09-03T17:00:00Z",
          po_version: 2,
        }],
        purchase_order_lines: [{ qty: 4, received_qty: 0 }],
      }],
      suppliers: [{ id: "supplier-1", name: "Nice Future" }],
      poDuty: {
        dutyKey: "po_duty",
        onDate: "2026-09-08",
        normalOwner: person,
        buddy: null,
        activeCover: null,
        actingPerson: person,
        state: "primary",
        assignmentId: "assignment-1",
      },
      today: "2026-09-08",
    });

    expect(item).toMatchObject({
      id: "purchasing:PO-2041:purchasing.supplier_reply",
      module: "purchasing",
      object: { kind: "purchase_order", id: "PO-2041", label: "PO-2041" },
      problem: "Supplier has not confirmed the PO date",
      action: "Ask Nice Future to confirm the PO delivery date",
      recipient: "Nice Future",
      owner: { dutyKey: "po_duty", normal: person, acting: person },
      timing: { dueOn: "2026-09-04", workingDaysLate: 2, bucket: "overdue" },
      destination: "/operation?tab=purchase-orders&po=PO-2041",
    });
    expect(item?.action).not.toContain("Yu Jun");
    expect(item?.completionFact).toContain("exact current PO version");
  });
});
