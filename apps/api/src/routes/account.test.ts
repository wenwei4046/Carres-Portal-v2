import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";
import { mintStaffToken } from "../lib/staff-token";
import type { Bindings } from "../types";

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient, adminClient } from "../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-account";
const STAFF_SESSION_SECRET = "test-staff-secret-0239-abcdef";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
  STAFF_SESSION_SECRET,
};

const DEALER_A = "00000000-0000-0000-0000-000000000d01";
const SELF_USER = "11111111-1111-1111-1111-000000000999"; // matches makeJwt sub
const REQ = "00000000-0000-0000-0000-00000000ac01";
const SP1 = "00000000-0000-0000-0000-00000000ff01";

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

function ownerToken(tier: "principal" | "manager" | "salesperson" = "principal") {
  return mintStaffToken(env as unknown as Bindings, {
    sid: tier === "principal" ? null : SP1,
    did: DEALER_A,
    oid: null,
    tier,
  });
}

function reqRow(over: Record<string, unknown> = {}) {
  return {
    id: REQ,
    user_id: SELF_USER,
    dealer_id: DEALER_A,
    current_email: "store@carres.com",
    requested_email: "new@carres.com",
    status: "pending",
    requested_by_staff_id: null,
    requested_by_name: null,
    decision_note: null,
    decided_by: null,
    decided_at: null,
    created_at: "2026-07-19T00:00:00Z",
    ...over,
  };
}

