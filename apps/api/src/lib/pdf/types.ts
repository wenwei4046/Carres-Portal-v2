/**
 * PDF template data contracts for M4 Tasks 5+6.
 *
 * These shapes are the contract Tasks 5+6 (the /print-do and /print endpoints)
 * will fill from Supabase reads before handing to renderDoPdf / renderPoPdf.
 *
 * Keep flat / serialisable — no Date objects, no nested rows beyond what the
 * template renders. All currency values are MYR major units as JS number
 * (PostgREST returns `numeric(12,2)` rows as plain numbers like `1500.0`,
 * representing MYR 1,500.00 — NOT cents).
 */

export type DoTemplateData = {
  /** Delivery Order document number, e.g. "DO-2026-00042". */
  do_number: string;
  /** Issue date, ISO 8601 yyyy-mm-dd. */
  issue_date: string;
  /** Underlying order PK for cross-reference (printed on doc footer). */
  order_id: string;
  /** Order code shown on the doc body (the dealer-facing reference). */
  order_code: string;

  /** Customer block — buyer at the receiving end. */
  customer: {
    name: string;
    /** Single-line address; multi-line addresses should be joined with ", " upstream. */
    address: string;
    phone: string | null;
  };

  /** Dealer block — Carres-side seller. */
  dealer: {
    name: string;
    contact: string | null;
  };

  /** Delivery partner / logistics carrier (optional — null pre-dispatch). */
  partner: {
    name: string;
  } | null;

  /** Line items the DO is delivering. */
  lines: Array<{
    sku: string;
    description: string;
    qty: number;
    unit: string;
    /** Line subtotal in MYR major units (qty * unit_price). */
    line_total: number;
  }>;

  /** Currency display code, default "MYR". */
  currency: string;
};

export type InvoiceTemplateData = {
  /** Tax invoice number, e.g. "INV-2026-1240". */
  invoice_no: string;
  /** Issue date, ISO 8601 yyyy-mm-dd. */
  issue_date: string;
  /** Underlying order PK for cross-reference (printed on doc footer). */
  order_id: string;
  /** Order code shown on the doc body (the dealer-facing reference, "DL-{dl}"). */
  order_code: string;

  /** Customer block — buyer at the receiving end. */
  customer: {
    name: string;
    address: string;
    phone: string | null;
  };

  /** Dealer block — Carres-side seller. */
  dealer: {
    name: string;
    contact: string | null;
  };

  /** Line items (qty + unit_price + line_total). */
  lines: Array<{
    sku: string;
    description: string;
    qty: number;
    unit: string;
    /** Unit price including SST (proto's pricing convention is tax-inclusive). */
    unit_price: number;
    /** Line subtotal in MYR major units (qty * unit_price). */
    line_total: number;
  }>;

  /** Subtotal excluding SST = total - tax_amount. */
  subtotal: number;
  /** SST 8% inclusive: tax_amount = total * 0.08 / 1.08. */
  tax_amount: number;
  /** Grand total in MYR major units (sum of line_total = subtotal + tax_amount). */
  total: number;

  /** Currency display code, default "MYR". */
  currency: string;
};

/**
 * Sales Order data — kept here for historical reference. As of 2026-05-12
 * the SO PDF renders client-side (apps/web/src/lib/pdf/), so the API route
 * `/api/orders/:id/sales-order-data` declares an inline copy of this shape
 * and returns JSON. Delete this once no consumer references the type.
 *
 * @deprecated server-side SO render is gone; type lives in
 * apps/web/src/lib/pdf/types.ts now.
 */
export type SalesOrderTemplateData = {
  /** Sales Order number, e.g. "SO-001001" (6-digit zero-padded `orders.dl`). */
  so_number: string;
  /** Issue date (orders.placed_at as ISO yyyy-mm-dd). */
  issue_date: string;
  /** Underlying order PK for cross-reference. */
  order_id: string;
  /** Dealer-facing reference ("DL-{dl}"). Printed alongside SO# for ops. */
  order_code: string;
  /** orders.status display label, e.g. "Awaiting fulfilment". */
  status_label: string;
  /** Channel — "dealer" or "showroom" (drives the salesperson row). */
  channel: "dealer" | "showroom";

  /** Customer block. */
  customer: {
    name: string;
    address: string;
    phone: string | null;
  };

  /** Seller block — Carres KL + dealer + outlet/salesperson if showroom. */
  dealer: {
    name: string;
    contact: string | null;
    /** Outlet name if `channel = "showroom"`, else null. */
    outlet_name: string | null;
    outlet_address: string | null;
    /** Salesperson assigned for showroom orders. */
    salesperson_name: string | null;
    salesperson_phone: string | null;
  };

  /** Delivery block. */
  delivery: {
    /** ISO yyyy-mm-dd OR "TBD" when `delivery_date_tbd` is true. */
    date: string;
    /** Floor number (default 1). */
    floor: number;
    /** Whether the customer's unit has lift access. */
    has_lift: boolean;
  };

  /**
   * Line items rendered in the body table. `description` includes the SKU's
   * model + variant; `attrs` summarises bedframe `{color, gap}` / sofa
   * `{fabric_name, fabric_surcharge}` / mattress `{preset}` so the customer
   * sees what they actually bought.
   */
  lines: Array<{
    sku: string;
    description: string;
    qty: number;
    unit_price: number;
    line_total: number;
    attrs: Record<string, unknown> | null;
  }>;

  /** Add-ons (e.g. dismantling, stair-carry quoted upfront, accessory pack). */
  addons: Array<{
    label: string;
    qty: number;
    unit_price: number;
    line_total: number;
  }>;

  /** Subtotal lines + addons (before deposit). */
  subtotal: number;
  /** Grand total = subtotal (no separate tax in proto SO; SST is inclusive). */
  total: number;
  /** Amount paid so far (orders.paid). */
  paid: number;
  /** Balance due (total - paid). May be negative if over-paid. */
  balance_due: number;
  /** Currency display code, default "MYR". */
  currency: string;

  /** Whether the order has a customer signature on file (orders.signature_url). */
  signed: boolean;
};

export type PoTemplateData = {
  /** Purchase Order document number, e.g. "PO-2026-00007". */
  po_number: string;
  /** Issue date, ISO 8601 yyyy-mm-dd. */
  issue_date: string;
  /** Underlying PO PK for cross-reference. */
  po_id: string;

  /** Supplier block — vendor receiving the order. */
  supplier: {
    name: string;
    address: string | null;
    contact: string | null;
  };

  /** Buyer block — Carres HQ side. */
  buyer: {
    name: string;
    contact: string | null;
  };

  /** Line items being procured. */
  lines: Array<{
    sku: string;
    description: string;
    qty: number;
    unit: string;
    /** Unit cost in MYR major units (excluding tax). */
    unit_price: number;
    /** Line subtotal in MYR major units (qty * unit_price). */
    line_total: number;
    /**
     * 0076 / 0077 (Loo 2026-05-10): cascade picker payload mirrored from
     * `purchase_order_lines.attrs`. Bedframe = `{color, gap}`, sofa =
     * `{fabric_id, fabric_name, fabric_surcharge}`, mattress = NULL.
     * Template renders this under the description so the supplier knows
     * exactly which version to make — without it a "BF-001 King ×2" PO
     * could be Walnut, Natural Oak, or Black and the supplier would have
     * to guess.
     */
    attrs?: Record<string, unknown> | null;
  }>;

  /** Order grand total in MYR major units (sum of line_total). */
  grand_total: number;

  /** Currency display code, default "MYR". */
  currency: string;

  /** Optional payment / delivery terms paragraph. */
  terms: string | null;
};
