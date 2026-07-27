import { describe, it, expect } from "vitest";
import {
  bookingDayOf,
  carrierDayLoads,
  carrierDayNote,
  daysInRange,
  dayWord,
  deliveryRange,
  inRange,
  shiftDays,
  type DayBooking,
} from "./delivery-calendar";
import { partnerDeliveryRules } from "./partner-delivery-rules";

// 2026-07-27 Mon · 07-28 Tue · 08-01 Sat · 08-02 Sun.
const MON = "2026-07-27";
const SAT = "2026-08-01";
const SUN = "2026-08-02";

describe("bookingDayOf — the ONE booking read (T10)", () => {
  it("reads the customer's confirmed date + slot", () => {
    expect(
      bookingDayOf({
        stage: "confirmed",
        confirmedDate: "2026-08-05",
        confirmedSlot: "Afternoon (12pm–3pm)",
        provisionalDate: "2026-08-03",
      }),
    ).toEqual({
      kind: "confirmed",
      date: "2026-08-05",
      slot: "Afternoon (12pm–3pm)",
    });
  });

  it("never trusts the stage word without its date (D1 invariant #1)", () => {
    // stage says confirmed, no confirmed_date → falls back to the carrier's word.
    expect(
      bookingDayOf({ stage: "confirmed", confirmedDate: null, provisionalDate: "2026-08-03" }),
    ).toEqual({ kind: "provisional", date: "2026-08-03", slot: null });
  });

  it("a provisional day never carries a slot — only the customer books a slot", () => {
    expect(
      bookingDayOf({ stage: "provisional", confirmedSlot: "Morning", provisionalDate: "2026-08-03" }).slot,
    ).toBeNull();
  });

  it("nothing booked = no day at all (it is a queue item, not a truck)", () => {
    expect(bookingDayOf({ stage: "none" })).toEqual({ kind: "none", date: null, slot: null });
    expect(bookingDayOf(null)).toEqual({ kind: "none", date: null, slot: null });
    expect(bookingDayOf(undefined).kind).toBe("none");
  });

  it("the promised date is NOT a booking — a delivery_date alone puts nothing on a day", () => {
    // The whole point of T10: the calendar reads the booking, never the promise.
    expect(bookingDayOf({ stage: "none", confirmedDate: null, provisionalDate: null }).date).toBeNull();
  });

  it("accepts a timestamp and keeps only the calendar day", () => {
    expect(bookingDayOf({ provisionalDate: "2026-08-03T09:30:00Z" }).date).toBe("2026-08-03");
  });

  it("ignores a malformed date instead of putting a truck on a nonsense day", () => {
    expect(bookingDayOf({ stage: "confirmed", confirmedDate: "soon" }).kind).toBe("none");
  });
});

describe("deliveryRange — Today / Tomorrow / This week", () => {
  it("today is one day", () => {
    expect(deliveryRange("today", MON)).toMatchObject({
      label: "Today",
      fromIso: MON,
      toIso: MON,
    });
  });

  it("tomorrow is one day, and crosses a month end", () => {
    expect(deliveryRange("tomorrow", MON)).toMatchObject({ fromIso: "2026-07-28", toIso: "2026-07-28" });
    expect(deliveryRange("tomorrow", "2026-07-31").fromIso).toBe("2026-08-01");
  });

  it("this week = the REST of the week, ending Saturday (Sunday is not a delivery day)", () => {
    expect(deliveryRange("week", MON)).toMatchObject({ fromIso: MON, toIso: SAT });
    // Mid-week: still today → Saturday.
    expect(deliveryRange("week", "2026-07-30")).toMatchObject({ fromIso: "2026-07-30", toIso: SAT });
  });

  it("on Saturday, this week is just today — the week has no rest left", () => {
    expect(deliveryRange("week", SAT)).toMatchObject({ fromIso: SAT, toIso: SAT });
  });

  it("on Sunday, this week is the Mon–Sat that starts tomorrow", () => {
    expect(deliveryRange("week", SUN)).toMatchObject({ fromIso: "2026-08-03", toIso: "2026-08-08" });
  });

  it("a range never runs backwards", () => {
    for (const today of [MON, SAT, SUN, "2026-12-31"]) {
      for (const key of ["today", "tomorrow", "week"] as const) {
        const r = deliveryRange(key, today);
        expect(r.fromIso <= r.toIso).toBe(true);
      }
    }
  });
});

