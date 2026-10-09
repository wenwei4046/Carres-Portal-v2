import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLLECTION_TIMING,
  collectionClock,
  collectionPairOf,
  collectionTimingFor,
  collectionTimingRulesOf,
  operationActionDay,
  ownerActionDay,
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
    // — the ask FACT is Sat 15; Operation acts on it Fri 14.
    expect(c.dueIso).toBe("2026-08-18");
    expect(c.askIso).toBe("2026-08-15");
    expect(c.actionAskIso).toBe("2026-08-14");
    expect(c.attention).toBe("t3");
    expect(collectionClock(F, "2026-08-18", HOLS, { askDaysBefore: 5, deadlineDaysBefore: 3 }).attention).toBe("t2");
    expect(collectionClock(F, "2026-08-19", HOLS, { askDaysBefore: 5, deadlineDaysBefore: 3 }).attention).toBe("late");
  });

  it("collectionTimingFor snapshots the rule in force on the clock's start day", () => {
    const rules = [
      { effectiveFrom: "2026-08-19", askDaysBefore: 3, deadlineDaysBefore: 2 },
      { effectiveFrom: "2026-09-15", askDaysBefore: 4, deadlineDaysBefore: 3 },
    ];
    // A rule row read before 0672 carries no outstation pair → the defaults 4 · 3.
    const outstationDefault = { outstationAskDaysBefore: 4, outstationDeadlineDaysBefore: 3 };
    expect(collectionTimingFor(rules, "2026-09-01")).toEqual({ askDaysBefore: 3, deadlineDaysBefore: 2, ...outstationDefault });
    expect(collectionTimingFor(rules, "2026-09-15")).toEqual({ askDaysBefore: 4, deadlineDaysBefore: 3, ...outstationDefault });
    expect(collectionTimingFor(rules, "2026-09-20")).toEqual({ askDaysBefore: 4, deadlineDaysBefore: 3, ...outstationDefault });
    // Before every rule, or no rules at all → the ruled default.
    expect(collectionTimingFor(rules, "2026-08-01")).toEqual(DEFAULT_COLLECTION_TIMING);
    expect(collectionTimingFor([], "2026-09-20")).toEqual(DEFAULT_COLLECTION_TIMING);
    expect(collectionTimingFor(null, null)).toEqual(DEFAULT_COLLECTION_TIMING);
  });
});

describe("two calendars, one clock (owner ruling 2026-09-13)", () => {
  // Tue 2026-09-15 delivery, no holiday: Mon 14 is T−1, SAT 12 is T−2 on the
  // company (delivery) calendar — the deadline FACT stands on Saturday.
  const T = { confirmedDateIso: "2026-09-15" };

  it("the deadline is a company-calendar fact and never moves", () => {
    const c = collectionClock(T, "2026-09-10", HOLS);
    expect(c.dueIso).toBe("2026-09-12");
    expect(c.askIso).toBe("2026-09-11");
  });

  it("Operation owner unavailable Saturday → the action moves to the previous working day", () => {
    const c = collectionClock(T, "2026-09-11", HOLS); // default owner: the Operation week
    expect(c.actionDueIso).toBe("2026-09-11");
    expect(c.attention).toBe("t2"); // Friday is the day Operation must have collected
    expect(collectionClock(T, "2026-09-12", HOLS).attention).toBe("t2"); // the deadline itself
    expect(collectionClock(T, "2026-09-14", HOLS).attention).toBe("late");
  });

  it("owner configured to work Saturday → the Saturday action remains", () => {
    const sat = collectionClock(T, "2026-09-11", HOLS, DEFAULT_COLLECTION_TIMING, { offDays: [0] });
    expect(sat.actionDueIso).toBe("2026-09-12");
    expect(sat.attention).toBe("t3"); // Friday is only the ask window for this owner
    expect(collectionClock(T, "2026-09-12", HOLS, DEFAULT_COLLECTION_TIMING, { offDays: [0] }).attention).toBe("t2");
  });

  it("Sunday / holiday → the governed calendar result for each owner", () => {
    // A Sunday fact day (company calendar test override) steps back to Sat for a
    // Saturday-working owner and to Fri for Operation.
    expect(ownerActionDay("2026-09-13", HOLS, { offDays: [0] })).toBe("2026-09-12");
    expect(ownerActionDay("2026-09-13", HOLS)).toBe("2026-09-11");
    // Merdeka (Mon 08-31) is a holiday for every owner → the previous Friday.
    expect(ownerActionDay("2026-08-31", HOLS)).toBe("2026-08-28");
    expect(ownerActionDay("2026-08-31", HOLS, { offDays: [0] })).toBe("2026-08-29"); // Sat, for a Saturday worker
    expect(operationActionDay("2026-09-10", HOLS)).toBe("2026-09-10"); // Thu stays
  });

  it("a historical clock keeps its rule snapshot whatever calendar the owner has", () => {
    const rules = [
      { effectiveFrom: "2026-08-19", askDaysBefore: 3, deadlineDaysBefore: 2 },
      { effectiveFrom: "2026-09-15", askDaysBefore: 5, deadlineDaysBefore: 4 },
    ];
    const old = collectionTimingFor(rules, "2026-09-01");
    const fresh = collectionTimingFor(rules, "2026-09-20");
    expect(collectionClock(T, "2026-09-10", HOLS, old).dueIso).toBe("2026-09-12");
    expect(collectionClock(T, "2026-09-10", HOLS, fresh).dueIso).toBe("2026-09-10");
    // The same snapshot answers the same way for an Operation owner and a Saturday worker.
    expect(collectionClock(T, "2026-09-10", HOLS, old, { offDays: [0] }).dueIso).toBe("2026-09-12");
  });
});

