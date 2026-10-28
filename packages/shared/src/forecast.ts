/**
 * FORECAST — the ONE arithmetic for Finance's Forecast (migration 0646;
 * Chew 2026-10-03, docs/finance/MASTER.md §3.6, after Houzs Part 10 §18).
 *
 * A month's plan holds one cell per profit-and-loss account. An income account
 * is planned as an amount; a cost or expense account as an amount or as a
 * share of the month's planned income, in basis points (1250 is 12.50%).
 * Worked out here and nowhere else (Law D), in sen:
 *
 *   planned income     Σ the amounts planned on income accounts
 *   a share's amount   planned income × share, rounded half away from zero
 *   an amount's share  amount ÷ planned income; none when no income is planned
 *   gross profit       income − cost of sales
 *   net profit         gross profit − expenses
 *
 * Beside the plan, the month's actual from the Profit and Loss as the ledger
 * served it (income credit-positive, expenses debit-positive): each account's
 * figure, the same totals, and actual − plan. The actual lines must add up to
 * the served net, or the actual is refused.
 */
import { z } from "zod";
import { sen } from "./daily-bank";
import { ledgerAccountCodeShape } from "./finance-ledger";

export const FORECAST_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const month = z.string().regex(FORECAST_MONTH, "Choose the month.");

/** `GET /finance/ledger/forecast?month=` */
export const forecastQuery = z.object({ month }).strict();
export type ForecastQuery = z.infer<typeof forecastQuery>;

/** The database's own limits (0646): an amount under RM 10,000,000,000.00,
 *  a share from 0% to 10,000.00%. */
export const FORECAST_MAX_AMOUNT = 10_000_000_000;
export const FORECAST_MAX_SHARE_BP = 1_000_000;

export type ForecastCell = { amount: number } | { share: number };

const AMOUNT_WORDS = "Type the amount in ringgit and sen.";
const SHARE_WORDS = "A share is 0% or more, to two decimals.";

const cellInput = z.union([
  z.object({
    amount: z.number().finite()
      .refine((v) => Math.abs(v) < FORECAST_MAX_AMOUNT, AMOUNT_WORDS)
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, AMOUNT_WORDS)
      // Sent as the shortest decimal for its sen, which is what the database checks.
      .transform((v) => Math.round(v * 100) / 100),
  }).strict(),
  z.object({
    share: z.number().int(SHARE_WORDS).min(0, SHARE_WORDS).max(FORECAST_MAX_SHARE_BP, SHARE_WORDS),
  }).strict(),
]);

/** `PUT /finance/ledger/forecast/:month` — the whole month at once. `was` is
 *  the save time the page read: null for a month never saved. */
export const forecastSaveInput = z.object({
  lines: z.record(z.string().regex(ledgerAccountCodeShape, "That account is not in the chart."), cellInput),
  was: z.string().datetime({ offset: true }).nullable(),
}).strict();
export type ForecastSaveInput = z.infer<typeof forecastSaveInput>;

/** What a save answers: the month and its new save time. */
export interface ForecastSaved {
  month: string;
  saved_at: string;
}

export const FORECAST_BLOCKS = ["income", "cost", "expense"] as const;
export type ForecastBlock = (typeof FORECAST_BLOCKS)[number];

/** One account a month can be planned on, as `fin_forecast_read` serves it. */
export interface ForecastAccount {
  code: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  active: boolean;
  block: ForecastBlock;
}

export interface ForecastAnswer {
  month: string;
  accounts: ForecastAccount[];
  lines: Record<string, ForecastCell>;
  updated_at: string | null;
  updated_by_name: string | null;
  previous: { month: string; lines: Record<string, ForecastCell> } | null;
  planned_months: string[];
}

/** The month's actual, as the Profit and Loss served it, in ringgit. */
export interface ForecastActualInput {
  lines: ReadonlyArray<{ code: string; name: string | null; kind: string; amount: number }>;
  net: number;
}

