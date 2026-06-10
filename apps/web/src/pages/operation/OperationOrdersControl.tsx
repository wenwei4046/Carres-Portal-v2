import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  useOperationOrders,
  useDeliveryPartners,
  type operationOrderListRow,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { cjkClassName } from "@/lib/cjk";
import { areaForAddress } from "@/lib/region";
import OrderDetailDrawer from "./components/OrderDetailDrawer";
import type { OperationStage } from "./components/StageChip";

/**
 * OperationOrdersControl — the unified Orders **control table** (Jess redesign
 * step 2, 2026-06-08, `docs/operation-portal-redesign.md` §1).
 *
 * Merges the three legacy Orders surfaces — the 6-column kanban
 * (OperationOrders), the AutoCount triage Inbox (OperationInbox), and the flat
 * read-only feed (OperationAllOrders) — into ONE daily-driver table. Every
 * order lands here; a click opens the existing full-control OrderDetailDrawer.
 *
 * Status tabs map the Master Sheet's `Logistic Remark` flow onto the live
 * pipeline (Placed → Proceed → Pending → Scheduled → Completed → All):
 *
 *   Placed    — genuinely new, not yet triaged (native/salesperson)
 *   Proceed   — being arranged. INCLUDES AutoCount-imported orders per the
 *               agreed entry rule (AutoCount import → Proceed; future
 *               salesperson → Placed) + proceed_request stage.
 *   Pending   — awaiting_operation_action (PO open, waiting on stock)
 *   Scheduled — ready_to_dispatch + dispatched (LP assigned / en route)
 *   Completed — delivered
 *   All       — see-everything
 *
 * Reuses the kanban driver `/api/operation/orders` (via useOperationOrders) as
 * the single source of truth for stage derivation — the control table is the
 * kanban-as-table, so stage logic stays in one place (`stageOf`, mirrored from
 * OperationOrders). The endpoint was extended 2026-06-08 with the flat columns
 * this table needs (customer_phone, source_*, ops_assigned_logistic, lines).
 *
 * Cancelled orders are excluded server-side (the driver filters
 * status IN place/proceed_order/delivered), so "All" = every live order. That
 * matches current intent; surface cancelled later if Jess asks.
 */

type ControlTab =
  | "placed"
  | "proceed"
  | "pending"
  | "scheduled"
  | "completed"
  | "all";

const TABS: { key: ControlTab; label: string }[] = [
  { key: "placed", label: "Placed" },
  { key: "proceed", label: "Proceed" },
  { key: "pending", label: "Pending" },
  { key: "scheduled", label: "Scheduled" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
];

type SettledTab = Exclude<ControlTab, "all">;

const TAB_CHIP: Record<SettledTab, { text: string; border: string }> = {
  placed: { text: "text-base-500", border: "border-base-300" },
  proceed: { text: "text-info", border: "border-info" },
  pending: { text: "text-warning", border: "border-warning" },
  scheduled: { text: "text-primary", border: "border-primary" },
  completed: { text: "text-success", border: "border-success" },
};

const TAB_LABEL: Record<SettledTab, string> = {
  placed: "Placed",
  proceed: "Proceed",
  pending: "Pending",
  scheduled: "Scheduled",
  completed: "Completed",
};

/** Stage derivation — mirrors OperationOrders.stageOf so the two surfaces never
 *  disagree on where an order sits in the pipeline. */
function stageOf(o: operationOrderListRow): OperationStage {
  if (o.status === "place") return "placed";
  if (o.operation_stage) return o.operation_stage as OperationStage;
  if (o.status === "delivered") return "delivered";
  return "awaiting_operation_action";
}

/** Which control tab an order belongs to. */
function controlTabOf(o: operationOrderListRow): SettledTab {
  const s = stageOf(o);
  if (s === "delivered") return "completed";
  if (s === "dispatched" || s === "ready_to_dispatch") return "scheduled";
  if (s === "awaiting_operation_action") return "pending";
  if (s === "proceed_request") return "proceed";
  // s === "placed": entry rule splits by source.
  return o.source_system === "autocount" ? "proceed" : "placed";
}

/** Stock cell — derived from stage, NOT a live stock recount. ready_to_dispatch+
 *  means stock was already secured/reserved; awaiting means a confirmed
 *  shortage; earlier stages haven't been checked. Deriving from stage (rather
 *  than matching order_lines.sku against stock_balances) sidesteps the
 *  AutoCount free-text-SKU mismatch that would otherwise cry "short" on every
 *  imported order. */
function stockReadiness(o: operationOrderListRow): "ready" | "short" | "unknown" {
  const s = stageOf(o);
  if (s === "ready_to_dispatch" || s === "dispatched" || s === "delivered")
    return "ready";
  if (s === "awaiting_operation_action") return "short";
  return "unknown";
}

/** Countdown from today to a YYYY-MM-DD delivery date → short label + tone.
 *  <7 days carries the ⚠ (Jess's "Before 7 Days" prep flag). */
function dueDays(
  dateStr: string | null | undefined,
): { label: string; tone: string } | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { label: `overdue ${-diff}d`, tone: "text-destructive" };
  if (diff === 0) return { label: "today", tone: "text-warning" };
  if (diff < 7) return { label: `${diff}d ⚠`, tone: "text-warning" };
  return { label: `in ${diff}d`, tone: "text-base-500" };
}

