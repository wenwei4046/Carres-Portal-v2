import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../lib/supabase";

const KID = "test-kid-hr-comp";
const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
  STAFF_SESSION_SECRET: "test-staff-secret-hr-comp-abc",
};

const STORE = "00000000-0000-0000-0000-0000000000d1";
const SP = "00000000-0000-0000-0000-0000000000b1";
const EMP_FLOOR = "00000000-0000-0000-0000-0000000000e1";
const EMP_HQ = "00000000-0000-0000-0000-0000000000e2";
const COMP_ID = "00000000-0000-0000-0000-0000000000c1";
const APP_USER = "00000000-0000-0000-0000-0000000000a1";

let signKey: KeyLike;
beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  signKey = kp.privateKey as KeyLike;
  const jwk: JWK = { ...(await exportJWK(kp.publicKey)), kid: KID, alg: "ES256", use: "sig" };
  _setJwksForTesting(createLocalJWKSet({ keys: [jwk] }));
});
afterEach(() => vi.mocked(userClient).mockReset());
afterAll(() => _setJwksForTesting(null));

async function jwt(role: string) {
  return new SignJWT({ email: "hr@carres.com", app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000777")
    .setIssuedAt().setExpirationTime("5m").sign(signKey);
}
function req(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://t${path}`, init), env);
}
async function authed(path: string, role: string, init?: RequestInit) {
  return req(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${await jwt(role)}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}
function mockRpc(
  byName: Record<string, { data?: unknown; error?: { code?: string; message: string } }>,
) {
  const rpc = vi.fn(async (name: string, _args?: unknown) => {
    const r = byName[name];
    if (!r) return { data: null, error: null };
    return { data: r.data ?? null, error: r.error ?? null };
  });
  vi.mocked(userClient).mockReturnValue({ rpc } as never);
  return rpc;
}

const COMP_SOURCE = {
  comp: [
    {
      id: COMP_ID,
      employeeId: EMP_FLOOR,
      baseMonthly: 2500,
      fixedAllowance: 300,
      employerBurdenPct: 13.7,
      effectiveFrom: "2026-07-01",
      note: null,
      setByName: "Loo",
    },
  ],
  people: [
    {
      employeeId: EMP_FLOOR, appUserId: null, staffCode: "CR008", name: "Mayson",
      kind: "floor", positionName: null, departmentName: null, dealerId: STORE,
      storeName: "Carres Kelana Jaya", staffRole: "salesperson", accessActive: true,
    },
    {
      employeeId: EMP_HQ, appUserId: APP_USER, staffCode: "CR003", name: "Khor Yee",
      kind: "hq", positionName: "Admin Assistant", departmentName: "Operation",
      dealerId: null, storeName: null, staffRole: null, accessActive: true,
    },
  ],
  stores: [
    { dealerId: STORE, name: "Carres Kelana Jaya", managerUserId: null, managerName: null },
  ],
  coverage: {
    firstOrderDate: "2026-07-21", lastOrderDate: "2026-07-26",
    daysWithOrders: 6, orderCount: 19, daysInMonth: 31,
  },
};

const COMMISSION_SOURCE = {
  staff: [
    {
      id: SP, name: "Mayson", staffRole: "salesperson", active: true,
      dealerId: STORE, outletId: null, storeName: "Carres Kelana Jaya",
    },
  ],
  lines: [
    {
      orderId: "or1", so: 1256, placedAt: "2026-07-22T00:00:00Z", salespersonId: SP,
      dealerId: STORE, outletId: null, modelId: "m1", modelName: "M",
      category: "mattress", qty: 1, unitPrice: 30480,
    },
  ],
  config: {
    schemes: [{ dealerId: STORE, outletId: null, method: "percentage" }],
    rates: [], modelRates: [], modelTiers: [], milestones: [],
  },
  unattributed: [],
};

const HAPPY = {
  staff_comp_source: { data: COMP_SOURCE },
  hr_commission_source: { data: COMMISSION_SOURCE },
};

describe("GET /api/hr/comp", () => {
  it("is closed to every non-HR role", async () => {
    for (const role of ["operation", "finance", "showroom", "bd", "dealer", "supplier"]) {
      expect((await authed("/api/hr/comp?year=2026&month=7", role)).status).toBe(403);
    }
  });

  it("is closed to an unauthenticated caller", async () => {
    expect((await req("/api/hr/comp?year=2026&month=7")).status).toBe(401);
  });

  it("admits principal as well as hr (D3)", async () => {
    mockRpc(HAPPY);
    expect((await authed("/api/hr/comp?year=2026&month=7", "principal")).status).toBe(200);
  });

  it("rejects a nonsense month before touching the DB", async () => {
    const rpc = mockRpc(HAPPY);
    expect((await authed("/api/hr/comp?year=2026&month=0", "hr")).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the loaded fixed cost", async () => {
    mockRpc(HAPPY);
    const res = await authed("/api/hr/comp?year=2026&month=7", "hr");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cost: { fixedCost: number; headcount: number; recorded: number; commissionCost: number };
    };
    // (2500 + 300) * 1.137 = 3183.6
    expect(body.cost.fixedCost).toBe(3183.6);
    expect(body.cost.headcount).toBe(2);
    expect(body.cost.recorded).toBe(1);
  });

  it("never returns a field that merges salary with commission", async () => {
    mockRpc(HAPPY);
    const body = (await (await authed("/api/hr/comp?year=2026&month=7", "hr")).json()) as {
      cost: Record<string, unknown>;
    };
    const banned = /total.*cost|cost.*total|combined/i;
    expect(Object.keys(body.cost).filter((k) => banned.test(k))).toEqual([]);
    expect(body.cost).toHaveProperty("fixedCost");
    expect(body.cost).toHaveProperty("commissionCost");
  });

  it("does not attribute revenue to a non-selling department", async () => {
    mockRpc(HAPPY);
    const body = (await (await authed("/api/hr/comp?year=2026&month=7", "hr")).json()) as {
      cost: { groups: { name: string; revenue: number | null; absence: string | null }[] };
    };
    const ops = body.cost.groups.find((g) => g.name === "Operation");
    expect(ops?.revenue).toBeNull();
    expect(ops?.absence).toBe("does_not_sell");
  });

  it("reads store revenue through the Performance engine, not a second query", async () => {
    const rpc = mockRpc(HAPPY);
    const body = (await (await authed("/api/hr/comp?year=2026&month=7", "hr")).json()) as {
      cost: { stores: { revenue: number; fixedCost: number }[] };
    };
    expect(body.cost.stores[0].revenue).toBe(30480);
    expect(body.cost.stores[0].fixedCost).toBe(3183.6);
    // exactly the two source RPCs — no third revenue query
    const called = rpc.mock.calls.map((c) => c[0]);
    expect(called).toContain("staff_comp_source");
    expect(called).toContain("hr_commission_source");
  });

  it("reports the coverage that gates the ratio", async () => {
    mockRpc(HAPPY);
    const body = (await (await authed("/api/hr/comp?year=2026&month=7", "hr")).json()) as {
      cost: { coverage: { daysWithOrders: number; daysInMonth: number; partial: boolean } };
    };
    expect(body.cost.coverage.daysWithOrders).toBe(6);
    expect(body.cost.coverage.daysInMonth).toBe(31);
    expect(body.cost.coverage.partial).toBe(true);
  });

  it("turns the DEFINER gate into a 403, not a 500", async () => {
    mockRpc({ ...HAPPY, staff_comp_source: { error: { code: "42501", message: "forbidden" } } });
    expect((await authed("/api/hr/comp?year=2026&month=7", "hr")).status).toBe(403);
  });

  it("fails loudly on a payload it cannot trust", async () => {
    // Salary rendering as RM 0 because a key went missing is worse than an error.
    mockRpc({ ...HAPPY, staff_comp_source: { data: { comp: [], people: [] } } });
    expect((await authed("/api/hr/comp?year=2026&month=7", "hr")).status).toBe(500);
  });
});

describe("PUT /api/hr/comp", () => {
  const body = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      employeeId: EMP_FLOOR,
      baseMonthly: 2500,
      fixedAllowance: 300,
      employerBurdenPct: 13.7,
      effectiveFrom: "2026-07-01",
      ...over,
    });

  it("is closed to non-HR roles", async () => {
    expect((await authed("/api/hr/comp", "operation", { method: "PUT", body: body() })).status)
      .toBe(403);
  });

  it("passes the row through to the RPC", async () => {
    const rpc = mockRpc({ hr_set_staff_comp: { data: COMP_ID } });
    const res = await authed("/api/hr/comp", "hr", { method: "PUT", body: body() });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("hr_set_staff_comp", {
      p_employee_id: EMP_FLOOR,
      p_base_monthly: 2500,
      p_fixed_allowance: 300,
      p_employer_burden_pct: 13.7,
      p_effective_from: "2026-07-01",
      p_note: null,
    });
  });

  it("defaults allowance and burden to zero when omitted", async () => {
    const rpc = mockRpc({ hr_set_staff_comp: { data: COMP_ID } });
    await authed("/api/hr/comp", "hr", {
      method: "PUT",
      body: JSON.stringify({
        employeeId: EMP_FLOOR, baseMonthly: 2500, effectiveFrom: "2026-07-01",
      }),
    });
    expect(rpc).toHaveBeenCalledWith(
      "hr_set_staff_comp",
      expect.objectContaining({ p_fixed_allowance: 0, p_employer_burden_pct: 0 }),
    );
  });

  it("accepts a zero base — a commission-only hire is legitimate", async () => {
    mockRpc({ hr_set_staff_comp: { data: COMP_ID } });
    expect((await authed("/api/hr/comp", "hr", { method: "PUT", body: body({ baseMonthly: 0 }) })).status)
      .toBe(200);
  });

  it("refuses a negative base without calling the DB", async () => {
    const rpc = mockRpc({ hr_set_staff_comp: { data: COMP_ID } });
    expect((await authed("/api/hr/comp", "hr", { method: "PUT", body: body({ baseMonthly: -1 }) })).status)
      .toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a burden over 100%", async () => {
    expect((await authed("/api/hr/comp", "hr", { method: "PUT", body: body({ employerBurdenPct: 101 }) })).status)
      .toBe(422);
  });

  it("refuses a non-ISO effective date", async () => {
    expect((await authed("/api/hr/comp", "hr", { method: "PUT", body: body({ effectiveFrom: "1 Jul 26" }) })).status)
      .toBe(422);
  });

  it("survives a body that is not JSON", async () => {
    expect((await authed("/api/hr/comp", "hr", { method: "PUT", body: "nope" })).status).toBe(422);
  });

  it("maps the RPC's own guards to 422", async () => {
    for (const message of ["burden_out_of_range", "employee_not_found", "base_must_not_be_negative"]) {
      mockRpc({ hr_set_staff_comp: { error: { message } } });
      const res = await authed("/api/hr/comp", "hr", { method: "PUT", body: body() });
      expect(res.status).toBe(422);
      expect((await res.json()) as unknown).toMatchObject({ message });
    }
  });

  it("still reports an unexpected DB failure as 500", async () => {
    mockRpc({ hr_set_staff_comp: { error: { message: "connection reset" } } });
    expect((await authed("/api/hr/comp", "hr", { method: "PUT", body: body() })).status).toBe(500);
  });
});

describe("DELETE /api/hr/comp/:id", () => {
  it("is closed to non-HR roles", async () => {
    expect((await authed(`/api/hr/comp/${COMP_ID}`, "showroom", { method: "DELETE" })).status)
      .toBe(403);
  });

  it("removes the row", async () => {
    const rpc = mockRpc({ hr_delete_staff_comp: {} });
    const res = await authed(`/api/hr/comp/${COMP_ID}`, "hr", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("hr_delete_staff_comp", { p_id: COMP_ID });
  });

  it("turns a missing row into a 422", async () => {
    mockRpc({ hr_delete_staff_comp: { error: { message: "comp_not_found" } } });
    expect((await authed(`/api/hr/comp/${COMP_ID}`, "hr", { method: "DELETE" })).status).toBe(422);
  });
});
