import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import {
  type AbandonOrderInput,
  type AdjustStockInput,
  type AssignPartnerInput,
  type AssignPickupPartnerInput,
  type AttachDoInput,
  type AwaitingStockShortageResponse,
  type CancelOrderInput,
  type CatalogResponse,
  type ConfirmProceedRequestInput,
  type CreateOrderInput,
  type CreatePoInput,
  type CreatePosBatchInput,
  type CreatePosBatchResponse,
  type DealerSelf,
  type ListLogisticsOrdersQuery,
  type ListMovementsQuery,
  type ListPurchaseOrdersQuery,
  type Order,
  type OrdersListResponse,
  type OrderStatus,
  type OutletsListResponse,
  type ReassignPoWarehouseInput,
  type ReceivePoLineInput,
  type ReservedDrilldownResponse,
  type SalespersonsListResponse,
  type SetOrderAddressInput,
  type SetOrderDateInput,
  type TopUpOrderInput,
  type TransferReadyInput,
  type UpdateOrderInput,
  type WarehousePickInput,
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
  // Phase 4 — HQ Logistics namespace. Same nested-key strategy as `principal`
  // so M5 mutation hooks can blast `["logistics"]` (or a sub-tree) on each
  // ripple — e.g. assign-partner invalidates orders + dashboard; PO receive
  // invalidates pos + warehouse + dashboard. Filter keys are typed via the
  // `List*Query` zod-derived shapes from `@carres/shared` so a wrong key fails
  // typecheck at the call site rather than silently breaking cache reads.
  logistics: {
    dashboard: () => ["logistics", "dashboard"] as const,
    orders:    (filters?: LogisticsOrderFilters) =>
      ["logistics", "orders", filters ?? {}] as const,
    order:     (id: string) => ["logistics", "orders", id] as const,
    partners:  () => ["logistics", "partners"] as const,
    suppliers: () => ["logistics", "suppliers"] as const,
    pos:       (filters?: LogisticsPoFilters) =>
      ["logistics", "pos", filters ?? {}] as const,
    po:        (id: string) => ["logistics", "pos", id] as const,
    /** Pipeline v2 (C5.3) — SKU-level shortage feed for the "Auto-fill from
     *  awaiting stock" button on CreatePOModal. Lazy: fired only on click via
     *  the hook's `refetch()`. Nested under `pos` so future blunt
     *  invalidations on `["logistics","pos"]` reach this cache too (e.g. when
     *  a PO is issued, the awaiting_logistics_action pool changes). */
    awaitingStockShortage: () =>
      ["logistics", "pos", "awaiting-stock-shortage"] as const,
    warehouse: () => ["logistics", "warehouse"] as const,
    /** Pipeline v2 (C4) — reserve drill-down per (warehouse, sku). Nested under
     *  warehouse so future blunt invalidations on `["logistics","warehouse"]`
     *  fan out to drill-down caches too. */
    reservedDrilldown: (warehouseId: string | null, sku: string | null) =>
      ["logistics", "warehouse", "reserved", warehouseId ?? "null", sku ?? "null"] as const,
    movements: (filters?: MovementsFilters) =>
      ["logistics", "movements", filters ?? {}] as const,
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

// ---------------------------------------------------------------------------
// Phase 4 — Logistics filter shapes
// ---------------------------------------------------------------------------
// Re-exported as plain type aliases of the zod-inferred query shapes from
// @carres/shared/schemas/logistics. The web side only needs these as cache-key
// values + URLSearchParams sources — no runtime parse here, the server already
// owns that boundary. Keeping the alias means a schema change in one file
// updates both the API and the React Query keys without drift.
export type LogisticsOrderFilters = Partial<ListLogisticsOrdersQuery>;
export type LogisticsPoFilters = Partial<ListPurchaseOrdersQuery>;
export type MovementsFilters = Partial<ListMovementsQuery>;

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
    ...opts,
    onSuccess: async (...args) => {
      const [order, mutateOrderId] = args;
      // mutateOrderId is the id we passed to mutate(id) — guaranteed to
      // match the URL param the parent's useOrder is observing.
      qc.setQueryData(qk.order(mutateOrderId), order);
      await qc.invalidateQueries({ queryKey: qk.order(mutateOrderId), exact: true });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
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
    ...opts,
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
    ...opts,
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
    ...opts,
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
    ...opts,
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
    ...opts,
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
  reason: string | null;
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
    ...opts,
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
    ...opts,
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
    ...opts,
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
  });
}

