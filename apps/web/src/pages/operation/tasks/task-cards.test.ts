import { describe, expect, it } from "vitest";
import type { OperationWorkCompleted } from "@carres/shared";
import type { WorkRow } from "../use-open-work";
import { TASK_CARD_WORDS as W, doneCard, doneOn, emptyWord, recordWord, taskCard, taskGroups, taskStrip, taskTabs, todoOn, waitingRows } from "./task-cards";

/**
 * The Tasks panel list (owner 12 Oct 2026, 03 §8; round 3 brief, point 2).
 * Every party and number below is TEST data. 2026-10-05 is a Monday.
 */
const TODAY = "2026-10-05";
const ME = "00000000-0000-4000-8000-0000000000aa";
const waiting = { state: "waiting", waitingSince: "2026-10-02T03:00:00.000Z", replyDueOn: "2026-10-06", replyMissed: false, channel: "whatsapp", contactKind: "supplier", contactId: null, lastReplyAt: null };
const row = (over: Partial<WorkRow> & { id: string }, source: Record<string, unknown> = {}): WorkRow => ({
  module: "purchasing",
  ruleKey: "purchasing.supplier_date_passed",
  dueIso: TODAY,
  timingBucket: "today",
  line: "Ask TEST Supplier A when the goods will arrive",
  problem: "Supplier delivery date passed",
  recipient: "TEST Supplier A",
  ownerId: ME,
  ownerState: "primary",
  normalOwner: null,
  ...over,
  source: {
    object: { kind: "purchase_order", id: "p1", label: "PO-261001-9001" },
    timing: { missedAge: { state: "counted", workingDays: 0 } },
    ...source,
  },
} as unknown as WorkRow);
const done = (over: Partial<OperationWorkCompleted> & { occurrenceId: string }): OperationWorkCompleted => ({
  module: "purchasing", ruleKey: "purchasing.po_window", actionOn: TODAY, objectLabel: "PO-261005-9010",
  completedAt: `${TODAY}T02:15:00.000Z`, completedBy: { userId: ME, name: "TEST · Staff A" }, resultReference: "PO-261005-9010", ...over,
});

const LATE = row({ id: "late", dueIso: "2026-09-29", timingBucket: "overdue" }, { timing: { missedAge: { state: "counted", workingDays: 4 } } });
const NOW = row({ id: "now" });
const TUE = row({ id: "tue", dueIso: "2026-10-06", timingBucket: "later", recipient: "TEST Supplier B" });
const NODATE = row({ id: "nodate", dueIso: null, timingBucket: "no_date", module: "orders", recipient: "TEST customer D", line: "Call TEST customer D" },
  { object: { kind: "sales_order", id: "s1", label: "SO-9106" } });
const WAIT = row({ id: "wait" }, { lifecycle: waiting });
const MINE = [LATE, NOW, TUE, NODATE, WAIT];

describe("which day a task is on", () => {
  it("today's To do is what is due today or earlier, and what has no working date", () => {
    expect(todoOn(MINE, TODAY, TODAY).map((r) => r.id)).toEqual(["late", "now", "nodate"]);
  });
  it("another day holds only that day's own work: nothing late, nothing undated", () => {
    expect(todoOn(MINE, TODAY, "2026-10-06").map((r) => r.id)).toEqual(["tue"]);
    expect(todoOn(MINE, TODAY, "2026-10-07")).toEqual([]);
  });
  it("work waiting for an answer is in Waiting, never in To do", () => {
    expect(waitingRows(MINE).map((r) => r.id)).toEqual(["wait"]);
    expect(todoOn(MINE, TODAY, TODAY).some((r) => r.id === "wait")).toBe(false);
  });
  it("Done is what I finished on the chosen day, by Malaysia's date, newest first", () => {
    const list = [
      done({ occurrenceId: "a", completedAt: `${TODAY}T01:00:00.000Z` }),
      done({ occurrenceId: "b", completedAt: `${TODAY}T03:00:00.000Z` }),
      /* 5 Oct 17:00 UTC is 6 Oct 01:00 in Malaysia. */
      done({ occurrenceId: "late-night", completedAt: `${TODAY}T17:00:00.000Z` }),
      done({ occurrenceId: "someone-else", completedBy: { userId: "00000000-0000-4000-8000-0000000000bb", name: "TEST · Staff B" } }),
      done({ occurrenceId: "nobody", completedBy: null }),
    ];
    expect(doneOn(list, ME, TODAY).map((d) => d.occurrenceId)).toEqual(["b", "a"]);
    expect(doneOn(list, ME, "2026-10-06").map((d) => d.occurrenceId)).toEqual(["late-night"]);
    expect(doneOn(list, null, TODAY)).toEqual([]);
  });
});

