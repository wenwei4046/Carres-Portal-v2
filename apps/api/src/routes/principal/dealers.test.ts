import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
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

async function makeJwt(role: string, dealerId: string | null = null) {
  return new SignJWT({
    email: `${role}@carres.com`,
    app_metadata: { role, ...(dealerId ? { dealer_id: dealerId } : {}) },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

type RpcCall = { name: string; args: unknown };
type ChainCall = { method: string; args: unknown[] };
type RpcResult = { data?: unknown; error?: { code?: string; message?: string; details?: string } };

/**
 * Builds a mocked supabase client that supports:
 *  - .rpc(name, args) — returns the matching `rpcResults[name]` payload.
 *  - .from(table).select(...).eq(...).order(...).limit(...) — terminates by
 *    being awaited (`.then` resolves with `{data, error}`). Used by
 *    GET /:id detail to fetch the last 8 orders.
 *
 * Records every call so tests can assert what was sent.
 */
function buildSb(opts: {
  rpcResults?: Record<string, RpcResult>;
  ordersRows?: unknown[];
  ordersError?: { code?: string; message?: string };
}) {
  const rpcCalls: RpcCall[] = [];
  const chainCalls: ChainCall[] = [];

  const chain: Record<string, unknown> = {};
  chain.select = (...args: unknown[]) => {
    chainCalls.push({ method: "select", args });
    return chain;
  };
  chain.eq = (...args: unknown[]) => {
    chainCalls.push({ method: "eq", args });
    return chain;
  };
  chain.order = (...args: unknown[]) => {
    chainCalls.push({ method: "order", args });
    return chain;
  };
  chain.limit = (...args: unknown[]) => {
    chainCalls.push({ method: "limit", args });
    return chain;
  };
  chain.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
    resolve({ data: opts.ordersRows ?? [], error: opts.ordersError ?? null });

  const sb = {
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      const r = opts.rpcResults?.[name] ?? {};
      if (r.error) return { data: null, error: r.error };
      return { data: r.data ?? null, error: null };
    },
    from: (table: string) => {
      chainCalls.push({ method: "from", args: [table] });
      return chain;
    },
  };
  return { sb, rpcCalls, chainCalls };
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

const DEALER_ID = "00000000-0000-0000-0000-000000000d01";

describe("GET /api/principal/dealers", () => {
  it("200 — lists dealers with stats mapped to camelCase", async () => {
    const { sb, rpcCalls } = buildSb({
      rpcResults: {
        dealers_with_stats_list: {
          data: [
            {
              id: DEALER_ID,
              name: "BedHouse KL",
              region: "KL",
              contact: "Loo · 012-3456789",
              status: "active",
              joined_date: "2024-01-15",
              credit_limit: "50000",
              payment_terms: "NET 30",
              deposit_balance: "1200.50",
              order_count: "5",
              gmv: "120000",
              outstanding: "15000",
            },
            {
              id: "00000000-0000-0000-0000-000000000d02",
              name: "BedHouse JB",
              region: "JB",
              contact: "Tan · 011-2222222",
              status: "pending",
              joined_date: "2026-04-30",
              credit_limit: "0",
              payment_terms: "COD",
              deposit_balance: "0",
              order_count: "0",
              gmv: "0",
              outstanding: "0",
            },
          ],
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/principal/dealers", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dealers: Array<{
        id: string;
        name: string;
        creditLimit: number;
        paymentTerms: string;
        depositBalance: number;
        orderCount: number;
        gmv: number;
        outstanding: number;
        joinedDate: string;
      }>;
    };
    expect(body.dealers).toHaveLength(2);
    expect(body.dealers[0]?.name).toBe("BedHouse KL");
    // Camel-cased + numeric coercion from string-shaped numerics.
    expect(body.dealers[0]?.creditLimit).toBe(50000);
    expect(body.dealers[0]?.depositBalance).toBe(1200.5);
    expect(body.dealers[0]?.orderCount).toBe(5);
    expect(body.dealers[0]?.gmv).toBe(120000);
    expect(body.dealers[0]?.outstanding).toBe(15000);
    expect(body.dealers[0]?.joinedDate).toBe("2024-01-15");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.name).toBe("dealers_with_stats_list");
  });

  it("403 for dealer role (no Supabase round-trip)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/principal/dealers", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("GET /api/principal/dealers/:id", () => {
  it("200 — returns dealer + recent orders with computed totals", async () => {
    const dealerRow = {
      id: DEALER_ID,
      name: "BedHouse KL",
      region: "KL",
      contact: "Loo · 012",
      status: "active",
      credit_limit: "50000",
      payment_terms: "NET 30",
      deposit_balance: "1200",
    };
    const ordersRows = [
      {
        id: "o1",
        dl: 1001,
        status: "active",
        customer_name: "Ali",
        paid: "500",
        placed_at: "2026-05-03T00:00:00Z",
        order_lines: [{ unit_price: "1000", qty: 2 }],
        order_addons: [{ unit_price: "150", qty: 1 }],
      },
      {
        id: "o2",
        dl: 1002,
        status: "completed",
        customer_name: "Mei",
        paid: "3000",
        placed_at: "2026-05-02T00:00:00Z",
        order_lines: [{ unit_price: "1500", qty: 2 }],
        order_addons: [],
      },
    ];
    const { sb, rpcCalls, chainCalls } = buildSb({
      rpcResults: { dealer_with_stats: { data: [dealerRow] } },
      ordersRows,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/principal/dealers/${DEALER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dealer: { id: string; name: string };
      recentOrders: Array<{
        id: string;
        dl: number;
        status: string;
        customerName: string;
        paid: number;
        total: number;
      }>;
    };
    expect(body.dealer.id).toBe(DEALER_ID);
    expect(body.dealer.name).toBe("BedHouse KL");
    expect(body.recentOrders).toHaveLength(2);
    // Order 1: lines 1000*2 + addons 150*1 = 2150
    expect(body.recentOrders[0]?.total).toBe(2150);
    expect(body.recentOrders[0]?.customerName).toBe("Ali");
    expect(body.recentOrders[0]?.paid).toBe(500);
    // Order 2: lines 1500*2 + addons (empty) = 3000
    expect(body.recentOrders[1]?.total).toBe(3000);

    expect(rpcCalls[0]?.name).toBe("dealer_with_stats");
    expect(rpcCalls[0]?.args).toEqual({ p_id: DEALER_ID });
    // Chain assertions: from('orders'), eq('dealer_id', id), order(...), limit(8)
    expect(chainCalls).toContainEqual({ method: "from", args: ["orders"] });
    expect(chainCalls).toContainEqual({ method: "eq", args: ["dealer_id", DEALER_ID] });
    expect(chainCalls).toContainEqual({ method: "limit", args: [8] });
  });

  it("404 — dealer_with_stats returns empty array", async () => {
    const { sb } = buildSb({
      rpcResults: { dealer_with_stats: { data: [] } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/principal/dealers/${DEALER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error).toBe("not_found");
    expect(body.code).toBe("not_found");
  });
});

describe("POST /api/principal/dealers/invite", () => {
  it("200 — happy path returns { dealer, approval, idempotent: false }", async () => {
    const { sb, rpcCalls } = buildSb({
      rpcResults: {
        dealer_invite: {
          data: {
            dealer: { id: DEALER_ID, name: "BedHouse Penang", region: "Penang", status: "pending" },
            approval: { id: "ap-1", kind: "new_dealer", status: "pending" },
            idempotent: false,
          },
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/principal/dealers/invite", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "BedHouse Penang", region: "Penang", contact: "Lim · 016-7777777" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dealer: { name: string; status: string };
      approval: { kind: string };
      idempotent: boolean;
    };
    expect(body.dealer.name).toBe("BedHouse Penang");
    expect(body.dealer.status).toBe("pending");
    expect(body.approval.kind).toBe("new_dealer");
    expect(body.idempotent).toBe(false);
    expect(rpcCalls[0]?.name).toBe("dealer_invite");
    expect(rpcCalls[0]?.args).toEqual({
      p_name: "BedHouse Penang",
      p_region: "Penang",
      p_contact: "Lim · 016-7777777",
    });
  });

  it("200 — idempotent returns existing dealer with idempotent: true", async () => {
    const { sb } = buildSb({
      rpcResults: {
        dealer_invite: {
          data: {
            dealer: { id: DEALER_ID, name: "BedHouse Penang", status: "pending" },
            approval: { id: "ap-existing", status: "pending" },
            idempotent: true,
          },
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/principal/dealers/invite", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "BedHouse Penang", region: "Penang", contact: "Lim · 016" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { idempotent: boolean };
    expect(body.idempotent).toBe(true);
  });

  it("422 — missing name fails zod validation, RPC not called", async () => {
    const { sb, rpcCalls } = buildSb({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/principal/dealers/invite", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ region: "KL", contact: "Loo · 012" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error).toBe("invalid_input");
    expect(body.code).toBe("invalid_param");
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("POST /api/principal/dealers/:id/status", () => {
  it("200 — suspend returns updated dealer row", async () => {
    const { sb, rpcCalls } = buildSb({
      rpcResults: {
        dealer_set_status: {
          data: { id: DEALER_ID, name: "BedHouse KL", status: "suspended" },
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/principal/dealers/${DEALER_ID}/status`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "suspended", reason: "non-payment" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dealer: { status: string } };
    expect(body.dealer.status).toBe("suspended");
    expect(rpcCalls[0]?.name).toBe("dealer_set_status");
    expect(rpcCalls[0]?.args).toEqual({
      p_dealer_id: DEALER_ID,
      p_new_status: "suspended",
      p_reason: "non-payment",
    });
  });

  it("422 — invalid status 'pending' rejected by zod, RPC not called", async () => {
    const { sb, rpcCalls } = buildSb({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/principal/dealers/${DEALER_ID}/status`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpcCalls).toHaveLength(0);
  });

  it("404 — RPC raises 42P01 (dealer not found) maps to HTTP 404", async () => {
    const { sb } = buildSb({
      rpcResults: {
        dealer_set_status: {
          error: { code: "42P01", message: "dealer not found" },
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/principal/dealers/${DEALER_ID}/status`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }),
      env,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error).toBe("not_found");
  });
});

