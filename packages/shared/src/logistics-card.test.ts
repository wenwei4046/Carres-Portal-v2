import { describe, expect, it } from "vitest";
import {
  linkCannotDeliverInput,
  linkSaveScheduledInput,
  logisticsCardModel,
  moneyAffectsDelivery,
  stockRouteOfDestination,
  type LogisticsCardInput,
} from "./logistics-card";

const spell = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
};

/** The owner's own example: requested Tue 27 Oct → Fri 23 · Sat 24 · Mon 26. */
function input(over: Partial<LogisticsCardInput> = {}): LogisticsCardInput {
  return {
    todayIso: "2026-10-19",
    holidays: [],
    requestedIso: "2026-10-27",
    scheduledIso: null,
    partnerName: "AL Logistics",
    startedIso: "2026-10-01",
    detailsReceivedIso: null,
    answer: null,
    settled: false,
    dayBeforeGaps: [],
    moneyOwed: null,
    financeHold: null,
    spell,
    ...over,
  };
}

describe("the three checks count working days back from the anchor", () => {
  it("anchors on the requested date before anything is scheduled", () => {
    const m = logisticsCardModel(input());
    expect(m.anchorKind).toBe("requested");
    expect(m.rows.map((r) => r.dueIso)).toEqual(["2026-10-23", "2026-10-24", "2026-10-26"]);
    expect(m.rows.map((r) => r.label)).toEqual([
      "3 working days before",
      "2 working days before",
      "1 working day before",
    ]);
    expect(m.rows.every((r) => r.state === "not_open")).toBe(true);
    expect(m.doneCount).toBe(0);
  });

  it("skips Sunday and a public holiday", () => {
    const m = logisticsCardModel(input({ holidays: ["2026-10-24"] }));
    expect(m.rows.map((r) => r.dueIso)).toEqual(["2026-10-22", "2026-10-23", "2026-10-26"]);
  });

  it("a reschedule moves only the check still ahead; done checks keep their dates", () => {
    const first = logisticsCardModel(
      input({ todayIso: "2026-10-24", detailsReceivedIso: "2026-10-22", scheduledIso: "2026-10-27" }),
    );
    expect(first.rows.map((r) => [r.dueIso, r.state])).toEqual([
      ["2026-10-23", "done"],
      ["2026-10-24", "done"],
      ["2026-10-26", "not_open"],
    ]);
    const moved = logisticsCardModel(
      input({ todayIso: "2026-10-24", detailsReceivedIso: "2026-10-22", scheduledIso: "2026-10-29" }),
    );
    expect(moved.anchorKind).toBe("scheduled");
    expect(moved.rows.map((r) => r.dueIso)).toEqual(["2026-10-23", "2026-10-24", "2026-10-28"]);
    expect(moved.rows[1].fact).toBe("Scheduled 29 Oct");
  });
});

describe("the one current action", () => {
  it("asks to assign logistics first, due at the 3-day check, not urgent before it", () => {
    const m = logisticsCardModel(input({ partnerName: null }));
    expect(m.currentAction).toMatchObject({ act: "Assign logistics", dueIso: "2026-10-23", timing: "ahead", door: "assign" });
    expect(m.rows[0].fact).toBe("Logistics not assigned");
  });

  it("says Contact logistics today only on or after the 3-day check", () => {
    expect(logisticsCardModel(input()).currentAction?.act).toBe("Contact logistics");
    const today = logisticsCardModel(input({ todayIso: "2026-10-23" }));
    expect(today.currentAction).toMatchObject({ act: "Contact logistics today", timing: "today" });
    expect(today.rows[0].state).toBe("open");
  });

  it("after the details are received, asks for the scheduled date; no answer past the check says so", () => {
    const m = logisticsCardModel(input({ todayIso: "2026-10-26", detailsReceivedIso: "2026-10-22" }));
    expect(m.currentAction).toMatchObject({ act: "Call AL Logistics", result: "Get the scheduled delivery date", timing: "missed" });
    expect(m.rows[1]).toMatchObject({ state: "missed", fact: "No answer" });
  });

  it("another date proposed: call the customer; cannot deliver: decide the next step", () => {
    const other = logisticsCardModel(
      input({ todayIso: "2026-10-22", detailsReceivedIso: "2026-10-21", answer: { kind: "another_date", atIso: "2026-10-22", proposedIso: "2026-10-29", reasonLabel: "We are full on that date" } }),
    );
    expect(other.rows[1].fact).toBe("Requested another date · 29 Oct");
    expect(other.currentAction?.act).toBe("Call the customer");
    const cannot = logisticsCardModel(
      input({ todayIso: "2026-10-22", answer: { kind: "cannot_deliver", atIso: "2026-10-22", proposedIso: null, reasonLabel: "No capacity on that date" } }),
    );
    expect(cannot.currentAction?.door).toBe("decide");
    expect(cannot.exception).toBe("Cannot deliver · No capacity on that date");
  });
});

