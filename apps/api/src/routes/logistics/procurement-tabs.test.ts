import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
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
const KID = "ptk-1";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000777")
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

describe("GET /api/logistics/procurement/:slug", () => {
  /**
   * Mock the supabase query chain. The route builds:
   *   sb.from("purchase_orders")
   *     .select("...")
   *     .eq("suppliers.slug", supplierSlug)
   *     [.like("purchase_order_lines.sku", "<cat>:%")]?
   *     .order(...)
   *     .limit(...) -> { data, error }
   */
  function mockChain(rows: unknown[]) {
    // Track every chain call so we can assert which filters fired.
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const like = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ like, order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    return { from, select, eq, like, order, limit };
  }

  const NICE_FUTURE_PO = {
    id: "PO-3001",
    supplier_id: "00000000-0000-0000-0000-000000000a01",
    warehouse_id: "00000000-0000-0000-0000-000000000b01",
    status: "open",
    sup_status: "pending",
    dl: 5001,
    dl_refs: null,
    eta_date: "2026-05-20",
    placed_at: "2026-05-06T09:00:00Z",
    suppliers: { slug: "nice-future", name: "Nice Future" },
    purchase_order_lines: [{ sku: "mattress:carres-cloud:King", qty: 2, received_qty: 0 }],
  };

  const HOOKKA_SOFA_PO = {
    id: "PO-3010",
    supplier_id: "00000000-0000-0000-0000-000000000a02",
    warehouse_id: "00000000-0000-0000-0000-000000000b01",
    status: "open",
    sup_status: "pending",
    dl: 5010,
    dl_refs: null,
    eta_date: "2026-05-22",
    placed_at: "2026-05-06T09:30:00Z",
    suppliers: { slug: "hookka", name: "HoOKkA" },
    purchase_order_lines: [{ sku: "sofa:harbour:preset:3-seater", qty: 1, received_qty: 0 }],
  };

  // ----- Happy path: nice-future -----
  it("nice-future: 200 + supplier-slug filter, no category prefix", async () => {
    const { from, select, eq, like, order, limit } = mockChain([NICE_FUTURE_PO]);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/nice-future", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pos: typeof NICE_FUTURE_PO[] };
    expect(body.pos).toHaveLength(1);
    expect(body.pos[0]?.id).toBe("PO-3001");
    expect(body.pos[0]?.suppliers.slug).toBe("nice-future");

    // Chain shape assertions.
    expect(from).toHaveBeenCalledWith("purchase_orders");
    expect(select).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith("suppliers.slug", "nice-future");
    // No category narrowing for nice-future tab (mattress only via supplier).
    expect(like).not.toHaveBeenCalled();
    expect(order).toHaveBeenCalledWith("placed_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(200);
  });

  // ----- Happy path: hookka-sofa -----
  it("hookka-sofa: 200 + supplier=hookka + category=sofa SKU prefix", async () => {
    const { eq, like, order, limit } = mockChain([HOOKKA_SOFA_PO]);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/hookka-sofa", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pos: typeof HOOKKA_SOFA_PO[] };
    expect(body.pos).toHaveLength(1);
    expect(body.pos[0]?.id).toBe("PO-3010");
    expect(body.pos[0]?.suppliers.slug).toBe("hookka");

    expect(eq).toHaveBeenCalledWith("suppliers.slug", "hookka");
    expect(like).toHaveBeenCalledWith("purchase_order_lines.sku", "sofa:%");
    expect(order).toHaveBeenCalledWith("placed_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(200);
  });

  // ----- Happy path: hookka-bedframe -----
  it("hookka-bedframe: 200 + supplier=hookka + category=bedframe SKU prefix", async () => {
    const { eq, like } = mockChain([]);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/hookka-bedframe", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pos: unknown[] };
    expect(body.pos).toEqual([]);

    expect(eq).toHaveBeenCalledWith("suppliers.slug", "hookka");
    expect(like).toHaveBeenCalledWith("purchase_order_lines.sku", "bedframe:%");
  });

  // ----- 422 invalid slug -----
  it("returns 422 for an unknown slug", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/foobar", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string; message: string };
    expect(body.code).toBe("invalid_slug");
    // No Supabase round-trip on invalid slug.
    expect(from).not.toHaveBeenCalled();
  });

  // ----- 403 non-logistics role -----
  it("returns 403 for dealer role (no Supabase round-trip)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/nice-future", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  // ----- 401 no auth header -----
  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/nice-future"),
      env,
    );
    expect(res.status).toBe(401);
  });

  // ----- 500 RPC error mapping -----
  it("maps an unexpected supabase error to 500", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/procurement/nice-future", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(500);
  });
});
