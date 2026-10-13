import { describe, expect, it } from "vitest";
import type { OperationWorkCompleted } from "@carres/shared";
import type { WorkRow } from "../use-open-work";
import { taskTabs } from "./task-cards";
import { workspaceTable } from "./workspace-table";

/**
 * The Workspace table (owner's round 3 brief of 13 Oct 2026, points 3 and 4).
 * Every party and number below is TEST data. 2026-10-05 is a Monday.
 */
const TODAY = "2026-10-05";
const ME = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";
const waiting = { state: "waiting", waitingSince: "2026-10-02T03:00:00.000Z", replyDueOn: "2026-10-06", replyMissed: false, channel: "whatsapp", contactKind: "supplier", contactId: null, lastReplyAt: null };
const row = (over: Partial<WorkRow> & { id: string }, source: Record<string, unknown> = {}): WorkRow => ({
  module: "purchasing", ruleKey: "purchasing.supplier_date_passed", dueIso: TODAY, timingBucket: "today",
  line: "Ask TEST Supplier A when the goods will arrive", problem: "Supplier delivery date passed", recipient: "TEST Supplier A",
  ownerId: ME, ownerState: "primary", normalOwner: null,
  ...over,
  source: {
    object: { kind: "purchase_order", id: "p1", label: "PO-261001-9001" },
    timing: { missedAge: { state: "counted", workingDays: 0 } },
    owner: { acting: { userId: ME, name: "TEST · Staff A" } },
    ...source,
  },
} as unknown as WorkRow);
const done = (over: Partial<OperationWorkCompleted> & { occurrenceId: string }): OperationWorkCompleted => ({
  module: "purchasing", ruleKey: "purchasing.po_window", actionOn: TODAY, objectLabel: "PO-261005-9010",
  completedAt: `${TODAY}T02:15:00.000Z`, completedBy: { userId: ME, name: "TEST · Staff A" }, resultReference: "PO-261005-9010", ...over,
});

const LATE = row({ id: "late", dueIso: "2026-09-29", timingBucket: "overdue" }, { timing: { missedAge: { state: "counted", workingDays: 4 } } });
const NOW = row({ id: "now" });
const TUE = row({ id: "tue", dueIso: "2026-10-06", timingBucket: "later" });
const CALL = row({ id: "call", dueIso: null, timingBucket: "no_date", module: "orders", recipient: "TEST customer D", line: "Call TEST customer D" }, { object: { kind: "sales_order", id: "s1", label: "SO-9106" } });
const WAIT = row({ id: "wait", recipient: "TEST Supplier B" }, { lifecycle: waiting });
const BATCH = row({ id: "batch", dueIso: TODAY, timingBucket: "overdue", line: "Issue the POs by 11:00 AM", recipient: "2 suppliers" }, { object: { kind: "po_window", id: `${TODAY}T11:00`, label: "11:00 AM PO window" } });
const MINE = [LATE, NOW, TUE, CALL, WAIT, BATCH];
const DONE = [done({ occurrenceId: "d1" }), done({ occurrenceId: "d2", module: "delivery", completedAt: `${TODAY}T04:00:00.000Z`, completedBy: { userId: OTHER, name: "TEST · Staff B" } })];
const table = (over: Partial<Parameters<typeof workspaceTable>[0]> = {}) =>
  workspaceTable({ scoped: MINE, completed: DONE, doneBy: ME, team: false, today: TODAY, chosen: TODAY, tab: "todo", module: null, ...over });

describe("one task record: the Workspace counts what the Tasks panel counts", () => {
  it("the three tab numbers are the Tasks panel's own, on every day", () => {
    for (const chosen of [TODAY, "2026-10-06", "2026-10-07"]) {
      const panel = taskTabs(MINE, DONE, ME, TODAY, chosen);
      expect(table({ chosen }).counts).toEqual({ todo: panel.todo.count, waiting: panel.waiting.count, done: panel.done.count });
    }
    expect(table().counts).toEqual({ todo: 4, waiting: 1, done: 1 });
  });

  it("the Module rail counts the chosen tab, and its rows sum to that tab's number", () => {
    for (const tab of ["todo", "waiting", "done"] as const) {
      const t = table({ tab });
      expect(t.modules.reduce((sum, m) => sum + m.count, 0)).toBe(t.counts[tab]);
    }
    expect(table().modules.filter((m) => m.count > 0)).toEqual([{ module: "orders", count: 1 }, { module: "purchasing", count: 3 }]);
  });

  it("a module choice narrows the rows and changes no number", () => {
    const t = table({ module: "orders" });
    expect(t.rows.map((r) => r.id)).toEqual(["call"]);
    expect(t.counts).toEqual(table().counts);
    expect(t.modules).toEqual(table().modules);
  });
});

describe("a row of the table", () => {
  it("To do: late first, then the earliest; each column says one fact", () => {
    const rows = table().rows;
    expect(rows.map((r) => r.id)).toEqual(["late", "batch", "now", "call"]);
    expect(rows[0]).toMatchObject({
      due: "Tue, 29 Sep", dueSub: null, title: "Ask TEST Supplier A when the goods will arrive", record: "Purchasing · PO-261001-9001",
      contact: "TEST Supplier A", contactSub: null, lastContact: null, owner: "TEST · Staff A", status: "4 days late", tone: "warn",
    });
    expect(rows[2]).toMatchObject({ due: "Today", status: "To do", tone: "neutral" });
    expect(rows[3]).toMatchObject({ due: "No date", record: "Sales Orders · SO-9106", contact: "TEST customer D" });
  });

  it("a purchase batch is named by its page and its cut-off, never by a key; its contact is its suppliers", () => {
    expect(table().rows[1]).toMatchObject({ due: "Today", dueSub: "11:00 AM", record: "SO Batch Purchase", contact: "2 suppliers", status: "Cut-off passed", tone: "warn" });
  });

  it("Waiting: who was asked, how and when; a passed answer day is back in To do and says so", () => {
    expect(table({ tab: "waiting" }).rows).toEqual([expect.objectContaining({
      id: "wait", contact: "TEST Supplier B", contactSub: "WhatsApp", lastContact: "Asked Fri, 2 Oct", status: "Waiting", tone: "neutral",
    })]);
    const back = row({ id: "back" }, { lifecycle: { ...waiting, state: "to_do", replyMissed: true } });
    expect(table({ scoped: [back] }).rows[0]).toMatchObject({ lastContact: "No answer by Tue, 6 Oct", status: "To do" });
  });

  it("Done: what I finished on the day, newest first; Team Work lists everyone's, with who", () => {
    expect(table({ tab: "done" }).rows.map((r) => [r.id, r.status, r.tone, r.work])).toEqual([["d1", "Done", "ok", null]]);
    const team = table({ tab: "done", team: true, doneBy: null });
    expect(team.rows.map((r) => [r.id, r.owner])).toEqual([["d2", "TEST · Staff B"], ["d1", "TEST · Staff A"]]);
    expect(team.counts.done).toBe(2);
  });

  it("a broken commitment is the status, before lateness", () => {
    expect(table({ scoped: [row({ id: "b", dueIso: "2026-09-29", timingBucket: "overdue" }, { broken: true, timing: { missedAge: { state: "counted", workingDays: 4 } } })] }).rows[0])
      .toMatchObject({ status: "Broken commitment", tone: "warn", late: true });
  });

  it("nobody assigned: no owner is invented", () => {
    expect(table({ scoped: [row({ id: "x" }, { owner: { acting: null } })] }).rows[0]!.owner).toBeNull();
  });
});
