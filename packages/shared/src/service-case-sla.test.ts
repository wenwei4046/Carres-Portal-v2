import { describe, expect, it } from "vitest";
import {
  CASE_DELAY_REASONS,
  CASE_DELAY_REASON_LABEL,
  CASE_DELAY_REASON_RESPONSIBILITY,
  CASE_SLA_NOTICE_DAYS_BEFORE,
  CASE_SLA_WORKING_DAYS,
  caseDelayNeedsNote,
  caseDelayReasonLabel,
  caseSlaAction,
  caseSlaBaseDue,
  caseSlaClock,
  caseSlaCountLabel,
  caseSlaExtensionMax,
  caseSlaRecordProblem,
  caseSlaWorkingDay,
  type CaseSlaEvent,
} from "./service-case-sla";
import { myHolidaySet } from "./my-holidays";

/**
 * Worked example used throughout: a case reported Monday 6 Jul 2026.
 * 14 working days later (Sundays skipped, no July holidays) = Wed 22 Jul 2026.
 * Day 10 = Fri 17 Jul 2026, which is also the day 4 working days are left.
 */
const OPENED = "2026-07-06";
const DUE = "2026-07-22";
const DAY_10 = "2026-07-17";

function told(over: Partial<CaseSlaEvent> = {}): CaseSlaEvent {
  return {
    kind: "customer_told",
    on: DAY_10,
    reason: "supplier_no_date",
    due: DUE,
    at: "2026-07-17T02:00:00Z",
    by: "00000000-0000-0000-0000-000000000001",
    byRole: "operation",
    ...over,
  };
}

function extension(over: Partial<CaseSlaEvent> = {}): CaseSlaEvent {
  return {
    kind: "extension",
    on: DAY_10,
    reason: "supplier_special_order",
    until: "2026-07-31",
    due: DUE,
    at: "2026-07-17T02:00:00Z",
    by: "00000000-0000-0000-0000-000000000001",
    byRole: "operation",
    ...over,
  };
}

describe("the deadline", () => {
  it("is 14 working days after the day it was reported", () => {
    expect(caseSlaBaseDue(OPENED)).toBe(DUE);
  });

  it("skips holidays as well as Sundays", () => {
    expect(caseSlaBaseDue(OPENED, { holidays: ["2026-07-08"] })).toBe("2026-07-23");
  });

  it("is null when the case has no report date", () => {
    expect(caseSlaBaseDue(null)).toBeNull();
    expect(caseSlaBaseDue("")).toBeNull();
  });

  it("tolerates a timestamp as the report date", () => {
    expect(caseSlaBaseDue("2026-07-06T09:30:00Z")).toBe(DUE);
  });

  it("lands on a working day by construction, even across the real calendar", () => {
    const opts = { holidays: myHolidaySet() };
    const due = caseSlaBaseDue("2026-08-24", opts)!;
    expect(caseSlaWorkingDay(due, opts)).toBe(due);
  });
});