describe("the outstation pair (PAY-04, owner ruling 2026-09-24 · stored 0672)", () => {
  // Tue 2026-10-27, Mon–Sat delivery week, no holiday near it:
  // Mon 26 T−1 · Sat 24 T−2 · Fri 23 T−3 · Thu 22 T−4.
  const anchor = { confirmedDateIso: "2026-10-27" };

  it("an outstation delivery must be paid 3 working days before, and asking starts at 4", () => {
    const kv = collectionClock(anchor, "2026-10-20", HOLS);
    const out = collectionClock({ ...anchor, outstation: true }, "2026-10-20", HOLS);
    expect(kv.dueIso).toBe("2026-10-24");
    expect(kv.askIso).toBe("2026-10-23");
    expect(out.dueIso).toBe("2026-10-23");
    expect(out.askIso).toBe("2026-10-22");
    expect(out.timing).toEqual({ askDaysBefore: 4, deadlineDaysBefore: 3 });
    expect(out.outstation).toBe(true);
    expect(kv.outstation).toBe(false);
  });

  it("the stored outstation pair is the one counted — never the ordinary pair", () => {
    const timing = { askDaysBefore: 3, deadlineDaysBefore: 2, outstationAskDaysBefore: 6, outstationDeadlineDaysBefore: 5 };
    // T−5 = Wed 21, T−6 = Tue 20.
    const out = collectionClock({ ...anchor, outstation: true }, "2026-10-19", HOLS, timing);
    expect(out.dueIso).toBe("2026-10-21");
    expect(out.askIso).toBe("2026-10-20");
    // The ordinary order on the same rule keeps 3 · 2.
    expect(collectionClock(anchor, "2026-10-19", HOLS, timing).dueIso).toBe("2026-10-24");
  });

  it("a rule without the outstation pair falls back to 4 · 3", () => {
    expect(collectionPairOf({ askDaysBefore: 5, deadlineDaysBefore: 4 }, true)).toEqual({ askDaysBefore: 4, deadlineDaysBefore: 3 });
    expect(collectionPairOf({ askDaysBefore: 5, deadlineDaysBefore: 4 }, false)).toEqual({ askDaysBefore: 5, deadlineDaysBefore: 4 });
  });

  it("rows map once, the outstation columns defaulting when absent", () => {
    expect(collectionTimingRulesOf([
      { ask_days_before: 3, deadline_days_before: 2, effective_from: "2026-08-19" },
      { ask_days_before: 3, deadline_days_before: 2, outstation_ask_days_before: 5, outstation_deadline_days_before: 4, effective_from: "2026-10-10T00:00:00" },
    ])).toEqual([
      { askDaysBefore: 3, deadlineDaysBefore: 2, outstationAskDaysBefore: 4, outstationDeadlineDaysBefore: 3, effectiveFrom: "2026-08-19" },
      { askDaysBefore: 3, deadlineDaysBefore: 2, outstationAskDaysBefore: 5, outstationDeadlineDaysBefore: 4, effectiveFrom: "2026-10-10" },
    ]);
  });

  it("an existing outstation clock keeps the rule in force on the day it started", () => {
    const rules = collectionTimingRulesOf([
      { ask_days_before: 3, deadline_days_before: 2, effective_from: "2026-08-19" },
      { ask_days_before: 3, deadline_days_before: 2, outstation_ask_days_before: 6, outstation_deadline_days_before: 5, effective_from: "2026-10-15" },
    ]);
    const started = collectionTimingFor(rules, "2026-10-01");
    expect(collectionClock({ ...anchor, outstation: true }, "2026-10-19", HOLS, started).dueIso).toBe("2026-10-23");
    const fresh = collectionTimingFor(rules, "2026-10-16");
    expect(collectionClock({ ...anchor, outstation: true }, "2026-10-19", HOLS, fresh).dueIso).toBe("2026-10-21");
  });
});

describe("the action day steps back on the stored Office calendar", () => {
  it("an Office holiday moves the owner's action; the fact deadline stays", () => {
    // Tue 27 Oct: the fact deadline is Sat 24 (Mon–Sat delivery week). A
    // Mon–Fri owner acts Fri 23 — unless the Office records Fri 23 as a holiday.
    const anchor = { confirmedDateIso: "2026-10-27" };
    const plain = collectionClock(anchor, "2026-10-19", HOLS, DEFAULT_COLLECTION_TIMING, { offDays: [0, 6] });
    expect(plain.dueIso).toBe("2026-10-24");
    expect(plain.actionDueIso).toBe("2026-10-23");
    const officeHolidays = new Set([...myHolidaySet(), "2026-10-23"]);
    const withHoliday = collectionClock(anchor, "2026-10-19", { holidays: officeHolidays }, DEFAULT_COLLECTION_TIMING, { offDays: [0, 6] });
    // The fact counts past the holiday (Mon 26 T−1 · Sat 24 T−2) and stays.
    expect(withHoliday.dueIso).toBe("2026-10-24");
    expect(withHoliday.actionDueIso).toBe("2026-10-22");
    // A Mon–Sat Office calendar keeps the Saturday action.
    const sat = collectionClock(anchor, "2026-10-19", HOLS, DEFAULT_COLLECTION_TIMING, { offDays: [0] });
    expect(sat.actionDueIso).toBe("2026-10-24");
  });
});
