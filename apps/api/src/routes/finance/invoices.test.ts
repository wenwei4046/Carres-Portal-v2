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

describe("POST /api/finance/invoices/issue", () => {
  function mockOrderLookup(status: string) {
    return {
      single: vi.fn().mockResolvedValue({
        data: { status, paid: 5970 },
        error: null,
      }),
    };
  }

  it("issues invoice when order is delivered", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue(mockOrderLookup("delivered")),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({
        data: { id: "i1", invoice_no: "INV-2026-1240", amount: 5970, tax_amount: 442 },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/invoices/issue", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER_ID, amount: 5970, taxAmount: 442 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("invoice_issue", {
      p_order_id:   ORDER_ID,
      p_amount:     5970,
      p_tax_amount: 442,
    });
  });

  it("rejects when order is not delivered (422 order_not_delivered)", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue(mockOrderLookup("place")),
        }),
      }),
      rpc: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/invoices/issue", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER_ID, amount: 5970 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("order_not_delivered");
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("returns 404 when order not found", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116", message: "not found" } }),
          }),
        }),
      }),
      rpc: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/invoices/issue", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER_ID, amount: 5970 }),
      }),
      env,
    );
    expect(res.status).toBe(404);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("rejects negative amount with 422", async () => {
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/invoices/issue", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER_ID, amount: -100 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/finance/invoices/issue", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER_ID, amount: 5970 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/finance/invoices/:id/void", () => {
  it("voids an issued invoice and audit-logs", async () => {
    const auditInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const sb = {
      from: vi.fn().mockImplementation((tbl: string) => {
        if (tbl === "invoices") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { id: INVOICE_ID, invoice_no: "INV-2026-1240", voided_at: "2026-05-08" },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return { insert: auditInsert };
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/invoices/${INVOICE_ID}/void`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "customer disputed line items" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(auditInsert).toHaveBeenCalled();
  });

  it("rejects non-uuid invoice id with 422", async () => {
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/invoices/INV-001/void", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "x" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects empty reason with 422 (zod min 1)", async () => {
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/invoices/${INVOICE_ID}/void`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 not_voidable when invoice already voided (PGRST116)", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: "PGRST116", message: "no rows" },
                }),
              }),
            }),
          }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/invoices/${INVOICE_ID}/void`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "double issued" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("not_voidable");
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/finance/invoices/${INVOICE_ID}/void`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "x" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
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