// ===========================================================================
// Phase 4 — HQ Logistics hooks
// ===========================================================================
// API contract is snake_case across the board (matching how Phase 3 principal
// dashboard / approvals payloads are forwarded verbatim from the RPCs). The
// list endpoints returning PostgREST-shaped rows keep the snake_case row
// fields too — adapters live at the consumer page if/when they need camelCase.
//
// Mutation hooks follow the Phase 2C / Phase 3 pattern:
//   1. Closure-capture the path-id (e.g. `useAssignPartnerMutation(orderId)`)
//      so callers cannot accidentally mismatch the URL param vs. the cache key.
//   2. `onSuccess` `await`s the relevant invalidations BEFORE returning so the
//      next render sees authoritative data — closes the "out of sync drawer"
//      class of bugs we hit in Phase 2C.
//   3. Forward the caller's `onSuccess` last (signature-agnostic spread).

// --- Shared response shapes (snake_case, forwarded from RPC / route) -------

/** GET /api/logistics/dashboard — `logistics_dashboard_summary()` payload.
 *  Field names mirror the RPC verbatim (migration 0019, lines 380-414):
 *  `today_deliveries`, `open_pos`, `overdue_orders`, `active_orders`,
 *  `active_gmv`. The proto KPI tiles read these as Today / Open POs / Overdue. */
export interface LogisticsDashboardKpis {
  today_deliveries: number;
  open_pos: number;
  overdue_orders: number;
  active_orders: number;
  active_gmv: number;
}
export interface LogisticsPipelineCounts {
  /** Pipeline v2 (C3): orders with `status='place'` — dealer-side, not yet
   *  proceeded. Counted via the dashboard route since the RPC is frozen. */
  placed: number;
  /** Pipeline v2 (C3): orders with `logistics_stage='proceed_request'` —
   *  awaiting HQ logistics triage decision. */
  proceed_request: number;
  awaiting_logistics_action: number;
  ready_to_dispatch: number;
  dispatched: number;
}
export interface LogisticsOpenPoRow {
  id: string;
  supplier_id: string;
  warehouse_id: string;
  status: string;
  sup_status: string;
  eta_date: string | null;
  placed_at: string;
  dl: number | null;
  dl_refs: number[] | null;
}
export interface LogisticsLowStockRow {
  sku: string;
  warehouse_id: string;
  qty: number;
  reserved: number;
  available: number;
}
export interface LogisticsAuditRow {
  id: string;
  role: string;
  actor_text: string | null;
  action: string;
  dealer_id: string | null;
  ref: string | null;
  occurred_at: string;
}
export interface LogisticsAlerts {
  out_of_stock_skus: number;
}
export interface LogisticsDashboardResponse {
  kpis: LogisticsDashboardKpis;
  pipeline: LogisticsPipelineCounts;
  open_pos: LogisticsOpenPoRow[];
  low_stock: LogisticsLowStockRow[];
  audit_recent: LogisticsAuditRow[];
  alerts: LogisticsAlerts;
}

/** Row in GET /api/logistics/partners. Bare `delivery_partners` row trimmed to
 *  what `DispatchModal` needs (name + zones in the option label, contact in the
 *  preview). */
export interface DeliveryPartnerRow {
  id: string;
  name: string;
  contact: string | null;
  zones: string | null;
}
export interface DeliveryPartnersListResponse {
  partners: DeliveryPartnerRow[];
}

/** Row in GET /api/logistics/suppliers. Used by `CreatePOModal` for the
 *  supplier dropdown + auto-detect via `cat_covered`. `kind` is the supplier's
 *  fulfilment mode (own_logistics ships goods themselves; factory_pickup
 *  expects logistics to dispatch a partner to the factory). */
export interface SupplierRow {
  id: string;
  name: string;
  kind: "own_logistics" | "factory_pickup";
  cat_covered: string[];
  lead_time: string | null;
  contact: string | null;
}
export interface SuppliersListResponse {
  suppliers: SupplierRow[];
}

