import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { operationReturnReceiptCompleted } from "./repair-order-work";
import { userClient } from "./supabase";
vi.mock("./supabase", () => ({ userClient: vi.fn() }));

const since = "2026-10-05T01:00:00Z";
async function run(kind = "valid") {
  const receipt = { id: "receipt", arrival_source_id: "source", posted_by: "actor", status: "posted",
    grn_no: "GRN-1", posted_at: "2026-10-05T01:00:01Z" };
  const event = { id: "event", receipt_id: "receipt", event: "posted", actor_id: "actor",
    "payload->>repair_return_completed_ro": "ro" };
  if (kind === "other-actor") receipt.posted_by = "other";
  if (kind === "other-source") receipt.arrival_source_id = "other";
  if (kind === "old-retry") receipt.posted_at = "2026-10-04T01:00:00Z";
  if (kind === "unknown-time") receipt.posted_at = "unknown";
  if (kind === "no-grn") receipt.grn_no = "";
  if (kind === "other-final-receipt") event.receipt_id = "other";
  if (kind === "other-ro") event["payload->>repair_return_completed_ro"] = "other";
  if (kind === "other-event-actor") event.actor_id = "other";
  const from = vi.fn((table: string) => {
    let rows: Record<string, string>[] = table === "warehouse_receipts" ? [receipt] : kind === "no-marker" ? [] : [event];
    const query = {
      select: () => query, limit: () => query,
      eq: (key: string, value: string) => { rows = rows.filter(row => row[key] === value); return query; },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: kind === "read-error" ? { message: "unavailable" } : null }),
    };
    return query;
  });
  vi.mocked(userClient).mockReturnValue({ from } as never);
  const app = new Hono<AppEnv>();
  app.get("/", async c => {
    c.set("auth", { id: "actor", role: "operation", jwt: "operation-jwt" } as never);
    c.res = kind === "invalid-response" ? new Response("unknown") : c.json({ id: "receipt", status: kind === "blocked" ? "draft" : "posted" });
    try { return c.json({ completed: await operationReturnReceiptCompleted(c, "ro", "source", since) }); }
    catch { return c.json({ unknown: true }); }
  });
  return { body: await (await app.request("/", {}, {} as AppEnv["Bindings"])).json(), from };
}
describe("Operation arrival completion causality", () => {
  it("accepts this actor's newly posted final receipt through caller RLS", async () => {
    expect((await run()).body).toEqual({ completed: true });
    expect(userClient).toHaveBeenCalledWith(expect.anything(), "operation-jwt");
  });
  it.each(["other-actor", "other-source", "old-retry", "unknown-time", "no-grn", "other-final-receipt", "other-ro", "other-event-actor", "no-marker", "blocked", "invalid-response"])
    ("refuses %s as completion by this receipt", async kind => {
      expect((await run(kind)).body).toEqual({ completed: false });
    });
  it("read failure remains unknown", async () => {
    expect((await run("read-error")).body).toEqual({ unknown: true });
  });
});