/** Old kanban stage slug (still produced by hand-typed `/operation/orders/:stage`
 *  URLs) → control tab, so legacy deep-links land somewhere sensible. */
function tabFromStageParam(raw: string | undefined): ControlTab | null {
  switch (raw) {
    case "placed":
      return "placed";
    case "proceed_request":
      return "proceed";
    case "awaiting_operation_action":
      return "pending";
    case "ready_to_dispatch":
    case "dispatched":
      return "scheduled";
    case "delivered":
      return "completed";
    case "all":
      return "all";
    default:
      return null;
  }
}

interface Props {
  /** Header "+ Import from AutoCount" button → OperationApp flips to the import
   *  tab. Optional so the page renders standalone (e.g. in tests). */
  onImport?: () => void;
}

export default function OperationOrdersControl({ onImport }: Props) {
  const params = useParams<{ stage?: string }>();
  const [tab, setTab] = useState<ControlTab>(
    () => tabFromStageParam(params.stage) ?? "all",
  );
  const [search, setSearch] = useState("");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  // Server applies the search; we always fetch the full list and bucket
  // client-side so every tab shows its true count.
  const { data, isLoading, isError, error, refetch } = useOperationOrders({
    search: search.trim() || undefined,
  });
  const partnersQ = useDeliveryPartners();

  const partnerName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of partnersQ.data?.partners ?? []) m.set(p.id, p.name);
    return m;
  }, [partnersQ.data]);

  const orders = useMemo(() => data?.orders ?? [], [data]);

  const counts = useMemo(() => {
    const c: Record<ControlTab, number> = {
      placed: 0,
      proceed: 0,
      pending: 0,
      scheduled: 0,
      completed: 0,
      all: orders.length,
    };
    for (const o of orders) c[controlTabOf(o)] += 1;
    return c;
  }, [orders]);

  const visible = useMemo(() => {
    if (tab === "all") return orders;
    return orders.filter((o) => controlTabOf(o) === tab);
  }, [orders, tab]);

  if (isLoading) {
    return (
      <div className="px-9 py-8 pb-14">
        <TableSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-9 py-8 pb-14">
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

  return (
    <div className="px-9 py-8 pb-14" data-testid="operation-orders-control">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-[18px] flex-wrap">
        <div>
          <div className="kicker">HQ · Operations</div>
          <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-semibold">
            Orders
          </h1>
          <div className="text-[13px] text-base-600 mt-1.5">
            {orders.length} order{orders.length !== 1 ? "s" : ""} · click a row
            for full control
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SO number or customer…"
            className="w-[230px] px-3 py-2 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700"
          />
          {onImport && (
            <button
              type="button"
              onClick={onImport}
              className="btn-primary text-[12px] whitespace-nowrap"
            >
              + Import from AutoCount
            </button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div
        className="flex gap-1 p-1 bg-base-100 rounded mb-3.5 w-fit max-w-full overflow-auto"
        role="tablist"
        aria-label="Order status"
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-[12px] rounded cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                active
                  ? "bg-white text-base-900 font-semibold shadow-sm"
                  : "text-base-600 font-medium hover:text-base-900"
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-px rounded-full ${
                  active ? "bg-base-100 text-base-700" : "bg-base-200 text-base-500"
                }`}
              >
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white border border-base-200 rounded overflow-auto">
        <table
          className="w-full border-collapse text-[13px]"
          style={{ minWidth: 960 }}
        >
          <thead>
            <tr className="bg-base-50 border-b border-base-200">
              <Th>Ref</Th>
              <Th>Customer</Th>
              <Th>Items</Th>
              <Th>Due</Th>
              <Th>Area</Th>
              <Th>Stock</Th>
              <Th>Logistic</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="p-12 text-center text-[12px] text-base-500"
                >
                  No orders in this tab.
                </td>
              </tr>
            )}
            {visible.map((o) => (
              <OrderRow
                key={o.id}
                o={o}
                partnerName={partnerName}
                onOpen={() => setOpenOrderId(o.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {openOrderId && (
        <OrderDetailDrawer
          orderId={openOrderId}
          onClose={() => setOpenOrderId(null)}
        />
      )}
    </div>
  );
}

function OrderRow({
  o,
  partnerName,
  onOpen,
}: {
  o: operationOrderListRow;
  partnerName: Map<string, string>;
  onOpen: () => void;
}) {
  const ct = controlTabOf(o);
  const ref = (o.source_ref ?? []).filter(Boolean);
  const lines = o.order_lines ?? [];
  const qtyTotal = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const stock = stockReadiness(o);
  const area = areaForAddress(o.customer_address ?? null);

  // Logistic: prefer the formal LP (joined name), fall back to the Inbox-triage
  // assignment resolved via the partners map.
  const logistic =
    o.delivery_partners?.name ??
    (o.ops_assigned_logistic
      ? partnerName.get(o.ops_assigned_logistic) ?? "…"
      : null);

  return (
    <tr
      onClick={onOpen}
      className="border-t border-base-100 hover:bg-base-50 cursor-pointer align-top"
      data-testid="order-row"
    >
      {/* Ref */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="font-mono font-semibold text-base-900">SO-{o.so}</div>
        {ref.length > 0 && (
          <div className="font-mono text-[10.5px] text-base-500 mt-0.5">
            {ref.join(" + ")}
          </div>
        )}
      </td>
      {/* Customer */}
      <td className="px-4 py-3">
        <div
          className={`${cjkClassName(o.customer_name)} font-medium text-base-900`}
        >
          {o.customer_name || "—"}
        </div>
        {o.customer_phone && (
          <div className="text-[11px] text-base-500 mt-0.5">
            {o.customer_phone}
          </div>
        )}
      </td>
      {/* Items */}
      <td className="px-4 py-3">
        <div className="text-base-800">
          {qtyTotal} unit{qtyTotal === 1 ? "" : "s"}
        </div>
        {lines.length > 0 && (
          <div className="text-[10.5px] text-base-500 mt-0.5 font-mono leading-snug max-w-[220px] truncate">
            {lines
              .slice(0, 2)
              .map((l) => `${shortSku(l.sku)}×${l.qty}`)
              .join(" · ")}
            {lines.length > 2 ? ` +${lines.length - 2}` : ""}
          </div>
        )}
      </td>
      {/* Due date + countdown */}
      <td className="px-4 py-3 whitespace-nowrap text-base-700">
        {o.delivery_date_tbd ? (
          <span className="text-warning text-[12px]">TBD</span>
        ) : o.delivery_date ? (
          (() => {
            const dd = dueDays(o.delivery_date);
            return (
              <div>
                <div>{fmtDate(o.delivery_date)}</div>
                {dd && (
                  <div className={`text-[10.5px] font-semibold ${dd.tone}`}>
                    {dd.label}
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <span className="text-base-400">—</span>
        )}
      </td>
      {/* Area — KV / Outstation derived from customer_address (region.ts) */}
      <td className="px-4 py-3 whitespace-nowrap">
        {area === "Unknown" ? (
          <span className="text-base-400">—</span>
        ) : (
          <span
            className={`text-[11px] font-medium ${
              area === "KV" ? "text-success" : "text-warning"
            }`}
          >
            {area}
          </span>
        )}
      </td>
      {/* Stock */}
      <td className="px-4 py-3 whitespace-nowrap">
        <StockCell state={stock} />
      </td>
      {/* Logistic */}
      <td className="px-4 py-3 whitespace-nowrap">
        {logistic ? (
          <span className="text-[12px] font-medium text-base-800">
            {logistic}
          </span>
        ) : (
          <span className="text-base-400">—</span>
        )}
      </td>
      {/* Status */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span
          className={`inline-block text-[9px] font-bold uppercase tracking-[0.12em] py-[3px] px-[7px] border rounded-[3px] ${TAB_CHIP[ct].text} ${TAB_CHIP[ct].border}`}
        >
          {TAB_LABEL[ct]}
        </span>
      </td>
    </tr>
  );
}

function StockCell({ state }: { state: "ready" | "short" | "unknown" }) {
  if (state === "ready")
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-success">
        <span className="w-[7px] h-[7px] rounded-full bg-success" />Ready
      </span>
    );
  if (state === "short")
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-warning">
        <span className="w-[7px] h-[7px] rounded-full bg-warning" />Short
      </span>
    );
  return <span className="text-base-400">—</span>;
}

/** Trim a long/free-text SKU to a compact token for the items sub-line. */
function shortSku(sku: string): string {
  const s = sku.includes(":") ? sku.split(":").slice(1).join(":") : sku;
  return s.length > 14 ? s.slice(0, 13) + "…" : s;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-base-500 text-left">
      {children}
    </th>
  );
}

function TableSkeleton() {
  return (
    <div data-testid="operation-orders-control-skeleton">
      <div className="h-9 w-1/3 bg-base-100 rounded animate-pulse mb-6" />
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-7 w-20 bg-base-100 rounded animate-pulse" />
        ))}
      </div>
      <div className="bg-white border border-base-200 rounded">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-14 border-b border-base-100 animate-pulse bg-base-50/40"
          />
        ))}
      </div>
    </div>
  );
}
