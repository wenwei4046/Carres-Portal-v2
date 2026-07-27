import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../lib/supabase";

const KID = "test-kid-hr-kpi";
const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
  STAFF_SESSION_SECRET: "test-staff-secret-hr-kpi-abc",
};

const SP = "00000000-0000-0000-0000-0000000000b1";
const EMP = "00000000-0000-0000-0000-0000000000e1";
const STORE = "00000000-0000-0000-0000-0000000000d1";
const TARGET = "00000000-0000-0000-0000-0000000000t1".replace("t", "f");
const MGR = "00000000-0000-0000-0000-0000000000c1";

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

const KPI_SOURCE = {
  targets: [
    {
      id: TARGET,
      kpiKey: "sales_basis",
      scopeKind: "store",
      employeeId: null,
      dealerId: STORE,
      subjectName: "Carres Kelana Jaya",
      staffCode: null,
      targetValue: 60000,
      effectiveFrom: "2026-07-01",
      note: null,
      setByName: "Loo",
    },
  ],
  people: [
    {
      employeeId: EMP,
      appUserId: null,
      salespersonId: SP,
      staffCode: "CR008",
      name: "Mayson",
      positionName: null,
      departmentName: null,
      dealerId: STORE,
      storeName: "Carres Kelana Jaya",
      staffRole: "salesperson",
      canSell: true,
    },
  ],
  stores: [
    {
      dealerId: STORE,
      name: "Carres Kelana Jaya",
      managerUserId: null,
      managerName: null,
      staffCount: 2,
    },
  ],
  manualActuals: [],
  managerCoverage: { hqTotal: 7, hqWithManager: 1, storesTotal: 1, storesWithManager: 0 },
  managerCandidates: [{ appUserId: MGR, name: "Jess", staffCode: "CR002", positionName: "COO" }],
};

const COMMISSION_SOURCE = {
  staff: [
    {
      id: SP,
      name: "Mayson",
      staffRole: "salesperson",
      active: true,
      dealerId: STORE,
      outletId: null,
      storeName: "Carres Kelana Jaya",
    },
  ],
  lines: [
    {
      orderId: "or1",
      so: 1256,
      placedAt: "2026-07-10T00:00:00Z",
      salespersonId: SP,
      dealerId: STORE,
      outletId: null,
      modelId: "m1",
      modelName: "M",
      category: "mattress",
      qty: 1,
      unitPrice: 30480,
    },
  ],
  config: {
    schemes: [{ dealerId: STORE, outletId: null, method: "percentage" }],
    rates: [],
    modelRates: [],
    modelTiers: [],
    milestones: [],
  },
  unattributed: [],
};

const HAPPY = {
  kpi_source: { data: KPI_SOURCE },
  hr_commission_source: { data: COMMISSION_SOURCE },
  commission_run_state: { data: { run: null, pendingAdjustments: 0, locked: false } },
};

