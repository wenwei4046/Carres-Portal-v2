import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { collectionOutcomeInput } from "@carres/shared/payment-collection-outcome";
import { storageHold } from "@carres/shared";
import { storageSkuCategories } from "../../lib/sku-categories";
import {
  GUARANTEE_ENTITLEMENTS,
  GUARANTEE_TERMS,
  financeInvoiceIssueInput,
  financeInvoiceVoidInput,
  invoicesListQuery,
} from "@carres/shared";
import {
  invoicePrepareInput,
  invoiceRegisterQuery,
  invoiceVoidReplaceInput,
  recordMessageInput,
  soRemaining,
  type InvoiceRegisterRow,
} from "@carres/shared/payment-invoice-register";
import { orderMoney } from "@carres/shared/order-money";
import { requireFinance } from "../../lib/auth-guards";
// renderInvoicePdf removed — see file header note re: Workers WASM limit.
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { InvoiceTemplateData } from "../../lib/pdf/types";
import type { AppEnv } from "../../types";

/**
 * Phase 5 Chunk A — Finance · Invoices router.
 *
 * Spec: docs/superpowers/specs/2026-05-08-phase-5-finance-spec.md §5.2.
 *
 * Mounted at `/api/finance/invoices`. Three routes:
 *   GET   /                  list invoices (filters: status, dealerId, from, to).
 *                            Status is derived in the route from voided_at +
 *                            order.paid vs invoice.amount.
 *   POST  /issue             gates on orders.status='delivered' (Q2=A locked
 *                            2026-05-08: manual click only). Calls existing
 *                            `invoice_issue(order_id, amount, tax_amount)` RPC
 *                            from migration 0003.
 *   POST  /:id/void          stamps invoices.voided_at=current_date + records
 *                            audit_log entry. Reason required (min 1 char).
 *
 * The issue route's "delivered" gate is at the route layer, not the RPC,
 * because invoice_issue (0003:289) only enforces role — adding a status
 * check would require a 0017 superseding migration. Route gate lets us
 * stay backward-compatible with dealer-side flows that may still call
 * invoice_issue directly through other paths.
 *
 * Chunk C: GET /:id/pdf renders the tax-invoice PDF server-side via
 * @react-pdf/renderer (Q7=A locked). Gated on invoice issued + order
 * delivered + paid >= total — same logic as the AR drawer's Issue button.
 */
const financeInvoicesRouter = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// 0429 — the Invoices Register and the invoice lifecycle doors
// (docs/payment/MASTER.md §4 · §16). The Register returns SOURCE facts; the
// shared payment-invoice-register module derives Needed / Goods / Payment
// Timing with the one governed arithmetic. A failed source read refuses —
// it never reports an empty register.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INVOICE_REGISTER_SELECT =
  "id,invoice_no,status,kind,amount,tax_amount,issued_at,voided_at,void_reason," +
  "replaces_invoice_id,created_at,order_id," +
  "orders(id,so,customer_name,customer_phone,source_ref,status,paid,delivery_date,delivery_date_tbd,delivered_at," +
  "ops_assigned_logistic,delivery_partners!orders_delivery_partner_id_fkey(name,contact)," +
  // §5 likely-duplicate: the comparison needs the reference and the method
  // beside the amount and the paid date, so the operator inspects the RIGHT
  // earlier payment instead of guessing from a figure alone.
  "order_payments(id,receipt_no,amount,paid_on,voided_at,reference,method)," +
  "payment_communications(id,kind,message_text,template_key,sent_screenshot_url,recorded_at)," +
  "order_lines(sku,qty,unit_price),order_addons(qty,unit_price)," +
  "ops_order_control(balance,confirmed_date,line_etas,line_stock_status,"
  // The 2026-09-08 correction: the Payment screens must see the LEGACY
  // C9 storage fee too, or they disagree with Work and the gate on a
  // pure-legacy order. The columns ride the wire; the shared
  // `storageHold` turns them into the one figure, server-side below.
  "storage_from,storage_fee_override,storage_fee_msbf,storage_fee_sof,"
  "storage_collected_at,storage_waiver_status))";

