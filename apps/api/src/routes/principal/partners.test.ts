import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { adminClient, userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x.com`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
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
  vi.mocked(adminClient).mockReset();
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("POST /api/principal/partners", () => {
  it("rejects non-principal callers with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/principal/partners", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: "ABC",
          contactNumber: "0123456",
          address: "X-address",
          password: "abcd1234",
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("creates LP atomically (delivery_partners + auth.users + app_users)", async () => {
    const newPartnerId = "00000000-0000-0000-0000-aaaaaaaaaaaa";
    const newAuthUserId = "11111111-1111-1111-1111-bbbbbbbbbbbb";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dpInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: newPartnerId, name: "LP-A Logistics" }, error: null }),
      }),
    });
    const auInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const auditInsert = vi.fn().mockResolvedValue({ data: null, error: null });

    const sb = {
      from: vi.fn((table: string) => {
        if (table === "delivery_partners") return { insert: dpInsert };
        if (table === "app_users") return { insert: auInsert };
        if (table === "audit_log") return { insert: auditInsert };
        return {};
      }),
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: { id: newAuthUserId } },
            error: null,
          }),
        },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(adminClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/principal/partners", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: "LP-A Logistics",
          contactNumber: "0123456789",
          address: "1 Demo St",
          password: "abcd1234",
        }),
      }),
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { partner_id: string; auth_user_id: string; email: string };
    expect(body.partner_id).toBe(newPartnerId);
    expect(body.auth_user_id).toBe(newAuthUserId);
    expect(sb.auth.admin.createUser).toHaveBeenCalledOnce();
    // delivery_partners insert receives companyName as name + contact embeds address
    expect(dpInsert).toHaveBeenCalledOnce();
    const dpArg = dpInsert.mock.calls[0]?.[0];
    expect(dpArg).toMatchObject({ name: "LP-A Logistics" });
    expect(String(dpArg.contact)).toContain("0123456789");
    expect(String(dpArg.contact)).toContain("1 Demo St");
    // app_users insert links partner_id and role='partner'
    expect(auInsert).toHaveBeenCalledOnce();
    const auArg = auInsert.mock.calls[0]?.[0];
    expect(auArg).toMatchObject({
      id: newAuthUserId,
      partner_id: newPartnerId,
      role: "partner",
      name: "LP-A Logistics",
    });
  });

  it("returns 422 on zod validation failure", async () => {
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/principal/partners", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: "X" }), // missing fields
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("GET /api/principal/partners", () => {
  it("returns LP list for principal", async () => {
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
          data: [
            { id: "p1", name: "LP-A", contact: "0123", zones: "north", onboarded_date: null, rate_card: null },
            { id: "p2", name: "LP-B", contact: "0456", zones: "south", onboarded_date: null, rate_card: null },
          ],
          error: null,
        }),
      })),
    };
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/principal/partners", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("rejects non-principal with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/principal/partners", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
