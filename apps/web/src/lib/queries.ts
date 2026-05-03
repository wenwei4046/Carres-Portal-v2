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
  type CancelOrderInput,
  type SetOrderAddressInput,
  type SetOrderDateInput,
  type TopUpOrderInput,
  type UpdateOrderInput,
} from "@carres/shared";
import { ApiError, apiFetch } from "./api";

export const qk = {
  dealers:      () => ["dealers"] as const,
  dealerSelf:   () => ["dealers", "me"] as const,
  orders:       (filters?: OrderFilters) => ["orders", filters ?? {}] as const,
  order:        (id: string) => ["orders", id] as const,
  catalog:      () => ["catalog"] as const,
  outlets:      () => ["outlets"] as const,
  salespersons: (outletId?: string) => ["salespersons", outletId ?? null] as const,
  // Phase 3 — Principal admin namespace. Keys are nested under 'principal' so
  // we can selectively invalidate the whole sub-tree (e.g. after a decision
  // ripples to dealers + dashboard) without touching dealer/order caches.
  principal: {
    dashboard: () => ["principal", "dashboard"] as const,
    approvals: (filters?: ApprovalFilters) =>
      ["principal", "approvals", filters ?? {}] as const,
    dealers:   (filters?: PrincipalDealerFilters) =>
      ["principal", "dealers", filters ?? {}] as const,
    dealer:    (id: string) => ["principal", "dealers", id] as const,
  },
};

export interface OrderFilters {
  status?: OrderStatus;
  outletId?: string;
  salespersonId?: string;
  dealerId?: string;
}

// Phase 3 — Principal filter shapes. Kept tiny on purpose: the route handlers
// already do the heavy lifting; the frontend just needs stable cache keys
// keyed on whatever the user picked in the inbox / dealers list.
export interface ApprovalFilters {
  status?: "pending" | "approved" | "rejected" | "all";
  kind?: "refund" | "new_dealer" | "top_up" | "price_change" | "other";
}

