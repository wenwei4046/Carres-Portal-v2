import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../lib/supabase";

const KID = "test-kid-hr-runs";
const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
  STAFF_SESSION_SECRET: "test-staff-secret-hr-runs-abc",
};
const RUN = "00000000-0000-0000-0000-0000000000r1".replace("r", "a");
const SP = "00000000-0000-0000-0000-0000000000b1";

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

/** Route each rpc name to a canned result so one mock serves a whole flow. */
function mockRpc(byName: Record<string, { data?: unknown; error?: { code?: string; message: string } }>) {
  const rpc = vi.fn(async (name: string, _args?: unknown) => {
    const r = byName[name];
    if (!r) return { data: null, error: null };
    return { data: r.data ?? null, error: r.error ?? null };
  });
  vi.mocked(userClient).mockReturnValue({ rpc } as never);
  return rpc;
}

/** A month where both sellers compute to a real figure. */
const SOURCE_OK = {
  staff: [
    { id: SP, name: "Mayson", staffRole: "manager", active: true,
      dealerId: "d1", outletId: "o1", storeName: "Carres Kelana Jaya" },
  ],
  lines: [
    { orderId: "or1", so: 1256, placedAt: "2026-07-10T00:00:00Z", salespersonId: SP,
      sku: "X", modelId: "m1", category: "mattress", qty: 1, unitPrice: 30480 },
  ],
  config: { schemes: [{ dealerId: "d1", outletId: null, method: "percentage" }],
            rates: [{ salespersonId: SP, pct: 3, effectiveFrom: "2026-01-01" }],
            modelRates: [], modelTiers: [], milestones: [] },
  unattributed: [],
};

