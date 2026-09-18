import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  advanceApplyInput,
  apFileAddInput,
  apFileSignInput,
  apReasonInput,
  moneyBackInput,
  otherCreditorInput,
  paymentVoucherDraftInput,
  supplierBillDraftInput,
  type PaymentVoucherDraftInput,
  type SupplierBillDraftInput,
} from "@carres/shared/schemas/finance-ap";
import { requireFinance } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import { departmentQuery, keepByDepartment, withLineDepartments } from "../../lib/line-departments";
import type { AppEnv } from "../../types";

/**
 * /api/finance/payables — what Carres owes, and the one door that pays it
 * (migration 0477).
 *
 *   Suppliers and accounts
 *     GET  /suppliers                   who can send a bill (suppliers + other creditors)
 *     POST /other-creditors             supplier_other_creditor_create — a landlord, an advertiser
 *     GET  /accounts                    ap_account_choices — which account fits which box
 *     GET  /outstanding                 ap_outstanding — owed per supplier, zero included
 *     GET  /bill-outstanding            ap_bill_outstanding — owed per confirmed bill
 *
 *   Bills (a supplier's invoice, entered)
 *     GET  /bills                       supplier_bill_register
 *     GET  /bills/grn-candidates        supplier_bill_grn_candidates — GRNs with something left to bill
 *     GET  /bills/grn-lines/:receiptId  supplier_bill_grn_lines
 *     GET  /bills/:id                   supplier_bill_document
 *     POST /bills                       supplier_bill_save_draft (new draft)
 *     PUT  /bills/:id                   supplier_bill_save_draft (rewrite a draft)
 *     POST /bills/:id/confirm           supplier_bill_confirm — posts the bill
 *     POST /bills/:id/cancel            supplier_bill_cancel — reverses it if confirmed
 *
 *   Payment vouchers (Draft → Prepared → Checked → Approved)
 *     GET  /vouchers                    payment_voucher_register
 *     GET  /vouchers/:id                payment_voucher_document
 *     POST /vouchers                    payment_voucher_save_draft (new draft)
 *     PUT  /vouchers/:id                payment_voucher_save_draft (rewrite a draft)
 *     POST /vouchers/:id/prepare|check|approve
 *     POST /vouchers/:id/reject         back to Draft, with a reason
 *     POST /vouchers/:id/cancel         cancels; reverses the entry if approved
 *
 *   Supplier advances (0484–0485: a voucher pays before the bill)
 *     GET  /advances                    supplier_advances — every approved advance, and what is left
 *     POST /vouchers/:id/advance-applications   supplier_advance_apply — knock it off a bill; posts nothing
 *     POST /advance-applications/:id/cancel     supplier_advance_application_cancel — take it off again
 *     POST /vouchers/:id/money-back     supplier_advance_money_back_record — the supplier sent money back
 *     POST /money-back/:id/cancel       supplier_advance_money_back_cancel — the approver reverses it
 *
 *   Files (supplier invoices, receipts, bank slips)
 *     POST /bills/:id/files/sign  · POST /vouchers/:id/files/sign    signed upload URL
 *     POST /bills/:id/files       · POST /vouchers/:id/files         record the uploaded file
 *     GET  /files/url?path=                                          short-lived read URL
 *
 * Every call runs as the SIGNED-IN USER (userClient). The database functions
 * decide every rule, including who may prepare, check and approve; this
 * router only shapes requests and maps refusals.
 */
const payablesRouter = new Hono<AppEnv>();

const AP_BUCKET = "ap-documents";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DocType = "SUPPLIER_BILL" | "PAYMENT_VOUCHER";

/** mapPgError, but a 403 keeps the database's reason code (not_finance_approver,
 *  voucher_cancelled …) so the page can say which rule refused. */
function pgFail(c: Context<AppEnv>, error: { code?: string; message?: string; details?: string }) {
  const m = mapPgError(error);
  if (m.status === 403 && error.details) {
    return c.json({ ...m.body, code: error.details }, 403);
  }
  return c.json(m.body, m.status);
}

function badId(c: Context<AppEnv>, what: string) {
  return c.json({ error: "invalid_input", code: "invalid_param", message: `That ${what} id is not valid.` }, 422);
}

