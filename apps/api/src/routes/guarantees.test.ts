import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import { Hono } from "hono";
import { authMiddleware, _setJwksForTesting } from "../middleware/auth";
import guaranteesRouter from "./guarantees";
import type { AppEnv } from "../types";

/**
 * Guarantee packages (0261-0263) — route contract.
 *
 * The two things worth guarding here are the ones a UI bug can't reveal:
 * a non-ops role must not be able to spend a guarantee, and the list must
 * DERIVE expiry rather than echo the stored word (an 'active' row whose date
 * has passed is expired, whether or not any job ran).
 */

vi.mock("../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";
const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

function buildApp() {
  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Internal server error";
    return c.json({ error: "server_error", message }, status as 400 | 401 | 403 | 404 | 422 | 500);
  });
  const api = new Hono<AppEnv>();
  api.use("*", authMiddleware);
  api.route("/guarantees", guaranteesRouter);
  app.route("/api", api);
  return app;
}
const app = buildApp();

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string, dealerId: string | null = null) {
  return new SignJWT({
    email: "test@carres.com",
    app_metadata: { role, ...(dealerId ? { dealer_id: dealerId } : {}) },
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

/** Chainable read stub: every filter/order/limit returns `this`, and awaiting
 *  anywhere in the chain resolves the stubbed rows for that table. */
function buildSb(tables: Record<string, unknown[]>, rpc?: { data?: unknown; error?: unknown }) {
  const make = (table: string) => {
    const rows = tables[table] ?? [];
    const chain: Record<string, unknown> = {
      then: (res: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(res),
    };
    for (const m of ["select", "eq", "neq", "or", "order", "limit", "in", "is"]) {
      chain[m] = () => chain;
    }
    return chain;
  };
  return {
    from: vi.fn((table: string) => make(table)),
    rpc: vi.fn(async () => ({ data: rpc?.data ?? { ok: true }, error: rpc?.error ?? null })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const ROW = {
  id: "e1",
  guarantee_id: "ABCD123456",
  claimed_guarantee_id: null,
  order_id: "o1",
  order_line_id: "l1",
  guarantee_sku: "GRT-MATTRESS-15Y",
  unit_no: 1,
  covers_line_id: "l0",
  covers_sku: "B1201S-K",
  covers_model_id: "m1",
  covers_label: "B1201S King",
  customer_id: null,
  customer_name: "Tan",
  customer_phone: "0125478547",
  phone_key: "125478547",
  coverage_years: 15,
  remedy: "replace",
  starts_on: "2026-08-01",
  expires_on: "2041-08-01",
  status: "active",
  claimed_at: null,
  claim_case_id: null,
  claim_notes: null,
  replacement_sku: null,
  void_reason: null,
  orders: { so: 1240 },
  service_cases: null,
};

const TERMS = [{ guarantee_sku: "GRT-MATTRESS-15Y", label: "Mattress Guarantee 15 Years" }];

describe("GET /api/guarantees/order/:orderId", () => {
  it("maps the ledger row to the DTO, carrying the SO and the covered model", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({ guarantee_entitlements: [ROW], guarantee_terms: TERMS }),
    );
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/guarantees/order/o1", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      guaranteeId: "ABCD123456",
      so: 1240,
      coversLabel: "B1201S King",
      guaranteeLabel: "Mattress Guarantee 15 Years",
      status: "active",
      effectiveStatus: "active",
      coverageYears: 15,
    });
  });

  it("derives 'expired' from the date even though the stored word says active", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        guarantee_entitlements: [{ ...ROW, expires_on: "2020-01-01" }],
        guarantee_terms: TERMS,
      }),
    );
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/guarantees/order/o1", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.items[0].status).toBe("active");
    expect(body.items[0].effectiveStatus).toBe("expired");
  });

  it("lets a store read its own order's guarantees (RLS scopes the rows)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({ guarantee_entitlements: [ROW], guarantee_terms: TERMS }),
    );
    const jwt = await makeJwt("dealer", "d1");
    const res = await app.fetch(
      new Request("http://t/api/guarantees/order/o1", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/guarantees/:id/claim", () => {
  it("refuses a store login — a guarantee can only be spent by ops", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({}));
    const jwt = await makeJwt("dealer", "d1");
    const res = await app.fetch(
      new Request("http://t/api/guarantees/e1/claim", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("refuses finance too — the claim moves goods, not money", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({}));
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/guarantees/e1/claim", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("passes the swap through to the guarantee_claim RPC for operation", async () => {
    const sb = buildSb({}, { data: { ok: true, status: "claimed" } });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/guarantees/e1/claim", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ replacementSku: "B1201S-K", notes: "foam collapsed" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("guarantee_claim", {
      p_entitlement_id: "e1",
      p_case_id: null,
      p_replacement_sku: "B1201S-K",
      p_notes: "foam collapsed",
    });
  });
});

describe("POST /api/guarantees/:id/attach", () => {
  it("requires a real line id", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({}));
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/guarantees/e1/attach", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderLineId: "nope" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("GET /api/guarantees — the ID is the primary handle (0267)", () => {
  it("looks a typed ID up against BOTH the live and the retired column", async () => {
    const sb = buildSb({ guarantee_entitlements: [ROW], guarantee_terms: TERMS });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/guarantees?q=abcd-123%20456", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.items[0].guaranteeId).toBe("ABCD123456");
  });

  it("surfaces a CLAIMED guarantee's retired id — never a bare 'not found'", async () => {
    const spent = {
      ...ROW,
      guarantee_id: null,
      claimed_guarantee_id: "ZZZZ000111",
      status: "claimed",
      claimed_at: "2026-08-02T00:00:00Z",
    };
    vi.mocked(userClient).mockReturnValue(
      buildSb({ guarantee_entitlements: [spent], guarantee_terms: TERMS }),
    );
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/guarantees?q=ZZZZ000111", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.items[0]).toMatchObject({
      guaranteeId: null,
      claimedGuaranteeId: "ZZZZ000111",
      effectiveStatus: "claimed",
    });
  });
});
