import { describe, it, expect } from "vitest";
import {
  DELIVERY_QUEUES,
  DELIVERY_QUEUE_LABELS,
  deliveryQueueByKey,
  deliveryStepDueIso,
  deliveryStepOverdue,
} from "./delivery-queue";
import { myHolidaySet } from "./my-holidays";

// 2026-07-27 is a Monday; 2026-08-01 a Saturday; 2026-08-02 a Sunday.
const HOLS = { holidays: myHolidaySet() };

describe("DELIVERY_QUEUES — the four delivery steps (T7)", () => {
  it("is the lifecycle in order, one label per step", () => {
    expect(DELIVERY_QUEUES.map((q) => q.key)).toEqual([
      "assign",
      "chase",
      "deliver_today",
      "photo",
    ]);
    expect(DELIVERY_QUEUE_LABELS).toEqual([
      "Assign logistic",
      "Chase logistic",
      "Deliver today",
      "Upload delivery photo",
    ]);
  });

  it("never says POD / Unscheduled / Not booked (banned words, COPY-STANDARD)", () => {
    const text = JSON.stringify(DELIVERY_QUEUES);
    expect(text).not.toMatch(/POD|Proof of Delivery/i);
    expect(text).not.toMatch(/Unscheduled|Not booked/i);
  });

  it("labels are unique — a queue is one word for one step (C-vocab)", () => {
    expect(new Set(DELIVERY_QUEUE_LABELS).size).toBe(DELIVERY_QUEUE_LABELS.length);
  });

  it("throws on an unknown step rather than silently answering for the wrong one", () => {
    // @ts-expect-error — deliberately off-contract
    expect(() => deliveryQueueByKey("nope")).toThrow(/unknown step/);
  });
});

describe("deliveryStepDueIso — each step's own deadline", () => {
  it("assign = 3 working days before the customer's date (Sunday skipped)", () => {
    // Thu 2026-08-06 − 3 working days → Mon 2026-08-03 (Sun 08-02 skipped).
    expect(deliveryStepDueIso("assign", "2026-08-06", HOLS)).toBe("2026-08-03");
  });

  it("chase = 1 working day before the customer's date", () => {
    // Mon 2026-08-03 − 1 working day → Sat 2026-08-01 (Saturday IS a working day).
    expect(deliveryStepDueIso("chase", "2026-08-03", HOLS)).toBe("2026-08-01");
  });

  it("deliver today = the confirmed date itself, no offset", () => {
    expect(deliveryStepDueIso("deliver_today", "2026-08-06", HOLS)).toBe("2026-08-06");
  });

  it("photo = the next working day after delivery", () => {
    // Delivered Sat 2026-08-01 → due Mon 2026-08-03 (Sunday is not a working day).
    expect(deliveryStepDueIso("photo", "2026-08-01", HOLS)).toBe("2026-08-03");
  });

  it("reads the date part of a timestamp (delivered_at is a timestamp)", () => {
    expect(deliveryStepDueIso("photo", "2026-08-01T16:40:00.000Z", HOLS)).toBe("2026-08-03");
  });

  it("skips a public holiday, not just the Sunday", () => {
    // 2026-08-31 Merdeka (Monday). Tue 2026-09-01 − 1 working day → Sat 2026-08-29.
    expect(deliveryStepDueIso("chase", "2026-09-01", HOLS)).toBe("2026-08-29");
  });

  it("no anchor → no deadline (a TBD date can never be late)", () => {
    expect(deliveryStepDueIso("assign", null, HOLS)).toBeNull();
    expect(deliveryStepDueIso("assign", undefined, HOLS)).toBeNull();
    expect(deliveryStepDueIso("assign", "", HOLS)).toBeNull();
    expect(deliveryStepDueIso("photo", "not-a-date", HOLS)).toBeNull();
  });
});

describe("deliveryStepOverdue — the queue turns late by itself", () => {
  it("a step due today is NOT late today (the day is still available)", () => {
    // assign due 2026-08-03 for a 2026-08-06 delivery.
    expect(deliveryStepOverdue("assign", "2026-08-06", "2026-08-03", HOLS)).toBe(false);
  });

  it("one day past the due date → late", () => {
    expect(deliveryStepOverdue("assign", "2026-08-06", "2026-08-04", HOLS)).toBe(true);
  });

  it("well before the due date → not late", () => {
    expect(deliveryStepOverdue("assign", "2026-08-06", "2026-07-27", HOLS)).toBe(false);
  });

  it("deliver today: the confirmed day itself is not late, the day after is", () => {
    expect(deliveryStepOverdue("deliver_today", "2026-08-06", "2026-08-06", HOLS)).toBe(false);
    expect(deliveryStepOverdue("deliver_today", "2026-08-06", "2026-08-07", HOLS)).toBe(true);
  });

  it("photo: same-day and next-working-day are fine, the day after is late", () => {
    expect(deliveryStepOverdue("photo", "2026-08-01", "2026-08-01", HOLS)).toBe(false);
    expect(deliveryStepOverdue("photo", "2026-08-01", "2026-08-03", HOLS)).toBe(false);
    expect(deliveryStepOverdue("photo", "2026-08-01", "2026-08-04", HOLS)).toBe(true);
  });

  it("no anchor → never late (silence, not a false alarm)", () => {
    expect(deliveryStepOverdue("assign", null, "2026-12-31", HOLS)).toBe(false);
  });

  it("holidays are injected, not baked in — an empty calendar gives a different answer", () => {
    // With Merdeka injected, chase for Tue 09-01 is due Sat 08-29; without any
    // holidays it is due Mon 08-31.
    expect(deliveryStepDueIso("chase", "2026-09-01")).toBe("2026-08-31");
    expect(deliveryStepDueIso("chase", "2026-09-01", HOLS)).toBe("2026-08-29");
  });
});
