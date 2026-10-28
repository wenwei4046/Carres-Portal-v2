import { describe, expect, it } from "vitest";
import type { InternalTask, OperationWorkCompleted } from "@carres/shared";
import type { WorkRow } from "../use-open-work";
import {
  INTERNAL_TASK_WORDS as W,
  internalTaskAddedWords,
  internalTaskHistory,
  internalTaskIdOfRow,
  internalTaskPeople,
  internalTaskRefusal,
  internalTaskRefusalField,
  isInternalTask,
} from "./internal-task";
import { doneCard, taskCard } from "./task-cards";
import { taskFacts, taskHead } from "./task-view";
import { TASK_MODULE_WORD, taskRowWords } from "./tasks-model";
import { workspaceTable } from "./workspace-table";

/**
 * Internal tasks: `+ Task` (Workspace MASTER "Employee-created internal
 * tasks", Jess 2026-10-14). Every person and task below is TEST data.
 * 2026-10-14 is a Wednesday.
 */
const TODAY = "2026-10-14";
const ME = "00000000-0000-4000-8000-0000000000aa";
const B = "00000000-0000-4000-8000-0000000000b2";
const TASK = "00000000-0000-4000-8000-0000000000c1";
const task = (over: Partial<WorkRow> = {}, source: Record<string, unknown> = {}): WorkRow => ({
  id: `workspace:${TASK}:internal_task`, module: "workspace", ruleKey: "internal_task",
  dueIso: TODAY, timingBucket: "today", line: "Do this task", problem: "Added by TEST · Staff B", recipient: null,
  ownerId: ME, ownerState: "primary", normalOwner: null, destination: "/operation?tab=work",
  ...over,
  source: {
    module: "workspace", ruleKey: "internal_task",
    object: { kind: "internal_task", id: TASK, label: "TEST · Get the new product photographs" },
    owner: { acting: { userId: ME, name: "TEST · Staff A" } },
    timing: { missedAge: { state: "not_calculable", workingDays: null } },
    broken: false,
    ...source,
  },
} as unknown as WorkRow);
const po = (): WorkRow => ({
  id: "purchasing:PO-1:purchasing.supplier_date_passed", module: "purchasing", ruleKey: "purchasing.supplier_date_passed",
  dueIso: TODAY, timingBucket: "today", line: "Ask TEST Supplier A when the goods will arrive", problem: "Supplier delivery date passed", recipient: "TEST Supplier A",
  ownerId: ME, ownerState: "primary", normalOwner: null,
  source: { module: "purchasing", ruleKey: "purchasing.supplier_date_passed", object: { kind: "purchase_order", id: "PO-1", label: "PO-261001-9001" }, owner: { acting: { userId: ME, name: "TEST · Staff A" } }, timing: { missedAge: { state: "counted", workingDays: 0 } }, broken: false },
} as unknown as WorkRow);

describe("an internal task in the list", () => {
  it("is named by what its creator typed, with who added it under the name", () => {
    expect(taskRowWords(task())).toMatchObject({ act: "TEST · Get the new product photographs", detail: "Added by TEST · Staff B" });
    const card = taskCard(task());
    expect(card.title).toBe("TEST · Get the new product photographs");
    expect(card.party).toBe("Staff tasks");
    expect(card.rows.map((row) => [row.label, row.value])).toEqual([["Deadline", "Wed, 14 Oct"], ["Added by", "TEST · Staff B"]]);
  });

  it("has no record row: the name is the task, and no other module's document stands behind it", () => {
    expect(taskCard(task()).rows.some((row) => row.label === "PO No" || row.label === "SO No" || row.label === TASK_MODULE_WORD.workspace)).toBe(false);
    /* Another module's card keeps its record. */
    expect(taskCard(po()).rows[0]).toMatchObject({ label: "PO No", value: "PO-261001-9001" });
    expect(taskCard(po()).rows.some((row) => row.label === "Added by")).toBe(false);
  });

  it("keeps its date and turns amber once the day has gone by", () => {
    const late = taskCard(task({ dueIso: "2026-10-13", timingBucket: "overdue" }));
    expect(late.late).toBe(true);
    expect(late.rows[0]).toMatchObject({ label: "Deadline", value: "Tue, 13 Oct · passed", warn: true });
  });

  it("finished, it keeps its name as the title and shows no record beside it", () => {
    const done: OperationWorkCompleted = {
      occurrenceId: `workspace:${TASK}:internal_task`, module: "workspace", ruleKey: "internal_task", actionOn: TODAY,
      objectLabel: "TEST · Get the new product photographs", completedAt: `${TODAY}T03:15:00.000Z`, completedBy: { userId: ME, name: "TEST · Staff A" }, resultReference: `internal_task_done=${TASK}`,
    };
    const card = doneCard(done);
    expect(card.title).toBe("TEST · Get the new product photographs");
    expect(card.party).toBe("Staff tasks");
    expect(card.rows.map((row) => row.label)).toEqual(["Done"]);
  });
});

