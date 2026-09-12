import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLLECTION_TIMING,
  collectionClock,
  collectionTimingFor,
  operationActionDay,
  resolveCollectionAnchor,
} from "./collection-clock";
import { myHolidaySet } from "./my-holidays";

// Delivery week: Mon–Sat (the working-days default), Malaysian holidays injected.
const HOLS = { holidays: myHolidaySet() };

describe("resolveCollectionAnchor — confirmed wins, promised backs it up", () => {
  it("confirmed date first", () => {
    expect(
      resolveCollectionAnchor({
        confirmedDateIso: "2026-08-20",
        promisedDateIso: "2026-08-15",
      }),
    ).toBe("2026-08-20");
  });
  it("promised when nothing is confirmed", () => {
    expect(resolveCollectionAnchor({ promisedDateIso: "2026-08-15" })).toBe("2026-08-15");
  });
  it("null when neither exists (TBD stays silent)", () => {
    expect(resolveCollectionAnchor({})).toBeNull();
  });
});

describe("collectionClock — T−3 attention · T−2 DEADLINE · then late (owner ruling 2026-08-19)", () => {
  // ⭐ THE CARD'S OWN CASE: an order anchored on FRIDAY has its deadline on
  // WEDNESDAY (Mon–Sat week), attention TUESDAY. Fri 2026-08-21 delivery:
  // Thu 20 is T−1 (logistics takes the DO — already LATE for money),
  // Wed 19 is T−2 (the deadline), Tue 18 is T−3.
  const F = { confirmedDateIso: "2026-08-21" };

  it("a Friday anchor's deadline is Wednesday, attention Tuesday", () => {
    const wed = collectionClock(F, "2026-08-19", HOLS);
    expect(wed.dueIso).toBe("2026-08-19");
    expect(wed.attention).toBe("t2");
    expect(collectionClock(F, "2026-08-18", HOLS).attention).toBe("t3");
  });

  it("T−1 is already LATE — logistics takes the DO that day, so the money had to land before it", () => {
    const thu = collectionClock(F, "2026-08-20", HOLS);
    expect(thu.attention).toBe("late");
    expect(thu.overdue).toBe(true);
  });

  it("far out → none, with the due already computed", () => {
    const c = collectionClock(F, "2026-08-10", HOLS);
    expect(c.attention).toBe("none");
    expect(c.dueIso).toBe("2026-08-19");
    expect(c.overdue).toBe(false);
  });

  it("the delivery day itself is late while owing", () => {
    const c = collectionClock(F, "2026-08-21", HOLS);
    expect(c.attention).toBe("late");
    expect(c.overdue).toBe(true);
  });

  it("counts WORKING days — a Sunday between today and delivery does not count", () => {
    // Mon 2026-08-24 delivery (Sunday 23 skipped): Sat 22 is T−1 (late for
    // money), Fri 21 is T−2 (the deadline), Thu 20 is T−3.
    const M = { confirmedDateIso: "2026-08-24" };
    expect(collectionClock(M, "2026-08-21", HOLS).dueIso).toBe("2026-08-21");
    expect(collectionClock(M, "2026-08-21", HOLS).attention).toBe("t2");
    expect(collectionClock(M, "2026-08-20", HOLS).attention).toBe("t3");
    expect(collectionClock(M, "2026-08-22", HOLS).attention).toBe("late");
  });

  it("skips a public holiday — Merdeka pushes the whole ladder back a day", () => {
    // Tue 2026-09-01 delivery; Mon 08-31 is Merdeka (skipped). T−1 = Sat
    // 08-29, so the DEADLINE (T−2) = Fri 08-28 and T−3 = Thu 08-27.
    const S = { confirmedDateIso: "2026-09-01" };
    expect(collectionClock(S, "2026-08-28", HOLS).dueIso).toBe("2026-08-28");
    expect(collectionClock(S, "2026-08-28", HOLS).attention).toBe("t2");
    expect(collectionClock(S, "2026-08-27", HOLS).attention).toBe("t3");
    expect(collectionClock(S, "2026-08-29", HOLS).attention).toBe("late");
    expect(collectionClock(S, "2026-08-31", HOLS).attention).toBe("late");
  });

  it("no anchor → no clock, never late", () => {
    const c = collectionClock({}, "2026-08-20", HOLS);
    expect(c.dueIso).toBeNull();
    expect(c.attention).toBe("none");
    expect(c.overdue).toBe(false);
  });
});

