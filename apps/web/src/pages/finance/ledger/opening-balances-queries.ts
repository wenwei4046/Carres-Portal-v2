/**
 * Opening balances (migration 0705): the page's one read, its writes, and the
 * small state read every report caption asks — `Brought forward` once Finance
 * has posted them, `No opening balances` until then.
 *
 * The keys sit under the ledger's own, so a posted or reversed opening (and a
 * manual journal) refreshes every ledger read at once.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OpeningAccountsInput,
  OpeningAnswer,
  OpeningDepositsInput,
  OpeningPartyInput,
  OpeningState,
  OpeningStockInput,
} from "@carres/shared/opening-balances";
import { apiFetch } from "@/lib/api";
import { ledgerKeys } from "./ledger-queries";

export const openingKeys = {
  read: () => [...ledgerKeys.all(), "opening-balances"] as const,
  state: () => [...ledgerKeys.all(), "opening-state"] as const,
};

const BASE = "/api/finance/opening-balances";

export const openingStateQuery = () => ({
  queryKey: openingKeys.state(),
  queryFn: () => apiFetch<OpeningState>(`${BASE}/state`),
  staleTime: 60_000,
});

/** True once the opening balances are posted. A read that fails or is still
 *  out says false: the caption then keeps the words it always had. */
export function useOpeningPosted(): boolean {
  const q = useQuery({ ...openingStateQuery(), retry: false });
  return q.data?.status === "posted";
}

/** The second half of every report's caption (COPY-STANDARD, Opening balances). */
export const openingWords = (posted: boolean) => (posted ? "Brought forward" : "No opening balances");

/** For a workbook written outside a component: the cached state, or false. */
export async function readOpeningPosted(qc: import("@tanstack/react-query").QueryClient): Promise<boolean> {
  try {
    return (await qc.fetchQuery(openingStateQuery())).status === "posted";
  } catch {
    return false;
  }
}

export function useOpeningBalances() {
  return useQuery({
    queryKey: openingKeys.read(),
    queryFn: () => apiFetch<OpeningAnswer>(BASE),
    refetchOnWindowFocus: false,
  });
}

function useOpeningWrite<I>(path: (input: I) => string, method: "PUT" | "POST", body: (input: I) => unknown = (i) => i) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: I) => apiFetch<unknown>(`${BASE}${path(input)}`, { method, body: JSON.stringify(body(input)) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ledgerKeys.all() }),
  });
}

export const useSaveOpeningAccounts = () => useOpeningWrite<OpeningAccountsInput>(() => "/accounts", "PUT");
export const useSaveOpeningParty = () => useOpeningWrite<OpeningPartyInput>(() => "/parties", "POST");
export const useRemoveOpeningParty = () =>
  useOpeningWrite<{ id: string; was: string }>((i) => `/parties/${i.id}/remove`, "POST", (i) => ({ was: i.was }));
export const useSaveOpeningStock = () => useOpeningWrite<OpeningStockInput>(() => "/stock", "PUT");
export const useSaveOpeningDeposits = () => useOpeningWrite<OpeningDepositsInput>(() => "/deposits", "PUT");
export const usePostOpening = () => useOpeningWrite<{ was: string }>(() => "/post", "POST");
export const useReverseOpening = () => useOpeningWrite<{ reason: string }>(() => "/reverse", "POST");
