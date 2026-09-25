import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
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

async function makeJwt(role: string) {
  return signTestJwt("11111111-1111-1111-1111-000000000001", { email: `${role}@x`, app_metadata: { role } });
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

const ORDER_ID   = "00000000-0000-0000-0000-000000aa1001";
const INVOICE_ID = "00000000-0000-0000-0000-000000aa1002";

describe("GET /api/finance/invoices", () => {
  it("returns invoices ordered by issued_at desc", async () => {
    const orderFn = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({
        data: [
          { id: "i1", invoice_no: "INV-2026-1240", amount: 5970 },
          { id: "i2", invoice_no: "INV-2026-1239", amount: 3290 },
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
      new Request("http://t/api/finance/invoices", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(orderFn).toHaveBeenCalledWith("issued_at", { ascending: false });
    expect(((await res.json()) as unknown[]).length).toBe(2);
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/finance/invoices", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /:id/collection-outcome (§3, 0446)", () => {
  it("passes the result to the ONE SQL door, invoice scoped to its order", async () => {
    const rpc = vi.fn(async () => ({ data: { id: "out-1" }, error: null }));
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: async () => ({ data: { id: INVOICE_ID, order_id: ORDER_ID }, error: null }) })),
        })),
      })),
      rpc,
    };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.fetch(new Request(
      `http://t/api/finance/invoices/${INVOICE_ID}/collection-outcome`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("operation")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: "will_pay_on_date", promisedDate: "2026-09-20", note: "salary" }),
      }), env);
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("payment_record_collection_outcome", {
      p_order_id: ORDER_ID,
      p_outcome: "will_pay_on_date",
      p_promised_date: "2026-09-20",
      p_note: "salary",
      p_invoice_id: INVOICE_ID,
    });
  });
  it("422 refuses an outcome word that is not one of the five, before any database call", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await app.fetch(new Request(
      `http://t/api/finance/invoices/${INVOICE_ID}/collection-outcome`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("operation")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: "customer_shouted" }),
      }), env);
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});

/*
 * 0476 — one invoice door per act. The Phase-5 issue and void doors answer
 * 410 and name the governed door; they never reach the database.
 */
describe("the closed Phase-5 invoice doors (0476)", () => {
  async function post(path: string, body: unknown) {
    const sb = { from: vi.fn(), rpc: vi.fn() };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.fetch(new Request(`http://t/api/finance/invoices/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt("finance")}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), env);
    return { res, sb };
  }

  it("POST /issue is gone and names Generate invoice and the governed issue door", async () => {
    const { res, sb } = await post("issue", { orderId: ORDER_ID, amount: 5970, taxAmount: 442 });
    expect(res.status).toBe(410);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("door_closed");
    expect(body.message).toContain("Generate invoice");
    expect(body.message).toContain("/api/orders/:id/issue-invoice");
    expect(body.message).toContain("/api/finance/invoices/:id/issue");
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("POST /:id/void is gone and names void and replace", async () => {
    const { res, sb } = await post(`${INVOICE_ID}/void`, { reason: "customer disputed line items" });
    expect(res.status).toBe(410);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("door_closed");
    expect(body.message).toContain("/api/finance/invoices/:id/void-replace");
    expect(sb.from).not.toHaveBeenCalled();
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("the governed void-replace door is still open beside it", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { voided: { id: INVOICE_ID } }, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await app.fetch(new Request(`http://t/api/finance/invoices/${INVOICE_ID}/void-replace`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt("principal")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "wrong amount" }),
    }), env);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("payment_invoice_void_replace", {
      p_invoice_id: INVOICE_ID, p_reason: "wrong amount",
    });
  });
});

