import { type ReactNode, useEffect, useState } from "react";
import {
  AlertCircle,
  Banknote,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  MoreVertical,
  Package,
  Pencil,
  RotateCcw,
  StickyNote,
  Truck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { STOCK_LOCATIONS, updateOrderInputSchema } from "@carres/shared";
import { apiFetch, ApiError } from "@/lib/api";
import { renderDoPdf } from "@/lib/pdf/render";
import type { DoTemplateData } from "@/lib/pdf/types";
import {
  qk,
  useOperationOrder,
  useRecheckStockMutation,
  useUpdateOrder,
  type operationOrderDetailLine,
  type operationOrderDetailPo,
  type operationOrderDetailStockBalance,
} from "@/lib/queries";
import { cjkClassName } from "@/lib/cjk";
import { fmtDate } from "@/lib/fmt-date";
import { locationForAddress } from "@/lib/region";
import {
  lineCategory,
  lineKind,
  lineSortRank,
  defaultLineLocation,
} from "@/lib/line-category";
import { useAuth } from "@/lib/auth";
import AnnotationTimeline from "./AnnotationTimeline";
import DeliveryChain from "./DeliveryChain";
import FollowUpStar from "./FollowUpStar";
import {
  useOrderControlForm,
  RoutingFields,
  DeliveryTimeSlotField,
  LogisticEtaField,
  PaymentControlFields,
  StorageControlFields,
  RemarkControlField,
  OrderControlSaveBar,
  FieldGrid,
} from "./OrderControlPanel";
import ServiceNoteModal from "./ServiceNoteModal";
import DownloadSalesOrderButton from "@/components/DownloadSalesOrderButton";
import DownloadInvoiceButton from "@/components/DownloadInvoiceButton";
import StageChip, { type OperationStage } from "./StageChip";
import DispatchModal from "./DispatchModal";
import DOAttachModal from "./DOAttachModal";
import AbandonOrderModal from "./AbandonOrderModal";
import ConfirmProceedDialog from "./ConfirmProceedDialog";
import TransferReadyDialog from "./TransferReadyDialog";
import TopUpDepositModal from "@/pages/dealer/order-actions/TopUpDepositModal";

/**
 * OrderDetailDrawer — slide-in panel from the right edge that shows full
 * order detail + 4-stage action bar + line items + linked POs + history.
 *
 * Mirrors `reference/proto/operation-orders.jsx` `OrderDetailDrawer`
 * (lines 261-396):
 *   - Backdrop: rgba(34,31,32,0.55)
 *   - Drawer: 560px wide, full-height, white, rounded-none on left edge
 *   - Header: #SO + StageChip + customer name (CJK detect) + dealer; right
 *     side has Print DO (when delivered) + close
 *   - Action bar: tinted base-50 surface, conditional buttons per stage
 *   - Section: Stock & warehouse (warehouse name + total items + line table)
 *   - Section: Linked purchase orders (only if linkedPOs.length > 0)
 *   - Section: Delivery (phone, date, address, floor, emergency, partner, DO#)
 *   - Section: History
 *   - Footer: Order total
 *
 * The drawer fetches its own detail via `useOperationOrder(orderId)` so the
 * caller only needs to hand us an id.
 */
const RM = (n: number) =>
  `RM ${Math.round(Number(n) || 0).toLocaleString()}`;

interface Props {
  orderId: string;
  onClose: () => void;
}

function totalItems(lines: operationOrderDetailLine[]): number {
  return lines.reduce((s, l) => s + Number(l.qty || 0), 0);
}

function calcShortages(
  lines: operationOrderDetailLine[],
  stockBalances: operationOrderDetailStockBalance[],
): { sku: string; need: number; have: number; short: number }[] {
  const totalsBySku: Record<string, number> = {};
  for (const b of stockBalances) {
    totalsBySku[b.sku] = (totalsBySku[b.sku] ?? 0) + Math.max(0, Number(b.qty) - Number(b.reserved));
  }
  const out: { sku: string; need: number; have: number; short: number }[] = [];
  for (const l of lines) {
    const have = totalsBySku[l.sku] ?? 0;
    if (have < l.qty) out.push({ sku: l.sku, need: l.qty, have, short: l.qty - have });
  }
  return out;
}

export default function OrderDetailDrawer({ orderId, onClose }: Props) {
  const { data, isLoading, isError, error, refetch } = useOperationOrder(orderId);
  const navigate = useNavigate();

  const [showDispatch, setShowDispatch] = useState(false);
  const [showDO, setShowDO] = useState(false);
  const [showAbandon, setShowAbandon] = useState(false);
  const [showConfirmProceed, setShowConfirmProceed] = useState(false);
  const [showTransferReady, setShowTransferReady] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showServiceNote, setShowServiceNote] = useState(false);

  // Esc-to-close listener at the drawer level. Modals install their own Esc
  // handlers; while a modal is open we let it consume the key first by gating
  // ours on the modal-open flags.
  useEffect(() => {
    const anyModalOpen =
      showDispatch ||
      showDO ||
      showAbandon ||
      showConfirmProceed ||
      showTransferReady ||
      showTopUp ||
      showServiceNote;
    if (anyModalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    onClose,
    showDispatch,
    showDO,
    showAbandon,
    showConfirmProceed,
    showTransferReady,
    showTopUp,
    showServiceNote,
  ]);

  // 2026-05-10 (Loo) — "+ Issue POs" jumps to /operation/procurement with a
  // CreatePOModal prefill instead of calling the auto-issue RPC. The auto-
  // issue path crashed when orders.warehouse_id was NULL (auto-skip leaves it
  // empty when buffer stock is insufficient), and Loo's instinct is right:
  // the procurement modal already has a per-supplier warehouse picker + COGS
  // editor + cascade picker, so reusing it is cleaner than building a parallel
  // dialog.
  //
  // Per-(sku, attrs) shortage walk mirrors the server-side
  // /awaiting-stock-shortage aggregation: take order_lines as-is (preserves
  // attrs), subtract available stock pool by sku in declaration order, only
  // include lines where shortage > 0.
  function gotoProcurementWithPrefill() {
    if (!data) return;
    const totalsBySku: Record<string, number> = {};
    for (const b of data.stockBalances) {
      totalsBySku[b.sku] =
        (totalsBySku[b.sku] ?? 0) +
        Math.max(0, Number(b.qty) - Number(b.reserved));
    }
    const remainingBySku = { ...totalsBySku };
    const prefillLines: { sku: string; qty: number; attrs?: Record<string, unknown> | null }[] = [];
    for (const ol of data.lines) {
      const remaining = remainingBySku[ol.sku] ?? 0;
      const consumed = Math.min(remaining, ol.qty);
      remainingBySku[ol.sku] = remaining - consumed;
      if (consumed < ol.qty) {
        prefillLines.push({
          sku: ol.sku,
          qty: ol.qty - consumed,
          attrs: ol.attrs ?? null,
        });
      }
    }
    if (prefillLines.length === 0) {
      toast.info("No shortages — every line is covered by current stock");
      return;
    }
    // Land on the tab matching the first shortage line's category so the
    // modal opens in a context that feels right. The modal itself groups by
    // supplier so multi-category orders still split correctly on submit.
    const firstCat = prefillLines[0]?.sku.split(":")[0] ?? "";
    const slug =
      firstCat === "sofa"
        ? "hookka-sofa"
        : firstCat === "bedframe"
          ? "hookka-bedframe"
          : "nice-future";
    navigate(`/operation/procurement/${slug}`, {
      state: {
        prefill: {
          so: data.order.so,
          lines: prefillLines,
          note: `From order #${data.order.so} · ${prefillLines.length} short line${prefillLines.length === 1 ? "" : "s"}`,
        },
      },
    });
    onClose();
  }

  return (
    <div
      onClick={onClose}
      role="presentation"
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(34,31,32,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Order detail"
        className="bg-card text-card-foreground border border-base-200 rounded-none flex flex-col h-screen"
        style={{ width: 920, maxWidth: "100vw" }}
        data-testid="order-detail-drawer"
      >
        {isLoading && <DrawerSkeleton onClose={onClose} />}
        {!isLoading && isError && (
          <DrawerError
            message={(error as Error | undefined)?.message ?? "Unknown error"}
            onClose={onClose}
            onRetry={() => void refetch()}
          />
        )}
        {!isLoading && !isError && data && (
          <>
            <DrawerBody
              data={data}
              onClose={onClose}
              onDispatchClick={() => setShowDispatch(true)}
              onDOClick={() => setShowDO(true)}
              onIssuePOsClick={gotoProcurementWithPrefill}
              onAbandonClick={() => setShowAbandon(true)}
              onConfirmProceedClick={() => setShowConfirmProceed(true)}
              onTransferReadyClick={() => setShowTransferReady(true)}
              onTopUpClick={() => setShowTopUp(true)}
              onServiceNoteClick={() => setShowServiceNote(true)}
            />
            {showDispatch && (
              <DispatchModal
                order={data.order}
                warehouse={data.warehouse}
                onClose={() => setShowDispatch(false)}
              />
            )}
            {showDO && (
              <DOAttachModal
                order={data.order}
                warehouse={data.warehouse}
                lines={data.lines}
                onClose={() => setShowDO(false)}
              />
            )}
            {showAbandon && (
              <AbandonOrderModal
                order={data.order}
                onClose={() => setShowAbandon(false)}
              />
            )}
            {showConfirmProceed && (
              <ConfirmProceedDialog
                order={data.order}
                lines={data.lines}
                onClose={() => setShowConfirmProceed(false)}
              />
            )}
            {showTransferReady && (
              <TransferReadyDialog
                order={data.order}
                lines={data.lines}
                onClose={() => setShowTransferReady(false)}
              />
            )}
            {showTopUp && (
              <TopUpDepositModal
                order={{
                  id: data.order.id,
                  so: data.order.so,
                  dealerId: data.order.dealer_id,
                  paid: data.order.paid,
                }}
                total={data.total}
                onClose={() => setShowTopUp(false)}
              />
            )}
            {showServiceNote && (
              <ServiceNoteModal
                mode="create"
                prefill={{
                  customerName: data.order.customer_name,
                  customerPhone: data.order.customer_phone,
                  customerAddress: data.order.customer_address,
                  refNo: `SO-${data.order.so}`,
                  orderId: data.order.id,
                }}
                onClose={() => setShowServiceNote(false)}
                onSaved={() => {
                  setShowServiceNote(false);
                  toast.success("Service note created");
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DrawerSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div data-testid="drawer-skeleton">
      <div className="px-7 pt-5 pb-3.5 border-b border-base-100 flex justify-between items-start gap-3.5">
        <div className="min-w-0 flex-1">
          <div className="h-3 w-24 bg-base-100 rounded animate-pulse mb-2" />
          <div className="h-7 w-3/4 bg-base-100 rounded animate-pulse mb-2" />
          <div className="h-3 w-1/2 bg-base-100 rounded animate-pulse" />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="p-1 text-[20px] text-base-700 hover:text-base-900 leading-none"
        >
          ×
        </button>
      </div>
      <div className="p-7 space-y-3">
        <div className="h-4 w-32 bg-base-100 rounded animate-pulse" />
        <div className="h-24 bg-base-100 rounded animate-pulse" />
      </div>
    </div>
  );
}

function DrawerError({
  message,
  onClose,
  onRetry,
}: {
  message: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="p-7" data-testid="drawer-error">
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="p-1 text-[20px] text-base-700 hover:text-base-900 leading-none"
        >
          ×
        </button>
      </div>
      <div className="rounded-[4px] bg-destructive/10 border border-destructive/30 p-4 text-[13px]">
        <div className="text-destructive font-semibold mb-2">
          Couldn&rsquo;t load order
        </div>
        <div className="text-[12px] text-base-700 mb-3">{message}</div>
        <button
          type="button"
          onClick={onRetry}
          className="btn-secondary text-[11px] py-1.5 px-3"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

interface DrawerBodyProps {
  data: NonNullable<ReturnType<typeof useOperationOrder>["data"]>;
  onClose: () => void;
  onServiceNoteClick: () => void;
  onDispatchClick: () => void;
  onDOClick: () => void;
  onIssuePOsClick: () => void;
  onAbandonClick: () => void;
  onConfirmProceedClick: () => void;
  onTransferReadyClick: () => void;
  onTopUpClick: () => void;
}

/** Collapsible drawer section — title + leading icon + a summary value that
 *  shows when collapsed, so a folded section still reads at a glance (P5). */
const SECTION_ACCENT: Record<
  string,
  { bar: string; icon: string; head: string }
> = {
  neutral: { bar: "border-l-base-300", icon: "text-base-400", head: "bg-base-50" },
  warning: { bar: "border-l-warning", icon: "text-warning", head: "bg-warning/10" },
  success: { bar: "border-l-success", icon: "text-success", head: "bg-success/10" },
  info: { bar: "border-l-info", icon: "text-info", head: "bg-info/10" },
};

function DrawerSection({
  icon,
  title,
  titleExtra,
  headerRight,
  summary,
  accent = "neutral",
  defaultOpen = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  /** Rendered right after the title (e.g. the SO number in the Order header). */
  titleExtra?: ReactNode;
  /** Pinned to the header's right edge, ALWAYS visible (e.g. the status chip). */
  headerRight?: ReactNode;
  summary?: ReactNode;
  accent?: keyof typeof SECTION_ACCENT;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const a = SECTION_ACCENT[accent];
  return (
    <div
      className={`border border-base-200 border-l-[3px] ${a.bar} rounded-[4px] bg-white mb-2 overflow-hidden`}
    >
      <div
        className={`w-full flex items-center justify-between gap-3 px-3 py-2 ${a.head}`}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 min-w-0 flex-1 text-left hover:brightness-[0.97]"
        >
          <span className={`${a.icon} shrink-0`}>{icon}</span>
          <span className="t-h4 text-base-900">{title}</span>
          {titleExtra}
        </button>
        <span className="flex items-center gap-2 shrink-0">
          {!open && summary != null && (
            <span className="text-[11px] text-base-500 truncate max-w-[180px]">
              {summary}
            </span>
          )}
          {headerRight}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse section" : "Expand section"}
          >
            <ChevronDown
              className={`w-4 h-4 text-base-400 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </span>
      </div>
      {open && (
        <div className="px-3 pb-2.5 pt-1.5 border-t border-base-100">
          {children}
        </div>
      )}
    </div>
  );
}

function DrawerBody({
  data,
  onClose,
  onDispatchClick,
  onDOClick,
  onIssuePOsClick,
  onAbandonClick,
  onConfirmProceedClick,
  onTransferReadyClick,
  onTopUpClick,
  onServiceNoteClick,
}: DrawerBodyProps) {
  const { order, lines, addons, total, warehouse, stockBalances, pos, threads } = data;
  // Phase 4.5 Chunk 2 (T9) — partner-assignment hint sourced from threads
  // (`order_supplier_threads.delivery_partner_id`) rather than the order-level
  // column, per design spec §CQ1 option (b). True when ANY thread has a
  // customer-leg LP assigned (multi-supplier orders may have N partners; the
  // ActionBar only needs a boolean cue and the user opens the drill-down for
  // detail).
  const anyThreadPartnerAssigned = threads.some(
    (t) => t.delivery_partner_id !== null,
  );
  // Pipeline v2 (C1): widen stage derivation to honor 'place' status + the
  // new placed/confirmed enum values without falling through to a
  // bogus in_production default.
  const stage: OperationStage = (() => {
    if (order.status === "place") return "placed";
    if (order.operation_stage) return order.operation_stage as OperationStage;
    if (order.status === "delivered") return "delivered";
    return "in_production";
  })();
  const shortages = calcShortages(lines, stockBalances);
  // Outstanding = order grand total − paid. AutoCount-imported orders often
  // carry no line prices (total 0) → we can't compute a real balance, so the
  // header pill hides rather than lie. Mirrors OrderControlPanel's PaymentSummary.
  const grandTotal = total + addonsSum(addons);
  const outstanding = Math.max(0, grandTotal - Number(order.paid || 0));
  const hasTotal = grandTotal > 0;
  const loc = locationForAddress(order.customer_address ?? null);

  const form = useOrderControlForm(order.id);
  // Combine duplicate-SKU lines into ONE row (Jess: don't repeat the same item),
  // then list mattress → bedframe → sofa → pillow → M.P → service.
  const orderedLines = Object.values(
    lines.reduce<Record<string, { sku: string; qty: number }>>((acc, l) => {
      const e = acc[l.sku] ?? { sku: l.sku, qty: 0 };
      e.qty += Number(l.qty || 0);
      acc[l.sku] = e;
      return acc;
    }, {}),
  ).sort((a, b) => lineSortRank(a.sku) - lineSortRank(b.sku));
  // Per-item ETA defaults to the linked PO's delivery date (Jess), overridable
  // via line_etas. First PO carrying the SKU wins.
  const poEtaBySku = new Map<string, string>();
  for (const po of pos)
    if (po.eta_date)
      for (const pl of po.lines)
        if (!poEtaBySku.has(pl.sku)) poEtaBySku.set(pl.sku, po.eta_date);
  const hasMsbf = lines.some((l) => {
    const c = lineCategory(l.sku);
    return c === "mattress" || c === "bedframe";
  });
  const hasSof = lines.some((l) => lineCategory(l.sku) === "sofa");
  const deadlineSummary = order.delivery_date_tbd
    ? "TBD"
    : order.delivery_date
      ? fmtDate(order.delivery_date)
      : "no date";
  const paymentSummary = !hasTotal
    ? `${RM(Number(order.paid || 0))} paid`
    : outstanding <= 0
      ? "Settled"
      : `${RM(outstanding)} owing`;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* No separate top bar — the ⋮ actions menu + close moved into the Order
          section header next to the status chip (Jess: save a row). Backdrop
          click still closes the drawer. */}
      {/* Scrolling section stack — 5 sections, one category each (P5). */}
      <div className="flex-1 min-h-0 overflow-auto px-5 py-4 pt-3">
        {/* Needs-action banner — the "action for logistic" note surfaced at the
            top so it can't be missed (Jess). */}
        {form.draft.action_for_logistic.trim() && (
          <div className="mb-2 flex items-start gap-2 rounded-[4px] border border-warning/50 bg-warning/10 px-3 py-2 text-[12px]">
            <AlertCircle
              className="w-4 h-4 shrink-0 mt-0.5 text-warning"
              aria-hidden="true"
            />
            <span className="text-base-900">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-warning">
                Action needed
              </span>
              {form.draft.action_for_logistic}
            </span>
          </div>
        )}
        {/* 1 · Order — SO# + status live in the header (Jess: save a row, more
            obvious); the grid holds customer / phone / address. */}
        <DrawerSection
          icon={<ClipboardList className="w-4 h-4" />}
          title="Order"
          titleExtra={
            <span className="font-mono t-h3 font-bold text-base-900 leading-none">
              #{order.so}
            </span>
          }
          headerRight={
            <span className="flex items-center gap-1">
              <FollowUpStar orderId={order.id} />
              <StageChip stage={stage} />
              <ActionsMenu
                order={order}
                lines={lines}
                stage={stage}
                onServiceNoteClick={onServiceNoteClick}
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close drawer"
                className="p-1 text-[18px] text-base-700 hover:text-base-900 leading-none shrink-0"
              >
                ×
              </button>
            </span>
          }
          accent="neutral"
          summary={order.customer_name}
          defaultOpen
        >
          <OrderCustomerCard order={order} />
        </DrawerSection>

        {/* 2 · Items & stock — full-width, directly after the address (Jess:
            "item listing put after address"). Each line carries its own stock
            location since products can sit in different warehouses. */}
        <DrawerSection
          icon={<Package className="w-4 h-4" />}
          title="Items & stock"
          accent="warning"
          summary={`${totalItems(lines)} item${totalItems(lines) === 1 ? "" : "s"}${shortages.length ? ` · ${shortages.length} short` : ""}`}
          defaultOpen
        >
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border border-base-200 bg-base-50 text-left text-[10px] uppercase tracking-[0.04em] font-medium text-base-700 px-2 py-1">
                  Item
                </th>
                <th className="border border-base-200 bg-base-50 text-right text-[10px] uppercase tracking-[0.04em] font-medium text-base-700 px-2 py-1 w-10">
                  Qty
                </th>
                <th
                  className="border border-base-200 bg-base-50 text-right text-[10px] uppercase tracking-[0.04em] font-medium text-base-700 px-2 py-1 w-16"
                  title="Free ready stock at the warehouse for this item — pick Carres Klang in Location to fulfil from it"
                >
                  Ready
                </th>
                <th className="border border-base-200 bg-base-50 text-left text-[10px] uppercase tracking-[0.04em] font-medium text-base-700 px-2 py-1 w-36">
                  Location
                </th>
                <th className="border border-base-200 bg-base-50 text-left text-[10px] uppercase tracking-[0.04em] font-medium text-base-700 px-2 py-1 w-32">
                  ETA
                </th>
              </tr>
            </thead>
            <tbody>
              {orderedLines.map((l) => {
                const bal = stockBalances.find((b) => b.sku === l.sku);
                const have = bal
                  ? Math.max(0, Number(bal.qty) - Number(bal.reserved))
                  : 0;
                const ok = have >= l.qty;
                // Per-item stock location (migration 0168): service charges
                // (No Lift / Disposal) carry none; goods default by category
                // (accessories → warehouse, core → supplier) and are overridable.
                // savedLoc===undefined → never touched → show the default; an
                // explicit [] (operator picked "—") shows blank, not the default.
                const isService = lineKind(l.sku) === "service";
                const savedLoc = form.draft.line_locations[l.sku];
                const locValue =
                  savedLoc !== undefined
                    ? (savedLoc[0] ?? "")
                    : (defaultLineLocation(l.sku) ?? "");
                // Per-item stock ETA (migration 0170) — products don't all arrive
                // on the same date. Defaults to the linked PO's delivery date,
                // overridable via line_etas.
                const etaValue =
                  form.draft.line_etas[l.sku] ?? poEtaBySku.get(l.sku) ?? "";
                // One row per SKU (duplicate lines combined above) → key on SKU.
                return (
                  <tr key={l.sku}>
                    <td className="border border-base-200 px-2 py-1 font-mono text-[11px] align-top break-all">
                      {l.sku}
                    </td>
                    <td className="border border-base-200 px-2 py-1 text-right text-[12px] tabular-nums align-top">
                      {l.qty}
                    </td>
                    <td
                      className={`border border-base-200 px-2 py-1 text-right font-mono text-[11px] align-top ${stage === "delivered" ? "text-base-400" : ok ? "text-success" : "text-warning"}`}
                    >
                      {isService ? <span className="text-base-300">—</span> : have}
                    </td>
                    {isService ? (
                      <td className="border border-base-200 px-2 py-1 text-[11px] text-base-400 align-top">
                        N/A
                      </td>
                    ) : (
                      <td className="border border-base-200 px-1 py-0.5 align-top">
                        <select
                          value={locValue}
                          onChange={(e) =>
                            form.setLineLocation(
                              l.sku,
                              e.target.value ? [e.target.value] : [],
                            )
                          }
                          className="w-full border border-base-300 rounded-[3px] bg-white px-1.5 py-0.5 text-[11px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                        >
                          <option value="">—</option>
                          {STOCK_LOCATIONS.map((locOpt) => (
                            <option key={locOpt} value={locOpt}>
                              {locOpt}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    {isService ? (
                      <td className="border border-base-200 px-2 py-1 text-[11px] text-base-400 align-top">
                        N/A
                      </td>
                    ) : (
                      <td className="border border-base-200 px-1 py-0.5 align-top">
                        <input
                          type="date"
                          value={etaValue}
                          onChange={(e) => form.setLineEta(l.sku, e.target.value)}
                          className="w-full border border-base-300 rounded-[3px] bg-white px-1.5 py-0.5 text-[11px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2">
            <FieldGrid>
              <RemarkControlField
                form={form}
                field="warehouse_remark"
                label="Warehouse remark"
                placeholder="Note for the warehouse team"
              />
            </FieldGrid>
          </div>
          {pos.length > 0 && (
            <div className="mt-2.5">
              <div className="label mb-1">Linked POs</div>
              <div className="border border-base-100 rounded-[4px]">
                {pos.map((po, i) => (
                  <PoRow key={po.id} po={po} divider={i > 0} />
                ))}
              </div>
            </div>
          )}
        </DrawerSection>

        {/* 3 · Delivery & control — carrier/date/slot + control remarks +
            multi-leg (Jess: all control lives with delivery). */}
        <DrawerSection
          icon={<Truck className="w-4 h-4" />}
          title="Delivery & control"
          accent="success"
          summary={
            deadlineSummary +
            (form.remarkCount
              ? ` · ${form.remarkCount} note${form.remarkCount === 1 ? "" : "s"}`
              : "")
          }
          defaultOpen
        >
          {/* 2-col compact (Jess): LEFT = what operation sets (region / carrier /
              deadline / call gate); RIGHT = what the logistic updates back
              (their committed ETA + time slot). Remarks span full width below. */}
          <div className="grid grid-cols-2 gap-2 items-start">
            <div>
              <div className="label mb-1">Operation</div>
              <FieldGrid>
                <RoutingFields
                  orderId={order.id}
                  customerAddress={order.customer_address ?? null}
                  deliveryDate={order.delivery_date}
                  proceedDate={order.proceed_date ?? null}
                  opsAssignedLogistic={order.ops_assigned_logistic ?? null}
                  form={form}
                />
              </FieldGrid>
            </div>
            <div>
              <div className="label mb-1">Logistic updates</div>
              <FieldGrid>
                <LogisticEtaField form={form} />
                <DeliveryTimeSlotField form={form} />
              </FieldGrid>
            </div>
          </div>
          <div className="mt-2">
            <FieldGrid>
              <RemarkControlField
                form={form}
                field="customer_request"
                label="Customer request"
                placeholder="e.g. postponed to end of May"
              />
              <RemarkControlField
                form={form}
                field="action_for_logistic"
                label="Action for logistic"
                placeholder="e.g. call customer before delivery"
              />
              <RemarkControlField
                form={form}
                field="carres_remark"
                label="Carres remark"
                placeholder="Internal note"
              />
            </FieldGrid>
          </div>
          <details className="mt-2.5" open={(order.delivery_stops?.length ?? 0) > 0}>
            <summary className="label cursor-pointer select-none">
              Advanced · multi-leg route{" "}
              <span className="text-[10px] font-normal normal-case tracking-normal text-base-400">
                (cross-state / cross-border only)
              </span>
            </summary>
            <div className="mt-2">
              <DeliveryChain
                orderId={order.id}
                stops={order.delivery_stops}
                fallbackPartnerId={order.delivery_partner_id}
              />
            </div>
          </details>
        </DrawerSection>

        {/* 4 · Payment — every money fact in one place (collapsed by default) */}
        <DrawerSection
          icon={<Banknote className="w-4 h-4" />}
          title="Payment"
          accent="info"
          summary={paymentSummary}
        >
          <div className="grid grid-cols-2 gap-2 items-start">
            <FieldGrid>
              <PaymentControlFields
                form={form}
                paid={Number(order.paid || 0)}
                total={grandTotal}
                orderId={order.id}
              />
            </FieldGrid>
            <FieldGrid>
              <StorageControlFields
                form={form}
                hasMsbf={hasMsbf}
                hasSof={hasSof}
                orderId={order.id}
              />
            </FieldGrid>
          </div>
        </DrawerSection>

        {/* 5 · Activity — last, expandable to see the full history. */}
        <DrawerSection
          icon={<StickyNote className="w-4 h-4" />}
          title="Activity"
          accent="neutral"
        >
          <div className="max-h-[360px] overflow-auto pr-1 -mr-1">
            <AnnotationTimeline orderId={order.id} />
          </div>
        </DrawerSection>
      </div>

      {/* Pinned action bar — stage actions + the control-draft Save, always
          reachable at the drawer bottom (P5). */}
      <div className="px-5 py-3 bg-base-50 border-t border-base-100 shrink-0 flex items-center justify-between gap-3">
        <ActionBar
          stage={stage}
          orderId={order.id}
          so={order.so}
          warehouseName={warehouse?.name ?? null}
          shortageCount={shortages.length}
          partnerAssigned={anyThreadPartnerAssigned}
          doNumber={order.do_number}
          onDispatchClick={onDispatchClick}
          onDOClick={onDOClick}
          onIssuePOsClick={onIssuePOsClick}
          onAbandonClick={onAbandonClick}
          onConfirmProceedClick={onConfirmProceedClick}
          onTransferReadyClick={onTransferReadyClick}
          onTopUpClick={onTopUpClick}
          proceedBlocked={loc.area === "Outstation" && !form.draft.called_customer}
        />
        <OrderControlSaveBar form={form} />
      </div>
    </div>
  );
}

function addonsSum(
  addons: { qty: number; unit_price: number }[] | undefined,
): number {
  return (addons ?? []).reduce(
    (s, a) => s + Number(a.unit_price || 0) * Number(a.qty || 0),
    0,
  );
}

/** Grid cells (spreadsheet look) — label cell (darker for readability) + value
 *  cell, both fully bordered. Kc/Vc compose into 1- or 2-up grid rows. */
/**
 * Customer block of the Order section — read-only, with an inline Edit on a
 * Place order so operation can correct a customer's name / phone / address
 * before the order proceeds (typo, customer moved, etc.). Saves via
 * `useUpdateOrder` → PATCH /api/orders/:id; the `update_order` RPC 422s on any
 * non-Place order, so the Edit affordance only shows for status 'place' (which
 * is every real AutoCount order). Validates with the SAME shared zod schema the
 * API uses. (Jess 2026-06-25, #4 drawer edit.)
 */
export function OrderCustomerCard({
  order,
}: {
  order: {
    id: string;
    status: string;
    customer_name: string | null;
    customer_phone: string | null;
    customer_address: string | null;
  };
}) {
  const qc = useQueryClient();
  const editable = order.status === "place";
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(order.customer_name ?? "");
  const [phone, setPhone] = useState(order.customer_phone ?? "");
  const [address, setAddress] = useState(order.customer_address ?? "");
  const [err, setErr] = useState<string | null>(null);

  const update = useUpdateOrder(order.id, {
    onSuccess: () => {
      setEditing(false);
      toast.success("Customer details updated");
      // useUpdateOrder invalidates the dealer order keys; the drawer reads the
      // operation detail under a different key, so refresh that one too.
      void qc.invalidateQueries({ queryKey: qk.operation.order(order.id) });
    },
    onError: (e) => setErr(e.message),
  });

  function start() {
    setName(order.customer_name ?? "");
    setPhone(order.customer_phone ?? "");
    setAddress(order.customer_address ?? "");
    setErr(null);
    setEditing(true);
  }

  function save() {
    setErr(null);
    // Only send fields the user actually changed — the RPC updates by presence.
    const customer: Record<string, unknown> = {};
    if (name.trim() !== (order.customer_name ?? "")) customer.name = name.trim();
    if (phone.trim() !== (order.customer_phone ?? "")) customer.phone = phone.trim();
    if (address.trim() !== (order.customer_address ?? ""))
      customer.address = address.trim() || null;
    if (Object.keys(customer).length === 0) {
      setEditing(false);
      return;
    }
    const parsed = updateOrderInputSchema.safeParse({ customer });
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    update.mutate(parsed.data);
  }

  if (editing) {
    const field =
      "mt-0.5 w-full px-2 py-1.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700";
    return (
      <div className="space-y-2">
        <label className="block">
          <span className="t-tiny text-base-500">Customer name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="t-tiny text-base-500">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            className={field}
          />
        </label>
        <label className="block">
          <span className="t-tiny text-base-500">Address</span>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            className={`${field} resize-none`}
          />
        </label>
        {err && <p className="t-tiny text-danger">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={update.isPending}
            className="btn-ghost text-[12px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={update.isPending}
            className="btn-primary text-[12px]"
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {editable && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-1 text-[11px] text-base-500 hover:text-base-900"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
      )}
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <Kc>Customer</Kc>
            <Vc>
              <span className={cjkClassName(order.customer_name)}>
                {order.customer_name}
              </span>
            </Vc>
            <Kc>Phone</Kc>
            <Vc>{order.customer_phone ?? <em className="text-base-500">—</em>}</Vc>
          </tr>
          <tr>
            <Kc>Address</Kc>
            <Vc colSpan={3}>
              {order.customer_address ?? <em className="text-base-500">—</em>}
            </Vc>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Kc({ children }: { children: ReactNode }) {
  return (
    <td className="border border-base-200 bg-base-50 text-base-700 text-[10px] font-semibold uppercase tracking-[0.04em] px-2 py-1 align-top whitespace-nowrap">
      {children}
    </td>
  );
}
function Vc({
  children,
  colSpan,
}: {
  children: ReactNode;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className="border border-base-200 text-[12px] text-base-900 font-body px-2 py-1 align-top break-words"
    >
      {children}
    </td>
  );
}
/** Storage-scope category (mirrors OperationPayments.catOf): MS/BF vs SOF. */
/** Client-side CSV (opens in Excel) of the order — the ⋮ Download Excel item. */
function downloadOrderCsv(
  order: DrawerBodyProps["data"]["order"],
  lines: operationOrderDetailLine[],
) {
  const rows: string[][] = [
    ["SO", `SO-${order.so}`],
    ["Customer", order.customer_name],
    ["Phone", order.customer_phone ?? ""],
    ["Address", order.customer_address ?? ""],
    ["Status", order.status],
    [],
    ["Item", "Qty"],
    ...lines.map((l) => [l.sku, String(l.qty)]),
  ];
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `SO-${order.so}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  title,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-base-50 ${disabled ? "opacity-40 cursor-not-allowed" : "text-base-900"}`}
    >
      <span className="text-base-500 shrink-0">{icon}</span>
      {label}
    </button>
  );
}

/** ⋮ header menu — additional service (Service note / Refund / Issue) + the
 *  document exports (PDF + Excel), per Jess. */
function ActionsMenu({
  order,
  lines,
  stage,
  onServiceNoteClick,
}: {
  order: DrawerBodyProps["data"]["order"];
  lines: operationOrderDetailLine[];
  stage: OperationStage;
  onServiceNoteClick: () => void;
}) {
  const role = useAuth((s) => s.role);
  const [open, setOpen] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const close = () => {
    setOpen(false);
    setDlOpen(false);
  };
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="More actions"
        onClick={() => {
          setOpen((o) => !o);
          setDlOpen(false);
        }}
        className="p-1 text-base-600 hover:text-base-900 leading-none"
      >
        <MoreVertical className="w-5 h-5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute right-0 mt-1 w-52 z-20 bg-white border border-base-200 rounded-[6px] shadow-lg">
            <MenuItem
              icon={<FileText className="w-4 h-4" />}
              label="Service note"
              onClick={() => {
                close();
                onServiceNoteClick();
              }}
            />
            <MenuItem
              icon={<RotateCcw className="w-4 h-4" />}
              label="Refund"
              disabled
              title="Refunds are created in Finance → Refunds"
            />
            <MenuItem
              icon={<AlertCircle className="w-4 h-4" />}
              label="Issue"
              disabled
              title="Issues module coming — needs the ops_issues table"
            />
            <div className="border-t border-base-100 my-0.5" />
            {/* Download ▶ flyout (Google-Sheets style): one parent row that
                opens a submenu of formats. Opens LEFT (right-full) since the
                menu hugs the screen's right edge. Driven by JS state (not CSS
                :hover) so it stays accessible + testable. */}
            <div
              className="relative"
              onMouseEnter={() => setDlOpen(true)}
              onMouseLeave={() => setDlOpen(false)}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={dlOpen}
                onClick={() => setDlOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[12px] hover:bg-base-50 text-base-900"
              >
                <span className="flex items-center gap-2">
                  <span className="text-base-500 shrink-0">
                    <Download className="w-4 h-4" />
                  </span>
                  Download
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-base-400" />
              </button>
              {dlOpen && (
                <div className="absolute right-full top-0 w-44 z-30 bg-white border border-base-200 rounded-[6px] shadow-lg overflow-hidden">
                  {role && (
                    <DownloadSalesOrderButton
                      orderId={order.id}
                      so={order.so}
                      role={role}
                      variant="menuitem"
                    />
                  )}
                  {role &&
                    (stage === "dispatched" || stage === "delivered") &&
                    order.invoice_no && (
                      <DownloadInvoiceButton
                        orderId={order.id}
                        so={order.so}
                        role={role}
                        variant="menuitem"
                      />
                    )}
                  {order.do_number && (
                    <PrintDoButton
                      orderId={order.id}
                      doNumber={order.do_number}
                    />
                  )}
                  <MenuItem
                    icon={<Download className="w-4 h-4" />}
                    label="Excel (CSV)"
                    onClick={() => {
                      close();
                      downloadOrderCsv(order, lines);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface ActionBarProps {
  stage: OperationStage;
  orderId: string;
  so: number;
  warehouseName: string | null;
  shortageCount: number;
  partnerAssigned: boolean;
  doNumber: string | null;
  onDispatchClick: () => void;
  onDOClick: () => void;
  onIssuePOsClick: () => void;
  onAbandonClick: () => void;
  onConfirmProceedClick: () => void;
  onTransferReadyClick: () => void;
  onTopUpClick: () => void;
  proceedBlocked?: boolean;
}

function ActionBar({
  stage,
  orderId,
  warehouseName,
  shortageCount,
  doNumber,
  onDispatchClick,
  onDOClick,
  onIssuePOsClick,
  onAbandonClick,
  onConfirmProceedClick,
  onTransferReadyClick,
  onTopUpClick,
  proceedBlocked,
}: ActionBarProps) {
  const recheck = useRecheckStockMutation(orderId);

  if (stage === "placed") {
    return (
      <div>
        <div className="text-[12px] text-base-700 mb-2 font-body">
          Order placed by dealer. Waiting for them to push it to operation — no
          action available yet.
        </div>
      </div>
    );
  }
  if (stage === "confirmed") {
    return (
      <div>
        <div className="text-[12px] text-base-700 mb-2 font-body">
          Dealer pushed this order. Confirm to triage — system will reserve
          stock or queue a PO based on availability.
        </div>
        {proceedBlocked && (
          <div className="text-[11px] text-warning mb-2 font-medium">
            Outstation: call the customer to confirm the final ETA before
            ordering stock, then tick "Call before PO" first.
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            className="btn-primary text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onConfirmProceedClick}
            disabled={proceedBlocked}
            title={
              proceedBlocked ? "Call the customer first (outstation)" : undefined
            }
          >
            Confirm proceed
          </button>
          <button
            type="button"
            className="btn-ghost text-[12px] text-destructive"
            onClick={onAbandonClick}
          >
            Abandon
          </button>
        </div>
      </div>
    );
  }
  if (stage === "in_production") {
    return (
      <div>
        <div className="text-[12px] text-warning mb-2 font-body">
          Waiting on stock for {shortageCount} line{shortageCount === 1 ? "" : "s"}.
          When the supplier DO arrives, mark the PO as received in <strong>Procurement</strong>{" "}
          — or transfer manually if stock is already on-hand.
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            className="btn-secondary text-[12px]"
            onClick={async () => {
              try {
                await recheck.mutateAsync();
                toast.info("Stock re-checked");
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : "Re-check failed");
              }
            }}
            disabled={recheck.isPending}
          >
            {recheck.isPending ? "Checking…" : "↻ Re-check stock"}
          </button>
          <button
            type="button"
            className="btn-secondary text-[12px]"
            onClick={onTransferReadyClick}
          >
            Transfer to ready (stock on-hand)
          </button>
          {shortageCount > 0 && (
            <button
              type="button"
              className="btn-primary text-[12px]"
              onClick={onIssuePOsClick}
            >
              + Issue POs
            </button>
          )}
          <button
            type="button"
            className="btn-ghost text-[12px] text-destructive"
            onClick={onAbandonClick}
          >
            Abandon
          </button>
        </div>
      </div>
    );
  }
  if (stage === "ready_to_dispatch") {
    return (
      <div>
        <div className="text-[12px] text-base-700 mb-2 font-body">
          Stock secured at <strong>{warehouseName ?? "—"}</strong>. Pick a delivery partner.
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            className="btn-primary text-[12px]"
            onClick={onDispatchClick}
          >
            Assign delivery partner
          </button>
          <button
            type="button"
            className="btn-secondary text-[12px]"
            onClick={onTopUpClick}
          >
            Record top-up
          </button>
          <button
            type="button"
            className="btn-ghost text-[12px] text-destructive"
            onClick={onAbandonClick}
          >
            Abandon
          </button>
        </div>
      </div>
    );
  }
  if (stage === "dispatched") {
    return (
      <div>
        <div className="text-[12px] text-base-700 mb-2 font-body">
          Out for delivery. When the DO comes back signed, attach it to close the loop.
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            className="btn-primary text-[12px]"
            onClick={onDOClick}
          >
            Attach DO &amp; mark delivered
          </button>
          <button
            type="button"
            className="btn-secondary text-[12px]"
            onClick={onTopUpClick}
          >
            Record top-up
          </button>
        </div>
      </div>
    );
  }
  // delivered
  return (
    <div className="text-[12px] text-success font-body">
      Delivered. {doNumber && <>DO <strong>{doNumber}</strong> on file.</>}
    </div>
  );
}

function PoRow({ po, divider }: { po: operationOrderDetailPo; divider: boolean }) {
  const totalQty = po.lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const got = po.lines.reduce((s, l) => s + Number(l.received_qty || 0), 0);
  const stColor =
    po.status === "received"
      ? "text-success border-success"
      : got > 0
        ? "text-info border-info"
        : "text-warning border-warning";
  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto] gap-3 px-3.5 py-3 items-center ${divider ? "border-t border-base-100" : ""}`}
    >
      <span className="font-mono text-[12px] font-semibold">{po.id.slice(0, 8)}</span>
      <div>
        {po.lines.map((l, j) => (
          <div key={j} className="text-[11px] leading-snug font-body">
            <span className="font-mono">{l.sku}</span>{" "}
            <span className="font-mono text-base-500">
              {l.received_qty || 0}/{l.qty}
            </span>
          </div>
        ))}
        <div className="text-[10px] text-base-500 mt-0.5">
          ETA {po.eta_date ?? "—"} · Σ {got}/{totalQty}
        </div>
      </div>
      <span
        className={`text-[9px] font-bold uppercase tracking-[0.12em] py-[3px] px-[7px] border rounded-[3px] ${stColor}`}
      >
        {po.status}
      </span>
    </div>
  );
}

/**
 * Print DO link — fetches the PDF with the user's JWT (Authorization header
 * doesn't carry on a plain anchor target), turns it into a Blob URL, opens
 * in a new tab. Cleans up the URL after open.
 */
function PrintDoButton({
  orderId,
  doNumber,
}: {
  orderId: string;
  doNumber: string | null;
}) {
  const [pending, setPending] = useState(false);

  async function open() {
    if (pending) return;
    setPending(true);
    try {
      // 2026-05-12 (Loo): server returns JSON; @react-pdf renders client-side.
      const data = await apiFetch<DoTemplateData>(
        `/api/operation/orders/${orderId}/print-do-data`,
      );
      const blob = await renderDoPdf(data);
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        // Popup blocked — fall back to a download link.
        const a = document.createElement("a");
        a.href = url;
        a.download = `${doNumber ?? "delivery-order"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      // Revoke after 30s — give the browser time to render the blob.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Print delivery order failed",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-base-50 disabled:opacity-40 text-base-900"
    >
      <span className="text-base-500 shrink-0">
        <FileText className="w-4 h-4" />
      </span>
      {pending ? "Opening…" : "Print DO"}
    </button>
  );
}
