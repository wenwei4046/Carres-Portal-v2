import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../../types";
vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";
import router from "./leave";

/** 0670 — Workspace → Leave. The router is thin: every rule is the SQL door's,
 *  refusals travel as codes, and the proof path is built by the server inside
 *  the caller's own folder. */
const SELF = "eeeeeeee-0000-4000-8000-000000000001";
const PROOF = `${SELF}/eeeeeeee-0000-4000-8000-000000000002.pdf`;
const rpc = vi.fn();
const signUpload = vi.fn();
const signRead = vi.fn();
const rows = { data: [] as unknown[], error: null as unknown };
const policies = { data: [] as unknown[], error: null as unknown };
const eq = vi.fn();
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "order", "limit"]) c[k] = () => c;
  c.eq = (...args: unknown[]) => { eq(...args); return c; };
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}
function app(role = "operation") {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => { c.set("auth", { role, jwt: "test", id: SELF } as never); await next(); });
  a.route("/leave", router);
  return a;
}
const post = (path: string, body: unknown, role?: string) =>
  app(role).request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  rows.data = []; rows.error = null; policies.data = []; policies.error = null;
  vi.mocked(userClient).mockReturnValue({
    rpc,
    from: (t: string) => chain(t === "staff_leave" ? rows : policies),
    storage: { from: () => ({ createSignedUploadUrl: signUpload, createSignedUrl: signRead }) },
  } as never);
  rpc.mockResolvedValue({ data: true, error: null });
});

describe("Workspace → Leave API", () => {
  it("reads only my own leave, the three policies and whether I may submit", async () => {
    policies.data = [{ leave_type: "mc", approval_required: false, proof_required: true, reason_required: false }];
    rows.data = [{ id: "eeeeeeee-0000-4000-8000-0000000000aa", leave_type: "mc", starts_on: "2026-10-09", ends_on: "2026-10-09",
      reason: null, note: null, proof_paths: [PROOF], approval_required: false, submitted_at: "2026-10-09T01:00:00+00:00",
      cancelled_from: null, cancelled_at: null }];
    const res = await app().request("/leave");
    expect(res.status).toBe(200);
    const body = await res.json() as { canSubmit: boolean; leave: unknown[]; today: string };
    expect(body.canSubmit).toBe(true);
    expect(body.leave).toHaveLength(1);
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(eq).toHaveBeenCalledWith("user_id", SELF);
  });

  it("passes my submission to the one door, MC proof included", async () => {
    rpc.mockResolvedValue({ data: { id: "x", cover_moved: 2 }, error: null });
    const res = await post("/leave", { type: "mc", startsOn: "2026-10-09", endsOn: "2026-10-10", proofPaths: [PROOF] });
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("staff_leave_submit", {
      p_type: "mc", p_starts_on: "2026-10-09", p_ends_on: "2026-10-10", p_reason: null, p_note: null, p_proof_paths: [PROOF],
    });
  });

  it("refuses an MC without proof or an Emergency leave without a reason before the door", async () => {
    expect((await post("/leave", { type: "mc", startsOn: "2026-10-09", endsOn: "2026-10-09" })).status).toBe(422);
    expect((await post("/leave", { type: "emergency", startsOn: "2026-10-09", endsOn: "2026-10-09" })).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the door's refusal as its code, never the database sentence", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "22023", details: "leave_overlap", message: "you already have leave on these dates" } });
    const res = await post("/leave", { type: "planned", startsOn: "2026-10-12", endsOn: "2026-10-13" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "leave_overlap", code: "leave_overlap", message: "leave_overlap" });
  });

  it("builds the proof path inside my own folder", async () => {
    signUpload.mockResolvedValue({ data: { token: "t", path: "p" }, error: null });
    const res = await post("/leave/proof/sign", { mimeType: "image/jpeg", sizeBytes: 1000 });
    expect(res.status).toBe(200);
    expect(signUpload.mock.calls[0]![0]).toMatch(new RegExp(`^${SELF}/[0-9a-f-]{36}\\.jpg$`));
    expect((await post("/leave/proof/sign", { mimeType: "video/mp4", sizeBytes: 1000 })).status).toBe(422);
  });

  it("cancels through the door and refuses a malformed id", async () => {
    rpc.mockResolvedValue({ data: { id: "x" }, error: null });
    expect((await post("/leave/eeeeeeee-0000-4000-8000-0000000000aa/cancel", {})).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("staff_leave_cancel", { p_leave_id: "eeeeeeee-0000-4000-8000-0000000000aa" });
    expect((await post("/leave/not-an-id/cancel", {})).status).toBe(422);
  });

  it("shows colleagues who is away with dates only, and keeps outside roles out", async () => {
    rpc.mockResolvedValue({ data: [{ user_id: SELF, name: "Shasha", starts_on: "2026-10-09", ends_on: "2026-10-10" }], error: null });
    const res = await app().request("/leave/team?days=7");
    expect(await res.json()).toMatchObject({ people: [{ userId: SELF, name: "Shasha", startsOn: "2026-10-09", endsOn: "2026-10-10" }] });
    expect(rpc).toHaveBeenCalledWith("workspace_leave_upcoming", { p_days: 7 });
    expect((await app("dealer").request("/leave")).status).toBe(403);
    expect((await app("hr").request("/leave/team")).status).toBe(403);
    expect(userClient).toHaveBeenCalledTimes(1);
  });
});
