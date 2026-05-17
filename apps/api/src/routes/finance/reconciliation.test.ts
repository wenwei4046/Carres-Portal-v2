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

const BS_ID = "00000000-0000-0000-0000-0000000bb001";
const REC_ID = "00000000-0000-0000-0000-0000000cc001";
const PAY_ID = "00000000-0000-0000-0000-0000000dd001";

describe("GET /api/finance/bank-statements", () => {
  it("returns enriched list with matched_ref derived from reconciliations", async () => {
    const fromFn = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ id: BS_ID, statement_date: "2026-04-26", description: "FPX in", amount: 5970 }],
                error: null,
              }),
            }),
          }),
          // No filters path
          limit: vi.fn().mockResolvedValue({
            data: [{ id: BS_ID, statement_date: "2026-04-26", description: "FPX in", amount: 5970 }],
            error: null,
          }),
        }),
      }),
    });
    const recsFn = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [{ bank_statement_id: BS_ID, payment_id: PAY_ID, invoice_id: null, refund_id: null, manual_ref: null }],
          error: null,
        }),
      }),
    });
    const sb = {
      from: vi.fn().mockImplementation((tbl: string) =>
        tbl === "bank_statements" ? fromFn() : recsFn(),
      ),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/bank-statements", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { matched_ref: string | null }[];
    expect(json.length).toBe(1);
    expect(json[0].matched_ref).not.toBeNull();
  });

  it("rejects bad from-date with 422", async () => {
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/bank-statements?from=not-a-date", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/finance/bank-statements", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/finance/bank-statements", () => {
  it("inserts a manual bank statement row", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: BS_ID, statement_date: "2026-04-26", amount: 5970 },
              error: null,
            }),
          }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/bank-statements", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          statementDate: "2026-04-26",
          description:   "FPX TRF · Tan Mei Ling",
          amount:        5970,
          reference:     "FPX-8821",
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.from).toHaveBeenCalledWith("bank_statements");
  });

  it("rejects non-finance role with 403", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/finance/bank-statements", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          statementDate: "2026-04-26",
          description:   "x",
          amount:        100,
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/finance/reconciliations/suggest/:bankStmtId", () => {
  it("calls finance_recon_suggest_matches RPC and returns payload", async () => {
    const payload = {
      bank_statement: { id: BS_ID, statement_date: "2026-04-26", description: "x", amount: 5970, reference: null },
      candidates: [
        { so: 1240, customer_name: "Tan", dealer_name: "KL", total: 5970, paid: 0, outstanding: 5970, invoice_no: "INV-2026-1240", distance: 0 },
      ],
    };
    const sb = { rpc: vi.fn().mockResolvedValue({ data: payload, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/finance/reconciliations/suggest/${BS_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_recon_suggest_matches", {
      p_bank_statement_id: BS_ID,
    });
    expect(await res.json()).toEqual(payload);
  });

  it("rejects invalid uuid with 422", async () => {
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/reconciliations/suggest/not-a-uuid", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("POST /api/finance/reconciliations", () => {
  it("inserts a payment-link reconciliation row", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: REC_ID, bank_statement_id: BS_ID, payment_id: PAY_ID },
              error: null,
            }),
          }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/reconciliations", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          bankStatementId: BS_ID,
          paymentId:       PAY_ID,
          note:            "manual match",
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it("rejects empty target body with 422 (refine)", async () => {
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/reconciliations", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ bankStatementId: BS_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/finance/reconciliations/:id", () => {
  it("deletes a reconciliation row", async () => {
    const eqFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const sb = {
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({ eq: eqFn }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/finance/reconciliations/${REC_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(eqFn).toHaveBeenCalledWith("id", REC_ID);
  });

  it("rejects invalid uuid with 422", async () => {
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/finance/reconciliations/not-a-uuid", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});
