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
  customer: {
    name: string;
    address: string;
    phone: string | null;
    /** Emergency contact — who the driver calls when the customer is
     *  unreachable (sales portal collects it; 32/77 filled, 2026-08-09). */
    emergency?: string | null;
  };
  dealer: { name: string; contact: string | null };
  /** The logistic doing the trip (delivery_partners.name) — the driver
   *  side of the signature pair. */
  partner: { name: string } | null;
  lines: Array<{
    sku: string;
    description: string;
    qty: number;
    unit: string;
    line_total: number;
    /** Category band (SOFA / MATTRESS …) — optional, same as the SO. */
    category?: string | null;
    /** The PO(s) that supplied this line's goods (purchase_orders.id via
     *  the SO link) — the storekeeper's picking aid, 2990's Source PO. */
    source_po?: string[] | null;
    /** Line attrs (fabric_name etc.) — feeds the sofa layout drawing. */
    attrs?: Record<string, unknown> | null;
    /** The physical units delivered (ops_stock_items.unit_code, 0153) —
     *  scannable ids the warehouse checks off at loading; the paper then
     *  records exactly WHICH units this customer received. */
    unit_codes?: string[] | null;
  }>;
  currency: string;
  /** 2026-08-09 DO reskin (SO-PDF-STANDARD chrome) — all optional so the
   *  existing /print-do caller keeps working; the template skips absentees. */
  delivery_date?: string | null;
  delivery?: {
    floor: number | null;
    has_lift: boolean | null;
    address?: string | null;
  };
  /** Proof-of-delivery already captured digitally (orders.pod_*): the
   *  customer box prints the signature image when present. */
  pod?: { signature_url?: string | null; signed_at?: string | null };
  /** 0362 (owner ruling 2026-08-19) — printed when the document was issued
   *  under an APPROVED Delivery Payment Approval and money is still owed:
   *  `COLLECT RM {amount} BY ONLINE TRANSFER BEFORE UNLOADING — NO CASH.`
   *  The ONE ruled exception to "a delivery doc never talks money". */
  cod_instruction?: string | null;
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
  /** §4: "Voided Payment keeps a visible VOIDED receipt." The receipt is not
   *  withdrawn when a payment is voided — it is reprinted saying so. */
  voided?: boolean;
  void_reason?: string | null;
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
    /** Family table parity (2026-08-09) — optional; older callers omit. */
    category?: string | null;
    discount?: number | null;
  }>;
  subtotal: number;
  tax_amount: number;
  total: number;
  currency: string;
  /** Audit name for the footer's left cell (owner 2026-08-09) — who at
   *  Carres issued this invoice. Falls back to the invoice number. */
  issued_by?: string | null;
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
  /** Local review only; no PO number, version or unit identities exist yet. */
  draft?: boolean;
  // Money-free payload of `purchasing_po_document` (migration 0307) — the
  // supplier-facing PO carries no RM figure (docs/pdf/PO-PDF-STANDARD.md §2).
  po_number: string;
  po_id: string;
  /**
   * 0378 — which version of this document the factory is being handed. It
   * PRINTS, including Version 1: a supplier holding two papers with one number
   * and no version cannot tell which one to build from, and "an unrevised PO is
   * just the PO" is a rule for the internal panel, not for paper that leaves
   * the building. The confirmation hands this same number back, so what Carres
   * records is by construction what the operator rendered.
   */
  version: number;
  issue_date: string;
  supplier: { name: string; address: string | null; contact: string | null };
  destination: { name: string; address: string };
  delivery_instructions: string | null;
  eta_date: string | null;
  /** PO-level sales-order refs, from the document authority (0383). */
  so_refs?: number[] | null;
  /**
   * Who at Carres issued this purchase order — `audit_log`'s own actor, read by
   * `purchasing_po_document` (0383). It was hard-coded `null` in the route
   * until then, so the footer named nobody.
   */
  issued_by?: string | null;
  lines: Array<{
    sku: string;
    description: string;
    qty: number;
    unit: string;
    /** Effective governed destination for this goods line. Older document
     * payloads may omit it, in which case the PO-level destination applies. */
    destination?: { name: string; address: string } | null;
    attrs?: Record<string, unknown> | null;
    /** 0442 — the line's snapshotted stock identity mode. A `quantity` line
     *  legitimately prints `—` in the UNIT ID column. */
    identity_mode?: "exact_unit" | "quantity" | null;
    /** ops_stock_items.unit_code — born at official PO issue under the locked
     *  `U1-000-001` identity (0381/0443), bound to THIS line; the UNIT ID
     *  column is fed by this. */
    unit_codes?: string[] | null;
    /**
     * ⭐ WHICH CUSTOMER ORDER EACH UNIT ON THIS LINE IS FOR (`po_line_sources`,
     * 0382).
     *
     * A bulk purchase order aggregates one SKU across three customers, so the
     * `SO NO` column had nothing to print and printed blank — a supplier
     * delivering ten mattresses could not tell Carres whose they were, and
     * neither could Carres. One entry per source order, summing to `qty`.
     */
    sources?: Array<{ so: number | null; qty: number }> | null;
  }>;
  terms: string | null;
};

