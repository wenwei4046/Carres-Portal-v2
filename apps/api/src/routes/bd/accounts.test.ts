import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { adminClient } from "../../lib/supabase";

/**
 * /api/bd/accounts (2026-07-19) — the BD dealer-account door. Shares the
 * principal door's handler (lib/create-account.ts), so the suite pins BOTH:
 * the BD gate + role=dealer restriction here, and the principal door's
 * unchanged behavior through the same extracted handler.
 */

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
  STAFF_SESSION_SECRET: "test-staff-secret",
};

const KID = "test-kid-bd-accounts";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@test.com`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-0000000000aa")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

/** adminClient stub covering the whole create-account pipeline: email probe,
 *  org/outlet/staff inserts (awaitable AND .select().single()-able), the
 *  DEFINER pin rpc, auth.admin.createUser, and the app_users/audit inserts. */
function mockAdminCreate(cfg: { emailTaken?: boolean } = {}) {
  const inserts: Record<string, Array<Record<string, unknown>>> = {};
  const rpcs: Array<{ name: string; args: unknown }> = [];
  const client = {
    inserts,
    rpcs,
    from: (table: string) => ({
      select: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ch: any = {
          eq: () => ch,
          neq: () => ch,
          maybeSingle: async () => ({
            data: table === "app_users" && cfg.emailTaken ? { id: "taken" } : null,
            error: null,
          }),
        };
        return ch;
      },
      insert: (row: Record<string, unknown>) => {
        (inserts[table] ??= []).push(row);
        return {
          select: () => ({
            single: async () => ({ data: { id: `${table}-id-1` }, error: null }),
          }),
          // Direct-await shape (app_users / audit_log inserts).
          then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
        };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: async (name: string, args: unknown) => {
      rpcs.push({ name, args });
      return { data: null, error: null };
    },
    auth: {
      admin: {
        createUser: async () => ({
          data: { user: { id: "22222222-2222-2222-2222-000000000001" } },
          error: null,
        }),
        deleteUser: async () => ({ data: null, error: null }),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return client;
}

const DEALER_BODY = {
  name: "Owner Ong",
  email: "owner@newdealer.com",
  role: "dealer",
  companyName: "Dream Living Sdn Bhd",
  region: "Klang Valley",
  address: "12 Jalan Maju, 47301 Petaling Jaya",
  ssmCode: "202501012345",
  contactName: "Owner Ong",
  contactPhone: "0123456789",
  tempPassword: "hunter2-strong",
  initialStaff: {
    name: "Aisha Rahman",
    staffRole: "principal",
    pin: "135790",
    email: "aisha@newdealer.com",
    birthday: "1990-01-01",
    gender: "female",
    color: "flame",
  },
};

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
  vi.mocked(adminClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

function post(path: string, jwt: string, body: unknown) {
  return app.fetch(
    new Request(`http://t${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}

describe("POST /api/bd/accounts", () => {
  it("403 for a non-bd role (principal has its own door)", async () => {
    const res = await post("/api/bd/accounts", await makeJwt("principal"), DEALER_BODY);
    expect(res.status).toBe(403);
  });

  it("403 role_not_allowed when bd tries a non-dealer role", async () => {
    vi.mocked(adminClient).mockReturnValue(mockAdminCreate());
    const res = await post("/api/bd/accounts", await makeJwt("bd"), {
      name: "Supp",
      email: "supp@x.com",
      role: "supplier",
      companyName: "Supp Co",
      tempPassword: "hunter2-strong",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("role_not_allowed");
  });

  it("422 on an invalid dealer body (missing SSM)", async () => {
    vi.mocked(adminClient).mockReturnValue(mockAdminCreate());
    const res = await post("/api/bd/accounts", await makeJwt("bd"), {
      ...DEALER_BODY,
      ssmCode: undefined,
    });
    expect(res.status).toBe(422);
  });

  it("422 email_in_use when the login email already exists", async () => {
    vi.mocked(adminClient).mockReturnValue(mockAdminCreate({ emailTaken: true }));
    const res = await post("/api/bd/accounts", await makeJwt("bd"), DEALER_BODY);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("email_in_use");
  });

  it("201 creates the dealership: org + outlet + first staff + PIN + audit role=bd", async () => {
    const admin = mockAdminCreate();
    vi.mocked(adminClient).mockReturnValue(admin);
    const res = await post("/api/bd/accounts", await makeJwt("bd"), DEALER_BODY);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { role: string; dealerId: string | null; email: string };
    expect(body.role).toBe("dealer");
    expect(body.dealerId).toBe("dealers-id-1");

    // Org row: plain dealer channel + the business profile.
    const dealerRow = admin.inserts["dealers"]?.[0] as Record<string, unknown>;
    expect(dealerRow.channel).toBe("dealer");
    expect(dealerRow.ssm_code).toBe(DEALER_BODY.ssmCode);
    // Default outlet seeded from the company.
    expect(admin.inserts["outlets"]?.[0]?.name).toBe(DEALER_BODY.companyName);
    // First staff + its PIN through the DEFINER rpc.
    expect(admin.inserts["salespersons"]?.[0]?.staff_role).toBe("principal");
    expect(admin.rpcs.find((r: { name: string }) => r.name === "staff_set_pin")).toBeTruthy();
    // app_users mirror + audit attribution to BD.
    expect(admin.inserts["app_users"]?.[0]?.role).toBe("dealer");
    const audit = admin.inserts["audit_log"]?.[0] as Record<string, unknown>;
    expect(audit.role).toBe("bd");
    expect(String(audit.action)).toContain("Created dealer account");
  });
});

describe("POST /api/principal/accounts (shared handler regression)", () => {
  it("principal still creates a SUPPLIER through the extracted handler → 201, audit role=principal", async () => {
    const admin = mockAdminCreate();
    vi.mocked(adminClient).mockReturnValue(admin);
    const res = await post("/api/principal/accounts", await makeJwt("principal"), {
      name: "Supp Owner",
      email: "supp@x.com",
      role: "supplier",
      companyName: "Supp Co",
      tempPassword: "hunter2-strong",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { role: string; supplierId: string | null };
    expect(body.role).toBe("supplier");
    expect(admin.inserts["suppliers"]?.[0]?.name).toBe("Supp Co");
    expect(admin.inserts["audit_log"]?.[0]?.role).toBe("principal");
  });

  it("bd cannot use the principal door → 403", async () => {
    const res = await post("/api/principal/accounts", await makeJwt("bd"), DEALER_BODY);
    expect(res.status).toBe(403);
  });
});
