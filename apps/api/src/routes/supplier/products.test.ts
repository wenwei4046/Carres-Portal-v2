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
  it("aggregates open-PO demand by SKU and sorts desc", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              { id: "PO-1", sku: "mattress:cloud:Queen", qty: 10, sup_status: "pending" },
              { id: "PO-2", sku: "mattress:cloud:Queen", qty: 5, sup_status: "in_production" },
              { id: "PO-3", sku: "mattress:cloud:King", qty: 3, sup_status: "ready_for_pickup" },
            ],
            error: null,
          }),
        }),
      }),
    };
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

  it("only includes open sup_status (not delivered/picked_up)", async () => {
    const inFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ in: inFn }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    await app.fetch(
      new Request("http://t/api/supplier/products/demand", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(inFn).toHaveBeenCalledWith("sup_status", [
      "pending",
      "acknowledged",
      "in_production",
      "ready_for_pickup",
      "pickup_assigned",
      "pickup_accepted",
      "shipped",
      "reassign_needed",
    ]);
  });

  it("returns empty array when no open POs", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    };
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
