import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-hr";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
  STAFF_SESSION_SECRET: "test-staff-secret-hr-abcdef",
};

const DEALER = "00000000-0000-0000-0000-000000000d01";
const OUTLET = "00000000-0000-0000-0000-00000000aa01";
const SP_KAAN = "00000000-0000-0000-0000-00000000ff01";
const SP_MAYSON = "00000000-0000-0000-0000-00000000ff02";
const MODEL_A = "00000000-0000-0000-0000-00000000ab01";
const ORDER_1 = "00000000-0000-0000-0000-00000000e001";

let signKey: KeyLike;
let publicJwk: JWK;

beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  signKey = kp.privateKey as KeyLike;
  publicJwk = { ...(await exportJWK(kp.publicKey)), kid: KID, alg: "ES256", use: "sig" };
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
});
afterEach(() => vi.mocked(userClient).mockReset());
afterAll(() => _setJwksForTesting(null));

async function makeJwt(role: string) {
  return new SignJWT({
    email: "hr@carres.com",
    app_metadata: { role },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000777")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

function req(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://t${path}`, init), env);
}

async function authed(path: string, role: string, init?: RequestInit) {
  return req(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${await makeJwt(role)}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function sourceBlob() {
  return {
    staff: [
      {
        id: SP_KAAN, name: "Kaan", staffRole: "salesperson", active: true,
        dealerId: DEALER, outletId: OUTLET, storeName: "Kelana Jaya", outletName: null,
      },
      {
        id: SP_MAYSON, name: "Mayson", staffRole: "manager", active: true,
        dealerId: DEALER, outletId: OUTLET, storeName: "Kelana Jaya", outletName: null,
      },
    ],
    models: [{ id: MODEL_A, name: "Model A", category: "mattress" }],
    lines: [
      {
        orderId: ORDER_1, so: 1001, placedAt: "2026-07-10T10:00:00Z",
        salespersonId: SP_KAAN, dealerId: DEALER, outletId: OUTLET,
        modelId: MODEL_A, modelName: "Model A",
        category: "mattress", qty: 2, unitPrice: 1000,
      },
    ],
    unattributed: [
      { orderId: "00000000-0000-0000-0000-00000000e002", so: 1002, amount: 500 },
    ],
    config: {
      schemes: [],
      rates: [
        { salespersonId: SP_KAAN, pct: 5, effectiveFrom: "2026-01-01" },
        { salespersonId: SP_MAYSON, pct: 6, effectiveFrom: "2026-01-01" },
      ],
      modelRates: [],
      modelTiers: [],
      milestones: [],
    },
  };
}

function mockRpc(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  vi.mocked(userClient).mockReturnValue({ rpc } as never);
  return rpc;
}

describe("GET /api/hr/report", () => {
  it("401 without a token", async () => {
    const res = await req("/api/hr/report?year=2026&month=7");
    expect(res.status).toBe(401);
  });

  it("403 for a non-HR role", async () => {
    const res = await authed("/api/hr/report?year=2026&month=7", "dealer");
    expect(res.status).toBe(403);
  });

  it("422 on an invalid month", async () => {
    const res = await authed("/api/hr/report?year=2026&month=13", "hr");
    expect(res.status).toBe(422);
  });

  it("computes the month report for hr (5% direct + 1% manager override)", async () => {
    const rpc = mockRpc({ data: sourceBlob() });
    const res = await authed("/api/hr/report?year=2026&month=7", "hr");
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("hr_commission_source", { p_year: 2026, p_month: 7 });
    const body = (await res.json()) as {
      report: {
        perStaff: Array<{
          staff: { id: string };
          basis: number;
          directCommission: number;
          overrideCommission: number;
        }>;
        totalCommission: number;
      };
      unattributed: unknown[];
      models: unknown[];
    };
    const kaan = body.report.perStaff.find((r) => r.staff.id === SP_KAAN)!;
    const mayson = body.report.perStaff.find((r) => r.staff.id === SP_MAYSON)!;
    expect(kaan.basis).toBe(2000);
    expect(kaan.directCommission).toBe(100);
    expect(mayson.overrideCommission).toBe(20); // 1% of 2000
    expect(body.report.totalCommission).toBe(120);
    expect(body.unattributed).toHaveLength(1);
    expect(body.models).toHaveLength(1);
  });

  it("also admits principal", async () => {
    mockRpc({ data: sourceBlob() });
    const res = await authed("/api/hr/report?year=2026&month=7", "principal");
    expect(res.status).toBe(200);
  });

  it("maps RPC 42501 to 403", async () => {
    mockRpc({ error: { code: "42501", message: "forbidden" } });
    const res = await authed("/api/hr/report?year=2026&month=7", "hr");
    expect(res.status).toBe(403);
  });
});

describe("POST /api/hr/config/staff-rate", () => {
  it("upserts an effective-dated rate row", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    vi.mocked(userClient).mockReturnValue({
      from: () => ({ upsert }),
    } as never);
    const res = await authed("/api/hr/config/staff-rate", "hr", {
      method: "POST",
      body: JSON.stringify({ salespersonId: SP_KAAN, pct: 5, effectiveFrom: "2026-07-01" }),
    });
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ salesperson_id: SP_KAAN, pct: 5, effective_from: "2026-07-01" }),
      { onConflict: "salesperson_id,effective_from" },
    );
  });

  it("422 on pct out of range", async () => {
    const res = await authed("/api/hr/config/staff-rate", "hr", {
      method: "POST",
      body: JSON.stringify({ salespersonId: SP_KAAN, pct: 150 }),
    });
    expect(res.status).toBe(422);
  });
});