export interface ForecastLine {
  account: ForecastAccount;
  cell: ForecastCell | null;
  /** In sen: the amount planned, or the share worked out. Null when nothing is planned. */
  plan: number | null;
  /** Basis points of the planned income: the share planned, or the amount's
   *  share. Null when nothing is planned, or when no income is planned and
   *  the cell is an amount. */
  share: number | null;
  /** In sen; null when no actual was read. An account with nothing posted is 0. */
  actual: number | null;
  /** actual − plan in sen (nothing planned counts as 0); null when no actual was read. */
  difference: number | null;
}

export interface ForecastFigure {
  /** In sen. */
  plan: number;
  /** Basis points of the planned income; null when no income is planned. */
  share: number | null;
  /** In sen; null when no actual was read. */
  actual: number | null;
  /** actual − plan in sen; null when no actual was read. */
  difference: number | null;
}

export interface ForecastReport {
  /** Planned income in sen: the basis every share is taken of. */
  basis: number;
  lines: ForecastLine[];
  blocks: Record<ForecastBlock, ForecastFigure>;
  gross: ForecastFigure;
  net: ForecastFigure;
}

/** n ÷ d rounded half away from zero, exactly. */
function roundDiv(n: bigint, d: bigint): bigint {
  const neg = (n < 0n) !== (d < 0n);
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return neg ? -q : q;
}

/** A share of the basis, in sen: basis × bp ÷ 10,000. */
export function shareAmount(basis: number, bp: number): number {
  return Number(roundDiv(BigInt(basis) * BigInt(bp), 10000n));
}

/** An amount as a share of the basis, in basis points; null when the basis is 0. */
export function amountShare(amount: number, basis: number): number | null {
  if (basis === 0) return null;
  return Number(roundDiv(BigInt(amount) * 10000n, BigInt(basis)));
}

function readCell(cell: unknown): ForecastCell {
  if (cell !== null && typeof cell === "object" && !Array.isArray(cell)) {
    const c = cell as Record<string, unknown>;
    const keys = Object.keys(c);
    if (keys.length === 1 && keys[0] === "amount" && (typeof c.amount === "number" || typeof c.amount === "string")) {
      return { amount: sen(c.amount) / 100 };
    }
    if (keys.length === 1 && keys[0] === "share" && Number.isInteger(c.share) && (c.share as number) >= 0) {
      return { share: c.share as number };
    }
  }
  throw new Error("The plan could not be read.");
}

function figure(plan: number, basis: number, actual: number | null): ForecastFigure {
  return {
    plan,
    share: amountShare(plan, basis),
    actual,
    difference: actual === null ? null : actual - plan,
  };
}

/**
 * The month's plan beside its actual. `accounts` in the chart's order; a
 * retired account shows only with a plan or an actual. An actual on an
 * account the plan does not list (one made a heading since) is kept, under
 * income or expenses by its kind, so the totals still tie to the served net.
 */
