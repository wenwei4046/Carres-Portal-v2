/**
 * Client-side PDF template data contracts.
 *
 * Mirrors `apps/api/src/lib/pdf/types.ts` (server side keeps the legacy
 * defs that the DO/PO/Invoice routes still use). Loo 2026-05-12 moved
 * rendering to the browser to escape the Cloudflare Workers WASM
 * limitation that blocks yoga-layout from initializing in the Workers
 * runtime — the data assembly stays server-side, the rendering happens
 * client-side, and these types are the contract between the two.
 *
 * As more PDFs move to the browser, their template-data types are
 * declared here.
 */

export type DoTemplateData = {
  do_number: string;
  issue_date: string;
  order_id: string;
  order_code: string;
  customer: { name: string; address: string; phone: string | null };
  dealer: { name: string; contact: string | null };
  partner: { name: string } | null;
  lines: Array<{
    sku: string;
    description: string;
    qty: number;
    unit: string;
    line_total: number;
  }>;
  currency: string;
};

export type ReceiptTemplateData = {
  receipt_no: string;
  issue_date: string; // paid_on (yyyy-mm-dd)
  order_code: string; // SO-123
  customer: { name: string };
  amount: number;
  method: string; // cash / bank / card / cheque / online / other
  kind: string; // payment / deposit / storage
  reference: string | null;
  note: string | null;
  currency: string;
};

/** Storage delivery-EXTENSION agreement (migration 0196; the two Delivery-
 *  Extension Google Forms, Jess 2026-06-30). The PDF that replaces the Google
 *  Form — exported from the order detail to send the customer. */
export type ExtensionAgreementTemplateData = {
  order_code: string; // SO-123
  issue_date: string; // acknowledged date (yyyy-mm-dd)
  customer: { name: string; phone: string };
  original_date: string; // the original requested delivery date
  new_date: string; // the new requested delivery date
  reason: string; // reason (+ free-text detail when "Others")
  policy_lines: readonly string[]; // the one-time storage policy per category
};

export type LoanNoteTemplateData = {
  ln_no: string; // LN-DDMMYY-NNNN (docNumber scheme)
  order_code: string; // SO-123
  order_ref?: string | null; // the customer's CR/TCF ref (source_ref[0]), if any
  issue_date: string; // loaned-out date (yyyy-mm-dd)
  customer: { name: string; phone: string };
  item: string; // the loaned piece
  condition: string; // condition at hand-over
  source: string; // "Borrowed · Laveo" / "Warehouse · Klang"
};

export type InvoiceTemplateData = {
  /** Document heading — defaults to "TAX INVOICE"; an imported order's
   *  statement renders as "PAYMENT REQUEST" (AutoCount holds the tax
   *  invoice for those). */
  doc_title?: string;
  invoice_no: string;
  issue_date: string;
  order_id: string;
  order_code: string;
  customer: { name: string; address: string; phone: string | null };
  dealer: { name: string; contact: string | null };
  lines: Array<{
    sku: string;
    description: string;
    qty: number;
    unit: string;
    unit_price: number;
    line_total: number;
  }>;
  subtotal: number;
  tax_amount: number;
  total: number;
  currency: string;
  /** 0261-0263 — guarantee packages bought on this order. Rendered as its own
   *  block under the totals so the customer's copy states, in writing, exactly
   *  which item is covered and until when. Absent / empty = no block. */
  guarantees?: Array<{
    label: string;
    /** The `ABCD123456` handle the customer quotes to claim (0267). */
    guarantee_id: string | null;
    covers: string;
    coverage_years: number;
    remedy: string;
    starts_on: string | null;
    expires_on: string | null;
    terms_text: string | null;
  }>;
};

export type PoTemplateData = {
  po_number: string;
  issue_date: string;
  po_id: string;
  supplier: { name: string; address: string | null; contact: string | null };
  buyer: { name: string; contact: string | null };
  lines: Array<{
    sku: string;
    description: string;
    qty: number;
    unit: string;
    unit_price: number;
    line_total: number;
    attrs?: Record<string, unknown> | null;
  }>;
  grand_total: number;
  currency: string;
  terms: string | null;
};

export type SalesOrderTemplateData = {
  so_number: string;
  issue_date: string;
  order_id: string;
  order_code: string;
  status_label: string;
  channel: "dealer" | "showroom";

  customer: {
    name: string;
    address: string;
    phone: string | null;
  };

  dealer: {
    name: string;
    contact: string | null;
    // 2026-05-22 (Loo, migration 0144) — dealer-side fallback address used
    // by the PDF "Sold By" block when no outlet is attached. outlet_address
    // takes precedence when present.
    address: string | null;
    outlet_name: string | null;
    outlet_address: string | null;
    salesperson_name: string | null;
    salesperson_phone: string | null;
  };

  delivery: {
    date: string;
    floor: number;
    has_lift: boolean;
  };

  lines: Array<{
    sku: string;
    /** Human product name (`Model name (Variant)`), server-resolved from the
     *  sku since 2026-07-14 (2990s SO parity); older API builds echo the sku
     *  code here — the template renders whatever arrives. A built sofa
     *  arrives REGROUPED since 2026-07-19: one row per build (sku = model
     *  key, description = model name) with the cart-style spec copy in
     *  `attrs.sofa_spec`. */
    description: string;
    qty: number;
    unit_price: number;
    line_total: number;
    attrs: Record<string, unknown> | null;
  }>;

  addons: Array<{
    label: string;
    qty: number;
    unit_price: number;
    line_total: number;
    /** order_addons.attrs (disposal size / delivery follow-up source SO) —
     *  optional: pre-2026-07-14 API builds don't send it. */
    attrs?: Record<string, unknown> | null;
  }>;

  /** "PAYMENTS RECEIVED" rows (2990s SO parity, 2026-07-14) — the
   *  order_payments ledger for internal callers, else one synthesized row
   *  from orders.paid + payment_method. Optional: pre-parity API builds
   *  don't send it; the template then falls back to the paid amount. */
  payments?: Array<{ label: string; reference: string | null; amount: number }>;

  /** Voucher codes EARNED on this order (PWP carry-forward) — printed under
   *  their trigger line ("PWP voucher issued: … · not redeemed yet").
   *  Optional for the same rollout reason. */
  vouchers?: Array<{
    code: string;
    redeemed: boolean;
    type: "pwp" | "promo";
    reward_category: string | null;
    trigger_sku: string | null;
  }>;

  subtotal: number;
  total: number;
  paid: number;
  balance_due: number;
  currency: string;

  signed: boolean;
  /** 2026-05-22 (Loo) — signed URL to the customer's eSign PNG captured at
   *  checkout. The template renders this inline as the customer signature.
   *  Null when the order has no signature on file. */
  signature_url?: string | null;
};
