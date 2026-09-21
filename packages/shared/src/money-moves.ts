/**
 * Money moves (migration 0529): Finance moving its own money.
 *
 *   · TRANSFER     cash or bank → another cash or bank account.
 *   · CARD_PAYOUT  a card company's holding account → a bank, less its fee.
 *                  `amount` is what reached the bank; the holding account
 *                  gives up amount + fee.
 *   · BANK_CHARGE  money the bank took (0537): a bank → 6500 Bank and payment charges.
 *   · BANK_CREDIT  money the bank added with no document (0537): 4900 Other income → a bank.
 *
 * Prepared by Finance, approved (and so posted) by a different finance
 * approver. The database refuses every rule here; these only keep the form
 * and pickers to the same rule.
 *
 * PURE — no clock, no I/O.
 */
import { z } from "zod";
import { moneyInAmount } from "./other-money-in";
import type { MoneyAccountRow } from "./money-accounts";

export const MONEY_MOVE_KINDS = ["TRANSFER", "CARD_PAYOUT", "BANK_CHARGE", "BANK_CREDIT"] as const;
export type MoneyMoveKind = (typeof MONEY_MOVE_KINDS)[number];
export type MoneyMoveStatus = "prepared" | "approved" | "reversed" | "cancelled";

export const MONEY_MOVE_KIND_WORD: Record<MoneyMoveKind, string> = {
  TRANSFER: "Bank transfer",
  CARD_PAYOUT: "Card payout",
  BANK_CHARGE: "Bank charge",
  BANK_CREDIT: "Bank credit",
};

const accountCode = (msg: string) => z.string().regex(/^\d{4}$/, msg);

export const moneyMoveInput = z
  .object({
    kind: z.enum(MONEY_MOVE_KINDS, { errorMap: () => ({ message: "Choose a bank transfer, a card payout, a bank charge or a bank credit." }) }),
    move_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
    from_account_code: accountCode("Choose where the money came from."),
    to_account_code: accountCode("Choose where the money went."),
    amount: moneyInAmount,
    fee: z
      .number({ invalid_type_error: "Type the fee." })
      .min(0, "The fee cannot be below RM 0.00.")
      .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "An amount has at most two decimals.")
      .default(0),
    reference: z.string().max(120).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
    idempotency_key: z.string().uuid(),
  })
  .refine((m) => m.from_account_code !== m.to_account_code, {
    message: "The money must move between two different accounts.",
  })
  .refine((m) => m.kind === "CARD_PAYOUT" || m.fee === 0, { message: "Only a card payout has a fee." });
export type MoneyMoveInput = z.input<typeof moneyMoveInput>;

/** One row of `gl_money_move_list()`. */
export interface MoneyMoveRow {
  move_id: string;
  move_no: string;
  kind: MoneyMoveKind;
  status: MoneyMoveStatus;
  move_date: string;
  from_account_code: string;
  from_account_name: string;
  to_account_code: string;
  to_account_name: string;
  amount: number;
  fee: number;
  reference: string | null;
  note: string | null;
  prepared_by_name: string | null;
  prepared_by_me: boolean;
  prepared_at: string;
  approved_by_name: string | null;
  approved_at: string | null;
  ended_by_name: string | null;
  ended_at: string | null;
  end_reason: string | null;
}

/** The accounts each side of a move may offer (same rule as the database). */
export function moveAccounts(kind: MoneyMoveKind, side: "from" | "to", rows: MoneyAccountRow[]): MoneyAccountRow[] {
  return rows.filter((a) => {
    if (!a.is_active) return false;
    if (kind === "TRANSFER") return a.money_kind === "CASH" || a.money_kind === "BANK";
    if (kind === "BANK_CHARGE" || kind === "BANK_CREDIT") return a.money_kind === "BANK";
    return side === "from" ? a.money_kind === "HOLDING" : a.money_kind === "BANK";
  });
}

/** What left the paying account: amount + fee, in sen so 0.1 + 0.2 stays 0.30. */
export function moneyMoveGross(amount: number, fee: number): number {
  return (Math.round(amount * 100) + Math.round(fee * 100)) / 100;
}

export const MONEY_MOVE_STATUS_WORD: Record<MoneyMoveStatus, string> = {
  prepared: "Prepared",
  approved: "Approved",
  reversed: "Reversed",
  cancelled: "Cancelled",
};

/** Which buttons a row offers. The database decides again on the press.
 *  Approve: the finance approver, not the preparer. Cancel: a prepared move by
 *  Finance; an approved one only by the finance approver (it reverses). */
export function moneyMoveActions(row: Pick<MoneyMoveRow, "status" | "prepared_by_me">, mayApprove: boolean) {
  return {
    approve: row.status === "prepared" && mayApprove && !row.prepared_by_me,
    cancel: row.status === "prepared" || (row.status === "approved" && mayApprove),
  };
}