/** `?supplierId=` — absent means everyone; present must be a uuid. */
function supplierFilter(c: Context<AppEnv>): { ok: true; value: string | null } | { ok: false } {
  const raw = c.req.query("supplierId");
  if (raw === undefined || raw === "") return { ok: true, value: null };
  return UUID_RE.test(raw) ? { ok: true, value: raw } : { ok: false };
}

const BILL_LINES = { table: "supplier_bill_lines", parent: "bill_id" } as const;
const VOUCHER_LINES = { table: "payment_voucher_lines", parent: "voucher_id" } as const;

function sb(c: Context<AppEnv>) {
  return userClient(c.env, c.var.auth.jwt);
}

function billLinesToJson(lines: SupplierBillDraftInput["lines"]) {
  return lines.map((l) => ({
    warehouse_receipt_id: l.warehouseReceiptId ?? null,
    po_line_id: l.poLineId ?? null,
    account_code: l.accountCode ?? null,
    description: l.description ?? null,
    sku: l.sku ?? null,
    qty: l.qty ?? null,
    unit_price: l.unitPrice ?? null,
    amount: l.amount ?? null,
    department_type: l.departmentType ?? null,
    department_id: l.departmentId ?? null,
  }));
}

function billArgs(billId: string | null, d: SupplierBillDraftInput) {
  return {
    p_bill_id: billId,
    p_supplier_id: d.supplierId,
    p_supplier_invoice_no: d.supplierInvoiceNo,
    p_bill_date: d.billDate,
    p_lines: billLinesToJson(d.lines),
    p_due_date: d.dueDate ?? null,
    p_ap_account_code: d.apAccountCode ?? null,
    p_narration: d.narration ?? null,
  };
}

function voucherArgs(voucherId: string | null, d: PaymentVoucherDraftInput) {
  return {
    p_voucher_id: voucherId,
    p_purpose: d.purpose,
    p_supplier_id: d.supplierId ?? null,
    p_payee_name: d.payeeName ?? null,
    p_voucher_date: d.voucherDate,
    p_pay_from_account_code: d.payFromAccountCode,
    p_lines: d.lines.map((l) => ({
      account_code: l.accountCode,
      description: l.description ?? null,
      amount: l.amount,
      department_type: l.departmentType ?? null,
      department_id: l.departmentId ?? null,
    })),
    p_allocations: d.allocations.map((a) => ({ bill_id: a.billId, amount: a.amount })),
    p_pay_method: d.payMethod,
    p_pay_reference: d.payReference ?? null,
    p_narration: d.narration ?? null,
    // Sent only when there is an advance. 0484's function defaults it to 0, and a
    // database without 0484 has no such parameter: a voucher with no advance
    // still saves in the time between this code going live and 0484 being applied.
    ...(d.advanceAmount ? { p_advance_amount: d.advanceAmount } : {}),
  };
}

// ── suppliers, accounts, what is owed ───────────────────────────────────────

payablesRouter.get("/suppliers", requireFinance, async (c) => {
  const { data, error } = await sb(c)
    .from("suppliers")
    .select("id, name, kind, terms_days")
    .order("name", { ascending: true });
  if (error) return pgFail(c, error);
  return c.json({ rows: data ?? [] });
});

