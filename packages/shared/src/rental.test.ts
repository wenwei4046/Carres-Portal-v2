import { describe, expect, it } from "vitest";
import type { RentalOptionGroup, RentalSurcharge } from "./domain";
import {
  compartmentBuildMonthly,
  mergeRentalGifts,
  quoteRental,
  rentalContractValue,
  rentalMonthlySplit,
  resolveRentalPick,
  serviceSkuCode,
  serviceVisitIntervalMonths,
  serviceVisitsTotal,
} from "./rental";
import {
  createRentalAgreementInputSchema,
  customerInputSchema,
  rentalOfferInputSchema,
  rentalOfferPatchSchema,
  rentalOfferServiceInputSchema,
  rentalPlanInputSchema,
  rentalPlanPatchSchema,
  servicePackageInputSchema,
  servicePackagePatchSchema,
} from "./schemas/rental";

describe("serviceVisitsTotal", () => {
  it("accrues visits at visitsPerYear across the duration (floored)", () => {
    expect(serviceVisitsTotal(12, 3)).toBe(3);
    expect(serviceVisitsTotal(24, 3)).toBe(6);
    expect(serviceVisitsTotal(36, 4)).toBe(12);
  });

  it("floors a fractional accrual (18 months × 3/year = 4.5 → 4)", () => {
    expect(serviceVisitsTotal(18, 3)).toBe(4);
  });

  it("grants at least ONE visit even when the floor lands on 0 (6 months × 1/year)", () => {
    expect(serviceVisitsTotal(6, 1)).toBe(1);
    expect(serviceVisitsTotal(1, 1)).toBe(1);
  });
});

describe("serviceVisitIntervalMonths", () => {
  it("spaces visits 12/visitsPerYear months apart", () => {
    expect(serviceVisitIntervalMonths(1)).toBe(12);
    expect(serviceVisitIntervalMonths(2)).toBe(6);
    expect(serviceVisitIntervalMonths(3)).toBe(4);
    expect(serviceVisitIntervalMonths(4)).toBe(3);
    expect(serviceVisitIntervalMonths(12)).toBe(1);
  });

  it("may return a fractional interval (5/year → 2.4)", () => {
    expect(serviceVisitIntervalMonths(5)).toBeCloseTo(2.4, 10);
  });
});

describe("rentalContractValue", () => {
  it("is monthly fee × term months (RM59 × 84 = RM4,956)", () => {
    expect(rentalContractValue(59, 84)).toBe(4956);
    expect(rentalContractValue(99, 60)).toBe(5940);
  });

  it("is 0 for a zero fee", () => {
    expect(rentalContractValue(0, 60)).toBe(0);
  });
});

describe("rentalMonthlySplit", () => {
  it("splits RM59 @ 49% supplier / 20% commission → 28.91 / 11.80 / 18.29", () => {
    const out = rentalMonthlySplit(59, 49, 20);
    expect(out.supplierShare).toBe(28.91);
    expect(out.commissionShare).toBe(11.8);
    expect(out.carresShare).toBe(18.29);
  });

  it("the three ROUNDED shares always sum exactly to the fee (Σ-exact in cents)", () => {
    const cases: Array<[number, number, number]> = [
      [59, 49, 20],
      [99.99, 33.33, 10],
      [123.45, 12.34, 5.67],
      [59, 0, 0],
      [1, 33, 33],
    ];
    for (const [fee, sup, com] of cases) {
      const { supplierShare, commissionShare, carresShare } = rentalMonthlySplit(fee, sup, com);
      const sumCents = Math.round(supplierShare * 100) +
        Math.round(commissionShare * 100) +
        Math.round(carresShare * 100);
      expect(sumCents).toBe(Math.round(fee * 100));
    }
  });

  it("gives Carres the whole fee at 0/0 rates", () => {
    expect(rentalMonthlySplit(100, 0, 0)).toEqual({
      supplierShare: 0,
      commissionShare: 0,
      carresShare: 100,
    });
  });

  it("rounds each share to 2dp", () => {
    // 99.99 × 33.33% = 33.326667 → 33.33; commission 9.999 → 10.
    const out = rentalMonthlySplit(99.99, 33.33, 10);
    expect(out.supplierShare).toBe(33.33);
    expect(out.commissionShare).toBe(10);
    expect(out.carresShare).toBe(56.66);
  });
});