export function forecastReport(
  accounts: readonly ForecastAccount[],
  cells: Readonly<Record<string, unknown>>,
  actual: ForecastActualInput | null,
): ForecastReport {
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const plan = new Map<string, ForecastCell>();
  for (const [code, raw] of Object.entries(cells)) {
    if (!byCode.has(code)) throw new Error("The plan could not be read.");
    const cell = readCell(raw);
    if (byCode.get(code)!.kind === "INCOME" && "share" in cell) throw new Error("The plan could not be read.");
    plan.set(code, cell);
  }

  const actualBy = new Map<string, number>();
  const extra: ForecastAccount[] = [];
  if (actual) {
    let net = 0;
    for (const l of actual.lines) {
      if (l.kind !== "INCOME" && l.kind !== "EXPENSE") throw new Error("The Profit and Loss could not be read.");
      const amount = sen(l.amount);
      net += l.kind === "INCOME" ? amount : -amount;
      // The statement lists accounts at RM 0.00 too, headings among them; an
      // account with nothing on it adds nothing and earns no line of its own.
      if (amount === 0) continue;
      actualBy.set(l.code, (actualBy.get(l.code) ?? 0) + amount);
      if (!byCode.has(l.code) && !extra.some((e) => e.code === l.code)) {
        extra.push({ code: l.code, name: l.name ?? l.code, kind: l.kind, active: false, block: l.kind === "INCOME" ? "income" : "expense" });
      }
    }
    if (net !== sen(actual.net)) throw new Error("The Profit and Loss could not be read.");
  }

  // Planned income first: every share is taken of it.
  let basis = 0;
  for (const [code, cell] of plan) {
    if (byCode.get(code)!.kind === "INCOME" && "amount" in cell) basis += Math.round(cell.amount * 100);
  }

  const shown = [...accounts, ...extra].filter((a) => a.active || plan.has(a.code) || actualBy.has(a.code));
  const order = new Map(FORECAST_BLOCKS.map((b, i) => [b, i]));
  // Stable: the chart's order inside each block, an extra account last in its block.
  const sorted = shown.map((a, i) => ({ a, i })).sort((x, y) => order.get(x.a.block)! - order.get(y.a.block)! || x.i - y.i);

  const lines: ForecastLine[] = sorted.map(({ a }) => {
    const cell = plan.get(a.code) ?? null;
    const planned = cell === null ? null : "amount" in cell ? Math.round(cell.amount * 100) : shareAmount(basis, cell.share);
    const share = cell === null ? null : "share" in cell ? cell.share : amountShare(planned!, basis);
    const act = actual ? (actualBy.get(a.code) ?? 0) : null;
    return { account: a, cell, plan: planned, share, actual: act, difference: act === null ? null : act - (planned ?? 0) };
  });

  const sum = (b: ForecastBlock, pick: (l: ForecastLine) => number | null) =>
    lines.filter((l) => l.account.block === b).reduce((t, l) => t + (pick(l) ?? 0), 0);
  const act = (b: ForecastBlock) => (actual ? sum(b, (l) => l.actual) : null);
  const blocks = Object.fromEntries(FORECAST_BLOCKS.map((b) => [b, figure(sum(b, (l) => l.plan), basis, act(b))])) as Record<ForecastBlock, ForecastFigure>;
  const minus = (x: number | null, y: number | null) => (x === null || y === null ? null : x - y);
  const gross = figure(blocks.income.plan - blocks.cost.plan, basis, minus(blocks.income.actual, blocks.cost.actual));
  const net = figure(gross.plan - blocks.expense.plan, basis, minus(gross.actual, blocks.expense.actual));
  return { basis, lines, blocks, gross, net };
}

/** A share as a percentage with two decimals (1250 → "12.50%"), or "" for none. */
export function shareWord(bp: number | null): string {
  return bp === null ? "" : `${(bp / 100).toFixed(2)}%`;
}

export type Typed = { ok: true; value: number } | { ok: false; words: string } | null;

/** The amount box as typed, in ringgit: commas and spaces are allowed; blank is null. */
export function readTypedAmount(text: string): Typed {
  const t = text.replace(/[\s,]/g, "");
  if (t === "") return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return { ok: false, words: AMOUNT_WORDS };
  const v = Number(t);
  if (Math.abs(v) >= FORECAST_MAX_AMOUNT) return { ok: false, words: AMOUNT_WORDS };
  return { ok: true, value: Math.round(v * 100) / 100 };
}

/** The share box as typed, in basis points: a % sign and spaces are allowed; blank is null. */
export function readTypedShare(text: string): Typed {
  const t = text.replace(/[\s%]/g, "");
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { ok: false, words: SHARE_WORDS };
  const v = Math.round(Number(t) * 100);
  if (v > FORECAST_MAX_SHARE_BP) return { ok: false, words: SHARE_WORDS };
  return { ok: true, value: v };
}

/**
 * The cells to save: the current ones, and every cell of `previous` on an
 * account that has none now and can still be planned. A typed cell is never
 * overwritten.
 */
export function copyPlan(
  accounts: readonly ForecastAccount[],
  current: Readonly<Record<string, ForecastCell>>,
  previous: Readonly<Record<string, ForecastCell>>,
): Record<string, ForecastCell> {
  const out: Record<string, ForecastCell> = { ...current };
  for (const a of accounts) {
    const p = previous[a.code];
    if (!p || out[a.code] || !a.active) continue;
    if (a.kind === "INCOME" && "share" in p) continue;
    out[a.code] = p;
  }
  return out;
}
