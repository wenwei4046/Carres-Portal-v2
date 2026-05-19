import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  financeInvoiceIssueInput,
  financeInvoiceVoidInput,
  invoicesListQuery,
} from "@carres/shared";
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
  };

  return c.json(templateData);
});

export default financeInvoicesRouter;
