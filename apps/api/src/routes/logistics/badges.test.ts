import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
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

/**
 * Mock orders + purchase_orders count chains. The route does:
 *   1. orders.select("id", count, head).eq("logistics_stage", "awaiting_logistics_action")
 *   2. purchase_orders.select("id", count, head).neq("status", "received")
 *      .in("sup_status", [...])
 */
function mockBadges(opts: { ordersCount: number; procurementCount: number }) {
  const from = vi.fn((table: string) => {
    if (table === "orders") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() =>
            Promise.resolve({ data: null, error: null, count: opts.ordersCount }),
          ),
        })),
      };
    }
    if (table === "purchase_orders") {
      return {
        select: vi.fn(() => ({
          neq: vi.fn(() => ({
            in: vi.fn(() =>
              Promise.resolve({
                data: null,
                error: null,
                count: opts.procurementCount,
              }),
            ),
          })),
        })),
      };
    }
    throw new Error(`Unexpected from() table: ${table}`);
  });
  vi.mocked(userClient).mockReturnValue({
    from,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return { from };
}

describe("GET /api/logistics/badges", () => {
  it("returns 200 + count JSON for logistics", async () => {
    mockBadges({ ordersCount: 3, procurementCount: 2 });

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/badges", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: number; procurement: number };
    expect(body).toEqual({ orders: 3, procurement: 2 });
  });

  it("zeroes default when supabase returns null counts", async () => {
    // null from PostgREST is a valid edge — coerce to 0 instead of NaN/null.
    const from = vi.fn((table: string) => {
      const result = Promise.resolve({ data: null, error: null, count: null });
      if (table === "orders") {
        return { select: vi.fn(() => ({ eq: vi.fn(() => result) })) };
      }
      return {
        select: vi.fn(() => ({
          neq: vi.fn(() => ({ in: vi.fn(() => result) })),
        })),
      };
    });
    vi.mocked(userClient).mockReturnValue({
      from,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/badges", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: number; procurement: number };
    expect(body).toEqual({ orders: 0, procurement: 0 });
  });

  it("returns 403 for non-logistics roles", async () => {
    mockBadges({ ordersCount: 0, procurementCount: 0 });
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/logistics/badges", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 without JWT", async () => {
    mockBadges({ ordersCount: 0, procurementCount: 0 });
    const res = await app.fetch(
      new Request("http://t/api/logistics/badges"),
      env,
    );
    expect(res.status).toBe(401);
  });
});
