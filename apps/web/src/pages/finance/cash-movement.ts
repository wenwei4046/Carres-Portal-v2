/**
 * Cash movement — the ONE place the Finance Dashboard adds up money in and out
 * of Carres's cash and bank accounts (Law D: one arithmetic for the Net cash
 * tile and the Cashflow chart).
 *
 * Source: the ledger's own `gl_account_ledger` (0469), read per account through
 * `GET /api/finance/ledger/account-ledger`. It never reads `payments` or the
 * retired 0062–0064 cashflow functions.
 *
 * WHICH ACCOUNTS. Every posting account on the money-accounts list
 * (`gl_money_accounts`, sent with the chart as `money_accounts`), wherever it
 * sits in the chart. No heading, number or number range decides it, so a
 * renumbered chart, or a CASH IN HAND kept outside the bank heading, still
 * adds up. A retired money account still counts: money that moved through it
 * moved.
 *
 * A MOVEMENT, NEVER A BALANCE. The ledger holds no opening balances, so the
 * figure is money in less money out over the weeks shown — never "cash on
 * hand". Nothing before the ledger's go-live is read: the first week starts
 * no earlier than go-live.
 *
 * PER ENTRY. An entry's lines on cash accounts are netted first, so moving
 * money from the cash drawer to the bank (one entry, in on one cash account
 * and out on another) is neither In nor Out.
 *
 * PER ACCOUNT. Lines read from go-live give each account its own in, out and
 * net since go-live. There a move between two cash accounts is Out on one and
 * In on the other, so the accounts' figures do not add up to the weekly totals.
 *
 * TWO WINDOWS, TWO READS, TWO FAILURES. The tile and the chart read only the
 * twelve weeks they show; the per-account panel reads from go-live. While the
 * two windows are the same day — they are until the ledger is twelve weeks old
 * — the query key is the same and React Query makes the request once. Once they
 * part, one window failing leaves the other's surfaces standing: a panel added
 * later may not blank a tile and a chart that worked before it.
 */
import { useQuery } from "@tanstack/react-query";
import type { LedgerAccount, LedgerChart } from "@carres/shared/finance-ledger";
import { apiFetch } from "@/lib/api";
import { ledgerKeys } from "./ledger/ledger-queries";

/** How many weeks the tile and the chart cover. */
export const CASH_WEEKS = 12;

const DAY_MS = 86_400_000;
const cents = (n: number) => Math.round(n * 100);

/** The money accounts that take postings, in chart order. Empty when the
 *  chart came without its money-accounts list; the read then fails visibly. */
export function cashAccounts(chart: LedgerChart): LedgerAccount[] {
  const money = new Set(chart.money_accounts ?? []);
  return chart.accounts.filter((a) => !a.is_header && money.has(a.code));
}

const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fromDay = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export interface CashWeek {
  /** Monday, or the go-live day for the week the ledger started in. */
  from: string;
  /** Sunday, or today for the week in progress. */
  to: string;
}

/**
 * The last twelve Monday-to-Sunday weeks up to `today` (Malaysia day), this
 * week included. Weeks that ended before go-live are dropped; the week go-live
 * falls in starts on the go-live day.
 */
export function cashWeeks(goLive: string, today: string): CashWeek[] {
  const t = fromDay(today);
  const monday = t - (((new Date(t).getUTCDay() + 6) % 7) * DAY_MS);
  const weeks: CashWeek[] = [];
  for (let i = CASH_WEEKS - 1; i >= 0; i -= 1) {
    const start = monday - i * 7 * DAY_MS;
    const end = Math.min(start + 6 * DAY_MS, t);
    if (toDay(end) < goLive) continue;
    weeks.push({ from: toDay(start) < goLive ? goLive : toDay(start), to: toDay(end) });
  }
  return weeks;
}

/** One ledger line on a cash account, as the account ledger served it. */
export interface CashLine {
  account: string;
  entryNo: string;
  entryDate: string;
  debit: number;
  credit: number;
}

export interface CashWeekMovement extends CashWeek {
  moneyIn: number;
  moneyOut: number;
  net: number;
}

export interface CashMovement {
  goLiveOn: string;
  weeks: CashWeekMovement[];
  moneyIn: number;
  moneyOut: number;
  net: number;
  /** True while fewer than twelve whole weeks have passed since go-live. */
  short: boolean;
}

export interface CashAccountMovement {
  code: string;
  name: string;
  moneyIn: number;
  moneyOut: number;
  net: number;
}

/** Each account's in, out and net over the lines, netted per entry on that account. An account nothing moved through reads 0.00. */
export function accountMovement(lines: readonly CashLine[], accounts: readonly Pick<LedgerAccount, "code" | "name">[]): CashAccountMovement[] {
  return accounts.map(({ code, name }) => {
    const byEntry = new Map<string, number>();
    for (const l of lines) {
      if (l.account === code) byEntry.set(l.entryNo, (byEntry.get(l.entryNo) ?? 0) + cents(l.debit) - cents(l.credit));
    }
    let inC = 0;
    let outC = 0;
    for (const n of byEntry.values()) {
      if (n > 0) inC += n; else outC -= n;
    }
    return { code, name, moneyIn: inC / 100, moneyOut: outC / 100, net: (inC - outC) / 100 };
  });
}

