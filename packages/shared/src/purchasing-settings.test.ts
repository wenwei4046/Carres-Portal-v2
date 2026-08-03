import { describe, expect, it } from "vitest";
import {
  PURCHASING_NUMBER_KEYS,
  isPurchasingCategory,
  isPurchasingNumberKey,
  lastChangeFor,
  productionWorkingDaysFor,
  purchasingSetNumberInput,
  purchasingSetProductionDaysInput,
  purchasingSetWorkWeekInput,
  purchasingUrgentWindowDays,
  unratedPairs,
  workWeekLabel,
  workWeekOffDaysFor,
  type PurchasingSettings,
} from "./purchasing-settings";

const NICE = "11111111-0000-0000-0000-000000000001";
const OHANA = "22222222-0000-0000-0000-000000000002";
const NOBODY = "33333333-0000-0000-0000-000000000003";

/** The live shape 2026-07-28: three real supplier × category pairs. */
const SETTINGS: PurchasingSettings = {
  orderByBufferDays: 7,
  earliestSellDays: 21,
  logisticsCallWorkingDays: 1,
  poDays: [1, 3, 5],
  suppliers: [
    { id: NICE, name: "Nice Future", categories: ["mattress"], offDays: [0, 6], transitDays: 1 },
    { id: OHANA, name: "Ohana", categories: ["bedframe", "sofa"], offDays: [0], transitDays: 1 },
    { id: NOBODY, name: "No SKUs", categories: [], offDays: null, transitDays: null },
  ],
  productionDays: [
    { supplierId: NICE, category: "mattress", workingDays: 7 },
    { supplierId: OHANA, category: "bedframe", workingDays: 7 },
    { supplierId: OHANA, category: "sofa", workingDays: 14 },
  ],
  lastChanges: [
    {
      settingKey: "production_days",
      supplierId: OHANA,
      category: "sofa",
      oldValue: "10",
      newValue: "14",
      changedBy: "Jess",
      changedAt: "2026-07-28T02:00:00.000Z",
    },
    {
      settingKey: "order_by_buffer_days",
      supplierId: null,
      category: null,
      oldValue: "7",
      newValue: "10",
      changedBy: "Jess",
      changedAt: "2026-07-28T01:00:00.000Z",
    },
  ],
  canEdit: true,
};

describe("productionWorkingDaysFor — the number, or nothing", () => {
  it("returns the number a human set", () => {
    expect(productionWorkingDaysFor(SETTINGS, OHANA, "sofa")).toBe(14);
    expect(productionWorkingDaysFor(SETTINGS, OHANA, "bedframe")).toBe(7);
    expect(productionWorkingDaysFor(SETTINGS, NICE, "mattress")).toBe(7);
  });

  it("sofa is 14 working days — the ONE behaviour P1 changes", () => {
    // It read 10 in the route, 5 in the urgent bypass and 14 in a read-only
    // settings sheet. Three homes, three numbers.
    expect(productionWorkingDaysFor(SETTINGS, OHANA, "sofa")).toBe(14);
  });

  it("returns null when nobody set a number — never a silent 7", () => {
    expect(productionWorkingDaysFor(SETTINGS, NICE, "sofa")).toBeNull();
    expect(productionWorkingDaysFor(SETTINGS, NOBODY, "mattress")).toBeNull();
    expect(productionWorkingDaysFor(SETTINGS, null, "sofa")).toBeNull();
    expect(productionWorkingDaysFor(SETTINGS, OHANA, null)).toBeNull();
  });
});

describe("workWeekOffDaysFor — keyed by SUPPLIER, not by category", () => {
  it("Nice Future is a 5-day week; Ohana works Saturday", () => {
    expect(workWeekOffDaysFor(SETTINGS, NICE)).toEqual([0, 6]);
    expect(workWeekOffDaysFor(SETTINGS, OHANA)).toEqual([0]);
  });

  it("an unset week falls back to the portal's own working-day definition", () => {
    // Sunday off, Mon–Sat — never a purchasing constant. A supplier with no
    // week also has no production time, so it is already out of the plan.
    expect(workWeekOffDaysFor(SETTINGS, NOBODY)).toEqual([0]);
    expect(workWeekOffDaysFor(SETTINGS, null)).toEqual([0]);
  });
});

