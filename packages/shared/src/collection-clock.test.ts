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

describe("collectionClock — T−3 · T−2 · T−1 · late, on working days", () => {
  // Thu 2026-08-20 delivery. Working days before it (Mon–Sat week):
  // Wed 19 (T−1, the final deadline), Tue 18 (T−2), Mon 17 (T−3).
  const D = { confirmedDateIso: "2026-08-20" };

  it("far out → none, with the due already computed", () => {
    const c = collectionClock(D, "2026-08-10", HOLS);
    expect(c.attention).toBe("none");
    expect(c.dueIso).toBe("2026-08-19");
    expect(c.overdue).toBe(false);
  });

  it("T−3 / T−2 / T−1 land on the right days", () => {
    expect(collectionClock(D, "2026-08-17", HOLS).attention).toBe("t3");
    expect(collectionClock(D, "2026-08-18", HOLS).attention).toBe("t2");
    expect(collectionClock(D, "2026-08-19", HOLS).attention).toBe("t1");
  });

  it("past the final deadline → late (the DO the logistics ask for tonight is refused)", () => {
    const c = collectionClock(D, "2026-08-20", HOLS);
    expect(c.attention).toBe("late");
    expect(c.overdue).toBe(true);
  });

  it("counts WORKING days — a Sunday between today and delivery does not count", () => {
    // Mon 2026-08-24 delivery: Sat 22 is T−1 (due), Fri 21 T−2, Thu 20 T−3
    // (Sunday 23 skipped).
    const M = { confirmedDateIso: "2026-08-24" };
    expect(collectionClock(M, "2026-08-22", HOLS).dueIso).toBe("2026-08-22");
    expect(collectionClock(M, "2026-08-22", HOLS).attention).toBe("t1");
    expect(collectionClock(M, "2026-08-21", HOLS).attention).toBe("t2");
    expect(collectionClock(M, "2026-08-20", HOLS).attention).toBe("t3");
  });

  it("skips a public holiday — Merdeka pushes the whole ladder back a day", () => {
    // Tue 2026-09-01 delivery; Mon 08-31 is Merdeka. Due (T−1) = Sat 08-29,
    // T−2 = Fri 08-28, T−3 = Thu 08-27.
    const S = { confirmedDateIso: "2026-09-01" };
    expect(collectionClock(S, "2026-08-29", HOLS).dueIso).toBe("2026-08-29");
    expect(collectionClock(S, "2026-08-29", HOLS).attention).toBe("t1");
    expect(collectionClock(S, "2026-08-28", HOLS).attention).toBe("t2");
    expect(collectionClock(S, "2026-08-27", HOLS).attention).toBe("t3");
    expect(collectionClock(S, "2026-08-31", HOLS).attention).toBe("late");
  });

  it("no anchor → no clock, never late", () => {
    const c = collectionClock({}, "2026-08-20", HOLS);
    expect(c.dueIso).toBeNull();
    expect(c.attention).toBe("none");
    expect(c.overdue).toBe(false);
  });
});
