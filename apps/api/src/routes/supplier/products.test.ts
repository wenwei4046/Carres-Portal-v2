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

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000006")
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

describe("GET /api/supplier/products", () => {
  it("lists supplier SKUs joined to product_models (RLS-scoped)", async () => {
    const finalOrder = vi.fn().mockResolvedValue({
      data: [
        {
          sku: "mattress:cloud:Queen",
          category: "mattress",
          model_key: "cloud",
          variant: "Queen",
          price: 2500,
          model: { name: "Cloud Series", blurb: "Memory foam" },
        },
      ],
      error: null,
    });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi
            .fn()
            .mockReturnValue({ order: vi.fn().mockReturnValue({ order: finalOrder }) }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/products", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.from).toHaveBeenCalledWith("product_skus");
    expect(((await res.json()) as unknown[]).length).toBe(1);
  });

  it("rejects non-supplier roles with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/supplier/products", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/supplier/products/demand", () => {
  // 2026-05-24 — both buckets are now SECURITY DEFINER RPCs that carry
  // `category` (resolve_demand_category): supplier_committed_demand (Commit)
  // and supplier_pending_demand (Forecast). The route merges by sku.
  function mockDemandSb(opts: {
    committed: Array<{ sku: string; category: string | null; committed_qty: number; po_count: number }>;
    pending: Array<{ sku: string; category: string | null; pending_qty: number; order_count: number }>;
  }) {
    return {
      rpc: vi.fn().mockImplementation((name: string) =>
        Promise.resolve({
          data: name === "supplier_committed_demand" ? opts.committed : opts.pending,
          error: null,
        }),
      ),
    };
  }

  it("aggregates committed PO demand by sku with category, sorted desc", async () => {
    const sb = mockDemandSb({
      committed: [
        { sku: "MS01-cloud-Q", category: "mattress", committed_qty: 15, po_count: 2 },
        { sku: "MS01-cloud-K", category: "mattress", committed_qty: 3, po_count: 1 },
      ],
      pending: [],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/products/demand", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ sku: string; category: string; openQty: number; poCount: number }>;
    expect(rows[0]).toMatchObject({ sku: "MS01-cloud-Q", category: "mattress", openQty: 15, poCount: 2 });
    expect(rows[1]).toMatchObject({ sku: "MS01-cloud-K", category: "mattress", openQty: 3, poCount: 1 });
  });

  it("calls both supplier demand RPCs by name", async () => {
    const sb = mockDemandSb({ committed: [], pending: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    await app.fetch(
      new Request("http://t/api/supplier/products/demand", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(sb.rpc).toHaveBeenCalledWith("supplier_committed_demand");
    expect(sb.rpc).toHaveBeenCalledWith("supplier_pending_demand");
  });

  it("returns empty array when both buckets are empty", async () => {
    const sb = mockDemandSb({ committed: [], pending: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/products/demand", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("merges Forecast (pending) and Commit (committed) by sku, carrying category", async () => {
    const sb = mockDemandSb({
      committed: [{ sku: "MS01-cloud-Q", category: "mattress", committed_qty: 5, po_count: 1 }],
      pending: [
        { sku: "MS01-cloud-Q", category: "mattress", pending_qty: 3, order_count: 2 },
        { sku: "MS01-cloud-K", category: "mattress", pending_qty: 7, order_count: 4 },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/products/demand", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{
      sku: string; category: string; openQty: number; poCount: number; pendingQty: number; pendingOrderCount: number;
    }>;
    // Queen: committed 5 + pending 3 = 8 (sorted first).
    expect(rows[0]).toMatchObject({ sku: "MS01-cloud-Q", category: "mattress", openQty: 5, poCount: 1, pendingQty: 3, pendingOrderCount: 2 });
    // King: committed 0 + pending 7 = 7.
    expect(rows[1]).toMatchObject({ sku: "MS01-cloud-K", category: "mattress", openQty: 0, poCount: 0, pendingQty: 7, pendingOrderCount: 4 });
  });

  it("rejects partner role with 403", async () => {
    const jwt = await makeJwt("partner");
    const res = await app.fetch(
      new Request("http://t/api/supplier/products/demand", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