/** Weekly in, out and net over the lines — per entry, so a move between two cash accounts nets to nothing. */
export function weeklyCashMovement(lines: readonly CashLine[], weeks: readonly CashWeek[], goLiveOn: string): CashMovement {
  const byEntry = new Map<string, { date: string; net: number }>();
  for (const l of lines) {
    const e = byEntry.get(l.entryNo) ?? { date: l.entryDate, net: 0 };
    e.net += cents(l.debit) - cents(l.credit);
    byEntry.set(l.entryNo, e);
  }
  const out: CashWeekMovement[] = weeks.map((w) => {
    let inC = 0;
    let outC = 0;
    for (const e of byEntry.values()) {
      if (e.date < w.from || e.date > w.to) continue;
      if (e.net > 0) inC += e.net; else outC -= e.net;
    }
    return { ...w, moneyIn: inC / 100, moneyOut: outC / 100, net: (inC - outC) / 100 };
  });
  const inC = out.reduce((s, w) => s + cents(w.moneyIn), 0);
  const outC = out.reduce((s, w) => s + cents(w.moneyOut), 0);
  const first = weeks[0];
  const short = weeks.length < CASH_WEEKS || (first !== undefined && first.from === goLiveOn
    && new Date(fromDay(goLiveOn)).getUTCDay() !== 1);
  return { goLiveOn, weeks: out, moneyIn: inC / 100, moneyOut: outC / 100, net: (inC - outC) / 100, short };
}

// ── the read ────────────────────────────────────────────────────────────────

const CASH_FAILED = "Cash and bank could not be loaded.";
type Raw = Record<string, unknown>;

const moneyOf = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new Error(CASH_FAILED);
  return n;
};

/**
 * One account's lines between `from` and `to`. Refused unless the account
 * ledger answered OK for exactly that account and window, every line falls
 * inside it, and the lines add up to the closing row's own totals: a partial
 * answer must never print as a whole one.
 */
export function parseAccountLedger(body: unknown, account: string, from: string, to: string): CashLine[] {
  const b = body as { status?: unknown; account_code?: unknown; rows?: unknown } | null;
  if (!b || b.status !== "OK" || b.account_code !== account || !Array.isArray(b.rows)) throw new Error(CASH_FAILED);
  const rows = b.rows as Raw[];
  const closing = rows.filter((r) => r.row_kind === "CLOSING");
  if (closing.length !== 1) throw new Error(CASH_FAILED);
  const lines: CashLine[] = [];
  for (const r of rows) {
    if (r.row_kind !== "LINE") continue;
    const date = r.entry_date;
    if (typeof date !== "string" || date < from || date > to || typeof r.entry_no !== "string") throw new Error(CASH_FAILED);
    lines.push({ account, entryNo: r.entry_no, entryDate: date, debit: moneyOf(r.debit), credit: moneyOf(r.credit) });
  }
  const dr = lines.reduce((s, l) => s + cents(l.debit), 0);
  const cr = lines.reduce((s, l) => s + cents(l.credit), 0);
  if (dr !== cents(moneyOf(closing[0]!.debit)) || cr !== cents(moneyOf(closing[0]!.credit))) throw new Error(CASH_FAILED);
  return lines;
}

/**
 * One read per cash account over ONE window, flattened. Both hooks below build
 * their query from this, so while their windows are equal the key is equal and
 * the request is made once; when the windows differ so do the reads, the cache
 * entries and the failures.
 */
function cashLinesQuery(codes: readonly string[], from: string | null, to: string) {
  return {
    queryKey: [...ledgerKeys.all(), "cash-lines", from ?? "", to, codes.join(",")] as const,
    queryFn: async (): Promise<CashLine[]> => {
      if (codes.length === 0) throw new Error(CASH_FAILED);
      // Nothing has moved yet when today is still before go-live.
      if (!from) return [];
      const read = await Promise.all(codes.map(async (code) => {
        const q = new URLSearchParams({ account: code, from, to });
        return parseAccountLedger(await apiFetch<unknown>(`/api/finance/ledger/account-ledger?${q.toString()}`), code, from, to);
      }));
      return read.flat();
    },
  };
}

/**
 * Where the tile and the chart start reading: the first week they show, never
 * go-live. This is the whole bound — twelve weeks of lines at most, however old
 * the ledger gets. Null while today is still before go-live.
 */
export const weeklyReadFrom = (weeks: readonly CashWeek[]): string | null => weeks[0]?.from ?? null;

/** The Net cash tile and the Cashflow chart. Waits for the chart (it names the accounts and go-live). */
export function useCashMovement(chart: LedgerChart | undefined, today: string) {
  const goLive = chart?.go_live_on ?? null;
  const codes = chart ? cashAccounts(chart).map((a) => a.code) : [];
  const weeks = goLive ? cashWeeks(goLive, today) : [];
  return useQuery({
    ...cashLinesQuery(codes, weeklyReadFrom(weeks), today),
    enabled: Boolean(goLive),
    select: (lines): CashMovement => weeklyCashMovement(lines, weeks, goLive ?? ""),
  });
}

/**
 * The per-account panel. Its window starts at go-live because movement since
 * the ledger started is what the panel is FOR; cutting it to twelve weeks would
 * answer a different question.
 * ponytail: that window grows forever, so one day an account passes the API's
 * 20,000-line cap and this read alone fails — the tile and the chart no longer
 * go with it. Add a server-side per-account sum when one does.
 */
export function useCashAccountMovement(chart: LedgerChart | undefined, today: string) {
  const goLive = chart?.go_live_on ?? null;
  const accounts = chart ? cashAccounts(chart) : [];
  const started = goLive !== null && cashWeeks(goLive, today).length > 0;
  return useQuery({
    ...cashLinesQuery(accounts.map((a) => a.code), started ? goLive : null, today),
    enabled: Boolean(goLive),
    select: (lines): CashAccountMovement[] => accountMovement(lines, accounts),
  });
}