describe("GET /api/hr/kpi", () => {
  it("is closed to every non-HR role", async () => {
    for (const role of ["operation", "finance", "showroom", "bd", "dealer", "supplier"]) {
      expect((await authed("/api/hr/kpi?year=2026&month=7", role)).status).toBe(403);
    }
  });

  it("is closed to an unauthenticated caller", async () => {
    expect((await req("/api/hr/kpi?year=2026&month=7")).status).toBe(401);
  });

  it("rejects a nonsense month before touching the DB", async () => {
    const rpc = mockRpc(HAPPY);
    expect((await authed("/api/hr/kpi?year=2026&month=13", "hr")).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("scores the store against its target", async () => {
    mockRpc(HAPPY);
    const res = await authed("/api/hr/kpi?year=2026&month=7", "hr");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      scorecards: { stores: { sold: number; target: number; pct: number; state: string }[] };
    };
    expect(body.scorecards.stores[0].sold).toBe(30480);
    expect(body.scorecards.stores[0].target).toBe(60000);
    expect(body.scorecards.stores[0].pct).toBe(50);
    expect(body.scorecards.stores[0].state).toBe("behind");
  });

  it("admits principal as well as hr", async () => {
    mockRpc(HAPPY);
    expect((await authed("/api/hr/kpi?year=2026&month=7", "principal")).status).toBe(200);
  });

  it("falls back to the sales board on an unknown ?kpi instead of erroring", async () => {
    // A stale bookmark should show something useful, not a 422.
    mockRpc(HAPPY);
    const res = await authed("/api/hr/kpi?year=2026&month=7&kpi=vibes", "hr");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { scorecards: { kpiKey: string } }).scorecards.kpiKey).toBe(
      "sales_basis",
    );
  });

  it("honours a valid ?kpi", async () => {
    mockRpc(HAPPY);
    const res = await authed("/api/hr/kpi?year=2026&month=7&kpi=orders_count", "hr");
    const body = (await res.json()) as { scorecards: { kpiKey: string; stores: { actual: number }[] } };
    expect(body.scorecards.kpiKey).toBe("orders_count");
    expect(body.scorecards.stores[0].actual).toBe(1);
  });

  it("turns the DEFINER gate into a 403, not a 500", async () => {
    mockRpc({ ...HAPPY, kpi_source: { error: { code: "42501", message: "forbidden" } } });
    expect((await authed("/api/hr/kpi?year=2026&month=7", "hr")).status).toBe(403);
  });

  it("fails loudly when kpi_source returns a payload it cannot trust", async () => {
    // Silently defaulting a missing key would render as RM 0 sold — a wrong
    // number on screen is worse than an error.
    mockRpc({ ...HAPPY, kpi_source: { data: { targets: [], people: [] } } });
    expect((await authed("/api/hr/kpi?year=2026&month=7", "hr")).status).toBe(500);
  });

  it("still serves the numbers when the run-state read fails", async () => {
    // The Closed badge is context; the scoreboard is the point.
    mockRpc({
      ...HAPPY,
      commission_run_state: { error: { message: "boom" } },
    });
    const res = await authed("/api/hr/kpi?year=2026&month=7", "hr");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { monthLocked: boolean; runStatus: string | null };
    expect(body.monthLocked).toBe(false);
    expect(body.runStatus).toBeNull();
  });

  it("reports the month as locked once the run is approved", async () => {
    mockRpc({
      ...HAPPY,
      commission_run_state: {
        data: { run: { status: "approved" }, pendingAdjustments: 0, locked: true },
      },
    });
    const body = (await (await authed("/api/hr/kpi?year=2026&month=7", "hr")).json()) as {
      monthLocked: boolean;
    };
    expect(body.monthLocked).toBe(true);
  });

  it("does not read commission_run_lines — a closed month is not scored from basis", async () => {
    // basis is percentage-method only, so a per-model store freezes it at 0.
    const rpc = mockRpc(HAPPY);
    await authed("/api/hr/kpi?year=2026&month=7", "hr");
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain("commission_run_detail");
  });
});

