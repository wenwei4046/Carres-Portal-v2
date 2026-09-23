/**
 * Reads and writes for card settlement (migration 0572). A match changes the
 * review only; nothing here reaches the ledger.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CardAcquirer, CardSettlementReview } from "@carres/shared/card-settlement";
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
    apiFetch<{ rows: number; imported: number; matched: number }>(`${BASE}/import`, { method: "POST", body: JSON.stringify(v) }),
  );

export const useMatchCardRow = () =>
  useReviewMutation((v: { rowId: string; paymentId: string | null }) =>
    apiFetch(`${BASE}/rows/${v.rowId}/match`, { method: "POST", body: JSON.stringify({ paymentId: v.paymentId }) }),
  );
