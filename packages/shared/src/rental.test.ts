import { describe, expect, it } from "vitest";
import {
  rentalContractValue,
  rentalMonthlySplit,
  serviceVisitIntervalMonths,
  serviceVisitsTotal,
} from "./rental";
import {
  customerInputSchema,
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
