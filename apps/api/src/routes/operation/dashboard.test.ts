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

const SUMMARY_PAYLOAD = {
  kpis: { today_deliveries: 3, open_pos: 7, overdue: 1, active_orders: 12, active_gmv: 45000 },
  pipeline: { in_production: [], ready_to_dispatch: [], dispatched: [] },
  open_pos: [],
  low_stock: [],
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
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

/**
 * Mock the supabase user client for dashboard tests. The route does:
 *   1. sb.rpc("operation_dashboard_summary")
 *   2. Placed count   — .from('orders').select(...).eq('status','place').or(<native>)
 *   3. Confirmed count — .from('orders').select(...).or(<confirmed OR autocount-place>)
 *
 * Both count queries terminate on `.or(...)`; `.eq` (query 2 above) is an
 * intermediate link. `placedCount` / `proceedRequestCount` set the return
 * values for the first / second terminal `.or` call.
 */
function mockDashboard(opts: {
  summary?: typeof SUMMARY_PAYLOAD | null;
  rpcError?: { code: string; message?: string };
  placedCount?: number;
  proceedRequestCount?: number;
}) {
  const rpc = vi.fn().mockResolvedValue(
    opts.rpcError
      ? { data: null, error: opts.rpcError }
      : { data: opts.summary ?? SUMMARY_PAYLOAD, error: null },
  );
  // Each .from('orders') call returns a chainable where .eq() links onward and
  // .or() is the terminal that resolves to { data, error, count }. The .or call
  // order picks the count: first .or (placed query) → placedCount, second .or
  // (confirmed query) → proceedRequestCount.
  let orCallIdx = 0;
  const counts = [opts.placedCount ?? 0, opts.proceedRequestCount ?? 0];
  const from = vi.fn(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    chain.eq = vi.fn(() => chain);
    chain.or = vi.fn(() => {
      const count = counts[orCallIdx] ?? 0;
      orCallIdx += 1;
      return Promise.resolve({ data: null, error: null, count });
    });
    return { select: vi.fn(() => chain) };
  });
  vi.mocked(userClient).mockReturnValue({
    rpc,
    from,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return { rpc, from };
}

describe("GET /api/operation/dashboard", () => {
  it("returns 200 + summary JSON for operation", async () => {
    mockDashboard({ summary: SUMMARY_PAYLOAD, placedCount: 0, proceedRequestCount: 0 });

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/dashboard", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.kpis.today_deliveries).toBe(3);
  });

  it("merges pipeline.placed + pipeline.confirmed count fields (Pipeline v2)", async () => {
    mockDashboard({ summary: SUMMARY_PAYLOAD, placedCount: 4, proceedRequestCount: 2 });

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/dashboard", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.pipeline.placed).toBe(4);
    expect(body.pipeline.confirmed).toBe(2);
    // Existing 0019 RPC counts must still be present.
    expect(body.pipeline.in_production).toEqual([]);
    expect(body.pipeline.ready_to_dispatch).toEqual([]);
    expect(body.pipeline.dispatched).toEqual([]);
  });

  it("RPC pipeline keys win on collision with route-side counts (spread order intent)", async () => {
    // Spread order in dashboard.ts is `{ placed: ..., confirmed: ..., ...pipeline }`.
    // If the 0019 RPC ever starts returning its own placed/confirmed inside
    // `summary.pipeline`, those values must clobber the route's count queries
    // (since the RPC is the source of truth and the count queries are a temporary
    // augmentation while 0019 is frozen). Lock that intent in here so a careless
    // future refactor doesn't flip the spread order silently.
    const SUMMARY_WITH_PIPELINE_COUNTS = {
      kpis: { today_deliveries: 3, open_pos: 7, overdue: 1, active_orders: 12, active_gmv: 45000 },
      pipeline: {
        placed: 999,
        confirmed: 999,
        in_production: [],
        ready_to_dispatch: [],
        dispatched: [],
      },
      open_pos: [],
      low_stock: [],
    };
    mockDashboard({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      summary: SUMMARY_WITH_PIPELINE_COUNTS as any,
      placedCount: 5,
      proceedRequestCount: 7,
    });

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/dashboard", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    // RPC wins — its 999 values override the route-side 5/7 counts.
    expect(body.pipeline.placed).toBe(999);
    expect(body.pipeline.confirmed).toBe(999);
  });

  it("returns 403 for principal role (no Supabase round-trip)", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/operation/dashboard", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(new Request("http://t/api/operation/dashboard"), env);
    expect(res.status).toBe(401);
  });
});
