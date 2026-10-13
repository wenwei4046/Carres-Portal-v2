import { describe, expect, it } from "vitest";
import type { WorkRow } from "../use-open-work";
import { taskCard } from "./task-cards";
import { TASK_VIEW_WORDS as W, fileCount, historyWhen, lifecycleHistory, sortHistory, taskFacts, taskHead } from "./task-view";

/**
 * The one task view's words and facts (owner's round 3 brief of 13 Oct 2026,
 * point 2). Every party and number below is TEST data.
 */
const TODAY = "2026-10-05";
const row = (over: Partial<WorkRow> & { id: string }, source: Record<string, unknown> = {}): WorkRow => ({
  module: "purchasing",
  ruleKey: "purchasing.supplier_date_passed",
  dueIso: TODAY,
  timingBucket: "today",
  line: "Ask TEST Supplier A when the goods will arrive",
  problem: "Supplier delivery date passed",
  recipient: "TEST Supplier A",
  destination: "/operation/procurement?po=PO-261001-9001",
  ownerState: "primary",
  normalOwner: null,
  ...over,
  source: {
    object: { kind: "purchase_order", id: "PO-261001-9001", label: "PO-261001-9001" },
    timing: { missedAge: { state: "counted", workingDays: 0 } },
    owner: { acting: { userId: "u1", name: "TEST · Staff A" } },
    ...source,
  },
} as unknown as WorkRow);
const waiting = { state: "waiting", waitingSince: "2026-10-02T03:00:00.000Z", replyDueOn: "2026-10-06", replyMissed: false, channel: "whatsapp", contactKind: "supplier", contactId: null, lastReplyAt: null };

describe("the head of an opened task", () => {
  it("is the card's own title, the page, the record and who does it now", () => {
    const task = row({ id: "a" });
    expect(taskHead(task, taskCard(task))).toEqual({
      title: "Ask TEST Supplier A when the goods will arrive", moduleIcon: "shopping_cart", page: "Purchasing",
      record: "PO-261001-9001", owner: "TEST · Staff A", destination: "/operation/procurement?po=PO-261001-9001",
    });
  });
  it("a purchase batch has no record: it is named by its time", () => {
    const batch = row({ id: "b", line: "Issue the POs by 11:00 AM" }, { object: { kind: "po_window", id: "2026-10-05T11:00", label: "11:00 AM PO window" } });
    expect(taskHead(batch, taskCard(batch))).toMatchObject({ page: "SO Batch Purchase", record: null });
  });
  it("nobody assigned: no owner", () => {
    const task = row({ id: "c" }, { owner: { acting: null } });
    expect(taskHead(task, taskCard(task)).owner).toBeNull();
  });
});

describe("the fact rows of an opened task", () => {
  it("are the card's rows without the record, then the contact, then the module's own", () => {
    const task = row({ id: "a", dueIso: "2026-09-29", timingBucket: "overdue" }, { timing: { missedAge: { state: "counted", workingDays: 4 } } });
    const facts = taskFacts(task, taskCard(task), [{ key: "po-date", icon: "local_shipping", label: "PO Delivery Date", value: "Tue, 29 Sep" }]);
    expect(facts.map((fact) => [fact.label, fact.value, Boolean(fact.warn)])).toEqual([
      ["Deadline", "Tue, 29 Sep · 4 days late", true],
      ["Contact", "TEST Supplier A", false],
      ["PO Delivery Date", "Tue, 29 Sep", false],
    ]);
  });
  it("the contact carries the channel once a request was recorded, before the waiting facts", () => {
    const task = row({ id: "w" }, { lifecycle: waiting });
    expect(taskFacts(task, taskCard(task)).map((fact) => [fact.label, fact.value])).toEqual([
      ["Deadline", "Mon, 5 Oct"], ["Contact", "TEST Supplier A · WhatsApp"], ["Asked", "Fri, 2 Oct"], ["Next contact", "Tue, 6 Oct"],
    ]);
  });
  it("a purchase batch keeps its cut-off and adds no contact: its title names the suppliers", () => {
    const batch = row({ id: "b", recipient: "2 suppliers" }, { object: { kind: "po_window", id: "2026-10-05T11:00", label: "11:00 AM PO window" } });
    expect(taskFacts(batch, taskCard(batch)).map((fact) => fact.label)).toEqual(["Cut-off"]);
  });
  it("a module that names its own contact is not given a second one", () => {
    const task = row({ id: "a" });
    expect(taskFacts(task, taskCard(task), [{ key: "contact", icon: "forum", label: "Contact", value: "TEST group" }]).filter((fact) => fact.label === "Contact")).toHaveLength(1);
  });
});

describe("History", () => {
  it("the Work record gives the request and its answer day", () => {
    expect(lifecycleHistory(row({ id: "w" }, { lifecycle: waiting }))).toEqual([
      { key: "asked", at: "2026-10-02T03:00:00.000Z", text: "Asked TEST Supplier A", detail: "WhatsApp · Next contact Tue, 6 Oct" },
    ]);
  });
  it("an answer day that passed with no answer is said, and so is a recorded answer", () => {
    const missed = row({ id: "m" }, { lifecycle: { ...waiting, state: "to_do", replyMissed: true, lastReplyAt: null } });
    expect(lifecycleHistory(missed).map((event) => [event.text, event.detail])).toEqual([
      ["Asked TEST Supplier A", "WhatsApp"], ["No answer", "No answer by Tue, 6 Oct"],
    ]);
    const answered = row({ id: "r" }, { lifecycle: { ...waiting, state: "to_do", waitingSince: null, lastReplyAt: "2026-10-03T02:00:00.000Z" } });
    expect(lifecycleHistory(answered).map((event) => event.text)).toEqual(["Answer recorded"]);
  });
  it("a task nobody has asked about has no history of its own", () => {
    expect(lifecycleHistory(row({ id: "a" }))).toEqual([]);
  });
  it("is newest first, and an instant prints its time while a date prints alone", () => {
    expect(sortHistory([{ key: "a", at: "2026-10-01T02:00:00.000Z", text: "a" }, { key: "c", at: "2026-10-06", text: "c" }, { key: "b", at: "2026-10-03T02:00:00.000Z", text: "b" }]).map((event) => event.key))
      .toEqual(["c", "b", "a"]);
    expect(historyWhen("2026-10-06")).toBe("Tue, 6 Oct");
    expect(historyWhen("2026-10-03T02:14:00.000Z")).toBe("Sat, 3 Oct 10:14");
  });
});

describe("Files", () => {
  it("the tab counts the files and says nothing when there are none", () => {
    const file = { key: "f", name: "SO-9101.pdf", detail: "Sales Order", load: async () => new Blob() };
    expect(fileCount([{ key: "so", title: "Sales Order", files: [file, { ...file, key: "g" }] }, { key: "po", title: "Purchase Order", files: [] }])).toBe(2);
    expect(W.filesTab(2)).toBe("Files 2");
    expect(W.filesTab(0)).toBe("Files");
  });
});