describe("GET /api/hr/runs/state — the pre-flight", () => {
  it("is closed to non-HR roles", async () => {
    for (const role of ["operation", "finance", "showroom"]) {
      expect((await authed("/api/hr/runs/state?year=2026&month=7", role)).status).toBe(403);
    }
  });

  it("rejects a nonsense month before touching the DB", async () => {
    const rpc = mockRpc({});
    expect((await authed("/api/hr/runs/state?year=2026&month=13", "hr")).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("blocks the close when a seller computes to zero", async () => {
    // no rates configured -> engine returns total 0 on a real basis
    mockRpc({
      commission_run_state: { data: { run: null, pendingAdjustments: 0, locked: false } },
      hr_commission_source: { data: { ...SOURCE_OK, config: { ...SOURCE_OK.config, rates: [] } } },
    });
    const res = await authed("/api/hr/runs/state?year=2026&month=7", "hr");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { checks: { key: string; passed: boolean; blocking: boolean }[] };
    const rates = body.checks.find((c) => c.key === "rates")!;
    expect(rates.passed).toBe(false);
    expect(rates.blocking).toBe(true);
  });

  it("passes the rate check once a rate exists", async () => {
    mockRpc({
      commission_run_state: { data: { run: null, pendingAdjustments: 0, locked: false } },
      hr_commission_source: { data: SOURCE_OK },
    });
    const res = await authed("/api/hr/runs/state?year=2026&month=7", "hr");
    const body = (await res.json()) as { checks: { key: string; passed: boolean }[] };
    expect(body.checks.find((c) => c.key === "rates")!.passed).toBe(true);
  });
});

describe("POST /api/hr/runs/close", () => {
  it("computes with the engine and hands the RESULT to the RPC", async () => {
    const rpc = mockRpc({
      hr_commission_source: { data: SOURCE_OK },
      commission_close_month: { data: RUN },
    });
    const res = await authed("/api/hr/runs/close", "hr", {
      method: "POST",
      body: JSON.stringify({ year: 2026, month: 7 }),
    });
    expect(res.status).toBe(200);

    const call = rpc.mock.calls.find((c) => c[0] === "commission_close_month")!;
    const args = call[1] as unknown as { p_lines: { subjectId: string; basis: number; total: number }[] };
    // the figure was computed here, not supplied by the caller
    expect(args.p_lines).toHaveLength(1);
    expect(args.p_lines[0]!.subjectId).toBe(SP);
    expect(args.p_lines[0]!.basis).toBe(30480);
    expect(args.p_lines[0]!.total).toBeCloseTo(914.4, 2);
  });

  it("never lets the client dictate a figure", async () => {
    const rpc = mockRpc({
      hr_commission_source: { data: SOURCE_OK },
      commission_close_month: { data: RUN },
    });
    await authed("/api/hr/runs/close", "hr", {
      method: "POST",
      body: JSON.stringify({ year: 2026, month: 7, lines: [{ total: 999999 }] }),
    });
    const args = rpc.mock.calls.find((c) => c[0] === "commission_close_month")![1] as unknown as {
      p_lines: { total: number }[];
    };
    expect(args.p_lines[0]!.total).toBeCloseTo(914.4, 2);
  });

  it("surfaces the DB's zero-rate refusal as a 422, not a 500", async () => {
    mockRpc({
      hr_commission_source: { data: { ...SOURCE_OK, config: { ...SOURCE_OK.config, rates: [] } } },
      commission_close_month: { error: { message: "zero_rate_sellers" } },
    });
    const res = await authed("/api/hr/runs/close", "hr", {
      method: "POST",
      body: JSON.stringify({ year: 2026, month: 7 }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toBe("zero_rate_sellers");
  });

  it("will not close a BD run — nobody is enrolled yet", async () => {
    const rpc = mockRpc({ hr_commission_source: { data: SOURCE_OK } });
    const res = await authed("/api/hr/runs/close", "hr", {
      method: "POST",
      body: JSON.stringify({ year: 2026, month: 7, program: "bd" }),
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("run actions", () => {
  it("maps principal_only to a 403 when hr tries to approve", async () => {
    mockRpc({ commission_approve_run: { error: { code: "42501", message: "principal_only" } } });
    const res = await authed(`/api/hr/runs/${RUN}/approve`, "hr", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("refuses a reopen with no reason before calling the DB", async () => {
    const rpc = mockRpc({});
    const res = await authed(`/api/hr/runs/${RUN}/reopen`, "hr", {
      method: "POST", body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes the reason through on a valid reopen", async () => {
    const rpc = mockRpc({ commission_reopen_run: { data: null } });
    const res = await authed(`/api/hr/runs/${RUN}/reopen`, "hr", {
      method: "POST", body: JSON.stringify({ reason: "wrong rate" }),
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("commission_reopen_run", {
      p_run_id: RUN, p_reason: "wrong rate",
    });
  });

  it("maps already_paid to a 422", async () => {
    mockRpc({ commission_reopen_run: { error: { message: "already_paid" } } });
    const res = await authed(`/api/hr/runs/${RUN}/reopen`, "hr", {
      method: "POST", body: JSON.stringify({ reason: "too late" }),
    });
    expect(res.status).toBe(422);
  });
});

describe("adjustments", () => {
  it("refuses a zero amount", async () => {
    const rpc = mockRpc({});
    const res = await authed("/api/hr/runs/adjustments", "hr", {
      method: "POST",
      body: JSON.stringify({ year: 2026, month: 9, subjectId: SP, amount: 0, reason: "refund" }),
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("carries the origin month through to the RPC", async () => {
    const rpc = mockRpc({ commission_add_adjustment: { data: "adj-1" } });
    const res = await authed("/api/hr/runs/adjustments", "hr", {
      method: "POST",
      body: JSON.stringify({
        year: 2026, month: 9, subjectId: SP, amount: -183, reason: "refund",
        originYear: 2026, originMonth: 7,
      }),
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("commission_add_adjustment",
      expect.objectContaining({ p_year: 2026, p_month: 9, p_amount: -183,
        p_origin_year: 2026, p_origin_month: 7 }));
  });

  it("turns the locked-month refusal into a 422", async () => {
    mockRpc({ commission_add_adjustment: { error: { message: "commission_month_locked" } } });
    const res = await authed("/api/hr/runs/adjustments", "hr", {
      method: "POST",
      body: JSON.stringify({ year: 2026, month: 7, subjectId: SP, amount: -183, reason: "refund" }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toBe("commission_month_locked");
  });
});

describe("GET /api/hr/runs/:id/csv", () => {
  it("builds the payroll file from the FROZEN lines", async () => {
    mockRpc({
      commission_run_detail: {
        data: {
          id: RUN, year: 2026, month: 7, program: "staff", status: "approved",
          totalCommission: 914.4, totalAdjustments: 0, totalPayable: 914.4, peopleCount: 1,
          lines: [{
            subjectKind: "salesperson", subjectId: SP, staffCode: "CR008",
            name: "Mayson", storeName: "Carres Kelana Jaya", orderCount: 5,
            basis: 30480, ratePct: 3, direct: 914.4, override: 0, perModel: 0,
            milestone: 0, kpiBonus: 0, adjustments: 0, total: 914.4,
          }],
          adjustmentRows: [],
        },
      },
    });
    const res = await authed(`/api/hr/runs/${RUN}/csv`, "hr");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("commission-staff-2026-07.csv");
    const text = await res.text();
    expect(text.split("\r\n")[0]).toBe(
      "staff_code,name,store,month,sales_basis,commission,kpi_bonus,adjustments,total",
    );
    expect(text).toContain("CR008,Mayson,Carres Kelana Jaya,2026-07,30480.00,914.40");
  });
});
