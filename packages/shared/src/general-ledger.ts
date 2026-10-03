/**
 * GENERAL LEDGER — every account's period (migration 0639; Chew 2026-10-03,
 * docs/finance/MASTER.md §3.6, after Houzs Part 10 §7).
 *
 * `fin_general_ledger` gathers `gl_account_ledger`'s own rows (0540) for each
 * account: OPENING, every LINE with its running balance, CLOSING. This file
 * reads them into one block per account and checks them. The balances are the
 * database's, the same figures the Journal prints for one account; the only
 * sums here are a block's debits and credits, added in whole sen.
 *
 * A block that does not hold together (a line out of step with the running
 * balance, a closing that is not the last balance, a figure it cannot read)
 * refuses the whole report instead of printing part of it.
 */

import { z } from "zod";
import { departmentFilterFields, departmentFilterMessage, departmentFilterOk } from "./department";
import { sen } from "./daily-bank";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-03");
const accountList = z.string()
  .regex(/^[0-9A-Za-z][0-9A-Za-z._-]{0,19}(,[0-9A-Za-z][0-9A-Za-z._-]{0,19}){0,199}$/, "Choose accounts from the chart");

/** `GET /finance/ledger/general-ledger?from=&to=[&accounts=a,b]` — both days included. */
export const generalLedgerQuery = z.object({
  from: isoDay,
  to: isoDay,
  accounts: accountList.optional(),
  ...departmentFilterFields,
}).strict()
  .refine((v) => v.from <= v.to, { message: "The start date is after the end date", path: ["to"] })
  .refine(departmentFilterOk, { message: departmentFilterMessage, path: ["departmentId"] });
export type GeneralLedgerQuery = z.infer<typeof generalLedgerQuery>;

type Wire = number | string | null;

/** One row as `gl_account_ledger` answers it. */
export interface GeneralLedgerWireRow {
  row_kind: string;
  account_code: string;
  account_name: string | null;
  kind: string | null;
  entry_date: string | null;
  entry_no: string | null;
  source_type: string | null;
  source_doc_no: string | null;
  narration: string | null;
  memo: string | null;
  debit: Wire;
  credit: Wire;
  running_balance: Wire;
}

export interface GeneralLedgerAnswer {
  status: "OK" | "BEFORE_GO_LIVE";
  go_live_on: string;
  from: string;
  to: string;
  accounts: Array<{ account_code: string; rows: GeneralLedgerWireRow[] }>;
}

export interface GeneralLedgerLine {
  entryDate: string;
  entryNo: string;
  sourceType: string;
  docNo: string;
  /** The line's memo, else the entry's narration. */
  description: string | null;
  debit: number;
  credit: number;
  /** After this line, on the account's own side (debit for ASSET and EXPENSE). */
  balance: number;
}

export interface GeneralLedgerBlock {
  code: string;
  name: string;
  kind: string;
  opening: number;
  lines: GeneralLedgerLine[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
}

const FAILED = "The General Ledger could not be read.";

/** Each account's block, checked. Throws when a block does not hold together. */
export function generalLedgerBlocks(answer: GeneralLedgerAnswer): GeneralLedgerBlock[] {
  if (answer.status === "BEFORE_GO_LIVE") return [];
  return answer.accounts.map(({ account_code, rows }) => {
    const opening = rows.find((r) => r.row_kind === "OPENING");
    const closing = rows.filter((r) => r.row_kind === "CLOSING");
    if (!opening || closing.length !== 1 || rows[0] !== opening) throw new Error(FAILED);
    const kind = opening.kind;
    const name = opening.account_name;
    if (!kind || !name || opening.account_code !== account_code) throw new Error(FAILED);
    const debitSide = kind === "ASSET" || kind === "EXPENSE";

    let balance = sen(opening.running_balance ?? NaN);
    let dr = 0;
    let cr = 0;
    const lines: GeneralLedgerLine[] = [];
    for (const r of rows) {
      if (r.row_kind !== "LINE") continue;
      const d = sen(r.debit ?? NaN);
      const c = sen(r.credit ?? NaN);
      balance += debitSide ? d - c : c - d;
      // The database's running balance and the line's own amounts must agree.
      if (balance !== sen(r.running_balance ?? NaN) || !r.entry_date || !r.entry_no || !r.source_type || r.source_doc_no == null) {
        throw new Error(FAILED);
      }
      dr += d;
      cr += c;
      const memo = r.memo?.trim() ? r.memo.trim() : null;
      lines.push({
        entryDate: r.entry_date, entryNo: r.entry_no, sourceType: r.source_type, docNo: r.source_doc_no,
        description: memo ?? (r.narration?.trim() ? r.narration.trim() : null),
        debit: d / 100, credit: c / 100, balance: balance / 100,
      });
    }
    if (balance !== sen(closing[0]!.running_balance ?? NaN)) throw new Error(FAILED);
    return {
      code: account_code, name, kind,
      opening: sen(opening.running_balance ?? NaN) / 100,
      lines, totalDebit: dr / 100, totalCredit: cr / 100, closing: balance / 100,
    };
  });
}
