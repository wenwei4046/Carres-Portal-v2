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

const APPROVAL_ID = "00000000-0000-0000-0000-000000a99001";
const ORDER_ID    = "00000000-0000-0000-0000-000000a99002";
const PO_ID       = "PO-2046";

describe("GET /api/finance/payments/register", () => {
  function ledger(error: unknown = null) {
    const rows = [{ id: "p1", receipt_no: "RC-060926-0001", amount: 200,
      voided_at: "2026-09-06", orders: { id: ORDER_ID, so: 100, customer_name: "Customer" } }];
    const chain = { select: vi.fn(), order: vi.fn(), range: vi.fn() };
    chain.select.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.range.mockResolvedValue({ data: error ? null : rows, error, count: 1 });
    const sb = { from: vi.fn().mockReturnValue(chain) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    return { sb, chain, rows };
  }
  async function request(role: string, query = "") {
    return app.fetch(new Request(`http://t/api/finance/payments/register${query}`, {
      headers: { Authorization: `Bearer ${await makeJwt(role)}` },
    }), env);
  }
  it.each(["operation", "finance", "principal"])("reads canonical receipts for %s, including void history", async (role) => {
    const { sb, rows } = ledger();
    const res = await request(role);
    expect(res.status).toBe(200);
    expect(sb.from).toHaveBeenCalledWith("order_payments");
    expect(await res.json()).toEqual({ rows, total: 1 });
  });
  it.each(["dealer", "supplier", "partner", "warehouse"])("refuses %s before reading money", async (role) => {
    const res = await request(role);
    expect(res.status).toBe(403);
    expect(userClient).not.toHaveBeenCalled();
  });
  it("does not turn a failed source read into an empty register", async () => {
    ledger({ message: "source unavailable", code: "08006" });
    const res = await request("finance");
    expect(res.status).toBe(500);
  });
  it("resolves the recorder name from staff truth", async () => {
    const { sb, chain, rows } = ledger();
    Object.assign(rows[0], { recorded_by: "staff-1" });
    sb.from.mockImplementation((table) => table === "app_users" ? {
      select: () => ({ in: async () => ({ data: [{ id: "staff-1", name: "Staff One" }], error: null }) }),
    } : chain);
    const res = await request("finance");
    expect(res.status).toBe(200);
    expect((await res.json() as { rows: Array<{ recorded_by_name: string }> }).rows[0].recorded_by_name).toBe("Staff One");
  });
  it("pages deterministically and refuses invalid offsets", async () => {
    const { chain } = ledger();
    expect((await request("finance", "?offset=200&limit=100")).status).toBe(200);
    expect(chain.range).toHaveBeenCalledWith(200, 299);
    expect(chain.order).toHaveBeenCalledWith("id", { ascending: false });
    expect((await request("finance", "?offset=-1")).status).toBe(422);
    expect((await request("finance", "?limit=1001")).status).toBe(422);
  });
});

describe("GET /api/finance/payments", () => {
  it("returns payments list with default order by paid_at desc", async () => {
    const orderFn = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({
        data: [
          { id: "p1", direction: "in", amount: 5000, paid_at: "2026-05-08" },
          { id: "p2", direction: "out", amount: 1200, paid_at: "2026-05-07" },
        ],
        error: null,
      }),
    });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ order: orderFn }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.from).toHaveBeenCalledWith("payments");
    expect(orderFn).toHaveBeenCalledWith("paid_at", { ascending: false });
    expect(((await res.json()) as unknown[]).length).toBe(2);
  });

  it("filters by orderId via eq when provided", async () => {
    const eqFn = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const orderChain = { eq: eqFn };
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue(orderChain),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/payments?orderId=${ORDER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(eqFn).toHaveBeenCalledWith("order_id", ORDER_ID);
  });

  it("admits principal role (per requireFinance guard)", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rejects bad query (non-uuid orderId) with 422", async () => {
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments?orderId=NOT-UUID", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("POST /api/finance/payments/topup-approve", () => {
  it("calls finance_topup_approve RPC with mapped args", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { id: "p1", direction: "in", amount: 5000 },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/topup-approve", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalId:  APPROVAL_ID,
          method:      "bank_transfer",
          reference:   "FPX 8821",
          receiptUrl:  "topups/aa.jpg",
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_topup_approve", {
      p_approval_id: APPROVAL_ID,
      p_method:      "bank_transfer",
      p_reference:   "FPX 8821",
      p_receipt_url: "topups/aa.jpg",
    });
  });

  it("nulls reference + receipt_url when omitted", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: { id: "p1" }, error: null }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/topup-approve", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: APPROVAL_ID, method: "cash" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_topup_approve", {
      p_approval_id: APPROVAL_ID,
      p_method:      "cash",
      p_reference:   null,
      p_receipt_url: null,
    });
  });

  it("maps SQLSTATE 22023 (already decided) to 422", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: "approval already decided" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/topup-approve", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: APPROVAL_ID, method: "bank_transfer" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects invalid method enum with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/topup-approve", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: APPROVAL_ID, method: "bitcoin" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("rejects dealer with 403", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/topup-approve", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: APPROVAL_ID, method: "cash" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/finance/payments/order-receipt", () => {
  it("calls finance_record_receipt RPC with mapped args", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { id: "p99", direction: "in", amount: 1500 },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/order-receipt", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId:   ORDER_ID,
          amount:    1500,
          method:    "duitnow_qr",
          reference: "FPX 1248",
          idempotencyKey: "00000000-0000-4000-8000-000000000051",
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_record_receipt", {
      p_order_id:  ORDER_ID,
      p_amount:    1500,
      p_method:    "duitnow_qr",
      p_reference: "FPX 1248",
      p_idempotency_key: "00000000-0000-4000-8000-000000000051",
    });
  });

  it("rejects negative amount with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/order-receipt", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER_ID, amount: -100, method: "cash" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("rejects operation role with 403", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/order-receipt", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER_ID, amount: 100, method: "cash" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/finance/payments/po-pay", () => {
  it("calls finance_po_pay RPC with mapped args", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { id: "p77", direction: "out", amount: 12500, po_id: PO_ID },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/po-pay", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          poId:      PO_ID,
          amount:    12500,
          method:    "bank_transfer",
          reference: "MAYBANK-998812",
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_po_pay", {
      p_po_id:     PO_ID,
      p_amount:    12500,
      p_method:    "bank_transfer",
      p_reference: "MAYBANK-998812",
    });
  });

  it("nulls reference when omitted", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { id: "p78", direction: "out", amount: 5000 },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/po-pay", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ poId: PO_ID, amount: 5000, method: "cheque" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_po_pay", {
      p_po_id:     PO_ID,
      p_amount:    5000,
      p_method:    "cheque",
      p_reference: null,
    });
  });

  it("maps SQLSTATE 22023 (po already paid) to 422", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: "po already paid" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/po-pay", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ poId: PO_ID, amount: 5000, method: "bank_transfer" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects negative amount with 422 (zod gate)", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/po-pay", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ poId: PO_ID, amount: -1, method: "cash" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("rejects dealer with 403", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/po-pay", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ poId: PO_ID, amount: 5000, method: "cash" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/finance/payments/po-schedule", () => {
  it("calls finance_po_schedule RPC with mapped args", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { id: PO_ID, pay_status: "scheduled" },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/po-schedule", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ poId: PO_ID, scheduledFor: "2026-05-15" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_po_schedule", {
      p_po_id:         PO_ID,
      p_scheduled_for: "2026-05-15",
    });
  });

  it("nulls scheduledFor when omitted", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { id: PO_ID, pay_status: "scheduled" },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/po-schedule", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ poId: PO_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_po_schedule", {
      p_po_id:         PO_ID,
      p_scheduled_for: null,
    });
  });

  it("maps SQLSTATE 22023 (already scheduled / paid) to 422", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: "cannot schedule (current pay_status: scheduled)" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/po-schedule", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ poId: PO_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects operation role with 403", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/finance/payments/po-schedule", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ poId: PO_ID }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});