describe("the clock", () => {
  it("is quiet while there is time left", () => {
    const c = caseSlaClock({ openedAt: OPENED, todayIso: "2026-07-16" });
    expect(c.state).toBe("on_track");
    expect(c.workingDaysLeft).toBe(5);
    expect(c.noticeOwed).toBe(false);
  });

  it("asks for the call on day 10 — four working days before the deadline", () => {
    const c = caseSlaClock({ openedAt: OPENED, todayIso: DAY_10 });
    expect(c.state).toBe("notice_due");
    expect(c.workingDaysLeft).toBe(CASE_SLA_NOTICE_DAYS_BEFORE);
    expect(c.noticeOwed).toBe(true);
  });

  it("counts the day the deadline falls on as not yet late", () => {
    const c = caseSlaClock({ openedAt: OPENED, todayIso: DUE });
    expect(c.state).toBe("notice_due");
    expect(c.workingDaysLeft).toBe(0);
    expect(c.workingDaysLate).toBe(0);
  });

  it("goes late the day after, counting in working days", () => {
    const c = caseSlaClock({ openedAt: OPENED, todayIso: "2026-07-23" });
    expect(c.state).toBe("late");
    expect(c.workingDaysLate).toBe(1);
    expect(c.workingDaysLeft).toBe(-1);
  });

  it("does not count the Sunday it ran through", () => {
    // 22 Jul (Wed) → 27 Jul (Mon): Thu, Fri, Sat, Mon = 4 working days.
    const c = caseSlaClock({ openedAt: OPENED, todayIso: "2026-07-27" });
    expect(c.workingDaysLate).toBe(4);
  });

  it("switches off for a closed case — there is nothing left to be late for", () => {
    const c = caseSlaClock({ openedAt: OPENED, todayIso: "2026-07-27", closed: true });
    expect(c.state).toBe("off");
    expect(c.noticeOwed).toBe(false);
    expect(c.dueIso).toBe(DUE);
  });

  it("switches off when the case has no report date", () => {
    const c = caseSlaClock({ openedAt: null, todayIso: "2026-07-27" });
    expect(c.state).toBe("off");
    expect(c.dueIso).toBeNull();
    expect(c.noticeOwed).toBe(false);
  });
});

describe("who has been told what", () => {
  it("stops asking once the customer has been told about this deadline", () => {
    const c = caseSlaClock({ openedAt: OPENED, todayIso: DAY_10, events: [told()] });
    expect(c.noticeOwed).toBe(false);
    expect(c.toldAboutThisDeadline).toBe(true);
    expect(c.toldOn).toBe(DAY_10);
    expect(c.toldReason).toBe("supplier_no_date");
  });

  it("keeps the deadline covered once it has passed — the call was made", () => {
    const c = caseSlaClock({ openedAt: OPENED, todayIso: "2026-07-23", events: [told()] });
    expect(c.state).toBe("late");
    expect(c.noticeOwed).toBe(false);
  });

  it("does not count a call made about a DIFFERENT deadline", () => {
    const stale = told({ due: "2026-07-10" });
    const c = caseSlaClock({ openedAt: OPENED, todayIso: DAY_10, events: [stale] });
    expect(c.toldAboutThisDeadline).toBe(false);
    expect(c.noticeOwed).toBe(true);
  });

  it("re-opens the call when the deadline is moved after the customer was told", () => {
    const c = caseSlaClock({
      openedAt: OPENED,
      todayIso: "2026-07-30",
      events: [told(), extension()],
    });
    expect(c.dueIso).toBe("2026-07-31");
    // The extension itself points at the new deadline, so it covers it.
    expect(c.toldAboutThisDeadline).toBe(true);
    expect(c.noticeOwed).toBe(false);
  });

  it("asks again once a moved deadline is itself within the warn window and unexplained", () => {
    const moved = extension({ until: "2026-08-05", due: DUE });
    const c = caseSlaClock({
      openedAt: OPENED,
      todayIso: "2026-08-01",
      events: [{ ...moved, until: "2026-08-05" }],
    });
    expect(c.dueIso).toBe("2026-08-05");
    expect(c.state).toBe("notice_due");
    // The extension points at 5 Aug, so it explains it — no second call owed.
    expect(c.noticeOwed).toBe(false);
  });

  it("reads the LATEST call, not the first", () => {
    const first = told({ on: "2026-07-15", reason: "no_stock" });
    const second = told({ on: "2026-07-20", reason: "logistics" });
    const c = caseSlaClock({ openedAt: OPENED, todayIso: DUE, events: [first, second] });
    expect(c.toldOn).toBe("2026-07-20");
    expect(c.toldReason).toBe("logistics");
  });
});

