import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { adminClient, userClient } from "../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-hr-team";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
  STAFF_SESSION_SECRET: "test-staff-secret-hr-team-abc",
};

const USER_A = "00000000-0000-0000-0000-0000000000a1";
const POSITION_COO = "00000000-0000-0000-0000-0000000000b1";
const SHOWROOM = "00000000-0000-0000-0000-000000000d01";
const OUTLET = "00000000-0000-0000-0000-00000000aa01";

let signKey: KeyLike;
let publicJwk: JWK;

beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  signKey = kp.privateKey as KeyLike;
  publicJwk = { ...(await exportJWK(kp.publicKey)), kid: KID, alg: "ES256", use: "sig" };
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
});
afterEach(() => {
  vi.mocked(userClient).mockReset();
  vi.mocked(adminClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

async function makeJwt(role: string) {
  return new SignJWT({ email: "hr@carres.com", app_metadata: { role } })
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

function mockUserRpc(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  vi.mocked(userClient).mockReturnValue({ rpc } as never);
  return rpc;
}

/**
 * Awaitable query-chain stub: every builder method returns the chain; awaiting
 * it (or .single()/.maybeSingle()) resolves the row configured per table.
 */
type TableResult = { data?: unknown; error?: { code?: string; message: string } | null };
function makeAdminMock(tables: Record<string, TableResult | TableResult[]>, opts?: {
  rpc?: (fn: string) => TableResult;
  createUser?: TableResult & { data?: { user: { id: string } } | null };
}) {
  const calls: Record<string, unknown[]> = {};
  const perTableHits: Record<string, number> = {};
  const from = vi.fn((table: string) => {
    const conf = tables[table];
    const hit = (perTableHits[table] = (perTableHits[table] ?? 0) + 1);
    const result: TableResult =
      (Array.isArray(conf) ? conf[hit - 1] : conf) ?? { data: null, error: null };
    const resolved = { data: result.data ?? null, error: result.error ?? null };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "eq", "neq", "in", "is", "order", "limit", "update", "delete"]) {
      chain[m] = vi.fn(self);
    }
    chain.insert = vi.fn((row: unknown) => {
      (calls[table] ??= []).push(row);
      return chain;
    });
    chain.maybeSingle = vi.fn(async () => resolved);
    chain.single = vi.fn(async () => resolved);
    chain.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(onOk, onErr);
    return chain;
  });
  const admin = {
    from,
    rpc: vi.fn(async (fn: string) => {
      const r = opts?.rpc?.(fn) ?? { data: null, error: null };
      return { data: r.data ?? null, error: r.error ?? null };
    }),
    auth: {
      admin: {
        createUser: vi.fn(async () => ({
          data: opts?.createUser?.data ?? null,
          error: opts?.createUser?.error ?? null,
        })),
        deleteUser: vi.fn(async () => ({ data: null, error: null })),
      },
    },
  };
  vi.mocked(adminClient).mockReturnValue(admin as never);
  return { admin, calls };
}

describe("GET /api/hr/team", () => {
  it("401 without a token", async () => {
    const res = await req("/api/hr/team");
    expect(res.status).toBe(401);
  });

  it("403 for a non-HR role", async () => {
    const res = await authed("/api/hr/team", "dealer");
    expect(res.status).toBe(403);
  });

  it("returns the gated hr_team_source blob for hr", async () => {
    const blob = { accounts: [], showroomStaff: [], positions: [], history: [] };
    const rpc = mockUserRpc({ data: blob });
    const res = await authed("/api/hr/team", "hr");
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("hr_team_source");
    expect(await res.json()).toEqual(blob);
  });

  it("principal may read too", async () => {
    mockUserRpc({ data: { accounts: [], showroomStaff: [], positions: [], history: [] } });
    const res = await authed("/api/hr/team", "principal");
    expect(res.status).toBe(200);
  });
});

describe("POST /api/hr/team/position", () => {
  it("calls the audited RPC with userId + positionId", async () => {
    const rpc = mockUserRpc({ data: null });
    const res = await authed("/api/hr/team/position", "hr", {
      method: "POST",
      body: JSON.stringify({ userId: USER_A, positionId: POSITION_COO }),
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("hr_set_position", {
      p_user_id: USER_A,
      p_position_id: POSITION_COO,
    });
  });

  it("422 when the target is a dealer account (outside the hierarchy)", async () => {
    mockUserRpc({ error: { message: "dealer_not_in_hierarchy" } });
    const res = await authed("/api/hr/team/position", "hr", {
      method: "POST",
      body: JSON.stringify({ userId: USER_A, positionId: null }),
    });
    expect(res.status).toBe(422);
  });
});

describe("POST /api/hr/team/reports-to", () => {
  it("422 on a reporting cycle", async () => {
    mockUserRpc({ error: { message: "reporting_cycle" } });
    const res = await authed("/api/hr/team/reports-to", "hr", {
      method: "POST",
      body: JSON.stringify({ userId: USER_A, managerId: POSITION_COO }),
    });
    expect(res.status).toBe(422);
  });
});

describe("POST /api/hr/team/staff-code", () => {
  it("422 when the code is already taken (cross-table unique)", async () => {
    mockUserRpc({ error: { message: "staff_code_taken" } });
    const res = await authed("/api/hr/team/staff-code", "hr", {
      method: "POST",
      body: JSON.stringify({ kind: "hq_user", id: USER_A, code: "CR001" }),
    });
    expect(res.status).toBe(422);
  });

  it("rejects a malformed code at the contract", async () => {
    const res = await authed("/api/hr/team/staff-code", "hr", {
      method: "POST",
      body: JSON.stringify({ kind: "hq_user", id: USER_A, code: "not a code" }),
    });
    expect(res.status).toBe(422);
  });
});

describe("POST /api/hr/team/accounts", () => {
  it("only a principal can mint a principal account", async () => {
    const res = await authed("/api/hr/team/accounts", "hr", {
      method: "POST",
      body: JSON.stringify({
        name: "Boss Two",
        email: "boss2@carres.com",
        role: "principal",
        tempPassword: "longenough1",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("supplier requires companyName", async () => {
    const res = await authed("/api/hr/team/accounts", "hr", {
      method: "POST",
      body: JSON.stringify({
        name: "Vendor",
        email: "vendor@x.com",
        role: "supplier",
        tempPassword: "longenough1",
      }),
    });
    expect(res.status).toBe(422);
  });

  it("dealer role is not creatable from the Team door", async () => {
    const res = await authed("/api/hr/team/accounts", "hr", {
      method: "POST",
      body: JSON.stringify({
        name: "Store",
        email: "store@x.com",
        role: "dealer",
        tempPassword: "longenough1",
      }),
    });
    expect(res.status).toBe(422);
  });

  it("mints an internal account with a CRnnn code + position + hire history", async () => {
    const NEW_ID = "22222222-2222-2222-2222-000000000001";
    const { admin, calls } = makeAdminMock(
      {
        app_users: [{ data: null }, { data: null }], // uniqueness probe, then insert
        org_positions: { data: { name: "COO" } },
        org_position_history: { data: null },
        audit_log: { data: null },
      },
      {
        rpc: (fn) => (fn === "next_staff_code" ? { data: "CR010" } : { data: null }),
        createUser: { data: { user: { id: NEW_ID } } },
      },
    );
    const res = await authed("/api/hr/team/accounts", "hr", {
      method: "POST",
      body: JSON.stringify({
        name: "New Ops",
        email: "newops@carres.com",
        role: "operation",
        tempPassword: "longenough1",
        positionId: POSITION_COO,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { staffCode: string; id: string };
    expect(body.staffCode).toBe("CR010");
    expect(body.id).toBe(NEW_ID);
    expect(admin.auth.admin.createUser).toHaveBeenCalled();
    const inserted = (calls.app_users ?? [])[0] as Record<string, unknown>;
    expect(inserted.staff_code).toBe("CR010");
    expect(inserted.position_id).toBe(POSITION_COO);
    const hist = (calls.org_position_history ?? [])[0] as Record<string, unknown>;
    expect(hist.new_position).toBe("COO");
  });

  it("external supplier gets NO staff code", async () => {
    const NEW_ID = "22222222-2222-2222-2222-000000000002";
    const { admin, calls } = makeAdminMock(
      {
        app_users: [{ data: null }, { data: null }],
        suppliers: { data: { id: "33333333-3333-3333-3333-000000000001" } },
        audit_log: { data: null },
      },
      { createUser: { data: { user: { id: NEW_ID } } } },
    );
    const res = await authed("/api/hr/team/accounts", "hr", {
      method: "POST",
      body: JSON.stringify({
        name: "Vendor",
        email: "vendor@x.com",
        role: "supplier",
        companyName: "Vendor Sdn Bhd",
        tempPassword: "longenough1",
      }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { staffCode: string | null }).staffCode).toBeNull();
    expect(admin.rpc).not.toHaveBeenCalledWith("next_staff_code");
    const inserted = (calls.app_users ?? [])[0] as Record<string, unknown>;
    expect(inserted.staff_code).toBeNull();
  });
});

describe("POST /api/hr/team/showroom-staff", () => {
  it("rejects a store principal (showrooms cap at manager)", async () => {
    const res = await authed("/api/hr/team/showroom-staff", "hr", {
      method: "POST",
      body: JSON.stringify({ dealerId: SHOWROOM, name: "X", staffRole: "principal" }),
    });
    expect(res.status).toBe(403);
  });

  it("422 when the store is dealer-channel (not our staff)", async () => {
    makeAdminMock({
      dealers: { data: { id: SHOWROOM, name: "Some Dealer", channel: "dealer" } },
    });
    const res = await authed("/api/hr/team/showroom-staff", "hr", {
      method: "POST",
      body: JSON.stringify({ dealerId: SHOWROOM, name: "X", staffRole: "salesperson" }),
    });
    expect(res.status).toBe(422);
  });

  it("creates the staff row with a minted CRnnn code + hire history", async () => {
    const { calls } = makeAdminMock(
      {
        dealers: { data: { id: SHOWROOM, name: "Carres Kelana Jaya", channel: "showroom" } },
        outlets: { data: { id: OUTLET, dealer_id: SHOWROOM } },
        salespersons: { data: { id: "44444444-4444-4444-4444-000000000001", name: "New Girl" } },
        org_position_history: { data: null },
        audit_log: { data: null },
      },
      { rpc: (fn) => (fn === "next_staff_code" ? { data: "CR011" } : { data: null }) },
    );
    const res = await authed("/api/hr/team/showroom-staff", "hr", {
      method: "POST",
      body: JSON.stringify({
        dealerId: SHOWROOM,
        outletId: OUTLET,
        name: "New Girl",
        staffRole: "salesperson",
      }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { staffCode: string }).staffCode).toBe("CR011");
    const inserted = (calls.salespersons ?? [])[0] as Record<string, unknown>;
    expect(inserted.staff_code).toBe("CR011");
    const hist = (calls.org_position_history ?? [])[0] as Record<string, unknown>;
    expect(hist.new_position).toBe("Sales Executive");
  });
});