payablesRouter.post("/other-creditors", requireFinance, async (c) => {
  const body = await parseJsonBody(c, otherCreditorInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await sb(c).rpc("supplier_other_creditor_create", {
    p_name: body.data.name,
    p_contact: body.data.contact ?? null,
    p_contact_email: body.data.contactEmail ?? null,
  });
  if (error) return pgFail(c, error);
  return c.json({ id: data as string });
});

payablesRouter.get("/accounts", requireFinance, async (c) => {
  const { data, error } = await sb(c).rpc("ap_account_choices");
  if (error) return pgFail(c, error);
  return c.json({ rows: data ?? [] });
});

payablesRouter.get("/outstanding", requireFinance, async (c) => {
  const f = supplierFilter(c);
  if (!f.ok) return badId(c, "supplier");
  const { data, error } = await sb(c).rpc("ap_outstanding", { p_supplier_id: f.value });
  if (error) return pgFail(c, error);
  return c.json({ rows: data ?? [] });
});

payablesRouter.get("/bill-outstanding", requireFinance, async (c) => {
  const f = supplierFilter(c);
  if (!f.ok) return badId(c, "supplier");
  const { data, error } = await sb(c).rpc("ap_bill_outstanding", { p_supplier_id: f.value });
  if (error) return pgFail(c, error);
  return c.json({ rows: data ?? [] });
});

// ── bills ───────────────────────────────────────────────────────────────────

payablesRouter.get("/bills", requireFinance, async (c) => {
  const f = departmentQuery(c);
  if (!f.ok) return f.res;
  const { data, error } = await sb(c).rpc("supplier_bill_register");
  if (error) return pgFail(c, error);
  const kept = await keepByDepartment(sb(c), BILL_LINES, (data ?? []) as Array<{ id: string }>, (r) => r.id, f.value);
  if ("error" in kept) return pgFail(c, kept.error);
  return c.json({ rows: kept.rows });
});

payablesRouter.get("/bills/grn-candidates", requireFinance, async (c) => {
  const f = supplierFilter(c);
  if (!f.ok) return badId(c, "supplier");
  const { data, error } = await sb(c).rpc("supplier_bill_grn_candidates", { p_supplier_id: f.value });
  if (error) return pgFail(c, error);
  // 0530 — each GRN carries its PO's payment terms, so the bill form can fill
  // in the due date. One read for all the POs on the list.
  const rows = (data ?? []) as Array<{ po_id: string }>;
  const poIds = [...new Set(rows.map((r) => r.po_id))];
  const terms = new Map<string, number | null>();
  if (poIds.length) {
    const po = await sb(c).from("purchase_orders").select("id, terms_days").in("id", poIds);
    if (po.error) return pgFail(c, po.error);
    for (const p of po.data ?? []) terms.set(p.id as string, (p.terms_days as number | null) ?? null);
  }
  return c.json({ rows: rows.map((r) => ({ ...r, po_terms_days: terms.get(r.po_id) ?? null })) });
});

payablesRouter.get("/bills/grn-lines/:receiptId", requireFinance, async (c) => {
  const receiptId = c.req.param("receiptId");
  if (!UUID_RE.test(receiptId)) return badId(c, "goods received note");
  const { data, error } = await sb(c).rpc("supplier_bill_grn_lines", { p_receipt_id: receiptId });
  if (error) return pgFail(c, error);
  // 0540 (DEPT-6): each GRN line's default department, from its sales orders.
  const rows = (data ?? []) as Array<{ po_line_id?: string | null }>;
  const polIds = [...new Set(rows.map((r) => r.po_line_id).filter((x): x is string => !!x))];
  const dept = new Map<string, Record<string, unknown>>();
  if (polIds.length) {
    const d = await sb(c).from("fin_po_line_departments").select("po_line_id, department_type, department_id").in("po_line_id", polIds);
    if (d.error) return pgFail(c, d.error);
    for (const r of d.data ?? []) dept.set(r.po_line_id, r);
  }
  return c.json({ rows: rows.map((r) => ({ department_type: null, department_id: null, ...r, ...dept.get(r.po_line_id ?? "") })) });
});

payablesRouter.get("/bills/:id", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c, "bill");
  const { data, error } = await sb(c).rpc("supplier_bill_document", { p_bill_id: id });
  if (error) return pgFail(c, error);
  if (!data) return c.json({ error: "not_found", code: "bill_missing", message: "That bill does not exist." }, 404);
  const merged = await withLineDepartments(sb(c), BILL_LINES, id, data);
  if ("error" in merged) return pgFail(c, merged.error);
  return c.json(merged.doc);
});

payablesRouter.post("/bills", requireFinance, async (c) => {
  const body = await parseJsonBody(c, supplierBillDraftInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await sb(c).rpc("supplier_bill_save_draft", billArgs(null, body.data));
  if (error) return pgFail(c, error);
  return c.json({ id: data as string }, 201);
});

payablesRouter.put("/bills/:id", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c, "bill");
  const body = await parseJsonBody(c, supplierBillDraftInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await sb(c).rpc("supplier_bill_save_draft", billArgs(id, body.data));
  if (error) return pgFail(c, error);
  return c.json({ id: data as string });
});

