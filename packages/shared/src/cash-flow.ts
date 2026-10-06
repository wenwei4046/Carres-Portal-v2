/**
 * CASH FLOW — the ONE arithmetic for a period's cash and bank money
 * (migration 0638; Chew 2026-10-03, docs/finance/MASTER.md §3.6).
 *
 * `fin_cash_flow` serves the parts: each cash or bank account's balance
 * before the period with its money in and out, what the money was for (the
 * rows), and the card money taken and still waiting. Carried forward and
 * every total are worked out here and nowhere else (Law D), in whole sen
 * through Daily Bank's reader.
 *
 *   carried forward = brought forward + inflow − outflow      (each account)
 *   net cash flow   = inflow − outflow                          (all accounts)
 *
 * The database shares every account line out exactly, so the rows' money in
 * equals the accounts' money in, and the same for money out. An answer that
 * does not add up refuses here instead of printing.
 */

import { z } from "zod";
import { sen } from "./daily-bank";
import type { MoneyAccountKind } from "./money-accounts";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-03");

/** `GET /finance/ledger/cash-flow?from=&to=` — both days included. */
export const cashFlowQuery = z.object({ from: isoDay, to: isoDay }).strict()
  .refine((v) => v.from <= v.to, { message: "The start date is after the end date", path: ["to"] });
export type CashFlowQuery = z.infer<typeof cashFlowQuery>;

type Wire = number | string;

export interface CashFlowAccount {
  account_code: string;
  name: string;
  money_kind: MoneyAccountKind;
  is_active: boolean;
  opening: Wire;
  receipts: Wire;
  payments: Wire;
}

export interface CashFlowRow {
  side: "IN" | "OUT";
  account_code: string;
  name: string;
  /** The chart kind of the account the money came from or went to. */
  kind: string;
  /** Set when that account is itself on the money-accounts list. */
  money_kind: MoneyAccountKind | null;
  amount: Wire;
}

export interface CashFlowAnswer {
  from: string;
  to: string;
  go_live_on: string | null;
  accounts: CashFlowAccount[];
  rows: CashFlowRow[];
  card: { taken: Wire; waiting: Wire };
}

/** One line of the statement: money from (or to) one account. */
export interface CashFlowLine {
  key: string;
  side: "IN" | "OUT";
  code: string;
  name: string;
  /** Between two of Carres's own cash and bank accounts. */
  transfer: boolean;
  /** Card or online money arriving from (or going to) a holding account. */
  holding: boolean;
  amount: number;
}

export interface CashFlowAccountLine {
  account: CashFlowAccount;
  broughtForward: number;
  inflow: number;
  outflow: number;
  carriedForward: number;
}

export interface CashFlowReport {
  /** Every account in use, and a retired one while money sits in it or moved. */
  accounts: CashFlowAccountLine[];
  inflow: CashFlowLine[];
  outflow: CashFlowLine[];
  totalInflow: number;
  totalOutflow: number;
  net: number;
  broughtForward: number;
  carriedForward: number;
  /** Card and online money customers paid in the period. */
  cardTaken: number;
  /** Card and online money not yet paid out to a bank at the end. */
  cardWaiting: number;
}

const rm = (s: number) => s / 100;

export function cashFlowReport(a: CashFlowAnswer): CashFlowReport {
  let bf = 0;
  let inflow = 0;
  let outflow = 0;
  const accounts: CashFlowAccountLine[] = [];
  for (const acct of a.accounts) {
    const o = sen(acct.opening);
    const i = sen(acct.receipts);
    const p = sen(acct.payments);
    bf += o;
    inflow += i;
    outflow += p;
    if (acct.is_active || o !== 0 || i !== 0 || p !== 0) {
      accounts.push({ account: acct, broughtForward: rm(o), inflow: rm(i), outflow: rm(p), carriedForward: rm(o + i - p) });
    }
  }

  const lines = a.rows.map((r): CashFlowLine & { sen: number } => {
    const transfer = r.money_kind === "CASH" || r.money_kind === "BANK";
    const s = sen(r.amount);
    return {
      key: `${r.side}:${r.account_code}`, side: r.side, code: r.account_code, name: r.name,
      transfer, holding: r.money_kind === "HOLDING", amount: rm(s), sen: s,
    };
  });
  const rowsIn = lines.filter((l) => l.side === "IN");
  const rowsOut = lines.filter((l) => l.side === "OUT");
  const sumOf = (ls: typeof lines) => ls.reduce((t, l) => t + l.sen, 0);
  if (sumOf(rowsIn) !== inflow || sumOf(rowsOut) !== outflow) {
    throw new Error("Cash Flow does not add up.");
  }
  const strip = ({ sen: _sen, ...l }: CashFlowLine & { sen: number }): CashFlowLine => l;

  return {
    accounts,
    inflow: rowsIn.map(strip),
    outflow: rowsOut.map(strip),
    totalInflow: rm(inflow),
    totalOutflow: rm(outflow),
    net: rm(inflow - outflow),
    broughtForward: rm(bf),
    carriedForward: rm(bf + inflow - outflow),
    cardTaken: rm(sen(a.card.taken)),
    cardWaiting: rm(sen(a.card.waiting)),
  };
}
