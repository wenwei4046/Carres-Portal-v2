import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../../types";
import staffRouter from "./staff";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/duties", () => ({
  dutyHolders: vi.fn(async () => ({})),
  myDuties: vi.fn(async () => []),
  hasDuty: vi.fn(async () => false),
  requireDuty: vi.fn(async () => undefined),
}));
import { userClient } from "../../lib/supabase";

const FIONA = "00000000-0000-4000-8000-00000000000f";
const AINA = "00000000-0000-4000-8000-00000000000a";
const KHOR = "00000000-0000-4000-8000-00000000000b";
const SHARED = "00000000-0000-4000-8000-00000000000c";

const rpc = vi.fn();
const eq = vi.fn();
const from = vi.fn((table: string) => ({
  select: () =>
    table === "app_users"
      ? {
          eq: (col: string, val: string) => {
            eq(col, val);
            return {
              order: async () => ({
                data: [
                  { id: AINA, email: "aina@x", name: "Aina", status: "active", staff_code: "CR004", last_seen_at: null },
                  { id: KHOR, email: "khoryee@x", name: "Khor Yee", status: "disabled", staff_code: "CR003", last_seen_at: null },
                  { id: SHARED, email: "operation@x", name: "Operations", status: "active", staff_code: null, last_seen_at: null },
                ],
                error: null,
              }),
            };
          },
        }
      : Promise.resolve({ data: [], error: null }),
}));

function app(role = "operation") {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("auth", { id: AINA, role, jwt: "t" } as never);
    await next();
  });
  a.route("/staff", staffRouter);
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(userClient).mockReturnValue({ rpc, from } as never);
});

describe("GET /staff — the Staff & Duties pickers", () => {
  it("Finance Approver lists Finance users through workspace_duty_staff", async () => {
    rpc.mockResolvedValue({
      data: [{ id: FIONA, name: "Fiona", email: "fiona@x" }],
      error: null,
    });
    const res = await app().request("/staff?duty=finance_approver");
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("workspace_duty_staff", { p_roles: ["finance"] });
    expect(from).not.toHaveBeenCalled();
    const body = (await res.json()) as { staff: { user_id: string; name: string }[] };
    expect(body.staff.map((s) => s.name)).toEqual(["Fiona"]);
  });

  it("another duty, and no duty at all, keep the operation list", async () => {
    for (const path of ["/staff?duty=grn_duty", "/staff"]) {
      const res = await app().request(path);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { staff: { name: string }[] };
      // A departed (disabled) account is never listed.
      expect(body.staff.map((s) => s.name)).not.toContain("Khor Yee");
    }
    expect(eq).toHaveBeenCalledWith("role", "operation");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("S2-A · a duty picker offers only active individual staff — never a departed or shared login", async () => {
    const res = await app().request("/staff?duty=grn_duty");
    const body = (await res.json()) as { staff: { name: string }[] };
    expect(body.staff.map((s) => s.name)).toEqual(["Aina"]);
  });

  it("a caller who may not assign duties is refused by the database gate", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "forbidden" },
    });
    expect((await app().request("/staff?duty=finance_approver")).status).toBe(403);
  });

  it("keeps the operation-or-principal guard", async () => {
    expect((await app("finance").request("/staff?duty=finance_approver")).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