payablesRouter.post("/bills/:id/confirm", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c, "bill");
  const { error } = await sb(c).rpc("supplier_bill_confirm", { p_bill_id: id });
  if (error) return pgFail(c, error);
  return c.json({ id });
});

payablesRouter.post("/bills/:id/cancel", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c, "bill");
  const body = await parseJsonBody(c, apReasonInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { error } = await sb(c).rpc("supplier_bill_cancel", { p_bill_id: id, p_reason: body.data.reason });
  if (error) return pgFail(c, error);
  return c.json({ id });
});

// ── payment vouchers ────────────────────────────────────────────────────────

payablesRouter.get("/vouchers", requireFinance, async (c) => {
  const f = departmentQuery(c);
  if (!f.ok) return f.res;
  const { data, error } = await sb(c).rpc("payment_voucher_register");
  if (error) return pgFail(c, error);
  const kept = await keepByDepartment(sb(c), VOUCHER_LINES, (data ?? []) as Array<{ id: string }>, (r) => r.id, f.value);
  if ("error" in kept) return pgFail(c, kept.error);
  return c.json({ rows: kept.rows });
});

payablesRouter.get("/vouchers/:id", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c, "payment voucher");
  const { data, error } = await sb(c).rpc("payment_voucher_document", { p_voucher_id: id });
  if (error) return pgFail(c, error);
  if (!data) {
    return c.json({ error: "not_found", code: "voucher_missing", message: "That payment voucher does not exist." }, 404);
  }
  const merged = await withLineDepartments(sb(c), VOUCHER_LINES, id, data);
  if ("error" in merged) return pgFail(c, merged.error);
  return c.json(merged.doc);
});

payablesRouter.post("/vouchers", requireFinance, async (c) => {
  const body = await parseJsonBody(c, paymentVoucherDraftInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await sb(c).rpc("payment_voucher_save_draft", voucherArgs(null, body.data));
  if (error) return pgFail(c, error);
  return c.json({ id: data as string }, 201);
});

payablesRouter.put("/vouchers/:id", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c, "payment voucher");
  const body = await parseJsonBody(c, paymentVoucherDraftInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await sb(c).rpc("payment_voucher_save_draft", voucherArgs(id, body.data));
  if (error) return pgFail(c, error);
  return c.json({ id: data as string });
});

const VOUCHER_STEPS = {
  prepare: "payment_voucher_prepare",
  check: "payment_voucher_check",
  approve: "payment_voucher_approve",
} as const;

for (const [step, fn] of Object.entries(VOUCHER_STEPS)) {
  payablesRouter.post(`/vouchers/:id/${step}`, requireFinance, async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return badId(c, "payment voucher");
    const { error } = await sb(c).rpc(fn, { p_voucher_id: id });
    if (error) return pgFail(c, error);
    return c.json({ id });
  });
}

for (const step of ["reject", "cancel"] as const) {
  payablesRouter.post(`/vouchers/:id/${step}`, requireFinance, async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return badId(c, "payment voucher");
    const body = await parseJsonBody(c, apReasonInput);
    if (!body.ok) return c.json(body.body, body.status);
    const { error } = await sb(c).rpc(`payment_voucher_${step}`, {
      p_voucher_id: id,
      p_reason: body.data.reason,
    });
    if (error) return pgFail(c, error);
    return c.json({ id });
  });
}

// ── supplier advances ───────────────────────────────────────────────────────

payablesRouter.get("/advances", requireFinance, async (c) => {
  const f = supplierFilter(c);
  if (!f.ok) return badId(c, "supplier");
  const { data, error } = await sb(c).rpc("supplier_advances", { p_supplier_id: f.value });
  if (error) return pgFail(c, error);
  return c.json({ rows: data ?? [] });
});

payablesRouter.post("/vouchers/:id/advance-applications", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c, "payment voucher");
  const body = await parseJsonBody(c, advanceApplyInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await sb(c).rpc("supplier_advance_apply", {
    p_voucher_id: id,
    p_bill_id: body.data.billId,
    p_amount: body.data.amount,
  });
  if (error) return pgFail(c, error);
  return c.json({ id: data as string }, 201);
});