describe("servicePackageInputSchema", () => {
  const valid = { name: "Annual Clean", durationMonths: 12, visitsPerYear: 3 };

  it("parses a minimal valid input and applies the defaults", () => {
    const out = servicePackageInputSchema.parse(valid);
    expect(out.serviceType).toBe("cleaning");
    expect(out.price).toBe(0);
    expect(out.sku).toBeUndefined();
  });

  it("accepts the full shape (nullable sku, active, sortOrder)", () => {
    const out = servicePackageInputSchema.parse({
      ...valid,
      serviceType: "repair",
      price: 199.9,
      sku: null,
      active: true,
      sortOrder: 5,
    });
    expect(out.serviceType).toBe("repair");
    expect(out.sku).toBeNull();
  });

  it("rejects an empty name / out-of-range duration / visits / negative price", () => {
    expect(servicePackageInputSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
    expect(servicePackageInputSchema.safeParse({ ...valid, durationMonths: 0 }).success).toBe(false);
    expect(servicePackageInputSchema.safeParse({ ...valid, durationMonths: 121 }).success).toBe(false);
    expect(servicePackageInputSchema.safeParse({ ...valid, durationMonths: 12.5 }).success).toBe(false);
    expect(servicePackageInputSchema.safeParse({ ...valid, visitsPerYear: 0 }).success).toBe(false);
    expect(servicePackageInputSchema.safeParse({ ...valid, visitsPerYear: 13 }).success).toBe(false);
    expect(servicePackageInputSchema.safeParse({ ...valid, price: -1 }).success).toBe(false);
    expect(servicePackageInputSchema.safeParse({ ...valid, serviceType: "spa" }).success).toBe(false);
  });

  it("patch: every field optional, unknown keys still rejected", () => {
    expect(servicePackagePatchSchema.parse({})).toEqual({});
    expect(servicePackagePatchSchema.parse({ active: false })).toEqual({ active: false });
    expect(servicePackagePatchSchema.safeParse({ bogus: 1 }).success).toBe(false);
    expect(servicePackagePatchSchema.safeParse({ visitsPerYear: 13 }).success).toBe(false);
  });
});

describe("rentalPlanInputSchema", () => {
  const valid = { sku: "M-CLOUD-KING", termMonths: 84, monthlyFee: 59 };

  it("parses a minimal valid input and defaults the split rates to 0", () => {
    const out = rentalPlanInputSchema.parse(valid);
    expect(out.supplierRatePct).toBe(0);
    expect(out.commissionBasePct).toBe(0);
    expect(out.includedPackageId).toBeUndefined();
  });

  it("accepts the full shape (rates, nullable includedPackageId, active)", () => {
    const out = rentalPlanInputSchema.parse({
      ...valid,
      supplierRatePct: 49,
      commissionBasePct: 20,
      includedPackageId: "00000000-0000-0000-0000-0000000000aa",
      active: true,
    });
    expect(out.supplierRatePct).toBe(49);
    expect(rentalPlanInputSchema.parse({ ...valid, includedPackageId: null }).includedPackageId).toBeNull();
  });

  it("rejects a missing/empty sku, non-positive term, negative fee, out-of-range rates, bad uuid", () => {
    expect(rentalPlanInputSchema.safeParse({ termMonths: 84, monthlyFee: 59 }).success).toBe(false);
    expect(rentalPlanInputSchema.safeParse({ ...valid, sku: "" }).success).toBe(false);
    expect(rentalPlanInputSchema.safeParse({ ...valid, termMonths: 0 }).success).toBe(false);
    expect(rentalPlanInputSchema.safeParse({ ...valid, termMonths: 12.5 }).success).toBe(false);
    expect(rentalPlanInputSchema.safeParse({ ...valid, monthlyFee: -1 }).success).toBe(false);
    expect(rentalPlanInputSchema.safeParse({ ...valid, supplierRatePct: 101 }).success).toBe(false);
    expect(rentalPlanInputSchema.safeParse({ ...valid, commissionBasePct: -1 }).success).toBe(false);
    expect(rentalPlanInputSchema.safeParse({ ...valid, includedPackageId: "not-a-uuid" }).success).toBe(false);
  });

  it("patch: every field optional, unknown keys still rejected", () => {
    expect(rentalPlanPatchSchema.parse({})).toEqual({});
    expect(rentalPlanPatchSchema.parse({ monthlyFee: 69 })).toEqual({ monthlyFee: 69 });
    expect(rentalPlanPatchSchema.safeParse({ bogus: 1 }).success).toBe(false);
    expect(rentalPlanPatchSchema.safeParse({ supplierRatePct: 101 }).success).toBe(false);
  });
});

describe("customerInputSchema", () => {
  it("parses a minimal valid input (name + phone) and trims", () => {
    const out = customerInputSchema.parse({ name: "  Tan Mei Ling ", phone: " 012-3456789 " });
    expect(out.name).toBe("Tan Mei Ling");
    expect(out.phone).toBe("012-3456789");
    expect(out.email).toBeUndefined();
  });

  it("accepts optional email/address/notes", () => {
    const out = customerInputSchema.parse({
      name: "Tan Mei Ling",
      phone: "0123456789",
      email: "mei@example.com",
      address: "123 Jalan Sample, 50000 KL",
      notes: "Prefers weekend visits",
    });
    expect(out.email).toBe("mei@example.com");
  });

  it("rejects an empty name, a too-short/too-long phone and unknown keys", () => {
    expect(customerInputSchema.safeParse({ name: "", phone: "0123456789" }).success).toBe(false);
    expect(customerInputSchema.safeParse({ name: "Tan", phone: "1234" }).success).toBe(false);
    expect(customerInputSchema.safeParse({ name: "Tan", phone: "9".repeat(33) }).success).toBe(false);
    expect(customerInputSchema.safeParse({ name: "Tan", phone: "0123456789", bogus: 1 }).success).toBe(false);
  });
});

describe("rental plan split cap (0253)", () => {
  it("rejects supplier + commission over 100 on create", () => {
    const over = rentalPlanInputSchema.safeParse({
      sku: "CLOUD-K", termMonths: 84, monthlyFee: 59,
      supplierRatePct: 60, commissionBasePct: 60,
    });
    expect(over.success).toBe(false);
  });

  it("rejects an over-100 pair on patch, allows a lone rate (DB CHECK backstops)", () => {
    expect(
      rentalPlanPatchSchema.safeParse({ supplierRatePct: 60, commissionBasePct: 60 }).success,
    ).toBe(false);
    expect(rentalPlanPatchSchema.safeParse({ supplierRatePct: 60 }).success).toBe(true);
  });

  it("customer email must be an email when present; null clears", () => {
    expect(customerInputSchema.safeParse({ name: "A", phone: "0123456", email: "not-an-email" }).success).toBe(false);
    expect(customerInputSchema.safeParse({ name: "A", phone: "0123456", email: "a@b.co" }).success).toBe(true);
    expect(customerInputSchema.safeParse({ name: "A", phone: "0123456", email: null }).success).toBe(true);
  });
});

describe("createRentalAgreementInputSchema (0255 POS sell lane)", () => {
  const valid = {
    planId: "00000000-0000-0000-0000-0000000b0001",
    customerName: "Tan Mei Ling",
    customerPhone: "012-3456789",
  };

  it("accepts the minimal signup (plan + mandatory customer name/phone)", () => {
    const out = createRentalAgreementInputSchema.parse(valid);
    expect(out.planId).toBe(valid.planId);
    expect(out.customerName).toBe("Tan Mei Ling");
    expect(out.startDate).toBeUndefined();
  });

  it("accepts the full payload (dealer on-behalf, salesperson, start date, notes)", () => {
    const out = createRentalAgreementInputSchema.parse({
      ...valid,
      customerEmail: "mei@example.com",
      customerAddress: "123 Jalan Sample, 50000 KL",
      dealerId: "00000000-0000-0000-0000-0000000e0001",
      salespersonId: "00000000-0000-0000-0000-0000000f0001",
      startDate: "2026-08-01",
      notes: "Pilot signup",
    });
    expect(out.startDate).toBe("2026-08-01");
  });

  it("rejects a missing/blank customer, a non-uuid plan, a malformed date and unknown keys", () => {
    expect(createRentalAgreementInputSchema.safeParse({ ...valid, customerName: "  " }).success).toBe(false);
    expect(createRentalAgreementInputSchema.safeParse({ ...valid, customerPhone: "1234" }).success).toBe(false);
    expect(createRentalAgreementInputSchema.safeParse({ ...valid, planId: "not-a-uuid" }).success).toBe(false);
    expect(createRentalAgreementInputSchema.safeParse({ ...valid, startDate: "01-08-2026" }).success).toBe(false);
    expect(createRentalAgreementInputSchema.safeParse({ ...valid, monthlyFee: 1 }).success).toBe(false);
  });

  it("never carries money — a fee/split field is an unknown key by .strict()", () => {
    expect(
      createRentalAgreementInputSchema.safeParse({ ...valid, supplierRatePct: 0 }).success,
    ).toBe(false);
  });
});

// ── 0264 — the offer layer ─────────────────────────────────────────────────

describe("serviceSkuCode", () => {
  it("builds SVC-{CATEGORY}-{TYPE}-{years}Y{visits} (Loo 2026-07-26)", () => {
    expect(serviceSkuCode("mattress", "cleaning", 12, 2)).toBe("SVC-MAT-CLEAN-1Y2");
    expect(serviceSkuCode("sofa", "cleaning", 36, 3)).toBe("SVC-SOFA-CLEAN-3Y3");
    expect(serviceSkuCode("bedframe", "repair", 36, 1)).toBe("SVC-BF-REPAIR-3Y1");
    expect(serviceSkuCode("accessory", "other", 24, 4)).toBe("SVC-ACC-SVCX-2Y4");
  });

  it("keeps months when the duration is not whole years, so a code is never ambiguous", () => {
    expect(serviceSkuCode("mattress", "cleaning", 18, 2)).toBe("SVC-MAT-CLEAN-18M2");
  });

  it("changing duration or visits changes the code — two plans cannot collide", () => {
    expect(serviceSkuCode("mattress", "cleaning", 12, 2)).not.toBe(
      serviceSkuCode("mattress", "cleaning", 12, 3),
    );
    expect(serviceSkuCode("mattress", "cleaning", 12, 2)).not.toBe(
      serviceSkuCode("mattress", "cleaning", 24, 2),
    );
  });
});

/** Overlay fixture: legs 2"/3" free, 4" RM80 once, 5" RM5/mo, 10" off;
 *  fabrics CG series free with only 2 colours authored (CG-008 at RM4/mo). */
const OVERLAY: Record<string, RentalOptionGroup> = {
  leg_heights: {
    required: true,
    series: {},
    values: {
      '2"': { on: true, oneTime: 0, monthly: 0 },
      '3"': { on: true, oneTime: null, monthly: null },
      '4"': { on: true, oneTime: 80, monthly: 0 },
      '5"': { on: true, oneTime: 0, monthly: 5 },
      '10"': { on: false, oneTime: 0, monthly: 0 },
    },
  },
  fabrics: {
    required: true,
    values: {},
    series: {
      CG: {
        on: true,
        oneTime: 0,
        monthly: 0,
        colors: {
          "CG-001": { on: true, oneTime: null, monthly: null },
          "CG-008": { on: true, oneTime: null, monthly: 4 },
          "CG-010": { on: false, oneTime: null, monthly: null },
        },
      },
      EZ: { on: false, oneTime: null, monthly: null, colors: {} },
      D: { on: true, oneTime: 0, monthly: 6, colors: {} },
    },
  },
};

const SURCHARGES: RentalSurcharge[] = [
  { code: "delivery", label: "Delivery & installation", oneTime: 150, monthly: 0, required: true },
  { code: "fabric-care", label: "Premium fabric care", oneTime: 0, monthly: 15, required: false },
];

describe("resolveRentalPick", () => {
  it("charges an ON value and reads null as free", () => {
    expect(resolveRentalPick(OVERLAY, { group: "leg_heights", value: '5"' })).toEqual({
      oneTime: 0,
      monthly: 5,
    });
    expect(resolveRentalPick(OVERLAY, { group: "leg_heights", value: '3"' })).toEqual({
      oneTime: 0,
      monthly: 0,
    });
  });

  it("rejects an unknown group, an unknown value and a switched-off value", () => {
    expect(resolveRentalPick(OVERLAY, { group: "divan_heights", value: '6"' })).toBeNull();
    expect(resolveRentalPick(OVERLAY, { group: "leg_heights", value: '7"' })).toBeNull();
    expect(resolveRentalPick(OVERLAY, { group: "leg_heights", value: '10"' })).toBeNull();
  });

  it("a fabric colour inherits its series and can override it", () => {
    expect(resolveRentalPick(OVERLAY, { group: "fabrics", value: "CG-001", series: "CG" })).toEqual({
      oneTime: 0,
      monthly: 0,
    });
    expect(resolveRentalPick(OVERLAY, { group: "fabrics", value: "CG-008", series: "CG" })).toEqual({
      oneTime: 0,
      monthly: 4,
    });
  });

  it("rejects an off colour, an off series, and a colour whose series was never named", () => {
    expect(resolveRentalPick(OVERLAY, { group: "fabrics", value: "CG-010", series: "CG" })).toBeNull();
    expect(resolveRentalPick(OVERLAY, { group: "fabrics", value: "EZ-001", series: "EZ" })).toBeNull();
    expect(resolveRentalPick(OVERLAY, { group: "fabrics", value: "CG-001" })).toBeNull();
  });

  it("a series with NO authored colours offers every colour at the series price", () => {
    expect(resolveRentalPick(OVERLAY, { group: "fabrics", value: "D-004", series: "D" })).toEqual({
      oneTime: 0,
      monthly: 6,
    });
  });
});

describe("quoteRental", () => {
  it("adds the picked options and the REQUIRED surcharge to the base (Loo's bed-frame example)", () => {
    const q = quoteRental({
      baseMonthly: 45,
      termMonths: 84,
      optionPrices: OVERLAY,
      picks: [
        { group: "leg_heights", value: '5"' },
        { group: "fabrics", value: "CG-008", series: "CG" },
      ],
      surcharges: SURCHARGES,
    });
    expect(q.monthly).toBe(54); // 45 + 5 legs + 4 fabric
    expect(q.oneOff).toBe(150); // delivery is required
    expect(q.termTotal).toBe(54 * 84 + 150);
    expect(q.invalidPicks).toEqual([]);
  });

  it("counts an optional surcharge only when the store ticked it", () => {
    const base = {
      baseMonthly: 40,
      termMonths: 60,
      optionPrices: OVERLAY,
      picks: [],
      surcharges: SURCHARGES,
    };
    expect(quoteRental(base).monthly).toBe(40);
    expect(quoteRental({ ...base, pickedSurcharges: ["fabric-care"] }).monthly).toBe(55);
  });

  it("a one-time option is charged once, never monthly", () => {
    const q = quoteRental({
      baseMonthly: 45,
      termMonths: 84,
      optionPrices: OVERLAY,
      picks: [{ group: "leg_heights", value: '4"' }],
      surcharges: [],
    });
    expect(q.monthly).toBe(45);
    expect(q.oneOff).toBe(80);
    expect(q.termTotal).toBe(45 * 84 + 80);
  });

  it("reports a disallowed pick instead of silently dropping it (the signing gate)", () => {
    const q = quoteRental({
      baseMonthly: 45,
      termMonths: 84,
      optionPrices: OVERLAY,
      picks: [{ group: "leg_heights", value: '10"' }],
      surcharges: [],
    });
    expect(q.invalidPicks).toEqual(['leg_heights:10"']);
    expect(q.monthly).toBe(45);
  });

  it("lists every charge but skips the free picks", () => {
    const q = quoteRental({
      baseMonthly: 45,
      termMonths: 84,
      optionPrices: OVERLAY,
      picks: [
        { group: "leg_heights", value: '2"' },
        { group: "leg_heights", value: '5"' },
      ],
      surcharges: SURCHARGES,
    });
    expect(q.lines.map((l) => l.key)).toEqual(['leg_heights:5"', "delivery"]);
  });

  it("rounds only at the end, so the parts sum to the whole (Σ-exact)", () => {
    const q = quoteRental({
      baseMonthly: 10.005,
      termMonths: 12,
      optionPrices: {},
      picks: [],
      surcharges: [{ code: "x", label: "X", oneTime: 0.004, monthly: 0.004, required: true }],
    });
    expect(q.monthly).toBe(10.01);
    expect(q.oneOff).toBe(0);
  });

  it("a BUY-lane quote (term 0) collects only the one-off money", () => {
    const q = quoteRental({
      baseMonthly: 0,
      termMonths: 0,
      optionPrices: OVERLAY,
      picks: [{ group: "leg_heights", value: '4"' }],
      surcharges: SURCHARGES,
    });
    expect(q.monthly).toBe(0);
    expect(q.termTotal).toBe(230); // 80 legs + 150 delivery
  });
});

describe("compartmentBuildMonthly", () => {
  it("sums the picked parts (Loo: 1A 10 + 1S 20 + 2A 10 = 40/mo)", () => {
    const out = compartmentBuildMonthly({ "1A": 10, "2A": 10, "1S": 20 }, ["1A", "1S", "2A"]);
    expect(out.monthly).toBe(40);
    expect(out.missing).toEqual([]);
  });

  it("counts a repeated part every time it appears", () => {
    expect(compartmentBuildMonthly({ "1S": 20 }, ["1S", "1S"]).monthly).toBe(40);
  });

  it("reports a part with no authored rate instead of renting it free", () => {
    const out = compartmentBuildMonthly({ "1A": 10 }, ["1A", "1L"]);
    expect(out.monthly).toBe(10);
    expect(out.missing).toEqual(["1L"]);
  });
});

describe("mergeRentalGifts", () => {
  it("merges duplicate SKUs into one line for stock and the supplier PO", () => {
    expect(
      mergeRentalGifts([{ sku: "PILLOW-STD", qty: 2 }], [{ sku: "PILLOW-STD", qty: 1 }, { sku: "PROTECTOR", qty: 1 }]),
    ).toEqual([
      { sku: "PILLOW-STD", qty: 3 },
      { sku: "PROTECTOR", qty: 1 },
    ]);
  });
});

describe("rentalOfferInputSchema (0264)", () => {
  it("accepts a minimal offer and defaults the rest server-side", () => {
    const out = rentalOfferInputSchema.parse({ modelId: "00000000-0000-0000-0000-00000000ab01" });
    expect(out.modelId).toBe("00000000-0000-0000-0000-00000000ab01");
  });

  it("keeps the split cap — supplier + commission can never exceed the collection", () => {
    expect(
      rentalOfferInputSchema.safeParse({
        modelId: "00000000-0000-0000-0000-00000000ab01",
        supplierRatePct: 70,
        commissionBasePct: 40,
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown key and a negative option price", () => {
    expect(
      rentalOfferInputSchema.safeParse({ modelId: "00000000-0000-0000-0000-00000000ab01", foo: 1 }).success,
    ).toBe(false);
    expect(
      rentalOfferInputSchema.safeParse({
        modelId: "00000000-0000-0000-0000-00000000ab01",
        optionPrices: { leg_heights: { values: { '5"': { on: true, monthly: -1 } } } },
      }).success,
    ).toBe(false);
  });

  it("cannot re-point an authored offer at another model (patch omits modelId)", () => {
    expect(
      rentalOfferPatchSchema.safeParse({ modelId: "00000000-0000-0000-0000-00000000ab02" }).success,
    ).toBe(false);
  });
});

describe("rentalPlanInputSchema targets (0264)", () => {
  const base = { termMonths: 84, monthlyFee: 59 };

  it("takes a SKU line or a combo line, never both and never neither", () => {
    expect(rentalPlanInputSchema.safeParse({ ...base, sku: "CLOUD-K" }).success).toBe(true);
    expect(
      rentalPlanInputSchema.safeParse({
        ...base,
        comboId: "00000000-0000-0000-0000-00000000cc01",
        lineKind: "combo",
      }).success,
    ).toBe(true);
    expect(
      rentalPlanInputSchema.safeParse({
        ...base,
        sku: "CLOUD-K",
        comboId: "00000000-0000-0000-0000-00000000cc01",
      }).success,
    ).toBe(false);
    expect(rentalPlanInputSchema.safeParse(base).success).toBe(false);
  });

  it("carries gifts as real SKUs with a positive qty", () => {
    expect(
      rentalPlanInputSchema.safeParse({ ...base, sku: "CLOUD-K", gifts: [{ sku: "PILLOW-STD", qty: 2 }] })
        .success,
    ).toBe(true);
    expect(
      rentalPlanInputSchema.safeParse({ ...base, sku: "CLOUD-K", gifts: [{ sku: "PILLOW-STD", qty: 0 }] })
        .success,
    ).toBe(false);
  });
});

describe("rentalOfferServiceInputSchema (0264)", () => {
  const pkg = "00000000-0000-0000-0000-00000000dd01";

  it("attaches a package free on a lane with a visit count, or priced", () => {
    expect(
      rentalOfferServiceInputSchema.safeParse({ packageId: pkg, freeLane: "rent", freeVisits: 2 }).success,
    ).toBe(true);
    expect(
      rentalOfferServiceInputSchema.safeParse({ packageId: pkg, monthlyPrice: 19, outrightPrice: 390 })
        .success,
    ).toBe(true);
  });

  it("rejects an unknown lane and a negative price", () => {
    expect(rentalOfferServiceInputSchema.safeParse({ packageId: pkg, freeLane: "gift" }).success).toBe(false);
    expect(rentalOfferServiceInputSchema.safeParse({ packageId: pkg, monthlyPrice: -1 }).success).toBe(false);
  });
});
