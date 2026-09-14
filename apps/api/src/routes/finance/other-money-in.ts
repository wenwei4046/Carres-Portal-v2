import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  financePartyInput,
  financePartyUpdateInput,
  moneyInCancelInput,
  otherDebtorInvoiceInput,
  otherReceiptInput,
} from "@carres/shared/other-money-in";
import { requireFinance } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Finance · money in that is not a sale (migration 0478).
 *
 * Mounted at `/api/finance/other-money-in`, above the `/finance` catch-all.
 * Every write is ONE security-definer RPC that checks its caller itself (law
 * of 0468: the document decides who, the ledger decides what); `requireFinance`
 * is the HTTP mirror. `userClient` forwards the caller's JWT — never the
 * service role — so `auth.uid()` inside the RPC is the person who pressed.
 *
 *   GET    /me                       may this person cancel? (the finance approver)
 *   GET    /accounts                 which accounts each form may offer
 *   GET    /parties                  every party, with what it owes
 *   POST   /parties                  add a party
 *   PATCH  /parties/:id              edit a party (retiring one that owes is refused)
 *   GET    /invoices                 the other debtor invoice register
 *   POST   /invoices                 save a draft (issue: true issues it too)
 *   GET    /invoices/:id             one invoice, its lines and its receipts
 *   PUT    /invoices/:id             edit a draft (issue: true issues it too)
 *   POST   /invoices/:id/issue       issue — posts Dr 1240 / Cr each line
 *   POST   /invoices/:id/cancel      cancel — a draft stops; an issued one reverses
 *   GET    /receipts                 the receipt register
 *   POST   /receipts                 record a receipt — posts at once
 *   GET    /receipts/:id             one receipt, its lines and its invoices
 *   POST   /receipts/:id/void        cancel a receipt — reverses its entry
 *
 * A database refusal keeps its own sentence: 42501 → 403, P0002 → 404,
 * 22023 → 422, P0001 → 422 with the rule's code. A malformed id is a missing
 * row (404), never a 500.
 */
const financeOtherMoneyInRouter = new Hono<AppEnv>();

const uuid = z.string().uuid();

function fail(c: Context<AppEnv>, error: { code?: string; message?: string; details?: string }) {
  const m = mapPgError(error);
  return c.json(m.body, m.status);
}

function notFound(c: Context<AppEnv>, what: string) {
  return c.json({ error: "not_found", code: "not_found", message: `${what} not found.` }, 404);
}

financeOtherMoneyInRouter.get("/me", requireFinance, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("has_finance_approver", { p_user_id: auth.id });
  if (error) return fail(c, error);
  return c.json({ mayCancel: data === true });
});

financeOtherMoneyInRouter.get("/accounts", requireFinance, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("fin_money_in_account_options");
  if (error) return fail(c, error);
  return c.json(data ?? []);
});

/* ── parties ───────────────────────────────────────────────────────────────── */

financeOtherMoneyInRouter.get("/parties", requireFinance, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("other_debtor_outstanding", { p_party_id: null });
  if (error) return fail(c, error);
  return c.json(data ?? []);
});

financeOtherMoneyInRouter.post("/parties", requireFinance, async (c) => {
  const body = await parseJsonBody(c, financePartyInput);
  if (!body.ok) return c.json(body.body, body.status);
  const p = body.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("finance_party_create", {
    p_name: p.name,
    p_kind: p.kind,
    p_registration_no: p.registration_no ?? null,
    p_phone: p.phone ?? null,
    p_email: p.email ?? null,
    p_address: p.address ?? null,
    p_notes: p.notes ?? null,
  });
  if (error) return fail(c, error);
  return c.json({ id: data as string }, 201);
});

financeOtherMoneyInRouter.patch("/parties/:id", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!uuid.safeParse(id).success) return notFound(c, "Party");
  const body = await parseJsonBody(c, financePartyUpdateInput);
  if (!body.ok) return c.json(body.body, body.status);
  const p = body.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("finance_party_update", {
    p_party_id: id,
    p_name: p.name,
    p_kind: p.kind,
    p_registration_no: p.registration_no ?? null,
    p_phone: p.phone ?? null,
    p_email: p.email ?? null,
    p_address: p.address ?? null,
    p_notes: p.notes ?? null,
    p_is_active: p.is_active,
  });
  if (error) return fail(c, error);
  return c.json({ id: data as string });
});