describe("collection timing is a SETTING (owner ruling 2026-09-12)", () => {
  const F = { confirmedDateIso: "2026-08-21" }; // Friday

  it("defaults to the ruled pair — 3 · 2 — and says so on the clock", () => {
    const c = collectionClock(F, "2026-08-10", HOLS);
    expect(c.timing).toEqual({ askDaysBefore: 3, deadlineDaysBefore: 2 });
    expect(c.askIso).toBe("2026-08-18");
    expect(c.dueIso).toBe("2026-08-19");
  });

  it("a wider pair moves both days earlier and the attention windows follow the dates", () => {
    const c = collectionClock(F, "2026-08-14", HOLS, { askDaysBefore: 5, deadlineDaysBefore: 3 });
    // Mon–Sat week: Thu 20 T−1 · Wed 19 T−2 · Tue 18 T−3 · Mon 17 T−4 · Sat 15 T−5
    // — and Sat 15 is not an Operation day, so asking starts Fri 14.
    expect(c.dueIso).toBe("2026-08-18");
    expect(c.askIso).toBe("2026-08-14");
    expect(c.attention).toBe("t3");
    expect(collectionClock(F, "2026-08-18", HOLS, { askDaysBefore: 5, deadlineDaysBefore: 3 }).attention).toBe("t2");
    expect(collectionClock(F, "2026-08-19", HOLS, { askDaysBefore: 5, deadlineDaysBefore: 3 }).attention).toBe("late");
  });

  it("collectionTimingFor snapshots the rule in force on the clock's start day", () => {
    const rules = [
      { effectiveFrom: "2026-08-19", askDaysBefore: 3, deadlineDaysBefore: 2 },
      { effectiveFrom: "2026-09-15", askDaysBefore: 4, deadlineDaysBefore: 3 },
    ];
    expect(collectionTimingFor(rules, "2026-09-01")).toEqual({ askDaysBefore: 3, deadlineDaysBefore: 2 });
    expect(collectionTimingFor(rules, "2026-09-15")).toEqual({ askDaysBefore: 4, deadlineDaysBefore: 3 });
    expect(collectionTimingFor(rules, "2026-09-20")).toEqual({ askDaysBefore: 4, deadlineDaysBefore: 3 });
    // Before every rule, or no rules at all → the ruled default.
    expect(collectionTimingFor(rules, "2026-08-01")).toEqual(DEFAULT_COLLECTION_TIMING);
    expect(collectionTimingFor([], "2026-09-20")).toEqual(DEFAULT_COLLECTION_TIMING);
    expect(collectionTimingFor(null, null)).toEqual(DEFAULT_COLLECTION_TIMING);
  });
});

describe("Operation has no Saturday work (owner ruling 2026-09-12)", () => {
  it("a deadline that lands on Saturday moves to Friday; Saturday itself is already late", () => {
    // Tue 2026-09-15 delivery, no holiday: Mon 14 is T−1, SAT 12 is T−2 on
    // the delivery week — the office is shut, so the action is Friday 11.
    const T = { confirmedDateIso: "2026-09-15" };
    const fri = collectionClock(T, "2026-09-11", HOLS);
    expect(fri.dueIso).toBe("2026-09-11");
    expect(fri.attention).toBe("t2");
    expect(collectionClock(T, "2026-09-12", HOLS).attention).toBe("late");
    expect(collectionClock(T, "2026-09-14", HOLS).attention).toBe("late");
  });

  it("the ask day never lands after the deadline once both are shifted", () => {
    const T = { confirmedDateIso: "2026-09-15" };
    const c = collectionClock(T, "2026-09-10", HOLS);
    // T−3 is Fri 11 on the delivery week — the same day as the shifted deadline.
    expect(c.askIso).toBe("2026-09-11");
    expect(c.askIso! <= c.dueIso!).toBe(true);
    expect(c.attention).toBe("none");
  });

  it("the date FACT stays — the anchor is untouched by the shift", () => {
    const c = collectionClock({ confirmedDateIso: "2026-09-12" }, "2026-09-09", HOLS); // Saturday delivery
    expect(c.anchorIso).toBe("2026-09-12");
    // Fri 11 is T−1, Thu 10 is T−2, Wed 9 is T−3 — no shift needed.
    expect(c.dueIso).toBe("2026-09-10");
    expect(c.askIso).toBe("2026-09-09");
  });

  it("operationActionDay steps a Sunday or a holiday back to the previous office day", () => {
    expect(operationActionDay("2026-09-13", HOLS)).toBe("2026-09-11"); // Sun → Fri
    expect(operationActionDay("2026-08-31", HOLS)).toBe("2026-08-28"); // Merdeka (Mon) → Fri
    expect(operationActionDay("2026-09-10", HOLS)).toBe("2026-09-10"); // Thu stays
  });
});
