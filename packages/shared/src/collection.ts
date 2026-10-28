/**
 * COLLECTION — the ONE arithmetic for the Collection report (migration 0644;
 * Chew 2026-10-03, docs/finance/MASTER.md §3.6, after Houzs Part 10 §6).
 *
 * `fin_collection` serves the orders placed in a period, each with its value,
 * the deposit taken with it, the balance paid since and its live sales
 * invoice. Per salesperson, worked out here and nowhere else (Law D), in sen:
 *
 *   deposit %     deposit / order value          (none when the value is 0)
 *   below N%      orders with a value whose deposit % is under the threshold
 *   — delivered orders only —
 *   billed        the live sales invoice, or the order value when none
 *   balance due   billed − deposit, never below 0
 *   balance %     balance paid / balance due      (none when nothing is due)
 *   outstanding   billed − deposit − balance paid
 */
import { z } from "zod";
import { sen } from "./daily-bank";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-03");

/** `GET /finance/ledger/collection?from=&to=` — both days included. */
export const collectionQuery = z.object({ from: isoDay, to: isoDay }).strict()
  .refine((v) => v.from <= v.to, { message: "The start date is after the end date", path: ["to"] });
export type CollectionQuery = z.infer<typeof collectionQuery>;

type Wire = number | string;

export interface CollectionOrderWire {
  id: string;
  so: number;
  placed_on: string;
  status: string;
  customer_name: string | null;
  salesperson_id: string | null;
  salesperson_name: string | null;
  channel: string | null;
  dealer_name: string | null;
  order_value: Wire;
  deposit: Wire;
  balance_paid: Wire;
  invoice_no: string | null;
  billed: Wire | null;
  issued_at: string | null;
  delivered: boolean;
}

export interface CollectionAnswer {
  from: string;
  to: string;
  orders: CollectionOrderWire[];
}

/** One order as the report reads it, in sen. */
export interface CollectionOrder {
  id: string;
  so: number;
  placedOn: string;
  customer: string | null;
  invoiceNo: string | null;
  value: number;
  deposit: number;
  /** Basis points of the value, or null when the value is 0. */
  depositBp: number | null;
  below: boolean;
  delivered: boolean;
  billed: number;
  balanceDue: number;
  balancePaid: number;
  outstanding: number;
}

export interface CollectionFigures {
  orders: number;
  value: number;
  deposit: number;
  depositBp: number | null;
  below: number;
  delivered: {
    orders: number;
    billed: number;
    deposit: number;
    balanceDue: number;
    balancePaid: number;
    balanceBp: number | null;
    outstanding: number;
  };
}

export interface CollectionRow extends CollectionFigures {
  /** The salesperson's id, or "none" for orders with no salesperson. */
  key: string;
  name: string | null;
  list: CollectionOrder[];
}

export interface CollectionReport {
  rows: CollectionRow[];
  total: CollectionFigures;
}

/** a / b as basis points, rounded; null when b is not above 0. */
export function bp(a: number, b: number): number | null {
  return b > 0 ? Math.round((a * 10000) / b) : null;
}

/** Below the threshold: an order with a value whose deposit share is under it. */
function isBelow(value: number, deposit: number, thresholdPct: number): boolean {
  return value > 0 && deposit * 100 < value * thresholdPct;
}

export function collectionOrder(w: CollectionOrderWire, thresholdPct: number): CollectionOrder {
  const value = sen(w.order_value);
  const deposit = sen(w.deposit);
  const balancePaid = sen(w.balance_paid);
  const billed = w.billed === null || w.billed === undefined ? value : sen(w.billed);
  return {
    id: w.id, so: w.so, placedOn: w.placed_on, customer: w.customer_name, invoiceNo: w.invoice_no,
    value, deposit, depositBp: bp(deposit, value), below: isBelow(value, deposit, thresholdPct),
    delivered: w.delivered === true,
    billed,
    balanceDue: Math.max(billed - deposit, 0),
    balancePaid,
    outstanding: billed - deposit - balancePaid,
  };
}

function figures(list: readonly CollectionOrder[]): CollectionFigures {
  const value = list.reduce((s, o) => s + o.value, 0);
  const deposit = list.reduce((s, o) => s + o.deposit, 0);
  const done = list.filter((o) => o.delivered);
  const dDeposit = done.reduce((s, o) => s + o.deposit, 0);
  const balanceDue = done.reduce((s, o) => s + o.balanceDue, 0);
  const balancePaid = done.reduce((s, o) => s + o.balancePaid, 0);
  return {
    orders: list.length,
    value,
    deposit,
    depositBp: bp(deposit, value),
    below: list.filter((o) => o.below).length,
    delivered: {
      orders: done.length,
      billed: done.reduce((s, o) => s + o.billed, 0),
      deposit: dDeposit,
      balanceDue,
      balancePaid,
      balanceBp: bp(balancePaid, balanceDue),
      outstanding: done.reduce((s, o) => s + o.outstanding, 0),
    },
  };
}

/**
 * Per salesperson, largest order value first, and the total over every order.
 * `thresholdPct` is above 0 and at most 100; anything else reads as 50.
 */
export function collectionReport(a: CollectionAnswer, thresholdPct: number): CollectionReport {
  const t = Number.isFinite(thresholdPct) && thresholdPct > 0 && thresholdPct <= 100 ? thresholdPct : 50;
  const orders = a.orders.map((w) => ({ w, o: collectionOrder(w, t) }));
  const groups = new Map<string, { name: string | null; list: CollectionOrder[] }>();
  for (const { w, o } of orders) {
    const key = w.salesperson_id ?? "none";
    const g = groups.get(key) ?? { name: w.salesperson_name, list: [] };
    g.list.push(o);
    groups.set(key, g);
  }
  const rows: CollectionRow[] = [...groups.entries()]
    .map(([key, g]) => ({ key, name: g.name, list: g.list, ...figures(g.list) }))
    .sort((x, y) => y.value - x.value || (x.name ?? "").localeCompare(y.name ?? ""));
  return { rows, total: figures(orders.map((x) => x.o)) };
}

/** A basis-point share as a percentage with one decimal, or "" when there is none. */
export function pctWord(bpValue: number | null): string {
  return bpValue === null ? "" : `${(bpValue / 100).toFixed(1)}%`;
}
