import { type ReactNode, useEffect, useState } from "react";
import {
  AlertCircle,
  Banknote,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  Flag,
  MoreVertical,
  Package,
  Pencil,
  RotateCcw,
  Truck,
  Route,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { STOCK_LOCATIONS, normalizeSkuKey, updateOrderInputSchema } from "@carres/shared";
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
  type operationPoListRow,
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
import DeliveryChain from "./DeliveryChain";
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
import StockPickerGrid from "./StockPickerGrid";
import FollowUpForm from "./FollowUpForm";
import ReceivePOModal from "./ReceivePOModal";
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
  const [showFollowUp, setShowFollowUp] = useState(false);

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
      role="region"
      aria-label="Order detail"
      className="bg-card text-card-foreground flex flex-col h-full w-full min-w-0"
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
              onFollowUpClick={() => setShowFollowUp(true)}
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
            {showFollowUp && (
              <FollowUpForm
                orderId={data.order.id}
                so={data.order.so}
                refNo={null}
                onClose={() => setShowFollowUp(false)}
              />
            )}
          </>
        )}
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
  onFollowUpClick: () => void;
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
  onFollowUpClick,
}: DrawerBodyProps) {
  const { order, lines, addons, total, warehouse, stockBalances, pos, threads } = data;
  // Defensive default: an API build that predates freeUnits (web can deploy
  // ahead of the Worker) must not crash the drawer — just no picker until then.
  const freeUnits = data.freeUnits ?? [];
  const qc = useQueryClient();
  // Ready picker (Jess 2026-06-30): which line's reserve dialog is open + the
  // free units grouped by normalized key, so each line resolves its real
  // available units across the order/warehouse naming drift.
  const [pickerSku, setPickerSku] = useState<string | null>(null);
  // GRN — receive an open linked PO right here (Jess: receive in the order).
  const [receivePo, setReceivePo] = useState<operationOrderDetailPo | null>(null);
  const freeUnitsByKey = new Map<string, typeof freeUnits>();
  for (const u of freeUnits) {
    const k = normalizeSkuKey(u.sku);
    (freeUnitsByKey.get(k) ?? freeUnitsByKey.set(k, []).get(k)!).push(u);
  }
  // reserved_ref written when the operator picks a unit for this order.
  const soRef = `SO-${order.so}`;
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
  // The line whose stock shows in the right pane — the clicked one, else the
  // first non-service line so the grid isn't empty on open (Jess: embed stock).
  const activeLineSku =
    pickerSku ??
    orderedLines.find((l) => lineKind(l.sku) !== "service")?.sku ??
    null;
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
  // Contact-by basis (Jess): operation must reach the customer N days BEFORE the
  // deadline to confirm stock + timing. N = ops_order_control.contact_by_days
  // (default 3, editable per order); a daily cron (migration 0197) drops the
  // "Contact customer · SO-x" task on this date.
  const contactByDays = form.draft.contact_by_days.trim()
    ? Number(form.draft.contact_by_days)
    : form.control?.contact_by_days ?? 3;
  const contactByLabel =
    !order.delivery_date_tbd && order.delivery_date
      ? fmtDate(
          new Date(new Date(order.delivery_date).getTime() - contactByDays * 86_400_000)
            .toISOString()
            .slice(0, 10),
        )
      : null;
  const paymentSummary = !hasTotal
    ? `${RM(Number(order.paid || 0))} paid`
    : outstanding <= 0
      ? "Settled"
      : `${RM(outstanding)} owing`;

  return (
    <div className="flex flex-col h-full min-h-0">
      {receivePo && (
        <ReceivePOModal
          po={{
            id: receivePo.id,
            supplier_id: receivePo.supplier_id,
            warehouse_id: receivePo.warehouse_id,
            status: receivePo.status as operationPoListRow["status"],
            sup_status: receivePo.sup_status,
            so: receivePo.so,
            so_refs: receivePo.so_refs,
            eta_date: receivePo.eta_date,
            placed_at: "",
            purchase_order_lines: receivePo.lines.map((l) => ({
              id: l.id,
              sku: l.sku,
              qty: l.qty,
              received_qty: l.received_qty,
            })),
          }}
          supplier={undefined}
          warehouse={warehouse ?? undefined}
          onClose={() => setReceivePo(null)}
        />
      )}
      {/* No separate top bar — the ⋮ actions menu + close moved into the Order
          section header next to the status chip (Jess: save a row). Backdrop
          click still closes the drawer. */}
      {/* Option-1 full-page grid (Jess 2026-06-30): Order/customer full-width on
          top · Delivery | Payment as two columns · Items & stock the full-width
          work area (only it scrolls) · Activity at the bottom. */}
      <div
        className="flex-1 min-h-0 overflow-hidden px-5 py-3 grid gap-2.5"
        style={{
          // Standard order-detail pattern (Jess-approved, Shopify/Stripe): a big
          // Items & stock work area on the LEFT (main), a stacked card sidebar on
          // the RIGHT (Customer · Delivery · [Route] · Balance · [Storage]).
          gridTemplateColumns: "1.62fr 1fr",
          gridTemplateRows: "auto auto minmax(0,1fr)",
          gridTemplateAreas:
            '"banner banner" "header header" "main side"',
        }}
      >
        {/* Needs-action banner — the "action for logistic" note surfaced at the
            top so it can't be missed (Jess). */}
        {form.draft.action_for_logistic.trim() && (
          <div className="flex items-start gap-2 rounded-[4px] border border-warning/50 bg-warning/10 px-3 py-2 text-[12px]" style={{ gridArea: "banner" }}>
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
        {/* Header bar — status FIRST · Order # · customer name on the left;
            flag / actions / close on the right. Full width above the 3 meta
            columns (Jess Option 1). */}
        <div
          style={{ gridArea: "header" }}
          className="flex items-center justify-between gap-3 min-w-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <StageChip stage={stage} />
            <ClipboardList className="w-4 h-4 text-base-400 shrink-0" />
            <span className="font-display t-h4 text-base-900">Order</span>
            <span className="font-mono t-h3 font-bold text-base-900 leading-none">
              #{order.so}
            </span>
            {order.source_ref?.[0] && (
              <span className="t-small text-base-500 font-mono shrink-0">
                · Ref {order.source_ref[0]}
              </span>
            )}
            <span className="t-small text-base-500 truncate">
              · {order.customer_name}
            </span>
          </div>
          <span className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onFollowUpClick}
              aria-label="Add follow-up"
              title="Add a follow-up (write the issue + assign)"
              className="p-1 rounded hover:bg-base-100 text-base-400 hover:text-primary"
            >
              <Flag className="w-[18px] h-[18px]" />
            </button>
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
              className="p-1 text-[18px] text-base-700 hover:text-base-900 leading-none"
            >
              ×
            </button>
          </span>
        </div>

        {/* Main work area — Items & stock (the left column). */}
        <div style={{ gridArea: "main", minWidth: 0, minHeight: 0, overflow: "auto" }}>
        <DrawerSection
          icon={<Package className="w-4 h-4" />}
          title="Items & stock"
          accent="warning"
          summary={`${totalItems(lines)} item${totalItems(lines) === 1 ? "" : "s"}${shortages.length ? ` · ${shortages.length} short` : ""}`}
          defaultOpen
        >
          {/* Stacked work area (Jess): Items ordered on TOP · its warehouse stock
              grid BELOW (not side-by-side) — each gets the full main width. */}
          <div className="grid grid-cols-1 gap-3 items-start">
          <div className="min-w-0">
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
                // Real availability: match free per-unit stock by normalized key.
                // The catalog is empty so the old exact-sku stockBalances join
                // always missed (showed 0); normalizeSkuKey bridges the
                // order/warehouse naming drift (project-catalog-empty-sku-naming).
                const matchUnits = freeUnitsByKey.get(normalizeSkuKey(l.sku)) ?? [];
                const ready = matchUnits.length;
                const ok = ready >= l.qty;
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
                  <tr
                    key={l.sku}
                    onClick={() => setPickerSku(l.sku)}
                    className={`cursor-pointer ${l.sku === activeLineSku ? "bg-primary/10" : "hover:bg-base-50"}`}
                  >
                    <td className="border border-base-200 px-2 py-1 font-mono text-[11px] align-top break-all">
                      {l.sku}
                    </td>
                    <td className="border border-base-200 px-2 py-1 text-right text-[12px] tabular-nums align-top">
                      {l.qty}
                    </td>
                    <td
                      className={`border border-base-200 px-2 py-1 text-right font-mono text-[11px] align-top ${stage === "delivered" ? "text-base-400" : ok ? "text-success" : "text-warning"}`}
                    >
                      {isService ? (
                        <span className="text-base-300">—</span>
                      ) : stage !== "delivered" ? (
                        <button
                          type="button"
                          onClick={() => setPickerSku(l.sku)}
                          className="underline decoration-dotted underline-offset-2 hover:text-primary cursor-pointer"
                          title="Pick ready stock to reserve for this order (or browse all warehouse stock)"
                          data-testid={`ready-pick-${l.sku}`}
                        >
                          {ready}
                        </button>
                      ) : (
                        ready
                      )}
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
                  <PoRow key={po.id} po={po} divider={i > 0} onReceive={setReceivePo} />
                ))}
              </div>
            </div>
          )}
          </div>

          {/* RIGHT pane — stock grid for the selected line (embedded, ranked
              best-match-first; falls back to all free units). */}
          <div className="min-w-0 h-[460px]">
            {activeLineSku && stage !== "delivered" ? (
              <StockPickerGrid
                sku={activeLineSku}
                soRef={soRef}
                need={orderedLines.find((l) => l.sku === activeLineSku)?.qty ?? 1}
                units={freeUnits}
                onReserved={() => {
                  void qc.invalidateQueries({ queryKey: qk.operation.order(order.id) });
                  void qc.invalidateQueries({ queryKey: ["operation", "ops-stock"] });
                }}
              />
            ) : (
              <div className="h-full grid place-items-center border border-dashed border-base-200 rounded-[4px] t-tiny text-base-400">
                {stage === "delivered" ? "Delivered — stock settled." : "Pick an item on the left to see its stock."}
              </div>
            )}
          </div>
          </div>
        </DrawerSection>
        </div>

        {/* Right sidebar — stacked cards (Jess-approved order-detail pattern):
            Customer · Delivery · [Route] · Balance · [Storage]. Only this column
            + the main work area scroll. */}
        <div
          style={{ gridArea: "side", minWidth: 0, minHeight: 0 }}
          className="flex flex-col gap-2.5 overflow-auto"
        >
        <div className="min-w-0">
        <DrawerSection
          icon={<ClipboardList className="w-4 h-4" />}
          title="Customer"
          accent="neutral"
          summary={order.customer_name}
          defaultOpen
        >
          <OrderCustomerCard order={order} />
        </DrawerSection>
        </div>

        <div className="min-w-0">
        {/* Delivery — carrier/date/slot + control remarks + contact-by. */}
        <DrawerSection
          icon={<Truck className="w-4 h-4" />}
          title="Delivery"
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
          {/* Contact-by — reach the customer BEFORE the deadline (Jess) to confirm
              stock + timing. A daily cron auto-drops the task on this date; the
              lead days (default 3) are editable per order. */}
          {contactByLabel && (
            <div className="mt-2.5 flex items-center gap-2 rounded-[4px] bg-info-soft/60 px-3 py-1.5 text-[11.5px]">
              <span className="font-semibold uppercase tracking-[0.04em] text-[10px] text-info">
                Contact by
              </span>
              <span className="font-medium text-base-800">{contactByLabel}</span>
              <span className="text-base-400">· call to confirm stock + timing · deadline −</span>
              <input
                type="number"
                min={0}
                max={60}
                value={form.draft.contact_by_days}
                onChange={(e) => form.set("contact_by_days", e.target.value)}
                placeholder="3"
                aria-label="Contact-by lead days before the deadline"
                className="w-12 rounded border border-base-200 bg-white px-1.5 py-0.5 text-[11.5px] text-center outline-none focus:border-primary"
              />
              <span className="text-base-400">days</span>
            </div>
          )}

        </DrawerSection>
        </div>

        {/* Route — its own slim column (Jess-approved 4-col). Single trip shows a
            few lines; "+ Add stop" expands into multi-leg with per-stop ETA. */}
        <div className="min-w-0">
        <DrawerSection
          icon={<Route className="w-4 h-4" />}
          title="Route"
          accent="neutral"
          summary={
            order.delivery_stops?.length
              ? `${order.delivery_stops.length} stops`
              : "Single trip"
          }
          defaultOpen
        >
          <DeliveryChain
            orderId={order.id}
            stops={order.delivery_stops}
            fallbackPartnerId={order.delivery_partner_id}
          />
        </DrawerSection>
        </div>

        <div className="min-w-0">
        {/* 4 · Payment — every money fact in one place (collapsed by default) */}
        <DrawerSection
          icon={<Banknote className="w-4 h-4" />}
          title="Payment"
          accent="info"
          summary={paymentSummary}
          defaultOpen
        >
          <div className="grid grid-cols-2 gap-2 items-start">
            <FieldGrid>
              <PaymentControlFields
                form={form}
                paid={Number(order.paid || 0)}
                total={grandTotal}
                orderId={order.id}
                receiptMeta={{ orderCode: `SO-${order.so}`, customerName: order.customer_name ?? "" }}
              />
            </FieldGrid>
            <FieldGrid>
              <StorageControlFields
                form={form}
                hasMsbf={hasMsbf}
                hasSof={hasSof}
                orderId={order.id}
                meta={{
                  orderCode: `SO-${order.so}`,
                  customerName: order.customer_name ?? "",
                  customerPhone: order.customer_phone ?? "",
                }}
              />
            </FieldGrid>
          </div>
        </DrawerSection>
        </div>
        </div>{/* /right sidebar */}

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
    placed_at?: string | null;
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

  // Compact read-mode (Jess 4-col): label-above-value rows, no bordered table;
  // click Edit to change (place-status only). Ordered date anchored to the
  // card bottom so the column aligns with its siblings.
  return (
    <div className="flex flex-col h-full text-[12px]">
      <CompactField label="Name">
        <span className={`font-medium ${cjkClassName(order.customer_name)}`}>
          {order.customer_name || <span className="text-base-400">—</span>}
        </span>
      </CompactField>
      <CompactField label="Phone">
        {order.customer_phone || <span className="text-base-400">—</span>}
      </CompactField>
      <CompactField label="Address">
        <span className="leading-snug text-base-600">
          {order.customer_address || <span className="text-base-400">—</span>}
        </span>
      </CompactField>
      <div className="mt-auto pt-2 border-t border-base-100 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.04em] text-base-400">Ordered</span>
          <span className="font-medium text-base-800">
            {order.placed_at ? fmtDate(order.placed_at) : "—"}
          </span>
        </span>
        {editable && (
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-1 text-[11px] text-base-500 hover:text-primary"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
      </div>
    </div>
  );
}

/** Compact label-above-value read row (Jess 4-col redesign). */
function CompactField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2">
      <div className="text-[10px] uppercase tracking-[0.04em] text-base-400">{label}</div>
      <div className="text-base-900">{children}</div>
    </div>
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

function PoRow({
  po,
  divider,
  onReceive,
}: {
  po: operationOrderDetailPo;
  divider: boolean;
  onReceive: (po: operationOrderDetailPo) => void;
}) {
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
      <div className="flex flex-col items-end gap-1.5">
        <span
          className={`text-[9px] font-bold uppercase tracking-[0.12em] py-[3px] px-[7px] border rounded-[3px] ${stColor}`}
        >
          {po.status}
        </span>
        {po.status !== "received" && po.status !== "cancelled" && (
          <button
            type="button"
            onClick={() => onReceive(po)}
            className="btn-primary text-[10px] py-1 px-2.5 whitespace-nowrap"
            title="Receive this PO's goods (GRN) — books them in as ready stock"
          >
            Receive (GRN)
          </button>
        )}
      </div>
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