describe("1 working day before checks exceptions only", () => {
  const scheduled = { detailsReceivedIso: "2026-10-22", scheduledIso: "2026-10-27" };

  it("nothing missing → done, no action, no exception", () => {
    const m = logisticsCardModel(input({ ...scheduled, todayIso: "2026-10-26" }));
    expect(m.rows[2]).toMatchObject({ state: "done", fact: "Nothing missing" });
    expect(m.currentAction).toBeNull();
    expect(m.exception).toBeNull();
    expect(m.doneCount).toBe(3);
  });

  it("a gap names itself; money prints its amount; the gap's own act becomes the action", () => {
    const m = logisticsCardModel(
      input({
        ...scheduled,
        todayIso: "2026-10-26",
        moneyOwed: "1,250.00",
        dayBeforeGaps: [{ fact: "Driver and vehicle not recorded", action: { act: "Ask AL Logistics", result: "Record the driver and vehicle", door: "schedule" } }],
      }),
    );
    expect(m.rows[2].state).toBe("open");
    expect(m.rows[2].gaps.map((g) => g.fact)).toEqual(["RM 1,250.00 still to collect", "Driver and vehicle not recorded"]);
    expect(m.exception).toBe("RM 1,250.00 still to collect");
    expect(m.currentAction?.act).toBe("Ask AL Logistics");
  });

  it("before the day it does not check at all", () => {
    const m = logisticsCardModel(input({ ...scheduled, todayIso: "2026-10-24", dayBeforeGaps: [{ fact: "x", action: null }] }));
    expect(m.rows[2].gaps).toEqual([]);
    expect(m.exception).toBeNull();
  });
});

describe("a check that was already behind the start is not needed, never missed", () => {
  it("an order that started two days before delivery skips the 3-day check", () => {
    const m = logisticsCardModel(input({ startedIso: "2026-10-24", todayIso: "2026-10-24" }));
    expect(m.rows[0].state).toBe("not_needed");
    expect(m.currentAction?.act).toBe("Call AL Logistics");
  });
});

describe("money affects the delivery only from its payment deadline", () => {
  it("2 working days in the Klang Valley, 3 outstation", () => {
    const base = { owed: 1250, anchorIso: "2026-10-27", holidays: [] };
    expect(moneyAffectsDelivery({ ...base, todayIso: "2026-10-23", outstation: false })).toBe(false);
    expect(moneyAffectsDelivery({ ...base, todayIso: "2026-10-24", outstation: false })).toBe(true);
    expect(moneyAffectsDelivery({ ...base, todayIso: "2026-10-23", outstation: true })).toBe(true);
    expect(moneyAffectsDelivery({ ...base, owed: 0, todayIso: "2026-10-26", outstation: true })).toBe(false);
  });
});

describe("the stock route follows the destination's Site", () => {
  it("maps the three Site kinds and the unknown", () => {
    expect(stockRouteOfDestination("own")).toBe("carres_klang");
    expect(stockRouteOfDestination("operation_partner")).toBe("supplier_to_logistics");
    expect(stockRouteOfDestination("no_site")).toBe("supplier_to_customer");
    expect(stockRouteOfDestination(null)).toBe("not_known");
  });
});

describe("the link inputs", () => {
  it("a scheduled date is required, the time is optional", () => {
    expect(linkSaveScheduledInput.safeParse({ scheduledDate: "2026-10-27" }).success).toBe(true);
    expect(linkSaveScheduledInput.safeParse({ scheduledTime: "Anytime" }).success).toBe(false);
  });
  it("`other` needs its words", () => {
    expect(linkCannotDeliverInput.safeParse({ reason: "other" }).success).toBe(false);
    expect(linkCannotDeliverInput.safeParse({ reason: "no_capacity" }).success).toBe(true);
  });
});
