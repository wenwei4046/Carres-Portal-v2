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

const ORDER_ID = "00000000-0000-0000-0000-00000000020b";
const CASE = {
  id: "00000000-0000-0000-0000-00000000030c",
  order_id: ORDER_ID,
  product_group: "mattress_bedframe",
  storage_start: "2026-09-07",
  rule_free_days: 14,
  rule_charge_amount: 150,
  rule_cycle_days: 30,
  status: "open",
};

function sbWithList(rows: unknown[]) {
  // The cases read is a thenable chain; the unreconciled-legacy read (2026-09-08)
  // adds a control/order `maybeSingle` and an invoices list on the same shape.
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  chain.in = vi.fn(() => chain);
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  return { from: vi.fn(() => chain), rpc: vi.fn() };
}

describe("GET /api/finance/payment-storage", () => {
  it("lists the order's cases for internal staff", async () => {
    vi.mocked(userClient).mockReturnValue(sbWithList([CASE]) as never);
    const res = await app.fetch(new Request(
      `http://t/api/finance/payment-storage?orderId=${ORDER_ID}`,
      { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } }), env);
    expect(res.status).toBe(200);
    const body = await res.json() as { cases: Array<{ product_group: string }> };
    expect(body.cases[0].product_group).toBe("mattress_bedframe");
  });
  it("403 for a partner role", async () => {
    const res = await app.fetch(new Request(
      "http://t/api/finance/payment-storage",
      { headers: { Authorization: `Bearer ${await makeJwt("partner")}` } }), env);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/finance/payment-storage/start", () => {
  it("passes the witnessed facts to the ONE SQL door verbatim", async () => {
    const rpc = vi.fn(async () => ({ data: CASE, error: null }));
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await app.fetch(new Request(
      "http://t/api/finance/payment-storage/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("operation")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: ORDER_ID, productGroup: "mattress_bedframe",
          readinessOn: "2026-09-06", customerDelayOn: "2026-09-07",
          witnessNote: "Customer asked to hold delivery",
        }),
      }), env);
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("payment_storage_start", {
      p_order_id: ORDER_ID,
      p_product_group: "mattress_bedframe",
      p_readiness_on: "2026-09-06",
      p_customer_delay_on: "2026-09-07",
      p_witness_note: "Customer asked to hold delivery",
      p_evidence_url: null,
    });
  });
  it("422 refuses a missing witness note before any database call", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await app.fetch(new Request(
      "http://t/api/finance/payment-storage/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("operation")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: ORDER_ID, productGroup: "sofa",
          readinessOn: "2026-09-06", customerDelayOn: "2026-09-07",
          witnessNote: "  ",
        }),
      }), env);
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/finance/payment-storage/charge", () => {
  it("passes the case to the ONE charge door", async () => {
    const rpc = vi.fn(async () => ({ data: { new_periods: 1, billed_through_period: 1,
      invoice: { invoice_no: "INV-070926-0001", kind: "storage", amount: 150 } }, error: null }));
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await app.fetch(new Request(
      "http://t/api/finance/payment-storage/charge", {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("operation")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: CASE.id }),
      }), env);
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("payment_storage_invoice", { p_case_id: CASE.id });
  });
});

describe("POST /api/finance/payment-storage/extra-free", () => {
  it("requires the written evidence in the request shape itself", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await app.fetch(new Request(
      "http://t/api/finance/payment-storage/extra-free", {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("operation")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: CASE.id, freeUntil: "2026-09-27", reason: "travel", evidenceUrl: "" }),
      }), env);
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("passes a complete decision to the SQL door", async () => {
    const rpc = vi.fn(async () => ({ data: { ...CASE, approved_free_until: "2026-09-27" }, error: null }));
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await app.fetch(new Request(
      "http://t/api/finance/payment-storage/extra-free", {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt("operation")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: CASE.id, freeUntil: "2026-09-27",
          reason: "Customer travelling", evidenceUrl: "evidence/request-form.pdf",
        }),
      }), env);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("payment_storage_extra_free", {
      p_case_id: CASE.id,
      p_free_until: "2026-09-27",
      p_reason: "Customer travelling",
      p_evidence_url: "evidence/request-form.pdf",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §6 (0451) — the customer's written request to delay
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/finance/payment-storage/later-delivery-request", () => {
  function door(result: unknown = { id: "r1" }, error: unknown = null) {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: result, error }) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    return sb;
  }
  async function post(role: string, body: unknown) {
    const jwt = await makeJwt(role);
    return app.fetch(
      new Request("http://t/api/finance/payment-storage/later-delivery-request", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
  }
  const GOOD = {
    orderId: ORDER_ID, requestedDate: "2026-12-01", reasonKey: "customer_renovation",
    reasonDetail: "kitchen not finished", termsAcknowledged: true,
    freeStorageRequested: true, evidenceUrl: "orders-attachments/x/whatsapp.jpg",
  };

  it("hands the door every §6 fact the customer supplied", async () => {
    const sb = door();
    const res = await post("operation", GOOD);
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("payment_record_delivery_date_request", {
      p_order_id: ORDER_ID,
      p_requested_date: "2026-12-01",
      p_reason_key: "customer_renovation",
      p_reason_detail: "kitchen not finished",
      p_terms_acknowledged: true,
      p_free_storage_requested: true,
      p_evidence_url: "orders-attachments/x/whatsapp.jpg",
    });
  });

  /** §6 charges storage for CUSTOMER delay only. A Carres-side reason is not a
   *  §6 request at all, and accepting one would grow a second responsibility
   *  rule beside the governed Delivery Reason Library. */
  it("refuses a Carres-side reason before the door is even called", async () => {
    const sb = door();
    const res = await post("operation", { ...GOOD, reasonKey: "stock_not_ready" });
    expect(res.status).toBe(422);
    expect((await res.json() as { code: string }).code).toBe("reason_not_customer_side");
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("refuses a reason that is in no library at all", async () => {
    const sb = door();
    expect((await post("operation", { ...GOOD, reasonKey: "because" })).status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("refuses a request with no evidence — a telephone call is not written", async () => {
    const sb = door();
    expect((await post("operation", { ...GOOD, evidenceUrl: "" })).status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("carries the door's own refusals back with their status", async () => {
    door(null, { code: "22023", details: "terms_not_acknowledged",
      message: "The customer must acknowledge the storage terms." });
    const res = await post("operation", { ...GOOD, termsAcknowledged: false });
    expect(res.status).toBe(422);
    expect((await res.json() as { message: string }).message).toContain("acknowledge");
  });
});

