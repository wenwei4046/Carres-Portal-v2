/**
 * THE DELIVERY PAYMENT APPROVAL doors (0362, owner ruling 2026-08-19).
 *
 * The DATABASE is the boundary — the request RPC refuses roles outside
 * operation / salesperson / principal, the decide RPC runs the approver gate
 * (principal, or the delivery_payment_approver duty), rows refuse deletion
 * and a decision is never re-decided. Those live in SQL and are proven on
 * production after 0362 applies. These tests cover the ROUTE: schema
 * refusals, RPC pass-through (including the database's own errors surfacing
 * as readable refusals), and the approve hook that lets the SYSTEM attempt
 * the issue on the admin client, fail-soft.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { adminClient, userClient } from "../../lib/supabase";

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
    .setSubject("11111111-1111-1111-1111-000000000001")
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
  vi.mocked(adminClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

const ORDER_ID = "00000000-0000-0000-0000-0000000ba001";
const REQ_ID = "00000000-0000-0000-0000-0000000ba002";

const PENDING_ROW = {
  id: REQ_ID,
  order_id: ORDER_ID,
  status: "pending",
  request_reason: "Outstation — partner schedules the customer",
  requested_by: null,
  requested_at: "2026-08-19T02:00:00Z",
  decided_by: null,
  decided_at: null,
  decision_reason: null,
};
const APPROVED_ROW = {
  ...PENDING_ROW,
  status: "approved",
  decided_at: "2026-08-19T03:00:00Z",
  decision_reason: "COD by online transfer before unloading",
};

/** Mocks the RPC surface and the one read this router makes. */
function mockSb(opts: {
  rpcRow?: unknown;
  rpcErr?: { code: string; message: string } | null;
  listRows?: unknown[];
} = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: opts.rpcRow ?? PENDING_ROW,
    error: opts.rpcErr ?? null,
  });
  const order = vi
    .fn()
    .mockResolvedValue({ data: opts.listRows ?? [PENDING_ROW], error: null });
  const from = vi.fn().mockReturnValue({
    select: () => ({ eq: () => ({ order }) }),
  });
  vi.mocked(userClient).mockReturnValue({ rpc, from } as never);
  return { rpc, from };
}

async function call(
  path: string,
  role: string,
  init: { method?: string; body?: unknown } = {},
) {
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request(`http://t/api/operation/payment-approvals${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    }),
    env,
  );
}

describe("GET /:orderId — any internal reader", () => {
  it("returns the order's rows, newest first, as the table serves them", async () => {
    mockSb({ listRows: [APPROVED_ROW, PENDING_ROW] });
    const res = await call(`/${ORDER_ID}`, "operation");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ status: string }>;
    expect(rows.map((r) => r.status)).toEqual(["approved", "pending"]);
  });
});

/**
 * ⛔ THE WRITE DOORS ARE SHUT (owner ruling 2026-09-12; migration 0486).
 * Money in full before delivery is absolute: nothing raises or decides an
 * unpaid-delivery approval any more. The route answers 410 Gone and never
 * reaches the database — the negative control that would fail if the door
 * were quietly reopened.
 */
describe("POST /:orderId and /:id/decide — RETIRED, 410 Gone, no RPC", () => {
  it.each(["operation", "principal", "salesperson"])("raising a request is gone for %s", async (role) => {
    const { rpc } = mockSb();
    const res = await call(`/${ORDER_ID}`, role, {
      method: "POST",
      body: { reason: "Outstation — partner schedules the customer" },
    });
    expect(res.status).toBe(410);
    const body = await res.json() as { code: string; path: string; message: string };
    expect(body.code).toBe("no_unpaid_delivery_approval");
    expect(body.path).toBe("/finance/monitor");
    expect(body.message).toContain("Money must be in full before delivery");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("deciding is gone even for the principal, and the system attempts no DO issue", async () => {
    const { rpc } = mockSb({ rpcRow: APPROVED_ROW });
    const res = await call(`/${REQ_ID}/decide`, "principal", {
      method: "POST",
      body: { decision: "approved", reason: "COD before unloading" },
    });
    expect(res.status).toBe(410);
    expect(rpc).not.toHaveBeenCalled();
    expect(vi.mocked(adminClient)).not.toHaveBeenCalled();
  });

  it("history stays readable — an approval granted before the door closed is still served", async () => {
    mockSb({ listRows: [APPROVED_ROW] });
    const res = await call(`/${ORDER_ID}`, "operation");
    expect(res.status).toBe(200);
    expect(((await res.json()) as Array<{ status: string }>)[0]?.status).toBe("approved");
  });
});
