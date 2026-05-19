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
 * Mock the badges chain (Loo 2026-05-11 unread-rewrite):
 *   1. user_nav_seen.select("badge_key, last_seen_at").in("badge_key", [...])
 *      → returns the per-key last_seen_at rows
 *   2. orders.select("id", count, head).eq(operation_stage, ...).gt(updated_at, since)
 *   3. purchase_orders.select("id", count, head).neq(status, "received")
 *      .in(sup_status, [...]).gt(updated_at, since)
 */
function mockBadges(opts: {
  ordersCount: number;
  procurementCount: number;
  seen?: { badge_key: string; last_seen_at: string }[];
}) {
  const seenRows = opts.seen ?? [];
  const from = vi.fn((table: string) => {
    if (table === "user_nav_seen") {
      return {
        select: vi.fn(() => ({
          in: vi.fn(() =>
            Promise.resolve({ data: seenRows, error: null }),
          ),
        })),
      };
    }
    if (table === "orders") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            gt: vi.fn(() =>
              Promise.resolve({ data: null, error: null, count: opts.ordersCount }),
            ),
          })),
        })),
      };
    }
    if (table === "purchase_orders") {
      return {
        select: vi.fn(() => ({
          neq: vi.fn(() => ({
            in: vi.fn(() => ({
              gt: vi.fn(() =>
                Promise.resolve({
                  data: null,
                  error: null,
                  count: opts.procurementCount,
                }),
              ),
            })),
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

describe("GET /api/operation/badges", () => {
  it("returns 200 + count JSON for operation (no prior seen rows)", async () => {
    mockBadges({ ordersCount: 3, procurementCount: 2 });

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/badges", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: number; procurement: number };
    expect(body).toEqual({ orders: 3, procurement: 2 });
  });

  it("threads each key's last_seen_at into the .gt(updated_at, …) filter", async () => {
    // Capture the .gt() calls per table so we can assert the threshold
    // matches the seeded last_seen_at for that key.
    const ordersGt = vi.fn(() =>
      Promise.resolve({ data: null, error: null, count: 0 }),
    );
    const procGt = vi.fn(() =>
      Promise.resolve({ data: null, error: null, count: 0 }),
    );
    const seenRows = [
      { badge_key: "operation:orders", last_seen_at: "2026-05-11T10:00:00Z" },
      { badge_key: "operation:procurement", last_seen_at: "2026-05-11T11:00:00Z" },
    ];
    const from = vi.fn((table: string) => {
      if (table === "user_nav_seen") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() =>
              Promise.resolve({ data: seenRows, error: null }),
            ),
          })),
        };
      }
      if (table === "orders") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ gt: ordersGt })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          neq: vi.fn(() => ({ in: vi.fn(() => ({ gt: procGt })) })),
        })),
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);

    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request("http://t/api/operation/badges", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );

    expect(ordersGt).toHaveBeenCalledWith("updated_at", "2026-05-11T10:00:00Z");
    expect(procGt).toHaveBeenCalledWith("updated_at", "2026-05-11T11:00:00Z");
  });

  it("falls back to epoch when no user_nav_seen row exists for a key", async () => {
    const ordersGt = vi.fn(() =>
      Promise.resolve({ data: null, error: null, count: 5 }),
    );
    const procGt = vi.fn(() =>
      Promise.resolve({ data: null, error: null, count: 7 }),
    );
    const from = vi.fn((table: string) => {
      if (table === "user_nav_seen") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        };
      }
      if (table === "orders") {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ gt: ordersGt })) })) };
      }
      return {
        select: vi.fn(() => ({
          neq: vi.fn(() => ({ in: vi.fn(() => ({ gt: procGt })) })),
        })),
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/badges", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(ordersGt).toHaveBeenCalledWith("updated_at", "1970-01-01T00:00:00Z");
    expect(procGt).toHaveBeenCalledWith("updated_at", "1970-01-01T00:00:00Z");
    const body = (await res.json()) as { orders: number; procurement: number };
    expect(body).toEqual({ orders: 5, procurement: 7 });
  });

  it("zeroes default when supabase returns null counts", async () => {
    mockBadges({ ordersCount: 0, procurementCount: 0 });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/badges", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: number; procurement: number };
    expect(body).toEqual({ orders: 0, procurement: 0 });
  });

  it("returns 403 for non-operation roles", async () => {
    mockBadges({ ordersCount: 0, procurementCount: 0 });
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/badges", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 without JWT", async () => {
    mockBadges({ ordersCount: 0, procurementCount: 0 });
    const res = await app.fetch(
      new Request("http://t/api/operation/badges"),
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/operation/badges/seen", () => {
  function mockMarkSeen() {
    const rpc = vi.fn(() =>
      Promise.resolve({ data: "2026-05-11T12:00:00Z", error: null }),
    );
    vi.mocked(userClient).mockReturnValue({
      rpc,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { rpc };
  }

  it("calls mark_badge_seen RPC with the supplied badgeKey", async () => {
    const { rpc } = mockMarkSeen();
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/badges/seen", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ badgeKey: "operation:orders" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("mark_badge_seen", {
      p_badge_key: "operation:orders",
    });
    const body = (await res.json()) as { badgeKey: string; lastSeenAt: string };
    expect(body).toEqual({
      badgeKey: "operation:orders",
      lastSeenAt: "2026-05-11T12:00:00Z",
    });
  });

  it("422 on unknown badgeKey (zod literal-union guard)", async () => {
    mockMarkSeen();
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/badges/seen", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ badgeKey: "operation:bogus" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("422 on missing body", async () => {
    mockMarkSeen();
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/badges/seen", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("403 for non-operation", async () => {
    mockMarkSeen();
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/badges/seen", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ badgeKey: "operation:orders" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