/** userClient stub for the dealer-side routes (list / sp-name / insert / cancel). */
function mockUser(cfg: {
  latest?: unknown | null;
  spName?: string | null;
  insertError?: { code?: string; message: string } | null;
  inserted?: unknown;
  cancelUpdated?: unknown | null;
  captureInsert?: (row: Record<string, unknown>) => void;
}) {
  return {
    from: () => ({
      select: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ch: any = {
          eq: () => ch,
          order: () => ch,
          limit: async () => ({ data: cfg.latest ? [cfg.latest] : [], error: null }),
          maybeSingle: async () => ({
            data: cfg.spName != null ? { name: cfg.spName } : null,
            error: null,
          }),
        };
        return ch;
      },
      insert: (row: Record<string, unknown>) => {
        cfg.captureInsert?.(row);
        return {
          select: () => ({
            single: async () =>
              cfg.insertError
                ? { data: null, error: cfg.insertError }
                : { data: cfg.inserted ?? { ...reqRow(), ...row }, error: null },
          }),
        };
      },
      update: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ch: any = {
          eq: () => ch,
          select: () => ch,
          maybeSingle: async () => ({ data: cfg.cancelUpdated ?? null, error: null }),
        };
        return ch;
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/** adminClient stub — app_users probe + auth.admin + request-row decide chains. */
function mockAdmin(cfg: {
  requestRow?: unknown | null;
  appUserTaken?: boolean;
  decidedRow?: unknown | null;
  updateUserById?: ReturnType<typeof vi.fn>;
  captureAudit?: (row: Record<string, unknown>) => void;
  captureAppUsersUpdate?: (row: Record<string, unknown>) => void;
} = {}) {
  return {
    from: (table: string) => ({
      select: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ch: any = {
          eq: () => ch,
          neq: () => ch,
          order: () => ch,
          limit: async () => ({ data: [], error: null }),
          maybeSingle: async () => {
            if (table === "app_users") {
              return { data: cfg.appUserTaken ? { id: "someone-else" } : null, error: null };
            }
            return { data: cfg.requestRow ?? null, error: null };
          },
        };
        return ch;
      },
      insert: async (row: Record<string, unknown>) => {
        if (table === "audit_log") cfg.captureAudit?.(row);
        return { error: null };
      },
      update: (row: Record<string, unknown>) => {
        if (table === "app_users") cfg.captureAppUsersUpdate?.(row);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ch: any = {
          eq: () => ch,
          select: () => ch,
          single: async () => ({ data: cfg.decidedRow ?? null, error: null }),
          maybeSingle: async () => ({ data: cfg.decidedRow ?? null, error: null }),
          // `await update().eq()` (the app_users mirror write) resolves here.
          then: (resolve: (v: unknown) => void) => resolve({ error: null }),
        };
        return ch;
      },
    }),
    auth: {
      admin: {
        updateUserById: cfg.updateUserById ?? vi.fn(async () => ({ data: {}, error: null })),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function grantOk() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ access_token: "x" }), { status: 200 }));
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

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => _setJwksForTesting(null));

// ---------------------------------------------------------------------------
// Gate — dealer store + principal-tier staff session only
// ---------------------------------------------------------------------------
describe("/api/account/email-change gate", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(new Request("http://t/api/account/email-change"), env);
    expect(res.status).toBe(401);
  });

  it("403 for a showroom store login (credential belongs to Carres HQ)", async () => {
    const jwt = await makeJwt("showroom", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/account/email-change", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("403 for a dealer login WITHOUT a staff session", async () => {
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/account/email-change", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("403 for a salesperson-tier staff session", async () => {
    const jwt = await makeJwt("dealer", DEALER_A);
    const staff = await ownerToken("salesperson");
    const res = await app.fetch(
      new Request("http://t/api/account/email-change", {
        headers: { Authorization: `Bearer ${jwt}`, "X-Staff-Token": staff },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/account/email-change
// ---------------------------------------------------------------------------
describe("GET /api/account/email-change", () => {
  it("returns the latest request mapped to camelCase", async () => {
    vi.mocked(userClient).mockReturnValue(mockUser({ latest: reqRow() }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const staff = await ownerToken();
    const res = await app.fetch(
      new Request("http://t/api/account/email-change", {
        headers: { Authorization: `Bearer ${jwt}`, "X-Staff-Token": staff },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { request: { requestedEmail: string; status: string } | null };
    expect(body.request?.requestedEmail).toBe("new@carres.com");
    expect(body.request?.status).toBe("pending");
  });

  it("returns null when the store never filed one", async () => {
    vi.mocked(userClient).mockReturnValue(mockUser({ latest: null }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const staff = await ownerToken();
    const res = await app.fetch(
      new Request("http://t/api/account/email-change", {
        headers: { Authorization: `Bearer ${jwt}`, "X-Staff-Token": staff },
      }),
      env,
    );
    const body = (await res.json()) as { request: unknown };
    expect(body.request).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST /api/account/email-change
// ---------------------------------------------------------------------------
describe("POST /api/account/email-change", () => {
  async function post(body: unknown) {
    const jwt = await makeJwt("dealer", DEALER_A);
    const staff = await ownerToken();
    return app.fetch(
      new Request("http://t/api/account/email-change", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "X-Staff-Token": staff,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      env,
    );
  }

  it("201 — files the request (password re-proved, dealer + user stamped)", async () => {
    grantOk();
    let inserted: Record<string, unknown> | null = null;
    vi.mocked(userClient).mockReturnValue(
      mockUser({ captureInsert: (row) => (inserted = row) }),
    );
    vi.mocked(adminClient).mockReturnValue(mockAdmin({ appUserTaken: false }));
    const res = await post({ newEmail: "New@Carres.com", password: "store-pw" });
    expect(res.status).toBe(201);
    expect(inserted).not.toBeNull();
    expect(inserted!.user_id).toBe(SELF_USER);
    expect(inserted!.dealer_id).toBe(DEALER_A);
    // zod lowercases the requested email.
    expect(inserted!.requested_email).toBe("new@carres.com");
    // Owner-mode (sid null) files as the store credential itself.
    expect(inserted!.requested_by_staff_id).toBeNull();
  });

  it("401 bad_password when the store password grant fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 400 }));
    vi.mocked(userClient).mockReturnValue(mockUser({}));
    vi.mocked(adminClient).mockReturnValue(mockAdmin({}));
    const res = await post({ newEmail: "new@carres.com", password: "wrong" });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("bad_password");
  });

  it("422 same_email when the new email equals the current login", async () => {
    vi.mocked(userClient).mockReturnValue(mockUser({}));
    const res = await post({ newEmail: "store@carres.com", password: "store-pw" });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe("same_email");
  });

  it("422 email_in_use when another account already has it", async () => {
    grantOk();
    vi.mocked(userClient).mockReturnValue(mockUser({}));
    vi.mocked(adminClient).mockReturnValue(mockAdmin({ appUserTaken: true }));
    const res = await post({ newEmail: "taken@carres.com", password: "store-pw" });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe("email_in_use");
  });

  it("409 pending_exists on the one-pending partial unique", async () => {
    grantOk();
    vi.mocked(userClient).mockReturnValue(
      mockUser({ insertError: { code: "23505", message: "duplicate key" } }),
    );
    vi.mocked(adminClient).mockReturnValue(mockAdmin({ appUserTaken: false }));
    const res = await post({ newEmail: "new@carres.com", password: "store-pw" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("pending_exists");
  });
});

// ---------------------------------------------------------------------------
// POST /api/account/email-change/:id/cancel
// ---------------------------------------------------------------------------
describe("POST /api/account/email-change/:id/cancel", () => {
  async function cancel(updated: unknown | null) {
    vi.mocked(userClient).mockReturnValue(mockUser({ cancelUpdated: updated }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const staff = await ownerToken();
    return app.fetch(
      new Request(`http://t/api/account/email-change/${REQ}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "X-Staff-Token": staff },
      }),
      env,
    );
  }

  it("200 — pending → cancelled", async () => {
    const res = await cancel(reqRow({ status: "cancelled" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("cancelled");
  });

  it("404 when there is no pending request to cancel", async () => {
    const res = await cancel(null);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Principal decision routes (/api/principal/accounts/email-change-requests)
// ---------------------------------------------------------------------------
describe("principal email-change decision routes", () => {
  it("GET queue: 403 for a dealer, 200 list for principal", async () => {
    const dealerJwt = await makeJwt("dealer", DEALER_A);
    const forbidden = await app.fetch(
      new Request("http://t/api/principal/accounts/email-change-requests", {
        headers: { Authorization: `Bearer ${dealerJwt}` },
      }),
      env,
    );
    expect(forbidden.status).toBe(403);

    vi.mocked(userClient).mockReturnValue({
      from: () => ({
        select: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ch: any = {
            order: () => ch,
            limit: async () => ({
              data: [{ ...reqRow(), dealers: { name: "Litte Mattress" } }],
              error: null,
            }),
          };
          return ch;
        },
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const principalJwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/principal/accounts/email-change-requests", {
        headers: { Authorization: `Bearer ${principalJwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { requests: Array<{ dealerName: string | null }> };
    expect(body.requests[0].dealerName).toBe("Litte Mattress");
  });

  it("approve: swaps the REAL login email + mirrors app_users + stamps the row", async () => {
    const updateUserById = vi.fn(async () => ({ data: {}, error: null }));
    let appUsersUpdate: Record<string, unknown> | null = null;
    let audit: Record<string, unknown> | null = null;
    vi.mocked(adminClient).mockReturnValue(
      mockAdmin({
        requestRow: reqRow(),
        appUserTaken: false,
        decidedRow: reqRow({ status: "approved", decided_at: "2026-07-19T01:00:00Z" }),
        updateUserById,
        captureAppUsersUpdate: (row) => (appUsersUpdate = row),
        captureAudit: (row) => (audit = row),
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/principal/accounts/email-change-requests/${REQ}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith(SELF_USER, {
      email: "new@carres.com",
      email_confirm: true,
    });
    expect(appUsersUpdate).toEqual({ email: "new@carres.com" });
    expect(audit).not.toBeNull();
    expect(((await res.json()) as { status: string }).status).toBe("approved");
  });

  it("approve: 409 when the request is not pending", async () => {
    vi.mocked(adminClient).mockReturnValue(
      mockAdmin({ requestRow: reqRow({ status: "rejected" }) }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/principal/accounts/email-change-requests/${REQ}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(409);
  });

  it("approve: 422 email_in_use when another account claimed it meanwhile", async () => {
    vi.mocked(adminClient).mockReturnValue(
      mockAdmin({ requestRow: reqRow(), appUserTaken: true }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/principal/accounts/email-change-requests/${REQ}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe("email_in_use");
  });

  it("reject: stamps decision_note + audits; 404 when nothing pending", async () => {
    let audit: Record<string, unknown> | null = null;
    vi.mocked(adminClient).mockReturnValue(
      mockAdmin({
        decidedRow: reqRow({ status: "rejected", decision_note: "use company domain" }),
        captureAudit: (row) => (audit = row),
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/principal/accounts/email-change-requests/${REQ}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ note: "use company domain" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { decisionNote: string }).decisionNote).toBe("use company domain");
    expect(audit).not.toBeNull();

    vi.mocked(adminClient).mockReturnValue(mockAdmin({ decidedRow: null }));
    const miss = await app.fetch(
      new Request(`http://t/api/principal/accounts/email-change-requests/${REQ}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(miss.status).toBe(404);
  });
});
