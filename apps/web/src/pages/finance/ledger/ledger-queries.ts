/**
 * The Finance Ledger reads — Journal, one entry, the chart, Trial Balance and
 * Self-check. Read-only: nothing here writes, so nothing here invalidates.
 *
 * Kept beside the ledger pages instead of in `lib/queries.ts` so the three
 * pages (and their tests) own one small file, and the shared hooks file does
 * not grow for a surface only Finance reads.
 */
import { useQuery } from "@tanstack/react-query";
import type {
  LedgerChart,
  LedgerEntriesPage,
  LedgerEntryDetail,
  LedgerEntryRow,
  LedgerSelfCheck,
  TrialBalanceReport,
} from "@carres/shared/finance-ledger";
import { apiFetch } from "@/lib/api";
import { departmentSearch } from "../department";

/** What the Journal is narrowed to on the server. Everything else (source,
 *  date, search) narrows the rows already in hand. */
export interface JournalScope {
  account: string | null;
  from: string | null;
  to: string | null;
  /** 0540: "TYPE" or "TYPE:id"; "" or absent = every department. */
  dept?: string;
}

export const ledgerKeys = {
  all: () => ["finance", "ledger"] as const,
  entries: (scope: JournalScope) => ["finance", "ledger", "entries", scope] as const,
  entry: (ref: string) => ["finance", "ledger", "entry", ref] as const,
  chart: () => ["finance", "ledger", "chart"] as const,
  trialBalance: (asOf: string, dept = "") => ["finance", "ledger", "trial-balance", asOf, dept] as const,
  selfCheck: () => ["finance", "ledger", "self-check"] as const,
};

/** The server's page size is PostgREST's own row cap. */
export const JOURNAL_PAGE_SIZE = 1000;
/** Ten pages, newest first. Past that the page says so and asks for a narrower scope. */
export const JOURNAL_MAX_PAGES = 10;

export interface JournalRead {
  rows: LedgerEntryRow[];
  total: number;
  /** True when the scope holds more entries than the Journal reads at once. */
  capped: boolean;
}

const JOURNAL_FAILED = "The Journal could not be loaded. Try again.";

/** Every entry in the scope, newest first, read in pages until the server's
 *  own count is reached. A short or shifting read fails closed: a partial
 *  list is never shown as the whole Journal. */
export async function readJournal(scope: JournalScope): Promise<JournalRead> {
  const rows: LedgerEntryRow[] = [];
  let total: number | null = null;
  for (let page = 0; page < JOURNAL_MAX_PAGES; page += 1) {
    const q = new URLSearchParams({ offset: String(rows.length), limit: String(JOURNAL_PAGE_SIZE) });
    if (scope.account) q.set("account", scope.account);
    if (scope.from) q.set("from", scope.from);
    if (scope.to) q.set("to", scope.to);
    for (const [k, v] of Object.entries(departmentSearch(scope.dept))) q.set(k, v);
    const res = await apiFetch<LedgerEntriesPage>(`/api/finance/ledger/entries?${q.toString()}`);
    if (!Array.isArray(res.rows) || !Number.isInteger(res.total) || res.total < 0) throw new Error(JOURNAL_FAILED);
    if (total !== null && total !== res.total) throw new Error("The Journal changed while it loaded. Try again.");
    total = res.total;
    rows.push(...res.rows);
    if (rows.length >= total) break;
    if (res.rows.length === 0) throw new Error(JOURNAL_FAILED);
  }
  const count = total ?? 0;
  if (rows.length > count || new Set(rows.map((r) => r.id)).size !== rows.length) {
    throw new Error("The Journal changed while it loaded. Try again.");
  }
  return { rows, total: count, capped: rows.length < count };
}

export function useLedgerEntries(scope: JournalScope) {
  return useQuery({
    queryKey: ledgerKeys.entries(scope),
    queryFn: () => readJournal(scope),
  });
}

/** One account's balance after each entry that moved it. */
export interface AccountBalances {
  /** The account's kind from the chart: it says which side the balance sits on. */
  kind: string;
  /** Entry number → the balance after that entry's last line on the account,
   *  positive on the account's own side (debit for ASSET and EXPENSE, credit
   *  for the rest), exactly as the database counts it. */
  after: Map<string, number>;
}

const BALANCES_FAILED = "The running balances could not be loaded. Try again.";

/**
 * The account ledger (`gl_account_ledger`, 0540) read as a balance per entry.
 * The database adds up the running balance itself, starting from the opening
 * balance (everything posted before `from`), so a date range, a department or
 * the Journal's own paging never changes the figure on a line. Refused unless
 * it answered OK for this account, its last running balance is its closing
 * balance, and every figure is a number: a partial answer is never shown.
 */
