import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { adminClient, userClient } from "../../lib/supabase";
import { createInternalTasksRouter } from "./internal-tasks";
import type { CompletedWrite } from "../../lib/work-completion";

/**
 * INTERNAL TASKS (Workspace MASTER "Employee-created internal tasks", Jess
 * 2026-10-14; 0694). The router is thin: the rules live in the SQL doors.
 * These tests pin the wire: who may call, what each door is given, what the
 * Work ledger is told when a task is done, and what the router never does.
 */
const TASK = "00000000-0000-4000-8000-0000000000c1";
const ME = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";

function setup(role: string, rpcResults: Record<string, { data?: unknown; error?: unknown }> = {}, ledger?: (write: CompletedWrite) => Promise<void>) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc = vi.fn().mockImplementation((fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcResults[fn] ?? { data: null, error: null });
  });
  vi.mocked(userClient).mockReturnValue({ rpc } as never);
  const completions: CompletedWrite[] = [];
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", { id: ME, email: "staff@carres.test", role, dealerId: null, supplierId: null, partnerId: null, outletId: null, warehouseId: null, jwt: "jwt" } as never);
    await next();
  });
  app.route("/t", createInternalTasksRouter(async (_c, write) => { completions.push(write); if (ledger) await ledger(write); }));
  return { app, rpcCalls, completions };
}

const post = (app: Hono<AppEnv>, path: string, body?: unknown) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const add = { title: "TEST · Get the new product photographs", detail: null, assignedTo: OTHER, dueOn: "2026-10-14", idempotencyKey: "attempt-0001" };
const doneRow = { id: TASK, title: add.title, dueOn: "2026-10-14", doneAt: "2026-10-14T03:04:05.123456+00:00", doneBy: ME, recorded: true };

beforeEach(() => { vi.mocked(userClient).mockReset(); vi.mocked(adminClient).mockReset(); });

describe("POST /internal-tasks · New task", () => {
  it("adds the task through its one door, as the signed-in person, and answers with its Work identity", async () => {
    const { app, rpcCalls } = setup("operation", { internal_task_add: { data: TASK, error: null } });
    const res = await post(app, "/t", add);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: TASK, occurrenceId: `workspace:${TASK}:internal_task` });
    expect(rpcCalls).toEqual([{ fn: "internal_task_add", args: { p_title: add.title, p_detail: null, p_assigned_to: OTHER, p_due_on: "2026-10-14", p_request_key: "attempt-0001" } }]);
    /* The caller's own client: the door reads the creator from the session, never from the body. */
    expect(vi.mocked(userClient).mock.calls[0]?.[1]).toBe("jwt");
    expect(vi.mocked(adminClient)).not.toHaveBeenCalled();
  });

  it("admits Operation and Principal, and nobody else", async () => {
    for (const role of ["operation", "principal"]) {
      const { app } = setup(role, { internal_task_add: { data: TASK, error: null } });
      expect((await post(app, "/t", add)).status).toBe(201);
    }
    for (const role of ["dealer", "supplier", "partner", "warehouse", "finance", "salesperson"]) {
      const { app, rpcCalls } = setup(role);
      const res = await post(app, "/t", add);
      expect(res.status).toBe(403);
      expect(rpcCalls).toEqual([]);
    }
  });

  it("refuses a body the dialog cannot send before the door is reached", async () => {
    for (const body of [{ ...add, title: "  " }, { ...add, dueOn: "next week" }, { ...add, assignedTo: "Sara" }, { ...add, createdBy: OTHER }, { ...add, purchaseOrderId: "PO-1" }]) {
      const { app, rpcCalls } = setup("operation");
      expect((await post(app, "/t", body)).status).toBe(422);
      expect(rpcCalls).toEqual([]);
    }
  });

  it("says the door's own refusal with its code, so the dialog can put it under the right field", async () => {
    const { app } = setup("operation", { internal_task_add: { data: null, error: { code: "22023", message: "due date is not an Office working day", details: "due_not_working_day" } } });
    const res = await post(app, "/t", { ...add, dueOn: "2026-10-17" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "due_not_working_day" });
  });
});

