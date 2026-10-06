import { describe, expect, it } from "vitest";
import { DELIVERY_FACT_REFUSALS } from "../sales-order-form";
import { createOrderInputSchema, rawCreateOrderInputSchema } from "./orders";

/**
 * THE REQUIRED SALES FACTS FOR A DELIVERY (owner ruling 2026-09-13, Delivery
 * Card 18): delivery address, state, building type, floor, lift and the
 * requested delivery date are facts of a valid NEW order at every create door
 * — the POS schema and the office (raw) schema refuse with ONE wording.
 */

const posBody = {
  outletId: "00000000-0000-0000-0000-00000000ee01",
  salespersonId: "00000000-0000-0000-0000-00000000ff01",
  customer: {
    name: "Tan Mei Ling",
    phone: "012-3456789",
    address: "123 Jalan Sample, 50000 KL",
    addressUnknown: false,
    addressState: "Kuala Lumpur",
    billing: null,
    billingSame: true,
    emergency: "Tan Junior · 012-9988776 · Spouse",
  },
  delivery: { date: "2026-10-01", proceedDate: "2026-09-15", dateTbd: false, floor: 1, hasLift: false },
  lines: [{ sku: "mattress:carres-classic:queen", qty: 1, attrs: null, unitPrice: 1500 }],
  addons: [],
  paid: 100,
  signaturePath: "orders-attachments/d1/w1/signature.png",
  paymentSlipPath: null,
  termsAccepted: true as const,
  depositPct: 10,
  paymentMethod: "cash",
  approvalCode: "ABC123",
  installmentMonths: null,
  entryData: { fields: { building_type: "Condo" } },
};

function messagesOf(result: { success: boolean; error?: { issues: Array<{ message: string }> } }): string[] {
  return result.success ? [] : (result.error?.issues ?? []).map((i) => i.message);
}

describe("createOrderInputSchema — the POS door", () => {
  it("accepts a complete order", () => {
    expect(createOrderInputSchema.safeParse(posBody).success).toBe(true);
  });

  it("refuses the retired 'address later' escape and a missing state or building type", () => {
    const noAddress = createOrderInputSchema.safeParse({
      ...posBody,
      customer: { ...posBody.customer, address: null, addressUnknown: true, addressState: null },
    });
    expect(messagesOf(noAddress)).toEqual(expect.arrayContaining([DELIVERY_FACT_REFUSALS.address, DELIVERY_FACT_REFUSALS.state]));
    const noBuilding = createOrderInputSchema.safeParse({ ...posBody, entryData: { fields: { referral: "Fair" } } });
    expect(messagesOf(noBuilding)).toEqual([DELIVERY_FACT_REFUSALS.buildingType]);
    const noEntryData = createOrderInputSchema.safeParse({ ...posBody, entryData: undefined });
    expect(messagesOf(noEntryData)).toEqual([DELIVERY_FACT_REFUSALS.buildingType]);
  });
});

describe("rawCreateOrderInputSchema — the office door, same words", () => {
  const rawBody = {
    dealerId: "00000000-0000-0000-0000-00000000dd01",
    customer: { name: "Raw Customer", address: "12 Jalan A, KL", addressUnknown: false, addressState: "Kuala Lumpur" },
    deliveryDate: "2024-01-15",
    deliveryFloor: 3,
    deliveryHasLift: true,
    entryData: { fields: { building_type: "Landed" } },
    lines: [{ sku: "CLOUD-QUEEN", qty: 1, unitPrice: 2890 }],
  };

  it("accepts a complete raw order — no lead-time floor, a past date still allowed", () => {
    expect(rawCreateOrderInputSchema.safeParse(rawBody).success).toBe(true);
  });

  it("names each missing fact with the governed word", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ customer: { name: "Raw Customer", addressUnknown: true } }, DELIVERY_FACT_REFUSALS.address],
      [{ customer: { name: "Raw Customer", address: "12 Jalan A, KL", addressUnknown: false } }, DELIVERY_FACT_REFUSALS.state],
      [{ entryData: undefined }, DELIVERY_FACT_REFUSALS.buildingType],
      [{ deliveryFloor: undefined }, DELIVERY_FACT_REFUSALS.floor],
      [{ deliveryHasLift: undefined }, DELIVERY_FACT_REFUSALS.lift],
      [{ deliveryDate: null }, DELIVERY_FACT_REFUSALS.date],
    ];
    for (const [over, word] of cases) {
      expect(messagesOf(rawCreateOrderInputSchema.safeParse({ ...rawBody, ...over }))).toContain(word);
    }
  });
});
