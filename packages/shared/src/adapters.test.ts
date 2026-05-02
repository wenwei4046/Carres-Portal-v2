import { describe, expect, it } from "vitest";
import { orderInputToRpcPayload } from "./adapters";
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
});