describe("PUT /api/hr/kpi/target", () => {
  const body = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      kpiKey: "sales_basis",
      dealerId: STORE,
      targetValue: 60000,
      effectiveFrom: "2026-07-01",
      ...over,
    });

  it("is closed to non-HR roles", async () => {
    expect(
      (await authed("/api/hr/kpi/target", "operation", { method: "PUT", body: body() })).status,
    ).toBe(403);
  });

  it("passes a store target through to the RPC", async () => {
    const rpc = mockRpc({ hr_set_kpi_target: { data: TARGET } });
    const res = await authed("/api/hr/kpi/target", "hr", { method: "PUT", body: body() });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("hr_set_kpi_target", {
      p_kpi_key: "sales_basis",
      p_employee_id: null,
      p_dealer_id: STORE,
      p_target_value: 60000,
      p_effective_from: "2026-07-01",
      p_note: null,
    });
  });

  it("refuses both scopes at once", async () => {
    const rpc = mockRpc({ hr_set_kpi_target: { data: TARGET } });
    const res = await authed("/api/hr/kpi/target", "hr", {
      method: "PUT",
      body: body({ employeeId: EMP }),
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses neither scope", async () => {
    const rpc = mockRpc({ hr_set_kpi_target: { data: TARGET } });
    const res = await authed("/api/hr/kpi/target", "hr", {
      method: "PUT",
      body: JSON.stringify({ kpiKey: "sales_basis", targetValue: 1, effectiveFrom: "2026-07-01" }),
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a zero target", async () => {
    const res = await authed("/api/hr/kpi/target", "hr", {
      method: "PUT",
      body: body({ targetValue: 0 }),
    });
    expect(res.status).toBe(422);
  });

  it("refuses a non-ISO effective date", async () => {
    const res = await authed("/api/hr/kpi/target", "hr", {
      method: "PUT",
      body: body({ effectiveFrom: "1 Jul 26" }),
    });
    expect(res.status).toBe(422);
  });

  it("survives a body that is not JSON", async () => {
    const res = await authed("/api/hr/kpi/target", "hr", { method: "PUT", body: "not json" });
    expect(res.status).toBe(422);
  });

  it("turns the archive-store refusal into a 422", async () => {
    mockRpc({ hr_set_kpi_target: { error: { message: "store_not_scoreable" } } });
    const res = await authed("/api/hr/kpi/target", "hr", { method: "PUT", body: body() });
    expect(res.status).toBe(422);
    expect((await res.json()) as unknown).toMatchObject({ message: "store_not_scoreable" });
  });

  it("turns an unknown metric refusal into a 422", async () => {
    mockRpc({ hr_set_kpi_target: { error: { message: "unknown_kpi" } } });
    expect(
      (await authed("/api/hr/kpi/target", "hr", { method: "PUT", body: body() })).status,
    ).toBe(422);
  });

  it("still reports an unexpected DB failure as 500", async () => {
    mockRpc({ hr_set_kpi_target: { error: { message: "connection reset" } } });
    expect(
      (await authed("/api/hr/kpi/target", "hr", { method: "PUT", body: body() })).status,
    ).toBe(500);
  });
});

describe("DELETE /api/hr/kpi/target/:id", () => {
  it("is closed to non-HR roles", async () => {
    expect(
      (await authed(`/api/hr/kpi/target/${TARGET}`, "showroom", { method: "DELETE" })).status,
    ).toBe(403);
  });

  it("removes the target", async () => {
    const rpc = mockRpc({ hr_delete_kpi_target: {} });
    const res = await authed(`/api/hr/kpi/target/${TARGET}`, "hr", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("hr_delete_kpi_target", { p_id: TARGET });
  });

  it("turns a missing target into a 422", async () => {
    mockRpc({ hr_delete_kpi_target: { error: { message: "target_not_found" } } });
    expect(
      (await authed(`/api/hr/kpi/target/${TARGET}`, "hr", { method: "DELETE" })).status,
    ).toBe(422);
  });
});

describe("PUT /api/hr/kpi/store-manager", () => {
  it("is closed to non-HR roles", async () => {
    expect(
      (await authed("/api/hr/kpi/store-manager", "bd", {
        method: "PUT",
        body: JSON.stringify({ dealerId: STORE, appUserId: MGR }),
      })).status,
    ).toBe(403);
  });

  it("sets the owner", async () => {
    const rpc = mockRpc({ hr_set_store_manager: {} });
    const res = await authed("/api/hr/kpi/store-manager", "hr", {
      method: "PUT",
      body: JSON.stringify({ dealerId: STORE, appUserId: MGR }),
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("hr_set_store_manager", {
      p_dealer_id: STORE,
      p_user_id: MGR,
    });
  });

  it("clears the owner on an explicit null", async () => {
    const rpc = mockRpc({ hr_set_store_manager: {} });
    const res = await authed("/api/hr/kpi/store-manager", "hr", {
      method: "PUT",
      body: JSON.stringify({ dealerId: STORE, appUserId: null }),
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("hr_set_store_manager", {
      p_dealer_id: STORE,
      p_user_id: null,
    });
  });

  it("requires appUserId to be present, even as null", async () => {
    const res = await authed("/api/hr/kpi/store-manager", "hr", {
      method: "PUT",
      body: JSON.stringify({ dealerId: STORE }),
    });
    expect(res.status).toBe(422);
  });

  it("turns a disabled or BD candidate refusal into a 422", async () => {
    mockRpc({ hr_set_store_manager: { error: { message: "not_a_valid_manager" } } });
    expect(
      (await authed("/api/hr/kpi/store-manager", "hr", {
        method: "PUT",
        body: JSON.stringify({ dealerId: STORE, appUserId: MGR }),
      })).status,
    ).toBe(422);
  });
});

describe("PUT /api/hr/kpi/manual", () => {
  it("is closed to non-HR roles", async () => {
    expect(
      (await authed("/api/hr/kpi/manual", "operation", {
        method: "PUT",
        body: JSON.stringify({
          kpiKey: "orders_count", employeeId: EMP, year: 2026, month: 7, value: 9,
        }),
      })).status,
    ).toBe(403);
  });

  it("passes a manual actual through", async () => {
    const rpc = mockRpc({ hr_set_manual_actual: { data: TARGET } });
    const res = await authed("/api/hr/kpi/manual", "hr", {
      method: "PUT",
      body: JSON.stringify({
        kpiKey: "orders_count", employeeId: EMP, year: 2026, month: 7, value: 9,
      }),
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("hr_set_manual_actual", {
      p_kpi_key: "orders_count",
      p_employee_id: EMP,
      p_dealer_id: null,
      p_year: 2026,
      p_month: 7,
      p_value: 9,
      p_note: null,
    });
  });

  it("refuses a month outside 1-12", async () => {
    const res = await authed("/api/hr/kpi/manual", "hr", {
      method: "PUT",
      body: JSON.stringify({
        kpiKey: "orders_count", employeeId: EMP, year: 2026, month: 0, value: 9,
      }),
    });
    expect(res.status).toBe(422);
  });

  it("refuses a negative value", async () => {
    const res = await authed("/api/hr/kpi/manual", "hr", {
      method: "PUT",
      body: JSON.stringify({
        kpiKey: "orders_count", employeeId: EMP, year: 2026, month: 7, value: -1,
      }),
    });
    expect(res.status).toBe(422);
  });
});
