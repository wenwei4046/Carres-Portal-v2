import { describe, expect, it } from "vitest";
import {
  catalogOptionPoolFromRow,
  catalogFabricFromRow,
  catalogFabricsHistoryFromRow,
  deliveryFeeConfigFromRow,
  freeItemCampaignFromRow,
  modelDefaultFreeGiftsFromRow,
  modelSofaCompartmentFromRow,
  orderInputToRpcPayload,
  orderSupplierThreadFromRow,
  productSkuFromRow,
  salespersonFromRow,
  pwpCodeFromRow,
  pwpDiscoverFromRow,
  pwpRuleFromRow,
  sofaComboFromRow,
  sofaCompartmentFromRow,
  specialDeliveryFeeRuleFromRow,
  // Rental + Service Plan base (0247-0249).
  customerFromRow,
  servicePackageFromRow,
  rentalPlanFromRow,
  posRentalPlanFromRow,
  rentalAgreementFromRow,
  rentalBillingFromRow,
  rentalStockUnitFromRow,
  serviceEntitlementFromRow,
  serviceVisitFromRow,
  rentalUnitEventFromRow,
} from "./adapters";
import type {
  CatalogOptionPoolRow,
  CatalogFabricRow,
  CustomerRow,
  DeliveryFeeConfigRow,
  FreeItemCampaignRow,
  ModelDefaultFreeGiftsRow,
  ModelSofaCompartmentRow,
  OrderSupplierThreadRow,
  ProductSkuRow,
  PwpCodeRow,
  PwpDiscoverRow,
  PwpRuleRow,
  RentalAgreementRow,
  RentalBillingRow,
  RentalPlanRow,
  RentalPlanPosRow,
  RentalStockUnitRow,
  RentalUnitEventRow,
  SalespersonRow,
  ServiceEntitlementRow,
  ServicePackageRow,
  ServiceVisitRow,
  SofaComboPricingRow,
  SofaCompartmentRow,
  SpecialDeliveryFeeRuleRow,
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
    // 0187 — defaults to [] (DORMANT); set explicitly because `.default([])`
    // makes it required in the parsed CreateOrderInput (output) type.
    pwpCartLineKeys: [],
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

  // 0230 — structured MY address parts ride with the composed string.
  it("forwards the structured address parts, nulling them when addressUnknown", () => {
    const withParts = baseInput({
      customer: {
        ...baseInput().customer,
        addressLine1: "12-3 Jalan Telawi 5",
        addressLine2: "Unit 12-A",
        addressState: "Selangor",
        addressCity: "Seri Kembangan",
        addressPostcode: "43300",
      },
    });
    const out = orderInputToRpcPayload(withParts, DEALER_ID);
    expect(out.customer_address_line1).toBe("12-3 Jalan Telawi 5");
    expect(out.customer_address_line2).toBe("Unit 12-A");
    expect(out.customer_address_state).toBe("Selangor");
    expect(out.customer_address_city).toBe("Seri Kembangan");
    expect(out.customer_address_postcode).toBe("43300");
    // Non-POS caller omitting the parts → nulls (never undefined) in the payload.
    expect(orderInputToRpcPayload(baseInput(), DEALER_ID).customer_address_line1).toBeNull();

    const unknown = orderInputToRpcPayload(
      baseInput({
        customer: { ...withParts.customer, addressUnknown: true, address: "" },
      }),
      DEALER_ID,
    );
    expect(unknown.customer_address_line1).toBeNull();
    expect(unknown.customer_address_state).toBeNull();
    expect(unknown.customer_address_postcode).toBeNull();
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
      // 0205 — per-compartment fabric-tier deltas (default null = no special).
      special_tier2_delta: null,
      special_tier3_delta: null,
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
    // 0205 — specials default to null (no special) on a plain pool row.
    expect(out.specialTier2Delta).toBeNull();
    expect(out.specialTier3Delta).toBeNull();
  });

  it("0205 — coerces numeric special_tier2/3_delta; keeps null distinct", () => {
    const out = sofaCompartmentFromRow(
      baseRow({
        special_tier2_delta: "500.00" as unknown as number,
        special_tier3_delta: 800,
      }),
    );
    expect(out.specialTier2Delta).toBe(500);
    expect(typeof out.specialTier2Delta).toBe("number");
    expect(out.specialTier3Delta).toBe(800);
    // an unset special stays null (not 0)
    expect(sofaCompartmentFromRow(baseRow()).specialTier3Delta).toBeNull();
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

describe("catalogFabricFromRow (0202)", () => {
  const row: CatalogFabricRow = {
    id: "00000000-0000-0000-0000-0000000fab01",
    fabric_code: "CG-001",
    series: "KOONA VELVET H2O",
    description: "CG-001 Pearl",
    supplier_code: "KN390-1",
    sofa_tier: "PRICE_2",
    bedframe_tier: "PRICE_1",
    active: true,
    sort_order: "19" as unknown as number,
    cost: null,
    created_at: "2026-07-06T08:00:00.000Z",
    updated_at: "2026-07-06T08:00:00.000Z",
    updated_by: null,
  };

  it("snake->camel + coerces sort_order; keeps split tiers", () => {
    const out = catalogFabricFromRow(row);
    expect(out).toEqual({
      id: "00000000-0000-0000-0000-0000000fab01",
      fabricCode: "CG-001",
      series: "KOONA VELVET H2O",
      description: "CG-001 Pearl",
      supplierCode: "KN390-1",
      sofaTier: "PRICE_2",
      bedframeTier: "PRICE_1",
      active: true,
      sortOrder: 19,
      cost: null,
    });
  });

  it("nulls stay null (series/description/supplier) — not coerced to empty", () => {
    const out = catalogFabricFromRow({
      ...row,
      series: null,
      description: null,
      supplier_code: null,
    });
    expect(out.series).toBeNull();
    expect(out.description).toBeNull();
    expect(out.supplierCode).toBeNull();
  });

  // 0226 — the buying add-on: Postgres numeric may arrive as a string.
  it("coerces a string-numeric cost; null stays null", () => {
    expect(catalogFabricFromRow({ ...row, cost: "120.50" }).cost).toBe(120.5);
    expect(catalogFabricFromRow({ ...row, cost: 0 }).cost).toBe(0);
    expect(catalogFabricFromRow({ ...row, cost: null }).cost).toBeNull();
  });
});

describe("catalogFabricsHistoryFromRow (0202)", () => {
  it("maps fabric-shaped snapshot entries; drops malformed; defaults bad tiers to PRICE_2", () => {
    const out = catalogFabricsHistoryFromRow({
      id: "00000000-0000-0000-0000-0000000fh001",
      section: "fabrics",
      snapshot: [
        {
          fabricCode: "BF-01",
          series: null,
          description: "BF-01",
          supplierCode: "PC151-01",
          sofaTier: "PRICE_1",
          bedframeTier: "NOT_A_TIER",
          active: false,
          sortOrder: 1,
        },
        { value: "pool-shaped-entry-without-fabricCode" },
        "garbage",
      ],
      effective_from: "2026-07-06",
      notes: null,
      created_at: "2026-07-06T08:00:00.000Z",
      created_by: null,
    });
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toEqual({
      fabricCode: "BF-01",
      series: null,
      description: "BF-01",
      supplierCode: "PC151-01",
      sofaTier: "PRICE_1",
      bedframeTier: "PRICE_2",
      active: false,
      sortOrder: 1,
    });
    expect(out.effectiveFrom).toBe("2026-07-06");
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
      surcharge: null,
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
    expect(out.surcharge).toBeNull();
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

  it("0201 — coerces Postgres numeric surcharge (string) via Number()", () => {
    const out = catalogOptionPoolFromRow(
      baseRow({
        pool: "divan_height",
        value: '10"',
        label: null,
        dimensions: null,
        surcharge: "125.00" as unknown as number,
      }),
    );
    expect(out.pool).toBe("divan_height");
    expect(out.surcharge).toBe(125);
    expect(typeof out.surcharge).toBe("number");
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
      // 0186 — per-height PWP reward price (companion to prices_by_height).
      pwp_prices_by_height: {
        "24": "2200.00" as unknown as number,
        "28": 2300,
        "30": null,
      },
      label: "Oslo L-shape",
      effective_from: "2026-06-21",
      active: true,
      discontinued_at: null,
      // 0206 — Quick Pick preset flag (column NOT NULL default false).
      is_quick_pick: false,
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
    // 0186 — PWP price map coerces numerics + preserves null, same as prices.
    expect(out.pwpPricesByHeight).not.toBeNull();
    expect(out.pwpPricesByHeight!["24"]).toBe(2200);
    expect(typeof out.pwpPricesByHeight!["24"]).toBe("number");
    expect(out.pwpPricesByHeight!["28"]).toBe(2300);
    expect(out.pwpPricesByHeight!["30"]).toBeNull();
    expect(out.label).toBe("Oslo L-shape");
    expect(out.effectiveFrom).toBe("2026-06-21");
    expect(out.active).toBe(true);
    expect(out.discontinuedAt).toBeNull();
    // 0206 — Quick Pick preset flag maps through (default false here).
    expect(out.isQuickPick).toBe(false);
  });

  it("0206 — maps is_quick_pick=true (a Quick Pick preset row)", () => {
    expect(sofaComboFromRow(baseRow({ is_quick_pick: true })).isQuickPick).toBe(true);
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

  it("keeps pwpPricesByHeight null when the column is unset (0186)", () => {
    const out = sofaComboFromRow(baseRow({ pwp_prices_by_height: null }));
    expect(out.pwpPricesByHeight).toBeNull();
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
      pwp_price: null,
      prices_by_size: null,
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

  it("maps pwp_price -> pwpPrice, coercing numeric + preserving null (0186)", () => {
    expect(productSkuFromRow(baseSkuRow({ pwp_price: null })).pwpPrice).toBeNull();
    const out = productSkuFromRow(baseSkuRow({ pwp_price: "999.00" as unknown as number }));
    expect(out.pwpPrice).toBe(999);
    expect(typeof out.pwpPrice).toBe("number");
  });

  it("maps prices_by_size -> pricesBySize, coercing numerics + preserving nulls (0204)", () => {
    expect(productSkuFromRow(baseSkuRow()).pricesBySize).toBeNull();
    const out = productSkuFromRow(
      baseSkuRow({
        prices_by_size: {
          "24": "900.00" as unknown as number, // PostgREST jsonb numeric-as-string
          "32": 1200,
          Flat: null, // defensive: null value = "not priced at this size"
        },
      }),
    );
    expect(out.pricesBySize).toEqual({ "24": 900, "32": 1200, Flat: null });
    expect(typeof out.pricesBySize!["24"]).toBe("number");
  });
});

describe("deliveryFeeConfigFromRow (0184)", () => {
  function baseRow(over: Partial<DeliveryFeeConfigRow> = {}): DeliveryFeeConfigRow {
    return {
      id: 1,
      // PostgREST serializes numeric as a string — Number() must normalise it.
      base_fee: "50.00" as unknown as number,
      cross_category_fee: "30.00" as unknown as number,
      charged_categories: ["sofa", "mattress", "bedframe"],
      mattress_bedframe_lead_days: 14,
      sofa_lead_days: 21,
      updated_at: "2026-06-26T00:00:00Z",
      updated_by: null,
      ...over,
    };
  }

  it("coerces numeric fees + lead days and passes charged categories through; drops id", () => {
    const out = deliveryFeeConfigFromRow(baseRow());
    expect(out).toEqual({
      baseFee: 50,
      crossCategoryFee: 30,
      chargedCategories: ["sofa", "mattress", "bedframe"],
      mattressBedframeLeadDays: 14,
      sofaLeadDays: 21,
    });
    // no singleton id leaks into the domain shape
    expect(out).not.toHaveProperty("id");
  });

  it("defaults a null charged_categories to []", () => {
    const out = deliveryFeeConfigFromRow(
      baseRow({ charged_categories: null as unknown as string[] }),
    );
    expect(out.chargedCategories).toEqual([]);
  });
});

describe("specialDeliveryFeeRuleFromRow (0184)", () => {
  function baseRow(over: Partial<SpecialDeliveryFeeRuleRow> = {}): SpecialDeliveryFeeRuleRow {
    return {
      id: "00000000-0000-0000-0000-0000000de001",
      target: [
        { scope: "model", modelId: "00000000-0000-0000-0000-00000000000a" },
      ] as unknown as SpecialDeliveryFeeRuleRow["target"],
      standalone_fee: "500.00" as unknown as number,
      cross_cat_followup_fee: "300.00" as unknown as number,
      label: "Full-latex transport",
      active: true,
      sort_order: 0,
      created_at: "2026-06-26T00:00:00Z",
      updated_at: "2026-06-26T00:00:00Z",
      updated_by: null,
      ...over,
    };
  }

  it("parses the RuleTarget[] and coerces numeric fees", () => {
    const out = specialDeliveryFeeRuleFromRow(baseRow());
    expect(out.id).toBe("00000000-0000-0000-0000-0000000de001");
    expect(out.target).toEqual([
      { scope: "model", modelId: "00000000-0000-0000-0000-00000000000a" },
    ]);
    expect(out.standaloneFee).toBe(500);
    expect(out.crossCategoryFollowupFee).toBe(300);
    expect(out.label).toBe("Full-latex transport");
    expect(out.active).toBe(true);
    expect(out.sortOrder).toBe(0);
  });

  it("drops malformed target entries via parseRuleTargets and nulls a missing label", () => {
    const out = specialDeliveryFeeRuleFromRow(
      baseRow({
        // a non-combo entry with no modelId is unusable → dropped
        target: [
          { scope: "model" },
          { scope: "variant", modelId: "m1", sizeCodes: ["queen"] },
        ] as unknown as SpecialDeliveryFeeRuleRow["target"],
        label: null,
      }),
    );
    expect(out.target).toEqual([{ scope: "variant", modelId: "m1", sizeCodes: ["QUEEN"] }]);
    expect(out.label).toBeNull();
  });
});

describe("modelDefaultFreeGiftsFromRow (0185)", () => {
  function baseRow(over: Partial<ModelDefaultFreeGiftsRow> = {}): ModelDefaultFreeGiftsRow {
    return {
      model_id: "00000000-0000-0000-0000-00000000000a",
      gifts: [
        { giftSku: "ACC-PILLOW", qty: 1, label: "Free pillow" },
      ] as unknown as ModelDefaultFreeGiftsRow["gifts"],
      updated_at: "2026-06-26T00:00:00Z",
      updated_by: null,
      ...over,
    };
  }

  it("maps model_id → modelId and parses the gifts jsonb", () => {
    const out = modelDefaultFreeGiftsFromRow(baseRow());
    expect(out).toEqual({
      modelId: "00000000-0000-0000-0000-00000000000a",
      gifts: [{ giftSku: "ACC-PILLOW", qty: 1, label: "Free pillow" }],
    });
  });

  it("drops malformed gift entries + collapses a 'model'-scope condition via parseDefaultFreeGifts", () => {
    const out = modelDefaultFreeGiftsFromRow(
      baseRow({
        gifts: [
          { giftSku: "", qty: 1 }, // empty sku → dropped
          { giftSku: "ACC-A", qty: 0 }, // qty < 1 → dropped
          { giftSku: "ACC-B", qty: 2, condition: { scope: "model" } }, // condition collapses
        ] as unknown as ModelDefaultFreeGiftsRow["gifts"],
      }),
    );
    expect(out.gifts).toEqual([{ giftSku: "ACC-B", qty: 2 }]);
  });

  it("defaults a null gifts column to []", () => {
    const out = modelDefaultFreeGiftsFromRow(
      baseRow({ gifts: null as unknown as ModelDefaultFreeGiftsRow["gifts"] }),
    );
    expect(out.gifts).toEqual([]);
  });
});

describe("freeItemCampaignFromRow (0185)", () => {
  function baseRow(over: Partial<FreeItemCampaignRow> = {}): FreeItemCampaignRow {
    return {
      id: "00000000-0000-0000-0000-0000000ca001",
      name: "Pillow giveaway",
      active: true,
      // PostgREST may serialize integer as a string — Number() must normalise it.
      max_free_qty: "2" as unknown as number,
      eligible: [
        { scope: "model", modelId: "00000000-0000-0000-0000-00000000000a" },
      ] as unknown as FreeItemCampaignRow["eligible"],
      created_at: "2026-06-26T00:00:00Z",
      updated_at: "2026-06-26T00:00:00Z",
      updated_by: null,
      ...over,
    };
  }

  it("maps fields, coerces max_free_qty, and parses the eligible RuleTarget[]", () => {
    const out = freeItemCampaignFromRow(baseRow());
    expect(out).toEqual({
      id: "00000000-0000-0000-0000-0000000ca001",
      name: "Pillow giveaway",
      active: true,
      maxFreeQty: 2,
      eligible: [{ scope: "model", modelId: "00000000-0000-0000-0000-00000000000a" }],
    });
  });

  it("drops malformed eligible entries via parseFreeItemEligible", () => {
    const out = freeItemCampaignFromRow(
      baseRow({
        eligible: [
          { scope: "model" }, // no modelId → dropped
          { scope: "variant", modelId: "m1", sizeCodes: ["queen"] }, // upper-cased
        ] as unknown as FreeItemCampaignRow["eligible"],
      }),
    );
    expect(out.eligible).toEqual([{ scope: "variant", modelId: "m1", sizeCodes: ["QUEEN"] }]);
  });
});

describe("pwpCodeFromRow (0187)", () => {
  function baseRow(over: Partial<PwpCodeRow> = {}): PwpCodeRow {
    return {
      code: "PWP-1234ABCD",
      rule_id: "00000000-0000-0000-0000-0000000ee001",
      type: "pwp",
      reward_category: "BEDFRAME",
      reward_targets: [
        { scope: "model", modelId: "00000000-0000-0000-0000-00000000000b" },
      ] as unknown as PwpCodeRow["reward_targets"],
      status: "RESERVED",
      owner_staff_id: "00000000-0000-0000-0000-0000000aa001",
      cart_line_key: "line-1",
      trigger_item_code: "MAT-QUEEN",
      claim_group: null,
      redeemed_order_id: null,
      redeemed_item_sku: null,
      source_order_id: null,
      customer_id: null,
      bound_customer_phone: null,
      owner_dealer_id: null,
      expires_at: null,
      created_at: "2026-06-28T00:00:00Z",
      updated_at: "2026-06-28T00:00:00Z",
      ...over,
    };
  }

  it("maps every column snake→camel and parses the reward_targets RuleTarget[]", () => {
    const out = pwpCodeFromRow(baseRow());
    expect(out).toEqual({
      code: "PWP-1234ABCD",
      ruleId: "00000000-0000-0000-0000-0000000ee001",
      type: "pwp",
      rewardCategory: "BEDFRAME",
      rewardTargets: [{ scope: "model", modelId: "00000000-0000-0000-0000-00000000000b" }],
      status: "RESERVED",
      ownerStaffId: "00000000-0000-0000-0000-0000000aa001",
      cartLineKey: "line-1",
      triggerItemCode: "MAT-QUEEN",
      claimGroup: null,
      redeemedOrderId: null,
      redeemedItemSku: null,
      sourceOrderId: null,
      customerId: null,
      boundCustomerPhone: null,
      ownerDealerId: null,
      expiresAt: null,
      createdAt: "2026-06-28T00:00:00Z",
      updatedAt: "2026-06-28T00:00:00Z",
    });
  });

  it("(P8d 0188) maps the cross-order carry-forward binding fields on an AVAILABLE voucher", () => {
    const out = pwpCodeFromRow(
      baseRow({
        status: "AVAILABLE",
        cart_line_key: null,
        source_order_id: "00000000-0000-0000-0000-0000000d0aa1",
        bound_customer_phone: "123456789",
        owner_dealer_id: "00000000-0000-0000-0000-0000000de001",
        expires_at: "2026-07-28T00:00:00Z",
      }),
    );
    expect(out.status).toBe("AVAILABLE");
    expect(out.boundCustomerPhone).toBe("123456789");
    expect(out.ownerDealerId).toBe("00000000-0000-0000-0000-0000000de001");
    expect(out.expiresAt).toBe("2026-07-28T00:00:00Z");
    expect(out.sourceOrderId).toBe("00000000-0000-0000-0000-0000000d0aa1");
  });

  it("(P8d 0188) defaults the binding fields to null when a pre-0188 row omits them", () => {
    // Simulate a pre-0188 row / mock that has no binding columns at all.
    const legacy = baseRow();
    delete (legacy as Partial<PwpCodeRow>).bound_customer_phone;
    delete (legacy as Partial<PwpCodeRow>).owner_dealer_id;
    delete (legacy as Partial<PwpCodeRow>).expires_at;
    const out = pwpCodeFromRow(legacy);
    expect(out.boundCustomerPhone).toBeNull();
    expect(out.ownerDealerId).toBeNull();
    expect(out.expiresAt).toBeNull();
  });

  it("carries the claimed-stamp fields and a nulled owner (post-redemption audit row)", () => {
    const out = pwpCodeFromRow(
      baseRow({
        status: "USED",
        owner_staff_id: null,
        claim_group: "00000000-0000-0000-0000-0000000c6001",
        redeemed_order_id: "00000000-0000-0000-0000-0000000d0001",
        redeemed_item_sku: "BED-KING",
      }),
    );
    expect(out.status).toBe("USED");
    expect(out.ownerStaffId).toBeNull();
    expect(out.claimGroup).toBe("00000000-0000-0000-0000-0000000c6001");
    expect(out.redeemedOrderId).toBe("00000000-0000-0000-0000-0000000d0001");
    expect(out.redeemedItemSku).toBe("BED-KING");
  });

  it("drops malformed reward_targets entries via parseRuleTargets", () => {
    const out = pwpCodeFromRow(
      baseRow({
        reward_targets: [
          { scope: "model" }, // no modelId → dropped
          { scope: "variant", modelId: "m1", sizeCodes: ["queen"] }, // upper-cased
        ] as unknown as PwpCodeRow["reward_targets"],
      }),
    );
    expect(out.rewardTargets).toEqual([
      { scope: "variant", modelId: "m1", sizeCodes: ["QUEEN"] },
    ]);
  });
});

describe("pwpRuleFromRow (0186 + 0188 carry-forward)", () => {
  function baseRow(over: Partial<PwpRuleRow> = {}): PwpRuleRow {
    return {
      id: "00000000-0000-0000-0000-0000000ee001",
      type: "pwp",
      trigger_category: "MATTRESS",
      trigger_targets: [] as unknown as PwpRuleRow["trigger_targets"],
      reward_category: "BEDFRAME",
      reward_targets: [] as unknown as PwpRuleRow["reward_targets"],
      qty_per_trigger: 1,
      active: true,
      carry_forward: true,
      carry_forward_days: null,
      created_at: "2026-06-28T00:00:00Z",
      updated_at: "2026-06-28T00:00:00Z",
      updated_by: null,
      ...over,
    };
  }

  it("maps the carry-forward policy columns", () => {
    const out = pwpRuleFromRow(baseRow({ carry_forward: false, carry_forward_days: 30 }));
    expect(out.carryForward).toBe(false);
    expect(out.carryForwardDays).toBe(30);
  });

  it("defaults carryForward to true / carryForwardDays to null when a pre-0188 row omits them", () => {
    const legacy = baseRow();
    delete (legacy as Partial<PwpRuleRow>).carry_forward;
    delete (legacy as Partial<PwpRuleRow>).carry_forward_days;
    const out = pwpRuleFromRow(legacy);
    expect(out.carryForward).toBe(true);
    expect(out.carryForwardDays).toBeNull();
  });

  it("coerces qty_per_trigger via Number() (PostgREST may serialize it as a string)", () => {
    const out = pwpRuleFromRow(baseRow({ qty_per_trigger: "2" as unknown as number }));
    expect(out.qtyPerTrigger).toBe(2);
  });
});

describe("pwpDiscoverFromRow (0188 — the stripped cross-order DISCOVERY projection)", () => {
  function baseRow(over: Partial<PwpDiscoverRow> = {}): PwpDiscoverRow {
    return {
      code: "PWP-9876ZZZZ",
      rule_id: "00000000-0000-0000-0000-0000000ee001",
      type: "pwp",
      reward_category: "BEDFRAME",
      reward_targets: [
        { scope: "model", modelId: "00000000-0000-0000-0000-00000000000b" },
      ] as unknown as PwpDiscoverRow["reward_targets"],
      source_order_id: "00000000-0000-0000-0000-0000000d0aa1",
      expires_at: null,
      phone_matches: true,
      name_matches: true,
      ...over,
    };
  }

  it("maps the stripped projection snake→camel and parses reward_targets", () => {
    const out = pwpDiscoverFromRow(baseRow());
    expect(out).toEqual({
      code: "PWP-9876ZZZZ",
      ruleId: "00000000-0000-0000-0000-0000000ee001",
      type: "pwp",
      rewardCategory: "BEDFRAME",
      rewardTargets: [{ scope: "model", modelId: "00000000-0000-0000-0000-00000000000b" }],
      sourceOrderId: "00000000-0000-0000-0000-0000000d0aa1",
      expiresAt: null,
      phoneMatches: true,
      nameMatches: true,
    });
  });

  it("carries the server-computed phoneMatches=false and never any PII field", () => {
    const out = pwpDiscoverFromRow(baseRow({ phone_matches: false }));
    expect(out.phoneMatches).toBe(false);
    // The structural PII guarantee: the discover shape has no bound phone / owner /
    // trigger sku / customer id / redeemed sku keys.
    expect(out).not.toHaveProperty("boundCustomerPhone");
    expect(out).not.toHaveProperty("ownerStaffId");
    expect(out).not.toHaveProperty("triggerItemCode");
    expect(out).not.toHaveProperty("redeemedItemSku");
    expect(out).not.toHaveProperty("customerId");
  });
});

describe("salespersonFromRow (0233 staff PIN login)", () => {
  const row: SalespersonRow = {
    id: "22222222-2222-4222-8222-222222222222",
    dealer_id: DEALER_ID,
    outlet_id: null,
    name: "Aina",
    phone: "0123456789",
    user_id: null,
    created_at: "2026-07-18T00:00:00Z",
    staff_role: "manager",
    color: "ocean",
    active: true,
  };

  it("maps the 0233 tier/color/active columns", () => {
    const d = salespersonFromRow(row);
    expect(d.staffRole).toBe("manager");
    expect(d.color).toBe("ocean");
    expect(d.active).toBe(true);
  });

  it("tolerates pre-0233 rows (mocks) missing the new columns", () => {
    const legacy = { ...row } as unknown as SalespersonRow;
    delete (legacy as Partial<SalespersonRow>).staff_role;
    delete (legacy as Partial<SalespersonRow>).color;
    delete (legacy as Partial<SalespersonRow>).active;
    const d = salespersonFromRow(legacy);
    expect(d.staffRole).toBe("salesperson");
    expect(d.color).toBeNull();
    expect(d.active).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rental + Service Plan base (0247-0249) — one snake→camel round-trip per
// adapter (numeric coercion + null preservation).
// ---------------------------------------------------------------------------

describe("rental + service plan adapters (0247-0249)", () => {
  it("customerFromRow maps the 0247 row snake→camel", () => {
    const row: CustomerRow = {
      id: "00000000-0000-0000-0000-0000000c0001",
      name: "Tan Mei Ling",
      phone: "012-3456789",
      phone_key: "123456789",
      email: null,
      address: "123 Jalan Sample, 50000 KL",
      notes: null,
      stripe_customer_id: null,
      created_at: "2026-07-25T00:00:00Z",
      updated_at: "2026-07-25T00:00:00Z",
      created_by: null,
    };
    expect(customerFromRow(row)).toEqual({
      id: "00000000-0000-0000-0000-0000000c0001",
      name: "Tan Mei Ling",
      phone: "012-3456789",
      phoneKey: "123456789",
      email: null,
      address: "123 Jalan Sample, 50000 KL",
      notes: null,
      stripeCustomerId: null,
      createdAt: "2026-07-25T00:00:00Z",
      updatedAt: "2026-07-25T00:00:00Z",
      createdBy: null,
    });
  });

  it("servicePackageFromRow coerces price/integers via Number() (PostgREST strings)", () => {
    const row: ServicePackageRow = {
      id: "00000000-0000-0000-0000-0000000a0001",
      name: "Annual Clean",
      service_type: "cleaning",
      duration_months: "12" as unknown as number,
      visits_per_year: 3,
      price: "199.90" as unknown as number,
      sku: null,
      active: true,
      sort_order: 0,
      category: "mattress",
      created_at: "2026-07-25T00:00:00Z",
      updated_at: "2026-07-25T00:00:00Z",
      updated_by: null,
    };
    const out = servicePackageFromRow(row);
    expect(out.serviceType).toBe("cleaning");
    expect(out.durationMonths).toBe(12);
    expect(out.visitsPerYear).toBe(3);
    expect(out.price).toBe(199.9);
    expect(out.sku).toBeNull();
    expect(out.sortOrder).toBe(0);
  });

  it("rentalPlanFromRow coerces the fee/rate numerics and keeps includedPackageId null", () => {
    const row: RentalPlanRow = {
      id: "00000000-0000-0000-0000-0000000b0001",
      sku: "M-CLOUD-KING",
      term_months: 84,
      monthly_fee: "59.00" as unknown as number,
      supplier_rate_pct: "49.00" as unknown as number,
      commission_base_pct: 20,
      included_package_id: null,
      active: false,
      stripe_product_id: null,
      stripe_price_id: null,
      offer_id: null,
      combo_id: null,
      line_kind: "unit",
      gifts: [],
      created_at: "2026-07-25T00:00:00Z",
      updated_at: "2026-07-25T00:00:00Z",
      updated_by: null,
    };
    const out = rentalPlanFromRow(row);
    expect(out.sku).toBe("M-CLOUD-KING");
    expect(out.termMonths).toBe(84);
    expect(out.monthlyFee).toBe(59);
    expect(out.supplierRatePct).toBe(49);
    expect(out.commissionBasePct).toBe(20);
    expect(out.includedPackageId).toBeNull();
    expect(out.active).toBe(false);
    expect(out.stripeProductId).toBeNull();
    expect(out.stripePriceId).toBeNull();
  });

  it("posRentalPlanFromRow (0255 view) exposes the sellable face only — no split fields", () => {
    const row: RentalPlanPosRow = {
      id: "00000000-0000-0000-0000-0000000b0002",
      sku: "M-CLOUD-KING",
      term_months: "84" as unknown as number,
      monthly_fee: "59.00" as unknown as number,
      included_package_id: "00000000-0000-0000-0000-0000000a0001",
      package_name: "Annual Clean",
      package_service_type: "cleaning",
      package_visits_per_year: "3" as unknown as number,
      stripe_ready: true,
    };
    const out = posRentalPlanFromRow(row);
    expect(out).toEqual({
      id: "00000000-0000-0000-0000-0000000b0002",
      sku: "M-CLOUD-KING",
      termMonths: 84,
      monthlyFee: 59,
      includedPackageId: "00000000-0000-0000-0000-0000000a0001",
      packageName: "Annual Clean",
      packageServiceType: "cleaning",
      packageVisitsPerYear: 3,
      stripeReady: true,
    });
    // The projection must never grow the split — the whole point of the view.
    expect("supplierRatePct" in out).toBe(false);
    expect("commissionBasePct" in out).toBe(false);
  });

  it("rentalAgreementFromRow maps the snapshot columns and preserves null buyout_amount", () => {
    const row: RentalAgreementRow = {
      id: "00000000-0000-0000-0000-0000000d0001",
      agreement_no: "RA-1001",
      customer_id: "00000000-0000-0000-0000-0000000c0001",
      dealer_id: null,
      salesperson_id: null,
      order_id: null,
      plan_id: "00000000-0000-0000-0000-0000000b0001",
      sku: "M-CLOUD-KING",
      term_months: 84,
      monthly_fee: "59.00" as unknown as number,
      supplier_rate_pct: 49,
      commission_base_pct: 20,
      start_date: "2026-08-01",
      status: "active",
      buyout_at: null,
      buyout_amount: null,
      ownership_transfer_at: null,
      ownership_doc_url: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      offer_id: null,
      selected_options: {},
      gifts: [],
      one_off_total: 0,
      notes: null,
      included_package_id: null,
      decided_by: null,
      decided_at: null,
      rejection_reason: null,
      credit_checked_at: null,
      credit_reference: null,
      signed_at: "2026-07-25T09:30:00Z",
      signed_name: "Tan Ah Kow",
      signed_nric: "900101-14-5555",
      signature_path: "rental-agreements/2026/sig-1001.png",
      signed_doc_path: null,
      template_id: "00000000-0000-0000-0000-0000000e0001",
      template_version: 3,
      created_at: "2026-07-25T00:00:00Z",
      updated_at: "2026-07-25T00:00:00Z",
      created_by: null,
    };
    const out = rentalAgreementFromRow(row);
    expect(out.agreementNo).toBe("RA-1001");
    expect(out.customerId).toBe("00000000-0000-0000-0000-0000000c0001");
    expect(out.planId).toBe("00000000-0000-0000-0000-0000000b0001");
    expect(out.monthlyFee).toBe(59);
    expect(out.status).toBe("active");
    expect(out.buyoutAmount).toBeNull();
    expect(out.startDate).toBe("2026-08-01");
    // 0278 — the signature travels, and WHICH wording was signed travels with
    // it. A path without a version is a picture, not evidence.
    expect(out.signedAt).toBe("2026-07-25T09:30:00Z");
    expect(out.signedName).toBe("Tan Ah Kow");
    expect(out.signedNric).toBe("900101-14-5555");
    expect(out.signaturePath).toBe("rental-agreements/2026/sig-1001.png");
    expect(out.templateId).toBe("00000000-0000-0000-0000-0000000e0001");
    expect(out.templateVersion).toBe(3);
    // the archived filled PDF has no writer yet — it must read as absent, not
    // as an empty string that a link would happily render.
    expect(out.signedDocPath).toBeNull();
  });

  it("rentalAgreementFromRow degrades a pre-0278 row to 'not signed', never undefined", () => {
    // A browser on THIS build can be talking to a Worker deployed before 0278.
    // The approver screen renders a warning off `signedAt == null`, so an
    // undefined here would silently show "Signed" for an unsigned contract.
    const legacy = rentalAgreementFromRow({
      id: "00000000-0000-0000-0000-0000000d0003",
      agreement_no: "RA-1003",
      customer_id: "00000000-0000-0000-0000-0000000c0003",
      dealer_id: null,
      salesperson_id: null,
      order_id: null,
      plan_id: null,
      sku: "TEST-RENTAL-K",
      term_months: 84,
      monthly_fee: 69,
      supplier_rate_pct: 49,
      commission_base_pct: 20,
      start_date: "2026-07-26",
      status: "active",
      buyout_at: null,
      buyout_amount: null,
      ownership_transfer_at: null,
      ownership_doc_url: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      offer_id: null,
      selected_options: {},
      gifts: [],
      one_off_total: 0,
      notes: null,
      created_at: "2026-07-26T00:00:00Z",
      updated_at: "2026-07-26T00:00:00Z",
      created_by: null,
    } as unknown as RentalAgreementRow);
    expect(legacy.signedAt).toBeNull();
    expect(legacy.signedName).toBeNull();
    expect(legacy.signedNric).toBeNull();
    expect(legacy.signaturePath).toBeNull();
    expect(legacy.signedDocPath).toBeNull();
    expect(legacy.templateId).toBeNull();
    expect(legacy.templateVersion).toBeNull();
  });

  it("rentalAgreementFromRow carries the 0268 credit decision", () => {
    const base = {
      id: "00000000-0000-0000-0000-0000000d0002",
      agreement_no: "RA-1002",
      customer_id: "00000000-0000-0000-0000-0000000c0002",
      dealer_id: null,
      salesperson_id: null,
      order_id: null,
      plan_id: null,
      sku: "M-CLOUD-QUEEN",
      term_months: 60,
      monthly_fee: 75,
      supplier_rate_pct: 49,
      commission_base_pct: 20,
      start_date: "2026-08-01",
      buyout_at: null,
      buyout_amount: null,
      ownership_transfer_at: null,
      ownership_doc_url: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      offer_id: null,
      selected_options: {},
      gifts: [],
      one_off_total: 0,
      notes: null,
      signed_at: null,
      signed_name: null,
      signed_nric: null,
      signature_path: null,
      signed_doc_path: null,
      template_id: null,
      template_version: null,
      created_at: "2026-07-26T00:00:00Z",
      updated_at: "2026-07-26T00:00:00Z",
      created_by: null,
    };

    // born pending: undecided, and nothing promised has been decided on
    const pending = rentalAgreementFromRow({
      ...base,
      status: "pending_approval",
      included_package_id: "00000000-0000-0000-0000-0000000e0001",
      decided_by: null,
      decided_at: null,
      rejection_reason: null,
      credit_checked_at: null,
      credit_reference: null,
    } as RentalAgreementRow);
    expect(pending.status).toBe("pending_approval");
    expect(pending.decidedAt).toBeNull();
    expect(pending.includedPackageId).toBe("00000000-0000-0000-0000-0000000e0001");

    // rejected: the reason travels so the store can tell the customer
    const rejected = rentalAgreementFromRow({
      ...base,
      status: "rejected",
      included_package_id: null,
      decided_by: "00000000-0000-0000-0000-0000000f0001",
      decided_at: "2026-07-26T02:00:00Z",
      rejection_reason: "CBM: adverse record",
      credit_checked_at: null,
      credit_reference: null,
    } as RentalAgreementRow);
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectionReason).toBe("CBM: adverse record");
    expect(rejected.decidedBy).toBe("00000000-0000-0000-0000-0000000f0001");

    // a pre-0268 Worker's row: the decision keys are absent, not undefined
    const legacy = rentalAgreementFromRow({
      ...base,
      status: "active",
    } as unknown as RentalAgreementRow);
    expect(legacy.decidedBy).toBeNull();
    expect(legacy.rejectionReason).toBeNull();
    expect(legacy.includedPackageId).toBeNull();
  });

  it("rentalBillingFromRow coerces amount_due and null-preserves the split shares", () => {
    const row: RentalBillingRow = {
      id: "00000000-0000-0000-0000-0000000e0001",
      agreement_id: "00000000-0000-0000-0000-0000000d0001",
      seq: 1,
      due_date: "2026-08-01",
      amount_due: "59.00" as unknown as number,
      status: "due",
      paid_at: null,
      paid_amount: null,
      method: null,
      reference: null,
      supplier_share: null,
      commission_share: null,
      stripe_invoice_id: null,
      recorded_by: null,
      created_at: "2026-07-25T00:00:00Z",
    };
    const out = rentalBillingFromRow(row);
    expect(out.seq).toBe(1);
    expect(out.amountDue).toBe(59);
    expect(out.status).toBe("due");
    expect(out.paidAmount).toBeNull();
    expect(out.supplierShare).toBeNull();
    expect(out.commissionShare).toBeNull();
    // A collected row coerces the recorded split figures.
    const paid = rentalBillingFromRow({
      ...row,
      status: "paid",
      paid_amount: "59.00" as unknown as number,
      supplier_share: "28.91" as unknown as number,
      commission_share: "11.80" as unknown as number,
    });
    expect(paid.paidAmount).toBe(59);
    expect(paid.supplierShare).toBe(28.91);
    expect(paid.commissionShare).toBe(11.8);
  });

  it("rentalStockUnitFromRow maps the unit registry row snake→camel", () => {
    const row: RentalStockUnitRow = {
      id: "00000000-0000-0000-0000-0000000f0001",
      unit_code: "RU-1001",
      sku: "M-CLOUD-KING",
      agreement_id: "00000000-0000-0000-0000-0000000d0001",
      customer_id: null,
      status: "in_rental",
      deployed_at: "2026-08-02",
      returned_at: null,
      warranty_until: "2031-08-02",
      notes: null,
      created_at: "2026-07-25T00:00:00Z",
      updated_at: "2026-07-25T00:00:00Z",
      updated_by: null,
    };
    const out = rentalStockUnitFromRow(row);
    expect(out.unitCode).toBe("RU-1001");
    expect(out.agreementId).toBe("00000000-0000-0000-0000-0000000d0001");
    expect(out.customerId).toBeNull();
    expect(out.status).toBe("in_rental");
    expect(out.deployedAt).toBe("2026-08-02");
    expect(out.warrantyUntil).toBe("2031-08-02");
  });

  it("serviceEntitlementFromRow coerces the visit counters via Number()", () => {
    const row: ServiceEntitlementRow = {
      id: "00000000-0000-0000-0000-000000010001",
      customer_id: "00000000-0000-0000-0000-0000000c0001",
      package_id: "00000000-0000-0000-0000-0000000a0001",
      source: "rental",
      agreement_id: "00000000-0000-0000-0000-0000000d0001",
      order_id: null,
      visits_total: "21" as unknown as number,
      visits_used: 0,
      starts_on: "2026-08-01",
      expires_on: null,
      status: "active",
      created_at: "2026-07-25T00:00:00Z",
      created_by: null,
    };
    const out = serviceEntitlementFromRow(row);
    expect(out.source).toBe("rental");
    expect(out.visitsTotal).toBe(21);
    expect(out.visitsUsed).toBe(0);
    expect(out.startsOn).toBe("2026-08-01");
    expect(out.expiresOn).toBeNull();
    expect(out.orderId).toBeNull();
  });

  it("serviceVisitFromRow maps a pending visit snake→camel", () => {
    const row: ServiceVisitRow = {
      id: "00000000-0000-0000-0000-000000020001",
      entitlement_id: "00000000-0000-0000-0000-000000010001",
      seq: 1,
      due_date: "2026-12-01",
      scheduled_date: null,
      partner: "SparkleClean",
      unit_id: "00000000-0000-0000-0000-0000000f0001",
      status: "pending",
      completed_at: null,
      completed_by: null,
      photo_url: null,
      notes: null,
      created_at: "2026-07-25T00:00:00Z",
    };
    const out = serviceVisitFromRow(row);
    expect(out.entitlementId).toBe("00000000-0000-0000-0000-000000010001");
    expect(out.seq).toBe(1);
    expect(out.dueDate).toBe("2026-12-01");
    expect(out.scheduledDate).toBeNull();
    expect(out.partner).toBe("SparkleClean");
    expect(out.unitId).toBe("00000000-0000-0000-0000-0000000f0001");
    expect(out.status).toBe("pending");
  });

  it("rentalUnitEventFromRow maps the event trail row snake→camel", () => {
    const row: RentalUnitEventRow = {
      id: "00000000-0000-0000-0000-000000030001",
      unit_id: "00000000-0000-0000-0000-0000000f0001",
      event_type: "service",
      visit_id: "00000000-0000-0000-0000-000000020001",
      description: "Visit 1 completed — deep clean",
      photo_url: null,
      actor: null,
      occurred_at: "2026-12-01T10:00:00Z",
    };
    expect(rentalUnitEventFromRow(row)).toEqual({
      id: "00000000-0000-0000-0000-000000030001",
      unitId: "00000000-0000-0000-0000-0000000f0001",
      eventType: "service",
      visitId: "00000000-0000-0000-0000-000000020001",
      description: "Visit 1 completed — deep clean",
      photoUrl: null,
      actor: null,
      occurredAt: "2026-12-01T10:00:00Z",
    });
  });
});