describe("daysInRange / inRange / shiftDays / dayWord", () => {
  it("lists both ends inclusive", () => {
    expect(daysInRange(MON, "2026-07-29")).toEqual(["2026-07-27", "2026-07-28", "2026-07-29"]);
    expect(daysInRange(MON, MON)).toEqual([MON]);
  });

  it("returns nothing for an inverted range instead of spinning", () => {
    expect(daysInRange("2026-07-29", MON)).toEqual([]);
  });

  it("a week range lists six days (Mon–Sat)", () => {
    const r = deliveryRange("week", MON);
    expect(daysInRange(r.fromIso, r.toIso)).toHaveLength(6);
  });

  it("inRange includes both ends", () => {
    const r = deliveryRange("week", MON);
    expect(inRange(MON, r)).toBe(true);
    expect(inRange(SAT, r)).toBe(true);
    expect(inRange(SUN, r)).toBe(false);
    expect(inRange("2026-07-26", r)).toBe(false);
  });

  it("shiftDays crosses months and years", () => {
    expect(shiftDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("only today and tomorrow get a word — every other day prints its date", () => {
    expect(dayWord(MON, MON)).toBe("Today");
    expect(dayWord("2026-07-28", MON)).toBe("Tomorrow");
    expect(dayWord("2026-07-29", MON)).toBeNull();
  });
});

const NETS = "p-nets";
const TEOW = "p-teow";

function booking(over: Partial<DayBooking> = {}): DayBooking {
  return {
    partnerId: NETS,
    partnerName: "NETS",
    kind: "confirmed",
    date: MON,
    ...over,
  };
}

describe("carrierDayLoads — who is carrying what on the day", () => {
  it("counts confirmed and provisional separately, per carrier", () => {
    const loads = carrierDayLoads(
      [
        booking(),
        booking(),
        booking({ kind: "provisional" }),
        booking({ partnerId: TEOW, partnerName: "TEOW" }),
      ],
      MON,
    );
    expect(loads).toHaveLength(2);
    expect(loads[0]).toMatchObject({ partnerName: "NETS", confirmed: 2, provisional: 1 });
    expect(loads[1]).toMatchObject({ partnerName: "TEOW", confirmed: 1, provisional: 0 });
  });

  it("only counts the day asked for", () => {
    expect(carrierDayLoads([booking({ date: "2026-07-28" })], MON)).toEqual([]);
  });

  it("a cancelled order occupies no truck (same exclusion as the confirm-flow count)", () => {
    expect(carrierDayLoads([booking({ cancelled: true })], MON)).toEqual([]);
  });

  it("an unbooked order is never on a day", () => {
    expect(carrierDayLoads([booking({ kind: "none", date: null })], MON)).toEqual([]);
  });

  it("names the no-carrier group instead of hiding it — the day is not emptier than it is", () => {
    const loads = carrierDayLoads([booking({ partnerId: null, partnerName: null })], MON);
    expect(loads[0]).toMatchObject({ partnerId: null, partnerName: "No carrier picked", confirmed: 1 });
  });

  it("busiest carrier first", () => {
    const loads = carrierDayLoads(
      [booking({ partnerId: TEOW, partnerName: "TEOW" }), booking(), booking()],
      MON,
    );
    expect(loads.map((l) => l.partnerName)).toEqual(["NETS", "TEOW"]);
  });

  it("a carrier with no rules recorded stays silent: no limit, never at limit, runs", () => {
    const [load] = carrierDayLoads([booking()], MON);
    expect(load).toMatchObject({ capacity: null, atLimit: false, runs: true });
    expect(carrierDayNote(load!)).toBeNull();
  });

  it("only CONFIRMED bookings count toward the limit — a provisional date is not a promise", () => {
    const rules = new Map([[NETS, partnerDeliveryRules({ dailyCapacity: 2 })]]);
    const [load] = carrierDayLoads(
      [booking(), booking({ kind: "provisional" }), booking({ kind: "provisional" })],
      MON,
      rules,
    );
    expect(load).toMatchObject({ confirmed: 1, provisional: 2, capacity: 2, atLimit: false });
    expect(carrierDayNote(load!)).toBeNull();
  });

  it("says the carrier is at its limit, and what to do about it", () => {
    const rules = new Map([[NETS, partnerDeliveryRules({ dailyCapacity: 2 })]]);
    const [load] = carrierDayLoads([booking(), booking()], MON, rules);
    expect(load!.atLimit).toBe(true);
    expect(carrierDayNote(load!)).toBe(
      "NETS is at its limit of 2 deliveries a day — call them before promising more",
    );
  });

  it("says when the carrier does not run that day (its own off day)", () => {
    // Saturday off for this carrier.
    const rules = new Map([[NETS, partnerDeliveryRules({ offDays: [0, 6] })]]);
    const [load] = carrierDayLoads([booking({ date: SAT })], SAT, rules);
    expect(load!.runs).toBe(false);
    expect(carrierDayNote(load!)).toBe(
      "NETS is not running on this day — call them or move these",
    );
  });

  it("never blames a carrier for Sunday — that rule belongs to everyone (T9 law)", () => {
    // Every live carrier carries the default offDays [0]; a per-partner Sunday
    // sentence would read as though a phone call could buy a Sunday.
    const rules = new Map([[NETS, partnerDeliveryRules({})]]);
    const [load] = carrierDayLoads([booking({ date: SUN })], SUN, rules);
    expect(load!.runs).toBe(false);
    expect(carrierDayNote(load!)).toBeNull();
  });

  it("but a Sunday BLACKOUT is still silent — Sunday is nobody's per-partner rule", () => {
    const rules = new Map([[NETS, partnerDeliveryRules({ blackoutDates: [SUN] })]]);
    const [load] = carrierDayLoads([booking({ date: SUN })], SUN, rules);
    expect(carrierDayNote(load!)).toBeNull();
  });

  it("a blackout date reads the same way", () => {
    const rules = new Map([[NETS, partnerDeliveryRules({ blackoutDates: [MON] })]]);
    const [load] = carrierDayLoads([booking()], MON, rules);
    expect(carrierDayNote(load!)).toMatch(/not running on this day/);
  });

  it("never blames the operator for a carrier we never asked (no rules ⇒ no note)", () => {
    const [load] = carrierDayLoads([booking({ partnerId: null, partnerName: null })], MON);
    expect(carrierDayNote(load!)).toBeNull();
  });

  it("every note names the carrier and ends in something doable (COPY-STANDARD rule 9)", () => {
    const rules = new Map([
      [NETS, partnerDeliveryRules({ dailyCapacity: 1, offDays: [0, 1] })],
    ]);
    const notes = carrierDayLoads([booking()], MON, rules)
      .map(carrierDayNote)
      .filter((n): n is string => !!n);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n).toContain("NETS");
      expect(n).toMatch(/call them|pick another day|move these/i);
      // Banned words never reach an operator's screen.
      expect(n).not.toMatch(/POD|capacity exceeded|blackout|SLA/i);
    }
  });
});
