import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../../types";
vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";
import router from "./saturday-on-call";

/** 0671 — Saturday on-call: a Staff & Duties section, never a Duty. */
const A = "eeeeeeee-0000-4000-8000-00000000000a";
const B = "eeeeeeee-0000-4000-8000-00000000000b";
const rpc = vi.fn();
function app(role = "operation") {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => { c.set("auth", { role, jwt: "test", id: A } as never); await next(); });
  a.route("/sat", router);
  return a;
}
const put = (path: string, body: unknown) =>
  app().request(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(userClient).mockReturnValue({ rpc } as never);
});

describe("Saturday on-call API", () => {
  it("reads the window, the next Saturdays with their leave flags and the edit fact", async () => {
    rpc.mockResolvedValue({ data: {
      window: { starts_at: "09:00", ends_at: "18:00", revision: 1 }, can_edit: false, people: [],
      saturdays: [{ saturday: "2026-10-10", person_id: A, person_name: "Shasha", person_on_leave: true,
        cover_person_id: null, cover_name: null, cover_on_leave: false, note: null }],
    }, error: null });
    const res = await app().request("/sat");
    expect(await res.json()).toEqual({
      window: { startsAt: "09:00", endsAt: "18:00", revision: 1 }, canEdit: false, people: [],
      saturdays: [{ saturday: "2026-10-10", personId: A, personName: "Shasha", personOnLeave: true,
        coverPersonId: null, coverName: null, coverOnLeave: false, note: null }],
    });
    expect(rpc).toHaveBeenCalledWith("workspace_saturday_on_call_read", { p_weeks: 6 });
  });

  it("saves the window through the editor-gated door and refuses an end before the start first", async () => {
    expect((await put("/sat/window", { startsAt: "18:00", endsAt: "09:00", revision: 1 })).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: { starts_at: "10:00:00", ends_at: "17:00:00", revision: 2 }, error: null });
    const res = await put("/sat/window", { startsAt: "10:00", endsAt: "17:00", revision: 1 });
    expect(await res.json()).toEqual({ startsAt: "10:00", endsAt: "17:00", revision: 2 });
    expect(rpc).toHaveBeenCalledWith("workspace_saturday_on_call_save_window", { p_starts_at: "10:00", p_ends_at: "17:00", p_revision: 1 });
  });

  it("names a person and cover for a Saturday only", async () => {
    expect((await put("/sat/2026-10-09", { personId: A })).status).toBe(422);
    expect((await put("/sat/2026-10-10", { personId: A, coverPersonId: A })).status).toBe(422);
    rpc.mockResolvedValue({ data: { id: "x" }, error: null });
    expect((await put("/sat/2026-10-10", { personId: A, coverPersonId: B })).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("workspace_saturday_on_call_set", {
      p_saturday: "2026-10-10", p_person_id: A, p_cover_person_id: B, p_note: null,
    });
  });

  it("returns a refusal as its code: a non-editor and a stale window", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", details: "not_settings_editor", message: "only Jess" } });
    const res = await put("/sat/2026-10-10", { personId: A });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_settings_editor", code: "not_settings_editor", message: "not_settings_editor" });
    rpc.mockResolvedValue({ data: null, error: { code: "40001", details: "settings_changed" } });
    expect((await put("/sat/window", { startsAt: "09:00", endsAt: "18:00", revision: 1 })).status).toBe(409);
  });

  it("keeps outside roles out before any database access", async () => {
    expect((await app("dealer").request("/sat")).status).toBe(403);
    expect(userClient).not.toHaveBeenCalled();
  });
});
