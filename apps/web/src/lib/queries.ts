import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import {
  type CatalogResponse,
  type CreateOrderInput,
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
 * useCreateOrder — POST /api/orders. On success, prime the detail cache with
 * the just-created order (so the ThankYou screen can render its number
 * without a second round-trip) and invalidate the list cache so the dashboard
 * kanban picks up the new card on next mount.
 */
export function useCreateOrder(
  opts?: Partial<UseMutationOptions<Order, Error, CreateOrderInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, Error, CreateOrderInput>({
    mutationFn: (input) =>
      apiFetch<Order>("/api/orders", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (...args) => {
      const [order] = args;
      qc.setQueryData(qk.order(order.id), order);
      void qc.invalidateQueries({ queryKey: ["orders"] });
      // Forward to caller's onSuccess if provided. Spread keeps us
      // signature-agnostic across TanStack versions.
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
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
