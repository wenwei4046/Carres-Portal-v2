/**
 * Reads and writes for card settlement (migration 0572). A match changes the
 * review only; Approve day prepares a money move, which posts nothing until
 * the finance approver approves it.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CardAcquirer, CardSettlementDay, CardSettlementReview } from "@carres/shared/card-settlement";
import type { MoneyMoveInput } from "@carres/shared/money-moves";
import { apiFetch } from "@/lib/api";

const BASE = "/api/finance/card-settlement";
const ROOT = ["finance", "card-settlement"] as const;

export function useCardSettlement() {
  return useQuery({ queryKey: [...ROOT, "review"], queryFn: () => apiFetch<CardSettlementReview>(BASE) });
}

function useReviewMutation<TVars, TOut>(fn: (vars: TVars) => Promise<TOut>) {
  const qc = useQueryClient();
  return useMutation<TOut, Error, TVars>({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ROOT }),
  });
}

export const useImportCardFile = () =>
  useReviewMutation((v: { acquirer: CardAcquirer; fileName: string; content: string }) =>
    apiFetch<{ rows: number; imported: number; matched: number; released?: number }>(`${BASE}/import`, { method: "POST", body: JSON.stringify(v) }),
  );

export const useMatchCardRow = () =>
  useReviewMutation((v: { rowId: string; paymentId: string | null }) =>
    apiFetch(`${BASE}/rows/${v.rowId}/match`, { method: "POST", body: JSON.stringify({ paymentId: v.paymentId }) }),
  );

/** Approve day: the form's date, accounts and note; the database takes the day's net, fee and reference from the file. */
export const usePrepareCardPayout = (day: CardSettlementDay | null) => {
  const qc = useQueryClient();
  return useMutation<unknown, Error, MoneyMoveInput>({
    mutationFn: (v) =>
      apiFetch(`${BASE}/days/payout`, {
        method: "POST",
        body: JSON.stringify({
          acquirer: day?.acquirer,
          dayDate: day?.day_date,
          groupKey: day?.group_key,
          moveDate: v.move_date,
          fromAccountCode: v.from_account_code,
          toAccountCode: v.to_account_code,
          note: v.note ?? null,
          idempotencyKey: v.idempotency_key,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });
};
