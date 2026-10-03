/**
 * DAILY BANK — the ONE arithmetic for a money account's day (migration 0637;
 * Chew 2026-10-03, docs/finance/MASTER.md §3.4).
 *
 * `fin_daily_bank` serves the parts: the day before, the day's money in and
 * out, and the checked vouchers waiting. Closing, available, in transit and
 * the three totals are worked out here and nowhere else (Law D).
 *
 *   closing    = brought forward + received − paid
 *   available  = closing − pending            (cash and bank only)
 *   in transit = closing of a HOLDING account (card and online money waiting
 *                for its payout — never money that can move)
 *
 * Money is added in whole sen, never in floating ringgit.
 */

import { z } from "zod";
import type { MoneyAccountKind } from "./money-accounts";

/** `GET /finance/ledger/daily-bank?day=` — one day; omitted = today in Malaysia. */
export const dailyBankQuery = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-03").optional(),
}).strict();
export type DailyBankQuery = z.infer<typeof dailyBankQuery>;

type Wire = number | string;

export interface DailyBankLine {
  entry_no: string;
  source_type: string;
  source_doc_no: string;
  /** The line's memo, else the entry's narration. */
  description: string | null;
  /** The customer, supplier or other party the entry names, when it names one. */
  party_type: string | null;
  party_name: string | null;
  received: Wire;
  paid: Wire;
}

export interface DailyBankPendingVoucher {
  voucher_id: string;
  voucher_no: string | null;
  /** Set when the voucher pays a supplier; a direct voucher names its payee only. */
  supplier_id: string | null;
  payee_name: string;
  voucher_date: string;
  /** The voucher's purpose code and its own note, for the description. */
  purpose: string | null;
  narration: string | null;
  amount: Wire;
}

export interface DailyBankAccount {
  account_code: string;
  name: string;
  /** The one list's kind (0512): HOLDING is card and online money waiting for its payout. */
  money_kind: MoneyAccountKind;
  is_active: boolean;
  brought_forward: Wire;
  received: Wire;
  paid: Wire;
  pending: Wire;
  pending_vouchers: DailyBankPendingVoucher[];
  lines: DailyBankLine[];
}

export interface DailyBankDay {
  day: string;
  go_live_on: string | null;
  accounts: DailyBankAccount[];
}

/** A figure in sen. A value that is not a number refuses: a partial answer
 *  must never print as a whole one. */
export function sen(v: Wire): number {
  const n = typeof v === "number" ? v : /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new Error("A Daily Bank figure could not be read.");
  return Math.round(n * 100);
}

export interface DailyBankRow {
  account: DailyBankAccount;
  /** All in ringgit, added in sen. */
  broughtForward: number;
  received: number;
  paid: number;
  closing: number;
  /** Checked vouchers waiting to pay out of this account; 0 on a holding account. */
  pending: number;
  /** Null on a holding account: card money waiting for its payout cannot move. */
  available: number | null;
  /** Null on cash and bank. */
  inTransit: number | null;
}

export function dailyBankRow(a: DailyBankAccount): DailyBankRow {
  const bf = sen(a.brought_forward);
  const rec = sen(a.received);
  const paid = sen(a.paid);
  const closing = bf + rec - paid;
  const holding = a.money_kind === "HOLDING";
  const pending = holding ? 0 : sen(a.pending);
  return {
    account: a,
    broughtForward: bf / 100,
    received: rec / 100,
    paid: paid / 100,
    closing: closing / 100,
    pending: pending / 100,
    available: holding ? null : (closing - pending) / 100,
    inTransit: holding ? closing / 100 : null,
  };
}

/** A retired money account still shows while money sits in it or moved through
 *  it that day; one with nothing in it and nothing moving leaves the board. */
export function dailyBankShows(r: DailyBankRow): boolean {
  if (r.account.is_active) return true;
  return r.broughtForward !== 0 || r.received !== 0 || r.paid !== 0 || r.pending !== 0;
}

export interface DailyBankTotals {
  /** Cash and bank, after the checked vouchers waiting. */
  canMove: number;
  /** Card and online money not paid out to a bank yet. */
  inTransit: number;
  /** Checked vouchers waiting for approval, out of cash and bank. */
  awaitingApproval: number;
}

export function dailyBankTotals(rows: readonly DailyBankRow[]): DailyBankTotals {
  let canMove = 0;
  let inTransit = 0;
  let awaiting = 0;
  for (const r of rows) {
    if (r.available !== null) canMove += Math.round(r.available * 100);
    if (r.inTransit !== null) inTransit += Math.round(r.inTransit * 100);
    awaiting += Math.round(r.pending * 100);
  }
  return { canMove: canMove / 100, inTransit: inTransit / 100, awaitingApproval: awaiting / 100 };
}
