/**
 * Reads and writes for money moves (migration 0529). Every write refreshes
 * everything under ["finance"]: an approved move changes the ledger too.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MoneyMoveInput, MoneyMoveRow } from "@carres/shared/money-moves";
import { apiFetch } from "@/lib/api";

const BASE = "/api/finance/money-moves";
const ROOT = ["finance", "money-moves"] as const;

export function useMoneyMoves() {
  return useQuery({ queryKey: [...ROOT, "list"], queryFn: () => apiFetch<MoneyMoveRow[]>(BASE) });
}

/** Whether this person holds the finance approver duty. The server decides again on the press. */
export function useMoneyMovesMe() {
  return useQuery({ queryKey: [...ROOT, "me"], queryFn: () => apiFetch<{ mayApprove: boolean }>(`${BASE}/me`) });
}

function useFinanceMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, TVars>({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}

export const usePrepareMoneyMove = () =>
  useFinanceMutation((input: MoneyMoveInput) => apiFetch(BASE, { method: "POST", body: JSON.stringify(input) }));

export const useApproveMoneyMove = () =>
  useFinanceMutation((id: string) => apiFetch(`${BASE}/${id}/approve`, { method: "POST" }));

export const useCancelMoneyMove = () =>
  useFinanceMutation((v: { id: string; reason: string }) =>
    apiFetch(`${BASE}/${v.id}/reverse`, { method: "POST", body: JSON.stringify({ reason: v.reason }) }),
  );
