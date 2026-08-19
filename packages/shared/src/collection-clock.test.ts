import { describe, expect, it } from "vitest";
import { collectionClock, resolveCollectionAnchor } from "./collection-clock";
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
