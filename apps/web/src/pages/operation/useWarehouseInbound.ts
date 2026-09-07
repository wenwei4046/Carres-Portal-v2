import { useQuery } from "@tanstack/react-query";
import type { InboundArrival } from "@carres/shared";
import { apiFetch, type ApiError } from "@/lib/api";
export function useWarehouseInbound(params = new URLSearchParams(), offset = 0) {
  const query = new URLSearchParams();
  query.set("offset", String(offset));
  query.set("limit", "50");
  for (const key of ["status", "sourceType", "site", "source", "date", "from", "to", "q"])
    if (params.get(key)) query.set(key, params.get(key)!);
  const queryString = query.toString();
  return useQuery<
    {
      arrivals: InboundArrival[];
      unresolvedSources?: string[];
      sites: Array<{ id: string; name: string }>;
      page: { offset: number; limit: number; total: number };
      facets: {
        status: Record<string, number>;
        sourceType: Record<string, number>;
        site: Record<string, number>;
      };
    },
    ApiError
  >({
    queryKey: ["operation", "warehouse-inbound", queryString],
    queryFn: () => apiFetch(`/api/operation/warehouse/inbound?${queryString}`),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
