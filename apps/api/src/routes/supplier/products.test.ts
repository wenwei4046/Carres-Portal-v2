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
  // 2026-05-10 (Loo) — route now reads purchase_order_lines (post-0017 the
  // qty/sku columns moved off purchase_orders) AND merges pending demand
  // from the supplier_pending_demand RPC. Mocks reflect both sources.
  function mockDemandSb(opts: {
    lines: Array<{
      sku: string;
      qty: number;
      purchase_orders: { id: string; sup_status: string };
    }>;
    pending: Array<{ sku: string; pending_qty: number; order_count: number }>;
    linesInFn?: ReturnType<typeof vi.fn>;
  }) {
    const inFn =
      opts.linesInFn ??
      vi.fn().mockResolvedValue({ data: opts.lines, error: null });
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ in: inFn }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: opts.pending, error: null }),
    };
  }

  it("aggregates open-PO demand by SKU and sorts desc", async () => {
    const sb = mockDemandSb({
      lines: [
        { sku: "mattress:cloud:Queen", qty: 10, purchase_orders: { id: "PO-1", sup_status: "pending" } },
        { sku: "mattress:cloud:Queen", qty: 5, purchase_orders: { id: "PO-2", sup_status: "in_production" } },
        { sku: "mattress:cloud:King", qty: 3, purchase_orders: { id: "PO-3", sup_status: "ready_for_pickup" } },
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
    const rows = (await res.json()) as Array<{ sku: string; openQty: number; poCount: number }>;
    expect(rows[0]).toMatchObject({
      sku: "mattress:cloud:Queen",
      openQty: 15,
      poCount: 2,
    });
    expect(rows[1]).toMatchObject({
      sku: "mattress:cloud:King",
      openQty: 3,
      poCount: 1,
    });
  });

  it("only includes open sup_status on the embedded purchase_orders filter", async () => {
    const inFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const sb = mockDemandSb({ lines: [], pending: [], linesInFn: inFn });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    await app.fetch(
      new Request("http://t/api/supplier/products/demand", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(inFn).toHaveBeenCalledWith("purchase_orders.sup_status", [
      "pending",
      "acknowledged",
      "in_production",
      "ready_for_pickup",
      "pickup_assigned",
      "pickup_accepted",
      // 2026-05-15 (Task 14) — partially_shipped from migration 0107 is now
      // considered "open" for forecast aggregation (PO still has un-picked
      // threads with open demand).
      "partially_shipped",
      "shipped",
      "reassign_needed",
    ]);
  });

  it("returns empty array when no open POs and no pending orders", async () => {
    const sb = mockDemandSb({ lines: [], pending: [] });
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
    expect(await res.json()).toEqual([]);
  });

  it("merges pending demand from supplier_pending_demand RPC alongside open POs", async () => {
    const sb = mockDemandSb({
      lines: [
        { sku: "mattress:cloud:Queen", qty: 5, purchase_orders: { id: "PO-1", sup_status: "pending" } },
      ],
      pending: [
        { sku: "mattress:cloud:Queen", pending_qty: 3, order_count: 2 },
        { sku: "mattress:cloud:King", pending_qty: 7, order_count: 4 },
      ],
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
    const rows = (await res.json()) as Array<{
      sku: string;
      openQty: number;
      poCount: number;
      pendingQty: number;
      pendingOrderCount: number;
    }>;
    // Queen: openQty 5 + pending 3 = 8 (highest, sorted first).
    expect(rows[0]).toMatchObject({
      sku: "mattress:cloud:Queen",
      openQty: 5,
      poCount: 1,
      pendingQty: 3,
      pendingOrderCount: 2,
    });
    // King: openQty 0 + pending 7 = 7.
    expect(rows[1]).toMatchObject({
      sku: "mattress:cloud:King",
      openQty: 0,
      poCount: 0,
      pendingQty: 7,
      pendingOrderCount: 4,
    });
  });

  it("rejects partner role with 403", async () => {
    const jwt = await makeJwt("partner");
    const res = await app.fetch(
      new Request("http://t/api/supplier/products/demand", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
