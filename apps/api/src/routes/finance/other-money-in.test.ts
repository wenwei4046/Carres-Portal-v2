import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

/* The route is a thin door: validate, call ONE RPC with the caller's JWT, map
 * the database's refusal. What the RPCs themselves decide (Dr/Cr, go-live,
 * approver, over-receiving) is proven against Postgres by the 0478 probe. */

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const KID = "k1";
const USER_ID = "11111111-1111-1111-1111-000000000001";
const PARTY = "22222222-2222-4222-8222-000000000001";
const INVOICE = "33333333-3333-4333-8333-000000000001";
const RECEIPT = "44444444-4444-4444-8444-000000000001";
const KEY = "55555555-5555-4555-8555-000000000001";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject(USER_ID)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

function stubRpc(result: { data: unknown; error: unknown }) {
  const sb = { rpc: vi.fn().mockResolvedValue(result) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  return sb;
}

async function call(method: string, path: string, body?: unknown, role = "finance") {
  const jwt = await makeJwt(role);
  const headers: Record<string, string> = { Authorization: `Bearer ${jwt}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return app.fetch(
    new Request(`http://t/api/finance/other-money-in${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}

async function errorBody(res: Response) {
  return (await res.json()) as { error: string; code: string; message: string };
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

describe("who may use /api/finance/other-money-in", () => {
  it.each(["operation", "dealer", "salesperson"])("refuses %s with 403 and never reaches the database", async (role) => {
    const sb = stubRpc({ data: [], error: null });
    const res = await call("GET", "/receipts", undefined, role);
    expect(res.status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("admits principal", async () => {
    stubRpc({ data: [], error: null });
    const res = await call("GET", "/invoices", undefined, "principal");
    expect(res.status).toBe(200);
  });

  it("GET /me asks the approver duty about the caller, not about anyone the browser names", async () => {
    const sb = stubRpc({ data: true, error: null });
    const res = await call("GET", "/me");
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("has_finance_approver", { p_user_id: USER_ID });
    expect(await res.json()).toEqual({ mayCancel: true });
  });

  it("GET /me says no when the duty says anything but true", async () => {
    stubRpc({ data: null, error: null });
    const res = await call("GET", "/me");
    expect(await res.json()).toEqual({ mayCancel: false });
  });
});

describe("parties", () => {
  it("GET /parties lists every party through other_debtor_outstanding", async () => {
    const rows = [{ party_id: PARTY, name: "Sister Co Sdn Bhd", outstanding: 1500 }];
    const sb = stubRpc({ data: rows, error: null });
    const res = await call("GET", "/parties");
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("other_debtor_outstanding", { p_party_id: null });
    expect(await res.json()).toEqual(rows);
  });

  it("POST /parties trims the name and sends absent fields as null", async () => {
    const sb = stubRpc({ data: PARTY, error: null });
    const res = await call("POST", "/parties", { name: "  Sister Co Sdn Bhd ", kind: "company" });
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("finance_party_create", {
      p_name: "Sister Co Sdn Bhd",
      p_kind: "company",
      p_registration_no: null,
      p_phone: null,
      p_email: null,
      p_address: null,
      p_notes: null,
    });
    expect(await res.json()).toEqual({ id: PARTY });
  });

  it("POST /parties refuses a blank name before the round trip", async () => {
    const sb = stubRpc({ data: PARTY, error: null });
    const res = await call("POST", "/parties", { name: "   ", kind: "company" });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("POST /parties passes the database's duplicate sentence through as 422", async () => {
    stubRpc({ data: null, error: { code: "22023", message: "A party with this name is already on the list.", details: "party_exists" } });
    const res = await call("POST", "/parties", { name: "Sister Co Sdn Bhd", kind: "company" });
    expect(res.status).toBe(422);
    expect((await errorBody(res)).message).toBe("A party with this name is already on the list.");
  });

  it("PATCH /parties/:id sends the id and the active flag", async () => {
    const sb = stubRpc({ data: PARTY, error: null });
    const res = await call("PATCH", `/parties/${PARTY}`, { name: "Sister Co Sdn Bhd", kind: "company", is_active: false });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("finance_party_update", expect.objectContaining({ p_party_id: PARTY, p_is_active: false }));
  });

  it("PATCH /parties/:id keeps the rule code when retiring a party that owes", async () => {
    stubRpc({ data: null, error: { code: "P0001", message: "This party still owes RM 900.00.", details: "party_has_outstanding" } });
    const res = await call("PATCH", `/parties/${PARTY}`, { name: "Sister Co Sdn Bhd", kind: "company", is_active: false });
    expect(res.status).toBe(422);
    expect((await errorBody(res)).code).toBe("party_has_outstanding");
  });

  it("PATCH /parties/:id with a malformed id is a 404, never a 500", async () => {
    const sb = stubRpc({ data: null, error: null });
    const res = await call("PATCH", "/parties/not-a-uuid", { name: "X", kind: "company", is_active: true });
    expect(res.status).toBe(404);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe("other debtor invoices", () => {
  const draft = {
    party_id: PARTY,
    invoice_date: "2026-09-10",
    lines: [{ account_code: "4900", description: "Office rent, September", amount: 1500 }],
  };

  it("POST /invoices saves a draft, and says issue:false when not asked to issue", async () => {
    const sb = stubRpc({ data: INVOICE, error: null });
    const res = await call("POST", "/invoices", draft);
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("other_debtor_invoice_create", {
      p_party_id: PARTY,
      p_invoice_date: "2026-09-10",
      p_lines: [{ account_code: "4900", description: "Office rent, September", amount: 1500 }],
      p_due_date: null,
      p_reference: null,
      p_narration: null,
      p_issue: false,
    });
  });

  it("POST /invoices refuses a third decimal instead of rounding it", async () => {
    const sb = stubRpc({ data: INVOICE, error: null });
    const res = await call("POST", "/invoices", { ...draft, lines: [{ account_code: "4900", amount: 10.005 }] });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("POST /invoices refuses an invoice with no lines", async () => {
    const sb = stubRpc({ data: INVOICE, error: null });
    const res = await call("POST", "/invoices", { ...draft, lines: [] });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("PUT /invoices/:id edits the draft and can issue it in the same act", async () => {
    const sb = stubRpc({ data: INVOICE, error: null });
    const res = await call("PUT", `/invoices/${INVOICE}`, { ...draft, issue: true });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("other_debtor_invoice_update", expect.objectContaining({ p_invoice_id: INVOICE, p_issue: true }));
  });

  it("POST /invoices/:id/issue maps the go-live refusal to 422 with its sentence", async () => {
    stubRpc({ data: null, error: { code: "22023", message: "The ledger starts on 2026-09-10. This date is before it.", details: "before_go_live" } });
    const res = await call("POST", `/invoices/${INVOICE}/issue`);
    expect(res.status).toBe(422);
    expect((await errorBody(res)).message).toMatch(/before it/);
  });

  it("POST /invoices/:id/issue returns the entry it posted", async () => {
    const sb = stubRpc({ data: "e1", error: null });
    const res = await call("POST", `/invoices/${INVOICE}/issue`);
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("other_debtor_invoice_issue", { p_invoice_id: INVOICE });
    expect(await res.json()).toEqual({ id: INVOICE, entryId: "e1" });
  });

  it("POST /invoices/:id/cancel needs a reason", async () => {
    const sb = stubRpc({ data: null, error: null });
    const res = await call("POST", `/invoices/${INVOICE}/cancel`, { reason: "  " });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("POST /invoices/:id/cancel keeps invoice_has_receipts as the code", async () => {
    stubRpc({ data: null, error: { code: "P0001", message: "Cancel the receipts first.", details: "invoice_has_receipts" } });
    const res = await call("POST", `/invoices/${INVOICE}/cancel`, { reason: "Raised to the wrong company" });
    expect(res.status).toBe(422);
    expect((await errorBody(res)).code).toBe("invoice_has_receipts");
  });

  it("POST /invoices/:id/cancel by someone without the approver duty is a 403", async () => {
    stubRpc({ data: null, error: { code: "42501", message: "Only the finance approver can cancel an issued invoice.", details: "not_finance_approver" } });
    const res = await call("POST", `/invoices/${INVOICE}/cancel`, { reason: "Raised to the wrong company" });
    expect(res.status).toBe(403);
  });

  it("GET /invoices/:id of a missing invoice is a 404", async () => {
    stubRpc({ data: null, error: { code: "P0002", message: "Invoice not found." } });
    const res = await call("GET", `/invoices/${INVOICE}`);
    expect(res.status).toBe(404);
  });
});

describe("receipts", () => {
  const loanIn = {
    receipt_date: "2026-09-10",
    money_account_code: "1120",
    payer_name: "A lender",
    lines: [{ account_code: "2360", description: "Loan in", amount: 10000 }],
    idempotency_key: KEY,
  };

  it("POST /receipts records a loan with no party and no invoice", async () => {
    const sb = stubRpc({ data: RECEIPT, error: null });
    const res = await call("POST", "/receipts", loanIn);
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("other_receipt_create", {
      p_receipt_date: "2026-09-10",
      p_money_account_code: "1120",
      p_lines: [{ account_code: "2360", description: "Loan in", amount: 10000 }],
      p_allocations: [],
      p_party_id: null,
      p_payer_name: "A lender",
      p_reference: null,
      p_narration: null,
      p_idempotency_key: KEY,
    });
    expect(await res.json()).toEqual({ id: RECEIPT });
  });

  it("POST /receipts against an invoice sends the allocation", async () => {
    const sb = stubRpc({ data: RECEIPT, error: null });
    const res = await call("POST", "/receipts", {
      receipt_date: "2026-09-10",
      money_account_code: "1120",
      party_id: PARTY,
      allocations: [{ invoice_id: INVOICE, amount: 600 }],
      idempotency_key: KEY,
    });
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith(
      "other_receipt_create",
      expect.objectContaining({ p_party_id: PARTY, p_lines: [], p_allocations: [{ invoice_id: INVOICE, amount: 600 }] }),
    );
  });

  it("POST /receipts refuses money against an invoice without the party", async () => {
    const sb = stubRpc({ data: RECEIPT, error: null });
    const res = await call("POST", "/receipts", {
      receipt_date: "2026-09-10",
      money_account_code: "1120",
      payer_name: "Someone",
      allocations: [{ invoice_id: INVOICE, amount: 600 }],
      idempotency_key: KEY,
    });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("POST /receipts refuses a receipt with nothing on it", async () => {
    const sb = stubRpc({ data: RECEIPT, error: null });
    const res = await call("POST", "/receipts", { ...loanIn, lines: [] });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("POST /receipts refuses a receipt without its idempotency key", async () => {
    const sb = stubRpc({ data: RECEIPT, error: null });
    const noKey: Record<string, unknown> = { ...loanIn };
    delete noKey.idempotency_key;
    const res = await call("POST", "/receipts", noKey);
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("POST /receipts keeps invoice_over_received as the code", async () => {
    stubRpc({ data: null, error: { code: "P0001", message: "More than the invoice still owes.", details: "invoice_over_received" } });
    const res = await call("POST", "/receipts", {
      receipt_date: "2026-09-10",
      money_account_code: "1120",
      party_id: PARTY,
      allocations: [{ invoice_id: INVOICE, amount: 1000 }],
      idempotency_key: KEY,
    });
    expect(res.status).toBe(422);
    expect((await errorBody(res)).code).toBe("invoice_over_received");
  });

  it("GET /receipts lists through other_receipt_list", async () => {
    const sb = stubRpc({ data: [], error: null });
    const res = await call("GET", "/receipts");
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("other_receipt_list");
  });

  it("GET /receipts/:id passes the id", async () => {
    const sb = stubRpc({ data: { receipt: {}, lines: [], allocations: [] }, error: null });
    const res = await call("GET", `/receipts/${RECEIPT}`);
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("other_receipt_detail", { p_receipt_id: RECEIPT });
  });

  it("POST /receipts/:id/void sends the reason and returns the reversal", async () => {
    const sb = stubRpc({ data: "r1", error: null });
    const res = await call("POST", `/receipts/${RECEIPT}/void`, { reason: "Recorded twice" });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("other_receipt_void", { p_receipt_id: RECEIPT, p_reason: "Recorded twice" });
    expect(await res.json()).toEqual({ id: RECEIPT, reversalEntryId: "r1" });
  });

  it("POST /receipts/:id/void with a malformed id is a 404", async () => {
    const sb = stubRpc({ data: null, error: null });
    const res = await call("POST", "/receipts/123/void", { reason: "Recorded twice" });
    expect(res.status).toBe(404);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("an unexpected database error is a 500, not a silent success", async () => {
    stubRpc({ data: null, error: { code: "XX000", message: "boom" } });
    const res = await call("GET", "/receipts");
    expect(res.status).toBe(500);
  });
});

describe("GET /accounts", () => {
  it("returns the account options for the three forms", async () => {
    const rows = [{ code: "1120", name: "Bank", for_money: true, for_receipt_line: false, for_invoice_line: false }];
    const sb = stubRpc({ data: rows, error: null });
    const res = await call("GET", "/accounts");
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("fin_money_in_account_options");
    expect(await res.json()).toEqual(rows);
  });
});