/**
 * GOODS RECEIVED NOTE — the formal receiving document (owner correction
 * 2026-09-06). Money-free like the PO and the DO: a receiving document talks
 * quantity and identity, never price. The five quantity words are the
 * governed set (`purchasing/MASTER.md` §5.8); `Deliver To` is where the PO
 * instructed the supplier to deliver, `Goods arrived at` is where the goods
 * physically arrived, `Goods received on` is the physical arrival date —
 * three different facts, all printed.
 */
export type GrnTemplateData = {
  grn_no: string;
  /** `Valid` | `Cancelled` — the document status words. */
  status_label: string;
  /** The linked source document — a PO, or a CO when consignment. */
  source: { po_number: string; is_consignment: boolean };
  supplier: { name: string };
  supplier_do_no: string;
  deliver_to: string;
  goods_arrived_at: string;
  /** ISO date — the physical arrival date. */
  goods_received_on: string | null;
  lines: Array<{
    sku: string;
    /** Human words first (catalog variant); the caller falls back to the SKU. */
    description: string;
    /** The governed category word from the one shared ladder. */
    category: string;
    order_qty: number;
    received_qty: number;
    damaged_qty: number;
    wrong_item_qty: number;
    pending_delivery_qty: number;
  }>;
  /** Exact-Unit outcomes, when governed Units exist — the scan record is
   *  part of the paper. */
  unit_results?: Array<{ unit_code: string; outcome_label: string }>;
  /** Extra goods — recorded separately, never Inventory, never pending. */
  extra_lines?: Array<{ sku: string; qty: number; note?: string | null }>;
  /** Evidence references — counts, not URLs (paper carries no dead links). */
  evidence?: { photos: number; videos: number; do_file: boolean } | null;
  /** The duty-evidence trio — normal holder · dated cover · actual actor. */
  duty: {
    holder_name: string | null;
    cover_name: string | null;
    actor_name: string | null;
    authority_label: string | null;
    posted_on: string | null;
  };
  /** Append-only amendment marking — printed on the paper itself. */
  amendments?: Array<{ date: string; reason: string | null; by: string | null }>;
  /** Cancellation marking — the record survives, plainly marked. */
  cancelled?: { date: string | null; reason: string | null; by: string | null } | null;
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
    /** 2026-08-09 (Muji reskin) — optional: pre-reskin API builds don't send
     *  them; the template skips the line when absent. */
    email?: string | null;
    /** Emergency contact as one line ("Mona Doal · +60 17-339 8639"). */
    emergency?: string | null;
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
    /** 2026-08-09 three-state ruling: `null` = never asked ("Not recorded").
     *  The stair-carry note prints ONLY when floor AND lift are both
     *  recorded — a charge line may not rest on a default. The DB columns
     *  are NOT NULL today (0001), so `null` arrives only after the
     *  nullable-columns migration; the template is ready either way. */
    floor: number | null;
    has_lift: boolean | null;
    /** Delivery address when it differs from billing. Absent/equal →
     *  "Same as billing address" (Carres orders carry ONE address today). */
    address?: string | null;
  };

  /** orders.proceed_date (0165) — optional; row skipped when absent. */
  proceed_date?: string | null;

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
    /** Category band the row prints under (SOFA / MATTRESS / BEDFRAME …).
     *  Optional — rows without one group under no band. */
    category?: string | null;
    /** Per-line discount amount. No schema column carries this today
     *  (verified 2026-08-09: order_lines has no discount, attrs has no
     *  discount key) — the column prints "—" until the portal records one. */
    discount?: number | null;
  }>;

  addons: Array<{
    label: string;
    /** The addon's real code (`SVC-DELIVERY`) — an empty Item Code cell is
     *  a defect (owner review 2026-08-09); absent prints `ADD-ON`. */
    sku?: string | null;
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
  payments?: Array<{
    label: string;
    reference: string | null;
    amount: number;
    /** 2026-08-09 (2990 parity) — payments.paid_at, orders.approval_code /
     *  payments.reference, app_users.name of recorded_by. All optional:
     *  the table prints "—" for what a row doesn't carry. */
    date?: string | null;
    approval_code?: string | null;
    collected_by?: string | null;
  }>;

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
  /** Deposit the customer committed to at point of sale. No schema field
   *  carries this today (verified 2026-08-09) — the line prints only when
   *  a figure arrives. */
  expected_deposit?: number | null;

  signed: boolean;
  /** 2026-05-22 (Loo) — signed URL to the customer's eSign PNG captured at
   *  checkout. The template renders this inline as the customer signature.
   *  Null when the order has no signature on file. */
  signature_url?: string | null;
};