describe("the one extension", () => {
  it("moves the deadline", () => {
    const c = caseSlaClock({ openedAt: OPENED, todayIso: DAY_10, events: [extension()] });
    expect(c.baseDueIso).toBe(DUE);
    expect(c.dueIso).toBe("2026-07-31");
    expect(c.extendedToIso).toBe("2026-07-31");
    expect(c.state).toBe("on_track");
  });

  it("is available once and then never again", () => {
    expect(caseSlaClock({ openedAt: OPENED, todayIso: DAY_10 }).mayExtend).toBe(true);
    expect(
      caseSlaClock({ openedAt: OPENED, todayIso: DAY_10, events: [extension()] }).mayExtend,
    ).toBe(false);
  });

  it("is not offered on a closed case", () => {
    expect(
      caseSlaClock({ openedAt: OPENED, todayIso: DAY_10, closed: true }).mayExtend,
    ).toBe(false);
  });

  it("reaches at most one more full period", () => {
    expect(caseSlaExtensionMax(DUE)).toBe("2026-08-07");
  });
});

describe("recording an event", () => {
  const clock = caseSlaClock({ openedAt: OPENED, todayIso: DAY_10 });

  it("accepts a call with a picked reason", () => {
    expect(
      caseSlaRecordProblem(
        { kind: "customer_told", on: DAY_10, reason: "supplier_no_date" },
        clock,
      ),
    ).toBeNull();
  });

  it("refuses a reason that is not on the list", () => {
    expect(
      caseSlaRecordProblem({ kind: "customer_told", on: DAY_10, reason: "busy" }, clock),
    ).toBe("Why is it taking longer?");
  });

  it("refuses Other with nothing written down", () => {
    expect(
      caseSlaRecordProblem({ kind: "customer_told", on: DAY_10, reason: "other" }, clock),
    ).toBe("Say what the reason is");
    expect(
      caseSlaRecordProblem(
        { kind: "customer_told", on: DAY_10, reason: "other", note: "Factory flooded" },
        clock,
      ),
    ).toBeNull();
  });

  it("refuses a note nobody could read", () => {
    expect(
      caseSlaRecordProblem(
        { kind: "customer_told", on: DAY_10, reason: "no_stock", note: "x".repeat(301) },
        clock,
      ),
    ).toBe("That note is too long");
  });

  it("refuses a malformed date", () => {
    expect(
      caseSlaRecordProblem(
        { kind: "customer_told", on: "17/07/2026", reason: "no_stock" },
        clock,
      ),
    ).toBe("Give the date as YYYY-MM-DD");
  });

  it("accepts an extension inside the one allowed period", () => {
    expect(
      caseSlaRecordProblem(
        {
          kind: "extension",
          on: DAY_10,
          reason: "supplier_special_order",
          until: "2026-07-31",
        },
        clock,
      ),
    ).toBeNull();
  });

  it("refuses an extension that does not move the deadline forward", () => {
    expect(
      caseSlaRecordProblem(
        { kind: "extension", on: DAY_10, reason: "supplier_special_order", until: DUE },
        clock,
      ),
    ).toBe("The new deadline must be after the one it replaces.");
  });

  it("refuses an extension reaching past one more period", () => {
    expect(
      caseSlaRecordProblem(
        {
          kind: "extension",
          on: DAY_10,
          reason: "supplier_special_order",
          until: "2026-09-30",
        },
        clock,
      ),
    ).toBe("The deadline cannot be moved past 2026-08-07.");
  });

  it("refuses a second extension", () => {
    const used = caseSlaClock({ openedAt: OPENED, todayIso: DAY_10, events: [extension()] });
    expect(
      caseSlaRecordProblem(
        {
          kind: "extension",
          on: DAY_10,
          reason: "supplier_special_order",
          until: "2026-08-05",
        },
        used,
      ),
    ).toBe("This deadline has already been moved once.");
  });

  it("measures the extension against the BASE deadline, not the moved one", () => {
    // A caller who has just moved the deadline cannot walk it forward again by
    // re-reading the new one: the bound is always base + one period.
    const used = caseSlaClock({ openedAt: OPENED, todayIso: DAY_10, events: [extension()] });
    expect(used.baseDueIso).toBe(DUE);
    expect(caseSlaExtensionMax(used.baseDueIso)).toBe("2026-08-07");
  });
});

