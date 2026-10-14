import { describe, expect, it } from "vitest";
import {
  INTERNAL_TASK_KIND,
  INTERNAL_TASK_RULE,
  internalTaskAddSchema,
  internalTaskCreatorOf,
  internalTaskIdOf,
  internalTaskOccurrenceId,
  internalTaskProblem,
  internalTaskResultReference,
  projectInternalTaskWork,
  type InternalTaskOpen,
} from "./internal-task";
import { operationWorkItemSchema, parseWorkOccurrenceId } from "./operation-work";

const A = { userId: "00000000-0000-4000-8000-0000000000a1", name: "TEST · Staff A" };
const B = { userId: "00000000-0000-4000-8000-0000000000b2", name: "TEST · Staff B" };
const task = (over: Partial<InternalTaskOpen> = {}): InternalTaskOpen => ({
  id: "00000000-0000-4000-8000-0000000000c1",
  title: "TEST · Get the new product photographs",
  dueOn: "2026-10-14",
  createdAt: "2026-10-13T02:00:00.000Z",
  createdBy: A,
  assignedTo: B,
  ...over,
});
const project = (tasks: InternalTaskOpen[], today = "2026-10-14") =>
  projectInternalTaskWork({ tasks, today, observedAt: "2026-10-14T01:00:00.000Z" });

describe("an internal task as a Work item (Workspace MASTER, Jess 2026-10-14)", () => {
  it("is one Work occurrence of the workspace module, owned by the person it was given to", () => {
    const [item] = project([task()]);
    expect(operationWorkItemSchema.safeParse(item).success).toBe(true);
    expect(item).toMatchObject({
      id: "workspace:00000000-0000-4000-8000-0000000000c1:internal_task",
      module: "workspace",
      ruleKey: INTERNAL_TASK_RULE,
      object: { kind: INTERNAL_TASK_KIND, id: task().id, label: "TEST · Get the new product photographs" },
      problem: "Added by TEST · Staff A",
      owner: { normal: B, acting: B, state: "primary", dutyKey: null },
      timing: { actionOn: "2026-10-14", placement: "on_day" },
    });
    expect(parseWorkOccurrenceId(item!.id)).toMatchObject({ module: "workspace", ruleKey: INTERNAL_TASK_RULE });
  });

  it("names no party, so nothing is asked of anyone outside and no request is recorded for it", () => {
    const [item] = project([task()]);
    expect(item!.recipient).toBeNull();
    expect(item!.communication).toBeNull();
  });

  it("opens on the Workspace page and nowhere in another module", () => {
    const [item] = project([task()]);
    expect(item!.destination).toBe(`/operation?tab=work&task=${encodeURIComponent(internalTaskOccurrenceId(task().id))}`);
    expect(item!.interaction).toEqual({ mode: "open_module", fallbackDestination: item!.destination });
    expect(item!.completionPredicate).toBe("The internal task is marked done");
  });

  it("is late once its day has gone by, and keeps its date", () => {
    const [item] = project([task({ dueOn: "2026-10-13" })]);
    expect(item!.timing).toMatchObject({ actionOn: "2026-10-13", placement: "missed" });
    expect(item!.tone).toBe("warning");
  });

  it("takes any name its creator typed: a short one, and one with the middle dot", () => {
    /* The action sentence refuses `X · Y` and needs four characters; the name is the object's label instead. */
    for (const title of ["Go", "Ohana · photographs", "A"]) {
      const [item] = project([task({ title })]);
      expect(item!.object.label).toBe(title);
      expect(item!.action).toBe("Do this task");
    }
  });

  it("says who added it in one place, and reads it back from the same place", () => {
    expect(internalTaskCreatorOf(internalTaskProblem("TEST · Staff A"))).toBe("TEST · Staff A");
    expect(internalTaskCreatorOf("Supplier delivery date passed")).toBeNull();
    expect(internalTaskCreatorOf("Added by ")).toBeNull();
  });

  it("knows its own occurrences from another module's", () => {
    const [item] = project([task()]);
    expect(internalTaskIdOf(item!)).toBe(task().id);
    expect(internalTaskIdOf({ module: "purchasing", ruleKey: "purchasing.supplier_reply", object: { kind: "purchase_order", id: "PO-1", label: "PO-1" } })).toBeNull();
    expect(internalTaskResultReference(task().id)).toBe(`internal_task_done=${task().id}`);
  });
});

describe("what `New task` may send", () => {
  const body = { title: "  TEST · Call the supplier  ", detail: null, assignedTo: B.userId, dueOn: "2026-10-14", idempotencyKey: "attempt-0001" };

  it("trims the name and accepts no field the dialog does not have", () => {
    expect(internalTaskAddSchema.parse(body).title).toBe("TEST · Call the supplier");
    expect(internalTaskAddSchema.safeParse({ ...body, purchaseOrderId: "PO-1" }).success).toBe(false);
    expect(internalTaskAddSchema.safeParse({ ...body, approve: true }).success).toBe(false);
  });

  it("refuses a missing name, a name past 160 characters, a person who is not an id and a date that is not one", () => {
    expect(internalTaskAddSchema.safeParse({ ...body, title: "   " }).success).toBe(false);
    expect(internalTaskAddSchema.safeParse({ ...body, title: "x".repeat(161) }).success).toBe(false);
    expect(internalTaskAddSchema.safeParse({ ...body, assignedTo: "TEST · Staff B" }).success).toBe(false);
    expect(internalTaskAddSchema.safeParse({ ...body, dueOn: "tomorrow" }).success).toBe(false);
  });
});
