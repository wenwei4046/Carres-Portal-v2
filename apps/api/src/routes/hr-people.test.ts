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
const KID = "test-kid-hr-people";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
  STAFF_SESSION_SECRET: "test-staff-secret-hr-people-abc",
};

const EMPLOYEE = "00000000-0000-0000-0000-0000000000e1";
const APP_USER = "00000000-0000-0000-0000-0000000000a1";

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

function mockUserRpc(
  result: { data?: unknown; error?: { code?: string; message: string } | null },
) {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  vi.mocked(userClient).mockReturnValue({ rpc } as never);
  return rpc;
}

describe("GET /api/hr/people", () => {
  it("rejects an unauthenticated caller", async () => {
    expect((await req("/api/hr/people")).status).toBe(401);
  });

  it("rejects a non-HR role", async () => {
    for (const role of ["operation", "finance", "dealer", "showroom"]) {
      expect((await authed("/api/hr/people", role)).status).toBe(403);
    }
  });

  it("returns the roster for hr", async () => {
    mockUserRpc({ data: { people: [], accessWithoutExit: 1, totalFields: 8 } });
    const res = await authed("/api/hr/people", "hr");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ people: [], accessWithoutExit: 1, totalFields: 8 });
  });

  it("turns the DEFINER gate's 42501 into a 403, not a 500", async () => {
    mockUserRpc({ error: { code: "42501", message: "forbidden" } });
    expect((await authed("/api/hr/people", "hr")).status).toBe(403);
  });
});

describe("PATCH /api/hr/people/:id", () => {
  it("refuses an empty patch before it reaches the DB", async () => {
    const rpc = mockUserRpc({ data: null });
    const res = await authed(`/api/hr/people/${EMPLOYEE}`, "hr", {
      method: "PATCH",
      body: "{}",
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("will not let an exit be written through the profile door", async () => {
    // Exits must go through /exit so the lifecycle event is written with them.
    const rpc = mockUserRpc({ data: null });
    const res = await authed(`/api/hr/people/${EMPLOYEE}`, "hr", {
      method: "PATCH",
      body: JSON.stringify({ exit_date: "2026-06-30", exit_reason: "resigned" }),
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes a valid patch to the RPC", async () => {
    const rpc = mockUserRpc({ data: null });
    const res = await authed(`/api/hr/people/${EMPLOYEE}`, "hr", {
      method: "PATCH",
      body: JSON.stringify({ nationality: "Malaysian" }),
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("hr_upsert_employee", {
      p_employee_id: EMPLOYEE,
      p_patch: { nationality: "Malaysian" },
    });
  });
});

describe("POST /api/hr/people/:id/reveal", () => {
  it("only accepts the two revealable fields", async () => {
    const rpc = mockUserRpc({ data: "x" });
    const res = await authed(`/api/hr/people/${EMPLOYEE}/reveal`, "hr", {
      method: "POST",
      body: JSON.stringify({ field: "personal_phone" }),
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the value from the audited RPC", async () => {
    const rpc = mockUserRpc({ data: "900101-14-5567" });
    const res = await authed(`/api/hr/people/${EMPLOYEE}/reveal`, "hr", {
      method: "POST",
      body: JSON.stringify({ field: "ic_number" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ field: "ic_number", value: "900101-14-5567" });
    expect(rpc).toHaveBeenCalledWith("hr_reveal_employee_field", {
      p_employee_id: EMPLOYEE,
      p_field: "ic_number",
    });
  });

  it("maps field_empty to a 422", async () => {
    mockUserRpc({ error: { message: "field_empty" } });
    const res = await authed(`/api/hr/people/${EMPLOYEE}/reveal`, "hr", {
      method: "POST",
      body: JSON.stringify({ field: "bank_account_no" }),
    });
    expect(res.status).toBe(422);
  });
});

describe("POST /api/hr/people/:id/exit", () => {
  it("rejects a reason outside the three", async () => {
    const rpc = mockUserRpc({ data: null });
    const res = await authed(`/api/hr/people/${EMPLOYEE}/exit`, "hr", {
      method: "POST",
      body: JSON.stringify({ exitDate: "2026-06-30", reason: "fired" }),
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the RPC's exit_before_join guard to a 422", async () => {
    mockUserRpc({ error: { message: 'exit_before_join' } });
    const res = await authed(`/api/hr/people/${EMPLOYEE}/exit`, "hr", {
      method: "POST",
      body: JSON.stringify({ exitDate: "2020-01-01", reason: "resigned" }),
    });
    expect(res.status).toBe(422);
  });
});

describe("POST /api/hr/people/:id/access — the HR disable door", () => {
  it("is closed to every non-HR role", async () => {
    for (const role of ["operation", "finance", "bd", "showroom"]) {
      const res = await authed(`/api/hr/people/${EMPLOYEE}/access`, role, {
        method: "POST",
        body: JSON.stringify({ status: "disabled" }),
      });
      expect(res.status).toBe(403);
    }
  });

  it("refuses a PIN-only person — there is no login to disable", async () => {
    // floor staff: the employee row has no app_user_id
    mockUserRpc({ data: { employeeId: EMPLOYEE, appUserId: null, salespersonId: "sp1" } });
    const admin = vi.fn();
    vi.mocked(adminClient).mockReturnValue({ from: admin } as never);

    const res = await authed(`/api/hr/people/${EMPLOYEE}/access`, "hr", {
      method: "POST",
      body: JSON.stringify({ status: "disabled" }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("no_login_to_disable");
    // service_role must never have been touched for a request that cannot proceed
    expect(admin).not.toHaveBeenCalled();
  });

  it("resolves the account from the employee row, not from the client", async () => {
    mockUserRpc({ data: { employeeId: EMPLOYEE, appUserId: APP_USER, salespersonId: null } });

    const signOut = vi.fn(async () => ({}));
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
    const insert = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) =>
      table === "app_users"
        ? {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: APP_USER,
                    email: "samantha@carres.com",
                    name: "Samantha",
                    role: "operation",
                    dealer_id: null,
                  },
                }),
              }),
            }),
            update,
          }
        : { insert },
    );
    vi.mocked(adminClient).mockReturnValue({
      from,
      auth: { admin: { signOut } },
    } as never);

    const res = await authed(`/api/hr/people/${EMPLOYEE}/access`, "hr", {
      method: "POST",
      body: JSON.stringify({ status: "disabled", reason: "left in June" }),
    });

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ status: "disabled" });
    // the promise the dialog makes: signed out NOW, not at token expiry
    expect(signOut).toHaveBeenCalledWith(APP_USER);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "hr",
        action: expect.stringContaining("Disabled account · Samantha"),
      }),
    );
  });

  it("cannot disable a principal", async () => {
    mockUserRpc({ data: { employeeId: EMPLOYEE, appUserId: APP_USER, salespersonId: null } });
    const update = vi.fn();
    vi.mocked(adminClient).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: APP_USER,
                email: "principal@carres.com",
                name: "principal",
                role: "principal",
                dealer_id: null,
              },
            }),
          }),
        }),
        update,
      }),
    } as never);

    const res = await authed(`/api/hr/people/${EMPLOYEE}/access`, "hr", {
      method: "POST",
      body: JSON.stringify({ status: "disabled" }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("cannot_disable_principal");
    expect(update).not.toHaveBeenCalled();
  });
});
