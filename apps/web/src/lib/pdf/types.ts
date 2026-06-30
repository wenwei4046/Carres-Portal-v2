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

export type InvoiceTemplateData = {
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
