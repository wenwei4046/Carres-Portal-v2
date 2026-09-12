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

const BILL_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const VOUCHER_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const SUPPLIER_ID = "cccccccc-0000-4000-8000-000000000003";
const RECEIPT_ID = "dddddddd-0000-4000-8000-000000000004";
const PO_LINE_ID = "eeeeeeee-0000-4000-8000-000000000005";
const FILE_UUID = "ffffffff-0000-4000-8000-000000000006";

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

function mockRpc(result: { data: unknown; error: unknown }) {
  const sb = { rpc: vi.fn().mockResolvedValue(result) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  return sb;
}

async function call(path: string, init: { method?: string; body?: unknown; role?: string } = {}) {
  const jwt = await makeJwt(init.role ?? "finance");
  const headers: Record<string, string> = { Authorization: `Bearer ${jwt}` };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  return app.fetch(
    new Request(`http://t/api/finance/payables${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    env,
  );
}

const goodBill = {
  supplierId: SUPPLIER_ID,
  supplierInvoiceNo: "INV-TEST-1",
  billDate: "2026-09-10",
  lines: [
    { warehouseReceiptId: RECEIPT_ID, poLineId: PO_LINE_ID, qty: 5, unitPrice: 105 },
    { accountCode: "6200", description: "Rent", amount: 3000 },
  ],
};

const goodVoucher = {
  purpose: "SUPPLIER_BILLS",
  supplierId: SUPPLIER_ID,
  voucherDate: "2026-09-11",
  payFromAccountCode: "1120",
  payMethod: "BANK_TRANSFER",
  payReference: "TT-1",
  allocations: [{ billId: BILL_ID, amount: 1025 }],
  lines: [{ accountCode: "6500", description: "Bank charge", amount: 5 }],
};

describe("/api/finance/payables — who may call", () => {
  it("refuses a dealer with 403", async () => {
    const res = await call("/bills", { role: "dealer" });
    expect(res.status).toBe(403);
  });

  it("refuses operation with 403 (finance and principal only)", async () => {
    const res = await call("/vouchers", { role: "operation" });
    expect(res.status).toBe(403);
  });

  it("admits principal", async () => {
    mockRpc({ data: [], error: null });
    const res = await call("/vouchers", { role: "principal" });
    expect(res.status).toBe(200);
  });
});

describe("GET readers", () => {
  it("GET /bills calls supplier_bill_register and wraps rows", async () => {
    const sb = mockRpc({ data: [{ id: BILL_ID }], error: null });
    const res = await call("/bills");
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_bill_register");
    expect(await res.json()).toEqual({ rows: [{ id: BILL_ID }] });
  });

  it("GET /bills/grn-candidates passes the supplier filter", async () => {
    const sb = mockRpc({ data: [], error: null });
    const res = await call(`/bills/grn-candidates?supplierId=${SUPPLIER_ID}`);
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_bill_grn_candidates", { p_supplier_id: SUPPLIER_ID });
  });

  it("GET /outstanding with no filter asks for every supplier", async () => {
    const sb = mockRpc({ data: [], error: null });
    await call("/outstanding");
    expect(sb.rpc).toHaveBeenCalledWith("ap_outstanding", { p_supplier_id: null });
  });

  it("GET /outstanding refuses a supplier id that is not a uuid", async () => {
    const res = await call("/outstanding?supplierId=abc");
    expect(res.status).toBe(422);
  });

  it("GET /bills/:id returns the document", async () => {
    const doc = { bill: { id: BILL_ID }, lines: [], can: { edit: true } };
    const sb = mockRpc({ data: doc, error: null });
    const res = await call(`/bills/${BILL_ID}`);
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_bill_document", { p_bill_id: BILL_ID });
    expect(await res.json()).toEqual(doc);
  });

  it("GET /vouchers/:id answers 404 when the database returns nothing", async () => {
    mockRpc({ data: null, error: null });
    const res = await call(`/vouchers/${VOUCHER_ID}`);
    expect(res.status).toBe(404);
  });

  it("GET /bills/:id refuses a malformed id before calling the database", async () => {
    const sb = mockRpc({ data: null, error: null });
    const res = await call("/bills/not-a-uuid");
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("GET /suppliers reads the suppliers table as the user", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: SUPPLIER_ID, name: "Test Factory", kind: "factory" }], error: null });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const res = await call("/suppliers");
    expect(res.status).toBe(200);
    expect(from).toHaveBeenCalledWith("suppliers");
    expect(select).toHaveBeenCalledWith("id, name, kind");
  });
});

describe("bills", () => {
  it("POST /bills turns the form into the save-draft call, snake_case lines", async () => {
    const sb = mockRpc({ data: BILL_ID, error: null });
    const res = await call("/bills", { method: "POST", body: goodBill });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: BILL_ID });
    expect(sb.rpc).toHaveBeenCalledWith("supplier_bill_save_draft", {
      p_bill_id: null,
      p_supplier_id: SUPPLIER_ID,
      p_supplier_invoice_no: "INV-TEST-1",
      p_bill_date: "2026-09-10",
      p_lines: [
        {
          warehouse_receipt_id: RECEIPT_ID, po_line_id: PO_LINE_ID, account_code: null,
          description: null, sku: null, qty: 5, unit_price: 105, amount: null,
        },
        {
          warehouse_receipt_id: null, po_line_id: null, account_code: "6200",
          description: "Rent", sku: null, qty: null, unit_price: null, amount: 3000,
        },
      ],
      p_due_date: null,
      p_ap_account_code: null,
      p_narration: null,
    });
  });

  it("PUT /bills/:id rewrites that draft", async () => {
    const sb = mockRpc({ data: BILL_ID, error: null });
    const res = await call(`/bills/${BILL_ID}`, { method: "PUT", body: goodBill });
    expect(res.status).toBe(200);
    expect(sb.rpc.mock.calls[0]?.[1]).toMatchObject({ p_bill_id: BILL_ID });
  });

  it("POST /bills refuses a bill with no lines before the database", async () => {
    const sb = mockRpc({ data: null, error: null });
    const res = await call("/bills", { method: "POST", body: { ...goodBill, lines: [] } });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("POST /bills refuses an amount with three decimals", async () => {
    const sb = mockRpc({ data: null, error: null });
    const res = await call("/bills", {
      method: "POST",
      body: { ...goodBill, lines: [{ accountCode: "6200", amount: 10.005 }] },
    });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("POST /bills accepts an amount like 0.07 (floating point is not a third decimal)", async () => {
    mockRpc({ data: BILL_ID, error: null });
    const res = await call("/bills", {
      method: "POST",
      body: { ...goodBill, lines: [{ accountCode: "6200", amount: 0.07 }] },
    });
    expect(res.status).toBe(201);
  });

  it("confirm: a GRN over-billed refusal reaches the page as 422 with its code", async () => {
    mockRpc({
      data: null,
      error: { code: "P0001", message: "SKU-A: 5 received, and 5 of them are already on SB-1.", details: "grn_over_billed" },
    });
    const res = await call(`/bills/${BILL_ID}/confirm`, { method: "POST" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "grn_over_billed" });
  });

  it("cancel needs a reason", async () => {
    const sb = mockRpc({ data: BILL_ID, error: null });
    const bad = await call(`/bills/${BILL_ID}/cancel`, { method: "POST", body: { reason: "  " } });
    expect(bad.status).toBe(422);
    const ok = await call(`/bills/${BILL_ID}/cancel`, { method: "POST", body: { reason: "Wrong supplier" } });
    expect(ok.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_bill_cancel", { p_bill_id: BILL_ID, p_reason: "Wrong supplier" });
  });

  it("POST /other-creditors creates a landlord", async () => {
    const sb = mockRpc({ data: SUPPLIER_ID, error: null });
    const res = await call("/other-creditors", { method: "POST", body: { name: "Test Landlord Sdn Bhd" } });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_other_creditor_create", {
      p_name: "Test Landlord Sdn Bhd",
      p_contact: null,
      p_contact_email: null,
    });
  });
});

describe("payment vouchers", () => {
  it("POST /vouchers sends lines and allocations; the total is never typed", async () => {
    const sb = mockRpc({ data: VOUCHER_ID, error: null });
    const res = await call("/vouchers", { method: "POST", body: goodVoucher });
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("payment_voucher_save_draft", {
      p_voucher_id: null,
      p_purpose: "SUPPLIER_BILLS",
      p_supplier_id: SUPPLIER_ID,
      p_payee_name: null,
      p_voucher_date: "2026-09-11",
      p_pay_from_account_code: "1120",
      p_lines: [{ account_code: "6500", description: "Bank charge", amount: 5 }],
      p_allocations: [{ bill_id: BILL_ID, amount: 1025 }],
      p_pay_method: "BANK_TRANSFER",
      p_pay_reference: "TT-1",
      p_narration: null,
      p_advance_amount: 0,
    });
  });

  it("POST /vouchers carries an advance with no bill (pay before the bill)", async () => {
    const sb = mockRpc({ data: VOUCHER_ID, error: null });
    const res = await call("/vouchers", {
      method: "POST",
      body: { ...goodVoucher, allocations: [], lines: [], advanceAmount: 1500 },
    });
    expect(res.status).toBe(201);
    expect(sb.rpc.mock.calls[0]?.[1]).toMatchObject({ p_allocations: [], p_lines: [], p_advance_amount: 1500 });
  });

  it.each([-1, 10.005])("POST /vouchers refuses an advance of %s before the database", async (advanceAmount) => {
    const sb = mockRpc({ data: null, error: null });
    const res = await call("/vouchers", { method: "POST", body: { ...goodVoucher, advanceAmount } });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("POST /vouchers refuses an amount field (the total is computed)", async () => {
    const sb = mockRpc({ data: null, error: null });
    const res = await call("/vouchers", { method: "POST", body: { ...goodVoucher, amount: 1030 } });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it.each(["prepare", "check", "approve"] as const)("POST /vouchers/:id/%s calls its function", async (step) => {
    const sb = mockRpc({ data: VOUCHER_ID, error: null });
    const res = await call(`/vouchers/${VOUCHER_ID}/${step}`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith(`payment_voucher_${step}`, { p_voucher_id: VOUCHER_ID });
  });

  it("approve by the preparer: 422 separation_of_duties", async () => {
    mockRpc({
      data: null,
      error: { code: "P0001", message: "You prepared this voucher, so someone else approves it.", details: "separation_of_duties" },
    });
    const res = await call(`/vouchers/${VOUCHER_ID}/approve`, { method: "POST" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "separation_of_duties" });
  });

  it("approve by someone without the approver duty: 403 keeps the reason code", async () => {
    mockRpc({
      data: null,
      error: { code: "42501", message: "only a finance approver approves a payment voucher", details: "not_finance_approver" },
    });
    const res = await call(`/vouchers/${VOUCHER_ID}/approve`, { method: "POST" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "not_finance_approver" });
  });

  it.each(["reject", "cancel"] as const)("POST /vouchers/:id/%s passes the reason", async (step) => {
    const sb = mockRpc({ data: null, error: null });
    const res = await call(`/vouchers/${VOUCHER_ID}/${step}`, { method: "POST", body: { reason: "Wrong account" } });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith(`payment_voucher_${step}`, { p_voucher_id: VOUCHER_ID, p_reason: "Wrong account" });
  });

  it("reject without a reason is refused before the database", async () => {
    const sb = mockRpc({ data: null, error: null });
    const res = await call(`/vouchers/${VOUCHER_ID}/reject`, { method: "POST", body: {} });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe("supplier advances", () => {
  const APPLICATION_ID = "abababab-0000-4000-8000-000000000007";
  const MONEY_BACK_ID = "cdcdcdcd-0000-4000-8000-000000000008";
  const KEY = "efefefef-0000-4000-8000-000000000009";

  it("GET /advances passes the supplier filter", async () => {
    const sb = mockRpc({ data: [{ voucher_id: VOUCHER_ID, advance_open: 900 }], error: null });
    const res = await call(`/advances?supplierId=${SUPPLIER_ID}`);
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_advances", { p_supplier_id: SUPPLIER_ID });
    expect(await res.json()).toEqual({ rows: [{ voucher_id: VOUCHER_ID, advance_open: 900 }] });
  });

  it("apply: knocks the advance off one bill", async () => {
    const sb = mockRpc({ data: APPLICATION_ID, error: null });
    const res = await call(`/vouchers/${VOUCHER_ID}/advance-applications`, {
      method: "POST",
      body: { billId: BILL_ID, amount: 600 },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: APPLICATION_ID });
    expect(sb.rpc).toHaveBeenCalledWith("supplier_advance_apply", {
      p_voucher_id: VOUCHER_ID,
      p_bill_id: BILL_ID,
      p_amount: 600,
    });
  });

  it.each([0, -5, 1.005])("apply refuses an amount of %s before the database", async (amount) => {
    const sb = mockRpc({ data: null, error: null });
    const res = await call(`/vouchers/${VOUCHER_ID}/advance-applications`, {
      method: "POST",
      body: { billId: BILL_ID, amount },
    });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("apply: more than the advance has left reaches the page as 422 with its code", async () => {
    mockRpc({
      data: null,
      error: { code: "P0001", message: "Only RM 900.00 of the advance on PV-1 is left.", details: "advance_over_applied" },
    });
    const res = await call(`/vouchers/${VOUCHER_ID}/advance-applications`, {
      method: "POST",
      body: { billId: BILL_ID, amount: 901 },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "advance_over_applied" });
  });

  it("take off: needs a reason and names the knock-off", async () => {
    const sb = mockRpc({ data: APPLICATION_ID, error: null });
    const bad = await call(`/advance-applications/${APPLICATION_ID}/cancel`, { method: "POST", body: { reason: "" } });
    expect(bad.status).toBe(422);
    const ok = await call(`/advance-applications/${APPLICATION_ID}/cancel`, {
      method: "POST",
      body: { reason: "Wrong bill" },
    });
    expect(ok.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_advance_application_cancel", {
      p_application_id: APPLICATION_ID,
      p_reason: "Wrong bill",
    });
  });

  it("money back: records it with its double-press key", async () => {
    const sb = mockRpc({ data: MONEY_BACK_ID, error: null });
    const res = await call(`/vouchers/${VOUCHER_ID}/money-back`, {
      method: "POST",
      body: { moneyBackDate: "2026-09-15", moneyAccountCode: "1120", amount: 300, reference: "TT-BACK", idempotencyKey: KEY },
    });
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_advance_money_back_record", {
      p_voucher_id: VOUCHER_ID,
      p_money_back_date: "2026-09-15",
      p_money_account_code: "1120",
      p_amount: 300,
      p_reference: "TT-BACK",
      p_narration: null,
      p_idempotency_key: KEY,
    });
  });

  it("money back refuses a missing account before the database", async () => {
    const sb = mockRpc({ data: null, error: null });
    const res = await call(`/vouchers/${VOUCHER_ID}/money-back`, {
      method: "POST",
      body: { moneyBackDate: "2026-09-15", moneyAccountCode: "", amount: 300 },
    });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("cancel money back: someone without the approver duty gets 403 with the reason code", async () => {
    mockRpc({
      data: null,
      error: { code: "42501", message: "Cancelling money back takes the finance approver.", details: "not_finance_approver" },
    });
    const res = await call(`/money-back/${MONEY_BACK_ID}/cancel`, { method: "POST", body: { reason: "Bank returned it" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "not_finance_approver" });
  });

  it("cancel money back passes the reason", async () => {
    const sb = mockRpc({ data: null, error: null });
    const res = await call(`/money-back/${MONEY_BACK_ID}/cancel`, { method: "POST", body: { reason: "Bank returned it" } });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_advance_money_back_cancel", {
      p_money_back_id: MONEY_BACK_ID,
      p_reason: "Bank returned it",
    });
  });

  it("the advance doors refuse a dealer", async () => {
    const res = await call(`/vouchers/${VOUCHER_ID}/advance-applications`, {
      method: "POST",
      role: "dealer",
      body: { billId: BILL_ID, amount: 1 },
    });
    expect(res.status).toBe(403);
  });
});

describe("files", () => {
  it("sign: the path names the document, and the user's token signs it", async () => {
    const createSignedUploadUrl = vi.fn().mockImplementation(async (path: string) => ({ data: { token: "tok", path }, error: null }));
    const from = vi.fn().mockReturnValue({ createSignedUploadUrl });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ storage: { from } } as any);
    const res = await call(`/bills/${BILL_ID}/files/sign`, {
      method: "POST",
      body: { mimeType: "application/pdf", sizeBytes: 1000 },
    });
    expect(res.status).toBe(200);
    expect(from).toHaveBeenCalledWith("ap-documents");
    const body = (await res.json()) as { path: string; token: string };
    expect(body.path).toMatch(new RegExp(`^SUPPLIER_BILL/${BILL_ID}/[0-9a-f-]{36}\\.pdf$`));
    expect(body.token).toBe("tok");
  });

  it("sign refuses a file type the bucket does not take", async () => {
    const res = await call(`/vouchers/${VOUCHER_ID}/files/sign`, {
      method: "POST",
      body: { mimeType: "application/zip", sizeBytes: 1000 },
    });
    expect(res.status).toBe(422);
  });

  it("add: records the file on a voucher", async () => {
    const sb = mockRpc({ data: FILE_UUID, error: null });
    const path = `PAYMENT_VOUCHER/${VOUCHER_ID}/${FILE_UUID}.png`;
    const res = await call(`/vouchers/${VOUCHER_ID}/files`, {
      method: "POST",
      body: { path, fileName: "bank-slip.png", mimeType: "image/png", sizeBytes: 2048 },
    });
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("ap_document_file_add", {
      p_document_type: "PAYMENT_VOUCHER",
      p_document_id: VOUCHER_ID,
      p_storage_path: path,
      p_file_name: "bank-slip.png",
      p_mime_type: "image/png",
      p_size_bytes: 2048,
    });
  });

  it("url: refuses a path outside the two document folders", async () => {
    const res = await call(`/files/url?path=${encodeURIComponent("../service-case-evidence/x.jpg")}`);
    expect(res.status).toBe(422);
  });

  it("url: signs a read for a bill file", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://t.x/signed" }, error: null });
    const from = vi.fn().mockReturnValue({ createSignedUrl });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ storage: { from } } as any);
    const path = `SUPPLIER_BILL/${BILL_ID}/${FILE_UUID}.pdf`;
    const res = await call(`/files/url?path=${encodeURIComponent(path)}`);
    expect(res.status).toBe(200);
    expect(createSignedUrl).toHaveBeenCalledWith(path, 300);
    expect(await res.json()).toEqual({ url: "https://t.x/signed" });
  });
});
