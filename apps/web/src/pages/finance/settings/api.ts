/**
 * The one list of money accounts (migration 0512) — read by Finance → Settings
 * and by every Paid from / Received into picker, written only on Settings.
 *
 * Kept beside the page rather than in `lib/queries.ts` so this slice adds a
 * file instead of editing a shared one. A write refreshes everything under
 * ["finance"]: a renamed bank must read the same on the chart, the pickers and
 * the ledger at once.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MoneyAccountAddInput,
  MoneyAccountRow,
  MoneyAccountUpdateInput,
} from "@carres/shared/money-accounts";
import { apiFetch } from "@/lib/api";

const BASE = "/api/finance/ledger/money-accounts";

export const moneyAccountKeys = { list: () => ["finance", "money-accounts"] as const };

export function useMoneyAccounts() {
  return useQuery({
    queryKey: moneyAccountKeys.list(),
    queryFn: () => apiFetch<MoneyAccountRow[]>(BASE),
    staleTime: 5 * 60_000,
  });
}

export function useSaveMoneyAccount() {
  const qc = useQueryClient();
  return useMutation<{ code: string }, Error, { code: null; input: MoneyAccountAddInput } | { code: string; input: MoneyAccountUpdateInput }>({
    mutationFn: (v) =>
      v.code === null
        ? apiFetch(BASE, { method: "POST", body: JSON.stringify(v.input) })
        : apiFetch(`${BASE}/${v.code}`, { method: "PATCH", body: JSON.stringify(v.input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}
