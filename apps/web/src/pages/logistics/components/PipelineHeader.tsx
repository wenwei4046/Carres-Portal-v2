import { Link, useLocation } from "react-router-dom";
import type { LogisticsStage } from "./StageChip";

/**
 * 2026-05-10 — Pipeline header for `/logistics/orders[/:stage]`.
 *
 * Top row: title strap + tally + 3 placeholder action buttons (Quick action /
 * Alerts / Help) — placeholders are visible but inert; wiring is V2 work
 * (carry-forward `phase-pipeline-header-actions`). Quick action would surface
 * common shortcuts (e.g. + new order, mass-print POs); Alerts mirrors the
 * dashboard alerts tile; Help opens contextual docs.
 *
 * Chip row: 7 navigation chips (`Overall` + 6 stage chips with numeric
 * prefixes). Active chip = the URL's `:stage` param (or "Overall" when the
 * path is exactly `/logistics/orders`). Each chip is a `<Link>` so right-click
 * → "Open in new tab" Just Works and the URL is shareable.
 *
 * Sub-filter row: `All / Running late / Last 24h` chips + search input.
 * Today only `All` and search are wired (V1 of the redesign per Loo's call):
 *   - `Running late` is purely visual — wiring needs `eta_date < now() AND
 *     logistics_stage NOT IN ('delivered')` filter on the loaded orders, plus
 *     a count-aware label. Tracked as `phase-pipeline-running-late-filter`.
 *   - `Last 24h` would use `updated_at > now() - interval '24h'`. Tracked as
 *     `phase-pipeline-last-24h-filter`.
 * Filter / Export buttons are placeholders for the same V2 sweep.
 */

export type PipelineSubFilter = "all" | "running_late" | "last_24h";

export interface PipelineHeaderProps {
  /**
   * Per-stage counts. The Overall chip displays the sum. The hook caller
   * computes these from the same `useLogisticsOrders` query so chip badges
   * stay in sync with the rendered list.
   */
  stageCounts: Record<LogisticsStage, number>;
  /** Active stage from the URL, or null when on the Overall path. */
  activeStage: LogisticsStage | null;
  /** Sub-filter chip state — controlled by the parent. */
  subFilter: PipelineSubFilter;
  onSubFilterChange: (next: PipelineSubFilter) => void;
  /** Search box value (DL number / customer name / phone). */
  search: string;
  onSearchChange: (next: string) => void;
}

const STAGE_LABELS: ReadonlyArray<{
  /** URL slug — matches the LogisticsStage enum value. */
  slug: LogisticsStage;
  /** Numeric prefix shown before the chip label. */
  num: string;
  /** Short chip label. */
  label: string;
}> = [
  { slug: "placed",                    num: "01", label: "Order received" },
  { slug: "proceed_request",           num: "02", label: "Proceed requested" },
  { slug: "awaiting_logistics_action", num: "03", label: "Awaiting logistics" },
  { slug: "ready_to_dispatch",         num: "04", label: "Ready to dispatch" },
  { slug: "dispatched",                num: "05", label: "Dispatched" },
  { slug: "delivered",                 num: "06", label: "Delivered" },
];

export const PIPELINE_STAGE_LABELS = STAGE_LABELS;

