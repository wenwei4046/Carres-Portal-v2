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
});

afterAll(() => _setJwksForTesting(null));

const ORDER_ID  = "00000000-0000-0000-0000-000000bb1001";
const REFUND_ID = "00000000-0000-0000-0000-000000bb1002";
const DEALER_ID = "00000000-0000-0000-0000-000000bb1003";

/**
 * Helper that mocks a chained `.from(...)` such that:
 *   - "orders"    select.eq.single -> { dl, dealer_id, customer_name }
 *   - "refunds"   insert.select.single -> the inserted refund row
 *   - "approvals" insert -> ok
 *   - "audit_log" insert -> ok
 *   - other tables mockable via `extra`
 */
function mockSb(opts: {
  orderRow?: { dl: number; dealer_id: string; customer_name: string } | null;
  orderErr?: { code: string; message: string } | null;
  refundInsertRow?: { id: string; status: string; amount: number };
  refundInsertErr?: { code: string; message: string } | null;
  approvalErr?: { code: string; message: string } | null;
}) {
  const ordersChain = {
    single: vi.fn().mockResolvedValue({
      data: opts.orderRow ?? null,
      error: opts.orderErr ?? null,
    }),
  };
  const refundsInsertChain = {
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: opts.refundInsertRow ?? null,
        error: opts.refundInsertErr ?? null,
      }),
    }),
  };
  const approvalsInsert  = vi.fn().mockResolvedValue({ data: null, error: opts.approvalErr ?? null });
  const auditInsert      = vi.fn().mockResolvedValue({ data: null, error: null });
  const refundsList      = vi.fn().mockResolvedValue({ data: [], error: null });

  const sb = {
    from: vi.fn().mockImplementation((tbl: string) => {
      if (tbl === "orders") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(ordersChain),
          }),
        };
      }
      if (tbl === "refunds") {
        return {
          insert: vi.fn().mockReturnValue(refundsInsertChain),
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: refundsList,
              eq: vi.fn().mockReturnValue({ limit: refundsList }),
            }),
          }),
        };
      }
      if (tbl === "approvals") {
        return { insert: approvalsInsert };
      }
      return { insert: auditInsert };
    }),
    // Default RPC mock returns a CN string for next_credit_note_no — kind=credit
    // path needs this to set credit_note_no on the inserted row (Chunk C).
    rpc: vi.fn().mockResolvedValue({ data: "CN-0001", error: null }),
  };
  return { sb, approvalsInsert, auditInsert };
}

describe("GET /api/finance/refunds", () => {
  it("returns refunds list", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: "r1" }, { id: "r2" }], error: null });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ limit }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/refunds", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as unknown[]).length).toBe(2);
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/finance/refunds", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/finance/refunds/create", () => {
  it("kind=refund amount<=1000 -> direct approved (no approval row)", async () => {
    const { sb, approvalsInsert } = mockSb({
      orderRow:        { dl: 1240, dealer_id: DEALER_ID, customer_name: "Tan" },
      refundInsertRow: { id: REFUND_ID, status: "approved", amount: 500 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/refunds/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER_ID, amount: 500, reason: "frame defect", kind: "refund" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { needsApproval: boolean };
    expect(body.needsApproval).toBe(false);
    expect(approvalsInsert).not.toHaveBeenCalled();
  });

  it("kind=refund amount>1000 -> pending + creates approval row", async () => {
    const { sb, approvalsInsert } = mockSb({
      orderRow:        { dl: 1242, dealer_id: DEALER_ID, customer_name: "Lee" },
      refundInsertRow: { id: REFUND_ID, status: "pending", amount: 2100 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/refunds/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER_ID, amount: 2100, reason: "wrong size", kind: "refund" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { needsApproval: boolean };
    expect(body.needsApproval).toBe(true);
    expect(approvalsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind:      "refund",
        refers_to: "DL-1242",
        amount:    2100,
        status:    "pending",
      }),
    );
  });

  it("kind=credit -> direct approved (regardless of amount)", async () => {
    const { sb, approvalsInsert } = mockSb({
      orderRow:        { dl: 1238, dealer_id: DEALER_ID, customer_name: "Ng" },
      refundInsertRow: { id: REFUND_ID, status: "approved", amount: 3290 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/refunds/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER_ID, amount: 3290, reason: "goodwill", kind: "credit" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(approvalsInsert).not.toHaveBeenCalled();
  });

  it("returns 404 when order not found", async () => {
    const { sb } = mockSb({
      orderRow: null,
      orderErr: { code: "PGRST116", message: "not found" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/refunds/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER_ID, amount: 500, reason: "x", kind: "refund" }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("rejects bad kind enum with 422", async () => {
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/refunds/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER_ID, amount: 500, reason: "x", kind: "voucher" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/finance/refunds/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER_ID, amount: 500, reason: "x", kind: "refund" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/finance/refunds/:id/pay", () => {
  it("calls refund_pay RPC with mapped args", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { id: REFUND_ID, status: "paid", paid_at: "2026-05-08T00:00:00Z" },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/refunds/${REFUND_ID}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ method: "bank_transfer", reference: "TT 8821" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("refund_pay", {
      p_refund_id: REFUND_ID,
      p_method:    "bank_transfer",
      p_reference: "TT 8821",
    });
  });

  it("rejects non-uuid id with 422", async () => {
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/refunds/RF-001/pay", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ method: "cash" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps SQLSTATE 22023 (not approved) to 422", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: "refund must be approved before pay (status pending)" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/refunds/${REFUND_ID}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ method: "cash" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/finance/refunds/${REFUND_ID}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ method: "cash" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/finance/refunds/:id/apply (Chunk C)", () => {
  const TARGET_ORDER_ID = "00000000-0000-0000-0000-000000bb2001";

  it("calls finance_apply_credit_note RPC with mapped args", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { id: REFUND_ID, status: "paid", credit_note_no: "CN-0042", applied_to_order_id: TARGET_ORDER_ID },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/refunds/${REFUND_ID}/apply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetOrderId: TARGET_ORDER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_apply_credit_note", {
      p_refund_id:       REFUND_ID,
      p_target_order_id: TARGET_ORDER_ID,
    });
  });

  it("maps SQLSTATE 22023 (not a credit note / wrong status) to 422", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: "not a credit note (use refund_pay for refunds)" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/refunds/${REFUND_ID}/apply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetOrderId: TARGET_ORDER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects invalid uuid id with 422", async () => {
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/refunds/not-a-uuid/apply", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetOrderId: TARGET_ORDER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects bad targetOrderId with 422", async () => {
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/refunds/${REFUND_ID}/apply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetOrderId: "not-a-uuid" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/finance/refunds/${REFUND_ID}/apply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetOrderId: TARGET_ORDER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