financeInvoicesRouter.get("/register", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "finance", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "You cannot view invoices." });
  }
  const parsed = invoiceRegisterQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ message: "Choose a valid invoice range." }, 422);
  const { offset, limit } = parsed.data;
  const sb = userClient(c.env, auth.jwt);
  const { data, error, count } = await sb
    .from("invoices")
    .select(INVOICE_REGISTER_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error || count == null || data == null) {
    throw new HTTPException(500, { message: "Invoices could not be loaded. Try again." });
  }
  const rows = data as unknown as Array<Record<string, unknown>>;
  await attachLegacyStorage(sb, rows);
  return c.json({ rows, total: count });
});

/**
 * The legacy C9 storage figure, derived server-side through the SAME shared
 * `storageHold` the Work engine and the booking gate use (Law D), once per
 * order — the catalog read is batched over every SKU in the set. Attached as a
 * source fact so `soRemaining` can add it without a second arithmetic anywhere.
 *
 * Every reader of these rows goes through here, so the register and the
 * customer statement can never disagree about one order's storage.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function attachLegacyStorage(sb: any, rows: Array<Record<string, unknown>>) {
  const allSkus = new Set<string>();
  for (const r of rows) {
    const o = r.orders as { order_lines?: Array<{ sku?: string }> } | null;
    for (const l of o?.order_lines ?? []) if (l.sku) allSkus.add(String(l.sku));
  }
  const categories = await storageSkuCategories(sb, [...allSkus]);
  const today = new Date().toISOString().slice(0, 10);
  const legacyByOrder = new Map<string, number>();
  for (const r of rows) {
    const o = r.orders as {
      id?: string;
      order_lines?: Array<{ sku?: string }>;
      ops_order_control?: Array<Record<string, unknown>> | Record<string, unknown> | null;
    } | null;
    if (!o?.id || legacyByOrder.has(o.id)) continue;
    const raw = o.ops_order_control;
    const ctrl = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
    if (!ctrl) { legacyByOrder.set(o.id, 0); continue; }
    legacyByOrder.set(o.id, storageHold({
      storageFrom: (ctrl.storage_from as string | null) ?? null,
      override: (ctrl.storage_fee_override as number | string | null) ?? null,
      importedMsbf: (ctrl.storage_fee_msbf as number | string | null) ?? null,
      importedSof: (ctrl.storage_fee_sof as number | string | null) ?? null,
      skus: (o.order_lines ?? []).map((l) => String(l.sku ?? "")),
      categories,
      asOf: today,
      collectedAt: (ctrl.storage_collected_at as string | null) ?? null,
      waiverStatus: (ctrl.storage_waiver_status as string | null) ?? null,
    }).owing);
  }
  for (const r of rows) {
    const o = r.orders as { id?: string; legacy_storage_owing?: number } | null;
    if (o?.id) o.legacy_storage_owing = legacyByOrder.get(o.id) ?? 0;
  }
}

/**
 * GET /statement/:orderId — the ONE read-only customer statement (§11).
 *
 * §11, verbatim: "One read-only customer statement derives invoices,
 * allocations, payments, voids and amount needed."
 *
 * DERIVES is the operative word. Nothing here is stored or summed a second
 * time: the invoices and payments are the canonical rows, and the amount still
 * needed comes from the SAME shared `soRemaining` the Calendar, the Reports and
 * the Invoice object read (Law D). A statement that computed its own total
 * would be a second arithmetic, and the first thing to disagree with the gate.
 *
 * It spans the CUSTOMER, not the order in front of you — one customer holding
 * several SOs is normal here, and a statement that showed one of them is not a
 * statement. The customer is matched the way §5's duplicate check matches one:
 * the same phone digits when both orders carry a usable one, else the same
 * name.
 *
 * Read-only. There is no action on it, by §11's own word.
 */
