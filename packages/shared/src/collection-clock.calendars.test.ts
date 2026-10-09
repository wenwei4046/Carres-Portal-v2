/**
 * TWO CALENDARS, ONE CLOCK — split 9 Oct 2026.
 *
 *   FACTS  (`dueIso` · `askIso`)  the Delivery calendar: Mon–Sat + the
 *                                 Delivery (Selangor) holidays. No owner
 *                                 calendar reaches them.
 *   ACTION (`actionDueIso` · `actionAskIso`)  the responsible person's own
 *                                 working days (Office weekdays when none
 *                                 are recorded) + the Office holidays.
 */
import { describe, expect, it } from "vitest";
import { collectionClock, collectionFactDays } from "./collection-clock";
import { DEFAULT_DELIVERY_CALENDAR, deliveryWorkingDayOptions } from "./delivery-working-calendar";
import { officeCalendarOf, officeOwnerCalendar, personOwnerCalendar } from "./office-calendar";

const delivery = deliveryWorkingDayOptions(DEFAULT_DELIVERY_CALENDAR);
const OFFICE = officeCalendarOf(null, null); // Mon–Fri, built-in holidays

/** The Office with its 2027 Kuala Lumpur holidays recorded: Federal
 *  Territory Day (Mon 1 Feb 2027) is an Office holiday and not a Selangor one. */
const OFFICE_KL_2027 = officeCalendarOf(null, [
  { holiday_date: "2027-01-01", name: "New Year's Day" },
  { holiday_date: "2027-02-01", name: "Federal Territory Day" },
  { holiday_date: "2027-02-06", name: "Chinese New Year" },
]);

describe("the responsible person's working days decide only WHEN staff act", () => {
  // Tue 13 Oct 2026, deadline 2 Delivery working days before: Mon 12 · Sat 10.
  const order = { confirmedDateIso: "2026-10-13" };

  it("an owner who works Saturday keeps the Saturday action", () => {
    const owner = personOwnerCalendar(OFFICE, [1, 2, 3, 4, 5, 6]);
    const clock = collectionClock(order, "2026-10-01", delivery, undefined, owner);
    expect(clock.dueIso).toBe("2026-10-10");
    expect(clock.actionDueIso).toBe("2026-10-10");
  });

  it("an owner who does not work Saturday acts on Friday", () => {
    const owner = personOwnerCalendar(OFFICE, [1, 2, 3, 4, 5]);
    const clock = collectionClock(order, "2026-10-01", delivery, undefined, owner);
    expect(clock.dueIso).toBe("2026-10-10");
    expect(clock.actionDueIso).toBe("2026-10-09");
  });

  it("an owner with no recorded week follows the Office working weekdays", () => {
    const none = personOwnerCalendar(OFFICE, null);
    expect(none.offDays).toEqual(officeOwnerCalendar(OFFICE).offDays);
    expect(collectionClock(order, "2026-10-01", delivery, undefined, none).actionDueIso).toBe("2026-10-09");
    // An Office that works Saturday carries that to everyone without a record.
    const saturdayOffice = officeCalendarOf({ work_days: [1, 2, 3, 4, 5, 6] }, null);
    expect(collectionClock(order, "2026-10-01", delivery, undefined, personOwnerCalendar(saturdayOffice, null)).actionDueIso).toBe("2026-10-10");
  });

  it("⭐ no owner calendar ever moves the payment FACTS", () => {
    const weeks = [null, [1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], [2, 3, 4], [0, 6]];
    const facts = weeks.map((week) => {
      const clock = collectionClock(order, "2026-10-01", delivery, undefined, personOwnerCalendar(OFFICE_KL_2027, week));
      return [clock.dueIso, clock.askIso];
    });
    for (const f of facts) expect(f).toEqual(["2026-10-10", "2026-10-09"]);
    // And the fact function takes no owner at all: (input, opts, timing).
    expect(collectionFactDays(order, delivery)).toMatchObject({ dueIso: "2026-10-10", askIso: "2026-10-09" });
  });

  it("a Kuala Lumpur-only Office holiday moves the ACTION day and never the FACT day", () => {
    // Wed 3 Feb 2027, deadline 2 Delivery working days before: Tue 2 · Mon 1
    // (Mon 1 Feb is a working day on the Selangor Delivery calendar).
    const kl = collectionClock({ confirmedDateIso: "2027-02-03" }, "2027-01-20", delivery, undefined, officeOwnerCalendar(OFFICE_KL_2027));
    expect(kl.dueIso).toBe("2027-02-01");
    // The Office owner does not work the Federal Territory Day: Fri 29 Jan.
    expect(kl.actionDueIso).toBe("2027-01-29");
    // Without the Office holiday the action stays on the fact day.
    const plain = collectionClock({ confirmedDateIso: "2027-02-03" }, "2027-01-20", delivery, undefined, officeOwnerCalendar(OFFICE));
    expect(plain.dueIso).toBe("2027-02-01");
    expect(plain.actionDueIso).toBe("2027-02-01");
  });

  it("a holiday fact day gives each owner their own previous working day", () => {
    // The same Mon 1 Feb 2027 fact (an Office holiday): a Saturday worker acts
    // Sat 30 Jan, a Monday–Friday worker Fri 29 Jan.
    const sat = collectionClock({ confirmedDateIso: "2027-02-03" }, "2027-01-20", delivery, undefined, personOwnerCalendar(OFFICE_KL_2027, [1, 2, 3, 4, 5, 6]));
    const monFri = collectionClock({ confirmedDateIso: "2027-02-03" }, "2027-01-20", delivery, undefined, personOwnerCalendar(OFFICE_KL_2027, [1, 2, 3, 4, 5]));
    expect(sat.dueIso).toBe("2027-02-01");
    expect(monFri.dueIso).toBe("2027-02-01");
    expect(sat.actionDueIso).toBe("2027-01-30");
    expect(monFri.actionDueIso).toBe("2027-01-29");
  });

  it("the Selangor-only holiday is skipped by the FACT (Delivery) count", () => {
    // Mon 14 Dec 2026, deadline 2: Sat 12 · (Fri 11 Sultan of Selangor's Birthday) · Thu 10.
    const clock = collectionClock({ confirmedDateIso: "2026-12-14" }, "2026-12-01", delivery, undefined, officeOwnerCalendar(OFFICE_KL_2027));
    expect(clock.dueIso).toBe("2026-12-10");
  });
});