describe("POST /internal-tasks/:id/done · Mark done", () => {
  it("marks this task done and tells the Work ledger once: who, when, on which Work date, under the task's name", async () => {
    const { app, rpcCalls, completions } = setup("operation", { internal_task_mark_done: { data: doneRow, error: null } });
    const res = await post(app, `/t/${TASK}/done`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: TASK, occurrenceId: `workspace:${TASK}:internal_task`, doneAt: doneRow.doneAt, completionRecorded: true });
    expect(rpcCalls).toEqual([{ fn: "internal_task_mark_done", args: { p_task_id: TASK } }]);
    expect(completions).toEqual([{
      occurrenceId: `workspace:${TASK}:internal_task`,
      actorId: ME,
      at: doneRow.doneAt,
      actionOn: "2026-10-14",
      objectLabel: add.title,
      resultReference: `internal_task_done=${TASK}`,
      sourceVersion: `internal_task:${TASK}:done`,
      idempotencyKey: `completed:workspace:${TASK}:internal_task`,
    }]);
  });

  it("writes nothing but the task and its Work completion: no other module's door is called", async () => {
    const { app, rpcCalls } = setup("operation", { internal_task_mark_done: { data: doneRow, error: null } });
    await post(app, `/t/${TASK}/done`);
    expect(rpcCalls.map((call) => call.fn)).toEqual(["internal_task_mark_done"]);
  });

  it("a second press records the first person again under the same key, never a second completion", async () => {
    /* The door answers with who really finished it; the ledger key is one per occurrence. */
    const { app, completions } = setup("operation", { internal_task_mark_done: { data: { ...doneRow, doneBy: OTHER, recorded: false }, error: null } });
    await post(app, `/t/${TASK}/done`);
    expect(completions[0]).toMatchObject({ actorId: OTHER, idempotencyKey: `completed:workspace:${TASK}:internal_task` });
  });

  it("keeps the task done when the ledger cannot be written, and says so", async () => {
    const { app } = setup("operation", { internal_task_mark_done: { data: doneRow, error: null } }, async () => { throw new Error("ledger down"); });
    const res = await post(app, `/t/${TASK}/done`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: TASK, completionRecorded: false });
  });

  it("answers not found for an id that is not a task id, without asking the database", async () => {
    const { app, rpcCalls } = setup("operation");
    expect((await post(app, "/t/PO-2053/done")).status).toBe(404);
    expect(rpcCalls).toEqual([]);
  });

  it("refuses a role outside Operation and Principal", async () => {
    const { app, rpcCalls, completions } = setup("supplier");
    expect((await post(app, `/t/${TASK}/done`)).status).toBe(403);
    expect(rpcCalls).toEqual([]);
    expect(completions).toEqual([]);
  });
});

describe("GET /internal-tasks/:id", () => {
  it("returns the task with its history as the door gives it", async () => {
    const person = (userId: string, name: string) => ({ userId, name });
    const task = {
      id: TASK, title: add.title, detail: "TEST data.", dueOn: "2026-10-14", createdAt: "2026-10-13T02:00:00+00:00",
      createdBy: person(ME, "TEST · Staff A"), assignedTo: person(OTHER, "TEST · Staff B"), doneAt: null, doneBy: null,
      events: [{ event: "added", at: "2026-10-13T02:00:00+00:00", actor: person(ME, "TEST · Staff A") }],
    };
    const { app, rpcCalls } = setup("principal", { internal_task_read: { data: task, error: null } });
    const res = await app.request(`/t/${TASK}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(task);
    expect(rpcCalls).toEqual([{ fn: "internal_task_read", args: { p_task_id: TASK } }]);
  });
});