export function parseAccountBalances(body: unknown, account: string): AccountBalances {
  const b = body as { status?: unknown; account_code?: unknown; kind?: unknown; rows?: unknown } | null;
  if (!b || b.status !== "OK" || b.account_code !== account || typeof b.kind !== "string" || !Array.isArray(b.rows)) {
    throw new Error(BALANCES_FAILED);
  }
  const rows = b.rows as Record<string, unknown>[];
  const closing = rows.filter((r) => r.row_kind === "CLOSING");
  if (closing.length !== 1 || rows[0]?.row_kind !== "OPENING") throw new Error(BALANCES_FAILED);
  const after = new Map<string, number>();
  let last = rows[0].running_balance;
  for (const r of rows) {
    if (r.row_kind !== "LINE") continue;
    if (typeof r.entry_no !== "string" || typeof r.running_balance !== "number") throw new Error(BALANCES_FAILED);
    // Lines arrive in the ledger's order, so an entry's last line wins.
    after.set(r.entry_no, r.running_balance);
    last = r.running_balance;
  }
  if (typeof last !== "number" || last !== closing[0]!.running_balance) throw new Error(BALANCES_FAILED);
  return { kind: b.kind, after };
}

/**
 * The balances for the Journal narrowed to one account. `oldest` and `newest`
 * are the dates of the oldest and newest entries the Journal holds: with no
 * dates picked the read covers exactly them, and the opening balance carries
 * everything before the oldest. So a Journal cut to its newest entries still
 * shows true balances, and the read never grows past the entries on the page.
 * ponytail: the account ledger refuses more than 20,000 lines (422); a
 * Journal of 10,000 entries on one account stays inside that unless entries
 * average two lines on it. Page the ledger read if that ever happens.
 */
export function useAccountBalances(scope: JournalScope, oldest: string | null, newest: string | null) {
  const account = scope.account;
  const from = scope.from ?? oldest;
  const to = scope.to ?? newest;
  return useQuery({
    queryKey: [...ledgerKeys.all(), "balances", account ?? "", from ?? "", to ?? "", scope.dept ?? ""] as const,
    queryFn: async () => {
      const q = new URLSearchParams({ account: account!, from: from!, to: to!, ...departmentSearch(scope.dept) });
      return parseAccountBalances(await apiFetch<unknown>(`/api/finance/ledger/account-ledger?${q.toString()}`), account!);
    },
    enabled: Boolean(account && from && to && from <= to),
  });
}

/** One entry with its lines, by entry number or id. */
export function useLedgerEntry(ref: string | null) {
  return useQuery({
    queryKey: ledgerKeys.entry(ref ?? ""),
    queryFn: () => apiFetch<LedgerEntryDetail>(`/api/finance/ledger/entries/${encodeURIComponent(ref ?? "")}`),
    enabled: Boolean(ref),
    // A number nobody has is an answer, not a flaky read.
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 2,
  });
}

export function useLedgerChart() {
  return useQuery({
    queryKey: ledgerKeys.chart(),
    queryFn: () => apiFetch<LedgerChart>("/api/finance/ledger/accounts"),
    staleTime: 5 * 60_000,
  });
}

/** The Trial Balance read, as options — the page's hook and the Dashboard's month-end pack share it. */
export function trialBalanceQuery(asOf: string, dept = "") {
  const q = new URLSearchParams({ asOf, ...departmentSearch(dept) });
  return {
    queryKey: ledgerKeys.trialBalance(asOf, dept),
    queryFn: () => apiFetch<TrialBalanceReport>(`/api/finance/ledger/trial-balance?${q.toString()}`),
    retry: (count: number, error: unknown) => (error as { status?: number }).status !== 409 && count < 2,
  };
}

export function useTrialBalance(asOf: string, dept = "") {
  return useQuery(trialBalanceQuery(asOf, dept));
}

/** How many entries the Dashboard's Activity card lists. */
export const LATEST_ENTRIES = 8;

/**
 * The newest posted entries from `from` (the ledger's go-live) on — the same
 * `/entries` read and row shape the Journal uses, one short page instead of
 * the whole Journal. A malformed answer is an error, never an empty list.
 */
export function useLatestLedgerEntries(from: string | null) {
  return useQuery({
    queryKey: [...ledgerKeys.all(), "latest", from ?? "", LATEST_ENTRIES] as const,
    queryFn: async () => {
      const q = new URLSearchParams({ offset: "0", limit: String(LATEST_ENTRIES), from: from ?? "" });
      const res = await apiFetch<LedgerEntriesPage>(`/api/finance/ledger/entries?${q.toString()}`);
      if (!Array.isArray(res?.rows) || !Number.isInteger(res.total)) throw new Error(JOURNAL_FAILED);
      return res.rows;
    },
    enabled: Boolean(from),
  });
}

export function useLedgerSelfCheck() {
  return useQuery({
    queryKey: ledgerKeys.selfCheck(),
    queryFn: () => apiFetch<LedgerSelfCheck>("/api/finance/ledger/self-check"),
    // A check is read when asked for; a window refocus is not a question.
    refetchOnWindowFocus: false,
  });
}