describe("an internal task, opened", () => {
  it("heads with its page only: its name is the title, so no record is repeated or opened", () => {
    const row = task();
    const head = taskHead(row, taskCard(row));
    expect(head).toMatchObject({ title: "TEST · Get the new product photographs", page: "Staff tasks", record: null, owner: "TEST · Staff A" });
  });

  it("its facts are the deadline and who added it; no Contact, because nobody outside is asked", () => {
    const row = task();
    expect(taskFacts(row, taskCard(row)).map((fact) => fact.label)).toEqual(["Deadline", "Added by"]);
  });

  it("is told apart from another module's task by its kind, never by its words", () => {
    expect(isInternalTask(task())).toBe(true);
    expect(internalTaskIdOfRow(task())).toBe(TASK);
    expect(isInternalTask(po())).toBe(false);
    expect(internalTaskIdOfRow(po())).toBeNull();
  });
});

describe("an internal task on the Workspace page", () => {
  const table = (rows: WorkRow[], team = false) => workspaceTable({ scoped: rows, completed: [], doneBy: null, team, today: TODAY, chosen: TODAY, tab: "todo", module: null, factsOf: () => null });

  it("is one row of the Staff tasks module, named by its title over who added it", () => {
    const out = table([task(), po()]);
    const row = out.rows.find((r) => r.module === "workspace")!;
    expect(row).toMatchObject({ title: "TEST · Get the new product photographs", record: "Staff tasks · Added by TEST · Staff B", contact: null, status: "To do" });
    expect(out.modules.find((m) => m.module === "workspace")).toEqual({ module: "workspace", count: 1 });
    /* The Module rows still sum to the tab. */
    expect(out.modules.reduce((sum, m) => sum + m.count, 0)).toBe(out.counts.todo);
  });
});

describe("the people `For` offers", () => {
  const staff = [
    { user_id: B, name: "TEST · Staff B", email: "b@carres.local" },
    { user_id: ME, name: "TEST · Staff A", email: "a@carres.local" },
    { user_id: "00000000-0000-4000-8000-0000000000d4", name: null, email: "shared@carres.local" },
    { user_id: "00000000-0000-4000-8000-0000000000e5", name: "TEST · Staff A2", email: "a2@carres.local" },
  ];

  it("puts the signed-in person first as Me, then the others by name; an account with no name shows its email", () => {
    expect(internalTaskPeople(staff, ME).map((person) => person.label)).toEqual(["Me", "shared@carres.local", "TEST · Staff A2", "TEST · Staff B"]);
    expect(internalTaskPeople(staff, ME)[0]).toEqual({ value: ME, label: "Me" });
  });

  it("offers a Principal who is not in the Operation list their own name as Me", () => {
    const boss = "00000000-0000-4000-8000-0000000000f6";
    expect(internalTaskPeople(staff, boss)[0]).toEqual({ value: boss, label: "Me" });
    expect(internalTaskPeople(staff, boss)).toHaveLength(5);
  });
});

describe("what the screen says", () => {
  it("after adding: for the colleague by name, or `for you`", () => {
    const people = internalTaskPeople([{ user_id: B, name: "TEST · Staff B", email: "b@carres.local" }], ME);
    expect(internalTaskAddedWords(people.find((p) => p.value === B), ME)).toBe("Task added · for TEST · Staff B");
    expect(internalTaskAddedWords(people.find((p) => p.value === ME), ME)).toBe("Task added · for you");
  });

  it("a refusal in the screen's own words, under the field it is about; an unknown one keeps the door's sentence", () => {
    expect(internalTaskRefusal("due_not_working_day", "x")).toBe("This is not an Office working day. Choose a working day.");
    expect(internalTaskRefusalField("due_not_working_day")).toBe("due");
    expect(internalTaskRefusal("due_in_past", "x")).toBe("This date has passed. Choose today or a later day.");
    expect(internalTaskRefusalField("title_required")).toBe("name");
    expect(internalTaskRefusalField("assignee_not_staff")).toBe("assignee");
    expect(internalTaskRefusal("something_new", "The door's own sentence")).toBe("The door's own sentence");
    expect(internalTaskRefusalField("something_new")).toBeNull();
  });

  it("the history: who added it for whom, then who finished it", () => {
    const person = (userId: string, name: string) => ({ userId, name });
    const record: InternalTask = {
      id: TASK, title: "TEST · Get the new product photographs", detail: null, dueOn: TODAY, createdAt: `${TODAY}T01:20:00.000Z`,
      createdBy: person(B, "TEST · Staff B"), assignedTo: person(ME, "TEST · Staff A"), doneAt: `${TODAY}T05:00:00.000Z`, doneBy: person("00000000-0000-4000-8000-0000000000e5", "TEST · Staff A2"),
      events: [
        { event: "added", at: `${TODAY}T01:20:00.000Z`, actor: person(B, "TEST · Staff B") },
        { event: "done", at: `${TODAY}T05:00:00.000Z`, actor: person("00000000-0000-4000-8000-0000000000e5", "TEST · Staff A2") },
      ],
    };
    expect(internalTaskHistory(record).map((event) => event.text)).toEqual(["Added by TEST · Staff B · for TEST · Staff A", "Done by TEST · Staff A2"]);
  });

  it("no word here is a dash, and the button says what it does", () => {
    const words = Object.values(W).map((word) => (typeof word === "function" ? (word as (...a: string[]) => string)("x", "y") : word));
    for (const word of words) expect(word).not.toMatch(/[—–]/);
    expect(W.markDone).toBe("Mark done");
    expect(W.add).toBe("Add task");
  });
});