/** Row in GET /api/logistics/orders. Embedded `dealers(name)` is a PostgREST
 *  nested fetch shape — the route forwards it verbatim.
 *
 *  Pipeline v2 (C1/C2): adds `'placed'` + `'proceed_request'` to logistics_stage
 *  and widens status to include the dealer-side `'place'` value (orders that
 *  haven't been pushed to logistics yet still surface in the kanban so HQ can
 *  see what's coming). */
export interface LogisticsOrderListRow {
  id: string;
  dl: number;
  status: "place" | "proceed_order" | "delivered";
  logistics_stage:
    | "placed"
    | "proceed_request"
    | "awaiting_logistics_action"
    | "ready_to_dispatch"
    | "dispatched"
    | "delivered"
    | null;
  warehouse_id: string | null;
  customer_name: string;
  placed_at: string;
  delivery_date: string | null;
  delivery_partner_id: string | null;
  do_number: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  outlet_id: string | null;
  dealer_id: string;
  dealers: { name: string } | null;
}
export interface LogisticsOrdersListResponse {
  orders: LogisticsOrderListRow[];
}

/** GET /api/logistics/orders/:id — composed drawer payload (orders.ts §97). */
export interface LogisticsOrderDetailOrder {
  id: string;
  dl: number;
  status: string;
  logistics_stage:
    | "placed"
    | "proceed_request"
    | "awaiting_logistics_action"
    | "ready_to_dispatch"
    | "dispatched"
    | "delivered"
    | null;
  warehouse_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_address_unknown: boolean;
  delivery_date: string | null;
  delivery_date_tbd: boolean;
  placed_at: string;
  do_number: string | null;
  do_note: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  delivery_partner_id: string | null;
  dealer_id: string;
  outlet_id: string | null;
  dealers: { name: string } | null;
  outlets: { name: string } | null;
}
export interface LogisticsOrderDetailLine {
  sku: string;
  qty: number;
  unit_price: number;
}
export interface LogisticsOrderDetailAddon {
  addon_key: string;
  qty: number;
  unit_price: number;
}
export interface LogisticsOrderDetailHistoryRow {
  text: string;
  by_role: string | null;
  occurred_at: string;
}
export interface LogisticsOrderDetailWarehouse {
  id: string;
  name: string;
  address: string | null;
}
export interface LogisticsOrderDetailStockBalance {
  sku: string;
  warehouse_id: string;
  qty: number;
  reserved: number;
}
export interface LogisticsOrderDetailPoLine {
  po_id: string;
  sku: string;
  qty: number;
  received_qty: number;
}
export interface LogisticsOrderDetailPo {
  id: string;
  supplier_id: string;
  warehouse_id: string;
  status: string;
  sup_status: string;
  dl: number | null;
  dl_refs: number[] | null;
  eta_date: string | null;
  lines: LogisticsOrderDetailPoLine[];
}
export interface LogisticsOrderDetailResponse {
  order: LogisticsOrderDetailOrder;
  lines: LogisticsOrderDetailLine[];
  addons: LogisticsOrderDetailAddon[];
  total: number;
  warehouse: LogisticsOrderDetailWarehouse | null;
  stockBalances: LogisticsOrderDetailStockBalance[];
  pos: LogisticsOrderDetailPo[];
  history: LogisticsOrderDetailHistoryRow[];
}

/** Row in GET /api/logistics/pos. `purchase_order_lines(...)` is the embedded
 *  PostgREST nested resource. */
export interface LogisticsPoListRow {
  id: string;
  supplier_id: string;
  warehouse_id: string;
  status: "open" | "received" | "cancelled";
  sup_status: string;
  dl: number | null;
  dl_refs: number[] | null;
  eta_date: string | null;
  placed_at: string;
  purchase_order_lines: { sku: string; qty: number; received_qty: number }[];
}
export interface LogisticsPosListResponse {
  pos: LogisticsPoListRow[];
}

/** Pipeline v2 (C4) — re-export the zod-derived drill-down shape so consumers
 *  don't have to import from @carres/shared directly. */
export type LogisticsReservedDrilldownResponse = ReservedDrilldownResponse;

/** Pipeline v2 (C5.3) — re-export the awaiting-stock shortage shape for the
 *  CreatePOModal auto-fill button, same convention as the drill-down above. */
