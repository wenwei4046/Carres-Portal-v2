import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../../types";
vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
/* The Settings editor gate (TEAM-02, 0668/0674) has its own tests in
 * settings-core.test.ts; here it answers like the database does while nobody
 * is named: the owner may edit, the route is otherwise unchanged. */
vi.mock("../../lib/settings-editor", () => ({
  canEditSettings: vi.fn(async (_env: unknown, _jwt: unknown, _section: unknown, role?: string | null) => role === "principal"),
  requireSettingsEditor: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));
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
    expect(await res.json()).toEqual({ morning: "10:30", afternoon: "15:00", revision: 1, canEdit: false,
      office: { start: "09:00", end: "18:00", lunchStart: "13:00", lunchEnd: "14:00" } });
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

describe("the check times follow the stored Office calendar (0676)", () => {
  const put = (body: unknown) => app().request("/activity/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  it("refuses a morning check before Office start before the writer", async () => {
    const res = await put({ morning: "08:59", afternoon: "15:00", revision: 1 });
    expect(res.status).toBe(422); expect(rpc).not.toHaveBeenCalled();
  });
  it("accepts a 9:30 morning check now that the floor is Office start, not a fixed 10:00", async () => {
    rpc.mockResolvedValue({ data: { morning: "09:30:00", afternoon: "15:00:00", revision: 2 }, error: null });
    const res = await put({ morning: "09:30", afternoon: "15:00", revision: 1 });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("workspace_set_activity_times", { p_morning: "09:30", p_afternoon: "15:00", p_revision: 1 });
  });
});

describe("Settings → Personal → Lunch time (0676)", () => {
  const view = { userId: "11111111-1111-4111-8111-111111111111", saved: "12:00", savedFits: true,
    lunchStart: "12:00", lunchEnd: "13:00", earliest: "12:00", latest: "14:00",
    officeLunchStart: "13:00", officeLunchEnd: "14:00", morningCheck: "10:00", afternoonCheck: "13:01", canEdit: true };
  const put = (body: unknown) => app().request("/activity/lunch", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  it("reads the signed-in person's lunch from the database's one arithmetic", async () => {
    rpc.mockResolvedValue({ data: view, error: null });
    const res = await app().request("/activity/lunch");
    expect(res.status).toBe(200); expect(await res.json()).toEqual(view);
    expect(rpc).toHaveBeenCalledWith("workspace_staff_lunch_view", { p_user: "self" });
  });
  it("saves your own lunch start, or empty for the Office lunch", async () => {
    rpc.mockResolvedValue({ data: view, error: null });
    expect((await put({ lunchStart: "12:00" })).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("workspace_set_staff_lunch", { p_user: "self", p_lunch_start: "12:00" });
    expect((await put({ lunchStart: null })).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("workspace_set_staff_lunch", { p_user: "self", p_lunch_start: null });
  });
  it("names another person only when asked; the database decides who may", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", details: "not_allowed", message: "only the person or a Staff & Duties editor sets a lunch time" } });
    const res = await put({ lunchStart: "12:30", userId: view.userId });
    expect(res.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith("workspace_set_staff_lunch", { p_user: view.userId, p_lunch_start: "12:30" });
  });
  it("passes the Office range refusal through with its tag", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "22023", details: "lunch_outside_range", message: "choose a lunch start inside the Office range" } });
    const res = await put({ lunchStart: "11:00" });
    expect(res.status).toBe(422); expect((await res.json()).code).toBe("lunch_outside_range");
  });
  it("refuses a malformed time before the database", async () => {
    expect((await put({ lunchStart: "noon" })).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not invent a lunch when the database answer is unreadable", async () => {
    rpc.mockResolvedValue({ data: { ...view, lunchEnd: null }, error: null });
    expect((await app().request("/activity/lunch")).status).toBe(503);
  });
});