financeInvoicesRouter.get("/statement/:orderId", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "finance", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "You cannot view customer statements." });
  }
  const anchorId = c.req.param("orderId");
  if (!UUID_RE.test(anchorId)) {
    return c.json({ error: "invalid_id", code: "invalid_param", message: "order id must be a uuid" }, 422);
  }
  const sb = userClient(c.env, auth.jwt);
  const { data: anchor, error: anchorErr } = await sb
    .from("orders")
    .select("id,so,customer_name,customer_phone")
    .eq("id", anchorId)
    .maybeSingle();
  if (anchorErr) {
    const m = mapPgError(anchorErr);
    return c.json(m.body, m.status);
  }
  if (!anchor) {
    return c.json({ error: "not_found", code: "not_found", message: "Order not found." }, 404);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const who: any = anchor;
  const digits = String(who.customer_phone ?? "").replace(/[^0-9]/g, "");
  const name = String(who.customer_name ?? "").trim().toUpperCase();

  let siblings = sb.from("orders").select("id");
  if (digits.length >= 7) siblings = siblings.eq("customer_phone", who.customer_phone);
  else if (name !== "") siblings = siblings.eq("customer_name", who.customer_name);
  else siblings = siblings.eq("id", anchorId);
  const { data: sibRows, error: sibErr } = await siblings;
  if (sibErr) {
    const m = mapPgError(sibErr);
    return c.json(m.body, m.status);
  }
  const orderIds = [...new Set([anchorId, ...(sibRows ?? []).map((r: { id: string }) => r.id)])];

  const { data: invData, error: invErr } = await sb
    .from("invoices")
    .select(INVOICE_REGISTER_SELECT)
    .in("order_id", orderIds)
    .order("created_at", { ascending: false });
  if (invErr) {
    const m = mapPgError(invErr);
    return c.json(m.body, m.status);
  }
  const rows = (invData ?? []) as unknown as Array<Record<string, unknown>>;
  await attachLegacyStorage(sb, rows);
  const registerRows = rows as unknown as InvoiceRegisterRow[];

  const { data: allocData, error: allocErr } = await sb
    .from("payment_allocations")
    .select("id,payment_id,order_id,invoice_id,amount,allocated_at,voided_at,void_reason")
    .in("order_id", orderIds)
    .order("allocated_at", { ascending: false });
  if (allocErr) {
    const m = mapPgError(allocErr);
    return c.json(m.body, m.status);
  }

  // One block per Sales Order this customer holds, each with the money the ONE
  // arithmetic says is still needed on it. An order whose price nobody recorded
  // says so — it never prints a confident RM 0.
  const bySo = orderIds.map((id) => {
    const mine = registerRows.filter((r) => r.order_id === id);
    const money = soRemaining(registerRows, id);
    const order = mine[0]?.orders ?? null;
    return {
      order_id: id,
      so: order?.so ?? null,
      known: money.known,
      still_needed: money.known ? money.outstanding : null,
      storage_owing: money.storageOwing,
      overpaid: money.overpaid,
      invoices: mine.map((r) => ({
        id: r.id, invoice_no: r.invoice_no, kind: r.kind, status: r.status,
        amount: r.amount, tax_amount: r.tax_amount, issued_at: r.issued_at,
        voided_at: r.voided_at, void_reason: r.void_reason,
        replaces_invoice_id: r.replaces_invoice_id,
      })),
      payments: (order?.order_payments ?? []).map((p) => ({
        id: p.id, receipt_no: p.receipt_no, amount: p.amount, paid_on: p.paid_on,
        method: p.method ?? null, reference: p.reference ?? null, voided_at: p.voided_at,
      })),
    };
  }).filter((block) => block.invoices.length > 0 || block.payments.length > 0);

  return c.json({
    customer: { name: who.customer_name ?? null, phone: who.customer_phone ?? null },
    matched_on: digits.length >= 7 ? "phone" : name !== "" ? "name" : "order",
    orders: bySo,
    allocations: allocData ?? [],
  });
});

/** The draft door. The invoice asks for the order's money, so the amount is
 *  the ONE orderMoney total — computed here from the order's own stores and
 *  refused honestly when nothing on record prices the order. */