export type LogisticsAwaitingStockShortageResponse = AwaitingStockShortageResponse;

/** GET /api/logistics/warehouse — composed table-style payload (warehouse.ts). */
export type LowStockStatus = "out" | "low" | "ok";
export interface WarehouseStockEntry {
  sku: string;
  qty: number;
  reserved: number;
  low_stock_status: LowStockStatus;
}
export interface WarehouseSkuTotals {
  total_qty: number;
  total_reserved: number;
  low_stock_status_aggregate: LowStockStatus;
}
export interface WarehouseListResponse {
  warehouses: { id: string; name: string; address: string | null }[];
  byWarehouse: Record<string, WarehouseStockEntry[]>;
  totalsBySku: Record<string, WarehouseSkuTotals>;
}

/** GET /api/logistics/movements — `stock_movements` table rows + cap. */
export interface MovementRow {
  id: string;
  sku: string;
  warehouse_id: string;
  qty: number;
  kind: "in" | "out" | "adjust";
  ref: string | null;
  note: string | null;
  by_role: string | null;
  occurred_at: string;
}
export interface MovementsListResponse {
  rows: MovementRow[];
  limit: number;
}

/** Mutation responses — RPCs return the mutated row; routes wrap in `{ x: data }`. */
export interface LogisticsOrderMutationResponse {
  order: unknown;
}
export interface LogisticsPoMutationResponse {
  po: unknown;
}
export interface LogisticsRecheckStockResponse {
  warehouseId: string | null;
  shortages: { sku: string; short: number }[];
}
export interface LogisticsIssuePosResponse {
  pos_created: { po_id: string; supplier_id: string; lines: number }[];
}
export interface LogisticsAdjustStockResponse {
  sku: string;
  warehouse_id: string;
  qty: number;
  reserved: number;
}
export interface LogisticsReceivePoLineResponse {
  po: unknown;
  line: { po_id: string; sku: string; qty: number; received_qty: number };
}

// --- Filter → query string helpers -----------------------------------------