export interface PrincipalDealerFilters {
  status?: "active" | "suspended" | "pending";
  search?: string;
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
 * useProceedOrder — POST /api/orders/:id/proceed. Atomically transitions a
 * Place order to Proceed (sent to logistics). On success, primes both the
 * detail cache and invalidates the list cache so kanban + tabs reflect the
 * new bucket on next mount.
 *
 * Errors:
 *   - 422 with `{ code: ProceedBlockerCode }` — caller can read
 *     `(err as ApiError).body.code` to show the matching inline blocker hint.
 *   - 403 / 404 / 500 — generic toast.
 */
export function useProceedOrder(
  opts?: Partial<UseMutationOptions<Order, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, string>({
    mutationFn: (id) => apiFetch<Order>(`/api/orders/${id}/proceed`, { method: "POST" }),
    onSuccess: async (...args) => {
      const [order, mutateOrderId] = args;
      // mutateOrderId is the id we passed to mutate(id) — guaranteed to
      // match the URL param the parent's useOrder is observing.
      qc.setQueryData(qk.order(mutateOrderId), order);
      await qc.invalidateQueries({ queryKey: qk.order(mutateOrderId), exact: true });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
    ...opts,
  });
}

/**
 * useTopUpOrder — POST /api/orders/:id/top-up. Records an additional partial
 * payment toward the order total. On success, primes the detail cache + busts
 * the list so kanban paid pct updates on next mount.
 *
 * 422 errors carry an `already_paid` / `wrong_status` / `invalid_amount` code
 * that the caller can branch on (sonner toast text).
 */
export function useTopUpOrder(
  orderId: string,
  opts?: Partial<UseMutationOptions<Order, ApiError, TopUpOrderInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, TopUpOrderInput>({
    mutationFn: (input) =>
      apiFetch<Order>(`/api/orders/${orderId}/top-up`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (...args) => {
      const [order] = args;
      // Prime the detail cache with the freshly-mutated row so the page
      // updates instantly. We key on the orderId we already have rather
      // than the response's order.id — they should always match but the
      // closure-captured value is the safer choice when callers are
      // reading the same query.
      qc.setQueryData(qk.order(orderId), order);
      // Force a refetch on the order detail too, so the cache stays
      // authoritative even if the response shape ever drifts from the
      // GET /:id shape (defense-in-depth — no observable cost when the
      // response was correct, fixes the "Windows screen out of sync"
      // bug Loo flagged on 2026-05-03).
      await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      // List views (kanban / orders tabs) — invalidate so paid pct,
      // status badge, and counts refresh when reopened.
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
    ...opts,
  });
}

/** useSetOrderAddress — POST /api/orders/:id/address. Resolves the
 *  addressUnknown blocker by writing customer_address. */
export function useSetOrderAddress(
  orderId: string,
  opts?: Partial<UseMutationOptions<Order, ApiError, SetOrderAddressInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, SetOrderAddressInput>({
    mutationFn: (input) =>
      apiFetch<Order>(`/api/orders/${orderId}/address`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (...args) => {
      const [order] = args;
      // Prime the detail cache with the freshly-mutated row so the page
      // updates instantly. We key on the orderId we already have rather
      // than the response's order.id — they should always match but the
      // closure-captured value is the safer choice when callers are
      // reading the same query.
      qc.setQueryData(qk.order(orderId), order);
      // Force a refetch on the order detail too, so the cache stays
      // authoritative even if the response shape ever drifts from the
      // GET /:id shape (defense-in-depth — no observable cost when the
      // response was correct, fixes the "Windows screen out of sync"
      // bug Loo flagged on 2026-05-03).
      await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      // List views (kanban / orders tabs) — invalidate so paid pct,
      // status badge, and counts refresh when reopened.
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
    ...opts,
  });
}

/** useSetOrderDate — POST /api/orders/:id/date. Resolves the dateTbd blocker. */
export function useSetOrderDate(
  orderId: string,
  opts?: Partial<UseMutationOptions<Order, ApiError, SetOrderDateInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, SetOrderDateInput>({
    mutationFn: (input) =>
      apiFetch<Order>(`/api/orders/${orderId}/date`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (...args) => {
      const [order] = args;
      // Prime the detail cache with the freshly-mutated row so the page
      // updates instantly. We key on the orderId we already have rather
      // than the response's order.id — they should always match but the
      // closure-captured value is the safer choice when callers are
      // reading the same query.
      qc.setQueryData(qk.order(orderId), order);
      // Force a refetch on the order detail too, so the cache stays
      // authoritative even if the response shape ever drifts from the
      // GET /:id shape (defense-in-depth — no observable cost when the
      // response was correct, fixes the "Windows screen out of sync"
      // bug Loo flagged on 2026-05-03).
      await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      // List views (kanban / orders tabs) — invalidate so paid pct,
      // status badge, and counts refresh when reopened.
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
    ...opts,
  });
}

/** useUpdateOrder — PATCH /api/orders/:id. Phase 2C.2 — full edit of a Place
 *  order's customer + delivery fields. Only keys present in the payload are
 *  updated; the RPC enforces that no fields → 400, status≠place → 422. */
export function useUpdateOrder(
  orderId: string,
  opts?: Partial<UseMutationOptions<Order, ApiError, UpdateOrderInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, UpdateOrderInput>({
    mutationFn: (input) =>
      apiFetch<Order>(`/api/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async (...args) => {
      const [order] = args;
      // Prime the detail cache with the freshly-mutated row so the page
      // updates instantly. We key on the orderId we already have rather
      // than the response's order.id — they should always match but the
      // closure-captured value is the safer choice when callers are
      // reading the same query.
      qc.setQueryData(qk.order(orderId), order);
      // Force a refetch on the order detail too, so the cache stays
      // authoritative even if the response shape ever drifts from the
      // GET /:id shape (defense-in-depth — no observable cost when the
      // response was correct, fixes the "Windows screen out of sync"
      // bug Loo flagged on 2026-05-03).
      await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      // List views (kanban / orders tabs) — invalidate so paid pct,
      // status badge, and counts refresh when reopened.
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
    ...opts,
  });
}

/** useCancelOrder — POST /api/orders/:id/cancel. Phase 2C.3 — sets status to
 *  'cancelled'. Only Place orders cancelable. Reason persisted in
 *  order_history.metadata for the audit trail. */
export function useCancelOrder(
  orderId: string,
  opts?: Partial<UseMutationOptions<Order, ApiError, CancelOrderInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, CancelOrderInput>({
    mutationFn: (input) =>
      apiFetch<Order>(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (...args) => {
      const [order] = args;
      // Prime the detail cache with the freshly-mutated row so the page
      // updates instantly. We key on the orderId we already have rather
      // than the response's order.id — they should always match but the
      // closure-captured value is the safer choice when callers are
      // reading the same query.
      qc.setQueryData(qk.order(orderId), order);
      // Force a refetch on the order detail too, so the cache stays
      // authoritative even if the response shape ever drifts from the
      // GET /:id shape (defense-in-depth — no observable cost when the
      // response was correct, fixes the "Windows screen out of sync"
      // bug Loo flagged on 2026-05-03).
      await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      // List views (kanban / orders tabs) — invalidate so paid pct,
      // status badge, and counts refresh when reopened.
      void qc.invalidateQueries({ queryKey: ["orders"] });
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

// ---------------------------------------------------------------------------
// Phase 3 — Principal hooks
// ---------------------------------------------------------------------------
// API contract is snake_case for dashboard / approvals / audit (the RPC
// payload is forwarded verbatim) and camelCase for the dealer list rows
// (the dealers route does the snake→camel adapter inline). We mirror that
// distinction here in the response types — no silent conversion.

/** Shape returned by GET /api/principal/dashboard.
 *  Matches `principal_dashboard_summary()` (migration 0013). */
export interface PrincipalDashboardKpis {
  total_gmv: number;
  active_orders: number;
  active_dealers: number;
  total_dealers: number;
  pending_approvals: number;
  low_stock_skus: number;
}
export interface PrincipalLeaderboardRow {
  id: string;
  name: string;
  region: string;
  status: string;
  order_count: number;
  gmv: number;
}
export interface PrincipalPendingApprovalRow {
  id: string;
  kind: string;
  title: string;
  actor: string;
  refers_to: string | null;
  amount: number | null;
  dealer_id: string | null;
  created_at: string;
}
export interface PrincipalAuditRow {
  id: string;
  role: string;
  actor_text: string;
  action: string;
  dealer_id: string | null;
  ref: string | null;
  occurred_at: string;
}
export interface PrincipalAlerts {
  suspended_dealers: number;
  low_stock: { sku: string; name: string; available: number; incoming: number }[];
}
export interface PrincipalDashboardResponse {
  kpis: PrincipalDashboardKpis;
  leaderboard: PrincipalLeaderboardRow[];
  pending_approvals: PrincipalPendingApprovalRow[];
  audit_recent: PrincipalAuditRow[];
  alerts: PrincipalAlerts;
}

/** Shape returned by GET /api/approvals (raw row from approvals table). */
export interface ApprovalRow {
  id: string;
  kind: string;
  status: "pending" | "approved" | "rejected";
  title: string;
  actor: string;
  refers_to: string | null;
  amount: number | null;
  dealer_id: string | null;
  decided_by: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}
export interface ApprovalsListResponse {
  approvals: ApprovalRow[];
}

/** Shape returned by GET /api/principal/dealers (camelCase via inline adapter). */
export interface PrincipalDealerRow {
  id: string;
  name: string;
  region: string;
  contact: string;
  status: "active" | "suspended" | "pending" | "rejected";
  joinedDate: string;
  creditLimit: number;
  paymentTerms: string;
  depositBalance: number;
  orderCount: number;
  gmv: number;
  outstanding: number;
}
export interface PrincipalDealersListResponse {
  dealers: PrincipalDealerRow[];
}

/** Shape returned by GET /api/principal/dealers/:id. The `dealer` field is
 *  the raw row from `dealer_with_stats` RPC (snake_case). `recentOrders` is
 *  hand-rolled camelCase in the route. */
export interface PrincipalDealerDetailDealer {
  id: string;
  name: string;
  region: string;
  contact: string;
  status: string;
  joined_date: string;
  credit_limit: number;
  payment_terms: string;
  deposit_balance: number;
  order_count: number;
  gmv: number;
  outstanding: number;
}
export interface PrincipalDealerRecentOrder {
  id: string;
  dl: number;
  status: string;
  customerName: string;
  paid: number;
  total: number;
}
export interface PrincipalDealerDetailResponse {
  dealer: PrincipalDealerDetailDealer;
  recentOrders: PrincipalDealerRecentOrder[];
}

// === Read hooks ===

/** Dashboard summary — KPIs + leaderboard + pending approvals + audit recent
 *  + alerts. One round-trip per refresh. */
export function usePrincipalDashboard(
  opts?: Partial<UseQueryOptions<PrincipalDashboardResponse>>,
) {
  return useQuery({
    queryKey: qk.principal.dashboard(),
    queryFn: () =>
      apiFetch<PrincipalDashboardResponse>("/api/principal/dashboard"),
    staleTime: 30_000,
    ...opts,
  });
}

/** Approvals inbox — defaults to status='pending' on the server when omitted. */
export function useApprovals(
  filters: ApprovalFilters = {},
  opts?: Partial<UseQueryOptions<ApprovalsListResponse>>,
) {
  return useQuery({
    queryKey: qk.principal.approvals(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.kind) params.set("kind", filters.kind);
      const qs = params.toString();
      return apiFetch<ApprovalsListResponse>(
        `/api/approvals${qs ? `?${qs}` : ""}`,
      );
    },
    staleTime: 30_000,
    ...opts,
  });
}

/** Dealer admin list — rolled-up stats (gmv, order_count, outstanding). */
export function usePrincipalDealers(
  filters: PrincipalDealerFilters = {},
  opts?: Partial<UseQueryOptions<PrincipalDealersListResponse>>,
) {
  return useQuery({
    queryKey: qk.principal.dealers(filters),
    queryFn: () =>
      apiFetch<PrincipalDealersListResponse>("/api/principal/dealers"),
    staleTime: 30_000,
    ...opts,
  });
}

/** Dealer detail + last 8 orders. Pass `null` when no dealer is open
 *  (e.g. drawer closed) to disable the query. */
export function usePrincipalDealer(
  id: string | null,
  opts?: Partial<UseQueryOptions<PrincipalDealerDetailResponse>>,
) {
  return useQuery({
    queryKey: id ? qk.principal.dealer(id) : (["principal", "dealers", "null"] as const),
    queryFn: () =>
      apiFetch<PrincipalDealerDetailResponse>(`/api/principal/dealers/${id}`),
    enabled: !!id,
    staleTime: 10_000,
    ...opts,
  });
}

// === Mutation hooks (closure-captured ID, await invalidate) ===
//
// All four follow the Phase 2C cache-sync pattern:
//   1. The mutation hook closes over the id (e.g. `useDecideApproval(id)`)
//      so callers cannot accidentally mismatch the URL param vs the cache key
//      when reading from the same query.
//   2. `onSuccess` `await`s every invalidation BEFORE returning, so the next
//      render sees authoritative data — fixes the "Windows screen out of
//      sync" class of bugs we hit in 2C.

/** Decide an approval (approve | reject). Ripples to dashboard (KPI counts),
 *  approvals list (status flip), and dealers (new_dealer approvals turn a
 *  pending dealer active). */
export function useDecideApproval(
  approvalId: string,
  opts?: Partial<
    UseMutationOptions<
      { approval: ApprovalRow },
      ApiError,
      { status: "approved" | "rejected"; note?: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { approval: ApprovalRow },
    ApiError,
    { status: "approved" | "rejected"; note?: string }
  >({
    mutationFn: (input) =>
      apiFetch<{ approval: ApprovalRow }>(
        `/api/approvals/${approvalId}/decide`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["principal", "approvals"] });
      await qc.invalidateQueries({
        queryKey: qk.principal.dashboard(),
        exact: true,
      });
      await qc.invalidateQueries({ queryKey: ["principal", "dealers"] });
      opts?.onSuccess?.(
        ...(args as Parameters<NonNullable<typeof opts.onSuccess>>),
      );
    },
    ...opts,
  });
}

/** Invite a new dealer. Idempotent on (name, region) — server returns
 *  `idempotent: true` when the second call hits an existing pending dealer. */
export function useInviteDealer(
  opts?: Partial<
    UseMutationOptions<
      {
        dealer: PrincipalDealerDetailDealer;
        approval: ApprovalRow;
        idempotent: boolean;
      },
      ApiError,
      { name: string; region: string; contact: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    {
      dealer: PrincipalDealerDetailDealer;
      approval: ApprovalRow;
      idempotent: boolean;
    },
    ApiError,
    { name: string; region: string; contact: string }
  >({
    mutationFn: (input) =>
      apiFetch<{
        dealer: PrincipalDealerDetailDealer;
        approval: ApprovalRow;
        idempotent: boolean;
      }>("/api/principal/dealers/invite", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["principal", "dealers"] });
      await qc.invalidateQueries({ queryKey: ["principal", "approvals"] });
      await qc.invalidateQueries({
        queryKey: qk.principal.dashboard(),
        exact: true,
      });
      opts?.onSuccess?.(
        ...(args as Parameters<NonNullable<typeof opts.onSuccess>>),
      );
    },
    ...opts,
  });
}

/** Suspend / reactivate a dealer. Updates dashboard suspended_dealers count
 *  via dashboard invalidate. */
export function useDealerSetStatus(
  dealerId: string,
  opts?: Partial<
    UseMutationOptions<
      { dealer: PrincipalDealerDetailDealer },
      ApiError,
      { status: "active" | "suspended"; reason?: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { dealer: PrincipalDealerDetailDealer },
    ApiError,
    { status: "active" | "suspended"; reason?: string }
  >({
    mutationFn: (input) =>
      apiFetch<{ dealer: PrincipalDealerDetailDealer }>(
        `/api/principal/dealers/${dealerId}/status`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async (...args) => {
      await qc.invalidateQueries({
        queryKey: qk.principal.dealer(dealerId),
        exact: true,
      });
      await qc.invalidateQueries({ queryKey: ["principal", "dealers"] });
      await qc.invalidateQueries({
        queryKey: qk.principal.dashboard(),
        exact: true,
      });
      opts?.onSuccess?.(
        ...(args as Parameters<NonNullable<typeof opts.onSuccess>>),
      );
    },
    ...opts,
  });
}

/** Update a dealer's credit terms (creditLimit + paymentTerms). No dashboard
 *  side-effect; only dealer detail + list need to refetch. */
export function useDealerSetTerms(
  dealerId: string,
  opts?: Partial<
    UseMutationOptions<
      { dealer: PrincipalDealerDetailDealer },
      ApiError,
      { creditLimit: number; paymentTerms: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { dealer: PrincipalDealerDetailDealer },
    ApiError,
    { creditLimit: number; paymentTerms: string }
  >({
    mutationFn: (input) =>
      apiFetch<{ dealer: PrincipalDealerDetailDealer }>(
        `/api/principal/dealers/${dealerId}/terms`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async (...args) => {
      await qc.invalidateQueries({
        queryKey: qk.principal.dealer(dealerId),
        exact: true,
      });
      await qc.invalidateQueries({ queryKey: ["principal", "dealers"] });
      opts?.onSuccess?.(
        ...(args as Parameters<NonNullable<typeof opts.onSuccess>>),
      );
    },
    ...opts,
  });
}
