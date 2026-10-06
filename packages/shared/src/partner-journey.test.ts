import { describe, expect, it } from "vitest";
import {
  latestWarehouseReadyDate,
  partnerJourneyCalendar,
  type PartnerJourneyCalendar,
} from "./partner-journey";

// 2026-08-31 = Monday · 09-01 Tue · 09-02 Wed · 09-03 Thu · 09-04 Fri · 09-05 Sat

const TEOW: PartnerJourneyCalendar = {
  pickupDays: [1, 3, 5],
  regions: {
    Melaka: { deliveryDays: [1, 3, 5], transitDays: 0 },
    JB: { deliveryDays: [2, 4, 6], transitDays: 1 },
  },
  surchargeAreas: [],
};

const TT: PartnerJourneyCalendar = {
  pickupDays: [3],
  regions: { JB: { deliveryDays: null, transitDays: 1 } },
  surchargeAreas: ["Pontian", "Kota Tinggi", "Kulai Tesco", "Sedenak"],
};

describe("latestWarehouseReadyDate — the ONE backward calculation (MASTER §5.1)", () => {
  it("TEOW to Melaka: same-day pickup and delivery on a shared weekday", () => {
    const r = latestWarehouseReadyDate({
      customerDateIso: "2026-09-04", // Friday
      region: "Melaka",
      calendar: TEOW,
    });
    expect(r).toEqual({
      kind: "chain",
      deliveryDay: "2026-09-04",
      deliveryDerived: false,
      pickupDay: "2026-09-04",
      warehouseReadyBy: "2026-09-04",
    });
  });

  it("TEOW to JB: Saturday delivery rides Friday's pickup", () => {
    const r = latestWarehouseReadyDate({
      customerDateIso: "2026-09-05", // Saturday — JB delivery day
      region: "JB",
      calendar: TEOW,
    });
    expect(r).toEqual({
      kind: "chain",
      deliveryDay: "2026-09-05",
      deliveryDerived: false,
      pickupDay: "2026-09-04", // Friday
      warehouseReadyBy: "2026-09-04",
    });
  });

  it("TEOW to JB: a Wednesday customer date walks back to Tuesday delivery, Monday pickup", () => {
    const r = latestWarehouseReadyDate({
      customerDateIso: "2026-09-02", // Wednesday — not a JB delivery day
      region: "JB",
      calendar: TEOW,
    });
    expect(r).toEqual({
      kind: "chain",
      deliveryDay: "2026-09-01", // Tuesday
      deliveryDerived: false,
      pickupDay: "2026-08-31", // Monday
      warehouseReadyBy: "2026-08-31",
    });
  });

  it("TT to JB: no stated delivery week — the day derives from Wednesday pickup + transit", () => {
    const r = latestWarehouseReadyDate({
      customerDateIso: "2026-09-04", // Friday
      region: "JB",
      calendar: TT,
    });
    expect(r).toEqual({
      kind: "chain",
      deliveryDay: "2026-09-03", // Thursday = Wednesday pickup + 1
      deliveryDerived: true,
      pickupDay: "2026-09-02", // Wednesday, TT's only pickup day
      warehouseReadyBy: "2026-09-02",
    });
  });

  it("a public holiday on the delivery day pushes the whole chain back", () => {
    const r = latestWarehouseReadyDate({
      customerDateIso: "2026-09-04",
      region: "Melaka",
      calendar: TEOW,
      holidays: new Set(["2026-09-04"]),
    });
    expect(r).toEqual({
      kind: "chain",
      deliveryDay: "2026-09-02", // Wednesday
      deliveryDerived: false,
      pickupDay: "2026-09-02",
      warehouseReadyBy: "2026-09-02",
    });
  });

  it("absence stays silent: no pickup week recorded", () => {
    expect(
      latestWarehouseReadyDate({
        customerDateIso: "2026-09-04",
        region: "JB",
        calendar: { pickupDays: null, regions: TEOW.regions, surchargeAreas: [] },
      }),
    ).toEqual({ kind: "no_calendar" });
  });

  it("absence stays silent: the carrier has no rule for this region", () => {
    expect(
      latestWarehouseReadyDate({
        customerDateIso: "2026-09-04",
        region: "Sabah",
        calendar: TEOW,
      }),
    ).toEqual({ kind: "no_calendar" });
  });

  it("a week the holidays fully close names the failure instead of guessing", () => {
    const everyTeowMelakaDay = new Set<string>();
    // Blank out every Mon/Wed/Fri within the 21-day window before 2026-09-04.
    for (let i = 0; i <= 21; i++) {
      const t = Date.UTC(2026, 8, 4) - i * 86400000;
      const d = new Date(t);
      if ([1, 3, 5].includes(d.getUTCDay()))
        everyTeowMelakaDay.add(d.toISOString().slice(0, 10));
    }
    expect(
      latestWarehouseReadyDate({
        customerDateIso: "2026-09-04",
        region: "Melaka",
        calendar: TEOW,
        holidays: everyTeowMelakaDay,
      }),
    ).toEqual({ kind: "no_day_found" });
  });
});

describe("partnerJourneyCalendar — the 0411 row normaliser", () => {
  it("reads the seeded TEOW shape", () => {
    const cal = partnerJourneyCalendar({
      pickup_days: [1, 3, 5],
      journey_regions: {
        Melaka: { deliveryDays: [1, 3, 5], transitDays: 0 },
        JB: { deliveryDays: [2, 4, 6], transitDays: 1 },
      },
      surcharge_areas: [],
    });
    expect(cal.pickupDays).toEqual([1, 3, 5]);
    expect(cal.regions.JB).toEqual({ deliveryDays: [2, 4, 6], transitDays: 1 });
  });

  it("an unconfigured row reads as not recorded, never as a default week", () => {
    const cal = partnerJourneyCalendar({});
    expect(cal.pickupDays).toBeNull();
    expect(cal.regions).toEqual({});
    expect(cal.surchargeAreas).toEqual([]);
  });

  it("garbage region entries are dropped rather than guessed at", () => {
    const cal = partnerJourneyCalendar({
      pickup_days: [3],
      journey_regions: {
        JB: { deliveryDays: null, transitDays: 1 },
        bad1: "nonsense",
        bad2: [1, 2],
      },
      surcharge_areas: ["Pontian"],
    });
    expect(Object.keys(cal.regions)).toEqual(["JB"]);
    expect(cal.surchargeAreas).toEqual(["Pontian"]);
  });

  it("an empty pickup_days array means not recorded", () => {
    expect(partnerJourneyCalendar({ pickup_days: [] }).pickupDays).toBeNull();
  });
});
