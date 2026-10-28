/**
 * The credit note — /api/finance/credit-notes (migration 0729).
 *
 * Issued by Finance against ONE Sales Invoice. It lowers what the order still
 * owes; it is never paid out (payment/MASTER.md §13, Carres does not refund).
 * The database re-checks everything here; these schemas catch typing mistakes.
 *
 * PURE — no clock, no I/O.
 */
import { z } from "zod";

const money = z
  .number({ invalid_type_error: "Type the amount in numbers, like 150.00." })
  .positive("The amount must be more than RM 0.00.")
  .max(9_999_999_999.99, "The amount is larger than the ledger can hold.")
  .refine((n) => Math.round(n * 100) / 100 === n, "An amount has at most two decimals.");

export const creditNoteIssueInput = z
  .object({
    /** Either one names the invoice; the screen types the number. */
    invoiceId: z.string().uuid().optional(),
    invoiceNo: z.string().trim().min(1).max(40).optional(),
    amount: money,
    reason: z.string().trim().min(1, "Type the reason for the credit note.").max(300, "The reason is at most 300 characters."),
    noteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date.").optional(),
  })
  .strict()
  .refine((v) => !!v.invoiceId || !!v.invoiceNo, { path: ["invoiceNo"], message: "Type the invoice number." });
export type CreditNoteIssueInput = z.infer<typeof creditNoteIssueInput>;

export const creditNoteVoidInput = z
  .object({ reason: z.string().trim().min(1, "Type the reason for voiding the credit note.").max(300) })
  .strict();

/** One row of the Finance list and of an invoice's credit notes. */
export interface CreditNoteRow {
  id: string;
  credit_note_no: string;
  invoice_id: string;
  invoice_no: string | null;
  order_id: string;
  so: number | null;
  customer_name: string | null;
  amount: number;
  reason: string;
  note_date: string;
  status: "issued" | "voided";
  void_reason: string | null;
  created_at: string;
}

/** What the Credit Note paper prints. */
export interface CreditNotePrintData {
  credit_note_no: string;
  note_date: string;
  invoice_no: string | null;
  order_code: string | null;
  customer_name: string | null;
  amount: number;
  reason: string;
  voided: boolean;
  void_reason: string | null;
  currency: string;
}
