import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

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
  return new SignJWT({
    email: `${role}@carres.com`,
    app_metadata: { role },
  })
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
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("GET /api/operation/partners", () => {
  it("returns 200 with partner rows for operation", async () => {
    const partners = [
      {
        id: "00000000-0000-0000-0000-000000000b01",
        name: "GD Express",
        contact: "+60 3-1111 1111",
        zones: "Klang Valley",
      },
      {
        id: "00000000-0000-0000-0000-000000000b02",
        name: "Pos Logistic",
        contact: "+60 3-2222 2222",
        zones: "Penang",
      },
    ];
    vi.mocked(userClient).mockReturnValue({
      from: () => ({
        select: () => ({
          order: async () => ({ data: partners, error: null }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/partners", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { partners: typeof partners };
    expect(body.partners).toHaveLength(2);
    expect(body.partners[0].name).toBe("GD Express");
  });

  it("returns 403 for non-operation role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/partners", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when JWT is missing", async () => {
    const res = await app.fetch(
      new Request("http://t/api/operation/partners"),
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/operation/partners/:id/journey-calendar (Delivery Card 03, 0411)", () => {
  const PARTNER_ID = "00000000-0000-0000-0000-000000000b03";
  const TEOW_BODY = {
    pickupDays: [1, 3, 5],
    regions: {
      Melaka: { deliveryDays: [1, 3, 5], transitDays: 0 },
      JB: { deliveryDays: [2, 4, 6], transitDays: 1 },
    },
    surchargeAreas: [],
  };

  function mockRpcAndRead(rpcSpy: ReturnType<typeof vi.fn>) {
    vi.mocked(userClient).mockReturnValue({
      rpc: rpcSpy,
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: PARTNER_ID,
                name: "Teow",
                pickup_days: [1, 3, 5],
                journey_regions: TEOW_BODY.regions,
                surcharge_areas: [],
              },
              error: null,
            }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  it("writes through the audited door and returns the calendar", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    mockRpcAndRead(rpc);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/partners/${PARTNER_ID}/journey-calendar`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(TEOW_BODY),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_partner_journey_calendar", {
      p_partner_id: PARTNER_ID,
      p_pickup_days: [1, 3, 5],
      p_journey_regions: TEOW_BODY.regions,
      p_surcharge_areas: [],
    });
    const body = (await res.json()) as { partner: { pickup_days: number[] } };
    expect(body.partner.pickup_days).toEqual([1, 3, 5]);
  });

  it("refuses a Sunday pickup day in words, before any write", async () => {
    const rpc = vi.fn();
    mockRpcAndRead(rpc);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/partners/${PARTNER_ID}/journey-calendar`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...TEOW_BODY, pickupDays: [0, 3] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses an unknown extra field (whole-calendar strict contract)", async () => {
    const rpc = vi.fn();
    mockRpcAndRead(rpc);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/partners/${PARTNER_ID}/journey-calendar`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...TEOW_BODY, rateCard: "nope" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-operation role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/partners/${PARTNER_ID}/journey-calendar`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(TEOW_BODY),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("404s a non-uuid partner id without touching the database", async () => {
    const rpc = vi.fn();
    mockRpcAndRead(rpc);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/partners/not-a-uuid/journey-calendar", {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(TEOW_BODY),
      }),
      env,
    );
    expect(res.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
});