/* ── other debtor invoices ─────────────────────────────────────────────────── */

financeOtherMoneyInRouter.get("/invoices", requireFinance, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("other_debtor_invoice_list", { p_party_id: null });
  if (error) return fail(c, error);
  return c.json(data ?? []);
});

function invoiceArgs(p: z.infer<typeof otherDebtorInvoiceInput>) {
  return {
    p_party_id: p.party_id,
    p_invoice_date: p.invoice_date,
    p_lines: p.lines.map((l) => ({
      account_code: l.account_code,
      description: l.description ?? null,
      amount: l.amount,
    })),
    p_due_date: p.due_date ?? null,
    p_reference: p.reference ?? null,
    p_narration: p.narration ?? null,
    p_issue: p.issue ?? false,
  };
}

financeOtherMoneyInRouter.post("/invoices", requireFinance, async (c) => {
  const body = await parseJsonBody(c, otherDebtorInvoiceInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("other_debtor_invoice_create", invoiceArgs(body.data));
  if (error) return fail(c, error);
  return c.json({ id: data as string }, 201);
});

financeOtherMoneyInRouter.get("/invoices/:id", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!uuid.safeParse(id).success) return notFound(c, "Invoice");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("other_debtor_invoice_detail", { p_invoice_id: id });
  if (error) return fail(c, error);
  return c.json(data);
});

financeOtherMoneyInRouter.put("/invoices/:id", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!uuid.safeParse(id).success) return notFound(c, "Invoice");
  const body = await parseJsonBody(c, otherDebtorInvoiceInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("other_debtor_invoice_update", {
    p_invoice_id: id,
    ...invoiceArgs(body.data),
  });
  if (error) return fail(c, error);
  return c.json({ id: data as string });
});

financeOtherMoneyInRouter.post("/invoices/:id/issue", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!uuid.safeParse(id).success) return notFound(c, "Invoice");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("other_debtor_invoice_issue", { p_invoice_id: id });
  if (error) return fail(c, error);
  return c.json({ id, entryId: data as string });
});

financeOtherMoneyInRouter.post("/invoices/:id/cancel", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!uuid.safeParse(id).success) return notFound(c, "Invoice");
  const body = await parseJsonBody(c, moneyInCancelInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("other_debtor_invoice_cancel", {
    p_invoice_id: id,
    p_reason: body.data.reason,
  });
  if (error) return fail(c, error);
  return c.json({ id, reversalEntryId: (data as string | null) ?? null });
});

/* ── receipts ──────────────────────────────────────────────────────────────── */

financeOtherMoneyInRouter.get("/receipts", requireFinance, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("other_receipt_list");
  if (error) return fail(c, error);
  return c.json(data ?? []);
});

financeOtherMoneyInRouter.post("/receipts", requireFinance, async (c) => {
  const body = await parseJsonBody(c, otherReceiptInput);
  if (!body.ok) return c.json(body.body, body.status);
  const r = body.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("other_receipt_create", {
    p_receipt_date: r.receipt_date,
    p_money_account_code: r.money_account_code,
    p_lines: r.lines.map((l) => ({
      account_code: l.account_code,
      description: l.description ?? null,
      amount: l.amount,
    })),
    p_allocations: r.allocations.map((a) => ({ invoice_id: a.invoice_id, amount: a.amount })),
    p_party_id: r.party_id ?? null,
    p_payer_name: r.payer_name ?? null,
    p_reference: r.reference ?? null,
    p_narration: r.narration ?? null,
    p_idempotency_key: r.idempotency_key,
  });
  if (error) return fail(c, error);
  return c.json({ id: data as string }, 201);
});

financeOtherMoneyInRouter.get("/receipts/:id", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!uuid.safeParse(id).success) return notFound(c, "Receipt");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("other_receipt_detail", { p_receipt_id: id });
  if (error) return fail(c, error);
  return c.json(data);
});

financeOtherMoneyInRouter.post("/receipts/:id/void", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!uuid.safeParse(id).success) return notFound(c, "Receipt");
  const body = await parseJsonBody(c, moneyInCancelInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("other_receipt_void", {
    p_receipt_id: id,
    p_reason: body.data.reason,
  });
  if (error) return fail(c, error);
  return c.json({ id, reversalEntryId: data as string });
});

export default financeOtherMoneyInRouter;
