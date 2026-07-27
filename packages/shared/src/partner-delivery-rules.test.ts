import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARTNER_DELIVERY_RULES,
  earliestPartnerDate,
  partnerBookingWarnings,
  partnerDeliveryRules,
  partnerRunsOn,
  type PartnerDeliveryRules,
} from "./partner-delivery-rules";

// 2026-08 reference week: 3 Aug = Monday … 8 Aug = Saturday, 9 Aug = Sunday.
const MON = "2026-08-03";
const WED = "2026-08-05";
const SAT = "2026-08-08";
const SUN = "2026-08-09";

const rules = (over: Partial<PartnerDeliveryRules> = {}): PartnerDeliveryRules => ({
  ...DEFAULT_PARTNER_DELIVERY_RULES,
  ...over,
});

describe("partnerDeliveryRules — an unconfigured partner", () => {
  it("reads as the house week with nothing else claimed", () => {
    expect(partnerDeliveryRules(null)).toEqual({
      offDays: [0],
      blackoutDates: [],
      dailyCapacity: null,
      bookingLeadDays: 0,
    });
  });

  it("fills only the missing halves of a partial profile", () => {
    expect(partnerDeliveryRules({ dailyCapacity: 8 })).toEqual({
      offDays: [0],
      blackoutDates: [],
      dailyCapacity: 8,
      bookingLeadDays: 0,
    });
  });
});

describe("partnerBookingWarnings — silence when we don't know", () => {
  it("says nothing at all when the partner has no rules recorded", () => {
    expect(
      partnerBookingWarnings({
        partnerName: "NETS",
        rules: null,
        dateIso: SUN,
        todayIso: MON,
        bookedOnDate: 99,
      }),
    ).toEqual([]);
  });

  it("stays silent on capacity when the day's load was not counted", () => {
    const w = partnerBookingWarnings({
      partnerName: "NETS",
      rules: rules({ dailyCapacity: 1 }),
      dateIso: WED,
      todayIso: MON,
      // bookedOnDate omitted — unknown, not zero and not full
    });
    expect(w).toEqual([]);
  });

  it("a fully configured partner on a good day warns about nothing", () => {
    const w = partnerBookingWarnings({
      partnerName: "NETS",
      rules: rules({ dailyCapacity: 8, bookingLeadDays: 2, blackoutDates: [SAT] }),
      dateIso: "2026-08-07",
      todayIso: MON,
      bookedOnDate: 3,
    });
    expect(w).toEqual([]);
  });
});

