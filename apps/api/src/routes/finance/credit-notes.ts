import { Hono } from "hono";
import { orderMoney } from "@carres/shared";
import {
  creditNoteIssueInput,
  creditNoteVoidInput,
  type CreditNotePrintData,
  type CreditNoteRow,
} from "@carres/shared/schemas/finance-credit-note";
import { requireFinance } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { adminClient, userClient } from "../../lib/supabase";
import { expireOpenCheckoutLinks, stripeClient, stripeConfigured } from "../../lib/stripe";
import type { AppEnv } from "../../types";

/**
 * FINANCE · CREDIT NOTES — the one door that issues a credit note (0730).
 *
 *   GET  /                 the register (?invoiceId= or ?orderId= narrows it)
 *   POST /                 issue one against a Sales Invoice
 *   POST /:id/void         void it (the journal is reversed, the credit comes back)
 *   GET  /:id/print-data   what the paper prints
 *
 * Finance and principal only, twice: `requireFinance` here and the role check
 * inside `issue_credit_note` / `void_credit_note`. Both functions post through
 * `gl_post` / `gl_reverse`, so the ledger's own refusals (go-live date, closed
 * month, out-of-balance) reach the screen as the database's sentence.
 *
 * Carres does not refund (payment/MASTER.md §13). A credit that is more than
 * the order still owes would leave the customer overpaid, which is money to
 * hand back, so it is refused here with the sentence that says where that goes.
 */
const financeCreditNotesRouter = new Hono<AppEnv>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOTE_SELECT =
  "id,credit_note_no,invoice_id,order_id,amount,reason,note_date,status,void_reason,created_at," +
  "invoices(invoice_no),orders(so,customer_name)";

type Raw = {
  id: string; credit_note_no: string; invoice_id: string; order_id: string; amount: number | string;
  reason: string; note_date: string; status: "issued" | "voided"; void_reason: string | null; created_at: string;
  invoices: { invoice_no: string | null } | null;
  orders: { so: number | null; customer_name: string | null } | null;
};

const toRow = (r: Raw): CreditNoteRow => ({
  id: r.id, credit_note_no: r.credit_note_no, invoice_id: r.invoice_id,
  invoice_no: r.invoices?.invoice_no ?? null, order_id: r.order_id,
  so: r.orders?.so ?? null, customer_name: r.orders?.customer_name ?? null,
  amount: Number(r.amount), reason: r.reason, note_date: r.note_date,
  status: r.status, void_reason: r.void_reason, created_at: r.created_at,
});

financeCreditNotesRouter.get("/", requireFinance, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const q = new URL(c.req.url).searchParams;
  let query = sb.from("sales_credit_notes").select(NOTE_SELECT).order("created_at", { ascending: false }).limit(500);
  const invoiceId = q.get("invoiceId");
  const orderId = q.get("orderId");
  if (invoiceId) {
    if (!UUID_RE.test(invoiceId)) return c.json({ error: "invalid_id", code: "invalid_param", message: "invoiceId must be a uuid" }, 422);
    query = query.eq("invoice_id", invoiceId);
  }
  if (orderId) {
    if (!UUID_RE.test(orderId)) return c.json({ error: "invalid_id", code: "invalid_param", message: "orderId must be a uuid" }, 422);
    query = query.eq("order_id", orderId);
  }
  const { data, error } = await query;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(((data ?? []) as unknown as Raw[]).map(toRow));
});

financeCreditNotesRouter.post("/", requireFinance, async (c) => {
  const body = await parseJsonBody(c, creditNoteIssueInput);
  if (!body.ok) return c.json(body.body, body.status);
  const input = body.data;
  const sb = userClient(c.env, c.var.auth.jwt);

  // What the order still owes, by the ONE arithmetic. A credit above it would
  // leave the customer overpaid, and Carres does not refund.
  const invQuery = sb
    .from("invoices")
    .select("id,invoice_no,orders(paid,credited,order_lines(qty,unit_price),order_addons(qty,unit_price),ops_order_control(balance))");
  const { data: inv, error: invErr } = await (input.invoiceId
    ? invQuery.eq("id", input.invoiceId)
    : invQuery.eq("invoice_no", input.invoiceNo!)).maybeSingle();
  if (invErr) {
    const m = mapPgError(invErr);
    return c.json(m.body, m.status);
  }
  if (!inv) return c.json({ error: "not_found", code: "not_found", message: "Invoice not found. Check the invoice number." }, 404);
  const invoiceId = (inv as unknown as { id: string }).id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ord: any = Array.isArray((inv as any).orders) ? (inv as any).orders[0] : (inv as any).orders;
  const ctrl = Array.isArray(ord?.ops_order_control) ? ord.ops_order_control[0] : ord?.ops_order_control;
  const money = orderMoney({
    lineSum: (ord?.order_lines ?? []).reduce((s: number, l: { qty: number; unit_price: number | null }) => s + Number(l.qty) * Number(l.unit_price ?? 0), 0),
    addonSum: (ord?.order_addons ?? []).reduce((s: number, a: { qty: number; unit_price: number | null }) => s + Number(a.qty) * Number(a.unit_price ?? 0), 0),
    paid: ord?.paid,
    credited: ord?.credited,
    controlBalance: ctrl?.balance ?? null,
  });
  if (money.known && input.amount > money.goodsOwing + 0.001) {
    return c.json({
      error: "rule_violation", code: "credit_exceeds_owing",
      message: `The customer still owes RM ${money.goodsOwing.toFixed(2)} on this order, so a credit note can be at most that. ` +
        "Carres does not refund. If money has to go back to the customer, it runs through a Service Case and a Management decision.",
    }, 422);
  }

  const { data, error } = await sb.rpc("issue_credit_note", {
    p_invoice_id: invoiceId,
    p_amount: input.amount,
    p_reason: input.reason,
    p_note_date: input.noteDate ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // An open payment link was minted for the old balance; paying it would
  // overpay. Best effort: the credit note itself is already posted.
  if (stripeConfigured(c.env)) {
    await expireOpenCheckoutLinks(stripeClient(c.env), adminClient(c.env), (data as { order_id: string }).order_id).catch(() => false);
  }
  return c.json(data, 201);
});

financeCreditNotesRouter.post("/:id/void", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "invalid_id", code: "invalid_param", message: "credit note id must be a uuid" }, 422);
  const body = await parseJsonBody(c, creditNoteVoidInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("void_credit_note", { p_id: id, p_reason: body.data.reason });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

financeCreditNotesRouter.get("/:id/print-data", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "invalid_id", code: "invalid_param", message: "credit note id must be a uuid" }, 422);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.from("sales_credit_notes").select(NOTE_SELECT).eq("id", id).maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) return c.json({ error: "not_found", code: "not_found", message: "Credit note not found." }, 404);
  const r = toRow(data as unknown as Raw);
  const out: CreditNotePrintData = {
    credit_note_no: r.credit_note_no, note_date: r.note_date, invoice_no: r.invoice_no,
    order_code: r.so != null ? `SO-${r.so}` : null, customer_name: r.customer_name,
    amount: r.amount, reason: r.reason, voided: r.status === "voided", void_reason: r.void_reason, currency: "RM",
  };
  return c.json(out);
});

export default financeCreditNotesRouter;