describe("unratedPairs — what the To Order tab must say out loud", () => {
  it("lists each pair once, and only the ones with no number", () => {
    const pairs = unratedPairs(SETTINGS, [
      { supplierId: OHANA, category: "sofa" }, // rated
      { supplierId: NICE, category: "sofa" }, // NOT rated
      { supplierId: NICE, category: "sofa" }, // same pair again
      { supplierId: NOBODY, category: "bedframe" }, // NOT rated
    ]);
    expect(pairs).toEqual([
      { supplierId: NICE, category: "sofa" },
      { supplierId: NOBODY, category: "bedframe" },
    ]);
  });

  it("nothing to say when every pair carries a number", () => {
    expect(
      unratedPairs(SETTINGS, [
        { supplierId: OHANA, category: "sofa" },
        { supplierId: NICE, category: "mattress" },
      ]),
    ).toEqual([]);
  });
});

describe("purchasingUrgentWindowDays", () => {
  it("takes the longest production time across the short categories", () => {
    expect(purchasingUrgentWindowDays(SETTINGS, ["sofa"])).toBe(14);
    expect(purchasingUrgentWindowDays(SETTINGS, ["mattress"])).toBe(7);
    expect(purchasingUrgentWindowDays(SETTINGS, ["sofa", "mattress"])).toBe(14);
  });

  it("0 when nobody has set a number for any of them", () => {
    expect(purchasingUrgentWindowDays(SETTINGS, ["accessory"])).toBe(0);
    expect(purchasingUrgentWindowDays(SETTINGS, [])).toBe(0);
  });
});

describe("lastChangeFor — the line under each row", () => {
  it("finds the per-supplier × category change", () => {
    const c = lastChangeFor(SETTINGS, "production_days", OHANA, "sofa");
    expect(c?.oldValue).toBe("10");
    expect(c?.newValue).toBe("14");
    expect(c?.changedBy).toBe("Jess");
  });

  it("finds a single-number change, and null when there is none", () => {
    expect(lastChangeFor(SETTINGS, "order_by_buffer_days")?.oldValue).toBe("7");
    expect(lastChangeFor(SETTINGS, "po_days")).toBeNull();
    expect(lastChangeFor(SETTINGS, "production_days", NICE, "mattress")).toBeNull();
  });
});

describe("workWeekLabel", () => {
  it("states the days the factory WORKS", () => {
    expect(workWeekLabel([0, 6])).toBe("Mon–Fri");
    expect(workWeekLabel([0])).toBe("Mon–Sat");
  });
  it("a non-contiguous week is listed, not faked into a range", () => {
    expect(workWeekLabel([0, 3])).toBe("Mon Tue Thu Fri Sat");
  });
});

describe("the wire refuses what the database would refuse", () => {
  it("only the three single numbers are settable by key", () => {
    expect(PURCHASING_NUMBER_KEYS).toEqual([
      "order_by_buffer_days",
      "earliest_sell_days",
      "logistics_call_working_days",
    ]);
    expect(isPurchasingNumberKey("production_days")).toBe(false);
    expect(purchasingSetNumberInput.safeParse({ key: "po_days", value: 3 }).success).toBe(false);
    expect(
      purchasingSetNumberInput.safeParse({ key: "order_by_buffer_days", value: 10 }).success,
    ).toBe(true);
  });

  it("production days accepts null (clear the number) but not zero", () => {
    const base = { supplierId: OHANA, category: "sofa" as const };
    expect(purchasingSetProductionDaysInput.safeParse({ ...base, days: null }).success).toBe(true);
    expect(purchasingSetProductionDaysInput.safeParse({ ...base, days: 14 }).success).toBe(true);
    expect(purchasingSetProductionDaysInput.safeParse({ ...base, days: 0 }).success).toBe(false);
  });

  it("a work week cannot be every day off", () => {
    expect(
      purchasingSetWorkWeekInput.safeParse({ supplierId: OHANA, offDays: [0, 1, 2, 3, 4, 5, 6] })
        .success,
    ).toBe(false);
    expect(purchasingSetWorkWeekInput.safeParse({ supplierId: OHANA, offDays: [] }).success).toBe(
      false,
    );
    expect(
      purchasingSetWorkWeekInput.safeParse({ supplierId: OHANA, offDays: [0, 6] }).success,
    ).toBe(true);
  });

  it("only the three purchasable categories exist", () => {
    expect(isPurchasingCategory("sofa")).toBe(true);
    expect(isPurchasingCategory("guarantee")).toBe(false);
    expect(isPurchasingCategory("accessory")).toBe(false);
  });
});
