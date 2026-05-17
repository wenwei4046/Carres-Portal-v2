import { describe, expect, it } from "vitest";
import { orderInputToRpcPayload, orderSupplierThreadFromRow } from "./adapters";
import type { OrderSupplierThreadRow } from "./db-types";
import type { CreateOrderInput } from "./schemas/orders";

const DEALER_ID = "00000000-0000-0000-0000-000000000d01";

function baseInput(over: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    outletId: "00000000-0000-0000-0000-00000000ee01",
    salespersonId: "00000000-0000-0000-0000-00000000ff01",
    customer: {
      name: "Tan Mei Ling",
      phone: "012-3456789",
      address: "123 Jalan Sample, 50000 KL",
      addressUnknown: false,
      billing: null,
      billingSame: true,
      emergency: "Tan Junior · 012-9988776 · Spouse",
    },
    delivery: { date: "2026-06-01", dateTbd: false, floor: 1, hasLift: false },
    lines: [
      {
        sku: "mattress:carres-classic:queen",
        qty: 1,
        attrs: null,
        unitPrice: 1500,
      },
    ],
    addons: [],
    paid: 750,
    signaturePath: "orders-attachments/00000000-0000-0000-0000-000000000d01/abc/signature.png",
    paymentSlipPath: null,
    termsAccepted: true,
    depositPct: 50,
    paymentMethod: "online",
    approvalCode: null,
    installmentMonths: null,
    ...over,
  };
}

describe("orderInputToRpcPayload", () => {
  it("snake-cases the customer + delivery fields and forwards dealer_id", () => {
    const out = orderInputToRpcPayload(baseInput(), DEALER_ID);
    expect(out.dealer_id).toBe(DEALER_ID);
    expect(out.outlet_id).toBe("00000000-0000-0000-0000-00000000ee01");
    expect(out.salesperson_id).toBe("00000000-0000-0000-0000-00000000ff01");
    expect(out.customer_name).toBe("Tan Mei Ling");
    expect(out.customer_phone).toBe("012-3456789");
    expect(out.customer_emergency).toBe("Tan Junior · 012-9988776 · Spouse");
    expect(out.delivery_date).toBe("2026-06-01");
    expect(out.delivery_date_tbd).toBe(false);
    expect(out.delivery_floor).toBe(1);
    expect(out.delivery_has_lift).toBe(false);
  });

  it("nulls customer_address when addressUnknown is true", () => {
    const out = orderInputToRpcPayload(
      baseInput({
        customer: {
          ...baseInput().customer,
          addressUnknown: true,
          address: "",
        },
      }),
      DEALER_ID,
    );
    expect(out.customer_address).toBeNull();
    expect(out.customer_address_unknown).toBe(true);
  });

  it("nulls customer_billing when billingSame is true", () => {
    const out = orderInputToRpcPayload(baseInput(), DEALER_ID);
    expect(out.customer_billing).toBeNull();
    expect(out.customer_billing_same).toBe(true);
  });

  it("forwards customer_billing when billingSame is false", () => {
    const out = orderInputToRpcPayload(
      baseInput({
        customer: {
          ...baseInput().customer,
          billingSame: false,
          billing: "456 Other Address, KL",
        },
      }),
      DEALER_ID,
    );
    expect(out.customer_billing).toBe("456 Other Address, KL");
    expect(out.customer_billing_same).toBe(false);
  });

  it("nulls delivery_date when dateTbd is true", () => {
    const out = orderInputToRpcPayload(
      baseInput({
        delivery: { date: null, dateTbd: true, floor: 1, hasLift: false },
      }),
      DEALER_ID,
    );
    expect(out.delivery_date).toBeNull();
    expect(out.delivery_date_tbd).toBe(true);
  });

  it("maps lines with snake_case unit_price", () => {
    const out = orderInputToRpcPayload(
      baseInput({
        lines: [
          {
            sku: "bedframe:oslo:queen",
            qty: 2,
            attrs: { color: "walnut", gap: "12cm" },
            unitPrice: 800,
          },
        ],
      }),
      DEALER_ID,
    );
    expect(out.lines).toEqual([
      {
        sku: "bedframe:oslo:queen",
        qty: 2,
        attrs: { color: "walnut", gap: "12cm" },
        unit_price: 800,
      },
    ]);
  });

  it("maps addons with snake_case addon_key + unit_price", () => {
    const out = orderInputToRpcPayload(
      baseInput({
        addons: [
          { addonKey: "warranty5", qty: 1, unitPrice: 200 },
          { addonKey: "dispose-mattress", qty: 1, unitPrice: 50 },
        ],
      }),
      DEALER_ID,
    );
    expect(out.addons).toEqual([
      { addon_key: "warranty5", qty: 1, unit_price: 200 },
      { addon_key: "dispose-mattress", qty: 1, unit_price: 50 },
    ]);
  });

  it("forwards storage paths verbatim", () => {
    const out = orderInputToRpcPayload(
      baseInput({
        signaturePath: "orders-attachments/dealer1/wiz1/signature.png",
        paymentSlipPath: "orders-attachments/dealer1/wiz1/payment-slip.jpg",
      }),
      DEALER_ID,
    );
    expect(out.signature_url).toBe("orders-attachments/dealer1/wiz1/signature.png");
    expect(out.payment_slip_url).toBe("orders-attachments/dealer1/wiz1/payment-slip.jpg");
  });

  it("includes deposit_pct + terms_accepted + paid", () => {
    const out = orderInputToRpcPayload(
      baseInput({ paid: 1200, depositPct: 80 }),
      DEALER_ID,
    );
    expect(out.paid).toBe(1200);
    expect(out.deposit_pct).toBe(80);
    expect(out.terms_accepted).toBe(true);
  });

  it("forwards payment_method + approval_code + installment_months for installment", () => {
    const out = orderInputToRpcPayload(
      baseInput({
        paymentMethod: "installment",
        approvalCode: "INST-9981",
        installmentMonths: 12,
      }),
      DEALER_ID,
    );
    expect(out.payment_method).toBe("installment");
    expect(out.approval_code).toBe("INST-9981");
    expect(out.installment_months).toBe(12);
  });

  it("nulls approval_code + installment_months for online method", () => {
    const out = orderInputToRpcPayload(baseInput(), DEALER_ID);
    expect(out.payment_method).toBe("online");
    expect(out.approval_code).toBeNull();
    expect(out.installment_months).toBeNull();
  });
});

