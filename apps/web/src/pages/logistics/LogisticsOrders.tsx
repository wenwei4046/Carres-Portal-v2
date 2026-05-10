import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  useLogisticsOrders,
  type LogisticsOrderListRow,
} from "@/lib/queries";
import CreatePOModal, {
  type CreatePoPrefill,
} from "./components/CreatePOModal";
import OrderColumn from "./components/OrderColumn";
import OrderCard from "./components/OrderCard";
import OrderDetailDrawer from "./components/OrderDetailDrawer";
import CrossOrderBundleSheet from "./components/CrossOrderBundleSheet";
import ResumeFromWaitingDialog from "./components/ResumeFromWaitingDialog";
import PipelineHeader, {
  PIPELINE_STAGE_LABELS,
  type PipelineSubFilter,
} from "./components/PipelineHeader";
import StageBanner, { STAGE_DESCRIPTIONS } from "./components/StageBanner";
import type { LogisticsStage } from "./components/StageChip";

/**
 * LogisticsOrders — pipeline shell for `/logistics/orders[/:stage]`.
 *
 * Two layouts share this component, picked from the URL via `useParams`:
 *
 *  - **Overall** (URL `/logistics/orders`, no `:stage` param) — 6-column
 *    Pipeline v2 kanban. Click-to-expand columns are preserved (Phase 4
 *    C3.2: focused column gets `flex:4`, siblings shrink to `flex:0.4`).
 *    Cross-order bundle bar surfaces when ≥1 awaiting_logistics_action
 *    order is selected.
 *
 *  - **Single-stage** (URL `/logistics/orders/:stage`) — banner + full-width
 *    `OrderCard` list for the picked stage. Empty-state when count is zero.
 *    Stage-specific bundle bar still surfaces on the awaiting page.
 *
 * Pipeline v2 LOGISTICS_FLOW (mirrors proto + C1 enum extension):
 *   placed                       → "Awaiting request"        · action null
 *   proceed_request              → "Awaiting your decision"  · action "Confirm"
 *   awaiting_logistics_action    → "PO open with supplier"   · action "Check stock"
 *   ready_to_dispatch            → "Stock secured"           · action "Assign delivery"
 *   dispatched                   → "With delivery partner"   · action "Attach DO"
 *   delivered                    → "DO on file"              · action null
 *
 * 2026-05-10 redesign carry-forwards (Loo's call to ship V1 thin):
 *   - phase-pipeline-running-late-filter — sub-filter chip is visible but
 *     inert; needs `eta_date < now() AND stage != 'delivered'` filter.
 *   - phase-pipeline-last-24h-filter — same; needs `updated_at` window.
 *   - phase-pipeline-quick-action / -alerts / -help — header buttons inert.
 *   - phase-pipeline-multi-criteria-filter / -export — buttons inert.
 *   - phase-pipeline-resume-mode-restore — the prior "At Warehouse Waiting"
 *     filter chip + ResumeFromWaitingDialog routing was dropped from the
 *     header for layout simplicity. The dialog still mounts when something
 *     calls `setResumeFor(dl)`, but no UI surfaces it today. Re-add as a
 *     ready_to_dispatch detail-drawer action when Loo needs it back.
 */
const LOGISTICS_FLOW: ReadonlyArray<{
  key: LogisticsStage;
  label: string;
  hint: string;
  action: string | null;
}> = [
  { key: "placed",            label: "Placed",            hint: "Awaiting request",        action: null },
  { key: "proceed_request",   label: "Proceed Request",   hint: "Awaiting your decision",  action: "Confirm" },
  { key: "awaiting_logistics_action", label: "Awaiting Logistics Action", hint: "PO open with supplier", action: "Check stock" },
  { key: "ready_to_dispatch", label: "Ready to Dispatch", hint: "Stock secured",           action: "Assign delivery" },
  { key: "dispatched",        label: "Dispatched",        hint: "With delivery partner",   action: "Attach DO" },
  { key: "delivered",         label: "Delivered",         hint: "DO on file",              action: null },
];

const ALL_STAGE_KEYS = new Set<LogisticsStage>(LOGISTICS_FLOW.map((s) => s.key));

function parseStageParam(raw: string | undefined): LogisticsStage | null {
  if (!raw) return null;
  return ALL_STAGE_KEYS.has(raw as LogisticsStage)
    ? (raw as LogisticsStage)
    : null;
}

