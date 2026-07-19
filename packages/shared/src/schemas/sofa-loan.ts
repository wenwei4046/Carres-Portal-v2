import { z } from "zod";

/**
 * Loaner flow — lend a substitute piece to an order while the real one isn't
 * ready, track it "on loan", and collect it back (swap) at the real delivery.
 * GENERAL since migration 0217: any category (mattress / sofa / bedframe) with
 * TWO sources — the own WAREHOUSE (a free ops_stock_items unit) or BORROWED from
 * a SUPPLIER (a return obligation: owe the supplier a piece back).
 * Endpoints: POST /loan-sofa (warehouse), POST /loan-borrow (supplier),
 * POST /loan-return (customer swap), POST /loan-return-supplier, GET /loans.
 */

export const LOAN_SOURCES = ["warehouse", "supplier"] as const;
export type LoanSource = (typeof LOAN_SOURCES)[number];

/** Loan a free own-stock unit (ops_stock_items) to an order — the warehouse path. */
export const loanSofaInput = z
  .object({
    itemId: z.string().uuid(),
    doNumber: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type LoanSofaInput = z.infer<typeof loanSofaInput>;

/** Borrow a piece from a supplier to loan to the order — the supplier path. No
 *  own-stock unit; the borrowed piece is described inline + we owe it back. */
export const borrowLoanInput = z
  .object({
    supplierId: z.string().uuid(),
    category: z.string().trim().max(40).optional(),
    borrowedSku: z.string().trim().max(120).optional(),
    borrowedLabel: z.string().trim().max(200),
    doNumber: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type BorrowLoanInput = z.infer<typeof borrowLoanInput>;

/** Return a loaned piece — the customer swap at final delivery (both sources). */
export const returnLoanInput = z
  .object({
    loanId: z.string().uuid(),
  })
  .strict();
export type ReturnLoanInput = z.infer<typeof returnLoanInput>;

/** Close the supplier RETURN OBLIGATION — the borrowed piece went back to the
 *  supplier (source='supplier' only). */
export const returnToSupplierInput = z
  .object({
    loanId: z.string().uuid(),
  })
  .strict();
export type ReturnToSupplierInput = z.infer<typeof returnToSupplierInput>;

/** One loan row. Warehouse loans carry item_id + the joined own-stock sku/cond;
 *  supplier borrows carry supplier_id/supplier_name + borrowed_sku/label and a
 *  returned_to_supplier_at obligation stamp. snake_case, read straight from the
 *  API like the ops_order_control overlay. */
export const sofaLoanSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  source: z.enum(LOAN_SOURCES).default("warehouse"),
  category: z.string().nullable().default(null),
  // warehouse source — the loaned own-stock unit
  item_id: z.string().uuid().nullable(),
  item_sku: z.string().nullable(),
  item_condition: z.string().nullable(),
  // the loaned own-stock unit's original PO (traceability on the loan card) —
  // joined from ops_stock_items; null for supplier borrows (nothing purchased).
  item_po: z.string().nullable().default(null),
  // supplier source — who we borrowed from + owe back, and the borrowed piece
  supplier_id: z.string().uuid().nullable().default(null),
  supplier_name: z.string().nullable().default(null),
  borrowed_sku: z.string().nullable().default(null),
  borrowed_label: z.string().nullable().default(null),
  returned_to_supplier_at: z.string().nullable().default(null),
  do_number: z.string().nullable(),
  status: z.enum(["on_loan", "returned"]),
  loaned_at: z.string(),
  returned_at: z.string().nullable(),
  notes: z.string().nullable(),
});
export type SofaLoanDto = z.infer<typeof sofaLoanSchema>;

export const sofaLoansResponseSchema = z.object({
  loans: z.array(sofaLoanSchema),
});
export type SofaLoansResponse = z.infer<typeof sofaLoansResponseSchema>;
