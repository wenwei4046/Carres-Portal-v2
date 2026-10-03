import { Hono, type Context, type MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { apFileAddInput, apFileSignInput } from "@carres/shared/schemas/finance-ap";
import {
  paymentRequestAnswerInput,
  paymentRequestInput,
  paymentRequestReturnInput,
  requestGrantInput,
  type PaymentRequestInput,
} from "@carres/shared/payment-requests";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/finance/payment-requests — staff ask Finance to pay a bill (migration
 * 0645; Chew 2026-10-03, docs/finance/MASTER.md §3.3).
 *
 *   GET  /me                      payment_request_me — may this person ask; are they Finance or the boss
 *   GET  /?all=1                  payment_request_register — their own; with all=1, Finance sees every request
 *   GET  /:id                     payment_request_document
 *   POST /                        payment_request_save (raise)
 *   PUT  /:id                     payment_request_save (change while waiting or returned)
 *   POST /:id/withdraw            payment_request_withdraw — the person who asked
 *   POST /:id/return {note}       payment_request_return — Finance, with a note the requester reads
 *   POST /:id/answer {voucherId | billId}   payment_request_answer — Finance links what it made
 *   POST /:id/files/sign · POST /:id/files   the bill: signed upload, then recorded
 *   GET  /files/url?path=         a short-lived link to read one file
 *   GET  /grants · PUT /grants/:userId {allowed}   who may ask; set by the boss
 *
 * Who may do what is the database's (every door checks its caller). This guard
 * only admits the staff the Finance pages are open to: Finance, the
 * principal and Operation.
 */
const router = new Hono<AppEnv>();

const BUCKET = "payment-request-files";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT: Record<z.infer<typeof apFileSignInput>["mimeType"], string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const requireRequestStaff: MiddlewareHandler<AppEnv> = async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "finance" && role !== "principal" && role !== "operation") {
    throw new HTTPException(403, { message: "Finance, Operation or Principal only" });
  }
  await next();
};
router.use("*", requireRequestStaff);

function sb(c: Context<AppEnv>) {
  return userClient(c.env, c.var.auth.jwt);
}

/** mapPgError, but a refusal keeps the database's reason code. */
function pgFail(c: Context<AppEnv>, error: { code?: string; message?: string; details?: string }) {
  const m = mapPgError(error);
  if (error.details && (m.status === 403 || m.status === 404 || m.status === 409 || m.status === 422)) {
    return c.json({ ...m.body, code: error.details }, m.status);
  }
  return c.json(m.body, m.status);
}

function badId(c: Context<AppEnv>) {
  return c.json({ error: "invalid_input", code: "invalid_param", message: "That payment request id is not valid." }, 422);
}

function saveArgs(id: string | null, d: PaymentRequestInput) {
  return {
    p_request_id: id,
    p_payee_name: d.payeeName,
    p_amount: d.amount,
    p_purpose: d.purpose,
    p_pay_by: d.payBy ?? null,
    p_note: d.note ?? null,
    p_bank_name: d.bankName ?? null,
    p_bank_account_no: d.bankAccountNo ?? null,
    p_bank_account_holder: d.bankAccountHolder ?? null,
    p_bill_no: d.billNo ?? null,
    p_bill_date: d.billDate ?? null,
  };
}

router.get("/me", async (c) => {
  const { data, error } = await sb(c).rpc("payment_request_me");
  if (error) return pgFail(c, error);
  return c.json(data);
});

router.get("/grants", async (c) => {
  const { data, error } = await sb(c).rpc("finance_request_grant_list");
  if (error) return pgFail(c, error);
  return c.json({ rows: data ?? [] });
});

router.put("/grants/:userId", async (c) => {
  const userId = c.req.param("userId");
  if (!UUID_RE.test(userId)) return badId(c);
  const body = await parseJsonBody(c, requestGrantInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { error } = await sb(c).rpc("finance_request_grant_set", { p_user_id: userId, p_allowed: body.data.allowed });
  if (error) return pgFail(c, error);
  return c.json({ ok: true });
});

const filePathQuery = z
  .string()
  .max(200)
  .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i);

router.get("/files/url", async (c) => {
  const parsed = filePathQuery.safeParse(c.req.query("path") ?? "");
  if (!parsed.success) {
    return c.json({ error: "invalid_input", code: "invalid_param", message: "That file path is not valid." }, 422);
  }
  // Signed with the USER's token: the bucket's select policy decides.
  const { data, error } = await sb(c).storage.from(BUCKET).createSignedUrl(parsed.data, 300);
  if (error || !data) {
    return c.json({ error: "not_found", code: "file_missing", message: "That file could not be opened." }, 404);
  }
  return c.json({ url: data.signedUrl });
});

router.get("/", async (c) => {
  const { data, error } = await sb(c).rpc("payment_request_register", { p_all: c.req.query("all") === "1" });
  if (error) return pgFail(c, error);
  return c.json({ rows: data ?? [] });
});

router.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c);
  const { data, error } = await sb(c).rpc("payment_request_document", { p_request_id: id });
  if (error) return pgFail(c, error);
  return c.json(data);
});

router.post("/", async (c) => {
  const body = await parseJsonBody(c, paymentRequestInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await sb(c).rpc("payment_request_save", saveArgs(null, body.data));
  if (error) return pgFail(c, error);
  return c.json({ id: data as string }, 201);
});

router.put("/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c);
  const body = await parseJsonBody(c, paymentRequestInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { error } = await sb(c).rpc("payment_request_save", saveArgs(id, body.data));
  if (error) return pgFail(c, error);
  return c.json({ id });
});

router.post("/:id/withdraw", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c);
  const { error } = await sb(c).rpc("payment_request_withdraw", { p_request_id: id });
  if (error) return pgFail(c, error);
  return c.json({ id });
});

router.post("/:id/return", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c);
  const body = await parseJsonBody(c, paymentRequestReturnInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { error } = await sb(c).rpc("payment_request_return", { p_request_id: id, p_note: body.data.note });
  if (error) return pgFail(c, error);
  return c.json({ id });
});

router.post("/:id/answer", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c);
  const body = await parseJsonBody(c, paymentRequestAnswerInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { error } = await sb(c).rpc("payment_request_answer", {
    p_request_id: id, p_voucher_id: body.data.voucherId ?? null, p_bill_id: body.data.billId ?? null,
  });
  if (error) return pgFail(c, error);
  return c.json({ id });
});

router.post("/:id/files/sign", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c);
  const body = await parseJsonBody(c, apFileSignInput);
  if (!body.ok) return c.json(body.body, body.status);
  const path = `${id}/${crypto.randomUUID()}.${EXT[body.data.mimeType]}`;
  // The USER's token: the bucket's insert policy (payment_request_may_attach) decides.
  const { data, error } = await sb(c).storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return c.json({ error: "storage_failed", code: "storage_failed", message: "Could not start the upload. Try again." }, 500);
  }
  return c.json({ bucket: BUCKET, token: data.token, path: data.path });
});

router.post("/:id/files", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return badId(c);
  const body = await parseJsonBody(c, apFileAddInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await sb(c).rpc("payment_request_file_add", {
    p_request_id: id,
    p_storage_path: body.data.path,
    p_file_name: body.data.fileName,
    p_mime_type: body.data.mimeType,
    p_size_bytes: body.data.sizeBytes,
  });
  if (error) return pgFail(c, error);
  return c.json({ id: data as string }, 201);
});

export default router;