payablesRouter.post("/advance-applications/:id/cancel", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c, "advance");
  const body = await parseJsonBody(c, apReasonInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { error } = await sb(c).rpc("supplier_advance_application_cancel", {
    p_application_id: id,
    p_reason: body.data.reason,
  });
  if (error) return pgFail(c, error);
  return c.json({ id });
});

payablesRouter.post("/vouchers/:id/money-back", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c, "payment voucher");
  const body = await parseJsonBody(c, moneyBackInput);
  if (!body.ok) return c.json(body.body, body.status);
  const d = body.data;
  const { data, error } = await sb(c).rpc("supplier_advance_money_back_record", {
    p_voucher_id: id,
    p_money_back_date: d.moneyBackDate,
    p_money_account_code: d.moneyAccountCode,
    p_amount: d.amount,
    p_reference: d.reference ?? null,
    p_narration: d.narration ?? null,
    p_idempotency_key: d.idempotencyKey ?? null,
  });
  if (error) return pgFail(c, error);
  return c.json({ id: data as string }, 201);
});

payablesRouter.post("/money-back/:id/cancel", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c, "money back");
  const body = await parseJsonBody(c, apReasonInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { error } = await sb(c).rpc("supplier_advance_money_back_cancel", {
    p_money_back_id: id,
    p_reason: body.data.reason,
  });
  if (error) return pgFail(c, error);
  return c.json({ id });
});

// ── files ───────────────────────────────────────────────────────────────────

const EXT: Record<z.infer<typeof apFileSignInput>["mimeType"], string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const DOC_ROUTES: ReadonlyArray<{ prefix: string; type: DocType; what: string }> = [
  { prefix: "/bills", type: "SUPPLIER_BILL", what: "bill" },
  { prefix: "/vouchers", type: "PAYMENT_VOUCHER", what: "payment voucher" },
];

for (const { prefix, type, what } of DOC_ROUTES) {
  // The Worker signs an upload for a path that names the document. The
  // storage insert policy (gl_may_read) runs against the USER's token, so a
  // signed-in dealer could not mint one even if this guard were missing.
  payablesRouter.post(`${prefix}/:id/files/sign`, requireFinance, async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return badId(c, what);
    const body = await parseJsonBody(c, apFileSignInput);
    if (!body.ok) return c.json(body.body, body.status);
    const path = `${type}/${id}/${crypto.randomUUID()}.${EXT[body.data.mimeType]}`;
    const { data, error } = await sb(c).storage.from(AP_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      return c.json({ error: "storage_failed", code: "storage_failed", message: error?.message ?? "Could not start the upload." }, 500);
    }
    return c.json({ bucket: AP_BUCKET, token: data.token, path: data.path });
  });

  // After the browser uploaded: record it. The database checks the path
  // belongs to this document and that the object is really in the bucket.
  payablesRouter.post(`${prefix}/:id/files`, requireFinance, async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return badId(c, what);
    const body = await parseJsonBody(c, apFileAddInput);
    if (!body.ok) return c.json(body.body, body.status);
    const { data, error } = await sb(c).rpc("ap_document_file_add", {
      p_document_type: type,
      p_document_id: id,
      p_storage_path: body.data.path,
      p_file_name: body.data.fileName,
      p_mime_type: body.data.mimeType,
      p_size_bytes: body.data.sizeBytes,
    });
    if (error) return pgFail(c, error);
    return c.json({ id: data as string }, 201);
  });
}

const filePathQuery = z
  .string()
  .max(400)
  .regex(/^(SUPPLIER_BILL|PAYMENT_VOUCHER)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i);

payablesRouter.get("/files/url", requireFinance, async (c) => {
  const parsed = filePathQuery.safeParse(c.req.query("path") ?? "");
  if (!parsed.success) {
    return c.json({ error: "invalid_input", code: "invalid_param", message: "That file path is not valid." }, 422);
  }
  // Signed with the USER's token: the storage select policy (gl_may_read)
  // decides, not the Worker.
  const { data, error } = await sb(c).storage.from(AP_BUCKET).createSignedUrl(parsed.data, 300);
  if (error || !data) {
    return c.json({ error: "not_found", code: "file_missing", message: "That file could not be opened." }, 404);
  }
  return c.json({ url: data.signedUrl });
});

export default payablesRouter;