describe("the words", () => {
  it("names the customer in the action", () => {
    const c = caseSlaClock({ openedAt: OPENED, todayIso: DAY_10 });
    expect(caseSlaAction(c, "Ahmad Tan")).toBe(
      "Call Ahmad Tan — say why it is taking longer",
    );
  });

  it("falls back to the role word when no name is stored", () => {
    const c = caseSlaClock({ openedAt: OPENED, todayIso: DAY_10 });
    expect(caseSlaAction(c, "   ")).toBe("Call the customer — say why it is taking longer");
  });

  it("asks for nothing when nothing is owed", () => {
    const c = caseSlaClock({ openedAt: OPENED, todayIso: "2026-07-16" });
    expect(caseSlaAction(c, "Ahmad Tan")).toBeNull();
  });

  it("states the count as a fact, numbers up front", () => {
    expect(caseSlaCountLabel(caseSlaClock({ openedAt: OPENED, todayIso: DAY_10 }))).toBe(
      "4 working days left",
    );
    expect(caseSlaCountLabel(caseSlaClock({ openedAt: OPENED, todayIso: DUE }))).toBe(
      "Due today",
    );
    expect(
      caseSlaCountLabel(caseSlaClock({ openedAt: OPENED, todayIso: "2026-07-23" })),
    ).toBe("1 working day late");
    expect(
      caseSlaCountLabel(caseSlaClock({ openedAt: OPENED, todayIso: "2026-07-27" })),
    ).toBe("4 working days late");
  });

  it("says nothing at all about a closed case", () => {
    expect(
      caseSlaCountLabel(
        caseSlaClock({ openedAt: OPENED, todayIso: "2026-07-27", closed: true }),
      ),
    ).toBeNull();
  });

  it("uses no banned word (COPY-STANDARD) in any visible string", () => {
    const banned = [
      "chase",
      "pod",
      "unscheduled",
      "pending",
      "processing",
      "in progress",
      "waiting",
      "at risk",
      "attention",
      "sla",
    ];
    const strings = [
      ...Object.values(CASE_DELAY_REASON_LABEL),
      caseSlaAction(caseSlaClock({ openedAt: OPENED, todayIso: DAY_10 }), "Ahmad Tan") ?? "",
      caseSlaCountLabel(caseSlaClock({ openedAt: OPENED, todayIso: DAY_10 })) ?? "",
      caseSlaCountLabel(caseSlaClock({ openedAt: OPENED, todayIso: "2026-07-23" })) ?? "",
    ];
    for (const s of strings) {
      for (const b of banned) {
        expect(s.toLowerCase()).not.toContain(b);
      }
    }
  });

  it("passes an unknown reason key through rather than printing nothing", () => {
    expect(caseDelayReasonLabel("retired_key")).toBe("retired_key");
    expect(caseDelayReasonLabel(null)).toBe("—");
    expect(caseDelayReasonLabel("no_stock")).toBe("No replacement in stock");
  });
});

describe("the reason list", () => {
  it("labels and files every reason", () => {
    for (const r of CASE_DELAY_REASONS) {
      expect(CASE_DELAY_REASON_LABEL[r]).toBeTruthy();
      expect(CASE_DELAY_REASON_RESPONSIBILITY[r]).toBeTruthy();
    }
  });

  it("asks for a note on Other alone", () => {
    for (const r of CASE_DELAY_REASONS) {
      expect(caseDelayNeedsNote(r)).toBe(r === "other");
    }
  });

  it("carries the card's own special-order case", () => {
    expect(CASE_DELAY_REASON_LABEL.supplier_special_order).toBe("Parts on special order");
    expect(CASE_SLA_WORKING_DAYS).toBe(14);
  });
});
