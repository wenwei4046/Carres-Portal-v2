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
  CardRouteInput,
  CardRouteRow,
  MoneyAccountAddInput,
  MoneyAccountRow,
  MoneyAccountUpdateInput,
} from "@carres/shared/money-accounts";
import type {
  LedgerAccountAddInSectionInput,
  LedgerAccountEditInput,
  LedgerBooksClosed,
  LedgerChartImportInput,
  LedgerChartImportResult,
  LedgerPostingAccountSetInput,
  LedgerPostingAccounts,
} from "@carres/shared";

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

/** 0541 — which bank each card holding account pays out to. */
export function useCardRoutes() {
  return useQuery({
    queryKey: ["finance", "card-routes"] as const,
    queryFn: () => apiFetch<CardRouteRow[]>(`${BASE}/card-routes`),
    staleTime: 5 * 60_000,
  });
}

export function useSaveCardRoute() {
  const qc = useQueryClient();
  return useMutation<CardRouteRow, Error, CardRouteInput>({
    mutationFn: (v) => apiFetch(`${BASE}/card-routes`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "card-routes"] }),
  });
}

/** One chart account's name (0539) and, since 0550, its number. The chart read
 *  is `useLedgerChart`; the ["finance"] refresh re-reads it with everything
 *  else, which matters far more for a number than for a name — a new number is
 *  carried to every row that names the account, so any screen holding the old
 *  one is stale. `newCode` equal to the current number is left out of the body:
 *  the door reads a missing number as "keep this one". */
export function useSaveAccount() {
  const qc = useQueryClient();
  return useMutation<{ code: string }, Error, { code: string; name: string; newCode?: string }>({
    mutationFn: (v) =>
      apiFetch(`/api/finance/ledger/accounts/${v.code}`, {
        method: "PATCH",
        body: JSON.stringify(v.newCode && v.newCode !== v.code ? { name: v.name, code: v.newCode } : { name: v.name }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}

/** 0656 — add an account or heading in one of AutoCount's sections. The drag
 *  that reordered and moved accounts (0557, 0570) is gone from the screen:
 *  the chart reads by number, and the heading an account sits under is
 *  changed in its edit window (useEditAccount). */
export function useAddAccountInSection() {
  const qc = useQueryClient();
  return useMutation<{ code: string }, Error, LedgerAccountAddInSectionInput>({
    mutationFn: (v) => apiFetch("/api/finance/ledger/accounts/in-section", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}

/** 0656 — edit one account in one act: name, number, section and the heading
 *  it sits under. A new number is carried everywhere, so the whole ["finance"]
 *  tree is read again. */
export function useEditAccount() {
  const qc = useQueryClient();
  return useMutation<{ code: string }, Error, { code: string; input: LedgerAccountEditInput }>({
    mutationFn: (v) => apiFetch(`/api/finance/ledger/accounts/${v.code}`, { method: "PUT", body: JSON.stringify(v.input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}

/** 0656 — retire an account the ledger never posted to, or bring one back. */
export function useSetAccountActive() {
  const qc = useQueryClient();
  return useMutation<{ code: string; active: boolean }, Error, { code: string; active: boolean }>({
    mutationFn: (v) =>
      apiFetch(`/api/finance/ledger/accounts/${v.code}/active`, { method: "POST", body: JSON.stringify({ active: v.active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}

/** 0657 — the account each posting the system makes goes to, and the latest changes. */
export function usePostingAccounts() {
  return useQuery({
    queryKey: ["finance", "posting-accounts"] as const,
    queryFn: () => apiFetch<LedgerPostingAccounts>("/api/finance/ledger/posting-accounts"),
  });
}

/** 0657 — change the account one posting goes to. `was` is the account the
 *  screen showed; the database refuses with 409 when someone changed it
 *  since. Everything under ["finance"] is read again: a report or picker that
 *  reads a role must see the new account at once. */
export function useSetPostingAccount() {
  const qc = useQueryClient();
  return useMutation<{ changed: boolean }, Error, LedgerPostingAccountSetInput>({
    mutationFn: (v) => apiFetch("/api/finance/ledger/posting-accounts", { method: "PUT", body: JSON.stringify(v) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}

/** 0655 — AutoCount's printed chart. `apply: false` only asks what the import
 *  would do, so nothing is refreshed; `apply: true` makes accounts, and the
 *  whole ["finance"] tree is read again, as after any chart change. */
export function useImportChart() {
  const qc = useQueryClient();
  return useMutation<LedgerChartImportResult, Error, LedgerChartImportInput>({
    mutationFn: (v) => apiFetch("/api/finance/ledger/accounts/import", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: (_d, v) => {
      if (v.apply) void qc.invalidateQueries({ queryKey: ["finance"] });
    },
  });
}

/** 0622 — the last closed day. Finance and principal read it; only the principal saves it. */
export function useBooksClosed() {
  return useQuery({
    queryKey: ["finance", "books-closed"] as const,
    queryFn: () => apiFetch<LedgerBooksClosed>("/api/finance/ledger/books-closed"),
  });
}

export function useSaveBooksClosed() {
  const qc = useQueryClient();
  return useMutation<LedgerBooksClosed, Error, LedgerBooksClosed>({
    mutationFn: (v) => apiFetch("/api/finance/ledger/books-closed", { method: "PUT", body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "books-closed"] }),
  });
}
