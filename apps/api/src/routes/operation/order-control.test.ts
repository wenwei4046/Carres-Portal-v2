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
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

/** Chainable supabase query-builder mock — both the GET (select→eq→maybeSingle)
 *  and PUT (upsert→select→single) chains resolve to the same `result`. */
function makeSb(result: { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
  };
  return { from: vi.fn(() => builder), builder };
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

const ORDER_ID = "00000000-0000-0000-0000-00000000010a";

const ROW = {
  order_id: ORDER_ID,
  stock_location: ["Carres Klang"],
  stock_eta: "2026-06-20",
  customer_request: "postponed",
  action_for_logistic: null,
  carres_remark: null,
  warehouse_remark: null,
  payment_status: "Follow Up",
  updated_at: "2026-06-09T10:00:00.000Z",
  updated_by: "u1",
};

// =====================================================================
// GET /api/operation/orders/:id/control
// =====================================================================
describe("GET /api/operation/orders/:id/control", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("404 when order id isn't a uuid", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/not-a-uuid/control`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("200 — returns the overlay row when present", async () => {
    const sb = makeSb({ data: ROW, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { control: typeof ROW };
    expect(body.control.payment_status).toBe("Follow Up");
    expect(sb.from).toHaveBeenCalledWith("ops_order_control");
  });

  it("200 — returns { control: null } when no row exists yet", async () => {
    const sb = makeSb({ data: null, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { control: unknown };
    expect(body.control).toBeNull();
  });
});

// =====================================================================
// PUT /api/operation/orders/:id/control
// =====================================================================
describe("PUT /api/operation/orders/:id/control", () => {
  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payment_status: "Paid" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("400 when body is not valid JSON", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: "{not json",
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("422 when patch contains an unknown key (strict)", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ random_typo: "yes" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("422 when patch object is empty", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("at least one field");
  });

  it("422 when stock_eta isn't yyyy-mm-dd", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ stock_eta: "20 June" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("200 — upserts with order_id + updated_by and returns the row", async () => {
    const sb = makeSb({ data: ROW, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          stock_location: ["Carres Klang"],
          payment_status: "Follow Up",
          customer_request: "postponed",
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.builder.upsert).toHaveBeenCalledWith(
      {
        order_id: ORDER_ID,
        stock_location: ["Carres Klang"],
        payment_status: "Follow Up",
        customer_request: "postponed",
        updated_by: "u1",
      },
      { onConflict: "order_id" },
    );
    const body = (await res.json()) as { control: typeof ROW };
    expect(body.control.order_id).toBe(ORDER_ID);
  });

  it("maps a PG RLS denial (42501) → 403", async () => {
    const sb = makeSb({
      data: null,
      error: { code: "42501", message: "new row violates row-level security policy" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payment_status: "Paid" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