describe("GET /api/finance/invoices/:id/pdf (Chunk C)", () => {
  // Mocks the invoice / order / lines / sku selects, plus the 0262 guarantee
  // reads (entitlements on the order + the terms labels for their names).
  type Row = Record<string, unknown>;
  function mockChain(
    invoice: Row | null,
    order: Row | null,
    lines: Row[] | null = [],
    skuRows: Row[] | null = [],
    guaranteeRows: Row[] | null = [],
    guaranteeTerms: Row[] | null = [],
  ) {
    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "invoices") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: invoice, error: null }),
              }),
            }),
          };
        }
        if (table === "orders") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: order, error: null }),
              }),
            }),
          };
        }
        if (table === "order_lines") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: lines, error: null }),
            }),
          };
        }
        if (table === "product_skus") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: skuRows, error: null }),
            }),
          };
        }
        // 0262 — .select().eq().neq().order()
        if (table === "guarantee_entitlements") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: guaranteeRows, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "guarantee_terms") {
          return {
            select: vi.fn().mockResolvedValue({ data: guaranteeTerms, error: null }),
          };
        }
        if (table === "order_payments") {
          // A deposit before the invoice, the balance after it.
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [
                { amount: 2000, kind: "deposit", voided_at: null, created_at: "2026-04-01T00:00:00Z" },
                { amount: 3970, kind: "payment", voided_at: null, created_at: "2026-05-02T00:00:00Z" },
              ], error: null }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
  }

  it("returns JSON template data when invoice + order + lines all valid", async () => {
    const sb = mockChain(
      { id: INVOICE_ID, invoice_no: "INV-2026-1240", order_id: ORDER_ID, amount: 5970, tax_amount: 442, issued_at: "2026-04-30", voided_at: null },
      { id: ORDER_ID, so: 1240, status: "delivered", customer_name: "Tan", customer_phone: null, customer_address: "10 Lorong KL", dealer_id: "d1", paid: 5970, dealers: { name: "KL Showroom", contact: "Aisha" } },
      [{ sku: "SKU-A", qty: 1, unit_price: 5970 }],
      [{ sku: "SKU-A", variant: "Mattress · Queen" }],
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/invoices/${INVOICE_ID}/pdf-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.invoice_no).toBe("INV-2026-1240");
    expect(body.order_code).toBe("SO-1240");
    expect(body.total).toBe(5970);
    expect(body.received_before).toBe(2000);
    expect(body.lines).toHaveLength(1);
    // No guarantee sold on this order → the block is empty, not absent-and-broken.
    expect(body.guarantees).toEqual([]);
  });

  it("prints the guarantee block, naming the covered item and the end date", async () => {
    // The customer's only written proof of a 15-year promise — if this stops
    // rendering, the invoice silently drops a liability we've been paid for.
    const sb = mockChain(
      { id: INVOICE_ID, invoice_no: "INV-2026-1241", order_id: ORDER_ID, amount: 6120, tax_amount: 453, issued_at: "2026-08-01", voided_at: null },
      { id: ORDER_ID, so: 1241, status: "delivered", customer_name: "Tan", customer_phone: null, customer_address: "10 Lorong KL", dealer_id: "d1", paid: 6120, dealers: { name: "KL Showroom", contact: "Aisha" } },
      [{ sku: "SKU-A", qty: 1, unit_price: 5970 }, { sku: "GRT-MATTRESS-15Y", qty: 1, unit_price: 150 }],
      [{ sku: "SKU-A", variant: "Mattress · Queen" }],
      [
        {
          guarantee_sku: "GRT-MATTRESS-15Y",
          covers_sku: "SKU-A",
          covers_label: "B1201S King",
          coverage_years: 15,
          remedy: "replace",
          starts_on: "2026-08-01",
          expires_on: "2041-08-01",
          status: "active",
        },
      ],
      [{ guarantee_sku: "GRT-MATTRESS-15Y", label: "Mattress Guarantee 15 Years", terms_text: "One-for-one." }],
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/invoices/${INVOICE_ID}/pdf-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.guarantees).toHaveLength(1);
    expect(body.guarantees[0]).toMatchObject({
      label: "Mattress Guarantee 15 Years",
      covers: "B1201S King",
      coverage_years: 15,
      remedy: "replace",
      expires_on: "2041-08-01",
      terms_text: "One-for-one.",
    });
  });

  it("returns 404 when invoice not found", async () => {
    const sb = mockChain(null, null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/invoices/${INVOICE_ID}/pdf-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 when order not delivered", async () => {
    const sb = mockChain(
      { id: INVOICE_ID, invoice_no: "INV-2026-1240", order_id: ORDER_ID, amount: 5970, tax_amount: 442, issued_at: "2026-04-30", voided_at: null },
      { id: ORDER_ID, so: 1240, status: "operation", customer_name: "Tan", customer_phone: null, customer_address: "addr", dealer_id: "d1", paid: 5970, dealers: null },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/invoices/${INVOICE_ID}/pdf-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("order_not_delivered");
  });

  it("returns 422 when paid < amount", async () => {
    const sb = mockChain(
      { id: INVOICE_ID, invoice_no: "INV-2026-1240", order_id: ORDER_ID, amount: 5970, tax_amount: 442, issued_at: "2026-04-30", voided_at: null },
      { id: ORDER_ID, so: 1240, status: "delivered", customer_name: "Tan", customer_phone: null, customer_address: "addr", dealer_id: "d1", paid: 1000, dealers: null },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/invoices/${INVOICE_ID}/pdf-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("not_fully_paid");
  });

  it("returns 422 when invoice voided", async () => {
    const sb = mockChain(
      { id: INVOICE_ID, invoice_no: "INV-2026-1240", order_id: ORDER_ID, amount: 5970, tax_amount: 442, issued_at: "2026-04-30", voided_at: "2026-05-01" },
      null,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/invoices/${INVOICE_ID}/pdf-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("invoice_voided");
  });

  it("rejects invalid uuid with 422", async () => {
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/invoices/not-a-uuid/pdf-data", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/finance/invoices/${INVOICE_ID}/pdf-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
