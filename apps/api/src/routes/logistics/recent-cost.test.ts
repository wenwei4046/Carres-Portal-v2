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
const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("u1")
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
 * T42-C6 — the route now chains (post-codex-re-review fix):
 *   sb.from('purchase_orders')
 *     .select('id, updated_at, purchase_order_lines!inner(cost, sku)')
 *     .eq('status', 'received')
 *     .eq('purchase_order_lines.sku', sku)
 *     .not('purchase_order_lines.cost', 'is', null)
 *     .order('updated_at', { ascending: false })
 *     .limit(1)
 *     .maybeSingle()
 *
 * Was previously chained from `purchase_order_lines` with a foreignTable
 * order — that only sorts the embedded relation (no-op on 1:1) and the
 * top-level limit picked an arbitrary parent row. Codex re-review caught it.
 *
 * We make every chained method `mockReturnThis()` except `.maybeSingle()`
 * which is the awaited terminal — that one resolves to `{ data, error }`.
 */
function makeChain(opts: { data: unknown; error?: { code?: string; message?: string } | null }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: opts.data, error: opts.error ?? null }),
  };
  const from = vi.fn(() => chain);
  return { from, chain };
}

const SKU = "MAT-CLOUD-Q";
const URL = `http://t/api/logistics/skus/${SKU}/recent-cost`;

describe("GET /api/logistics/skus/:sku/recent-cost", () => {
  it("happy path — historical received PO line returns 200 + cost/lastPoId/lastReceivedAt", async () => {
    const m = makeChain({
      data: {
        id: "PO-2050",
        updated_at: "2026-01-15T08:30:00Z",
        // PostgREST embeds the inner-joined child as an array; filtered by
        // sku + cost-not-null so element 0 carries the cost we want.
        purchase_order_lines: [{ cost: 12.5, sku: SKU }],
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cost: number | null; lastPoId: string | null; lastReceivedAt: string | null };
    expect(body).toEqual({
      cost: 12.5,
      lastPoId: "PO-2050",
      lastReceivedAt: "2026-01-15T08:30:00Z",
    });
    // Verify the chain was wired correctly — T42-C6 re-pivot: parent table
    // is now `purchase_orders`; ORDER + LIMIT sit on the parent so the most
    // recently received PO wins (foreignTable order is no-op on 1:1).
    expect(m.from).toHaveBeenCalledWith("purchase_orders");
    expect(m.chain.eq).toHaveBeenCalledWith("status", "received");
    expect(m.chain.eq).toHaveBeenCalledWith("purchase_order_lines.sku", SKU);
    expect(m.chain.not).toHaveBeenCalledWith("purchase_order_lines.cost", "is", null);
    expect(m.chain.order).toHaveBeenCalledWith("updated_at", {
      ascending: false,
    });
    expect(m.chain.limit).toHaveBeenCalledWith(1);
    expect(m.chain.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("no historical data — never-received SKU returns 200 + all-null body", async () => {
    const m = makeChain({ data: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cost: number | null; lastPoId: string | null; lastReceivedAt: string | null };
    expect(body).toEqual({ cost: null, lastPoId: null, lastReceivedAt: null });
    expect(m.from).toHaveBeenCalledWith("purchase_orders");
  });

  it("rejects dealer with 403 (role gate fires before any DB call)", async () => {
    const m = makeChain({ data: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
    expect(m.from).not.toHaveBeenCalled();
  });

  it("rejects principal with 403 (HTTP route narrower than RLS — same gate as T18/T19)", async () => {
    const m = makeChain({ data: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
    expect(m.from).not.toHaveBeenCalled();
  });

  it("PG error → mapped via mapPgError (42501 → 403)", async () => {
    const m = makeChain({ data: null, error: { code: "42501", message: "rls denied" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("forbidden");
  });

  it("embedded child as singular object (defensive normalizer fallback) — still picks cost", async () => {
    // T42-C6 — the embedded relation is normally an array (1-to-many fk
    // direction), but in case supabase-js's normalization ever returns a
    // singular object on a filtered 1:1-narrowed embed, the route still
    // picks `cost` off it. This is the defensive fallback branch.
    const m = makeChain({
      data: {
        id: "PO-2099",
        updated_at: "2025-12-01T00:00:00Z",
        purchase_order_lines: { cost: 9.99, sku: SKU },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: m.from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cost: number | null; lastPoId: string | null; lastReceivedAt: string | null };
    expect(body).toEqual({
      cost: 9.99,
      lastPoId: "PO-2099",
      lastReceivedAt: "2025-12-01T00:00:00Z",
    });
  });
});