function ChipLink({
  to,
  active,
  children,
  testid,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <Link
      to={to}
      data-testid={testid}
      role="tab"
      aria-selected={active}
      className={
        "px-3.5 py-1.5 rounded-full text-[12px] font-body transition-colors border " +
        (active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-base-700 border-base-200 hover:border-base-300")
      }
    >
      {children}
    </Link>
  );
}

function SubFilterChip({
  active,
  label,
  onClick,
  testid,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  testid?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      aria-pressed={active}
      className={
        "px-3 py-1 rounded-full text-[12px] font-body transition-colors border " +
        (active
          ? "bg-base-900 text-white border-base-900"
          : "bg-card text-base-700 border-base-200 hover:border-base-300")
      }
    >
      {label}
    </button>
  );
}

export default function PipelineHeader({
  stageCounts,
  activeStage,
  subFilter,
  onSubFilterChange,
  search,
  onSearchChange,
}: PipelineHeaderProps) {
  const location = useLocation();
  const totalIncoming =
    stageCounts.placed +
    stageCounts.proceed_request +
    stageCounts.awaiting_logistics_action +
    stageCounts.ready_to_dispatch +
    stageCounts.dispatched +
    stageCounts.delivered;
  const receivedCount = stageCounts.placed;
  const deliveredCount = stageCounts.delivered;

  return (
    <div data-testid="pipeline-header">
      {/* Title strap + right-side action buttons (V2 placeholders). */}
      <div className="flex justify-between items-start mb-[18px] gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[28px] leading-[1.1] tracking-[-0.025em] font-bold text-base-900">
            Orders
          </h1>
          <div className="font-body text-[12px] text-base-600 mt-1">
            {String(receivedCount).padStart(2, "0")} received → {String(deliveredCount).padStart(2, "0")} delivered
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Order ID, customer, SKU…"
            aria-label="Search by order ID, customer, or SKU"
            className="px-3.5 py-2 border border-base-200 rounded-full text-[13px] min-w-[260px] outline-none focus:border-base-500 bg-card"
          />
          {/* V2 placeholders — visible but inert. See top docstring. */}
          <button
            type="button"
            disabled
            data-testid="pipeline-quick-action"
            title="Quick action — coming soon"
            className="px-3 py-2 rounded-full text-[12px] border border-base-200 bg-card text-base-700 opacity-60 cursor-not-allowed"
          >
            + Quick action
          </button>
          <button
            type="button"
            disabled
            data-testid="pipeline-alerts"
            title="Alerts — coming soon"
            className="px-3 py-2 rounded-full text-[12px] border border-base-200 bg-card text-base-700 opacity-60 cursor-not-allowed"
          >
            ⌥ Alerts
          </button>
          <button
            type="button"
            disabled
            data-testid="pipeline-help"
            title="Help — coming soon"
            className="px-3 py-2 rounded-full text-[12px] border border-base-200 bg-card text-base-700 opacity-60 cursor-not-allowed"
          >
            ? Help
          </button>
        </div>
      </div>

      {/* Top stage chips — Overall + 6 stages, numbered. */}
      <div
        className="flex gap-1.5 mb-3 flex-wrap"
        role="tablist"
        aria-label="Pipeline stages"
      >
        <ChipLink
          to="/logistics/orders"
          active={activeStage === null}
          testid="pipeline-chip-overall"
        >
          ▦ Overall <span className="ml-1.5 inline-block min-w-[18px] text-center text-[11px] tabular-nums opacity-80">{totalIncoming}</span>
        </ChipLink>
        {STAGE_LABELS.map((s) => (
          <ChipLink
            key={s.slug}
            to={`/logistics/orders/${s.slug}`}
            active={activeStage === s.slug}
            testid={`pipeline-chip-${s.slug}`}
          >
            <span className="font-mono text-[11px] mr-1 opacity-80">{s.num}</span>
            {s.label}
            <span className="ml-1.5 inline-block min-w-[18px] text-center text-[11px] tabular-nums opacity-80">
              {stageCounts[s.slug]}
            </span>
          </ChipLink>
        ))}
      </div>

      {/* Sub-filter row + (placeholder) Filter / Export buttons. */}
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap" data-pipeline-subfilters="">
        <div className="flex gap-1.5 flex-wrap items-center">
          <SubFilterChip
            active={subFilter === "all"}
            label="All"
            onClick={() => onSubFilterChange("all")}
            testid="pipeline-subfilter-all"
          />
          <SubFilterChip
            active={subFilter === "running_late"}
            label="Running late"
            onClick={() => onSubFilterChange("running_late")}
            testid="pipeline-subfilter-running-late"
          />
          <SubFilterChip
            active={subFilter === "last_24h"}
            label="Last 24h"
            onClick={() => onSubFilterChange("last_24h")}
            testid="pipeline-subfilter-last-24h"
          />
        </div>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            disabled
            data-testid="pipeline-filter-button"
            title="Multi-criteria filter — coming soon"
            className="px-3 py-1.5 rounded-full text-[12px] border border-base-200 bg-card text-base-700 opacity-60 cursor-not-allowed"
          >
            ▽ Filter
          </button>
          <button
            type="button"
            disabled
            data-testid="pipeline-export-button"
            title="Export CSV — coming soon"
            className="px-3 py-1.5 rounded-full text-[12px] border border-base-200 bg-card text-base-700 opacity-60 cursor-not-allowed"
          >
            ⤓ Export
          </button>
        </div>
      </div>
      {/* Used by tests to assert the URL was respected by the parent route. */}
      <span data-testid="pipeline-current-path" className="sr-only">
        {location.pathname}
      </span>
    </div>
  );
}
