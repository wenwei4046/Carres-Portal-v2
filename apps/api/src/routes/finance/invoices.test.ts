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
