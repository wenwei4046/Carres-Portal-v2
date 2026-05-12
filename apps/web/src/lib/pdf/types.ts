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
};