financeInvoicesRouter.post("/prepare", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "finance", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "You cannot prepare invoices." });
  }
  const body = await parseJsonBody(c, invoicePrepareInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, auth.jwt);
  const { data: order, error: ordErr } = await sb
    .from("orders")
    .select("id,paid,order_lines(qty,unit_price),order_addons(qty,unit_price),ops_order_control(balance)")
    .eq("id", body.data.orderId)
    .maybeSingle();
  if (ordErr) {
    const m = mapPgError(ordErr);
    return c.json(m.body, m.status);
  }
  if (!order) {
    return c.json({ error: "not_found", code: "not_found", message: "Order not found." }, 404);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o: any = order;
  const ctrl = Array.isArray(o.ops_order_control) ? o.ops_order_control[0] : o.ops_order_control;
  const money = orderMoney({
    lineSum: (o.order_lines ?? []).reduce(
      (s: number, l: { qty: number; unit_price: number | null }) =>
        s + Number(l.qty) * Number(l.unit_price ?? 0), 0),
    addonSum: (o.order_addons ?? []).reduce(
      (s: number, a: { qty: number; unit_price: number | null }) =>
        s + Number(a.qty) * Number(a.unit_price ?? 0), 0),
    paid: o.paid,
    controlBalance: ctrl?.balance ?? null,
  });
  if (money.total == null || money.total <= 0) {
    return c.json({
      error: "rule_violation", code: "order_value_unknown",
      message: "This order has no value on record. Add prices before an invoice.",
    }, 422);
  }
  const { data, error } = await sb.rpc("payment_invoice_prepare", {
    p_order_id: body.data.orderId,
    p_amount: money.total,
    p_tax_amount: 0,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

/** The issue door. The immutable snapshot is captured here from the same
 *  reads the customer document uses; SQL numbers and freezes it. */
financeInvoicesRouter.post("/:id/issue", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "finance", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "You cannot issue invoices." });
  }
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    return c.json({ error: "invalid_id", code: "invalid_param", message: "invoice id must be a uuid" }, 422);
  }
  const sb = userClient(c.env, auth.jwt);
  const { data: invoice, error: invErr } = await sb
    .from("invoices")
    .select("id,order_id,amount,tax_amount,kind,status")
    .eq("id", id)
    .maybeSingle();
  if (invErr) {
    const m = mapPgError(invErr);
    return c.json(m.body, m.status);
  }
  if (!invoice) {
    return c.json({ error: "not_found", code: "not_found", message: "Invoice not found." }, 404);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inv: any = invoice;
  const { data: order, error: ordErr } = await sb
    .from("orders")
    .select("id,so,customer_name,customer_phone,customer_address,order_lines(sku,qty,unit_price)")
    .eq("id", inv.order_id)
    .maybeSingle();
  if (ordErr) {
    const m = mapPgError(ordErr);
    return c.json(m.body, m.status);
  }
  if (!order) {
    return c.json({ error: "not_found", code: "not_found", message: "Order not found." }, 404);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ord: any = order;
  const snapshot = {
    kind: inv.kind,
    amount: Number(inv.amount),
    tax_amount: Number(inv.tax_amount ?? 0),
    order_id: ord.id,
    so: `SO-${ord.so}`,
    customer: {
      name: ord.customer_name ?? "",
      phone: ord.customer_phone ?? null,
      address: ord.customer_address ?? null,
    },
    lines: (ord.order_lines ?? []).map(
      (l: { sku: string; qty: number; unit_price: number | null }) => ({
        sku: l.sku, qty: Number(l.qty), unit_price: Number(l.unit_price ?? 0),
      })),
  };
  const { data, error } = await sb.rpc("payment_invoice_issue", {
    p_invoice_id: id,
    p_snapshot: snapshot,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

/** The document read (payment/MASTER.md §4): an issued invoice prints from
 *  its immutable SNAPSHOT — reprint is the same number and the same content,
 *  whatever the order looks like today. A voided invoice keeps its paper and
 *  says VOIDED. Pre-0429 invoices carry no snapshot; they fall back to a live
 *  read and say so. */
financeInvoicesRouter.get("/:id/document", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "finance", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "You cannot view invoice documents." });
  }
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    return c.json({ error: "invalid_id", code: "invalid_param", message: "invoice id must be a uuid" }, 422);
  }
  const sb = userClient(c.env, auth.jwt);
  const { data: invoice, error: invErr } = await sb
    .from("invoices")
    .select("id,invoice_no,order_id,amount,tax_amount,issued_at,voided_at,void_reason,status,kind,snapshot")
    .eq("id", id)
    .maybeSingle();
  if (invErr) {
    const m = mapPgError(invErr);
    return c.json(m.body, m.status);
  }
  if (!invoice) {
    return c.json({ error: "not_found", code: "not_found", message: "Invoice not found." }, 404);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inv: any = invoice;
  if (inv.status === "draft" || !inv.invoice_no) {
    return c.json({
      error: "rule_violation", code: "not_issued",
      message: "A draft has no document yet. Issue the invoice first.",
    }, 422);
  }
  const kindTitle = inv.kind === "storage" ? "STORAGE INVOICE"
    : inv.kind === "additional_storage" ? "ADDITIONAL STORAGE INVOICE" : "INVOICE";
  const voided = inv.status === "voided";

  if (inv.snapshot && typeof inv.snapshot === "object" && Array.isArray(inv.snapshot.lines)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snap: any = inv.snapshot;
    const taxAmount = Number(snap.tax_amount ?? 0);
    const total = Number(snap.amount ?? inv.amount);
    return c.json({
      voided,
      void_reason: inv.void_reason ?? null,
      from_snapshot: true,
      document: {
        doc_title: voided ? `${kindTitle} · VOIDED` : kindTitle,
        invoice_no: String(inv.invoice_no),
        issue_date: String(snap.issued_at ?? inv.issued_at).slice(0, 10),
        order_id: String(snap.order_id ?? inv.order_id),
        order_code: String(snap.so ?? ""),
        customer: {
          name: String(snap.customer?.name ?? ""),
          address: String(snap.customer?.address ?? "Not recorded"),
          phone: snap.customer?.phone ?? null,
        },
        dealer: { name: "Carres", contact: null },
        lines: (snap.lines as Array<{ sku: string; qty: number; unit_price: number }>).map((l) => ({
          sku: String(l.sku), description: String(l.sku), qty: Number(l.qty),
          unit: "pc", unit_price: Number(l.unit_price),
          line_total: +(Number(l.qty) * Number(l.unit_price)).toFixed(2),
        })),
        subtotal: +(total - taxAmount).toFixed(2),
        tax_amount: taxAmount,
        total,
        currency: "MYR",
      },
    });
  }

  // Legacy invoice (pre-0429): no snapshot exists, so the document reads the
  // live order and says so — it must never pretend to be an immutable reprint.
  const { data: order, error: ordErr } = await sb
    .from("orders")
    .select("id,so,customer_name,customer_phone,customer_address,order_lines(sku,qty,unit_price)")
    .eq("id", inv.order_id)
    .maybeSingle();
  if (ordErr) {
    const m = mapPgError(ordErr);
    return c.json(m.body, m.status);
  }
  if (!order) {
    return c.json({ error: "not_found", code: "not_found", message: "Order not found." }, 404);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ord: any = order;
  const taxAmount = Number(inv.tax_amount ?? 0);
  const total = Number(inv.amount);
  return c.json({
    voided,
    void_reason: inv.void_reason ?? null,
    from_snapshot: false,
    document: {
      doc_title: voided ? `${kindTitle} · VOIDED` : kindTitle,
      invoice_no: String(inv.invoice_no),
      issue_date: String(inv.issued_at).slice(0, 10),
      order_id: String(ord.id),
      order_code: `SO-${ord.so}`,
      customer: {
        name: String(ord.customer_name ?? ""),
        address: String(ord.customer_address ?? "Not recorded"),
        phone: ord.customer_phone ?? null,
      },
      dealer: { name: "Carres", contact: null },
      lines: (ord.order_lines ?? []).map((l: { sku: string; qty: number; unit_price: number | null }) => ({
        sku: String(l.sku), description: String(l.sku), qty: Number(l.qty),
        unit: "pc", unit_price: Number(l.unit_price ?? 0),
        line_total: +(Number(l.qty) * Number(l.unit_price ?? 0)).toFixed(2),
      })),
      subtotal: +(total - taxAmount).toFixed(2),
      tax_amount: taxAmount,
      total,
      currency: "MYR",
    },
  });
});

/** The message-sent door (0434): opening WhatsApp is neither sent nor read —
 *  the record requires the sent screenshot; SQL keeps the immutable ledger. */
financeInvoicesRouter.post("/:id/record-message", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "finance", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "You cannot record messages." });
  }
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    return c.json({ error: "invalid_id", code: "invalid_param", message: "invoice id must be a uuid" }, 422);
  }
  const body = await parseJsonBody(c, recordMessageInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, auth.jwt);
  const { data: invoice, error: invErr } = await sb
    .from("invoices").select("id,order_id").eq("id", id).maybeSingle();
  if (invErr) {
    const m = mapPgError(invErr);
    return c.json(m.body, m.status);
  }
  if (!invoice) {
    return c.json({ error: "not_found", code: "not_found", message: "Invoice not found." }, 404);
  }
  const { data, error } = await sb.rpc("payment_record_message_sent", {
    p_order_id: (invoice as { order_id: string }).order_id,
    p_invoice_id: id,
    p_kind: body.data.kind,
    p_message_text: body.data.messageText,
    p_template_key: body.data.templateKey ?? null,
    p_screenshot_url: body.data.screenshotUrl,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

/**
 * §3 (0446) — the customer's ANSWER, recorded as one of the five approved
 * results. `Customer will pay on a date` carries its date and no other result
 * may; the SQL door enforces both, appends the order history fact and stamps
 * the shared chase clock. It never writes money: a said-paid order keeps its
 * balance until the canonical posting service records the money.
 */
financeInvoicesRouter.post("/:id/collection-outcome", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "finance", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "You cannot record collection results." });
  }
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    return c.json({ error: "invalid_id", code: "invalid_param", message: "invoice id must be a uuid" }, 422);
  }
  const body = await parseJsonBody(c, collectionOutcomeInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, auth.jwt);
  const { data: invoice, error: invErr } = await sb
    .from("invoices").select("id,order_id").eq("id", id).maybeSingle();
  if (invErr) {
    const m = mapPgError(invErr);
    return c.json(m.body, m.status);
  }
  if (!invoice) {
    return c.json({ error: "not_found", code: "not_found", message: "Invoice not found." }, 404);
  }
  const { data, error } = await sb.rpc("payment_record_collection_outcome", {
    p_order_id: (invoice as { order_id: string }).order_id,
    p_outcome: body.data.outcome,
    p_promised_date: body.data.promisedDate ?? null,
    p_note: body.data.note ?? null,
    p_invoice_id: id,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ outcome: data }, 201);
});

