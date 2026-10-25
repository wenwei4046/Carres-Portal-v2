import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import type { OperationWorkItem } from "@carres/shared";
import type { CompletedWrite } from "./work-completion";
import { receivingPostedWorkCompletion } from "./receiving-work-completion";

const h = vi.hoisted(() => ({ status: "submitted", grn: "GRN-20261019-1111" as string | null,
  actor: "operator", event: true, unavailable: false }));
vi.mock("../routes/operation/work", () => ({
  probeReceivingWork: async () => h.status === "submitted" ? [{
    id: "receiving:receipt-1:receiving.check_in", ruleKey: "receiving.check_in",
    object: { id: "receipt-1", label: "PO-1" }, timing: { actionOn: "2026-10-19" }, sourceVersion: "v1",
  } as OperationWorkItem] : [],
}));
vi.mock("./supabase", () => ({ userClient: () => ({ from: (table: string) => {
  const result = () => h.unavailable ? { data: null, error: { message: "unavailable" } }
    : { data: table === "warehouse_receipts" ? { id: "receipt-1", status: h.status, grn_no: h.grn, posted_by: h.actor }
      : h.event ? [{ id: "posted-event" }] : [], error: null };
  const builder = { select: () => builder, eq: () => builder, gte: () => builder, order: () => builder,
    limit: () => Promise.resolve(result()), maybeSingle: () => Promise.resolve(result()) };
  return builder;
} }) }));

function app(nextStatus = "posted", responseStatus: 200 | 409 = 200) {
  const writes: CompletedWrite[] = [];
  const server = new Hono<AppEnv>();
  server.use("*", async (c, next) => { c.set("auth", { id: "operator", jwt: "jwt", role: "operation" } as never); await next(); });
  server.post("/receipts/:id/check-in", receivingPostedWorkCompletion(() => ({
    now: () => "2026-10-19T12:00:00Z", log: () => {}, recordCompleted: async (_c, write) => { writes.push(write); },
  })), c => { if (responseStatus === 200) h.status = nextStatus; return c.json({ receipt_id: "receipt-1" }, responseStatus); });
  return { server, writes };
}

beforeEach(() => { Object.assign(h, { status: "submitted", grn: "GRN-20261019-1111", actor: "operator", event: true, unavailable: false }); });
describe("Receiving completes only from its saved posting", () => {
  it("keeps the receipt, GRN, posted event, actor and original Work date on Done", async () => {
    const { server, writes } = app();
    expect((await server.request("/receipts/receipt-1/check-in", { method: "POST" })).status).toBe(200);
    expect(writes).toEqual([expect.objectContaining({ actorId: "operator", actionOn: "2026-10-19",
      resultReference: "warehouse_receipts=receipt-1;grn=GRN-20261019-1111;receiving_events=posted-event" })]);
  });
  it("a refused check-in leaves the task open", async () => {
    const { server, writes } = app("posted", 409); await server.request("/receipts/receipt-1/check-in", { method: "POST" });
    expect(h.status).toBe("submitted"); expect(writes).toEqual([]);
  });
  it.each(["returned", "voided"])("%s is not a completed receipt", async status => {
    const { server, writes } = app(status); await server.request("/receipts/receipt-1/check-in", { method: "POST" }); expect(writes).toEqual([]);
  });
  it.each(["number", "actor", "event", "read"])("missing %s proof records no guessed completion", async missing => {
    if (missing === "number") h.grn = null;
    if (missing === "actor") h.actor = "someone-else";
    if (missing === "event") h.event = false;
    if (missing === "read") h.unavailable = true;
    const { server, writes } = app(); await server.request("/receipts/receipt-1/check-in", { method: "POST" }); expect(writes).toEqual([]);
  });
  it("an already posted retry records no second completion", async () => {
    const { server, writes } = app();
    await server.request("/receipts/receipt-1/check-in", { method: "POST" });
    await server.request("/receipts/receipt-1/check-in", { method: "POST" });
    expect(writes).toHaveLength(1);
  });
});