describe("the day strip", () => {
  it("is the working week, and a day's number is its To do", () => {
    const strip = taskStrip(MINE, TODAY, TODAY);
    expect(strip.days.map((d) => d.weekday)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(strip.days.map((d) => d.count)).toEqual([3, 1, 0, 0, 0]);
    expect(strip.days[0]).toMatchObject({ iso: TODAY, dayNumber: "5", today: true, late: true });
    expect(strip.days[1]).toMatchObject({ today: false, late: false });
  });
  it("Saturday is drawn only while work is dated on it", () => {
    expect(taskStrip([...MINE, row({ id: "sat", dueIso: "2026-10-10", timingBucket: "later" })], TODAY, TODAY).days.map((d) => d.weekday))
      .toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });
  it("the arrows move a week, and late work stays counted on today only", () => {
    const strip = taskStrip(MINE, TODAY, TODAY);
    expect(strip.previousWeek).toBe("2026-09-28");
    expect(strip.nextWeek).toBe("2026-10-12");
    const before = taskStrip(MINE, TODAY, "2026-09-29");
    expect(before.days.map((d) => d.count)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("a task card", () => {
  it("is its title, then one row per fact: the record, then the deadline", () => {
    const card = taskCard(NOW);
    expect(card).toMatchObject({ id: "now", module: "purchasing", title: "Ask TEST Supplier A when the goods will arrive", party: "TEST Supplier A", late: false });
    expect(card.rows.map((r) => [r.label, r.value, r.warn])).toEqual([
      ["PO No", "PO-261001-9001", false],
      ["Deadline", "Mon, 5 Oct", false],
    ]);
  });
  it("amber is on the one row whose date has gone by: `{date} · {n} days late`", () => {
    const rows = taskCard(LATE).rows;
    expect(rows.map((r) => [r.label, r.value, r.warn])).toEqual([
      ["PO No", "PO-261001-9001", false],
      ["Deadline", "Tue, 29 Sep · 4 days late", true],
    ]);
    expect(W.daysLate(1)).toBe("1 day late");
  });
  it("a late date whose working days cannot be counted says `passed`, never a guess", () => {
    const uncounted = row({ id: "u", dueIso: "2026-09-29", timingBucket: "overdue" }, { timing: { missedAge: { state: "not_calculable", workingDays: null } } });
    expect(taskCard(uncounted).rows[1]).toMatchObject({ value: "Tue, 29 Sep · passed", warn: true });
  });
  it("no working date says so, with the page that sets it", () => {
    const card = taskCard(NODATE);
    expect(card.party).toBe("TEST customer D");
    expect(card.rows.map((r) => [r.label, r.value, r.warn])).toEqual([["SO No", "SO-9106", false], ["Deadline", "No date · set by Sales Orders", false]]);
  });
  it("a purchase batch is named by its cut-off time, never by a key, under SO Batch Purchase", () => {
    const batch = row({ id: "b", line: "Issue PO", recipient: null }, { object: { kind: "po_window", id: "2026-10-05T11:00", label: "11:00 AM" } });
    const card = taskCard(batch);
    expect(card.party).toBe("SO Batch Purchase");
    expect(card.rows.map((r) => [r.label, r.value, r.warn])).toEqual([["Cut-off", "11:00 AM", false]]);
    const passed = taskCard(row({ id: "b2", timingBucket: "overdue", recipient: null }, { object: { kind: "po_window", id: "2026-10-05T11:00", label: "11:00 AM" } }));
    expect(passed.rows[0]).toMatchObject({ label: "Cut-off", value: "11:00 AM · passed", warn: true });
  });
  it("waiting work says when it was asked and when to contact next", () => {
    expect(taskCard(WAIT).rows.map((r) => [r.label, r.value, r.warn])).toEqual([
      ["PO No", "PO-261001-9001", false],
      ["Deadline", "Mon, 5 Oct", false],
      ["Asked", "Fri, 2 Oct", false],
      ["Next contact", "Tue, 6 Oct", false],
    ]);
  });
  it("an answer day that passed puts the work back in To do, and the card says so in amber", () => {
    const back = row({ id: "back" }, { lifecycle: { ...waiting, state: "to_do", waitingSince: null, replyDueOn: "2026-10-02", replyMissed: true } });
    expect(todoOn([back], TODAY, TODAY)).toHaveLength(1);
    expect(taskCard(back).rows.at(-1)).toEqual({ icon: "alarm", label: "No answer by", value: "Fri, 2 Oct", warn: true });
  });
  it("work I do for a colleague names the colleague", () => {
    const covered = row({ id: "c", ownerState: "covered", normalOwner: { userId: "x", name: "TEST · Staff B" } as never });
    expect(taskCard(covered).rows.at(-1)).toMatchObject({ label: "For", value: "TEST · Staff B", warn: false });
  });
  it("a task with no party sits under its page", () => {
    expect(taskCard(row({ id: "n", recipient: null, module: "issue_tracker" })).party).toBe("Issue Tracker");
  });
  it("the record is named by its kind; a kind with no word of its own takes its page's", () => {
    expect(recordWord("purchase_order", "purchasing")).toBe("PO No");
    expect(recordWord("sales_order", "delivery")).toBe("SO No");
    expect(recordWord("manual_purchase", "purchasing")).toBe("MPR No");
    expect(recordWord("invoice", "payment")).toBe("Payment");
  });
  it("a finished task says what was recorded, on which record, and when; it opens nothing", () => {
    const card = doneCard(done({ occurrenceId: "d1" }));
    expect(card).toMatchObject({ id: "d1", work: null, late: false, party: "Purchasing", title: "Every PO issued from the window has its current version marked as sent" });
    expect(card.rows.map((r) => r.label)).toEqual(["Record", "Done"]);
    expect(card.rows[0]!.value).toBe("PO-261005-9010");
    /* A rule this build does not know keeps the module's own reference. */
    expect(doneCard(done({ occurrenceId: "d2", ruleKey: "future.rule", resultReference: "REF-1" })).title).toBe("REF-1");
  });
});

describe("the list", () => {
  it("groups cards under their party: late parties first, then by name; late cards first inside", () => {
    const groups = taskGroups([taskCard(TUE), taskCard(NOW), taskCard(LATE), taskCard(NODATE)]);
    expect(groups.map((g) => [g.name, g.cards.map((c) => c.id)])).toEqual([
      ["TEST Supplier A", ["late", "now"]],
      ["TEST customer D", ["nodate"]],
      ["TEST Supplier B", ["tue"]],
    ]);
  });
  it("the three tabs count the chosen day; Waiting is not tied to a day", () => {
    const completed = [done({ occurrenceId: "a" }), done({ occurrenceId: "b", completedAt: `${TODAY}T05:00:00.000Z` })];
    const today = taskTabs(MINE, completed, ME, TODAY, TODAY);
    expect([today.todo.count, today.waiting.count, today.done.count]).toEqual([3, 1, 2]);
    expect(today.done.groups[0]!.cards.map((c) => c.id)).toEqual(["b", "a"]);
    const tuesday = taskTabs(MINE, completed, ME, TODAY, "2026-10-06");
    expect([tuesday.todo.count, tuesday.waiting.count, tuesday.done.count]).toEqual([1, 1, 0]);
  });
  it("To do on today equals the strip's number for today", () => {
    expect(taskTabs(MINE, [], ME, TODAY, TODAY).todo.count).toBe(taskStrip(MINE, TODAY, TODAY).days[0]!.count);
  });
  it("an empty tab says which kind of nothing it is", () => {
    expect(emptyWord("todo", true)).toBe("Nothing to do today");
    expect(emptyWord("todo", false)).toBe("Nothing planned for this day");
    expect(emptyWord("waiting", true)).toBe("Nothing is waiting for an answer");
    expect(emptyWord("done", true)).toBe("Nothing done on this day");
  });
});