/** The order's recorded conversations, newest first — the append-only ledger
 *  the object reads back (§3). */
financeInvoicesRouter.get("/:id/collection-outcomes", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "finance", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "You cannot view collection results." });
  }
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    return c.json({ error: "invalid_id", code: "invalid_param", message: "invoice id must be a uuid" }, 422);
  }
  const sb = userClient(c.env, auth.jwt);
  const { data: invoice, error: invErr } = await sb
    .from("invoices").select("id,order_id").eq("id", id).maybeSingle();
  if (invErr) {
    const m = mapPgError(invErr);
    return c.json(m.body, m.status);
  }
  if (!invoice) {
    return c.json({ error: "not_found", code: "not_found", message: "Invoice not found." }, 404);
  }
  const { data, error } = await sb
    .from("payment_collection_outcomes")
    // A stored id never reaches the screen untranslated (COPY-STANDARD).
    .select("*, recorded_by_user:app_users!payment_collection_outcomes_recorded_by_fkey(name)")
    .eq("order_id", (invoice as { order_id: string }).order_id)
    .order("recorded_at", { ascending: false });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ outcomes: data ?? [] });
});

/** The correction door — Payment Approver duty (or principal); SQL gates it. */
financeInvoicesRouter.post("/:id/void-replace", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "finance", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "You cannot correct invoices." });
  }
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    return c.json({ error: "invalid_id", code: "invalid_param", message: "invoice id must be a uuid" }, 422);
  }
  const body = await parseJsonBody(c, invoiceVoidReplaceInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("payment_invoice_void_replace", {
    p_invoice_id: id,
    p_reason: body.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

financeInvoicesRouter.get("/", requireFinance, async (c) => {
  const auth = c.var.auth;
  const parsed = invoicesListQuery.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_query",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid query",
      },
      422,
    );
  }
  const f = parsed.data;

  const sb = userClient(c.env, auth.jwt);
  let q = sb.from("invoices").select("*").order("issued_at", { ascending: false });
  if (f.from) q = q.gte("issued_at", f.from);
  if (f.to)   q = q.lte("issued_at", f.to);
  q = q.limit(f.limit ?? 200);

  const { data, error } = await q;
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

financeInvoicesRouter.post("/issue", requireFinance, async (c) => {
  const auth = c.var.auth;
  const body = await parseJsonBody(c, financeInvoiceIssueInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);

  // Q2=A: route-layer gate on order.status='delivered' before issuing.
  const { data: order, error: ordErr } = await sb
    .from("orders")
    .select("status, paid")
    .eq("id", body.data.orderId)
    .single();
  if (ordErr || !order) {
    return c.json(
      { error: "order_not_found", code: "not_found", message: ordErr?.message ?? "order not found" },
      404,
    );
  }
  if ((order as { status: string }).status !== "delivered") {
    return c.json(
      {
        error: "order_not_delivered",
        code: "order_not_delivered",
        message: `order status is ${(order as { status: string }).status}; must be delivered before invoice can issue`,
      },
      422,
    );
  }

  const { data, error } = await sb.rpc("invoice_issue", {
    p_order_id:   body.data.orderId,
    p_amount:     body.data.amount,
    p_tax_amount: body.data.taxAmount ?? 0,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

financeInvoicesRouter.post("/:id/void", requireFinance, async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json(
      { error: "invalid_id", code: "invalid_param", message: "invoice id must be a uuid" },
      422,
    );
  }
  const body = await parseJsonBody(c, financeInvoiceVoidInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("invoices")
    .update({ voided_at: new Date().toISOString().slice(0, 10) })
    .eq("id", id)
    .is("voided_at", null) // can't void an already-voided invoice
    .select("*")
    .single();
  if (error) {
    if (error.code === "PGRST116") {
      return c.json(
        {
          error: "not_voidable",
          code: "not_voidable",
          message: "invoice not found or already voided",
        },
        422,
      );
    }
    throw new HTTPException(500, { message: error.message });
  }

  // Audit-log the void (best-effort; failure here doesn't roll back the
  // void since the invoice row update is the source of truth).
  await sb.from("audit_log").insert({
    role:       auth.role,
    actor_text: auth.email ?? null,
    action:     `Invoice voided · ${(data as { invoice_no: string }).invoice_no} · ${body.data.reason.slice(0, 200)}`,
    ref:        (data as { invoice_no: string }).invoice_no,
  });

  return c.json(data);
});

// ----- GET /:id/pdf -----
// 2026-05-12 (Loo): renamed `/pdf` → `/pdf-data`. Now returns JSON shaped
// for the client-side @react-pdf render. Cloudflare Workers blocks the
// yoga-layout WASM compile so the server-side render couldn't actually
// run — see apps/web/src/lib/pdf/render.ts for the browser-side counterpart.
//
// Same gates as before:
//   - invoice not voided
//   - order.status='delivered'
//   - order.paid >= invoice.amount  (full payment received before tax doc)
financeInvoicesRouter.get("/:id/pdf-data", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json(
      { error: "invalid_id", code: "invalid_param", message: "invoice id must be a uuid" },
      422,
    );
  }

  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: invoice, error: invErr } = await sb
    .from("invoices")
    .select("id, invoice_no, order_id, amount, tax_amount, issued_at, voided_at")
    .eq("id", id)
    .maybeSingle();
  if (invErr) {
    const m = mapPgError(invErr);
    return c.json(m.body, m.status);
  }
  if (!invoice) {
    return c.json({ error: "not_found", code: "not_found", message: "invoice not found" }, 404);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inv: any = invoice;
  if (inv.voided_at) {
    return c.json(
      { error: "voided", code: "invoice_voided", message: "Cannot generate PDF for a voided invoice" },
      422,
    );
  }

  const { data: order, error: ordErr } = await sb
    .from("orders")
    .select(
      "id, so, status, customer_name, customer_phone, customer_address, dealer_id, paid, dealers(name, contact)",
    )
    .eq("id", inv.order_id)
    .maybeSingle();
  if (ordErr) {
    const m = mapPgError(ordErr);
    return c.json(m.body, m.status);
  }
  if (!order) {
    return c.json({ error: "not_found", code: "not_found", message: "order not found" }, 404);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ord: any = order;

  if (ord.status !== "delivered") {
    return c.json(
      {
        error: "rule_violation",
        code: "order_not_delivered",
        message: "Tax invoice PDF is only available after delivery",
      },
      422,
    );
  }
  const orderPaid = Number(ord.paid ?? 0);
  const invoiceAmt = Number(inv.amount ?? 0);
  if (orderPaid + 0.01 < invoiceAmt) {
    return c.json(
      {
        error: "rule_violation",
        code: "not_fully_paid",
        message: `Customer paid RM ${orderPaid.toFixed(2)} of RM ${invoiceAmt.toFixed(2)} — invoice PDF gates on full payment`,
      },
      422,
    );
  }

  const { data: lines, error: lineErr } = await sb
    .from("order_lines")
    .select("sku, qty, unit_price")
    .eq("order_id", inv.order_id);
  if (lineErr) {
    const m = mapPgError(lineErr);
    return c.json(m.body, m.status);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRows = (lines ?? []) as any[];

  // SKU descriptions (separate query — order_lines.sku is text, not FK'd).
  const skus: string[] = lineRows.map((l) => String(l.sku));
  const skuVariantBySku: Record<string, string> = {};
  if (skus.length > 0) {
    const { data: skuRows, error: skuErr } = await sb
      .from("product_skus")
      .select("sku, variant")
      .in("sku", skus);
    if (skuErr) {
      const m = mapPgError(skuErr);
      return c.json(m.body, m.status);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (skuRows ?? []) as any[]) {
      skuVariantBySku[String(r.sku)] = String(r.variant);
    }
  }

  // 0261-0263 — guarantee cover printed on the customer's copy. A voided
  // entitlement (cancelled order / removed line) is deliberately excluded:
  // the invoice must never promise cover that no longer exists.
  const { data: guaranteeRows } = await sb
    .from(GUARANTEE_ENTITLEMENTS)
    .select("guarantee_sku, guarantee_id, claimed_guarantee_id, covers_sku, covers_label, coverage_years, remedy, starts_on, expires_on, status")
    .eq("order_id", inv.order_id)
    .neq("status", "void")
    .order("unit_no");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gRows = (guaranteeRows ?? []) as any[];
  const termsBySku: Record<string, { label: string; terms_text: string | null }> = {};
  if (gRows.length > 0) {
    const { data: termRows } = await sb
      .from(GUARANTEE_TERMS)
      .select("guarantee_sku, label, terms_text");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (termRows ?? []) as any[]) {
      termsBySku[String(t.guarantee_sku)] = {
        label: String(t.label),
        terms_text: t.terms_text ? String(t.terms_text) : null,
      };
    }
  }

  const taxAmount = Number(inv.tax_amount ?? 0);
  const total = invoiceAmt;
  const subtotal = +(total - taxAmount).toFixed(2);

  const dealerRow = ord.dealers ?? null;
  const dealerName = dealerRow?.name ?? "Carres";
  const dealerContact = dealerRow?.contact ?? null;

  const templateData: InvoiceTemplateData = {
    invoice_no: String(inv.invoice_no),
    issue_date: String(inv.issued_at).slice(0, 10),
    order_id:   String(ord.id),
    order_code: `SO-${ord.so}`,
    customer: {
      name:    String(ord.customer_name ?? ""),
      address: String(ord.customer_address ?? "—"),
      phone:   ord.customer_phone ?? null,
    },
    dealer: {
      name:    dealerName,
      contact: dealerContact,
    },
    lines: lineRows.map((l) => {
      const qty = Number(l.qty);
      const unitPrice = Number(l.unit_price);
      return {
        sku:         String(l.sku),
        description: skuVariantBySku[l.sku] ?? String(l.sku),
        qty,
        unit:        "pc",
        unit_price:  unitPrice,
        line_total:  +(qty * unitPrice).toFixed(2),
      };
    }),
    subtotal,
    tax_amount: taxAmount,
    total,
    currency: "MYR",
    guarantees: gRows.map((g) => ({
      label: termsBySku[String(g.guarantee_sku)]?.label ?? String(g.guarantee_sku),
      guarantee_id: g.guarantee_id
        ? String(g.guarantee_id)
        : g.claimed_guarantee_id
          ? String(g.claimed_guarantee_id)
          : null,
      covers:
        (g.covers_label ? String(g.covers_label) : null) ??
        (g.covers_sku ? String(g.covers_sku) : null) ??
        "the mattress on this order",
      coverage_years: Number(g.coverage_years),
      remedy: String(g.remedy),
      starts_on: g.starts_on ? String(g.starts_on) : null,
      expires_on: g.expires_on ? String(g.expires_on) : null,
      terms_text: termsBySku[String(g.guarantee_sku)]?.terms_text ?? null,
    })),
  };

  return c.json(templateData);
});

export default financeInvoicesRouter;
