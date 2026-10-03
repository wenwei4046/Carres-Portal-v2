/**
 * PAYMENT REQUESTS — staff ask Finance to pay a bill (migration 0645; Chew
 * 2026-10-03, docs/finance/MASTER.md §3.3).
 *
 * The request stores only what no document can say (submitted · answered ·
 * returned · withdrawn). WHERE THE MONEY STANDS is read from the voucher or
 * bill that answers it, here and nowhere else (Law D), so the requester's
 * stage can never disagree with the money.
 */
import { z } from "zod";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-03");
const optText = (max: number, message: string) =>
  z.string().max(max, message).nullish().transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

/** What the requester types. The database checks it again and decides who may. */
export const paymentRequestInput = z
  .object({
    payeeName: z.string().trim().min(1, "Say who is to be paid").max(120, "The payee's name is too long"),
    amount: z.number({ invalid_type_error: "Type the amount" }).positive("The amount must be more than RM 0.00")
      .refine((n) => Math.round(n * 100) === n * 100, "Type the amount in ringgit and sen"),
    purpose: z.string().trim().min(1, "Say what the payment is for").max(300, "Keep what it is for to 300 characters"),
    payBy: isoDay.nullish(),
    note: optText(2000, "Keep the note to 2,000 characters"),
    bankName: optText(80, "The bank name is too long"),
    bankAccountNo: optText(40, "The account number is too long")
      .refine((v) => v == null || /^[0-9][0-9 -]{4,38}[0-9]$/.test(v), "An account number is digits only"),
    bankAccountHolder: optText(120, "The account holder's name is too long"),
    billNo: optText(80, "The bill number is too long"),
    billDate: isoDay.nullish(),
  })
  .strict();
export type PaymentRequestInput = z.infer<typeof paymentRequestInput>;

export const paymentRequestReturnInput = z.object({ note: z.string().trim().min(1, "Say why it goes back").max(1000) }).strict();
export const paymentRequestAnswerInput = z
  .object({ voucherId: z.string().uuid().nullish(), billId: z.string().uuid().nullish() })
  .strict()
  .refine((v) => (v.voucherId == null) !== (v.billId == null), "Answer with one payment voucher or one bill");
export const requestGrantInput = z.object({ allowed: z.boolean() }).strict();

type Wire = number | string;

export type PaymentRequestStatus = "submitted" | "answered" | "returned" | "withdrawn";

export interface PaymentRequestRow {
  id: string;
  request_no: string;
  status: PaymentRequestStatus;
  requested_by: string;
  requested_by_name: string | null;
  payee_name: string;
  amount: Wire;
  pay_by: string | null;
  purpose: string;
  note: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_account_holder: string | null;
  bill_no: string | null;
  bill_date: string | null;
  return_note: string | null;
  decided_at: string | null;
  decided_by_name: string | null;
  created_at: string;
  updated_at: string;
  file_count: number;
  voucher: { id: string; voucher_no: string | null; status: string; voucher_date: string } | null;
  bill: { id: string; bill_no: string | null; status: string; total: Wire; paid: Wire } | null;
}

export interface PaymentRequestDocument {
  request: PaymentRequestRow;
  files: Array<{ id: string; file_name: string; mime_type: string; size_bytes: number; storage_path: string; uploaded_at: string; uploaded_by_name: string | null }>;
  events: Array<{ action: string; note: string | null; at: string; actor_name: string | null }>;
  finance: boolean;
  can: { edit: boolean; withdraw: boolean; add_file: boolean; return: boolean; answer: boolean };
}

export interface PaymentRequestMe {
  may_request: boolean;
  finance: boolean;
  boss: boolean;
  /** May tick who may ask: a Finance person or the boss (0648, Chew 2026-10-03). */
  may_grant: boolean;
}

export interface RequestGrantRow {
  user_id: string;
  name: string;
  role: string;
  allowed: boolean;
  granted_at: string | null;
  granted_by_name: string | null;
}

/** Where a request stands, read from the document that answers it. */
export type PaymentRequestStage =
  | "with_finance"      // waiting for Finance
  | "preparing"         // a voucher in draft
  | "waiting_approval"  // a voucher prepared or checked
  | "bill_draft"        // a bill in draft
  | "bill_entered"      // a confirmed bill, nothing paid yet
  | "partly_paid"       // a confirmed bill, partly paid
  | "paid"              // an approved voucher, or a fully paid bill
  | "answer_cancelled"  // its voucher or bill was cancelled: Finance answers again or returns it
  | "returned"
  | "withdrawn";

export function paymentRequestStage(r: Pick<PaymentRequestRow, "status" | "voucher" | "bill">): PaymentRequestStage {
  if (r.status === "withdrawn") return "withdrawn";
  if (r.status === "returned") return "returned";
  if (r.status !== "answered") return "with_finance";
  if (r.voucher) {
    switch (r.voucher.status) {
      case "approved": return "paid";
      case "cancelled": return "answer_cancelled";
      case "prepared":
      case "checked": return "waiting_approval";
      default: return "preparing";
    }
  }
  if (r.bill) {
    if (r.bill.status === "cancelled") return "answer_cancelled";
    if (r.bill.status !== "confirmed") return "bill_draft";
    const total = Math.round(Number(r.bill.total) * 100);
    const paid = Math.round(Number(r.bill.paid) * 100);
    if (paid >= total) return "paid";
    return paid > 0 ? "partly_paid" : "bill_entered";
  }
  return "answer_cancelled";
}

/** The words for each stage (COPY-STANDARD "Finance (Chew)" · Payment Requests). */
export const PAYMENT_REQUEST_STAGE_WORD: Record<PaymentRequestStage, string> = {
  with_finance: "With Finance",
  preparing: "Finance is preparing the payment",
  waiting_approval: "Payment waiting for approval",
  bill_draft: "Finance is entering the bill",
  bill_entered: "Bill entered, not paid yet",
  partly_paid: "Partly paid",
  paid: "Paid",
  answer_cancelled: "Payment cancelled, Finance pays it again",
  returned: "Returned",
  withdrawn: "Withdrawn",
};

/** Finance's to-do: waiting, or its answer was cancelled. */
export function awaitsFinance(stage: PaymentRequestStage): boolean {
  return stage === "with_finance" || stage === "answer_cancelled";
}
