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

const ORDER_ID = "00000000-0000-0000-0000-000000b99001";
const INVOICE_ID = "00000000-0000-0000-0000-000000b99002";

describe("GET /api/finance/invoices/register", () => {
  function invoices(error: unknown = null) {
    const rows = [{
      id: INVOICE_ID, invoice_no: null, status: "draft", kind: "sales",
      amount: 1000, tax_amount: 0, issued_at: null, voided_at: null,
      orders: { id: ORDER_ID, so: 1300, customer_name: "Customer" },
    }];
    const chain = { select: vi.fn(), order: vi.fn(), range: vi.fn() };
    chain.select.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.range.mockResolvedValue({ data: error ? null : rows, error, count: 1 });
    const sb = { from: vi.fn().mockReturnValue(chain) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    return { sb, chain, rows };
  }
  async function request(role: string, query = "") {
    return app.fetch(new Request(`http://t/api/finance/invoices/register${query}`, {
      headers: { Authorization: `Bearer ${await makeJwt(role)}` },
    }), env);
  }
  it.each(["operation", "finance", "principal"])("reads invoice source facts for %s", async (role) => {
    const { sb, rows } = invoices();
    const res = await request(role);
    expect(res.status).toBe(200);
    expect(sb.from).toHaveBeenCalledWith("invoices");
    expect(await res.json()).toEqual({ rows, total: 1 });
  });
  it.each(["dealer", "supplier", "partner", "warehouse"])("refuses %s before reading", async (role) => {
    const res = await request(role);
    expect(res.status).toBe(403);
    expect(userClient).not.toHaveBeenCalled();
  });
  it("does not turn a failed source read into an empty register", async () => {
    invoices({ message: "source unavailable", code: "08006" });
    expect((await request("finance")).status).toBe(500);
  });
  it("pages deterministically and refuses invalid offsets", async () => {
    const { chain } = invoices();
    expect((await request("finance", "?offset=200&limit=100")).status).toBe(200);
    expect(chain.range).toHaveBeenCalledWith(200, 299);
    expect((await request("finance", "?offset=-1")).status).toBe(422);
  });
});

describe("POST /api/finance/invoices/prepare", () => {
  function withOrder(order: unknown, rpcResult: unknown = { invoice: { id: INVOICE_ID } }) {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: order, error: null }),
          }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: rpcResult, error: null }),
    };
    vi.mocked(userClient).mockReturnValue(sb as never);
    return sb;
  }
  async function request(role: string, body: unknown) {
    return app.fetch(new Request("http://t/api/finance/invoices/prepare", {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt(role)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), env);
  }
  it("prepares with the one orderMoney total, never the outstanding", async () => {
    const sb = withOrder({
      id: ORDER_ID, paid: 400,
      order_lines: [{ qty: 2, unit_price: 500 }],
      order_addons: [{ qty: 1, unit_price: 100 }],
      ops_order_control: [{ balance: null }],
    });
    const res = await request("operation", { orderId: ORDER_ID });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("payment_invoice_prepare", {
      p_order_id: ORDER_ID, p_amount: 1100, p_tax_amount: 0,
    });
  });
  it("refuses an order whose value nobody has entered", async () => {
    const sb = withOrder({
      id: ORDER_ID, paid: 0, order_lines: [], order_addons: [],
      ops_order_control: [{ balance: null }],
    });
    const res = await request("finance", { orderId: ORDER_ID });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("keyed-balance orders invoice paid + owing (the keyed total)", async () => {
    const sb = withOrder({
      id: ORDER_ID, paid: 300, order_lines: [], order_addons: [],
      ops_order_control: [{ balance: 700 }],
    });
    const res = await request("finance", { orderId: ORDER_ID });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("payment_invoice_prepare", {
      p_order_id: ORDER_ID, p_amount: 1000, p_tax_amount: 0,
    });
  });
  it("refuses a dealer", async () => {
    expect((await request("dealer", { orderId: ORDER_ID })).status).toBe(403);
  });
});

describe("POST /api/finance/invoices/:id/issue", () => {
  it("captures the snapshot and calls the SQL issue door", async () => {
    const tables: Record<string, unknown> = {
      invoices: { id: INVOICE_ID, order_id: ORDER_ID, amount: 1100, tax_amount: 0, kind: "sales", status: "draft" },
      orders: {
        id: ORDER_ID, so: 1300, customer_name: "LIM KUAN YANG",
        customer_phone: "0123", customer_address: "1 Jalan",
        order_lines: [{ sku: "MS01-K", qty: 2, unit_price: 500 }],
      },
    };
    const sb = {
      from: vi.fn().mockImplementation((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: tables[table], error: null }),
          }),
        }),
      })),
      rpc: vi.fn().mockResolvedValue({ data: { invoice: { id: INVOICE_ID, status: "issued" } }, error: null }),
    };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.fetch(new Request(`http://t/api/finance/invoices/${INVOICE_ID}/issue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt("operation")}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }), env);
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("payment_invoice_issue", {
      p_invoice_id: INVOICE_ID,
      p_snapshot: expect.objectContaining({
        so: "SO-1300", amount: 1100,
        customer: expect.objectContaining({ name: "LIM KUAN YANG" }),
        lines: [{ sku: "MS01-K", qty: 2, unit_price: 500 }],
      }),
    });
  });
});

describe("POST /api/finance/invoices/:id/record-message", () => {
  function withInvoice() {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: INVOICE_ID, order_id: ORDER_ID }, error: null }),
          }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: { id: "c1" }, error: null }),
    };
    vi.mocked(userClient).mockReturnValue(sb as never);
    return sb;
  }
  async function request(role: string, body: unknown) {
    return app.fetch(new Request(`http://t/api/finance/invoices/${INVOICE_ID}/record-message`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt(role)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), env);
  }
  it("records the sent message with its proof through the one door", async () => {
    const sb = withInvoice();
    const res = await request("operation", {
      kind: "reminder", messageText: "Hi…", templateKey: "customer_reminder",
      screenshotUrl: "orders-attachments/orders/o/comm/1.png",
    });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("payment_record_message_sent", {
      p_order_id: ORDER_ID, p_invoice_id: INVOICE_ID, p_kind: "reminder",
      p_message_text: "Hi…", p_template_key: "customer_reminder",
      p_screenshot_url: "orders-attachments/orders/o/comm/1.png",
    });
  });
  it("refuses a record without the sent screenshot before SQL", async () => {
    const sb = withInvoice();
    const res = await request("operation", { kind: "reminder", messageText: "Hi…", screenshotUrl: "" });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("refuses a dealer", async () => {
    expect((await request("dealer", { kind: "reminder", messageText: "Hi…", screenshotUrl: "x" })).status).toBe(403);
  });
});

describe("POST /api/finance/invoices/:id/void-replace", () => {
  async function request(role: string, body: unknown) {
    return app.fetch(new Request(`http://t/api/finance/invoices/${INVOICE_ID}/void-replace`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt(role)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), env);
  }
  it("passes the reason to the duty-gated SQL door", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { voided: {}, replacement: {} }, error: null }) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await request("finance", { reason: "Wrong amount on the paper" });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("payment_invoice_void_replace", {
      p_invoice_id: INVOICE_ID, p_reason: "Wrong amount on the paper",
    });
  });
  it("refuses a blank reason before SQL", async () => {
    const sb = { rpc: vi.fn() };
    vi.mocked(userClient).mockReturnValue(sb as never);
    expect((await request("finance", { reason: "  " })).status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("maps the SQL duty refusal to 403", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } }) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    expect((await request("operation", { reason: "Wrong amount" })).status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/invoices/statement/:orderId — §11's one read-only statement
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/finance/invoices/statement/:orderId", () => {
  const OTHER_ORDER = "00000000-0000-0000-0000-000000b99009";

  function statementSource(over: {
    anchor?: Record<string, unknown> | null;
    siblings?: Array<{ id: string }>;
    invoices?: unknown[];
    allocations?: unknown[];
  } = {}) {
    const anchor = over.anchor === undefined
      ? { id: ORDER_ID, so: 1300, customer_name: "LIM KUAN YANG", customer_phone: "012-345 6789" }
      : over.anchor;
    const calls: string[] = [];
    const sb = {
      from: vi.fn((table: string) => {
        calls.push(table);
        if (table === "orders") {
          // The FIRST orders read is the anchor (maybeSingle); the second is
          // the sibling sweep (awaited directly).
          const first = calls.filter((t) => t === "orders").length === 1;
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.eq = vi.fn().mockReturnValue(
            first ? chain
              : Promise.resolve({ data: over.siblings ?? [{ id: ORDER_ID }, { id: OTHER_ORDER }], error: null }),
          );
          chain.maybeSingle = vi.fn().mockResolvedValue({ data: anchor, error: null });
          return chain;
        }
        if (table === "invoices") {
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.in = vi.fn().mockReturnValue(chain);
          chain.order = vi.fn().mockResolvedValue({ data: over.invoices ?? [], error: null });
          return chain;
        }
        if (table === "payment_allocations") {
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.in = vi.fn().mockReturnValue(chain);
          chain.order = vi.fn().mockResolvedValue({ data: over.allocations ?? [], error: null });
          return chain;
        }
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      }),
    };
    vi.mocked(userClient).mockReturnValue(sb as never);
    return sb;
  }

  async function request(role: string, id = ORDER_ID) {
    return app.fetch(new Request(`http://t/api/finance/invoices/statement/${id}`, {
      headers: { Authorization: `Bearer ${await makeJwt(role)}` },
    }), env);
  }

  function invoiceRow(orderId: string, so: number, over: Record<string, unknown> = {}) {
    return {
      id: `inv-${so}`, invoice_no: `INV-${so}`, status: "issued", kind: "sales",
      amount: 1000, tax_amount: 0, issued_at: "2026-09-01", voided_at: null,
      void_reason: null, replaces_invoice_id: null, created_at: "2026-09-01T00:00:00Z",
      order_id: orderId,
      orders: {
        id: orderId, so, customer_name: "LIM KUAN YANG", status: "proceed_order",
        paid: 400, delivery_date: null, delivery_date_tbd: false, delivered_at: null,
        order_payments: [{ id: `p-${so}`, receipt_no: `RC-${so}`, amount: 400,
          paid_on: "2026-09-02", voided_at: null, reference: "TRF", method: "bank" }],
        order_lines: [{ sku: "SOFA-1", qty: 1, unit_price: 1000 }], order_addons: [],
        ops_order_control: [{ balance: null, confirmed_date: null, line_etas: null,
          line_stock_status: null }],
      },
      ...over,
    };
  }

  it.each(["dealer", "supplier", "partner", "warehouse"])("refuses %s before reading", async (role) => {
    const res = await request(role);
    expect(res.status).toBe(403);
    expect(userClient).not.toHaveBeenCalled();
  });

  it("422 when the order id is not a uuid", async () => {
    expect((await request("finance", "not-a-uuid")).status).toBe(422);
  });

  it("404 when the order is not there", async () => {
    statementSource({ anchor: null });
    expect((await request("finance")).status).toBe(404);
  });

  /** §11's point: the statement is the CUSTOMER's, not the order you came
   *  from. One customer with several SOs is normal here. */
  it("spans every Sales Order with the same phone number", async () => {
    statementSource({
      invoices: [invoiceRow(ORDER_ID, 1300), invoiceRow(OTHER_ORDER, 1301)],
    });
    const res = await request("finance");
    expect(res.status).toBe(200);
    const body = await res.json() as {
      matched_on: string; orders: Array<{ so: number; still_needed: number }>;
    };
    expect(body.matched_on).toBe("phone");
    expect(body.orders.map((o) => o.so).sort()).toEqual([1300, 1301]);
    // Derived through the ONE arithmetic: 1000 priced, 400 paid.
    expect(body.orders.every((o) => o.still_needed === 600)).toBe(true);
  });

  /** "We do not know" and "nothing is owed" are different answers, and only
   *  one of them is safe to show a customer. */
  it("says the amount is not known rather than printing a confident RM 0", async () => {
    const unpriced = invoiceRow(ORDER_ID, 1300);
    unpriced.orders.order_lines = [];
    statementSource({ siblings: [{ id: ORDER_ID }], invoices: [unpriced] });
    const body = await (await request("finance")).json() as {
      orders: Array<{ known: boolean; still_needed: number | null }>;
    };
    expect(body.orders[0].known).toBe(false);
    expect(body.orders[0].still_needed).toBeNull();
  });

  it("falls back to the name when no usable phone number is recorded", async () => {
    statementSource({
      anchor: { id: ORDER_ID, so: 1300, customer_name: "LIM KUAN YANG", customer_phone: null },
      siblings: [{ id: ORDER_ID }],
      invoices: [invoiceRow(ORDER_ID, 1300)],
    });
    const body = await (await request("finance")).json() as { matched_on: string };
    expect(body.matched_on).toBe("name");
  });

  it("carries the voids and the allocations, which is what a statement is for", async () => {
    const voided = invoiceRow(ORDER_ID, 1300, {
      id: "inv-void", status: "voided", voided_at: "2026-09-05", void_reason: "wrong amount",
    });
    statementSource({
      siblings: [{ id: ORDER_ID }],
      invoices: [voided],
      allocations: [{ id: "a1", payment_id: "p-1300", order_id: ORDER_ID, invoice_id: null,
        amount: 400, allocated_at: "2026-09-02T00:00:00Z", voided_at: null }],
    });
    const body = await (await request("finance")).json() as {
      orders: Array<{ invoices: Array<{ voided_at: string | null; void_reason: string | null }> }>;
      allocations: unknown[];
    };
    expect(body.orders[0].invoices[0]).toMatchObject({
      voided_at: "2026-09-05", void_reason: "wrong amount",
    });
    expect(body.allocations).toHaveLength(1);
  });
});

