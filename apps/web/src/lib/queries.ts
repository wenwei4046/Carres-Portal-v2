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
  type ProductModelDto,
  type ProductSkuDto,
  type SofaFabricDto,
  type ProductModelCreateInput,
  type ProductModelPatchInput,
  type ProductSkuCreateInput,
  type ProductSkuPatchInput,
  type SofaFabricCreateInput,
  type SofaFabricPatchInput,
  type ConfirmProceedRequestInput,
  type CreateOrderInput,
  type CreatePoInput,
  type CreatePosBatchInput,
  type CreatePosBatchResponse,
  type DealerSelf,
  type BankStatementCreateInput,
  type FinanceInvoiceIssueInput,
  type FinanceInvoiceVoidInput,
  type FinancePoPayInput,
  type FinancePoScheduleInput,
  type FinanceRecordReceiptInput,
  type FinanceTopupApproveInput,
  type ReconciliationCreateInput,
  type RefundApplyInput,
  type ListLogisticsOrdersQuery,
  type ListMovementsQuery,
  type ListPurchaseOrdersQuery,
  type Order,
  type OrdersListResponse,
  type OrderStatus,
  type OutletsListResponse,
  type ProcurementTabSlug,
  type ReassignPoWarehouseInput,
  type ReceivePoWithDoInput,
  type RefundCreateInput,
  type RefundPayInput,
  type ReservedDrilldownResponse,
  type SalespersonDto,
  type SalespersonCreateInput,
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
    partners:  () => ["principal", "partners"] as const,
  },
  // Phase 4.5 Chunk 1 — Logistics Partner (LP) namespace. Nested keys mirror
  // `principal` so we can blast `["partner"]` to invalidate the whole sub-tree
  // (e.g. after accept/reject RFD ripples to dashboard counts + pickups list).
  partner: {
    dashboard:  () => ["partner", "dashboard"] as const,
    pickups:    () => ["partner", "pickups"] as const,
    rfdPending: () => ["partner", "rfd-pending"] as const,
    toDeliver:  () => ["partner", "to-deliver"] as const,
    fleet:      () => ["partner", "fleet"] as const,
  },
  // Phase 4 — HQ Logistics namespace. Same nested-key strategy as `principal`
  // so M5 mutation hooks can blast `["logistics"]` (or a sub-tree) on each
  // ripple — e.g. assign-partner invalidates orders + dashboard; PO receive
  // invalidates pos + warehouse + dashboard. Filter keys are typed via the
  // `List*Query` zod-derived shapes from `@carres/shared` so a wrong key fails
  // typecheck at the call site rather than silently breaking cache reads.
  logistics: {
    dashboard: () => ["logistics", "dashboard"] as const,
    /** Loo 2026-05-10 — sidebar badge counts (orders awaiting + pickup-action
     *  POs). 30s refetch, kept under `logistics` so a future blunt invalidate
     *  on `["logistics"]` after a relevant mutation fans out here too. */
    badges:    () => ["logistics", "badges"] as const,
    orders:    (filters?: LogisticsOrderFilters) =>
      ["logistics", "orders", filters ?? {}] as const,
    order:     (id: string) => ["logistics", "orders", id] as const,
    partners:  () => ["logistics", "partners"] as const,
    suppliers: () => ["logistics", "suppliers"] as const,
    pos:       (filters?: LogisticsPoFilters) =>
      ["logistics", "pos", filters ?? {}] as const,
    po:        (id: string) => ["logistics", "pos", id] as const,
    /** Phase 4.5 Chunk 2 (T34) — per-supplier procurement tab list. Keyed by
     *  `slug` so each tab's cache stays distinct (otherwise switching tabs
     *  would thrash the same key). Nested under `pos` so a future blunt
     *  invalidation on `["logistics","pos"]` (e.g. after a CreatePO) reaches
     *  every tab too. */
    procurementTab: (slug: ProcurementTabSlug) =>
      ["logistics", "pos", "tab", slug] as const,
    /** Pipeline v2 (C5.3) — SKU-level shortage feed for the "Auto-fill from
     *  awaiting stock" button on CreatePOModal. Lazy: fired only on click via
     *  the hook's `refetch()`. Nested under `pos` so future blunt
     *  invalidations on `["logistics","pos"]` reach this cache too (e.g. when
     *  a PO is issued, the awaiting_logistics_action pool changes).
     *
     *  `dls` (optional, sorted) scopes shortage to a specific dl set, used by
     *  the cross-order bundle prefill flow. Sorting keeps the cache key stable
     *  across permutations of the same selection. */
    awaitingStockShortage: (dls?: number[]) =>
      dls && dls.length > 0
        ? (["logistics", "pos", "awaiting-stock-shortage", [...dls].sort((a, b) => a - b)] as const)
        : (["logistics", "pos", "awaiting-stock-shortage"] as const),
    /** Phase 4.5 Chunk 2 (T18/T21) — stock alerts derived from
     *  `(qty - reserved) < low_threshold`. Read by `StockAlertsTile` on the
     *  dashboard and (later) the warehouse red-dot indicator. The
     *  `SetThresholdDialog` invalidates this key on save so the tile
     *  re-derives. */
    stockAlerts: () => ["logistics", "stock-alerts"] as const,
    warehouse: () => ["logistics", "warehouse"] as const,
    /** Pipeline v2 (C4) — reserve drill-down per (warehouse, sku). Nested under
     *  warehouse so future blunt invalidations on `["logistics","warehouse"]`
     *  fan out to drill-down caches too. */
    reservedDrilldown: (warehouseId: string | null, sku: string | null) =>
      ["logistics", "warehouse", "reserved", warehouseId ?? "null", sku ?? "null"] as const,
    movements: (filters?: MovementsFilters) =>
      ["logistics", "movements", filters ?? {}] as const,
  },
  // Phase 5 — HQ Finance namespace. Same nested-key strategy as `principal`
  // and `logistics` so mutations can blast `["finance"]` (e.g. topup-approve
  // ripples to dashboard summary + payments list + AR aging) or a tighter
  // sub-tree.
  finance: {
    dashboardSummary: () => ["finance", "dashboard-summary"] as const,
    arAging:          () => ["finance", "ar-aging"] as const,
    apAging:          () => ["finance", "ap-aging"] as const,
    cashflow:         (weeks?: number) =>
      ["finance", "cashflow", weeks ?? 12] as const,
    monthlyPl:        (months?: number) =>
      ["finance", "monthly-pl", months ?? 6] as const,
    topSkus:          (limit?: number) =>
      ["finance", "top-skus", limit ?? 8] as const,
    bankStatements:   (filters?: { from?: string; to?: string; matched?: "true" | "false" }) =>
      ["finance", "bank-statements", filters ?? {}] as const,
    reconSuggest:     (bankStmtId: string) =>
      ["finance", "recon-suggest", bankStmtId] as const,
    payments:         (filters?: FinancePaymentsFilters) =>
      ["finance", "payments", filters ?? {}] as const,
    invoices:         (filters?: FinanceInvoicesFilters) =>
      ["finance", "invoices", filters ?? {}] as const,
    refunds:          (filters?: FinanceRefundsFilters) =>
      ["finance", "refunds", filters ?? {}] as const,
  },
  // Phase 8 — BD namespace.
  bd: {
    inquiries: () => ["bd", "inquiries"] as const,
  },
  // Phase 6 — Supplier namespace. Same nested-key strategy so mutations can
  // blast `["supplier"]` (e.g. ack/start-production ripples to PO list +
  // dashboard counts) or a tighter sub-tree.
  supplier: {
    me:       () => ["supplier", "me"] as const,
    activity: (limit?: number) => ["supplier", "activity", limit ?? 6] as const,
    pos:      (bucket?: SupplierBucket) => ["supplier", "pos", bucket ?? "all"] as const,
    po:       (id: string) => ["supplier", "pos", id] as const,
    products: () => ["supplier", "products"] as const,
    demand:   () => ["supplier", "products", "demand"] as const,
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
// Phase 5 — Finance filter shapes (kept as plain interfaces so the qk keys
// stay structurally typed without dragging the zod schema into every cache
// key build site).
// ---------------------------------------------------------------------------
export interface FinancePaymentsFilters {
  orderId?:   string;
  dealerId?:  string;
  direction?: "in" | "out";
  from?:      string;
  to?:        string;
  limit?:     number;
}
export interface FinanceInvoicesFilters {
  status?:   "all" | "unpaid" | "partial" | "paid" | "voided";
  dealerId?: string;
  from?:     string;
  to?:       string;
  limit?:    number;
}
export interface FinanceRefundsFilters {
  status?:   "all" | "pending" | "approved" | "rejected" | "paid" | "issued" | "applied";
  dealerId?: string;
  from?:     string;
  to?:       string;
  limit?:    number;
}

// ---------------------------------------------------------------------------
// Phase 5 — Finance response shapes (inline types matching the SQL RPC
// payloads; no need for a domain layer for these aggregates since they're
// read-only dashboard data, never round-tripped through adapters).
// ---------------------------------------------------------------------------
export interface FinanceArAgingRow {
  order_id:      string;
  dl:            number;
  customer_name: string;
  dealer_id:     string | null;
  dealer_name:   string | null;
  placed_at:     string;
  days:          number;
  aging:         "0-30" | "31-60" | "61-90" | "90+";
  total:         number;
  paid:          number;
  outstanding:   number;
  invoice_no:    string;
  status:        string;
}
export interface FinanceArAgingBucket {
  amount: number;
  count:  number;
}
export interface FinanceArAgingResponse {
  rows:    FinanceArAgingRow[];
  buckets: Record<"0-30" | "31-60" | "61-90" | "90+", FinanceArAgingBucket>;
}

// AP aging — finance_ap_aging() RPC payload (migration 0063). Single
// round-trip returns per-PO rows + bucket aggregates so FinanceAP and the
// dashboard ready-to-pay tile never disagree. pay_status_ui is a derived
// 5-value bucket; the raw db enum (pay_status) only has 3 values.
export type FinanceApPayStatusUi =
  | "matched"
  | "scheduled"
  | "paid"
  | "in_transit"
  | "in_production";
export interface FinanceApAgingLine {
  sku:          string;
  sku_name:     string;
  qty:          number;
  received_qty: number;
  unit_cost:    number | null;
  line_total:   number;
}
export interface FinanceApAgingHistoryEntry {
  text:        string;
  occurred_at: string;
  by_role:     string | null;
}
export interface FinanceApAgingRow {
  po_id:               string;
  dl:                  number | null;
  supplier_id:         string | null;
  supplier_name:       string | null;
  warehouse_id:        string | null;
  delivery_partner_id: string | null;
  placed_at:           string;
  expected_ready_date: string | null;
  eta_date:            string | null;
  pickup_date:         string | null;
  status:              string;
  sup_status:          string;
  pay_status:          "unpaid" | "scheduled" | "paid";
  pay_status_ui:       FinanceApPayStatusUi;
  qty:                 number;
  total:               number;
  do_number:           string | null;
  has_do:              boolean;
  due_in:              number | null;
  lines:               FinanceApAgingLine[];
  history:             FinanceApAgingHistoryEntry[];
}
export interface FinanceApAgingBucket {
  amount: number;
  count:  number;
}
export interface FinanceApAgingResponse {
  rows:        FinanceApAgingRow[];
  byPayStatus: Record<FinanceApPayStatusUi, FinanceApAgingBucket>;
}

// Cashflow series (Chunk B) — finance_cashflow_series RPC payload.
export interface FinanceCashflowSeries {
  labels:  string[];   // ["W18", "W19", ...]
  inflow:  number[];   // positive numbers per week
  outflow: number[];   // negative numbers per week (proto convention)
}

// Monthly P&L (Chunk B) — finance_monthly_pl RPC payload.
export interface FinanceMonthlyPlRow {
  m:       string;     // "Nov 25"
  revenue: number;
  cogs:    number;
  opex:    number;
  net:     number;
}
export interface FinanceMonthlyPlResponse {
  rows: FinanceMonthlyPlRow[];
}

// Top SKUs (Chunk B) — finance_top_skus RPC payload.
export interface FinanceTopSkuRow {
  sku:     string;
  name:    string;
  qty:     number;
  revenue: number;
}
export interface FinanceTopSkusResponse {
  rows: FinanceTopSkuRow[];
}

// Bank statement row (from /api/finance/bank-statements list — augmented
// with matched_ref derived from reconciliations join).
export interface FinanceBankStatementRow {
  id:             string;
  statement_date: string;
  description:    string;
  amount:         number;
  reference:      string | null;
  currency:       string;
  imported_from:  string;
  created_at:     string;
  matched_ref:    string | null;  // server-side derived
}

// Refund row (Chunk C) — credit_note_no IS NOT NULL discriminates a credit
// note from a refund. UI label derivation:
//   credit_note_no IS NULL  + status='pending'   -> "RF pending"
//   credit_note_no IS NULL  + status='approved'  -> "RF approved"
//   credit_note_no IS NULL  + status='paid'      -> "RF paid"
//   credit_note_no NOT NULL + status='approved'  -> "CN issued"
//   credit_note_no NOT NULL + status='paid'      -> "CN applied"
export interface FinanceRefundRow {
  id:                    string;
  order_id:              string;
  dealer_id:             string | null;
  amount:                number;
  reason:                string | null;
  status:                "pending" | "approved" | "rejected" | "paid";
  approval_id:           string | null;
  approved_at:           string | null;
  paid_at:               string | null;
  credit_note_no:        string | null;
  applied_to_order_id:   string | null;
  created_at:            string;
}

// finance_recon_suggest_matches RPC payload.
export interface FinanceReconCandidate {
  dl:            number;
  customer_name: string;
  dealer_name:   string | null;
  total:         number;
  paid:          number;
  outstanding:   number;
  invoice_no:    string;
  distance:      number;
}
export interface FinanceReconSuggestResponse {
  bank_statement: {
    id:             string;
    statement_date: string;
    description:    string;
    amount:         number;
    reference:      string | null;
  };
  candidates: FinanceReconCandidate[];
}
export interface FinanceDashboardSummary {
  ar:           { outstanding: number; count: number; overdueAmt: number; overdueCount: number };
  ap:           { dueAmt: number; count: number };
  cashflow12w:  { inflow: number; outflow: number; net: number };
  agingBuckets: Record<"0-30" | "31-60" | "61-90" | "90+", FinanceArAgingBucket>;
}
export interface FinancePaymentRow {
  id:           string;
  direction:    "in" | "out";
  amount:       number;
  method:       string;
  reference:    string | null;
  paid_at:      string;
  order_id:     string | null;
  po_id:        string | null;
  refund_id:    string | null;
  receipt_url:  string | null;
  recorded_by:  string | null;
  created_at:   string;
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
 *
 * 0075 (Loo 2026-05-09) — `admin: true` includes discontinued models so the
 * catalog admin UI can render them with a Restore toggle. Uses a distinct
 * cache key so the admin + public bundles don't collide.
 */
export function useCatalog(
  opts?: Partial<UseQueryOptions<CatalogResponse>> & { admin?: boolean },
) {
  const { admin, ...rest } = opts ?? {};
  return useQuery({
    queryKey: admin ? [...qk.catalog(), "admin"] : qk.catalog(),
    queryFn: () =>
      apiFetch<CatalogResponse>(`/api/catalog${admin ? "?admin=true" : ""}`),
    staleTime: 5 * 60_000,
    ...rest,
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

/**
 * Phase 2D — Dealer/Showroom Settings page CRUD.
 * useCreateSalesperson posts to POST /api/salespersons. After success,
 * invalidates the wizard's salespersons cache so the dropdown shows the
 * new row immediately. The hook is intentionally agnostic of which dealer
 * the new SP belongs to — server derives that from the JWT.
 */
export function useCreateSalesperson(
  opts?: Partial<UseMutationOptions<SalespersonDto, ApiError, SalespersonCreateInput>>,
) {
  const qc = useQueryClient();
  return useMutation<SalespersonDto, ApiError, SalespersonCreateInput>({
    mutationFn: (input) =>
      apiFetch<SalespersonDto>("/api/salespersons", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["salespersons"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useDeleteSalesperson(
  opts?: Partial<UseMutationOptions<{ ok: true }, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (id) =>
      apiFetch<{ ok: true }>(`/api/salespersons/${id}`, { method: "DELETE" }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["salespersons"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
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

/** Phase 4.5 Chunk 2 (T9) — embedded `order_supplier_threads` row shape on
 *  logistics order list/detail responses. Carries the per-leg customer-side LP
 *  fields that migrated off `purchase_orders` per design spec §CQ1 option (b).
 *  One row per (order, supplier, category); a multi-supplier order spawns N
 *  threads, each with its own customer-leg LP assignment. */
export interface LogisticsOrderThreadRow {
  id: string;
  supplier_id: string;
  category: string;
  logistics_stage:
    | "placed"
    | "proceed_request"
    | "awaiting_logistics_action"
    | "ready_to_dispatch"
    | "dispatched"
    | "delivered";
  po_id: string | null;
  /** Phase 4.5 Chunk 2 customer-leg LP source (migration 0049). FE OrderCard
   *  reads this to render the LP pill; an order may have heterogeneous LPs
   *  across threads (different supplier legs picked different partners). */
  delivery_partner_id: string | null;
  confirm_delivery_date: string | null;
  request_for_delivery_at: string | null;
  partner_accepted_at: string | null;
  partner_rejected_at: string | null;
}

/** Row in GET /api/logistics/orders. Embedded `dealers(name)` is a PostgREST
 *  nested fetch shape — the route forwards it verbatim.
 *
 *  Pipeline v2 (C1/C2): adds `'placed'` + `'proceed_request'` to logistics_stage
 *  and widens status to include the dealer-side `'place'` value (orders that
 *  haven't been pushed to logistics yet still surface in the kanban so HQ can
 *  see what's coming).
 *
 *  Phase 4.5 Chunk 2 (T9): adds embedded `order_supplier_threads` array
 *  (PostgREST nested fetch) — exposes per-thread customer-leg LP for the
 *  OrderCard pill. The order-level `delivery_partner_id` is kept for backward
 *  compat (print-DO and other legacy callers) — but the kanban now reads from
 *  threads to honor multi-supplier scenarios. */
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
  /** Phase 4.5 Chunk 2 (T9) embedded customer-leg LP per thread. PostgREST
   *  nested fetches always return an array shape — never `null` — so this
   *  field is non-nullable. An empty array means no threads have been spawned
   *  yet (pre-confirm-proceed orders); the FE treats `[]` as "no thread state
   *  available" and omits the LP pill. */
  order_supplier_threads: LogisticsOrderThreadRow[];
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
  // 2026-05-10 (Loo) — cascade picker payload threaded into the "+ Issue POs"
  // → CreatePOModal navigation so bedframe color/gap and sofa fabric stay
  // attached to the new PO line. Null for mattress lines (no extras) and
  // pre-cascade legacy data.
  attrs?: Record<string, unknown> | null;
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
  /** Phase 4.5 Chunk 2 (T9) — per-supplier thread rows carrying customer-leg
   *  LP state. Drawer reads `threads[].delivery_partner_id` to compute partner
   *  assignment instead of order-level `delivery_partner_id`, since per design
   *  spec §CQ1 option (b) the customer-leg LP lives on the thread now. */
  threads: LogisticsOrderThreadRow[];
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
  purchase_order_lines: {
    // 0076 (Loo 2026-05-10): line UUID — primary key after migration. Used
    // by ReceivePOModal as the recv-state key (replacing sku) so multi-
    // variant lines (same SKU different colors/fabrics) don't collide. Also
    // the lookup key for logistics_receive_po_with_do.
    id: string;
    sku: string;
    qty: number;
    received_qty: number;
    // 0073 cascade picker (Loo 2026-05-09). Null for mattress + legacy
    // pre-0073 lines; bedframe carries {color, gap}; sofa carries
    // {fabric_id, fabric_name, fabric_surcharge}.
    attrs?: Record<string, unknown> | null;
  }[];
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
  /** T42-pass3-C1 — current `stock_balances.low_threshold`. NULL = no alert
   *  configured. Used by `SetThresholdDialog` prefill from LogisticsWarehouse. */
  low_threshold: number | null;
  /** T42-pass3-C1 — current `stock_balances.high_threshold`. NULL = use low * 2
   *  fallback. Same prefill purpose as low_threshold. */
  high_threshold: number | null;
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
/** Phase 4.5 Chunk 2 (T18/T21) — `GET /api/logistics/stock-alerts` row shape.
 *  RPC `logistics_stock_alerts()` returns rows where `(qty - reserved) <
 *  low_threshold`. The dashboard tile slices the top-3 by shortage; the
 *  warehouse page (Sprint D follow-up) drives a red-dot indicator off the
 *  count. `effective = qty - reserved`; `shortage = low_threshold - effective`. */
export interface LogisticsStockAlertRow {
  sku: string;
  warehouse_id: string;
  qty: number;
  reserved: number;
  effective: number;
  low_threshold: number;
  shortage: number;
}
export interface LogisticsStockAlertsResponse {
  alerts: LogisticsStockAlertRow[];
}
export interface LogisticsReceivePoWithDoResponse {
  po_id: string;
  do_file_path: string;
  do_number: string;
  lines_updated: number;
  threads_advanced: number;
  po_status: "open" | "received" | "cancelled";
  sup_status: string;
  was_relocated: boolean;
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

/** Loo 2026-05-10 — sidebar badge counts. Polled every 30s so the operator
 *  sees the chip update without leaving the page. Mounted from
 *  LogisticsSidebar; staleTime matches refetchInterval so the cache stays
 *  warm across nav transitions. */
export function useLogisticsBadges(
  opts?: Partial<UseQueryOptions<import("@carres/shared").LogisticsBadgesResponse>>,
) {
  return useQuery({
    queryKey: qk.logistics.badges(),
    queryFn: () =>
      apiFetch<import("@carres/shared").LogisticsBadgesResponse>(
        "/api/logistics/badges",
      ),
    staleTime: 30_000,
    refetchInterval: 30_000,
    ...opts,
  });
}

/**
 * Mark a logistics nav badge as seen — Loo 2026-05-11 unread semantics.
 *
 * Optimistically zeros the count for the given key in the badges cache so
 * the UI reacts instantly (~16 ms instead of waiting for the next 30s
 * poll). On settle, invalidates the badges query so the actual server
 * count (could be >0 if new items advanced between click and ack)
 * reconciles.
 *
 * Pairs with POST /api/logistics/badges/seen which calls the
 * mark_badge_seen RPC (migration 0083).
 */
type LogisticsBadgeKey = "logistics:orders" | "logistics:procurement";
type LogisticsBadgeKeyShort = "orders" | "procurement";

export function useMarkLogisticsBadgeSeen() {
  const qc = useQueryClient();
  return useMutation<
    { badgeKey: LogisticsBadgeKey; lastSeenAt: string },
    ApiError,
    LogisticsBadgeKeyShort,
    { prev: import("@carres/shared").LogisticsBadgesResponse | undefined }
  >({
    mutationFn: (short) =>
      apiFetch("/api/logistics/badges/seen", {
        method: "POST",
        body: JSON.stringify({ badgeKey: `logistics:${short}` }),
      }),
    onMutate: async (short) => {
      await qc.cancelQueries({ queryKey: qk.logistics.badges() });
      const prev = qc.getQueryData<import("@carres/shared").LogisticsBadgesResponse>(
        qk.logistics.badges(),
      );
      if (prev) {
        qc.setQueryData<import("@carres/shared").LogisticsBadgesResponse>(
          qk.logistics.badges(),
          { ...prev, [short]: 0 },
        );
      }
      return { prev };
    },
    onError: (_err, _short, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.logistics.badges(), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.logistics.badges() });
    },
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

/** Phase 4.5 Chunk 2 (T34) — per-tab procurement listing.
 *  Wraps `GET /api/logistics/procurement/:slug` (T33). Each tab on the
 *  TabbedProcurementShell mounts a child component that calls this hook with
 *  its own slug, so the active tab's data fetches lazily on mount. The
 *  response shape mirrors `LogisticsPosListResponse` (`{ pos: [...] }`) so
 *  child tabs can reuse the existing PO row rendering verbatim. */
export function useProcurementTab(
  slug: ProcurementTabSlug,
  opts?: Partial<UseQueryOptions<LogisticsPosListResponse>>,
) {
  return useQuery({
    queryKey: qk.logistics.procurementTab(slug),
    queryFn: () =>
      apiFetch<LogisticsPosListResponse>(
        `/api/logistics/procurement/${encodeURIComponent(slug)}`,
      ),
    staleTime: 30_000,
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
 *  clicks (e.g. user dispatches an order, abandons one).
 *
 *  Bundle scoping: when `dls` is non-empty the query appends `?dls=1,2,3` so
 *  the server narrows shortage to those orders only — used by the
 *  CrossOrderBundleSheet → CreatePOModal flow so the modal pre-fills lines
 *  for the operator's exact selection instead of the global awaiting pool. */
export function useAwaitingStockShortage(
  dls?: number[],
  opts?: Partial<UseQueryOptions<LogisticsAwaitingStockShortageResponse>>,
) {
  const hasDls = dls != null && dls.length > 0;
  const url = hasDls
    ? `/api/logistics/pos/awaiting-stock-shortage?dls=${[...dls!].sort((a, b) => a - b).join(",")}`
    : "/api/logistics/pos/awaiting-stock-shortage";
  return useQuery({
    queryKey: qk.logistics.awaitingStockShortage(dls),
    queryFn: () => apiFetch<LogisticsAwaitingStockShortageResponse>(url),
    enabled: false,
    staleTime: 0,
    ...opts,
  });
}

/** Phase 4.5 Chunk 2 (T18/T21) — Stock alerts feed. Used by the dashboard
 *  `StockAlertsTile` (count + top-3) and the warehouse page red-dot indicator.
 *  Cache key `["logistics","stock-alerts"]` is invalidated by
 *  `SetThresholdDialog` on save so a freshly-cleared low threshold removes the
 *  tile entry without a manual refetch. staleTime mirrors the dashboard
 *  surface (30s) — alerts only shift when stock or thresholds change, both of
 *  which already trigger broader invalidations on their own mutation paths. */
export function useStockAlerts(
  opts?: Partial<UseQueryOptions<LogisticsStockAlertsResponse>>,
) {
  return useQuery({
    queryKey: qk.logistics.stockAlerts(),
    queryFn: () =>
      apiFetch<LogisticsStockAlertsResponse>("/api/logistics/stock-alerts"),
    staleTime: 30_000,
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
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.logistics.stockAlerts() });
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
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.logistics.stockAlerts() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** 2026-05-12 (Loo) — back-arrow from Proceed Request column → Placed.
 *  No body. Server enforces logistics or principal role + RPC 0095 enforces
 *  current stage. */
export function useRevertOrderProceedMutation(
  orderId: string,
  opts?: Partial<UseMutationOptions<{ order_id: string; dl: number }, ApiError, void>>,
) {
  const qc = useQueryClient();
  return useMutation<{ order_id: string; dl: number }, ApiError, void>({
    mutationFn: () =>
      apiFetch<{ order_id: string; dl: number }>(
        `/api/logistics/orders/${orderId}/revert-proceed`,
        { method: "POST" },
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

/** 2026-05-12 (Loo) — back-arrow from Dispatched column → Ready to Dispatch.
 *  Reverts every dispatched thread on the order; clears partner assignment. */
export function useRevertOrderDispatchMutation(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<{ order_id: string; dl: number; threads_reverted: number }, ApiError, void>
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { order_id: string; dl: number; threads_reverted: number },
    ApiError,
    void
  >({
    mutationFn: () =>
      apiFetch<{ order_id: string; dl: number; threads_reverted: number }>(
        `/api/logistics/orders/${orderId}/revert-dispatch`,
        { method: "POST" },
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
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.logistics.stockAlerts() });
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
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.logistics.stockAlerts() });
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
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.logistics.stockAlerts() });
      await qc.invalidateQueries({ queryKey: ["logistics", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * Receive a PO with DO upload — single batched call carrying all ticked lines
 * plus the uploaded DO file path and supplier DO number. Maps to v3 RPC
 * `logistics_receive_po_with_do` (migration 0045) per Phase 4.5 Chunk 1
 * carry-forward `phase-4.5-chunk-1-receive-rpc-v3-swap`.
 */
export function useReceivePoWithDoMutation(
  poId: string,
  opts?: Partial<
    UseMutationOptions<LogisticsReceivePoWithDoResponse, ApiError, ReceivePoWithDoInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<LogisticsReceivePoWithDoResponse, ApiError, ReceivePoWithDoInput>({
    mutationFn: (input) =>
      apiFetch<LogisticsReceivePoWithDoResponse>(
        `/api/logistics/pos/${poId}/receive`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.logistics.po(poId), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.warehouse(), exact: true });
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.logistics.stockAlerts() });
      await qc.invalidateQueries({ queryKey: ["logistics", "movements"] });
      // Receiving stock can unblock awaiting_logistics_action orders → invalidate orders.
      await qc.invalidateQueries({ queryKey: ["logistics", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * Partner-side variant of useReceivePoWithDoMutation — Loo 2026-05-11.
 *
 * Posts to /api/partner/pickups/:id/receive, which calls the SAME
 * `logistics_receive_po_with_do` RPC under the hood (the RPC's role gate
 * already admits partners + checks procurement_partner_id matches caller).
 * Replaces the "Arrived at WH → wait for Logistics Receive" two-step with
 * one atomic move: partner uploads DO + ticks qty → PO flips straight to
 * status='received'.
 *
 * Cache invalidation differs from the logistics version: blast the partner
 * sub-tree (so dashboard + pickups kanban refresh) AND the logistics tree
 * (so the procurement view sees the PO arrive in the Received tab).
 */
export function useReceivePoAsPartnerMutation(
  poId: string,
  opts?: Partial<
    UseMutationOptions<LogisticsReceivePoWithDoResponse, ApiError, ReceivePoWithDoInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<LogisticsReceivePoWithDoResponse, ApiError, ReceivePoWithDoInput>({
    mutationFn: (input) =>
      apiFetch<LogisticsReceivePoWithDoResponse>(
        `/api/partner/pickups/${poId}/receive`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      // Partner-side caches.
      await qc.invalidateQueries({ queryKey: ["partner"] });
      // Logistics-side caches (PO appears in Received tab; warehouse stock
      // bumped; orders may unblock awaiting_logistics_action).
      await qc.invalidateQueries({ queryKey: qk.logistics.po(poId), exact: true });
      await qc.invalidateQueries({ queryKey: ["logistics", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.warehouse(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.logistics.stockAlerts() });
      await qc.invalidateQueries({ queryKey: ["logistics", "movements"] });
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
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.logistics.stockAlerts() });
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
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.logistics.stockAlerts() });
      await qc.invalidateQueries({ queryKey: ["logistics", "movements"] });
      await qc.invalidateQueries({ queryKey: qk.logistics.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 5 — Finance hooks (queries + mutations)
// ---------------------------------------------------------------------------
// Server contract:
//   GET   /api/finance/reports/dashboard-summary  -> FinanceDashboardSummary
//   GET   /api/finance/reports/ar-aging           -> FinanceArAgingResponse
//   GET   /api/finance/payments?filter            -> FinancePaymentRow[]
//   POST  /api/finance/payments/topup-approve     mutation -> payments row
//   POST  /api/finance/payments/order-receipt     mutation -> payments row
//   POST  /api/finance/invoices/issue             mutation -> invoices row
//   POST  /api/finance/invoices/:id/void          mutation -> invoices row
//   POST  /api/finance/refunds/create             mutation -> { refund, needsApproval }
//   POST  /api/finance/refunds/:id/pay            mutation -> refunds row
//
// Each mutation invalidates the relevant qk.finance.* keys + ripples to
// related namespaces (e.g. topup-approve invalidates principal.approvals
// since it mutates an approval row, plus dealer caches since deposit_balance
// changes).

function toFinancePaymentsSearch(f?: FinancePaymentsFilters): string {
  if (!f) return "";
  const p = new URLSearchParams();
  if (f.orderId)   p.set("orderId",   f.orderId);
  if (f.dealerId)  p.set("dealerId",  f.dealerId);
  if (f.direction) p.set("direction", f.direction);
  if (f.from)      p.set("from",      f.from);
  if (f.to)        p.set("to",        f.to);
  if (f.limit)     p.set("limit",     String(f.limit));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

function toFinanceInvoicesSearch(f?: FinanceInvoicesFilters): string {
  if (!f) return "";
  const p = new URLSearchParams();
  if (f.status)   p.set("status",   f.status);
  if (f.dealerId) p.set("dealerId", f.dealerId);
  if (f.from)     p.set("from",     f.from);
  if (f.to)       p.set("to",       f.to);
  if (f.limit)    p.set("limit",    String(f.limit));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

function toFinanceRefundsSearch(f?: FinanceRefundsFilters): string {
  if (!f) return "";
  const p = new URLSearchParams();
  if (f.status)   p.set("status",   f.status);
  if (f.dealerId) p.set("dealerId", f.dealerId);
  if (f.from)     p.set("from",     f.from);
  if (f.to)       p.set("to",       f.to);
  if (f.limit)    p.set("limit",    String(f.limit));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export function useFinanceDashboardSummary(
  opts?: Partial<UseQueryOptions<FinanceDashboardSummary>>,
) {
  return useQuery({
    queryKey: qk.finance.dashboardSummary(),
    queryFn: () => apiFetch<FinanceDashboardSummary>("/api/finance/reports/dashboard-summary"),
    staleTime: 30_000,
    ...opts,
  });
}

export function useFinanceArAging(
  opts?: Partial<UseQueryOptions<FinanceArAgingResponse>>,
) {
  return useQuery({
    queryKey: qk.finance.arAging(),
    queryFn: () => apiFetch<FinanceArAgingResponse>("/api/finance/reports/ar-aging"),
    staleTime: 30_000,
    ...opts,
  });
}

export function useFinanceApAging(
  opts?: Partial<UseQueryOptions<FinanceApAgingResponse>>,
) {
  return useQuery({
    queryKey: qk.finance.apAging(),
    queryFn: () => apiFetch<FinanceApAgingResponse>("/api/finance/reports/ap-aging"),
    staleTime: 30_000,
    ...opts,
  });
}

export function useFinanceCashflow(
  weeks?: number,
  opts?: Partial<UseQueryOptions<FinanceCashflowSeries>>,
) {
  return useQuery({
    queryKey: qk.finance.cashflow(weeks),
    queryFn: () =>
      apiFetch<FinanceCashflowSeries>(
        `/api/finance/reports/cashflow${weeks ? `?weeks=${weeks}` : ""}`,
      ),
    staleTime: 60_000,
    ...opts,
  });
}

export function useFinanceMonthlyPl(
  months?: number,
  opts?: Partial<UseQueryOptions<FinanceMonthlyPlResponse>>,
) {
  return useQuery({
    queryKey: qk.finance.monthlyPl(months),
    queryFn: () =>
      apiFetch<FinanceMonthlyPlResponse>(
        `/api/finance/reports/monthly-pl${months ? `?months=${months}` : ""}`,
      ),
    staleTime: 60_000,
    ...opts,
  });
}

export function useFinanceTopSkus(
  limit?: number,
  opts?: Partial<UseQueryOptions<FinanceTopSkusResponse>>,
) {
  return useQuery({
    queryKey: qk.finance.topSkus(limit),
    queryFn: () =>
      apiFetch<FinanceTopSkusResponse>(
        `/api/finance/reports/top-skus${limit ? `?limit=${limit}` : ""}`,
      ),
    staleTime: 60_000,
    ...opts,
  });
}

export function useFinanceBankStatements(
  filters?: { from?: string; to?: string; matched?: "true" | "false" },
  opts?: Partial<UseQueryOptions<FinanceBankStatementRow[]>>,
) {
  const qs = new URLSearchParams();
  if (filters?.from)    qs.set("from",    filters.from);
  if (filters?.to)      qs.set("to",      filters.to);
  if (filters?.matched) qs.set("matched", filters.matched);
  const search = qs.toString();
  return useQuery({
    queryKey: qk.finance.bankStatements(filters),
    queryFn: () =>
      apiFetch<FinanceBankStatementRow[]>(
        `/api/finance/bank-statements${search ? `?${search}` : ""}`,
      ),
    staleTime: 30_000,
    ...opts,
  });
}

export function useFinanceReconSuggest(
  bankStmtId: string,
  opts?: Partial<UseQueryOptions<FinanceReconSuggestResponse>>,
) {
  return useQuery({
    queryKey: qk.finance.reconSuggest(bankStmtId),
    queryFn: () =>
      apiFetch<FinanceReconSuggestResponse>(
        `/api/finance/reconciliations/suggest/${bankStmtId}`,
      ),
    enabled: !!bankStmtId,
    staleTime: 30_000,
    ...opts,
  });
}

export function useFinancePayments(
  filters?: FinancePaymentsFilters,
  opts?: Partial<UseQueryOptions<FinancePaymentRow[]>>,
) {
  return useQuery({
    queryKey: qk.finance.payments(filters),
    queryFn: () => apiFetch<FinancePaymentRow[]>(`/api/finance/payments${toFinancePaymentsSearch(filters)}`),
    staleTime: 15_000,
    ...opts,
  });
}

// Invoice row shape (matches the `invoices` table in 0001:409-420).
export interface FinanceInvoiceRow {
  id:         string;
  invoice_no: string;
  order_id:   string;
  amount:     number;
  tax_amount: number;
  issued_at:  string;
  voided_at:  string | null;
  pdf_url:    string | null;
  created_at: string;
}

export function useFinanceInvoices(
  filters?: FinanceInvoicesFilters,
  opts?: Partial<UseQueryOptions<FinanceInvoiceRow[]>>,
) {
  return useQuery({
    queryKey: qk.finance.invoices(filters),
    queryFn: () => apiFetch<FinanceInvoiceRow[]>(`/api/finance/invoices${toFinanceInvoicesSearch(filters)}`),
    staleTime: 30_000,
    ...opts,
  });
}

export function useFinanceRefunds(
  filters?: FinanceRefundsFilters,
  opts?: Partial<UseQueryOptions<FinanceRefundRow[]>>,
) {
  return useQuery({
    queryKey: qk.finance.refunds(filters),
    queryFn: () => apiFetch<FinanceRefundRow[]>(`/api/finance/refunds${toFinanceRefundsSearch(filters)}`),
    staleTime: 30_000,
    ...opts,
  });
}

export function useTopupApprove(
  opts?: Partial<UseMutationOptions<FinancePaymentRow, ApiError, FinanceTopupApproveInput>>,
) {
  const qc = useQueryClient();
  return useMutation<FinancePaymentRow, ApiError, FinanceTopupApproveInput>({
    mutationFn: (input) =>
      apiFetch<FinancePaymentRow>("/api/finance/payments/topup-approve", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // Approval row decided + payment row inserted + deposit_balance bumped.
      // Invalidate everything that depends on these.
      await qc.invalidateQueries({ queryKey: ["finance"] });
      await qc.invalidateQueries({ queryKey: ["principal", "approvals"] });
      await qc.invalidateQueries({ queryKey: ["dealers"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useRecordReceipt(
  opts?: Partial<UseMutationOptions<FinancePaymentRow, ApiError, FinanceRecordReceiptInput>>,
) {
  const qc = useQueryClient();
  return useMutation<FinancePaymentRow, ApiError, FinanceRecordReceiptInput>({
    mutationFn: (input) =>
      apiFetch<FinancePaymentRow>("/api/finance/payments/order-receipt", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // orders.paid bumped + new payment inserted. AR aging shifts.
      await qc.invalidateQueries({ queryKey: ["finance"] });
      await qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useIssueInvoice(
  opts?: Partial<UseMutationOptions<unknown, ApiError, FinanceInvoiceIssueInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, FinanceInvoiceIssueInput>({
    mutationFn: (input) =>
      apiFetch<unknown>("/api/finance/invoices/issue", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // orders.invoice_no + invoiced_at set; new invoices row.
      await qc.invalidateQueries({ queryKey: qk.finance.invoices() });
      await qc.invalidateQueries({ queryKey: qk.finance.arAging() });
      await qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useVoidInvoice(
  invoiceId: string,
  opts?: Partial<UseMutationOptions<unknown, ApiError, FinanceInvoiceVoidInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, FinanceInvoiceVoidInput>({
    mutationFn: (input) =>
      apiFetch<unknown>(`/api/finance/invoices/${invoiceId}/void`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.finance.invoices() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useCreateRefund(
  opts?: Partial<UseMutationOptions<{ refund: unknown; needsApproval: boolean }, ApiError, RefundCreateInput>>,
) {
  const qc = useQueryClient();
  return useMutation<{ refund: unknown; needsApproval: boolean }, ApiError, RefundCreateInput>({
    mutationFn: (input) =>
      apiFetch<{ refund: unknown; needsApproval: boolean }>("/api/finance/refunds/create", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.finance.refunds() });
      // amount > 1000 path also creates an approval row
      await qc.invalidateQueries({ queryKey: ["principal", "approvals"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useRefundPay(
  refundId: string,
  opts?: Partial<UseMutationOptions<unknown, ApiError, RefundPayInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, RefundPayInput>({
    mutationFn: (input) =>
      apiFetch<unknown>(`/api/finance/refunds/${refundId}/pay`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // refunds.status='paid' + paid_at + outbound payments row
      await qc.invalidateQueries({ queryKey: qk.finance.refunds() });
      await qc.invalidateQueries({ queryKey: qk.finance.payments() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function usePoPay(
  opts?: Partial<UseMutationOptions<FinancePaymentRow, ApiError, FinancePoPayInput>>,
) {
  const qc = useQueryClient();
  return useMutation<FinancePaymentRow, ApiError, FinancePoPayInput>({
    mutationFn: (input) =>
      apiFetch<FinancePaymentRow>("/api/finance/payments/po-pay", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // PO.pay_status='paid' + new outbound payments row. Ripples to
      // ap-aging, dashboard summary, payments list.
      await qc.invalidateQueries({ queryKey: ["finance"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function usePoSchedule(
  opts?: Partial<UseMutationOptions<unknown, ApiError, FinancePoScheduleInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, FinancePoScheduleInput>({
    mutationFn: (input) =>
      apiFetch<unknown>("/api/finance/payments/po-schedule", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // PO.pay_status flips unpaid -> scheduled. Buckets shift.
      await qc.invalidateQueries({ queryKey: qk.finance.apAging() });
      await qc.invalidateQueries({ queryKey: qk.finance.dashboardSummary() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useCreateBankStatement(
  opts?: Partial<UseMutationOptions<FinanceBankStatementRow, ApiError, BankStatementCreateInput>>,
) {
  const qc = useQueryClient();
  return useMutation<FinanceBankStatementRow, ApiError, BankStatementCreateInput>({
    mutationFn: (input) =>
      apiFetch<FinanceBankStatementRow>("/api/finance/bank-statements", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.finance.bankStatements() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useCreateReconciliation(
  opts?: Partial<UseMutationOptions<unknown, ApiError, ReconciliationCreateInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, ReconciliationCreateInput>({
    mutationFn: (input) =>
      apiFetch<unknown>("/api/finance/reconciliations", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // matched_ref derivation flips on the bank-statements list.
      await qc.invalidateQueries({ queryKey: qk.finance.bankStatements() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useApplyCreditNote(
  refundId: string,
  opts?: Partial<UseMutationOptions<FinanceRefundRow, ApiError, RefundApplyInput>>,
) {
  const qc = useQueryClient();
  return useMutation<FinanceRefundRow, ApiError, RefundApplyInput>({
    mutationFn: (input) =>
      apiFetch<FinanceRefundRow>(`/api/finance/refunds/${refundId}/apply`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // refund row flips status='paid' + applied_to_order_id set.
      // The target order's outstanding balance is conceptually reduced
      // but Phase 5 V1 doesn't auto-deduct on the order side — that
      // happens on next checkout / dealer ack. Invalidate the refunds
      // list + AR aging so finance sees the CN move to "applied".
      await qc.invalidateQueries({ queryKey: qk.finance.refunds() });
      await qc.invalidateQueries({ queryKey: qk.finance.arAging() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useDeleteReconciliation(
  opts?: Partial<UseMutationOptions<unknown, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (recId) =>
      apiFetch<unknown>(`/api/finance/reconciliations/${recId}`, {
        method: "DELETE",
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.finance.bankStatements() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}


// ---------------------------------------------------------------------------
// Phase 6 — Supplier namespace. Mirrors finance pattern: typed row interfaces
// + 4 GET query hooks + 4 POST mutation hooks. Mutations invalidate the
// relevant qk.supplier.* keys to keep dashboard counts + PO lists in sync.
// ---------------------------------------------------------------------------

export type SupplierBucket = "po" | "ready" | "delivered";

export type SupplierSupStatus =
  | "pending"
  | "acknowledged"
  | "in_production"
  | "ready_for_pickup"
  | "ready_confirm_sent"
  // 0090 sofa flow (Loo 2026-05-11): partner WH owner confirmed receive;
  // supplier now self-dispatches.
  | "partner_confirmed"
  | "pickup_assigned"
  | "pickup_accepted"
  | "shipped"
  | "picked_up"
  | "delivered"
  | "reassign_needed";

/** Mirror of `purchase_orders` row visible to a supplier (RLS-scoped to
 *  own supplier_id). Keep fields aligned with API response from
 *  GET /api/supplier/pos. */
export interface SupplierPoLine {
  id: string;
  sku: string;
  qty: number;
  received_qty: number;
  // 0073 cascade picker payload — bedframe={color,gap}, sofa={fabric_id,
  // fabric_name, fabric_surcharge}, mattress=null. Supplier sees this on
  // the PO card so they make the right version.
  attrs?: Record<string, unknown> | null;
}

export interface SupplierPoRow {
  id: string;
  dl: number | null;
  supplier_id: string;
  warehouse_id: string;
  // 2026-05-10 (Loo) — was scalar `sku`/`qty` (read from dropped columns
  // post-0017) which always rendered blank. Now embeds the full line array
  // so the supplier card sums qty + lists every variant.
  lines: SupplierPoLine[];
  // 2026-05-11 (Loo migration 0091) — embed destination warehouse + owning
  // partner so the supplier card can render "send to X (owned by partner Y)"
  // — supplier self-delivers and needs to know where the goods go.
  warehouses: {
    id: string;
    name: string;
    address: string | null;
    kind: "own" | "logistics_partner" | null;
    owning_partner_id: string | null;
    owner: { id: string; name: string; contact: string | null } | null;
  } | null;
  status: "open" | "received" | "cancelled";
  sup_status: SupplierSupStatus;
  delivery_partner_id: string | null;
  expected_ready_date: string | null;
  pickup_date: string | null;
  eta_date: string | null;
  customer_rejection: unknown;
  pay_status: "unpaid" | "scheduled" | "paid";
  do_number: string | null;
  placed_at: string;
  created_at: string;
  updated_at: string;
}

export interface SupplierProductRow {
  sku: string;
  category: string;
  model_key: string;
  variant: string;
  price: number;
  model: { name: string; blurb: string | null } | null;
}

/** GET /api/supplier/activity row — closes phase-6-supplier-recent-activity.
 *  RLS-scoped via po_history_read (0002:256); supplier sees only own rows. */
export interface SupplierActivityRow {
  id:          string;
  po_id:       string;
  text:        string;
  by_role:     string | null;
  occurred_at: string;
}

/** GET /api/supplier/me payload — closes phase-6-supplier-me-endpoint.
 *  `kind` gates the PO action buttons (factory_pickup skips Acknowledge);
 *  `cat_covered` + `lead_time` + `contact_email` feed the Dashboard
 *  Coverage callout (proto:supplier-pages.jsx:184-195). */
export interface SupplierMe {
  id:             string;
  name:           string;
  kind:           "own_logistics" | "factory_pickup";
  cat_covered:    string[];
  lead_time:      string | null;
  contact:        string | null;
  contact_email:  string | null;
  slug:           string | null;
  portal_enabled: boolean;
}

export interface SupplierDemandRow {
  sku: string;
  /** Formal commitment (already-issued PO lines). */
  openQty: number;
  poCount: number;
  // 2026-05-10 (Loo) — pre-commit demand from sales orders matching the
  // supplier's cat_covered. Fed by `supplier_pending_demand()` RPC; null/0
  // means "nothing in the pipeline beyond what's already POed".
  pendingQty: number;
  pendingOrderCount: number;
}

/** Phase 7 Sprint 1 — partner_threads_to_deliver RPC payload. */
export interface PartnerToDeliverRow {
  thread_id:             string;
  order_id:              string;
  po_id:                 string | null;
  customer_name:         string;
  customer_address:      string | null;
  customer_phone:        string | null;
  dispatched_at:         string;
  confirm_delivery_date: string | null;
}

export function usePartnerToDeliver(
  opts?: Partial<UseQueryOptions<PartnerToDeliverRow[], ApiError>>,
) {
  return useQuery<PartnerToDeliverRow[], ApiError>({
    queryKey: qk.partner.toDeliver(),
    queryFn: () => apiFetch<PartnerToDeliverRow[]>("/api/partner/pickups/to-deliver"),
    staleTime: 30_000,
    ...opts,
  });
}

/** Phase 7 — partner_attach_pod mutation. Caller passes threadId + podPath
 *  (the path returned by the prior sign-upload call) + DO number + optional
 *  note + signed bool. On success, blasts the partner namespace (toDeliver
 *  disappears, dashboard counts update).
 *
 *  Migration 0088 (Loo 2026-05-11): partner POD upload now matches the
 *  logistics DOAttachModal field set so role-switching operators don't
 *  re-learn anything. RPC validates signed=true + doNumber ≥3 chars +
 *  podPath non-empty. */
export type AttachPodInput = {
  threadId:  string;
  podPath:   string;
  doNumber:  string;
  doNote?:   string;
  signed:    true;
};
export function useAttachPod(
  opts?: Partial<UseMutationOptions<unknown, ApiError, AttachPodInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, AttachPodInput>({
    mutationFn: ({ threadId, podPath, doNumber, doNote, signed }) =>
      apiFetch(`/api/partner/pod/${threadId}/attach`, {
        method: "POST",
        body: JSON.stringify({ podPath, doNumber, doNote, signed }),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["partner"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 8 — BD namespace.
// ---------------------------------------------------------------------------
export type InquiryKind = "new_dealer" | "expansion" | "product";
export type InquiryStage = "new" | "contacted" | "qualified" | "converted" | "lost";

export interface InquiryRow {
  id:                string;
  kind:              InquiryKind;
  company:           string;
  region:            string | null;
  contact:           string | null;
  stage:             InquiryStage;
  owner_user_id:     string | null;
  note:              string | null;
  linked_dealer_id:  string | null;
  created_at:        string;
  updated_at:        string;
}

export interface InquiryCreateInput {
  kind:    InquiryKind;
  company: string;
  region?: string | null;
  contact?: string | null;
  note?:   string | null;
}

export interface InquiryUpdateInput {
  stage?:   InquiryStage;
  contact?: string | null;
  region?:  string | null;
  note?:    string | null;
}

export function useBdInquiries(
  opts?: Partial<UseQueryOptions<InquiryRow[], ApiError>>,
) {
  return useQuery<InquiryRow[], ApiError>({
    queryKey: qk.bd.inquiries(),
    queryFn: () => apiFetch<InquiryRow[]>("/api/bd/inquiries"),
    staleTime: 30_000,
    ...opts,
  });
}

export function useCreateInquiry(
  opts?: Partial<UseMutationOptions<InquiryRow, ApiError, InquiryCreateInput>>,
) {
  const qc = useQueryClient();
  return useMutation<InquiryRow, ApiError, InquiryCreateInput>({
    mutationFn: (input) =>
      apiFetch<InquiryRow>("/api/bd/inquiries", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.bd.inquiries() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useUpdateInquiry(
  opts?: Partial<UseMutationOptions<InquiryRow, ApiError, { id: string; patch: InquiryUpdateInput }>>,
) {
  const qc = useQueryClient();
  return useMutation<InquiryRow, ApiError, { id: string; patch: InquiryUpdateInput }>({
    mutationFn: ({ id, patch }) =>
      apiFetch<InquiryRow>(`/api/bd/inquiries/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.bd.inquiries() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useConvertInquiry(
  opts?: Partial<UseMutationOptions<unknown, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (id) =>
      apiFetch(`/api/bd/inquiries/${id}/convert`, { method: "POST" }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.bd.inquiries() });
      // Approval row was created — also blast principal namespace if it
      // exists in the cache so the principal approvals view picks up the
      // new pending row when next observed.
      await qc.invalidateQueries({ queryKey: ["principal"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useSupplierMe(
  opts?: Partial<UseQueryOptions<SupplierMe, ApiError>>,
) {
  return useQuery<SupplierMe, ApiError>({
    queryKey: qk.supplier.me(),
    queryFn: () => apiFetch<SupplierMe>("/api/supplier/me"),
    staleTime: 5 * 60_000,
    ...opts,
  });
}

export function useSupplierActivity(
  limit?: number,
  opts?: Partial<UseQueryOptions<SupplierActivityRow[], ApiError>>,
) {
  return useQuery<SupplierActivityRow[], ApiError>({
    queryKey: qk.supplier.activity(limit),
    queryFn: () => {
      const path = limit
        ? `/api/supplier/activity?limit=${encodeURIComponent(limit)}`
        : "/api/supplier/activity";
      return apiFetch<SupplierActivityRow[]>(path);
    },
    staleTime: 30_000,
    ...opts,
  });
}

export function useSupplierPos(
  bucket?: SupplierBucket,
  opts?: Partial<UseQueryOptions<SupplierPoRow[], ApiError>>,
) {
  return useQuery<SupplierPoRow[], ApiError>({
    queryKey: qk.supplier.pos(bucket),
    queryFn: () => {
      const path = bucket
        ? `/api/supplier/pos?bucket=${encodeURIComponent(bucket)}`
        : "/api/supplier/pos";
      return apiFetch<SupplierPoRow[]>(path);
    },
    placeholderData: keepPreviousData,
    ...opts,
  });
}

export function useSupplierPo(
  id: string,
  opts?: Partial<UseQueryOptions<SupplierPoRow, ApiError>>,
) {
  return useQuery<SupplierPoRow, ApiError>({
    queryKey: qk.supplier.po(id),
    queryFn: () => apiFetch<SupplierPoRow>(`/api/supplier/pos/${id}`),
    enabled: !!id,
    ...opts,
  });
}

export function useSupplierProducts(
  opts?: Partial<UseQueryOptions<SupplierProductRow[], ApiError>>,
) {
  return useQuery<SupplierProductRow[], ApiError>({
    queryKey: qk.supplier.products(),
    queryFn: () => apiFetch<SupplierProductRow[]>("/api/supplier/products"),
    ...opts,
  });
}

export function useSupplierDemand(
  opts?: Partial<UseQueryOptions<SupplierDemandRow[], ApiError>>,
) {
  return useQuery<SupplierDemandRow[], ApiError>({
    queryKey: qk.supplier.demand(),
    queryFn: () => apiFetch<SupplierDemandRow[]>("/api/supplier/products/demand"),
    ...opts,
  });
}

export function useAcknowledgePo(
  opts?: Partial<UseMutationOptions<unknown, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (poId) =>
      apiFetch(`/api/supplier/pos/${poId}/acknowledge`, { method: "POST" }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["supplier"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useStartProduction(
  opts?: Partial<UseMutationOptions<unknown, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (poId) =>
      apiFetch(`/api/supplier/pos/${poId}/start-production`, { method: "POST" }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["supplier"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useReadyForPickup(
  opts?: Partial<UseMutationOptions<unknown, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (poId) =>
      apiFetch(`/api/supplier/pos/${poId}/ready-for-pickup`, { method: "POST" }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["supplier"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

type MarkDeliveredInput = {
  poId: string;
  doNumber: string;
  doFilePath: string;
  doNote?: string;
};
export function useMarkDelivered(
  opts?: Partial<UseMutationOptions<unknown, ApiError, MarkDeliveredInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, MarkDeliveredInput>({
    mutationFn: ({ poId, doNumber, doFilePath, doNote }) =>
      apiFetch(`/api/supplier/pos/${poId}/mark-delivered`, {
        method: "POST",
        body: JSON.stringify({ doNumber, doFilePath, doNote }),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["supplier"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

// ---------------------------------------------------------------------------
// 0074 catalog admin mutations (Loo 2026-05-09 Q2=c). Each mutation
// invalidates qk.catalog() so the public bundle picks up the change on the
// next consumer mount (Create-PO modal, dealer wizard, etc.).
// ---------------------------------------------------------------------------

function catalogJson(method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  return {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

export function useCreateCatalogModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductModelCreateInput) =>
      apiFetch<{ model: ProductModelDto }>("/api/catalog/models", catalogJson("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function usePatchCatalogModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProductModelPatchInput }) =>
      apiFetch<{ model: ProductModelDto }>(`/api/catalog/models/${id}`, catalogJson("PATCH", patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteCatalogModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/models/${id}`, catalogJson("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useCreateCatalogSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductSkuCreateInput) =>
      apiFetch<{ sku: ProductSkuDto }>("/api/catalog/skus", catalogJson("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function usePatchCatalogSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProductSkuPatchInput }) =>
      apiFetch<{ sku: ProductSkuDto }>(`/api/catalog/skus/${id}`, catalogJson("PATCH", patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteCatalogSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/skus/${id}`, catalogJson("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useCreateSofaFabric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SofaFabricCreateInput) =>
      apiFetch<{ fabric: SofaFabricDto }>("/api/catalog/sofa-fabrics", catalogJson("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function usePatchSofaFabric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SofaFabricPatchInput }) =>
      apiFetch<{ fabric: SofaFabricDto }>(`/api/catalog/sofa-fabrics/${id}`, catalogJson("PATCH", patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteSofaFabric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/sofa-fabrics/${id}`, catalogJson("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}
