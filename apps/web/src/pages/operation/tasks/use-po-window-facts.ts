/**
 * The purchase batches' facts for a task's words, from the same SO Batch read
 * the Work items were projected from. Read only while a batch is listed.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { poWindowWorkFromSoBatch, soBatchPurchaseResponseSchema, type SoBatchPurchaseResponse } from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { useOperationSuppliers } from "@/lib/queries";
import type { PoWindowFacts } from "./tasks-model";

export function usePoWindowFacts(enabled: boolean): Map<string, PoWindowFacts> {
  const demands = useQuery<SoBatchPurchaseResponse>({
    queryKey: ["so-batch-purchase", null],
    queryFn: async () =>
      soBatchPurchaseResponseSchema.parse(await apiFetch<unknown>("/api/operation/purchase/demands")) as SoBatchPurchaseResponse,
    staleTime: 15_000,
    enabled,
  });
  const suppliers = useOperationSuppliers({ enabled });
  return useMemo(() => {
    const map = new Map<string, PoWindowFacts>();
    if (!demands.data || !suppliers.data) return map;
    try {
      for (const window of poWindowWorkFromSoBatch(demands.data, suppliers.data.suppliers as never, { keepClosed: true })) {
        const demandSos = [...new Set(demands.data.rows
          .filter((r) => r.poWindow === window.key && window.demand.rowIds.includes(r.id) && r.so != null)
          .map((r) => r.so as number))];
        map.set(window.key, { window, demandSos });
      }
    } catch {
      /* Settings unavailable: rows keep the Work item's own sentence. */
    }
    return map;
  }, [demands.data, suppliers.data]);
}
