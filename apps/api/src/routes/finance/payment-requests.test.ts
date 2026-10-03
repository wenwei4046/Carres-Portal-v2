import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

/* /api/finance/payment-requests (0645; Chew 2026-10-03). The database decides
   who may do what; these tests pin the route's own guard, the arguments it
   passes and the refusals it keeps. Names are invented. */
const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };
const ID = "aaaaaaaa-0000-4000-8000-000000000001";
const VOUCHER = "bbbbbbbb-0000-4000-8000-000000000002";

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

function mockRpc(result: { data: unknown; error: unknown }) {
  const sb = {
    rpc: vi.fn().mockResolvedValue(result),
    storage: { from: vi.fn(() => ({
      createSignedUploadUrl: vi.fn(async (path: string) => ({ data: { token: "t", path }, error: null })),
      createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed" }, error: null })),
    })) },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  return sb;
}

async function call(path: string, init: { method?: string; body?: unknown; role?: string } = {}) {
  const role = init.role ?? "operation";
  const jwt = await signTestJwt("11111111-1111-1111-1111-000000000001", { email: `${role}@x`, app_metadata: { role } });
  const headers: Record<string, string> = { Authorization: `Bearer ${jwt}` };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  return app.fetch(new Request(`http://t/api/finance/payment-requests${path}`, {
    method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }), env);
}

const good = { payeeName: "Bayview Properties", amount: 3500, purpose: "October rent, PJ showroom", billNo: "BV-1007", billDate: "2026-10-01" };

describe("/api/finance/payment-requests", () => {
  it("is open to Operation, Finance and the principal only", async () => {
    for (const role of ["dealer", "supplier", "partner", "hr"]) {
      expect((await call("", { role })).status, role).toBe(403);
    }
    expect(userClient).not.toHaveBeenCalled();
    mockRpc({ data: [], error: null });
    for (const role of ["operation", "finance", "principal"]) {
      expect((await call("", { role })).status, role).toBe(200);
    }
  });

  it("raises a request with what was typed, blanks as empty", async () => {
    const sb = mockRpc({ data: ID, error: null });
    const res = await call("", { method: "POST", body: { ...good, note: "  " } });
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("payment_request_save", {
      p_request_id: null, p_payee_name: "Bayview Properties", p_amount: 3500, p_purpose: "October rent, PJ showroom",
      p_pay_by: null, p_note: null, p_bank_name: null, p_bank_account_no: null, p_bank_account_holder: null,
      p_bill_no: "BV-1007", p_bill_date: "2026-10-01",
    });
  });

  it("refuses what is not a request before any database call", async () => {
    expect((await call("", { method: "POST", body: { ...good, amount: 0 } })).status).toBe(422);
    expect((await call("/not-an-id")).status).toBe(422);
    expect((await call(`/${ID}/answer`, { method: "POST", body: {} })).status).toBe(422);
    expect(userClient).not.toHaveBeenCalled();
  });

  it("the database's refusal keeps its reason", async () => {
    mockRpc({ data: null, error: { code: "42501", message: "Only staff the boss has allowed can ask Finance to pay.", details: "not_allowed_to_request" } });
    const res = await call("", { method: "POST", body: good });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "not_allowed_to_request" });
    mockRpc({ data: null, error: { code: "P0001", message: "Payment request PRQ has no bill attached.", details: "request_no_bill" } });
    expect(await (await call(`/${ID}/answer`, { method: "POST", body: { voucherId: VOUCHER }, role: "finance" })).json())
      .toMatchObject({ code: "request_no_bill" });
  });

  it("Finance's answer, return and the boss's grant pass their arguments through", async () => {
    let sb = mockRpc({ data: ID, error: null });
    await call(`/${ID}/answer`, { method: "POST", body: { voucherId: VOUCHER }, role: "finance" });
    expect(sb.rpc).toHaveBeenCalledWith("payment_request_answer", { p_request_id: ID, p_voucher_id: VOUCHER, p_bill_id: null });
    sb = mockRpc({ data: ID, error: null });
    await call(`/${ID}/return`, { method: "POST", body: { note: "Attach the invoice" }, role: "finance" });
    expect(sb.rpc).toHaveBeenCalledWith("payment_request_return", { p_request_id: ID, p_note: "Attach the invoice" });
    sb = mockRpc({ data: null, error: null });
    await call(`/grants/${ID}`, { method: "PUT", body: { allowed: true }, role: "principal" });
    expect(sb.rpc).toHaveBeenCalledWith("finance_request_grant_set", { p_user_id: ID, p_allowed: true });
  });

  it("an upload is signed in the request's own folder of the request bucket", async () => {
    const sb = mockRpc({ data: null, error: null });
    const res = await call(`/${ID}/files/sign`, { method: "POST", body: { mimeType: "application/pdf", sizeBytes: 2048 } });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { bucket: string; path: string };
    expect(out.bucket).toBe("payment-request-files");
    expect(out.path).toMatch(new RegExp(`^${ID}/[0-9a-f-]{36}\\.pdf$`));
    expect(sb.storage.from).toHaveBeenCalledWith("payment-request-files");
    expect((await call("/files/url?path=../ap-documents/x.pdf")).status).toBe(422);
  });
});
