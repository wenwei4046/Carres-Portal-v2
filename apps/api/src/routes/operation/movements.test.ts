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

describe("GET /api/operation/movements", () => {
  // Sample movement row matching schema columns (no unit_price — column does
  // not exist on stock_movements per migration 0001 §3.10).
  const ROW = {
    id: "00000000-0000-0000-0000-0000000000m1",
    sku: "mattress:carres-cloud:King",
    warehouse_id: "00000000-0000-0000-0000-0000000000c1",
    qty: 6,
    kind: "in",
    ref: "PO-3310",
    note: "DO #DO-77310 from Nice Future",
    by_role: "operation",
    occurred_at: "2026-05-03T10:00:00Z",
  };

  /**
   * Build a userClient mock whose `.from("stock_movements")` returns a thenable
   * chain object. Each filter method (.eq, .like, .ilike, .or, .gte, .lt) is a
   * vi.fn().mockReturnThis() so calls can be asserted; `.order().limit()`
   * resolves with rows. The chain doubles as a thenable so `await q` works
   * after `.limit(...)`.
   */
  function mockMovementsList(rows: typeof ROW[]) {
    const eq = vi.fn().mockReturnThis();
    const like = vi.fn().mockReturnThis();
    const ilike = vi.fn().mockReturnThis();
    const or = vi.fn().mockReturnThis();
    const gte = vi.fn().mockReturnThis();
    const lt = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn(() => ({ eq, like, ilike, or, gte, lt, order, limit }));
    vi.mocked(userClient).mockReturnValue({
      from: vi.fn(() => ({ select })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { eq, like, ilike, or, gte, lt, order, limit };
  }

  it("returns 200 with rows + limit on default filters (period=30d cutoff applied)", async () => {
    const { gte, order, limit } = mockMovementsList([ROW]);
    const before = Date.now();
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/movements", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    const after = Date.now();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: typeof ROW[]; limit: number };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]?.sku).toBe("mattress:carres-cloud:King");
    expect(body.limit).toBe(200);
    // .order(occurred_at desc) + .limit(200) baseline.
    expect(order).toHaveBeenCalledWith("occurred_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(200);
    // .gte("occurred_at", isoCutoff) where cutoff is ~30 days ago. We can't
    // pin an exact ms but we can bracket: cutoff is between (before-30d) and
    // (after-30d).
    expect(gte).toHaveBeenCalledTimes(1);
    const gteCall = gte.mock.calls[0]!;
    expect(gteCall[0]).toBe("occurred_at");
    const cutoffMs = Date.parse(gteCall[1] as string);
    const THIRTY_D = 30 * 24 * 60 * 60 * 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(before - THIRTY_D - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after - THIRTY_D + 1000);
  });

  it("filters by warehouseId when query param provided", async () => {
    const { eq } = mockMovementsList([ROW]);
    const wh = "00000000-0000-0000-0000-0000000000c1";
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request(`http://t/api/operation/movements?warehouseId=${wh}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(eq).toHaveBeenCalledWith("warehouse_id", wh);
  });

  it("filters by category=mattress as SKU prefix `mattress:%`", async () => {
    const { like } = mockMovementsList([ROW]);
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request("http://t/api/operation/movements?category=mattress", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    // SKU convention is `cat:model:variant` (lowercase, colon-separated) per
    // seed.sql — see `mattress:carres-cloud:King`. NOT `MAT%`.
    expect(like).toHaveBeenCalledWith("sku", "mattress:%");
  });

  it("filters by category=bedframe / sofa as SKU prefixes", async () => {
    {
      const { like } = mockMovementsList([ROW]);
      const jwt = await makeJwt("operation");
      await app.fetch(
        new Request("http://t/api/operation/movements?category=bedframe", {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(like).toHaveBeenCalledWith("sku", "bedframe:%");
    }
    {
      const { like } = mockMovementsList([ROW]);
      const jwt = await makeJwt("operation");
      await app.fetch(
        new Request("http://t/api/operation/movements?category=sofa", {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(like).toHaveBeenCalledWith("sku", "sofa:%");
    }
  });

  it("filters by sku partial match (ilike)", async () => {
    const { ilike } = mockMovementsList([ROW]);
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request("http://t/api/operation/movements?sku=carres-cloud", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(ilike).toHaveBeenCalledWith("sku", "%carres-cloud%");
  });

  it("filters by kind=in (and kind=out)", async () => {
    {
      const { eq } = mockMovementsList([ROW]);
      const jwt = await makeJwt("operation");
      await app.fetch(
        new Request("http://t/api/operation/movements?kind=in", {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(eq).toHaveBeenCalledWith("kind", "in");
    }
    {
      const { eq } = mockMovementsList([ROW]);
      const jwt = await makeJwt("operation");
      await app.fetch(
        new Request("http://t/api/operation/movements?kind=out", {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(eq).toHaveBeenCalledWith("kind", "out");
    }
  });

  it("filters search across ref + note via .or() with ilike interpolation", async () => {
    const { or } = mockMovementsList([ROW]);
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request("http://t/api/operation/movements?search=DO-77310", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    // Regex whitelist allows letters / numbers / dash, so DO-77310 passes.
    expect(or).toHaveBeenCalledWith("ref.ilike.%DO-77310%,note.ilike.%DO-77310%");
  });

  it("period=7d sets .gte(occurred_at, ~7 days ago)", async () => {
    const { gte } = mockMovementsList([ROW]);
    const before = Date.now();
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request("http://t/api/operation/movements?period=7d", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    const after = Date.now();
    expect(gte).toHaveBeenCalledTimes(1);
    const cutoffMs = Date.parse(gte.mock.calls[0]![1] as string);
    const SEVEN_D = 7 * 24 * 60 * 60 * 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(before - SEVEN_D - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after - SEVEN_D + 1000);
  });

  it("period=all skips occurred_at filter entirely (no .gte / .lt called)", async () => {
    const { gte, lt } = mockMovementsList([ROW]);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/movements?period=all", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(gte).not.toHaveBeenCalled();
    expect(lt).not.toHaveBeenCalled();
  });

  it("period=custom with from + to applies .gte(from) AND .lt(to)", async () => {
    const { gte, lt } = mockMovementsList([ROW]);
    const from = "2026-04-01T00:00:00Z";
    const to = "2026-05-01T00:00:00Z";
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(
        `http://t/api/operation/movements?period=custom&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: { Authorization: `Bearer ${jwt}` } },
      ),
      env,
    );
    expect(res.status).toBe(200);
    expect(gte).toHaveBeenCalledWith("occurred_at", from);
    expect(lt).toHaveBeenCalledWith("occurred_at", to);
  });

  it("period=custom missing from → 422 invalid_query (no Supabase round-trip)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/movements?period=custom&to=2026-05-01T00:00:00Z", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error).toBe("invalid_query");
    expect(body.code).toBe("invalid_param");
    expect(from).not.toHaveBeenCalled();
  });

  it("invalid period value → 422 zod rejection", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/movements?period=bogus", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_query");
    expect(from).not.toHaveBeenCalled();
  });

  it("search regex rejects shell/sql metacharacters → 422", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(
        // %' OR 1=1 -- (URL encoded) — must be rejected by the whitelist regex.
        `http://t/api/operation/movements?search=${encodeURIComponent("%' OR 1=1 --")}`,
        { headers: { Authorization: `Bearer ${jwt}` } },
      ),
      env,
    );
    expect(res.status).toBe(422);
    expect(from).not.toHaveBeenCalled();
  });

  it("LIMIT 200 always applied regardless of filters", async () => {
    const { limit } = mockMovementsList([ROW]);
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request("http://t/api/operation/movements?period=all&kind=in", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(limit).toHaveBeenCalledWith(200);
  });

  it("returns 403 for dealer role (no Supabase round-trip)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/movements", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(new Request("http://t/api/operation/movements"), env);
    expect(res.status).toBe(401);
  });
});