describe("orderSupplierThreadFromRow", () => {
  function baseThreadRow(
    over: Partial<OrderSupplierThreadRow> = {},
  ): OrderSupplierThreadRow {
    return {
      id: "00000000-0000-0000-0000-0000000a0001",
      order_id: "00000000-0000-0000-0000-0000000a0002",
      supplier_id: "00000000-0000-0000-0000-0000000a0003",
      category: "mattress",
      sop_name: "STANDARD",
      operation_stage: "ready_to_dispatch",
      po_id: "PO-2026-0001",
      warehouse_id: "00000000-0000-0000-0000-0000000a0004",
      reserved_at: "2026-05-06T10:00:00.000Z",
      delivered_at: null,
      delivery_partner_id: null,
      confirm_delivery_date: null,
      request_for_delivery_at: null,
      partner_accepted_at: null,
      partner_rejected_at: null,
      // Migration 0107 — supplier per-thread pickup feature.
      supplier_ready_at: null,
      supplier_ready_by: null,
      pickup_event_id: null,
      history: [],
      created_at: "2026-05-06T08:00:00.000Z",
      updated_at: "2026-05-06T10:00:00.000Z",
      ...over,
    };
  }

  it("camelCases the snake_case columns including customer-leg fields (0049)", () => {
    const out = orderSupplierThreadFromRow(
      baseThreadRow({
        delivery_partner_id: "00000000-0000-0000-0000-0000000b0001",
        confirm_delivery_date: "2026-05-15",
        request_for_delivery_at: "2026-05-06T11:00:00.000Z",
        partner_accepted_at: "2026-05-06T12:30:00.000Z",
        partner_rejected_at: null,
      }),
    );
    expect(out.id).toBe("00000000-0000-0000-0000-0000000a0001");
    expect(out.orderId).toBe("00000000-0000-0000-0000-0000000a0002");
    expect(out.supplierId).toBe("00000000-0000-0000-0000-0000000a0003");
    expect(out.sopName).toBe("STANDARD");
    expect(out.operationStage).toBe("ready_to_dispatch");
    expect(out.poId).toBe("PO-2026-0001");
    expect(out.deliveryPartnerId).toBe("00000000-0000-0000-0000-0000000b0001");
    expect(out.confirmDeliveryDate).toBe("2026-05-15");
    expect(out.requestForDeliveryAt).toBe("2026-05-06T11:00:00.000Z");
    expect(out.partnerAcceptedAt).toBe("2026-05-06T12:30:00.000Z");
    expect(out.partnerRejectedAt).toBeNull();
    expect(out.createdAt).toBe("2026-05-06T08:00:00.000Z");
    expect(out.updatedAt).toBe("2026-05-06T10:00:00.000Z");
  });

  it("preserves null for unset customer-leg fields on a fresh thread", () => {
    const out = orderSupplierThreadFromRow(baseThreadRow());
    expect(out.deliveryPartnerId).toBeNull();
    expect(out.confirmDeliveryDate).toBeNull();
    expect(out.requestForDeliveryAt).toBeNull();
    expect(out.partnerAcceptedAt).toBeNull();
    expect(out.partnerRejectedAt).toBeNull();
  });
});
