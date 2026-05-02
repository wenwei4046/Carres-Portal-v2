import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import {
  type CatalogResponse,
  type DealerSelf,
  type Order,
  type OrdersListResponse,
  type OrderStatus,
  type OutletsListResponse,
  type SalespersonsListResponse,
} from "@carres/shared";
import { apiFetch } from "./api";

export const qk = {
  dealers:      () => ["dealers"] as const,
  dealerSelf:   () => ["dealers", "me"] as const,
  orders:       (filters?: OrderFilters) => ["orders", filters ?? {}] as const,
  order:        (id: string) => ["orders", id] as const,
  catalog:      () => ["catalog"] as const,
  outlets:      () => ["outlets"] as const,
  salespersons: (outletId?: string) => ["salespersons", outletId ?? null] as const,
};

export interface OrderFilters {
  status?: OrderStatus;
  outletId?: string;
  salespersonId?: string;
  dealerId?: string;
}

function toSearch(f?: OrderFilters): string {
  if (!f) return "";
  const params = new URLSearchParams();
  if (f.status) params.set("status", f.status);
  if (f.outletId) params.set("outletId", f.outletId);
  if (f.salespersonId) params.set("salespersonId", f.salespersonId);
  if (f.dealerId) params.set("dealerId", f.dealerId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useDealerSelf(opts?: Partial<UseQueryOptions<DealerSelf>>) {
  return useQuery({
    queryKey: qk.dealerSelf(),
    queryFn: () => apiFetch<DealerSelf>("/api/dealers/me"),
    staleTime: 5 * 60_000,
    ...opts,
  });
}

export function useOrders(filters?: OrderFilters, opts?: Partial<UseQueryOptions<OrdersListResponse>>) {
  return useQuery({
    queryKey: qk.orders(filters),
    queryFn: () => apiFetch<OrdersListResponse>("/api/orders" + toSearch(filters)),
    staleTime: 30_000,
    ...opts,
  });
}

export function useOrder(id: string | null, opts?: Partial<UseQueryOptions<Order>>) {
  return useQuery({
    queryKey: qk.order(id ?? ""),
    queryFn: () => apiFetch<Order>(`/api/orders/${id}`),
    enabled: !!id,
    staleTime: 10_000,
    ...opts,
  });
}

/**
 * Catalog bundle — models + skus + sofa fabrics + addons + floor_config.
 * staleTime: 5 min (D5). Wizard Step 2 explicitly calls `.refetch()` on mount
 * so the dealer always sees fresh prices before they pick products.
 */
export function useCatalog(opts?: Partial<UseQueryOptions<CatalogResponse>>) {
  return useQuery({
    queryKey: qk.catalog(),
    queryFn: () => apiFetch<CatalogResponse>("/api/catalog"),
    staleTime: 5 * 60_000,
    ...opts,
  });
}

export function useOutlets(opts?: Partial<UseQueryOptions<OutletsListResponse>>) {
  return useQuery({
    queryKey: qk.outlets(),
    queryFn: () => apiFetch<OutletsListResponse>("/api/outlets"),
    staleTime: 5 * 60_000,
    ...opts,
  });
}

export function useSalespersons(
  outletId?: string,
  opts?: Partial<UseQueryOptions<SalespersonsListResponse>>,
) {
  return useQuery({
    queryKey: qk.salespersons(outletId),
    queryFn: () =>
      apiFetch<SalespersonsListResponse>(
        outletId ? `/api/salespersons?outletId=${outletId}` : "/api/salespersons",
      ),
    staleTime: 5 * 60_000,
    ...opts,
  });
}