export default function LogisticsOrders() {
  // The route is mounted at both `/logistics/orders` and
  // `/logistics/orders/:stage` — undefined `stage` means the Overall layout.
  // Invalid `:stage` values fall back to Overall too (parseStageParam guard);
  // a noisier 404 isn't worth it because the chip nav above never produces
  // an invalid slug — the only way to land here is a hand-edited URL.
  const params = useParams<{ stage?: string }>();
  const activeStage = parseStageParam(params.stage);

  const [search, setSearch] = useState("");
  const [subFilter, setSubFilter] = useState<PipelineSubFilter>("all");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [selectedDls, setSelectedDls] = useState<Set<number>>(() => new Set());
  const [bundlePrefill, setBundlePrefill] = useState<CreatePoPrefill | null>(
    null,
  );
  // Pipeline v2 (C3) expand-to-zoom — Overall view only.
  const [expandedStage, setExpandedStage] = useState<LogisticsStage | null>(null);
  // Resume from waiting (Phase 4.5a Task 36) — dialog only; no header chip in
  // V1 of the redesign. See top docstring carry-forward note.
  const [resumeFor, setResumeFor] = useState<number | null>(null);

  // Server applies search; we always fetch the full list and bucket
  // client-side so chip badges show every stage's count even when the active
  // page narrows the visible orders.
  const { data, isLoading, isError, error, refetch } = useLogisticsOrders({
    search: search.trim() || undefined,
  });

  const allOrders = useMemo(() => data?.orders ?? [], [data]);

  // Bucket orders by stage. Pipeline v2 (C1) widens the enum:
  //   - status='place'     → placed (regardless of logistics_stage; the order
  //                          hasn't been pushed to logistics yet)
  //   - logistics_stage    → use it directly when set
  //   - else status='delivered' → delivered (legacy seed safety net)
  //   - else                → awaiting_logistics_action (legacy proceed_order
  //                          rows without a logistics_stage value still exist
  //                          in older seed data; default them to the work
  //                          bucket)
  const stageOf = (o: LogisticsOrderListRow): LogisticsStage => {
    if (o.status === "place") return "placed";
    if (o.logistics_stage) return o.logistics_stage as LogisticsStage;
    if (o.status === "delivered") return "delivered";
    return "awaiting_logistics_action";
  };

  const stageCounts = useMemo(() => {
    const counts: Record<LogisticsStage, number> = {
      placed: 0,
      proceed_request: 0,
      awaiting_logistics_action: 0,
      ready_to_dispatch: 0,
      dispatched: 0,
      delivered: 0,
    };
    for (const o of allOrders) counts[stageOf(o)] += 1;
    return counts;
  }, [allOrders]);

  const ordersByStage = useMemo(() => {
    const buckets: Record<LogisticsStage, LogisticsOrderListRow[]> = {
      placed: [],
      proceed_request: [],
      awaiting_logistics_action: [],
      ready_to_dispatch: [],
      dispatched: [],
      delivered: [],
    };
    for (const o of allOrders) buckets[stageOf(o)].push(o);
    return buckets;
  }, [allOrders]);

  const toggleSelect = (dl: number) => {
    setSelectedDls((prev) => {
      const next = new Set(prev);
      if (next.has(dl)) next.delete(dl);
      else next.add(dl);
      return next;
    });
  };
  const clearSelected = () => setSelectedDls(new Set());

  // Bundle eligibility — only awaiting_logistics_action orders can be bundled
  // into a single PO. We restrict the selectable IDs server-side via the
  // bundle CTA, so a stale selection from another stage never reaches the
  // server (defence-in-depth on top of the OrderCard's `selectable` gate).
  const selectedOrderIds = useMemo(() => {
    return allOrders
      .filter(
        (o) => selectedDls.has(o.dl) && stageOf(o) === "awaiting_logistics_action",
      )
      .map((o) => o.id);
  }, [allOrders, selectedDls]);

  function selectAllInColumn(stageKey: LogisticsStage) {
    if (stageKey !== "awaiting_logistics_action") return;
    const stageOrders = ordersByStage.awaiting_logistics_action;
    const stageDls = stageOrders.map((o) => o.dl);
    const allSelected = stageDls.every((dl) => selectedDls.has(dl));
    setSelectedDls((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const dl of stageDls) next.delete(dl);
      } else {
        for (const dl of stageDls) next.add(dl);
      }
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="px-9 py-7 pb-14">
        <KanbanSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-9 py-7 pb-14">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load orders
          </div>
          <div className="text-[12px] text-base-700 mb-3">
            {(error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="btn-secondary text-[11px] py-1.5 px-3"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Per-stage labels needed by StageBanner (numeric prefix + short label).
  const stageMeta = activeStage
    ? PIPELINE_STAGE_LABELS.find((s) => s.slug === activeStage) ?? null
    : null;

  // Bundle bar visible on Overall (any selected) + Awaiting stage page.
  const bundleBarApplies =
    activeStage === null || activeStage === "awaiting_logistics_action";

  return (
    <div className="px-9 py-7" data-testid="logistics-orders">
      <PipelineHeader
        stageCounts={stageCounts}
        activeStage={activeStage}
        subFilter={subFilter}
        onSubFilterChange={setSubFilter}
        search={search}
        onSearchChange={setSearch}
      />

      {/* Bulk-select action bar — same wiring as before, just rendered
          conditionally on stage so non-awaiting pages don't surface a stale
          bundle CTA when a selection from another tab persists. */}
      {bundleBarApplies && selectedOrderIds.length > 0 && (
        <CrossOrderBundleSheet
          selectedOrderIds={selectedOrderIds}
          onClear={clearSelected}
          onBundleClick={(orderIds) => {
            const dls = allOrders
              .filter((o) => orderIds.includes(o.id))
              .map((o) => o.dl);
            setBundlePrefill({
              dlRefs: dls,
              note: `Bundle from ${dls.length} orders: ${dls.map((d) => `#${d}`).join(", ")}`,
            });
          }}
        />
      )}

      {activeStage === null ? (
        /* Overall — 6-col kanban (preserved from C3.2). */
        <div
          className="flex gap-3 items-stretch"
          data-testid="overall-kanban"
        >
          {LOGISTICS_FLOW.map((s) => (
            <OrderColumn
              key={s.key}
              stage={s.key}
              label={s.label}
              hint={s.hint}
              bucketAction={s.action}
              orders={ordersByStage[s.key]}
              selectedDls={selectedDls}
              onToggleSelect={toggleSelect}
              onOpenOrder={(id) => setOpenOrderId(id)}
              onSelectAll={() => selectAllInColumn(s.key)}
              expanded={expandedStage === s.key}
              anyExpanded={expandedStage !== null}
              onToggleExpand={() =>
                setExpandedStage((prev) => (prev === s.key ? null : s.key))
              }
            />
          ))}
        </div>
      ) : (
        /* Single-stage page — banner + full-width card list. */
        <div data-testid={`stage-page-${activeStage}`}>
          {stageMeta && (
            <StageBanner
              stage={activeStage}
              num={stageMeta.num}
              label={stageMeta.label}
              description={STAGE_DESCRIPTIONS[activeStage]}
              count={ordersByStage[activeStage].length}
            />
          )}
          {ordersByStage[activeStage].length === 0 ? (
            <div
              data-testid="stage-empty-state"
              className="rounded-[6px] border border-dashed border-base-200 bg-card py-16 text-center"
            >
              <div className="text-[12px] text-base-500 font-body uppercase tracking-[0.14em] mb-2">
                Empty stage
              </div>
              <div className="text-[14px] text-base-700 font-body">
                No orders in this stage
              </div>
            </div>
          ) : (
            <div
              className="flex flex-col gap-2"
              data-testid={`stage-list-${activeStage}`}
            >
              {ordersByStage[activeStage].map((o) => {
                const action = LOGISTICS_FLOW.find(
                  (s) => s.key === activeStage,
                )?.action;
                return (
                  <OrderCard
                    key={o.id}
                    order={o}
                    selectable={activeStage === "awaiting_logistics_action"}
                    selected={selectedDls.has(o.dl)}
                    onToggleSelect={() => toggleSelect(o.dl)}
                    onOpen={() => setOpenOrderId(o.id)}
                    actionHint={action ? `${action} →` : undefined}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {openOrderId && (
        <OrderDetailDrawer
          orderId={openOrderId}
          onClose={() => setOpenOrderId(null)}
        />
      )}
      {bundlePrefill && (
        <CreatePOModal
          prefill={bundlePrefill}
          onClose={() => {
            setBundlePrefill(null);
            clearSelected();
          }}
        />
      )}
      {resumeFor !== null && (
        <ResumeFromWaitingDialog
          dl={resumeFor}
          onClose={() => setResumeFor(null)}
        />
      )}
    </div>
  );
}

function KanbanSkeleton() {
  return (
    <div data-testid="logistics-orders-skeleton">
      <div className="h-12 w-1/3 bg-base-100 rounded animate-pulse mb-6" />
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-7 w-24 bg-base-100 rounded animate-pulse" />
        ))}
      </div>
      <div className="flex gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-white border border-base-200 rounded-[4px] min-h-[360px] p-3"
          >
            <div className="h-4 w-1/2 bg-base-100 rounded animate-pulse mb-3" />
            {Array.from({ length: 3 }).map((__, j) => (
              <div
                key={j}
                className="h-16 bg-base-50 border border-base-100 rounded-[4px] mb-1.5 animate-pulse"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
