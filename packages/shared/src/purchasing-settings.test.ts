import { describe, expect, it } from "vitest";
import { addWorkingDays } from "./working-days";
import {
  PURCHASING_NUMBER_KEYS,
  expectedArrivalOf,
  orderByFromDeliveryDate,
  isPurchasingCategory,
  isPurchasingNumberKey,
  lastChangeFor,
  parsePgIntArray,
  productionWorkingDaysFor,
  purchasingSetNumberInput,
  purchasingCreateDestinationInput,
  purchasingSetProductionDaysInput,
  purchasingUpdateDestinationInput,
  purchasingSetWorkWeekInput,
  purchasingUrgentWindowDays,
  settingValueLabel,
  unratedPairs,
  weekdayListLabel,
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
  manualPurchaseEnforceEarliestDate: false,
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
  destinations: [
    {
      id: "44444444-0000-0000-0000-000000000004",
      name: "Carres Klang",
      address: "Lot 12, Klang",
      isDefault: true,
      active: true,
      warehouseLinked: true,
    },
    {
      id: "55555555-0000-0000-0000-000000000005",
      name: "Ohana",
      address: null,
      isDefault: false,
      active: true,
      warehouseLinked: false,
    },
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
  it("accepts a future Deliver To and trims its name and address", () => {
    expect(
      purchasingCreateDestinationInput.parse({
        name: "  Ohana  ",
        address: "  Sungai Buloh  ",
      }),
    ).toEqual({ name: "Ohana", address: "Sungai Buloh" });
  });

  it("refuses a blank Deliver To name", () => {
    expect(
      purchasingCreateDestinationInput.safeParse({ name: "   ", address: null }).success,
    ).toBe(false);
  });

  it("a destination edit carries the full governed state", () => {
    expect(
      purchasingUpdateDestinationInput.safeParse({
        name: "Ohana",
        address: null,
        active: true,
        isDefault: false,
      }).success,
    ).toBe(true);
    expect(
      purchasingUpdateDestinationInput.safeParse({
        name: "Ohana",
        address: null,
        active: false,
        isDefault: true,
      }).success,
    ).toBe(false);
  });

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

/**
 * `expectedArrivalOf` — ONE arithmetic for the expected arrival (Loo,
 * 2026-08-05, §4 Approved Evolution). It replaced two copies that disagreed:
 * the issue path added the transit leg, the register did not.
 *
 * Holidays are injected EMPTY here on purpose. The 2026 Selangor list is data
 * that will be corrected, and a test that moves when a gazette date is fixed
 * cannot say anything about the arithmetic.
 */
const NO_HOLIDAYS: ReadonlySet<string> = new Set();

describe("expectedArrivalOf — the ONE expected-arrival arithmetic", () => {
  it("production on the FACTORY's week, then transit on the OFFICE week", () => {
    // Ohana works Saturday (offDays [0]). Mon 3 Aug + 7 working days lands on
    // Tue 11 Aug because Sat 8 counts and Sun 9 does not; + 1 transit day on
    // the office week is Wed 12 Aug.
    expect(
      expectedArrivalOf(SETTINGS, {
        supplierId: OHANA,
        category: "bedframe",
        fromIso: "2026-08-03",
        holidays: NO_HOLIDAYS,
      }),
    ).toBe("2026-08-12");
  });

  it("a factory that does NOT work Saturday lands a day later on the same lead", () => {
    // Nice Future is Mon–Fri (offDays [0,6]) on the same 7-day mattress lead:
    // ready Wed 12 Aug, arriving Thu 13 Aug. Same number, different week — the
    // reason production may never be counted on a portal-wide calendar.
    expect(
      expectedArrivalOf(SETTINGS, {
        supplierId: NICE,
        category: "mattress",
        fromIso: "2026-08-03",
        holidays: NO_HOLIDAYS,
      }),
    ).toBe("2026-08-13");
  });

  /**
   * THE DEFECT THIS FUNCTION EXISTS FOR. The register computed
   * `placed_at + production` and stopped, so it printed the day the factory
   * FINISHES as the day the goods REACH us. Both live suppliers carry
   * `transitDays = 1`, and on the 16 dateless POs that missing day moved three
   * rows: one silent that should read `same day`, and two amber `same day` that
   * are truly `1d late`.
   */
  it("THE TRANSIT LEG IS NOT OPTIONAL — production alone is the day the factory finishes", () => {
    const production = addWorkingDays("2026-08-03", 7, { offDays: [0], holidays: NO_HOLIDAYS });
    expect(production).toBe("2026-08-11");
    expect(
      expectedArrivalOf(SETTINGS, {
        supplierId: OHANA,
        category: "bedframe",
        fromIso: "2026-08-03",
        holidays: NO_HOLIDAYS,
      }),
    ).not.toBe(production);
  });

  it("transit skips the WEEKEND even for a factory that works Saturday", () => {
    // Ohana bedframe from Thu 30 Jul is ready Fri 7 Aug. Moving the goods is
    // arranged by US (Law 2A's office week), so the arrival is Mon 10 Aug —
    // never Sat 8, which counting transit on Ohana's own week would give.
    expect(
      expectedArrivalOf(SETTINGS, {
        supplierId: OHANA,
        category: "bedframe",
        fromIso: "2026-07-30",
        holidays: NO_HOLIDAYS,
      }),
    ).toBe("2026-08-10");
  });

  it("NULL IS A REAL ANSWER — no production number, no transit number, no start", () => {
    // P1's law: a missing number never becomes a 7, and never becomes a date.
    expect(
      expectedArrivalOf(SETTINGS, {
        supplierId: OHANA,
        category: "mattress", // Ohana makes no mattresses — no pair, no number
        fromIso: "2026-08-03",
        holidays: NO_HOLIDAYS,
      }),
    ).toBeNull();
    expect(
      expectedArrivalOf(SETTINGS, {
        supplierId: NOBODY, // transitDays null
        category: "sofa",
        fromIso: "2026-08-03",
        holidays: NO_HOLIDAYS,
      }),
    ).toBeNull();
    expect(
      expectedArrivalOf(SETTINGS, {
        supplierId: OHANA,
        category: "bedframe",
        fromIso: null,
        holidays: NO_HOLIDAYS,
      }),
    ).toBeNull();
  });

  it("a timestamp is sliced to its calendar day — `placed_at` arrives as one", () => {
    expect(
      expectedArrivalOf(SETTINGS, {
        supplierId: OHANA,
        category: "bedframe",
        fromIso: "2026-08-03T09:15:00.000Z",
        holidays: NO_HOLIDAYS,
      }),
    ).toBe("2026-08-12");
  });
});

/**
 * `orderByFromDeliveryDate` — the ONE inverse of `expectedArrivalOf`
 * (Purchasing Card 06). Delivery Date − transit on the OFFICE week −
 * production on the FACTORY's own week = Order By; null is a real answer.
 */
describe("orderByFromDeliveryDate — the ONE Order By arithmetic (Card 06)", () => {
  it("walks both legs backwards on their OWN calendars — Ohana works Saturday", () => {
    // 30 Sep 2026 (Wed) − 1 office transit day = Tue 29 Sep; − 14 Ohana
    // working days (Mon–Sat) = Sat 12 Sep.
    expect(
      orderByFromDeliveryDate(SETTINGS, {
        supplierId: OHANA,
        category: "sofa",
        deliveryDateIso: "2026-09-30",
        holidays: NO_HOLIDAYS,
      }),
    ).toBe("2026-09-12");
    // Nice Future does not work Saturday: the same delivery date and a
    // 7-day production lands Fri 18 Sep, not the Saturday arithmetic.
    expect(
      orderByFromDeliveryDate(SETTINGS, {
        supplierId: NICE,
        category: "mattress",
        deliveryDateIso: "2026-09-30",
        holidays: NO_HOLIDAYS,
      }),
    ).toBe("2026-09-18");
  });

  it("is the exact inverse of the forward planner on its own answer", () => {
    const orderBy = orderByFromDeliveryDate(SETTINGS, {
      supplierId: OHANA,
      category: "sofa",
      deliveryDateIso: "2026-09-30",
      holidays: NO_HOLIDAYS,
    });
    expect(
      expectedArrivalOf(SETTINGS, {
        supplierId: OHANA,
        category: "sofa",
        fromIso: orderBy,
        holidays: NO_HOLIDAYS,
      }),
    ).toBe("2026-09-30");
  });

  it("skips an injected public holiday on the office transit leg", () => {
    expect(
      orderByFromDeliveryDate(SETTINGS, {
        supplierId: NICE,
        category: "mattress",
        deliveryDateIso: "2026-09-30",
        holidays: new Set(["2026-09-29"]),
      }),
    ).toBe("2026-09-17");
  });

  it("NULL is a real answer — no production, no transit or no date means no Order By", () => {
    expect(
      orderByFromDeliveryDate(SETTINGS, {
        supplierId: NOBODY,
        category: "sofa",
        deliveryDateIso: "2026-09-30",
        holidays: NO_HOLIDAYS,
      }),
    ).toBeNull();
    expect(
      orderByFromDeliveryDate(SETTINGS, {
        supplierId: OHANA,
        category: "mattress", // no Ohana × mattress number exists
        deliveryDateIso: "2026-09-30",
        holidays: NO_HOLIDAYS,
      }),
    ).toBeNull();
    expect(
      orderByFromDeliveryDate(SETTINGS, {
        supplierId: OHANA,
        category: "sofa",
        deliveryDateIso: null,
        holidays: NO_HOLIDAYS,
      }),
    ).toBeNull();
  });
});

/**
 * 🔴 P20.4 — A WORK WEEK MUST READ AS DAYS, NOT AS A POSTGRES ARRAY.
 *
 * `purchasing_setting_changes.old_value` is a plain `text` column and the two
 * array-valued keys are recorded with `v_old::text`, so the history carries the
 * DATABASE's spelling of an array. The Settings page printed it raw.
 *
 * The two rows below are PRODUCTION's entire audit trail, read 2026-08-08 — so
 * these are the exact two strings the live page was rendering, not invented
 * fixtures.
 */
describe("P20.4 · an audited setting value reads as business, never as SQL", () => {
  it("the two rows production actually holds stop printing `{0}`", () => {
    // `{0}` = off Sunday only → the factory works Monday to Saturday.
    expect(settingValueLabel("supplier_work_week", "{0}")).toBe("Mon–Sat");
    // `{0,6}` = off Sunday and Saturday → Monday to Friday.
    expect(settingValueLabel("supplier_work_week", "{0,6}")).toBe("Mon–Fri");
  });

  it("`po_days` had the identical defect waiting, and reads the same way", () => {
    // Stored the other way round from a work week — these are the days the
    // office SENDS — and it must still read as days.
    expect(settingValueLabel("po_days", "{1,3,5}")).toBe("Mon Wed Fri");
    expect(settingValueLabel("po_days", "{1,2,3,4,5}")).toBe("Mon–Fri");
  });

  it("every other key stores one number and prints as itself", () => {
    expect(settingValueLabel("order_by_buffer_days", "7")).toBe("7");
    expect(settingValueLabel("production_days", "10")).toBe("10");
  });

  it("nothing recorded says nothing — never `was —`", () => {
    for (const empty of [null, undefined, "", "  "]) {
      expect(settingValueLabel("supplier_work_week", empty)).toBeNull();
      expect(settingValueLabel("order_by_buffer_days", empty)).toBeNull();
    }
    // `{}` is a recorded EMPTY array, which is a different fact from nothing
    // recorded — it reads as the glyph, not as a blank.
    expect(settingValueLabel("supplier_work_week", "{}")).toBe("Mon–Sat");
    expect(settingValueLabel("po_days", "{}")).toBe("—");
  });

  it("the parser survives what a text column can hold", () => {
    expect(parsePgIntArray("{0,6}")).toEqual([0, 6]);
    expect(parsePgIntArray("{ 1 , 3 , 5 }")).toEqual([1, 3, 5]);
    expect(parsePgIntArray("{}")).toEqual([]);
    expect(parsePgIntArray(null)).toEqual([]);
    // A non-integer is DROPPED, never turned into NaN — a history line is not
    // worth a crash on the one screen that explains the numbers.
    expect(parsePgIntArray("{1,x,3}")).toEqual([1, 3]);
  });

  /** Architecture law D — a derived fact has ONE arithmetic. The work week and
   *  PO days arrive as opposite lists and must still read the same. */
  it("`workWeekLabel` and `weekdayListLabel` are the same labeller", () => {
    expect(workWeekLabel([0, 6])).toBe(weekdayListLabel([1, 2, 3, 4, 5]));
    expect(workWeekLabel([0])).toBe(weekdayListLabel([1, 2, 3, 4, 5, 6]));
    // Two working days do not collapse into a range — `Mon Tue`, never `Mon–Tue`.
    expect(weekdayListLabel([1, 2])).toBe("Mon Tue");
  });
});
