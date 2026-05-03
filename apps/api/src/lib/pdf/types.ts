/**
 * PDF template data contracts for M4 Tasks 5+6.
 *
 * These shapes are the contract Tasks 5+6 (the /print-do and /print endpoints)
 * will fill from Supabase reads before handing to renderDoPdf / renderPoPdf.
 *
 * Keep flat / serialisable — no Date objects, no nested rows beyond what the
 * template renders. All currency values are MYR cents-as-number (matches DB
 * `numeric` columns coming back from PostgREST as JS number).
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
    /** Line subtotal in MYR (qty * unit_price). */
    line_total: number;
  }>;

  /** Currency display code, default "MYR". */
  currency: string;
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
    /** Unit cost in MYR (excluding tax). */
    unit_price: number;
    /** Line subtotal in MYR (qty * unit_price). */
    line_total: number;
  }>;

  /** Order grand total in MYR (sum of line_total). */
  grand_total: number;

  /** Currency display code, default "MYR". */
  currency: string;

  /** Optional payment / delivery terms paragraph. */
  terms: string | null;
};
