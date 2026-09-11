import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

vi.mock("../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../lib/supabase";

/*
 * POST /api/orders/:id/issue-invoice — the order drawer's Generate invoice.
 * 0476: the RPC issues through the governed number series and posts the
 * journal entry; a ledger refusal is the operator's to read, not a 500.
 */
const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const KID = "k-issue";
const ORDER_ID = "00000000-0000-0000-0000-00000000a476";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000476")
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

async function issue(role: string, body: unknown = { amount: 1080 }) {
  return app.fetch(new Request(`http://t/api/orders/${ORDER_ID}/issue-invoice`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await makeJwt(role)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), env);
}

describe("POST /api/orders/:id/issue-invoice (0476)", () => {
  it("returns the governed number the RPC issued", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {
      invoice_no: "INV-110926-5842", issued_at: "2026-09-11T10:00:00Z", amount: 1080,
      already_issued: false, gl_entry_id: "e1",
    }, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await issue("operation");
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("issue_order_invoice", { p_order_id: ORDER_ID, p_amount: 1080 });
    expect(await res.json()).toEqual({
      invoice_no: "INV-110926-5842", issued_at: "2026-09-11T10:00:00Z", amount: 1080, already_issued: false,
    });
  });

  it("a ledger refusal is a 422 carrying the ledger's sentence and its reason code", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: {
      code: "22023", details: "storage_fee_on_two_documents",
      message: "this order's storage is billed on Storage Invoices — issue the Sales Invoice for the goods and add-ons only",
    } });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await issue("finance", { amount: 1130 });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("storage_fee_on_two_documents");
    expect(body.message).toContain("Storage Invoices");
  });

  it("refuses a dealer before the RPC", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    expect((await issue("dealer")).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
