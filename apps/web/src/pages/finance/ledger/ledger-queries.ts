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
import { decodeDepartment, departmentSearch } from "../department";

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
    for (const [k, v] of Object.entries(departmentSearch(decodeDepartment(scope.dept)))) q.set(k, v);
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
  const q = new URLSearchParams({ asOf, ...departmentSearch(decodeDepartment(dept)) });
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
