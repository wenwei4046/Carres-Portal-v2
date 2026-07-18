import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";
import { mintStaffToken } from "../lib/staff-token";

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient, adminClient } from "../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-staff";
const STAFF_SESSION_SECRET = "test-staff-secret-0232-abcdef";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
  STAFF_SESSION_SECRET,
};

const DEALER_A = "00000000-0000-0000-0000-000000000d01";
const DEALER_B = "00000000-0000-0000-0000-000000000d02";
const OUTLET_1 = "00000000-0000-0000-0000-00000000ee01";
const OUTLET_2 = "00000000-0000-0000-0000-00000000ee02";
const SP1 = "00000000-0000-0000-0000-00000000ff01";
const SP2 = "00000000-0000-0000-0000-00000000ff02";
const MGR = "00000000-0000-0000-0000-00000000ffa1";
const SELF_USER = "11111111-1111-1111-1111-000000000999"; // matches makeJwt sub

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string, dealerId: string | null) {
  return new SignJWT({
    email: "store@carres.com",
    app_metadata: { role, ...(dealerId ? { dealer_id: dealerId } : {}) },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject(SELF_USER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

function spRow(over: Record<string, unknown> = {}) {
  return {
    id: SP1,
    dealer_id: DEALER_A,
    outlet_id: OUTLET_1,
    name: "Aida",
    phone: null,
    user_id: null,
    created_at: "2026-01-01T00:00:00Z",
    staff_role: "salesperson",
    color: "flame",
    active: true,
    ...over,
  };
}

/**
 * A userClient stub covering the salespersons read/insert/update chains + the
 * app_users showroom probe. `.eq()` records the last column so `.maybeSingle()`
 * can answer by-id vs by-user_id.
 */
function mockUser(cfg: {
  list?: unknown[];
  byId?: unknown | null;
  byUserId?: unknown | null;
  inserted?: unknown;
  updated?: unknown;
  appUsersShowroom?: boolean;
  /** dealer_id the outlets-table lookup reports (0232 outlet-ownership guard). */
  outletDealer?: string;
  captureInsert?: (row: Record<string, unknown>) => void;
  captureUpdate?: (row: Record<string, unknown>) => void;
}) {
  function chain(table: string) {
    const eqs: Array<[string, unknown]> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch: any = {
      eq(col: string, val: unknown) {
        eqs.push([col, val]);
        return ch;
      },
      in() {
        return ch;
      },
      order: async () => ({ data: cfg.list ?? [], error: null }),
      limit: async () => {
        if (table === "app_users") {
          return { data: cfg.appUsersShowroom ? [{ role: "showroom" }] : [], error: null };
        }
        return { data: cfg.list ?? [], error: null };
      },
      maybeSingle: async () => {
        if (table === "outlets") {
          const eqVal = eqs[eqs.length - 1]?.[1];
          return { data: { id: eqVal, dealer_id: cfg.outletDealer ?? DEALER_A }, error: null };
        }
        const last = eqs[eqs.length - 1]?.[0];
        if (last === "user_id") return { data: cfg.byUserId ?? null, error: null };
        return { data: cfg.byId ?? null, error: null };
      },
      select() {
        return ch;
      },
      single: async () => ({ data: cfg.updated ?? cfg.inserted ?? null, error: null }),
    };
    return ch;
  }
  return {
    from: (table: string) => ({
      select: () => chain(table),
      insert: (row: Record<string, unknown>) => {
        cfg.captureInsert?.(row);
        return {
          select: () => ({ single: async () => ({ data: cfg.inserted ?? row, error: null }) }),
        };
      },
      update: (row: Record<string, unknown>) => {
        cfg.captureUpdate?.(row);
        return {
          eq: () => ({
            select: () => ({ single: async () => ({ data: cfg.updated ?? row, error: null }) }),
          }),
        };
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/** adminClient stub — pins probes + the DEFINER rpcs. */
function mockAdmin(cfg: {
  verifyResult?: Record<string, unknown>;
  verifyError?: { message: string };
  pinRows?: Array<{ salesperson_id: string }>;
  pinById?: unknown | null;
  captureSetPin?: (args: unknown) => void;
} = {}) {
  return {
    from: () => ({
      select: () => ({
        in: async () => ({ data: cfg.pinRows ?? [], error: null }),
        eq: () => ({ maybeSingle: async () => ({ data: cfg.pinById ?? null, error: null }) }),
      }),
    }),
    rpc: async (name: string, args: unknown) => {
      if (name === "staff_verify_pin") {
        return { data: cfg.verifyResult ?? { status: "ok" }, error: cfg.verifyError ?? null };
      }
      if (name === "staff_set_pin") {
        cfg.captureSetPin?.(args);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  signKey = kp.privateKey;
  publicJwk = await exportJWK(kp.publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
});

beforeEach(() => {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
  vi.mocked(userClient).mockReset();
  vi.mocked(adminClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

// ---------------------------------------------------------------------------
// GET /api/staff
// ---------------------------------------------------------------------------
describe("GET /api/staff", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(new Request("http://t/api/staff"), env);
    expect(res.status).toBe(401);
  });

  it("returns roster + activated + hasPin + selfStaffId + storeKind (dealer)", async () => {
    vi.mocked(userClient).mockReturnValue(
      mockUser({ list: [spRow({ id: SP1 }), spRow({ id: SP2, user_id: SELF_USER, name: "Ben" })] }),
    );
    vi.mocked(adminClient).mockReturnValue(mockAdmin({ pinRows: [{ salesperson_id: SP1 }] }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/staff", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      staff: Array<{ id: string; hasPin: boolean }>;
      activated: boolean;
      selfStaffId: string | null;
      storeKind: string;
    };
    expect(body.activated).toBe(true);
    expect(body.storeKind).toBe("dealer");
    expect(body.selfStaffId).toBe(SP2);
    expect(body.staff.find((s) => s.id === SP1)?.hasPin).toBe(true);
    expect(body.staff.find((s) => s.id === SP2)?.hasPin).toBe(false);
  });

  it("activated=false when no staff has a PIN", async () => {
    vi.mocked(userClient).mockReturnValue(mockUser({ list: [spRow()] }));
    vi.mocked(adminClient).mockReturnValue(mockAdmin({ pinRows: [] }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/staff", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    const body = (await res.json()) as { activated: boolean };
    expect(body.activated).toBe(false);
  });

  it("showroom login reports storeKind=showroom", async () => {
    vi.mocked(userClient).mockReturnValue(mockUser({ list: [spRow()] }));
    vi.mocked(adminClient).mockReturnValue(mockAdmin({ pinRows: [] }));
    const jwt = await makeJwt("showroom", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/staff", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    const body = (await res.json()) as { storeKind: string };
    expect(body.storeKind).toBe("showroom");
  });

  it("internal principal must pass a ?dealerId=", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/staff", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("403 for a role that cannot manage staff (operation)", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/staff", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/staff/verify-pin
// ---------------------------------------------------------------------------
describe("POST /api/staff/verify-pin", () => {
  async function call(body: unknown, admin: ReturnType<typeof mockAdmin>, byId: unknown = spRow()) {
    vi.mocked(userClient).mockReturnValue(mockUser({ byId }));
    vi.mocked(adminClient).mockReturnValue(admin);
    const jwt = await makeJwt("dealer", DEALER_A);
    return app.fetch(
      new Request("http://t/api/staff/verify-pin", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
  }

  it("ok → 200 with token + tier + outletId", async () => {
    const res = await call({ salespersonId: SP1, pin: "123456" }, mockAdmin({ verifyResult: { status: "ok" } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; tier: string; outletId: string };
    expect(body.token.length).toBeGreaterThan(20);
    expect(body.tier).toBe("salesperson");
    expect(body.outletId).toBe(OUTLET_1);
  });

  it("bad_pin → 401 with remaining", async () => {
    const res = await call(
      { salespersonId: SP1, pin: "000000" },
      mockAdmin({ verifyResult: { status: "bad_pin", remaining: 3 } }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "bad_pin", remaining: 3 });
  });

  it("locked → 423 with lockedUntil", async () => {
    const res = await call(
      { salespersonId: SP1, pin: "000000" },
      mockAdmin({ verifyResult: { status: "locked", locked_until: "2026-07-18T10:00:00Z" } }),
    );
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "pin_locked", lockedUntil: "2026-07-18T10:00:00Z" });
  });

  it("no_pin → 409", async () => {
    const res = await call({ salespersonId: SP1, pin: "123456" }, mockAdmin({ verifyResult: { status: "no_pin" } }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no_pin" });
  });

  it("404 for a salesperson outside the caller's dealer (RLS-hidden / wrong dealer)", async () => {
    const res = await call({ salespersonId: SP1, pin: "123456" }, mockAdmin(), null);
    expect(res.status).toBe(404);
  });

  it("403 for a principal role (no dealer scope for a PIN)", async () => {
    vi.mocked(userClient).mockReturnValue(mockUser({}));
    vi.mocked(adminClient).mockReturnValue(mockAdmin());
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/staff/verify-pin", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ salespersonId: SP1, pin: "123456" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/staff/reauth
// ---------------------------------------------------------------------------
describe("POST /api/staff/reauth", () => {
  it("ok → 200 owner-mode token (password grant succeeds)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ access_token: "x" }), { status: 200 }));
    vi.mocked(userClient).mockReturnValue(mockUser({ byUserId: null }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/staff/reauth", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password: "correct-horse" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token.length).toBeGreaterThan(20);
    fetchSpy.mockRestore();
  });

  it("bad password → 401", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    vi.mocked(userClient).mockReturnValue(mockUser({ byUserId: null }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/staff/reauth", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password: "wrong" }),
      }),
      env,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "bad_password" });
    fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// POST /api/staff/self-token
// ---------------------------------------------------------------------------
describe("POST /api/staff/self-token", () => {
  it("linked salesperson → 200 token", async () => {
    vi.mocked(userClient).mockReturnValue(mockUser({ byUserId: spRow({ user_id: SELF_USER }) }));
    const jwt = await makeJwt("salesperson", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/staff/self-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; tier: string };
    expect(body.token.length).toBeGreaterThan(20);
    expect(body.tier).toBe("salesperson");
  });

  it("unlinked → 409", async () => {
    vi.mocked(userClient).mockReturnValue(mockUser({ byUserId: null }));
    const jwt = await makeJwt("salesperson", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/staff/self-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "unlinked" });
  });

  it("403 for a dealer role (self-token is salesperson-only)", async () => {
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/staff/self-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/staff — create (tier matrix)
// ---------------------------------------------------------------------------
describe("POST /api/staff (create)", () => {
  /** A dealer-family caller carrying a staff token of the given tier/outlet. */
  async function callWithToken(
    tier: "principal" | "manager" | "salesperson",
    oid: string | null,
    body: unknown,
    user: ReturnType<typeof mockUser>,
    admin = mockAdmin(),
  ) {
    vi.mocked(userClient).mockReturnValue(user);
    vi.mocked(adminClient).mockReturnValue(admin);
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await mintStaffToken(env, { sid: MGR, did: DEALER_A, oid, tier });
    return app.fetch(
      new Request("http://t/api/staff", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          "X-Staff-Token": token,
        },
        body: JSON.stringify(body),
      }),
      env,
    );
  }

  it("principal-tier creates a salesperson → 201", async () => {
    let captured: Record<string, unknown> | undefined;
    const res = await callWithToken(
      "principal",
      null,
      { name: "Cara", staffRole: "salesperson", outletId: OUTLET_1, color: "ocean" },
      mockUser({ inserted: spRow({ id: SP2, name: "Cara", staff_role: "salesperson", color: "ocean" }), captureInsert: (r) => (captured = r) }),
    );
    expect(res.status).toBe(201);
    expect(captured?.staff_role).toBe("salesperson");
  });

  it("manager creating a manager → 403", async () => {
    const res = await callWithToken(
      "manager",
      OUTLET_1,
      { name: "Boss2", staffRole: "manager" },
      mockUser({}),
    );
    expect(res.status).toBe(403);
  });

  it("manager creating a salesperson forces the manager's outlet", async () => {
    let captured: Record<string, unknown> | undefined;
    const res = await callWithToken(
      "manager",
      OUTLET_1,
      // caller tries to plant them in OUTLET_2 — server forces OUTLET_1.
      { name: "Dee", staffRole: "salesperson", outletId: OUTLET_2 },
      mockUser({ inserted: spRow({ id: SP2, name: "Dee" }), captureInsert: (r) => (captured = r) }),
    );
    expect(res.status).toBe(201);
    expect(captured?.outlet_id).toBe(OUTLET_1);
  });

  it("salesperson-tier → 403", async () => {
    const res = await callWithToken(
      "salesperson",
      OUTLET_1,
      { name: "Eve", staffRole: "salesperson" },
      mockUser({}),
    );
    expect(res.status).toBe(403);
  });

  it("dealer-family caller WITHOUT a staff token → 403 (must identify first)", async () => {
    vi.mocked(userClient).mockReturnValue(mockUser({}));
    vi.mocked(adminClient).mockReturnValue(mockAdmin());
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/staff", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Zed", staffRole: "salesperson" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("internal principal creating a store principal for a SHOWROOM → 403", async () => {
    vi.mocked(userClient).mockReturnValue(mockUser({ appUsersShowroom: true }));
    vi.mocked(adminClient).mockReturnValue(mockAdmin());
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/staff?dealerId=${DEALER_B}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Owner", staffRole: "principal" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("internal principal creating a manager for a dealer → 201 (dealer scope from ?dealerId=)", async () => {
    let captured: Record<string, unknown> | undefined;
    vi.mocked(userClient).mockReturnValue(
      mockUser({
        appUsersShowroom: false,
        outletDealer: DEALER_B,
        inserted: spRow({ id: SP2, dealer_id: DEALER_B, staff_role: "manager" }),
        captureInsert: (r) => (captured = r),
      }),
    );
    vi.mocked(adminClient).mockReturnValue(mockAdmin());
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/staff?dealerId=${DEALER_B}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Mgr", staffRole: "manager", outletId: OUTLET_1 }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(captured?.dealer_id).toBe(DEALER_B);
    expect(captured?.staff_role).toBe("manager");
  });

  // 0232 owner-mode (sid null, minted only by /reauth): the showroom
  // bootstrap path — a password-proven store credential creates its manager.
  it("owner-mode manager token (sid null) creates a MANAGER → 201 (showroom bootstrap)", async () => {
    let captured: Record<string, unknown> | undefined;
    vi.mocked(userClient).mockReturnValue(
      mockUser({
        inserted: spRow({ id: SP2, staff_role: "manager", outlet_id: OUTLET_1 }),
        captureInsert: (r) => (captured = r),
      }),
    );
    vi.mocked(adminClient).mockReturnValue(mockAdmin());
    const jwt = await makeJwt("showroom", DEALER_A);
    const token = await mintStaffToken(env, { sid: null, did: DEALER_A, oid: null, tier: "manager" });
    const res = await app.fetch(
      new Request("http://t/api/staff", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          "X-Staff-Token": token,
        },
        body: JSON.stringify({ name: "Showroom Mgr", staffRole: "manager", outletId: OUTLET_1, pin: "135790" }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(captured?.staff_role).toBe("manager");
    expect(captured?.outlet_id).toBe(OUTLET_1);
  });

  it("owner-mode manager token creating a store PRINCIPAL → 403", async () => {
    vi.mocked(userClient).mockReturnValue(mockUser({}));
    vi.mocked(adminClient).mockReturnValue(mockAdmin());
    const jwt = await makeJwt("showroom", DEALER_A);
    const token = await mintStaffToken(env, { sid: null, did: DEALER_A, oid: null, tier: "manager" });
    const res = await app.fetch(
      new Request("http://t/api/staff", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          "X-Staff-Token": token,
        },
        body: JSON.stringify({ name: "Owner", staffRole: "principal" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("create with an outlet belonging to ANOTHER dealer → 422", async () => {
    const res = await callWithToken(
      "principal",
      null,
      { name: "Fay", staffRole: "salesperson", outletId: OUTLET_2 },
      mockUser({ outletDealer: DEALER_B }),
    );
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// POST /api/staff/:id/pin — set-pin scope matrix
// ---------------------------------------------------------------------------
describe("POST /api/staff/:id/pin", () => {
  async function callWithToken(
    tier: "principal" | "manager" | "salesperson",
    oid: string | null,
    sid: string | null,
    targetId: string,
    target: unknown,
    capture?: (a: unknown) => void,
  ) {
    vi.mocked(userClient).mockReturnValue(mockUser({ byId: target }));
    vi.mocked(adminClient).mockReturnValue(mockAdmin({ captureSetPin: capture }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await mintStaffToken(env, { sid, did: DEALER_A, oid, tier });
    return app.fetch(
      new Request(`http://t/api/staff/${targetId}/pin`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          "X-Staff-Token": token,
        },
        body: JSON.stringify({ pin: "654321" }),
      }),
      env,
    );
  }

  it("principal sets anyone's PIN → 200", async () => {
    let args: unknown;
    const res = await callWithToken("principal", null, MGR, SP1, spRow({ id: SP1 }), (a) => (args = a));
    expect(res.status).toBe(200);
    expect((args as { p_salesperson_id: string }).p_salesperson_id).toBe(SP1);
  });

  it("manager sets own-outlet salesperson PIN → 200", async () => {
    const res = await callWithToken("manager", OUTLET_1, MGR, SP1, spRow({ id: SP1, outlet_id: OUTLET_1 }));
    expect(res.status).toBe(200);
  });

  it("manager cannot set a PIN for another outlet's salesperson → 403", async () => {
    const res = await callWithToken("manager", OUTLET_1, MGR, SP2, spRow({ id: SP2, outlet_id: OUTLET_2 }));
    expect(res.status).toBe(403);
  });

  it("manager can set their OWN PIN → 200", async () => {
    const res = await callWithToken("manager", OUTLET_1, MGR, MGR, spRow({ id: MGR, staff_role: "manager", outlet_id: OUTLET_1 }));
    expect(res.status).toBe(200);
  });

  it("salesperson can set their own PIN → 200", async () => {
    const res = await callWithToken("salesperson", OUTLET_1, SP1, SP1, spRow({ id: SP1 }));
    expect(res.status).toBe(200);
  });

  it("salesperson cannot set another's PIN → 403", async () => {
    const res = await callWithToken("salesperson", OUTLET_1, SP1, SP2, spRow({ id: SP2 }));
    expect(res.status).toBe(403);
  });

  // 0232 owner-mode: showroom forgot-PIN recovery — the password-proven
  // store credential may reset the MANAGER's PIN.
  it("owner-mode manager token (sid null) resets a manager's PIN → 200", async () => {
    const res = await callWithToken(
      "manager",
      null,
      null,
      MGR,
      spRow({ id: MGR, staff_role: "manager", outlet_id: OUTLET_1 }),
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/staff/:id — tier-gated field edits
// ---------------------------------------------------------------------------
describe("PATCH /api/staff/:id", () => {
  async function callWithToken(
    tier: "principal" | "manager" | "salesperson",
    oid: string | null,
    body: unknown,
    target: unknown,
    capture?: (r: Record<string, unknown>) => void,
  ) {
    vi.mocked(userClient).mockReturnValue(
      mockUser({ byId: target, updated: spRow({ id: SP1, ...(typeof body === "object" ? {} : {}) }), captureUpdate: capture }),
    );
    vi.mocked(adminClient).mockReturnValue(mockAdmin({ pinById: null }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await mintStaffToken(env, { sid: MGR, did: DEALER_A, oid, tier });
    return app.fetch(
      new Request(`http://t/api/staff/${SP1}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          "X-Staff-Token": token,
        },
        body: JSON.stringify(body),
      }),
      env,
    );
  }

  it("principal can change tier → 200 (staff_role written)", async () => {
    let captured: Record<string, unknown> | undefined;
    const res = await callWithToken(
      "principal",
      null,
      { staffRole: "manager" },
      spRow({ id: SP1, staff_role: "salesperson" }),
      (r) => (captured = r),
    );
    expect(res.status).toBe(200);
    expect(captured?.staff_role).toBe("manager");
  });

  it("manager cannot change tier → 403", async () => {
    const res = await callWithToken(
      "manager",
      OUTLET_1,
      { staffRole: "manager" },
      spRow({ id: SP1, staff_role: "salesperson", outlet_id: OUTLET_1 }),
    );
    expect(res.status).toBe(403);
  });

  it("manager can deactivate an own-outlet salesperson → 200", async () => {
    let captured: Record<string, unknown> | undefined;
    const res = await callWithToken(
      "manager",
      OUTLET_1,
      { active: false },
      spRow({ id: SP1, staff_role: "salesperson", outlet_id: OUTLET_1 }),
      (r) => (captured = r),
    );
    expect(res.status).toBe(200);
    expect(captured?.active).toBe(false);
  });

  it("salesperson-tier → 403", async () => {
    const res = await callWithToken("salesperson", OUTLET_1, { name: "x" }, spRow({ id: SP1 }));
    expect(res.status).toBe(403);
  });

  it("404 for a target in another dealer", async () => {
    const res = await callWithToken(
      "principal",
      null,
      { name: "x" },
      spRow({ id: SP1, dealer_id: DEALER_B }),
    );
    expect(res.status).toBe(404);
  });

  // 0232 owner-mode: the showroom store credential may rename/deactivate any
  // staff of its store (tier/outlet still principal-only).
  it("owner-mode manager token (sid null) renames the MANAGER row → 200", async () => {
    let captured: Record<string, unknown> | undefined;
    vi.mocked(userClient).mockReturnValue(
      mockUser({
        byId: spRow({ id: SP1, staff_role: "manager", outlet_id: OUTLET_1 }),
        updated: spRow({ id: SP1, staff_role: "manager", name: "Renamed" }),
        captureUpdate: (r) => (captured = r),
      }),
    );
    vi.mocked(adminClient).mockReturnValue(mockAdmin({ pinById: null }));
    const jwt = await makeJwt("showroom", DEALER_A);
    const token = await mintStaffToken(env, { sid: null, did: DEALER_A, oid: null, tier: "manager" });
    const res = await app.fetch(
      new Request(`http://t/api/staff/${SP1}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          "X-Staff-Token": token,
        },
        body: JSON.stringify({ name: "Renamed" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(captured?.name).toBe("Renamed");
  });

  it("principal moving staff to ANOTHER dealer's outlet → 422", async () => {
    vi.mocked(userClient).mockReturnValue(
      mockUser({
        byId: spRow({ id: SP1 }),
        outletDealer: DEALER_B,
      }),
    );
    vi.mocked(adminClient).mockReturnValue(mockAdmin({ pinById: null }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const token = await mintStaffToken(env, { sid: MGR, did: DEALER_A, oid: null, tier: "principal" });
    const res = await app.fetch(
      new Request(`http://t/api/staff/${SP1}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          "X-Staff-Token": token,
        },
        body: JSON.stringify({ outletId: OUTLET_2 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});
