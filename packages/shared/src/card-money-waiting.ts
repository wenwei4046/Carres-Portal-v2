/**
 * CARD MONEY WAITING — each card and online payment not in the bank yet
 * (migration 0641; Chew 2026-10-03, docs/finance/MASTER.md §3.4, after Houzs
 * Part 7 §11 "Still with the merchants").
 *
 * `fin_card_money_waiting` serves the payments still on a holding account and
 * each holding account's balance in the books. Here, and nowhere else (Law D):
 *
 *   days waiting  = today − the day the payment was posted
 *   age           = 0 to 7 · 8 to 14 · 15 to 30 · over 30 days
 *   explained     = what the listed payments add up to, per holding account
 *   difference    = the holding account's balance − explained
 *                   (a card payout made by hand on Money moves, or a charge,
 *                   moves the balance without a payment leaving the list)
 */

import { sen } from "./daily-bank";

type Wire = number | string;

export type CardWaitingState = "NOT_ON_A_FILE" | "NOT_PREPARED" | "WAITING_APPROVAL";

export interface CardWaitingPaymentWire {
  entry_no: string;
  entry_date: string;
  source_type: string;
  doc_no: string;
  account_code: string;
  amount: Wire;
  payment_id: string | null;
  receipt_no: string | null;
  order_id: string | null;
  so: number | string | null;
  customer_name: string | null;
  acquirer: string | null;
  day_date: string | null;
  move_no: string | null;
  state: CardWaitingState;
}

export interface CardWaitingAnswer {
  today: string;
  go_live_on: string | null;
  holdings: Array<{ account_code: string; name: string; balance: Wire }>;
  payments: CardWaitingPaymentWire[];
}

export const CARD_WAITING_AGES = ["0 to 7 days", "8 to 14 days", "15 to 30 days", "Over 30 days"] as const;
export type CardWaitingAge = (typeof CARD_WAITING_AGES)[number];

export function cardWaitingAge(days: number): CardWaitingAge {
  if (days <= 7) return "0 to 7 days";
  if (days <= 14) return "8 to 14 days";
  if (days <= 30) return "15 to 30 days";
  return "Over 30 days";
}

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

export interface CardWaitingRow {
  key: string;
  wire: CardWaitingPaymentWire;
  holdingName: string;
  amount: number;
  days: number;
  age: CardWaitingAge;
}

export interface CardWaitingHolding {
  code: string;
  name: string;
  balance: number;
  explained: number;
  difference: number;
}

export interface CardWaitingReport {
  rows: CardWaitingRow[];
  total: number;
  holdings: CardWaitingHolding[];
  /** The holding accounts' balances, added up. */
  booksTotal: number;
  difference: number;
}

export function cardMoneyWaiting(a: CardWaitingAnswer): CardWaitingReport {
  const names = new Map(a.holdings.map((h) => [h.account_code, h.name]));
  const byHolding = new Map<string, number>();
  let total = 0;
  const rows = a.payments.map((p): CardWaitingRow => {
    const s = sen(p.amount);
    total += s;
    byHolding.set(p.account_code, (byHolding.get(p.account_code) ?? 0) + s);
    const days = Math.max(0, dayNumber(a.today) - dayNumber(p.entry_date));
    return {
      key: `${p.entry_no}:${p.account_code}`, wire: p, holdingName: names.get(p.account_code) ?? p.account_code,
      amount: s / 100, days, age: cardWaitingAge(days),
    };
  });
  let books = 0;
  const holdings = a.holdings.map((h): CardWaitingHolding => {
    const balance = sen(h.balance);
    const explained = byHolding.get(h.account_code) ?? 0;
    books += balance;
    return { code: h.account_code, name: h.name, balance: balance / 100, explained: explained / 100, difference: (balance - explained) / 100 };
  });
  return { rows, total: total / 100, holdings, booksTotal: books / 100, difference: (books - total) / 100 };
}
