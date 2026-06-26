import { describe, expect, it } from "vitest";
import {
  catalogOptionPoolFromRow,
  modelSofaCompartmentFromRow,
  orderInputToRpcPayload,
  orderSupplierThreadFromRow,
  productSkuFromRow,
  sofaComboFromRow,
  sofaCompartmentFromRow,
} from "./adapters";
import type {
  CatalogOptionPoolRow,
  ModelSofaCompartmentRow,
  OrderSupplierThreadRow,
  ProductSkuRow,
  SofaComboPricingRow,
  SofaCompartmentRow,
} from "./db-types";
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
    delivery: { date: "2026-06-01", proceedDate: "2026-05-15", dateTbd: false, floor: 1, hasLift: false },
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
    expect(out.proceed_date).toBe("2026-05-15");
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
        delivery: { date: null, proceedDate: "2026-05-15", dateTbd: true, floor: 1, hasLift: false },
      }),
      DEALER_ID,
    );
    expect(out.delivery_date).toBeNull();
    // Phase 11.1 — proceed date is also nulled when the order is TBD.
    expect(out.proceed_date).toBeNull();
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

  it("maps addons with snake_case addon_key + unit_price, attrs null when omitted", () => {
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
      { addon_key: "warranty5", qty: 1, unit_price: 200, attrs: null },
      { addon_key: "dispose-mattress", qty: 1, unit_price: 50, attrs: null },
    ]);
  });

  // Migration 0133 — disposal size tag rides through unchanged so the RPC
  // can persist it into order_addons.attrs.
  it("maps addon attrs through (migration 0133 disposal size tag)", () => {
    const out = orderInputToRpcPayload(
      baseInput({
        addons: [
          {
            addonKey: "dispose-mattress",
            qty: 1,
            unitPrice: 50,
            attrs: { size: "King" },
          },
          {
            addonKey: "dispose-sofa",
            qty: 1,
            unitPrice: 120,
            attrs: { size: "2-seater" },
          },
        ],
      }),
      DEALER_ID,
    );
    expect(out.addons).toEqual([
      {
        addon_key: "dispose-mattress",
        qty: 1,
        unit_price: 50,
        attrs: { size: "King" },
      },
      {
        addon_key: "dispose-sofa",
        qty: 1,
        unit_price: 120,
        attrs: { size: "2-seater" },
      },
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

// ---------------------------------------------------------------------------
// 0178 — sofa engine Phase 1: compartment pool + per-model offered.
// ---------------------------------------------------------------------------

describe("sofaCompartmentFromRow", () => {
  function baseRow(over: Partial<SofaCompartmentRow> = {}): SofaCompartmentRow {
    return {
      id: "00000000-0000-0000-0000-0000000c0001",
      code: "1A(LHF)",
      description: "Single seat, left-hand facing",
      seat_count: 1,
      arm_config: "left",
      icon_url: "https://cdn.example/1a-lhf.svg",
      // Postgres numeric(12,2) often arrives as a string over PostgREST.
      default_price: "850.00" as unknown as number,
      sort_order: 3,
      active: true,
      created_at: "2026-06-21T08:00:00.000Z",
      updated_at: "2026-06-21T08:00:00.000Z",
      updated_by: null,
      ...over,
    };
  }

  it("snake->camel + coerces numeric default_price / seat_count / sort_order", () => {
    const out = sofaCompartmentFromRow(baseRow());
    expect(out.id).toBe("00000000-0000-0000-0000-0000000c0001");
    expect(out.code).toBe("1A(LHF)");
    expect(out.description).toBe("Single seat, left-hand facing");
    expect(out.seatCount).toBe(1);
    expect(out.armConfig).toBe("left");
    expect(out.iconUrl).toBe("https://cdn.example/1a-lhf.svg");
    expect(out.defaultPrice).toBe(850);
    expect(typeof out.defaultPrice).toBe("number");
    expect(out.sortOrder).toBe(3);
    expect(out.active).toBe(true);
  });

  it("preserves null seatCount/description/armConfig/iconUrl (not coerced to 0/empty)", () => {
    const out = sofaCompartmentFromRow(
      baseRow({
        description: null,
        seat_count: null,
        arm_config: null,
        icon_url: null,
        default_price: 0,
      }),
    );
    expect(out.description).toBeNull();
    expect(out.seatCount).toBeNull();
    expect(out.armConfig).toBeNull();
    expect(out.iconUrl).toBeNull();
    expect(out.defaultPrice).toBe(0);
  });
});

describe("modelSofaCompartmentFromRow", () => {
  function baseRow(over: Partial<ModelSofaCompartmentRow> = {}): ModelSofaCompartmentRow {
    return {
      model_id: "00000000-0000-0000-0000-0000000d0001",
      compartment_id: "00000000-0000-0000-0000-0000000c0001",
      price_override: "900.00" as unknown as number,
      sort_order: 2,
      created_at: "2026-06-21T08:00:00.000Z",
      updated_at: "2026-06-21T08:00:00.000Z",
      updated_by: null,
      ...over,
    };
  }

  it("snake->camel + coerces numeric price_override / sort_order", () => {
    const out = modelSofaCompartmentFromRow(baseRow());
    expect(out.modelId).toBe("00000000-0000-0000-0000-0000000d0001");
    expect(out.compartmentId).toBe("00000000-0000-0000-0000-0000000c0001");
    expect(out.priceOverride).toBe(900);
    expect(typeof out.priceOverride).toBe("number");
    expect(out.sortOrder).toBe(2);
  });

  it("keeps priceOverride null (inherit pool default) — not coerced to 0", () => {
    const out = modelSofaCompartmentFromRow(baseRow({ price_override: null }));
    expect(out.priceOverride).toBeNull();
  });

  it("distinguishes an explicit zero override from null", () => {
    const out = modelSofaCompartmentFromRow(baseRow({ price_override: 0 }));
    expect(out.priceOverride).toBe(0);
  });
});

describe("catalogOptionPoolFromRow", () => {
  function baseRow(over: Partial<CatalogOptionPoolRow> = {}): CatalogOptionPoolRow {
    return {
      id: "00000000-0000-0000-0000-0000000a0001",
      pool: "mattress_size",
      value: "K",
      label: "6FT",
      dimensions: "183X190CM",
      // Postgres integer arrives fine, but exercise the Number() coercion anyway.
      sort_order: "3" as unknown as number,
      active: true,
      created_at: "2026-06-26T08:00:00.000Z",
      updated_at: "2026-06-26T08:00:00.000Z",
      updated_by: null,
      ...over,
    };
  }

  it("snake->camel + coerces sort_order; keeps label/dimensions for size pools", () => {
    const out = catalogOptionPoolFromRow(baseRow());
    expect(out.id).toBe("00000000-0000-0000-0000-0000000a0001");
    expect(out.pool).toBe("mattress_size");
    expect(out.value).toBe("K");
    expect(out.label).toBe("6FT");
    expect(out.dimensions).toBe("183X190CM");
    expect(out.sortOrder).toBe(3);
    expect(typeof out.sortOrder).toBe("number");
    expect(out.active).toBe(true);
  });

  it("keeps null label/dimensions (supplier_category has neither) — not coerced to empty", () => {
    const out = catalogOptionPoolFromRow(
      baseRow({ pool: "supplier_category", value: "sofa", label: null, dimensions: null }),
    );
    expect(out.pool).toBe("supplier_category");
    expect(out.value).toBe("sofa");
    expect(out.label).toBeNull();
    expect(out.dimensions).toBeNull();
  });
});

describe("sofaComboFromRow", () => {
  function baseRow(over: Partial<SofaComboPricingRow> = {}): SofaComboPricingRow {
    return {
      id: "00000000-0000-0000-0000-0000000f0001",
      model_id: "00000000-0000-0000-0000-0000000d0001",
      slots: [
        ["2A(LHF)", "2A(RHF)"],
        ["L(LHF)", "L(RHF)"],
      ],
      tier: "PRICE_1",
      // Postgres jsonb numerics can arrive as strings over PostgREST.
      prices_by_height: {
        "24": "2640.00" as unknown as number,
        "28": 2750,
        "30": null,
      },
      // 0183 — per-height cost benchmark (companion to prices_by_height).
      cost_by_height: {
        "24": "1800.00" as unknown as number,
        "28": 1850,
        "30": null,
      },
      label: "Oslo L-shape",
      effective_from: "2026-06-21",
      active: true,
      discontinued_at: null,
      created_at: "2026-06-21T08:00:00.000Z",
      updated_at: "2026-06-21T08:00:00.000Z",
      updated_by: null,
      ...over,
    };
  }

  it("round-trips snake->camel + coerces numeric prices, preserves null prices", () => {
    const out = sofaComboFromRow(baseRow());
    expect(out.id).toBe("00000000-0000-0000-0000-0000000f0001");
    expect(out.modelId).toBe("00000000-0000-0000-0000-0000000d0001");
    expect(out.slots).toEqual([
      ["2A(LHF)", "2A(RHF)"],
      ["L(LHF)", "L(RHF)"],
    ]);
    expect(out.tier).toBe("PRICE_1");
    expect(out.pricesByHeight["24"]).toBe(2640);
    expect(typeof out.pricesByHeight["24"]).toBe("number");
    expect(out.pricesByHeight["28"]).toBe(2750);
    expect(out.pricesByHeight["30"]).toBeNull();
    // 0183 — cost map coerces numerics + preserves null, same as prices.
    expect(out.costByHeight).not.toBeNull();
    expect(out.costByHeight!["24"]).toBe(1800);
    expect(typeof out.costByHeight!["24"]).toBe("number");
    expect(out.costByHeight!["28"]).toBe(1850);
    expect(out.costByHeight!["30"]).toBeNull();
    expect(out.label).toBe("Oslo L-shape");
    expect(out.effectiveFrom).toBe("2026-06-21");
    expect(out.active).toBe(true);
    expect(out.discontinuedAt).toBeNull();
  });

  it("defaults slots=[] and pricesByHeight={} when the DB sends null", () => {
    const out = sofaComboFromRow(
      baseRow({
        slots: null as unknown as string[][],
        prices_by_height: null as unknown as Record<string, number | null>,
        tier: null,
        label: null,
      }),
    );
    expect(out.slots).toEqual([]);
    expect(out.pricesByHeight).toEqual({});
    expect(out.tier).toBeNull();
    expect(out.label).toBeNull();
  });

  it("keeps costByHeight null when the column is unset (distinct from {})", () => {
    const out = sofaComboFromRow(baseRow({ cost_by_height: null }));
    expect(out.costByHeight).toBeNull();
  });
});

describe("productSkuFromRow — 0178 compartmentId", () => {
  function baseSkuRow(over: Partial<ProductSkuRow> = {}): ProductSkuRow {
    return {
      id: "00000000-0000-0000-0000-0000000e0001",
      model_id: "00000000-0000-0000-0000-0000000d0001",
      sku: "SOFA-OSLO-1A",
      variant: "1A(LHF)",
      variant_kind: "part",
      price: "1200.00" as unknown as number,
      supplier_id: "00000000-0000-0000-0000-0000000f0001",
      cost: null,
      discontinued_at: null,
      pos_active: true,
      description: null,
      compartment_id: "00000000-0000-0000-0000-0000000c0001",
      ...over,
    };
  }

  it("maps compartment_id -> compartmentId", () => {
    const out = productSkuFromRow(baseSkuRow());
    expect(out.compartmentId).toBe("00000000-0000-0000-0000-0000000c0001");
  });

  it("nulls compartmentId for a non-compartment SKU", () => {
    const out = productSkuFromRow(baseSkuRow({ compartment_id: null }));
    expect(out.compartmentId).toBeNull();
  });
});