function logisticsOrdersSearch(f?: LogisticsOrderFilters): string {
  if (!f) return "";
  const params = new URLSearchParams();
  if (f.stage && f.stage !== "all") params.set("stage", f.stage);
  if (f.channel && f.channel !== "all") params.set("channel", f.channel);
  if (f.search) params.set("search", f.search);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function logisticsPosSearch(f?: LogisticsPoFilters): string {
  if (!f) return "";
  const params = new URLSearchParams();
  if (f.status && f.status !== "all") params.set("status", f.status);
  if (f.supplierId) params.set("supplierId", f.supplierId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function movementsSearch(f?: MovementsFilters): string {
  if (!f) return "";
  const params = new URLSearchParams();
  if (f.warehouseId) params.set("warehouseId", f.warehouseId);
  if (f.category && f.category !== "all") params.set("category", f.category);
  if (f.sku) params.set("sku", f.sku);
  if (f.kind && f.kind !== "all") params.set("kind", f.kind);
  if (f.search) params.set("search", f.search);
  if (f.period && f.period !== "30d") params.set("period", f.period);
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// --- Query hooks (7) -------------------------------------------------------

/** Logistics dashboard — KPIs + pipeline + open POs + low stock + audit. */
export function useLogisticsDashboard(
  opts?: Partial<UseQueryOptions<LogisticsDashboardResponse>>,
) {
  return useQuery({
    queryKey: qk.logistics.dashboard(),
    queryFn: () =>
      apiFetch<LogisticsDashboardResponse>("/api/logistics/dashboard"),
    staleTime: 30_000,
    ...opts,
  });
}

/** Delivery partners — populates the DispatchModal dropdown (M5 task 2 §18.3).
 *  Stable list, rarely changes; cache for 5 minutes. */
export function useDeliveryPartners(
  opts?: Partial<UseQueryOptions<DeliveryPartnersListResponse>>,
) {
  return useQuery({
    queryKey: qk.logistics.partners(),
    queryFn: () =>
      apiFetch<DeliveryPartnersListResponse>("/api/logistics/partners"),
    staleTime: 5 * 60_000,
    ...opts,
  });
}

/** Suppliers — populates the CreatePOModal supplier dropdown (M5 task 3
 *  §18.4). Stable list (suppliers are managed in Logistics Settings + don't
 *  change between sessions); cache for 5 minutes. */
export function useLogisticsSuppliers(
  opts?: Partial<UseQueryOptions<SuppliersListResponse>>,
) {
  return useQuery({
    queryKey: qk.logistics.suppliers(),
    queryFn: () =>
      apiFetch<SuppliersListResponse>("/api/logistics/suppliers"),
    staleTime: 5 * 60_000,
    ...opts,
  });
}

/** Logistics orders kanban list. Server defaults stage='all', channel='all'. */
export function useLogisticsOrders(
  filters: LogisticsOrderFilters = {},
  opts?: Partial<UseQueryOptions<LogisticsOrdersListResponse>>,
) {
  return useQuery({
    queryKey: qk.logistics.orders(filters),
    queryFn: () =>
      apiFetch<LogisticsOrdersListResponse>(
        "/api/logistics/orders" + logisticsOrdersSearch(filters),
      ),
    staleTime: 30_000,
    // Keep showing the previous filtered/searched list while fetching the
    // next one — without this, the query key flips on every keystroke and
    // TanStack treats each filter change as a brand-new query (no data →
    // isLoading=true → page falls back to <KanbanSkeleton />, which
    // unmounts the search input mid-keystroke and steals focus).
    placeholderData: keepPreviousData,
    ...opts,
  });
}

/** Drawer detail. `null` id disables the query (mirror of usePrincipalDealer). */
export function useLogisticsOrder(
  id: string | null,
  opts?: Partial<UseQueryOptions<LogisticsOrderDetailResponse>>,
) {
  return useQuery({
    queryKey: id ? qk.logistics.order(id) : (["logistics", "orders", "null"] as const),
    queryFn: () =>
      apiFetch<LogisticsOrderDetailResponse>(`/api/logistics/orders/${id}`),
    enabled: !!id,
    staleTime: 10_000,
    ...opts,
  });
}

/** Procurement (PO) list. Server defaults status='all'. */
export function useLogisticsPos(
  filters: LogisticsPoFilters = {},
  opts?: Partial<UseQueryOptions<LogisticsPosListResponse>>,
) {
  return useQuery({
    queryKey: qk.logistics.pos(filters),
    queryFn: () =>
      apiFetch<LogisticsPosListResponse>(
        "/api/logistics/pos" + logisticsPosSearch(filters),
      ),
    staleTime: 30_000,
    ...opts,
  });
}

/** PO drawer detail. There is no GET /:id route — the list embeds lines via
 *  PostgREST nested fetch. Kept here as a future hook; for now M5 pages should
 *  pluck the row from `useLogisticsPos`. The unused-id query is disabled when
 *  id is null. (Endpoint may land in M5 task 4 when the drawer needs richer
 *  history; this hook is a placeholder for that.) */
export function useLogisticsPo(
  _id: string | null,
  opts?: Partial<UseQueryOptions<LogisticsPoListRow>>,
) {
  return useQuery({
    queryKey: _id ? qk.logistics.po(_id) : (["logistics", "pos", "null"] as const),
    queryFn: () => {
      throw new Error(
        "useLogisticsPo: GET /api/logistics/pos/:id not implemented yet — read from useLogisticsPos list cache via select() instead.",
      );
    },
    enabled: false,
    staleTime: 10_000,
    ...opts,
  });
}

/** Warehouse stock matrix. */
export function useLogisticsWarehouse(
  opts?: Partial<UseQueryOptions<WarehouseListResponse>>,
) {
  return useQuery({
    queryKey: qk.logistics.warehouse(),
    queryFn: () => apiFetch<WarehouseListResponse>("/api/logistics/warehouse"),
    staleTime: 30_000,
    ...opts,
  });
}

/** Pipeline v2 (C4) — drill-down on a single (warehouse, sku) pair to list
 *  the orders currently holding `stock_balances.reserved`. `null` for either
 *  param disables the query (mirror of `useLogisticsOrder`). staleTime is
 *  short (5s) — reserve counts shift on every assign-partner / attach-do /
 *  abandon, so we want fresh data when the dialog reopens. */
export function useReservedDrilldown(
  warehouseId: string | null,
  sku: string | null,
  opts?: Partial<UseQueryOptions<LogisticsReservedDrilldownResponse>>,
) {
  return useQuery({
    queryKey: qk.logistics.reservedDrilldown(warehouseId, sku),
    queryFn: () => {
      const params = new URLSearchParams({
        warehouseId: warehouseId ?? "",
        sku: sku ?? "",
      });
      return apiFetch<LogisticsReservedDrilldownResponse>(
        `/api/logistics/warehouse/reserved-drilldown?${params.toString()}`,
      );
    },
    enabled: !!warehouseId && !!sku,
    staleTime: 5_000,
    ...opts,
  });
}

/** Pipeline v2 (C5.3) — awaiting-stock shortage feed for the CreatePOModal
 *  "Auto-fill from awaiting stock" button. Lazy: `enabled: false` so the
 *  query only fires when the user clicks the button (via `refetch()`). The
 *  result replaces the modal's `lines` state. staleTime is 0 so a fresh
 *  refetch is always triggered — the awaiting_logistics_action pool can change between
 *  clicks (e.g. user dispatches an order, abandons one). */
export function useAwaitingStockShortage(
  opts?: Partial<UseQueryOptions<LogisticsAwaitingStockShortageResponse>>,
) {
  return useQuery({
    queryKey: qk.logistics.awaitingStockShortage(),
    queryFn: () =>
      apiFetch<LogisticsAwaitingStockShortageResponse>(
        "/api/logistics/pos/awaiting-stock-shortage",
      ),
    enabled: false,
    staleTime: 0,
    ...opts,
  });
}

/** Movements log. Default period='30d'; cap at 200 rows server-side. */
export function useLogisticsMovements(
  filters: MovementsFilters = {},
  opts?: Partial<UseQueryOptions<MovementsListResponse>>,
) {
  return useQuery({
    queryKey: qk.logistics.movements(filters),
    queryFn: () =>
      apiFetch<MovementsListResponse>(
        "/api/logistics/movements" + movementsSearch(filters),
      ),
    staleTime: 30_000,
    ...opts,
  });
}

// --- Mutation hooks (12) ---------------------------------------------------
//
// Invalidation strategy: every mutation invalidates a minimum of
//   • the affected detail key (`qk.logistics.order(id)` / .po(id))
//   • the affected list key tree (`["logistics", "orders"]` / .pos)
//   • the dashboard (`qk.logistics.dashboard()`) — KPIs depend on order /
//     PO state changes universally.
// Stock-touching mutations also invalidate `["logistics", "warehouse"]` and
// `["logistics", "movements"]` because stock_balances + stock_movements rows
// shift on every receive / adjust / dispatch.

/** D1 step 1 — assign a delivery partner. Stage flips to dispatched; KPIs +
 *  list + drawer all need a refetch. */
export function useAssignPartnerMutation(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<LogisticsOrderMutationResponse, ApiError, AssignPartnerInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<LogisticsOrderMutationResponse, ApiError, AssignPartnerInput>({
    mutationFn: (input) =>
      apiFetch<LogisticsOrderMutationResponse>(
        `/api/logistics/orders/${orderId}/assign-partner`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.logistics.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** D1 step 2 — attach DO + flip to delivered. Decrements stock so warehouse
 *  + movements caches also get busted. */
export function useAttachDoMutation(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<LogisticsOrderMutationResponse, ApiError, AttachDoInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<LogisticsOrderMutationResponse, ApiError, AttachDoInput>({
    mutationFn: (input) =>
      apiFetch<LogisticsOrderMutationResponse>(
        `/api/logistics/orders/${orderId}/attach-do`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.logistics.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.logistics.warehouse(), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "movements"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** A6 post-Proceed cancel. Releases reserved stock → warehouse cache busts. */
export function useAbandonOrderMutation(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<LogisticsOrderMutationResponse, ApiError, AbandonOrderInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<LogisticsOrderMutationResponse, ApiError, AbandonOrderInput>({
    mutationFn: (input) =>
      apiFetch<LogisticsOrderMutationResponse>(
        `/api/logistics/orders/${orderId}/abandon`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.logistics.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.logistics.warehouse(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Manual override of the auto-picked source warehouse (E1 awaiting_logistics_action). */
export function useWarehousePickMutation(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<LogisticsOrderMutationResponse, ApiError, WarehousePickInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<LogisticsOrderMutationResponse, ApiError, WarehousePickInput>({
    mutationFn: (input) =>
      apiFetch<LogisticsOrderMutationResponse>(
        `/api/logistics/orders/${orderId}/warehouse`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.logistics.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Pipeline v2 (C2 / migration 0024) — confirm a `proceed_request` order.
 *  RPC `logistics_confirm_proceed_request` decides awaiting_logistics_action vs
 *  ready_to_dispatch based on shortage at the chosen warehouse. `warehouseId`
 *  is optional — RPC accepts NULL when the order already has a warehouse_id.
 *
 *  Stock-touching: ready_to_dispatch path reserves stock atomically, so the
 *  warehouse cache must bust. Dashboard counts shift either way.
 *
 *  Errors (422 with body.code):
 *    - `wrong_stage` — order has already been triaged
 *    - `warehouse_required` — RPC needs a warehouse pick (shouldn't fire from
 *      the dialog since picker is required, but kept in the contract for
 *      defense-in-depth)
 *    - `insufficient_stock_for_reserve` — race-condition: stock changed
 *      between pre-flight check and submit. Body carries a `hint` like
 *      "sku=X warehouse_id=Y". */
export function useConfirmProceedRequest(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<
      LogisticsOrderMutationResponse,
      ApiError,
      ConfirmProceedRequestInput
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    LogisticsOrderMutationResponse,
    ApiError,
    ConfirmProceedRequestInput
  >({
    mutationFn: (input) =>
      apiFetch<LogisticsOrderMutationResponse>(
        `/api/logistics/orders/${orderId}/confirm-proceed`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.logistics.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.logistics.warehouse(), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "movements"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Pipeline v2 (C2 / migration 0024) — flip a `proceed_request` or
 *  `awaiting_logistics_action` order directly to `ready_to_dispatch`. Wraps
 *  `logistics_warehouse_pick` whose source-stage guard widens to permit both
 *  stages. `warehouseId` is REQUIRED here (the RPC raises 22023
 *  `warehouse_required` on NULL — confirm-proceed accepts NULL via a different
 *  RPC, do not conflate). Reserves stock; busts warehouse cache. */
export function useTransferReady(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<
      LogisticsOrderMutationResponse,
      ApiError,
      TransferReadyInput
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    LogisticsOrderMutationResponse,
    ApiError,
    TransferReadyInput
  >({
    mutationFn: (input) =>
      apiFetch<LogisticsOrderMutationResponse>(
        `/api/logistics/orders/${orderId}/transfer-ready`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.logistics.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.logistics.warehouse(), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "movements"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** E1 re-check stock — re-runs pick_warehouse + calc_shortages. Body empty. */
export function useRecheckStockMutation(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<LogisticsRecheckStockResponse, ApiError, void>
  >,
) {
  const qc = useQueryClient();
  return useMutation<LogisticsRecheckStockResponse, ApiError, void>({
    mutationFn: () =>
      apiFetch<LogisticsRecheckStockResponse>(
        `/api/logistics/orders/${orderId}/recheck-stock`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.logistics.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Auto-issue POs for an awaiting_logistics_action order's shortages. Body empty. */
export function useIssuePosForOrderMutation(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<LogisticsIssuePosResponse, ApiError, void>
  >,
) {
  const qc = useQueryClient();
  return useMutation<LogisticsIssuePosResponse, ApiError, void>({
    mutationFn: () =>
      apiFetch<LogisticsIssuePosResponse>(
        `/api/logistics/orders/${orderId}/issue-pos`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.logistics.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "orders"] });
      await qc.invalidateQueries({ queryKey: ["logistics", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Manual create-PO from procurement page. */
export function useCreatePoMutation(
  opts?: Partial<
    UseMutationOptions<LogisticsPoMutationResponse, ApiError, CreatePoInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<LogisticsPoMutationResponse, ApiError, CreatePoInput>({
    mutationFn: (input) =>
      apiFetch<LogisticsPoMutationResponse>("/api/logistics/pos", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["logistics", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      // If the PO is tied to a DL (single or via dl_refs), the awaiting_logistics_action
      // drawer for those orders should refresh. Bust the orders sub-tree too.
      await qc.invalidateQueries({ queryKey: ["logistics", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * C5.2 — Batch create POs in one atomic RPC call.
 *
 * The CreatePOModal now picks a warehouse per supplier-group (Q4=A, blank
 * required). When the SKU set spans 2+ suppliers, we collapse the N parallel
 * useCreatePoMutation calls into a single useCreatePosBatch call so the PG
 * transaction either commits all rows or none — no half-issued batches if
 * (say) the 3rd supplier validation fails.
 *
 * Cache invalidation matches useCreatePoMutation (pos / dashboard / warehouse
 * / orders sub-trees) so the procurement list, KPI strip, awaiting_logistics_action
 * drawers, and the warehouse stock view all refresh after the batch lands.
 *
 * de8bf4e pattern: spread `...opts` BEFORE `onSuccess` so caller-supplied
 * onSuccess runs LAST (after our cache busting completes), matching every
 * other Phase 4 mutation hook.
 */
export function useCreatePosBatch(
  opts?: Partial<
    UseMutationOptions<CreatePosBatchResponse, ApiError, CreatePosBatchInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<CreatePosBatchResponse, ApiError, CreatePosBatchInput>({
    mutationFn: (input) =>
      apiFetch<CreatePosBatchResponse>("/api/logistics/pos/batch", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["logistics", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.logistics.warehouse(), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Receive a PO line — increments stock + may flip PO to received. */
export function useReceivePoLineMutation(
  poId: string,
  opts?: Partial<
    UseMutationOptions<LogisticsReceivePoLineResponse, ApiError, ReceivePoLineInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<LogisticsReceivePoLineResponse, ApiError, ReceivePoLineInput>({
    mutationFn: (input) =>
      apiFetch<LogisticsReceivePoLineResponse>(
        `/api/logistics/pos/${poId}/receive`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.logistics.po(poId), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.warehouse(), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "movements"] });
      // Receiving stock can unblock awaiting_logistics_action orders → invalidate orders.
      await qc.invalidateQueries({ queryKey: ["logistics", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Cancel an open PO. Reason required; mirrors abandon-order shape. */
export function useCancelPoMutation(
  poId: string,
  opts?: Partial<
    UseMutationOptions<LogisticsPoMutationResponse, ApiError, { reason: string }>
  >,
) {
  const qc = useQueryClient();
  return useMutation<LogisticsPoMutationResponse, ApiError, { reason: string }>({
    mutationFn: (input) =>
      apiFetch<LogisticsPoMutationResponse>(
        `/api/logistics/pos/${poId}/cancel`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.logistics.po(poId), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** F1.A factory_pickup — assign pickup partner to a ready_for_pickup PO. */
export function useAssignPickupPartnerMutation(
  poId: string,
  opts?: Partial<
    UseMutationOptions<LogisticsPoMutationResponse, ApiError, AssignPickupPartnerInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<LogisticsPoMutationResponse, ApiError, AssignPickupPartnerInput>({
    mutationFn: (input) =>
      apiFetch<LogisticsPoMutationResponse>(
        `/api/logistics/pos/${poId}/assign-pickup-partner`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.logistics.po(poId), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** F1.A customer-rejection flow — reassign destination warehouse on a PO. */
export function useReassignPoWarehouseMutation(
  poId: string,
  opts?: Partial<
    UseMutationOptions<LogisticsPoMutationResponse, ApiError, ReassignPoWarehouseInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<LogisticsPoMutationResponse, ApiError, ReassignPoWarehouseInput>({
    mutationFn: (input) =>
      apiFetch<LogisticsPoMutationResponse>(
        `/api/logistics/pos/${poId}/reassign-warehouse`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.logistics.po(poId), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.warehouse(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Manual stock adjustment (positive=inbound, negative=damage/loss). Writes a
 *  stock_movements row + audit_log entry. */
export function useAdjustStockMutation(
  opts?: Partial<
    UseMutationOptions<LogisticsAdjustStockResponse, ApiError, AdjustStockInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<LogisticsAdjustStockResponse, ApiError, AdjustStockInput>({
    mutationFn: (input) =>
      apiFetch<LogisticsAdjustStockResponse>("/api/logistics/warehouse/adjust", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.logistics.warehouse(), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "movements"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

