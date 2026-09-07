import { useQuery } from "@tanstack/react-query";
import type { InboundArrival } from "@carres/shared";
import { apiFetch, type ApiError } from "@/lib/api";
export function useWarehouseInbound() {
  return useQuery<
    {
      arrivals: InboundArrival[];
      unresolvedSources?: string[];
      sites: Array<{ id: string; name: string }>;
    },
    ApiError
  >({
    queryKey: ["operation", "warehouse-inbound"],
    queryFn: () => apiFetch("/api/operation/warehouse/inbound"),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
