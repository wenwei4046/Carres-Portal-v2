import { z } from "zod";

/**
 * Sofa loan flow (migration 0209) — lend a free sofa to an order while the real
 * one isn't ready, track it "on loan", and collect it back (swap) at the real
 * delivery. Endpoints: POST /loan-sofa, POST /loan-return, GET /loans.
 */

/** Loan a free sofa (ops_stock_items unit) to an order. */
export const loanSofaInput = z
  .object({
    itemId: z.string().uuid(),
    doNumber: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type LoanSofaInput = z.infer<typeof loanSofaInput>;

/** Return a loaned sofa (the swap at final delivery). */
export const returnLoanInput = z
  .object({
    loanId: z.string().uuid(),
  })
  .strict();
export type ReturnLoanInput = z.infer<typeof returnLoanInput>;

/** One loan row, joined with the loaned unit's sku + condition (snake_case, read
 *  straight from the API like the ops_order_control overlay). */
export const sofaLoanSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  item_id: z.string().uuid(),
  item_sku: z.string().nullable(),
  item_condition: z.string().nullable(),
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