describe("partnerBookingWarnings — the four rules", () => {
  it("names the weekday the partner does not run", () => {
    const w = partnerBookingWarnings({
      partnerName: "AL",
      rules: rules({ offDays: [0, 6] }),
      dateIso: SAT,
      todayIso: MON,
    });
    expect(w.map((x) => x.key)).toEqual(["off_day"]);
    expect(w[0]!.message).toContain("AL does not deliver on Saturday");
  });

  it("says nothing about Sunday — the system refuses Sundays outright", () => {
    // A partner-level "call them" would read as though a phone call could buy
    // a Sunday; the booking gate refuses it for everyone.
    const w = partnerBookingWarnings({
      partnerName: "NETS",
      rules: rules(),
      dateIso: SUN,
      todayIso: MON,
    });
    expect(w.map((x) => x.key)).not.toContain("off_day");
  });

  it("names a blackout date in the house date format", () => {
    const w = partnerBookingWarnings({
      partnerName: "NETS",
      rules: rules({ blackoutDates: ["2026-08-05"] }),
      dateIso: WED,
      todayIso: MON,
    });
    expect(w.map((x) => x.key)).toEqual(["blackout"]);
    expect(w[0]!.message).toContain("NETS is not running on 5 Aug 26");
  });

  it("warns when the date is inside the partner's notice period, and names the earliest", () => {
    const w = partnerBookingWarnings({
      partnerName: "NETS",
      rules: rules({ bookingLeadDays: 2 }),
      dateIso: "2026-08-04", // Tuesday — only 1 working day away
      todayIso: MON,
    });
    expect(w.map((x) => x.key)).toEqual(["lead_time"]);
    expect(w[0]!.message).toContain("needs 2 working days notice");
    expect(w[0]!.message).toContain("5 Aug 26");
  });

  it("counts the partner's OWN working week for the notice period", () => {
    // Saturday-off partner, 2 days' notice, asked on Friday 7 Aug:
    // its working days are Mon 10 and Tue 11 — not Sat 8 / Mon 10.
    const w = partnerBookingWarnings({
      partnerName: "AL",
      rules: rules({ offDays: [0, 6], bookingLeadDays: 2 }),
      dateIso: "2026-08-10",
      todayIso: "2026-08-07",
    });
    expect(w[0]!.message).toContain("11 Aug 26");
  });

  it("skips public holidays when counting the notice period", () => {
    const w = partnerBookingWarnings({
      partnerName: "NETS",
      rules: rules({ bookingLeadDays: 2 }),
      dateIso: "2026-08-04",
      todayIso: MON,
      holidays: ["2026-08-04"],
    });
    // Tue is a holiday, so 2 working days from Mon = Wed 5 → Thu 6.
    expect(w[0]!.message).toContain("6 Aug 26");
  });

  it("warns when the day is already at the partner's limit", () => {
    const w = partnerBookingWarnings({
      partnerName: "NETS",
      rules: rules({ dailyCapacity: 8 }),
      dateIso: WED,
      todayIso: MON,
      bookedOnDate: 8,
    });
    expect(w.map((x) => x.key)).toEqual(["capacity"]);
    expect(w[0]!.message).toContain("already has 8 deliveries");
    expect(w[0]!.message).toContain("its limit is 8 a day");
  });

  it("does not warn one drop below the limit", () => {
    expect(
      partnerBookingWarnings({
        partnerName: "NETS",
        rules: rules({ dailyCapacity: 8 }),
        dateIso: WED,
        todayIso: MON,
        bookedOnDate: 7,
      }),
    ).toEqual([]);
  });

  it("flags a date in the past even for a zero-notice partner", () => {
    const w = partnerBookingWarnings({
      partnerName: "TT",
      rules: rules(),
      dateIso: "2026-08-01",
      todayIso: MON,
    });
    expect(w.map((x) => x.key)).toEqual(["lead_time"]);
    expect(w[0]!.message).toContain("cannot take a date in the past");
  });

  it("stacks every reason that applies, day-first", () => {
    const w = partnerBookingWarnings({
      partnerName: "NETS",
      rules: rules({
        offDays: [0, 6],
        blackoutDates: [SAT],
        dailyCapacity: 2,
        bookingLeadDays: 3,
      }),
      dateIso: SAT,
      todayIso: "2026-08-07",
      bookedOnDate: 5,
    });
    expect(w.map((x) => x.key)).toEqual([
      "off_day",
      "blackout",
      "lead_time",
      "capacity",
    ]);
  });

  it("every message names the partner — an operator must know who to call", () => {
    const w = partnerBookingWarnings({
      partnerName: "HOUZS",
      rules: rules({
        offDays: [0, 6],
        blackoutDates: [SAT],
        dailyCapacity: 1,
        bookingLeadDays: 5,
      }),
      dateIso: SAT,
      todayIso: "2026-08-07",
      bookedOnDate: 4,
    });
    expect(w).toHaveLength(4);
    for (const one of w) expect(one.message).toContain("HOUZS");
  });
});

describe("partnerRunsOn / earliestPartnerDate", () => {
  it("a blackout closes the day even on a working weekday", () => {
    expect(partnerRunsOn(rules({ blackoutDates: [WED] }), WED)).toBe(false);
    expect(partnerRunsOn(rules({ blackoutDates: [WED] }), MON)).toBe(true);
  });

  it("zero notice means today — when the partner runs today", () => {
    expect(earliestPartnerDate(rules(), MON)).toBe(MON);
  });

  it("zero notice on a closed day rolls to the next day it runs", () => {
    expect(earliestPartnerDate(rules(), SUN)).toBe("2026-08-10");
  });

  it("never names a blacked-out day as the earliest", () => {
    const r = rules({ blackoutDates: ["2026-08-05", "2026-08-06"], bookingLeadDays: 2 });
    // 2 working days from Mon = Wed 5, blacked out, and Thu 6 too → Fri 7.
    expect(earliestPartnerDate(r, MON)).toBe("2026-08-07");
  });
});
