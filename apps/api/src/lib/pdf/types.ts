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

  /** Delivery partner / operation carrier (optional — null pre-dispatch). */
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

  /** 0362 (owner ruling 2026-08-19) — set when the document was issued under
   *  an APPROVED Delivery Payment Approval and money is still owed:
   *  `COLLECT RM {amount} BY ONLINE TRANSFER BEFORE UNLOADING — NO CASH.`
   *  The one ruled exception to "a delivery doc never talks money". */
  cod_instruction?: string | null;
};

export type InvoiceTemplateData = {
  /** Tax invoice number, e.g. "INV-2026-1240". */
  invoice_no: string;
  /** Issue date, ISO 8601 yyyy-mm-dd. */
  issue_date: string;
  /** Underlying order PK for cross-reference (printed on doc footer). */
  order_id: string;
  /** Order code shown on the doc body (the dealer-facing reference, "SO-{so}"). */
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
  /** Goods money received before this invoice was issued (receivedBeforeInvoice). */
  received_before?: number;

  /** Currency display code, default "MYR". */
  currency: string;

  /** 0261-0263 — guarantee packages bought on this order. Rendered as its own
   *  block under the totals so the customer's copy states, in writing, exactly
   *  which item is covered and until when. Absent / empty = no block. */
  guarantees?: Array<{
    label: string;
    /** The `ABCD123456` handle the customer quotes to claim (0267). */
    guarantee_id: string | null;
    /** The covered item, spelled out ("B1201S King"). */
    covers: string;
    coverage_years: number;
    /** 'replace' (one-for-one) | 'repair'. */
    remedy: string;
    /** null until the order is delivered — the clock starts on delivery. */
    starts_on: string | null;
    expires_on: string | null;
    terms_text: string | null;
  }>;
};
