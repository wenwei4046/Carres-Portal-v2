import { describe, it, expect } from "vitest";
import {
  compareDeliveryRows,
  deliveryDueState,
  sortDeliveryRows,
  type DeliveryBoardRow,
} from "./delivery-board";

const row = (over: Partial<DeliveryBoardRow> & { so: number }): DeliveryBoardRow => ({
  dueIso: null,
  overdue: false,
  bookingIso: null,
  promisedIso: null,
  ...over,
});

describe("compareDeliveryRows — ACTION-FLOW Law 5 on the delivery board (T11)", () => {
  it("puts a step past its own deadline above everything else", () => {
    const late = row({ so: 900, overdue: true, dueIso: "2026-09-30" });
    const soon = row({ so: 100, dueIso: "2026-07-28" });
    expect(sortDeliveryRows([soon, late]).map((r) => r.so)).toEqual([900, 100]);
  });

  it("orders the rest by the earliest deadline — the next thing to go late", () => {
    const rows = [
      row({ so: 3, dueIso: "2026-08-05" }),
      row({ so: 1, dueIso: "2026-07-28" }),
      row({ so: 2, dueIso: "2026-07-30" }),
    ];
    expect(sortDeliveryRows(rows).map((r) => r.so)).toEqual([1, 2, 3]);
  });

  it("breaks a deadline tie by the truck's day, then the promise, then the SO", () => {
    const a = row({ so: 50, dueIso: "2026-07-28", bookingIso: "2026-07-31" });
    const b = row({ so: 60, dueIso: "2026-07-28", bookingIso: "2026-07-29" });
    expect(sortDeliveryRows([a, b]).map((r) => r.so)).toEqual([60, 50]);

    const c = row({ so: 70, dueIso: "2026-07-28", promisedIso: "2026-08-10" });
    const d = row({ so: 80, dueIso: "2026-07-28", promisedIso: "2026-08-02" });
    expect(sortDeliveryRows([c, d]).map((r) => r.so)).toEqual([80, 70]);

    const e = row({ so: 1300, dueIso: "2026-07-28" });
    const f = row({ so: 1200, dueIso: "2026-07-28" });
    expect(sortDeliveryRows([e, f]).map((r) => r.so)).toEqual([1200, 1300]);
  });

  it("sorts a row with NO deadline last — a step that cannot be late is not urgent", () => {
    // T7's law in ranking form: a TBD customer date has no anchor, so the step
    // can never be overdue. It must not reach the top of a board that means
    // "most urgent" just because its date field is empty.
    const noAnchor = row({ so: 10 });
    const far = row({ so: 20, dueIso: "2026-12-31" });
    expect(sortDeliveryRows([noAnchor, far]).map((r) => r.so)).toEqual([20, 10]);
  });

  it("still ranks a no-deadline row by its truck day before falling back to the SO", () => {
    const booked = row({ so: 99, bookingIso: "2026-07-29" });
    const unbooked = row({ so: 11, promisedIso: "2026-07-29" });
    expect(sortDeliveryRows([unbooked, booked]).map((r) => r.so)).toEqual([99, 11]);
  });

  it("is a total order — sorting twice gives the same list (no render reshuffle)", () => {
    const rows = [
      row({ so: 5, dueIso: "2026-07-28" }),
      row({ so: 4, overdue: true, dueIso: "2026-07-20" }),
      row({ so: 7 }),
      row({ so: 6, dueIso: "2026-07-28", bookingIso: "2026-07-29" }),
    ];
    const once = sortDeliveryRows(rows).map((r) => r.so);
    const twice = sortDeliveryRows(sortDeliveryRows(rows)).map((r) => r.so);
    expect(twice).toEqual(once);
    expect(once).toEqual([4, 6, 5, 7]);
  });

  it("does not reorder the caller's array in place", () => {
    const rows = [row({ so: 2, dueIso: "2026-08-01" }), row({ so: 1, dueIso: "2026-07-28" })];
    sortDeliveryRows(rows);
    expect(rows.map((r) => r.so)).toEqual([2, 1]);
  });

  it("treats a timestamp anchor by its calendar date only", () => {
    const a = row({ so: 1, dueIso: "2026-07-28T23:00:00Z" });
    const b = row({ so: 2, dueIso: "2026-07-28" });
    expect(compareDeliveryRows(a, b)).toBe(-1); // the SO tail decides, not the time
  });
});

describe("deliveryDueState — what the row's deadline line says", () => {
  it("says nothing when there is no anchor to measure from", () => {
    expect(deliveryDueState(row({ so: 1 }))).toBe("none");
  });

  it("separates late from due on the same date field", () => {
    expect(deliveryDueState(row({ so: 1, dueIso: "2026-07-24", overdue: true }))).toBe("late");
    expect(deliveryDueState(row({ so: 1, dueIso: "2026-07-30" }))).toBe("due");
  });
});
