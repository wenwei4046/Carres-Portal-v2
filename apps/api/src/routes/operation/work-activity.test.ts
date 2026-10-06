import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../../types";
vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";
import router from "./work-activity";
const rpc = vi.fn();
const single = vi.fn();
function app(role = "operation") {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => { c.set("auth", { role, jwt: "test", id: "self" } as never); await next(); });
  a.route("/activity", router); return a;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(userClient).mockReturnValue({ rpc, from: () => ({ select: () => ({ eq: () => ({ single }) }) }) } as never);
  single.mockResolvedValue({ data: { morning: "10:30:00", afternoon: "15:00:00", revision: 1 }, error: null });
  rpc.mockResolvedValue({ data: false, error: null });
});
describe("two-period activity API", () => {
  it("reads persisted values and the real manager gate", async () => {
    const res = await app().request("/activity/settings");
    expect(await res.json()).toEqual({ morning: "10:30", afternoon: "15:00", revision: 1, canEdit: false });
  });
  it("does not invent defaults for a missing row", async () => {
    single.mockResolvedValue({ data: null, error: null });
    expect((await app().request("/activity/settings")).status).toBe(503);
  });
  it("surfaces a gate read failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "unavailable" } });
    expect((await app().request("/activity/settings")).ok).toBe(false);
  });
  it("rejects a cutoff during flexible arrival or lunch before the writer", async () => {
    const res = await app().request("/activity/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ morning: "10:00", afternoon: "13:30", revision: 1 }) });
    expect(res.ok).toBe(false); expect(rpc).not.toHaveBeenCalled();
  });
  it("passes a revision to the audited manager-only SQL door", async () => {
    rpc.mockResolvedValue({ data: { morning: "10:45:00", afternoon: "15:30:00", revision: 2 }, error: null });
    const res = await app().request("/activity/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ morning: "10:45", afternoon: "15:30", revision: 1 }) });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("workspace_set_activity_times", { p_morning: "10:45", p_afternoon: "15:30", p_revision: 1 });
  });
  it("preserves a concurrent settings conflict", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "40001", details: "settings_changed" } });
    const res = await app().request("/activity/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ morning: "10:45", afternoon: "15:30", revision: 1 }) });
    expect(res.status).toBe(409);
  });
  it("never forwards caller-supplied identity or time", async () => {
    const res = await app().request("/activity", { method: "POST", body: JSON.stringify({ user_id: "someone-else", observed_at: "2026-09-29T06:15:00Z" }) });
    expect(res.status).toBe(200); expect(rpc).toHaveBeenCalledWith("workspace_record_activity");
  });
  it("refuses an unrelated role before any database access", async () => {
    expect((await app("dealer").request("/activity", { method: "POST" })).status).toBe(403);
    expect(userClient).not.toHaveBeenCalled();
  });
});
