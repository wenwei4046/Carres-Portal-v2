import {
  type ReactNode,
  type MouseEvent,
  type MutableRefObject,
  Fragment,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Flag,
  MoreVertical,
  PackagePlus,
  Pencil,
  Phone,
  RotateCcw,
  Truck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  STOCK_LOCATIONS,
  normalizeSkuKey,
  updateOrderInputSchema,
  type LineStockStatus,
} from "@carres/shared";
import { apiFetch, ApiError } from "@/lib/api";
import { renderDoPdf, renderReceiptPdf } from "@/lib/pdf/render";
import type { DoTemplateData } from "@/lib/pdf/types";
import {
  qk,
  useOperationOrder,
  useRecheckStockMutation,
  useReceiveLine,
  useOrderLoans,
  useLoanSofa,
  useReturnLoan,
  useDeliveryPartners,
  useUpdateOrder,
  useOrderPayments,
  useRecordPayment,
  useVoidPayment,
  type OrderPaymentRow,
  type operationOrderDetailLine,
  type operationOrderDetailPo,
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
  stockMatchKey,
} from "@/lib/line-category";
import { useAuth } from "@/lib/auth";
import { Modal } from "./Modal";
import DeliveryChain from "./DeliveryChain";
import {
  RouteJourneyBar,
  RouteLegList,
  RouteQuietButton,
  deriveRouteLegs,
  isSpecialRoute,
} from "./RouteJourneyBar";
import {
  useOrderControlForm,
  RoutingFields,
  DeliveryTimeSlotField,
  LogisticEtaField,
  StorageControlFields,
  RemarkControlField,
  OrderControlSaveBar,
  FieldGrid,
} from "./OrderControlPanel";
import ServiceNoteModal from "./ServiceNoteModal";
import DownloadSalesOrderButton from "@/components/DownloadSalesOrderButton";
import DownloadInvoiceButton from "@/components/DownloadInvoiceButton";
import { type OperationStage } from "./StageChip";
import DispatchModal from "./DispatchModal";
import DOAttachModal from "./DOAttachModal";
import AbandonOrderModal from "./AbandonOrderModal";
import ConfirmProceedDialog from "./ConfirmProceedDialog";
import TransferReadyDialog from "./TransferReadyDialog";
import StockPickerGrid from "./StockPickerGrid";
import FollowUpForm from "./FollowUpForm";
import ReceivePOModal from "./ReceivePOModal";
import AnnotationTimeline from "./AnnotationTimeline";
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

/**
 * Header pipeline status (BUG 2, Loo 2026-07-09) — derived from the order's ACTUAL
 * work signals (PO? ETA? goods in? confirmed?), NOT a status-string guess. The old
 * header fell through to "In Production" for any AutoCount import that carried no
 * operation_stage — inventing a stage that wasn't real. `deriveOrderStage` instead
 * reads the real signals and, when NONE are present, says "Needs setup".
 *
 * Ladder — first match wins, most-advanced first:
 *   completed     ← delivered
 *   ready         ← every goods line in stock  (beats scheduled — Loo: 货齐 > 排物流)
 *   scheduled     ← LP leg live (dispatched / ready_to_dispatch)
 *   in_production ← a linked PO carries an ETA date
 *   pending       ← a PO exists but no ETA yet
 *   proceed       ← order confirmed, nothing procured yet
 *   needs_setup   ← none of the above (fresh import: no PO / ETA / stock)
 *
 * ⚠️ Drawer-only richer vocab. The Orders LIST keeps its coarser 5-tab bucketing
 * (`controlTabOf`) for now — aligning the list to this ladder is a SEPARATE task
 * (Loo). Display-only: the functional `stage: OperationStage` that drives the
 * ActionBar / StockPickerGrid is UNCHANGED.
 */
type PipelineStatus =
  | "needs_setup"
  | "proceed"
  | "pending"
  | "in_production"
  | "ready"
  | "scheduled"
  | "completed";

function deriveOrderStage(sig: {
  delivered: boolean;
  scheduled: boolean;
  allReceived: boolean;
  etaFilled: boolean;
  hasPo: boolean;
  confirmed: boolean;
}): PipelineStatus {
  if (sig.delivered) return "completed";
  if (sig.allReceived) return "ready"; // Loo: goods-ready outranks scheduled
  if (sig.scheduled) return "scheduled";
  if (sig.etaFilled) return "in_production";
  if (sig.hasPo) return "pending";
  if (sig.confirmed) return "proceed";
  return "needs_setup";
}

const PIPELINE_LABEL: Record<PipelineStatus, string> = {
  needs_setup: "Needs setup",
  proceed: "Proceed",
  pending: "Pending",
  in_production: "In Production",
  ready: "Ready",
  scheduled: "Scheduled",
  completed: "Completed",
};

/** Pill class per status — grey (no work) → purple → amber → blue → green →
 *  indigo → grey (done). */
const PIPELINE_PILL: Record<PipelineStatus, string> = {
  needs_setup: "pill-neutral", // grey — no work started yet
  proceed: "pill-draft", // purple — confirmed, being arranged
  pending: "pill-warning", // amber — PO raised, waiting on stock
  in_production: "pill-sent", // blue — factory has an ETA
  ready: "pill-confirmed", // green — all goods in
  scheduled: "pill-collected", // indigo — LP assigned / en route
  completed: "pill-neutral", // grey — done
};

/** Hover copy per status — one plain-English line explaining what it means. */
const PIPELINE_HINT: Record<PipelineStatus, string> = {
  needs_setup: "No PO, ETA, or stock yet — this order hasn't been set up",
  proceed: "Confirmed — being arranged",
  pending: "PO raised — waiting for stock at the warehouse",
  in_production: "Supplier has given an ETA — in production",
  ready: "All goods are in stock — ready to schedule delivery",
  scheduled: "Delivery partner assigned / out for delivery",
  completed: "Delivered and closed",
};

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
      className="bg-background text-card-foreground flex flex-col h-full w-full min-w-0"
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

/**
 * Panel — the LOCKED design-system Card (Jess 2026-07-01, one-screen order
 * detail): white surface · cool-grey hairline · 12px round · a header with a
 * bottom rule and a SUMMARY badge pinned to the right so the card reads at a
 * glance. NOT collapsible (the page is a fixed one-screen layout). `grow` fills
 * leftover column height so the left + right columns' bottoms line up (Jess: no
 * 高高低低). The caller supplies the body (each panel scrolls / pads its own way).
 */
function Panel({
  title,
  summary,
  actions,
  grow,
  className,
  children,
}: {
  title: string;
  /** Pinned to the header's right edge — the at-a-glance status badge. */
  summary?: ReactNode;
  /** Header ⋮ menu — this panel's own actions (Jess 2026-07-11). */
  actions?: ReactNode;
  grow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  // Per-panel hide / expand (Jess 2026-07-11) — every panel header toggles its
  // own body (accordion), so a big order can collapse the cards it doesn't need.
  // State persists across orders via localStorage, keyed by the panel title.
  const storeKey = `ops-drawer-panel:${title}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storeKey) !== "0";
    } catch {
      return true;
    }
  });
  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(storeKey, next ? "1" : "0");
      } catch {
        /* ignore quota / privacy-mode */
      }
      return next;
    });
  };
  return (
    <section
      className={`bg-white rounded-2xl overflow-hidden flex flex-col min-h-0 border-[1.5px] border-[rgba(17,24,39,0.06)] shadow-[0_1px_2px_rgba(17,24,39,0.05),0_1px_1px_rgba(17,24,39,0.03)] ${grow && open ? "flex-1" : ""} ${className ?? ""}`}
    >
      <header
        className={`flex items-center justify-between gap-3 px-3 py-2 shrink-0 ${open ? "border-b border-base-100" : ""}`}
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          title={open ? "Hide" : "Expand"}
          className="flex items-center gap-1.5 min-w-0 text-left hover:text-base-950"
        >
          {open ? (
            <ChevronDown size={14} className="shrink-0 text-base-400" aria-hidden="true" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-base-400" aria-hidden="true" />
          )}
          <span className="t-h4 text-base-900 truncate">{title}</span>
        </button>
        <span className="shrink-0 flex items-center gap-1.5">
          {summary}
          {actions}
        </span>
      </header>
      {open && children}
    </section>
  );
}

/** A panel header's own ⋮ actions menu (Jess 2026-07-11) — every panel that has
 *  actions passes one via `Panel actions=…`. Self-contained dropdown. */
function PanelMenu({
  items,
}: {
  items: { label: string; onClick: () => void; icon?: ReactNode; disabled?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Panel actions"
        onClick={() => setOpen((o) => !o)}
        className="p-0.5 text-base-400 hover:text-base-800 leading-none"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-48 z-20 bg-white border border-base-200 rounded-[6px] shadow-lg py-1">
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className="w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 hover:bg-base-50 disabled:opacity-40"
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Tiny status counter for a panel header — tighter than the full `.pill` so up
 *  to three fit on one header row. Colours track the locked stock vocab. */
function MiniBadge({
  tone,
  children,
}: {
  tone: "nopo" | "waiting" | "ready" | "kv" | "outstation" | "muted";
  children: ReactNode;
}) {
  // App-wide colour rule (Jess 2026-07-02): red = action / blocks · amber = warning
  // · green = ok. No PO is RED (must raise a PO), not grey.
  const TONE: Record<string, string> = {
    nopo: "bg-[#DC2626] text-white",
    waiting: "bg-[#FEF3C7] text-[#92400E]",
    ready: "bg-[#DCFCE7] text-[#166534]",
    kv: "bg-[#DCFCE7] text-[#166534]",
    outstation: "bg-[#FEF3C7] text-[#92400E]",
    muted: "bg-base-100 text-base-500",
  };
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Items-ordered header readiness — shows only the states present (No PO grey →
 *  Waiting amber → Ready green), each counted against the total goods lines. */
function ReadinessBadge({
  nopo,
  waiting,
  ready,
  total,
}: {
  nopo: number;
  waiting: number;
  ready: number;
  total: number;
}) {
  if (total === 0) return <MiniBadge tone="muted">no goods</MiniBadge>;
  return (
    <>
      {nopo > 0 && (
        <MiniBadge tone="nopo">
          No PO {nopo}/{total}
        </MiniBadge>
      )}
      {waiting > 0 && (
        <MiniBadge tone="waiting">
          Waiting {waiting}/{total}
        </MiniBadge>
      )}
      {ready > 0 && (
        <MiniBadge tone="ready">
          Ready {ready}/{total}
        </MiniBadge>
      )}
    </>
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
  const { order, lines, addons, total, warehouse, pos } = data;
  // Defensive default: an API build that predates freeUnits (web can deploy
  // ahead of the Worker) must not crash the drawer — just no picker until then.
  const freeUnits = data.freeUnits ?? [];
  const qc = useQueryClient();
  // Ready picker (Jess 2026-06-30): which line's reserve dialog is open + the
  // free units grouped by normalized key, so each line resolves its real
  // available units across the order/warehouse naming drift.
  const [pickerSku, setPickerSku] = useState<string | null>(null);
  // Route "Option D" — which item's journey legs are expanded in-place (one at a
  // time; the heavy detail stays inside the drawer so the list never gets busy).
  const [routeOpenSku, setRouteOpenSku] = useState<string | null>(null);
  // Lifted so the Customer panel's ⋮ "Edit details" can trigger the card's own
  // safe-edit mode (every panel gets a ⋮ — Jess 2026-07-11).
  const customerEditRef = useRef<(() => void) | null>(null);
  // GRN — receive an open linked PO right here (Jess: receive in the order).
  const [receivePo, setReceivePo] = useState<operationOrderDetailPo | null>(null);
  // GRN per-line partial receive (migration 0208) — the "Book in" stepper target.
  const [receiveLine, setReceiveLine] = useState<{
    sku: string;
    qty: number;
    received: number;
  } | null>(null);
  // Sofa loan (migration 0209) — the pending "loan this sofa" DO prompt target.
  const [loanTarget, setLoanTarget] = useState<{ itemId: string; sku: string } | null>(
    null,
  );
  // Group free units by the stock MATCH key (same model + canonical size), the
  // exact rule the Warehouse-stock panel filters by — so the readiness count the
  // badge shows can never disagree with the units the panel lists.
  const freeUnitsByKey = new Map<string, typeof freeUnits>();
  for (const u of freeUnits) {
    const k = stockMatchKey(u.sku);
    (freeUnitsByKey.get(k) ?? freeUnitsByKey.set(k, []).get(k)!).push(u);
  }
  // reserved_ref written when the operator picks a unit for this order.
  const soRef = `SO-${order.so}`;
  // Pipeline v2 (C1): widen stage derivation to honor 'place' status + the
  // new placed/confirmed enum values without falling through to a
  // bogus in_production default.
  const stage: OperationStage = (() => {
    // AutoCount-imported orders arrive ALREADY proceeded — they carry a PO, so
    // they are NEVER "placed / waiting for the dealer to push" (Jess 2026-07-02,
    // project-order-lifecycle-flow: "the 'waiting for dealer' copy is WRONG for
    // these"). Only a native dealer/POS order sits at 'placed'.
    const autocount = order.source_system === "autocount";
    if (order.status === "place" && !autocount) return "placed";
    if (order.operation_stage) return order.operation_stage as OperationStage;
    if (order.status === "delivered") return "delivered";
    return "in_production";
  })();
  // Line-sum of the order (native/priced orders). AutoCount imports carry no line
  // prices → grandTotal is 0 and Total falls back to the keyed balance (see the
  // Money block below). hasLineTotal drives whether Total is auto (read-only) or
  // staff-keyed.
  const grandTotal = total + addonsSum(addons);
  const hasLineTotal = grandTotal > 0;
  const loc = locationForAddress(order.customer_address ?? null);

  const navigate = useNavigate();
  const form = useOrderControlForm(order.id);
  // Re-derive per-line stock readiness on demand — the Items + Warehouse ⋮
  // "Recheck stock" action (Jess 2026-07-11 per-panel ⋮).
  const recheckStock = useRecheckStockMutation(order.id);
  // The Warehouse-stock panel's header ⋮ (same actions on the grid + the
  // placeholder). Recheck re-derives readiness; Open jumps to the full stock page.
  const warehouseMenu = (
    <PanelMenu
      items={[
        {
          label: recheckStock.isPending ? "Rechecking…" : "Recheck stock",
          icon: <RotateCcw size={14} />,
          disabled: recheckStock.isPending,
          onClick: () =>
            recheckStock.mutate(undefined, {
              onSuccess: () => toast.success("Stock rechecked"),
              onError: (e) => toast.error(e.message),
            }),
        },
        {
          label: "Open full warehouse",
          icon: <ExternalLink size={14} />,
          onClick: () => navigate("/operation?tab=stock-onhand"),
        },
      ]}
    />
  );
  // Payment ledger (order_payments, migration 0184) — the source of truth for
  // Collected. Fetched at the drawer level so the header sticker + status strip +
  // Money card all read ONE Outstanding.
  const paymentsQuery = useOrderPayments(order.id);
  // The order's assigned logistic NAME (ops_assigned_logistic is a partner id) —
  // drives the default stock Location (final consolidation point, not supplier).
  const { data: partnersData } = useDeliveryPartners();
  const assignedLogisticName =
    (partnersData?.partners ?? []).find(
      (p) => p.id === order.ops_assigned_logistic,
    )?.name ?? null;
  // Sofa loans (migration 0209) — active loaners against this order.
  const loansQuery = useOrderLoans(order.id);
  const activeLoans = (loansQuery.data?.loans ?? []).filter(
    (l) => l.status === "on_loan",
  );
  const returnLoan = useReturnLoan(order.id);
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
  // Collect-before-delivery reminder dates (Jess): ideal collect ≥7 days before the
  // logistic ETA (delivery date); last-call at ETA−1 (after which delivery holds).
  const deliveryMs =
    !order.delivery_date_tbd && order.delivery_date
      ? new Date(order.delivery_date).getTime()
      : null;
  const collectByLabel =
    deliveryMs !== null
      ? fmtDate(new Date(deliveryMs - 7 * 86_400_000).toISOString().slice(0, 10))
      : null;
  const lastCallLabel =
    deliveryMs !== null
      ? fmtDate(new Date(deliveryMs - 1 * 86_400_000).toISOString().slice(0, 10))
      : null;
  // Readiness per goods line (locked vocab): Ready (free stock ≥ qty) → Waiting
  // (a PO is raised for the sku) → No PO (nothing yet). Service lines carry no
  // stock, so they're excluded from the count. The panel header badge tallies
  // goods lines by state.
  const poSkus = new Set<string>();
  for (const po of pos)
    for (const pl of po.lines) poSkus.add(normalizeSkuKey(pl.sku));
  // AutoCount-imported orders carry their PO on each line (order_lines.source_po),
  // NOT as a portal purchase_order — so "has a PO" must check BOTH, else every
  // imported order wrongly reads "No PO" (Jess 2026-07-02).
  const soPoBySku = new Map<string, string>();
  for (const l of lines) {
    if (!l.source_po) continue;
    const k = normalizeSkuKey(l.sku);
    if (!soPoBySku.has(k)) soPoBySku.set(k, l.source_po);
  }
  const hasPoForSku = (sku: string) => {
    const k = normalizeSkuKey(sku);
    return poSkus.has(k) || soPoBySku.has(k);
  };
  const goodsLines = orderedLines.filter((l) => lineKind(l.sku) !== "service");
  const derivedReadiness = (sku: string, qty: number): "ready" | "waiting" | "nopo" => {
    const free = (freeUnitsByKey.get(stockMatchKey(sku)) ?? []).length;
    if (free >= qty) return "ready";
    if (hasPoForSku(sku)) return "waiting";
    return "nopo";
  };
  // Per-line override (Master-sheet import or keyed in the Stock cell) wins over
  // the derived free-stock value (migration 0199) — AutoCount receipts live in
  // the sheet, not the portal, so the derived value alone never shows Ready.
  const readinessOf = (sku: string, qty: number): "ready" | "waiting" | "nopo" => {
    // Accessories (pillow / M.P / protector) are ALWAYS ready warehouse stock
    // (Jess 2026-07-07) — they don't go through a PO / receive; they're deducted
    // from the Klang warehouse. Only core items run the PO/stock readiness.
    if (lineKind(sku) === "acc") return "ready";
    return form.draft.line_stock_status[sku] ?? derivedReadiness(sku, qty);
  };
  // GRN received-so-far per line (migration 0208) — drives the Recv X/N column.
  const lineReceivedOf = (sku: string): number =>
    Number(form.control?.line_received?.[sku] ?? 0);
  const readyN = goodsLines.filter((l) => readinessOf(l.sku, l.qty) === "ready").length;
  const waitingN = goodsLines.filter((l) => readinessOf(l.sku, l.qty) === "waiting").length;
  const nopoN = goodsLines.filter((l) => readinessOf(l.sku, l.qty) === "nopo").length;
  // Every goods line reads "ready" (Master override + accessories-always-ready +
  // free stock — see readinessOf). Hoisted so the header status strip + ActionBar
  // (batch 1) share the SAME readiness the pill uses — no "Ready pill / waiting
  // buttons" disagreement. Empty goods list (service-only) is NOT "all received".
  const allReceived = goodsLines.length > 0 && readyN === goodsLines.length;

  // Header pipeline status (BUG 2) — derived from the order's real work signals,
  // each criterion reading ONE clear source (Loo 2026-07-09: annotate every one).
  // Display-only; the functional `stage` above still drives the ActionBar.
  const pipelineStatus = deriveOrderStage({
    // delivered — the collapsed operation_stage enum (`orders.operation_stage`),
    //   or `orders.status === "delivered"`, both folded into `stage` above.
    delivered: stage === "delivered",
    // scheduled — an LP leg is live: `orders.operation_stage` is dispatched /
    //   ready_to_dispatch (via `stage`).
    scheduled: stage === "dispatched" || stage === "ready_to_dispatch",
    // allReceived — every goods line reads "ready". `readinessOf` already folds in
    //   the Master `ops_order_control.line_stock_status` override + accessories-
    //   always-ready + live free stock. Ready criterion = readyN === goodsLines.length
    //   (Loo: match the Items-panel badge; not strict GRN line_received).
    allReceived,
    // etaFilled — a linked portal PO carries a delivery date (`purchase_orders.eta_date`,
    //   collected into `poEtaBySku`). AutoCount inline POs carry no ETA, so they never trip this.
    etaFilled: poEtaBySku.size > 0,
    // hasPo — a portal `purchase_orders` line (`poSkus`) OR an AutoCount inline PO
    //   (`order_lines.source_po` → `soPoBySku`) exists for any sku.
    hasPo: poSkus.size > 0 || soPoBySku.size > 0,
    // confirmed — the order has moved past raw entry: `orders.operation_stage` is set,
    //   or `orders.status` is neither "place" nor "cancelled".
    confirmed:
      order.operation_stage != null ||
      (order.status !== "place" && order.status !== "cancelled"),
  });

  // Collect-before-delivery gate (Jess 2026-07-02), keyed to the Logistic ETA
  // (delivery date). Two stages: amber "Collect before delivery" while the ETA
  // is still >1 day away; red "Hold Delivery" from ETA−1 if still uncollected.
  // Applies to BOTH the goods balance and the storage fee; the header rolls up
  // the red (blocking) ones into one HOLD DELIVERY status.
  const todayIso = new Date().toISOString().slice(0, 10);
  const daysToDelivery =
    !order.delivery_date_tbd && order.delivery_date
      ? Math.round(
          (new Date(`${order.delivery_date}T00:00:00`).getTime() -
            new Date(`${todayIso}T00:00:00`).getTime()) /
            86_400_000,
        )
      : null;
  const pastLastCall = daysToDelivery !== null && daysToDelivery <= 1;
  // ── Money (batch 2, Jess 2026-07-09) — ledger-based Total / Collected /
  //    Outstanding. Path 1 (no migration): Total = the order's to-collect figure —
  //    the line-sum when priced (native), else the keyed ops_order_control.balance
  //    (AutoCount has no line prices → staff keys it once). Collected = Σ goods
  //    payments (payment+deposit) from the order_payments ledger. Outstanding =
  //    Total − Collected. The whole system already nets balance − ledger
  //    (OperationPayments), so this stays consistent. Total-not-set ⇒ don't block.
  const ledger = paymentsQuery.data?.payments ?? [];
  const collected = ledger
    .filter((p) => p.kind === "payment" || p.kind === "deposit")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const keyedTotal = form.draft.balance.trim()
    ? Number(form.draft.balance)
    : Number(form.control?.balance ?? 0);
  const orderTotal = hasLineTotal ? grandTotal : keyedTotal;
  const totalSet = orderTotal > 0;
  const moneyOutstanding = totalSet ? Math.max(0, orderTotal - collected) : 0;
  const balanceOwing = totalSet && moneyOutstanding > 0;
  // Storage is "incurred" when the operator set a From date, OR the Master import
  // carried a fee (migration 0207, Jess: a Master fee auto-marks incurred → it
  // enters the collect-before-delivery gate).
  const storageIncurred =
    !!(form.control?.storage_from ?? "").trim() ||
    !!form.draft.storage_from.trim() ||
    Number(form.control?.storage_fee_msbf ?? 0) > 0 ||
    Number(form.control?.storage_fee_sof ?? 0) > 0;
  const storageCleared =
    !!form.control?.storage_collected_at ||
    form.control?.storage_waiver_status === "approved";
  const storageOwing = storageIncurred && !storageCleared;
  const storageFee =
    Number(form.control?.storage_fee_msbf ?? 0) +
    Number(form.control?.storage_fee_sof ?? 0);
  // "hold" = red block (ETA−1 uncollected) · "warn" = amber reminder · null = ok.
  const balanceGate = balanceOwing ? (pastLastCall ? "hold" : "warn") : null;
  const storageGate = storageOwing ? (pastLastCall ? "hold" : "warn") : null;
  // Balance panel STATUS pill + status-strip Money cell (batch 2): the ledger
  // Outstanding drives them all, so pill / strip / header sticker never disagree.
  const isOwing = balanceOwing;
  const owingAmt = moneyOutstanding;

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
      {receiveLine && (
        <ReceiveLineModal
          orderId={order.id}
          sku={receiveLine.sku}
          lineQty={receiveLine.qty}
          alreadyReceived={receiveLine.received}
          onClose={() => setReceiveLine(null)}
        />
      )}
      {loanTarget && (
        <LoanSofaModal
          orderId={order.id}
          soRef={soRef}
          itemId={loanTarget.itemId}
          itemSku={loanTarget.sku}
          onClose={() => setLoanTarget(null)}
        />
      )}
      {/* No separate top bar — the ⋮ actions menu + close moved into the Order
          section header next to the status chip (Jess: save a row). Backdrop
          click still closes the drawer. */}
      {/* ═══ STICKY HEADER BAND (batch 1 #2) ═══ A shrink-0 lining-box that never
          scrolls — breadcrumb · pill · #id · sticker · deadline · 3-cell status
          strip · 1–2 stage actions. The body below is the single scroll region.
          Flex SIBLINGS (not position:sticky — sticky breaks inside nested overflow
          parents). Lining-box style: pale surface + hairline border, colour only
          for alerts. */}
      <header className="shrink-0 bg-base-50/80 border-b border-base-200/70 px-5 pt-3 pb-2.5 flex flex-col gap-2.5">
        {/* Row 1 — identity (breadcrumb · pill · #id · items · ref · sticker ·
            deadline) on the left; flag / ⋯ / close on the right. */}
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            {/* Header = status only (Jess 2026-07-11): stage pill · #id · ref ·
                alert stickers. No breadcrumb, no item-count/region (region → the
                Delivery card), no deadline (it drives Stock ETA + on-hold, not the
                header). */}
            {balanceOwing ? (
              // Derived "On hold delivery" (Jess 2026-07-11) — an owing balance
              // holds the delivery; the WHY (amount / due) is on the Balance card.
              <span
                className="pill pill-overdue"
                title="Delivery is on hold until the balance is collected — see the Balance card"
              >
                On hold delivery
              </span>
            ) : (
              <span
                className={`pill ${PIPELINE_PILL[pipelineStatus]}`}
                title={PIPELINE_HINT[pipelineStatus]}
              >
                {pipelineStatus === "ready"
                  ? "Ready to deliver"
                  : PIPELINE_LABEL[pipelineStatus]}
              </span>
            )}
            <span className="font-mono font-semibold text-base-900 border border-base-300 rounded-md px-2 py-0.5 bg-white shrink-0">
              #{order.so}
            </span>
            {order.source_ref?.[0] && (
              <span className="t-small text-base-400 font-mono shrink-0 uppercase">
                Ref {order.source_ref[0]}
              </span>
            )}
            {/* Ordered date moved into the header (Jess 2026-07-11) — compact, off
                the Customer card. */}
            {order.placed_at && (
              <span className="t-tiny text-base-400 shrink-0 whitespace-nowrap">
                · Ordered {fmtDate(order.placed_at)}
              </span>
            )}
            {/* Special sticker — the operator's own "action needed" note as a
                compact amber chip (full text stays in the body banner). This is
                the only real "sticker" signal today; not invented. */}
            {form.draft.action_for_logistic.trim() && (
              <span
                title={form.draft.action_for_logistic}
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-warning/15 text-warning shrink-0 max-w-[170px] truncate"
              >
                <AlertCircle size={10} strokeWidth={2.5} /> Action needed
              </span>
            )}
            {/* (Removed the separate "Outstanding · hold" sticker — the status pill
                now derives to "On hold delivery" when a balance is owed, so this
                would just repeat it. The amount lives on the Balance card.) */}
            {/* Deadline removed from the header (Jess 2026-07-11) — it drives the
                Stock ETA + the on-hold logic, and shows on the Delivery card; not a
                header field. */}
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
              orderId={order.id}
              pipelineStatus={pipelineStatus}
              onServiceNoteClick={onServiceNoteClick}
              onTransferReadyClick={onTransferReadyClick}
              onConfirmProceedClick={onConfirmProceedClick}
              onTopUpClick={onTopUpClick}
              onAbandonClick={onAbandonClick}
              onIssuePOsClick={onIssuePOsClick}
              onDispatchClick={onDispatchClick}
              onDOClick={onDOClick}
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

        {/* Row 2 removed (Jess 2026-07-11) — the STOCK/LOGISTIC/MONEY strip
            duplicated status that now lives in its home: stock → the Items table
            header badge (Ready N/N); money → the Balance card; logistic → the
            stage action below. Header stays clean. */}

      </header>

      {/* ═══ BODY ═══ Header + this action bar STAY (shrink-0); the two columns
          each scroll INDEPENDENTLY (Jess 2026-07-11). The body itself does not
          scroll — it clips, and each column owns its own overflow-y. */}
      <div className="flex-1 min-h-0 px-5 py-3 flex flex-col gap-2.5 overflow-hidden">
        {/* Save bar only — the stage action moved into the Delivery card (Jess
            2026-07-11). This slim row holds just the Save control for edited
            fields (it renders nothing until there are unsaved changes), pinned
            above the scrolling columns. */}
        <div className="flex items-center justify-end gap-3 min-w-0 shrink-0 empty:hidden">
          <OrderControlSaveBar form={form} />
        </div>
        {/* Operator's own free-text note — full text (the header only chips it). */}
        {form.draft.action_for_logistic.trim() && (
          <div className="shrink-0 flex items-start gap-2 rounded-[4px] border border-warning/50 bg-warning/10 px-3 py-2 text-[12px]">
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
        {/* side | main — support cards on the LEFT, items + warehouse on the RIGHT
            (Jess 2026-07-11). Grid AREAS do the flip: "side main" puts the cards
            column (gridArea:side) first and the items column (gridArea:main)
            second — no panel code moves. Cards get a fixed ~300px; items fill. */}
        <div
          className="grid gap-2.5 items-stretch flex-1 min-h-0 overflow-hidden"
          style={{
            gridTemplateColumns: "300px minmax(0, 1fr)",
            gridTemplateAreas: '"side main"',
          }}
        >

        {/* LEFT column — the two locked listing panels: Items ordered (fixed
            scroll table, ≤8 rows) on top · Warehouse stock (the reserve grid,
            grows to fill so the column bottom lines up with the right side). */}
        <div
          style={{ gridArea: "main" }}
          className="flex flex-col gap-2.5 min-w-0 min-h-0 overflow-y-auto no-scrollbar pr-0.5"
        >
          {/* Panel 1 — Items ordered. Header badge = readiness (No PO / Waiting /
              Ready), counted over the goods lines. Dark-slate pinned header;
              only the rows scroll (up to ~8, then inside the box). */}
          <Panel
            title="Items ordered"
            summary={
              <ReadinessBadge
                nopo={nopoN}
                waiting={waitingN}
                ready={readyN}
                total={goodsLines.length}
              />
            }
            actions={
              <PanelMenu
                items={[
                  {
                    label: recheckStock.isPending
                      ? "Rechecking…"
                      : "Recheck stock",
                    icon: <RotateCcw size={14} />,
                    disabled: recheckStock.isPending,
                    onClick: () =>
                      recheckStock.mutate(undefined, {
                        onSuccess: () => toast.success("Stock rechecked"),
                        onError: (e) => toast.error(e.message),
                      }),
                  },
                  {
                    label: "Export items (CSV)",
                    icon: <Download size={14} />,
                    onClick: () => downloadOrderCsv(order, lines),
                  },
                ]}
              />
            }
          >
            <div className="overflow-auto min-h-0" style={{ maxHeight: 268 }}>
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10">
                  {/* Order (Jess 2026-07-11): Status · Stock ETA · Item · Qty · PO ·
                      Route. GRN (received count + book-in) folds INTO the Status
                      cell — no separate Recv column. */}
                  <tr className="bg-[#F1EDE6] text-[#8C877D]">
                    <th
                      className="text-left text-[10px] uppercase tracking-[0.04em] font-semibold px-2 py-1.5 w-28 border-r border-[#E5E1D8]"
                      title="Waiting / Ready / No PO. The count = received / ordered — click to book in received units (GRN)."
                    >
                      Status
                    </th>
                    <th className="text-left text-[10px] uppercase tracking-[0.04em] font-semibold px-2 py-1.5 w-24 border-r border-[#E5E1D8]">
                      Stock ETA
                    </th>
                    <th className="text-left text-[10px] uppercase tracking-[0.04em] font-semibold px-2 py-1.5 border-r border-[#E5E1D8]">
                      Item
                    </th>
                    <th className="text-right text-[10px] uppercase tracking-[0.04em] font-semibold px-2 py-1.5 w-10 border-r border-[#E5E1D8]">
                      Qty
                    </th>
                    <th className="text-left text-[10px] uppercase tracking-[0.04em] font-semibold px-2 py-1.5 w-24 border-r border-[#E5E1D8]">
                      PO
                    </th>
                    <th
                      className="text-left text-[10px] uppercase tracking-[0.04em] font-semibold px-2 py-1.5 w-32"
                      title="Where this item is received / where it routes to (the transfer destination). Per-item legs come with the transfer feature."
                    >
                      Route
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orderedLines.map((l) => {
                    const isService = lineKind(l.sku) === "service";
                    // Accessories (pillow / M.P / protector) come from the Klang
                    // warehouse — no PO, no Stock ETA, no receive step (Jess).
                    const isAcc = lineKind(l.sku) === "acc";
                    // Per-item Stock Status (Jess sheet col Z): Received (stock in) ·
                    // Pending (PO placed, waiting — show Stock ETA) · No PO (nothing
                    // raised). Derived from same-model+size free stock + PO existence.
                    const rd = isService ? null : readinessOf(l.sku, l.qty);
                    const isStatusOverride =
                      form.draft.line_stock_status[l.sku] !== undefined;
                    // PO number for the PO column — the AutoCount source_po
                    // (real PO like "PO/2603-065") wins; else a portal PO id.
                    const poNo =
                      soPoBySku.get(normalizeSkuKey(l.sku)) ??
                      pos
                        .find((p) =>
                          p.lines.some(
                            (pl) =>
                              normalizeSkuKey(pl.sku) === normalizeSkuKey(l.sku),
                          ),
                        )
                        ?.id.slice(0, 8);
                    // Per-item stock location (migration 0168) — overridable default.
                    const savedLoc = form.draft.line_locations[l.sku];
                    const locValue =
                      savedLoc !== undefined
                        ? (savedLoc[0] ?? "")
                        : (defaultLineLocation(l.sku, assignedLogisticName) ?? "");
                    // Per-item Stock ETA (migration 0170) — when the item's stock
                    // arrives; defaults to the linked PO's date, overridable.
                    const etaValue =
                      form.draft.line_etas[l.sku] ?? poEtaBySku.get(l.sku) ?? "";
                    // Route "Option D" legs — derived from location + carrier +
                    // readiness (real per-leg authoring lands with the migration).
                    const routeLegs = isService
                      ? []
                      : deriveRouteLegs({
                          location: locValue,
                          carrier: assignedLogisticName,
                          readiness: rd ?? "ready",
                        });
                    const routeOpen = routeOpenSku === l.sku;
                    // One row per SKU (duplicate lines combined above) → key on SKU.
                    return (
                      <Fragment key={l.sku}>
                      <tr
                        onClick={() => setPickerSku(l.sku)}
                        className={`cursor-pointer ${l.sku === activeLineSku ? "bg-primary/10" : "hover:bg-base-50"}`}
                      >
                        {/* Status (+ GRN folded in) — for a PO item the received
                            count / book-in button sits next to the status pill, so
                            there's no separate Recv column (Jess 2026-07-11). */}
                        <td className="border border-base-200 px-1.5 py-1 align-top">
                          {isService || !rd ? (
                            <span className="text-base-300 text-[11px]">—</span>
                          ) : isAcc ? (
                            <span
                              title="Accessory — always in the Klang warehouse; deducted from ready stock"
                              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#166534] whitespace-nowrap"
                            >
                              Ready
                            </span>
                          ) : (
                            <div className="flex items-center gap-1 flex-wrap">
                              <StockStatusCell
                                sku={l.sku}
                                status={rd}
                                isOverride={isStatusOverride}
                                onSet={(s) => form.setLineStockStatus(l.sku, s)}
                                onPick={() => setPickerSku(l.sku)}
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReceiveLine({
                                    sku: l.sku,
                                    qty: l.qty,
                                    received: lineReceivedOf(l.sku),
                                  });
                                }}
                                title="Book in received units (GRN)"
                                className={`inline-flex items-center gap-0.5 text-[11px] tabular-nums px-1 py-0.5 rounded ${
                                  lineReceivedOf(l.sku) >= l.qty
                                    ? "text-success font-semibold"
                                    : "text-primary hover:bg-primary/10"
                                }`}
                              >
                                {lineReceivedOf(l.sku)}/{l.qty}
                                {lineReceivedOf(l.sku) < l.qty && (
                                  <PackagePlus size={11} strokeWidth={2} />
                                )}
                              </button>
                            </div>
                          )}
                        </td>
                        {/* Stock ETA */}
                        {isService || isAcc ? (
                          <td className="border border-base-200 px-2 py-1 text-[11px] text-base-400 align-top">
                            {isAcc ? "—" : "N/A"}
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
                        {/* Item */}
                        <td className="border border-base-200 px-2 py-1 align-top">
                          <div
                            className="font-mono text-[10px] leading-tight break-words"
                            title={l.sku}
                          >
                            {l.sku}
                          </div>
                        </td>
                        {/* Qty */}
                        <td className="border border-base-200 px-2 py-1 text-right text-[12px] tabular-nums align-top">
                          {l.qty}
                        </td>
                        {/* PO */}
                        <td className="border border-base-200 px-2 py-1 font-mono text-[10px] align-middle">
                          {poNo ? (
                            <span className="text-primary">{poNo}</span>
                          ) : (
                            <span className="text-base-300">—</span>
                          )}
                        </td>
                        {/* Route — Option D journey bar: icons = places, colour =
                            progress. Click expands the legs in-place (below). */}
                        {isService ? (
                          <td className="border border-base-200 px-2 py-1 text-[11px] text-base-400 align-top">
                            N/A
                          </td>
                        ) : (
                          <td className="border border-base-200 px-1 py-0.5 align-middle">
                            {isSpecialRoute(routeLegs) ? (
                              <RouteJourneyBar
                                legs={routeLegs}
                                open={routeOpen}
                                onClick={() =>
                                  setRouteOpenSku((cur) =>
                                    cur === l.sku ? null : l.sku,
                                  )
                                }
                              />
                            ) : (
                              <RouteQuietButton
                                label={locValue || "Carres Klang"}
                                open={routeOpen}
                                onClick={() =>
                                  setRouteOpenSku((cur) =>
                                    cur === l.sku ? null : l.sku,
                                  )
                                }
                              />
                            )}
                          </td>
                        )}
                      </tr>
                      {!isService && routeOpen && (
                        <tr className="bg-base-50">
                          <td
                            colSpan={6}
                            className="border border-base-200 px-3 py-2"
                          >
                            <div className="space-y-2">
                              <RouteLegList legs={routeLegs} />
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] uppercase tracking-[0.04em] font-semibold text-[#8C877D]">
                                  Current location
                                </span>
                                <select
                                  value={locValue}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    form.setLineLocation(
                                      l.sku,
                                      e.target.value ? [e.target.value] : [],
                                    )
                                  }
                                  className="border border-base-300 rounded-[3px] bg-white px-1.5 py-0.5 text-[11px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                                >
                                  <option value="">—</option>
                                  {STOCK_LOCATIONS.map((locOpt) => (
                                    <option key={locOpt} value={locOpt}>
                                      {locOpt}
                                    </option>
                                  ))}
                                </select>
                                <span className="text-[10px] text-base-400 ml-auto">
                                  Per-leg carrier + Add leg — with the transfer
                                  update
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Panel footer (doesn't scroll): linked POs (GRN) + warehouse remark. */}
            <div className="border-t border-base-100 px-3 py-2 space-y-2 shrink-0">
              {pos.length > 0 && (
                <div>
                  <div className="label mb-1">Linked POs</div>
                  <div className="border border-base-100 rounded-[6px]">
                    {pos.map((po, i) => (
                      <PoRow key={po.id} po={po} divider={i > 0} onReceive={setReceivePo} />
                    ))}
                  </div>
                </div>
              )}
              <FieldGrid>
                <RemarkControlField
                  form={form}
                  field="warehouse_remark"
                  label="Warehouse remark"
                  placeholder="Note for the warehouse team"
                />
              </FieldGrid>
            </div>
          </Panel>

          {/* Panel 2 — Warehouse stock. StockPickerGrid owns its own dark-slate
              pinned header + funnel filters + Reserve, styled as a 12px card; it
              GROWS to fill the leftover left-column height so the column bottom
              lines up with the right side and the page stays one-screen (P1a had
              capped it to a fixed 340px, which left a big void below). No active
              line → a placeholder that also grows. */}
          {activeLineSku && stage !== "delivered" ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <StockPickerGrid
                sku={activeLineSku}
                soRef={soRef}
                need={orderedLines.find((l) => l.sku === activeLineSku)?.qty ?? 1}
                units={freeUnits}
                isSofa={lineCategory(activeLineSku) === "sofa"}
                onReserved={() => {
                  void qc.invalidateQueries({ queryKey: qk.operation.order(order.id) });
                  void qc.invalidateQueries({ queryKey: ["operation", "ops-stock"] });
                }}
                onLoan={(itemId, itemSku) =>
                  setLoanTarget({ itemId, sku: itemSku })
                }
                actions={warehouseMenu}
              />
            </div>
          ) : (
            <Panel
              title="Warehouse stock"
              grow
              summary={<MiniBadge tone="muted">—</MiniBadge>}
              actions={warehouseMenu}
            >
              <div className="flex-1 grid place-items-center t-tiny text-base-400 p-6">
                {stage === "delivered"
                  ? "Delivered — stock settled."
                  : "Pick an item above to see its warehouse stock."}
              </div>
            </Panel>
          )}
        </div>

        {/* LEFT column (after the flip) — the support cards: Customer · Balance ·
            Storage (conditional) · Delivery. Scrolls INDEPENDENTLY of the items
            column on the right (Jess 2026-07-11). */}
        <div
          style={{ gridArea: "side" }}
          className="flex flex-col gap-2.5 min-w-0 min-h-0 overflow-y-auto no-scrollbar"
        >
          {/* 1. Customer — a quiet identity card (name / phone / address, with an
              inline Edit on a Place order). No region pill (Jess 2026-07-11): the
              region is a DELIVERY attribute (it shows on the Delivery card), not
              customer identity. */}
          <Panel
            title="Customer"
            actions={
              <PanelMenu
                items={[
                  ...(order.status === "place"
                    ? [
                        {
                          label: "Edit details",
                          icon: <Pencil size={14} />,
                          onClick: () => customerEditRef.current?.(),
                        },
                      ]
                    : []),
                  {
                    label: "Copy address",
                    icon: <Copy size={14} />,
                    disabled: !order.customer_address,
                    onClick: () => {
                      void navigator.clipboard.writeText(
                        order.customer_address ?? "",
                      );
                      toast.success("Address copied");
                    },
                  },
                  {
                    label: "Copy phone",
                    icon: <Copy size={14} />,
                    disabled: !order.customer_phone,
                    onClick: () => {
                      void navigator.clipboard.writeText(
                        order.customer_phone ?? "",
                      );
                      toast.success("Phone copied");
                    },
                  },
                  {
                    label: "WhatsApp customer",
                    icon: <Phone size={14} />,
                    disabled: !order.customer_phone,
                    onClick: () => {
                      const wa = waLink(order.customer_phone);
                      if (wa) window.open(wa, "_blank", "noopener");
                    },
                  },
                ]}
              />
            }
          >
            <div className="p-3">
              <OrderCustomerCard order={order} startEditRef={customerEditRef} />
            </div>
          </Panel>

          {/* 2. Balance — its OWN card (Jess: split from Storage). Header summary is
              a STATUS PILL, not a sentence (Jess 2026-07-08): the owing AMOUNT when
              money is due — red if the delivery gate is HOLD, amber if it's a WARN,
              neutral otherwise — else Settled / No balance. Operation shows only the
              OUTSTANDING owed (no Bill/Total). */}
          <Panel
            title="Balance"
            actions={
              <PanelMenu
                items={[
                  {
                    label: "Copy outstanding",
                    icon: <Copy size={14} />,
                    disabled: !isOwing,
                    onClick: () => {
                      void navigator.clipboard.writeText(RM(moneyOutstanding));
                      toast.success("Outstanding copied");
                    },
                  },
                ]}
              />
            }
            summary={
              isOwing ? (
                <span
                  title={
                    balanceGate === "hold"
                      ? "Delivery on hold — collect before dispatch"
                      : balanceGate === "warn"
                        ? "Collect before delivery"
                        : "Outstanding balance"
                  }
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    balanceGate === "hold"
                      ? "bg-[#FEE2E2] text-[#991B1B]"
                      : balanceGate === "warn"
                        ? "bg-[#FEF3C7] text-[#92400E]"
                        : "bg-base-100 text-base-700"
                  }`}
                >
                  {balanceGate === "hold" && (
                    <AlertCircle size={10} strokeWidth={2.5} />
                  )}
                  {RM(owingAmt)} owing
                </span>
              ) : totalSet ? (
                <MiniBadge tone="ready">Settled</MiniBadge>
              ) : (
                <MiniBadge tone="muted">No balance</MiniBadge>
              )
            }
          >
            <div className="p-3">
              {balanceOwing && collectByLabel && (
                <div
                  className={`mb-2 flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11.5px] ${
                    balanceGate === "hold"
                      ? "bg-[#FEE2E2] text-[#991B1B]"
                      : balanceGate === "warn"
                        ? "bg-[#FEF3C7] text-[#92400E]"
                        : "bg-base-50 text-base-500"
                  }`}
                >
                  <span>Collect by {collectByLabel}</span>
                  <span className="font-medium whitespace-nowrap">
                    last call {lastCallLabel}
                  </span>
                </div>
              )}
              <MoneyCard
                orderId={order.id}
                form={form}
                hasLineTotal={hasLineTotal}
                orderTotal={orderTotal}
                totalSet={totalSet}
                collected={collected}
                outstanding={moneyOutstanding}
                ledger={ledger}
                receiptMeta={{
                  orderCode: `SO-${order.so}`,
                  customerName: order.customer_name ?? "",
                }}
              />
            </div>
          </Panel>

          {/* 3. Storage — its OWN card (Jess: split from Balance). Header summary is
              a STATUS PILL, not a sentence (Jess 2026-07-08): the fee amount when a
              fee is running (red if the delivery gate is HOLD, amber if WARN, neutral
              otherwise) — else "fee if held". Only shows when a storable category is
              on the order. */}
          {(hasMsbf || hasSof) && (
            <Panel
              title="Storage"
              summary={
                storageOwing ? (
                  <span
                    title={
                      storageGate === "hold"
                        ? "Delivery on hold — clear storage before dispatch"
                        : storageGate === "warn"
                          ? "Collect storage before delivery"
                          : "Storage fee running"
                    }
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      storageGate === "hold"
                        ? "bg-[#FEE2E2] text-[#991B1B]"
                        : storageGate === "warn"
                          ? "bg-[#FEF3C7] text-[#92400E]"
                          : "bg-base-100 text-base-700"
                    }`}
                  >
                    {storageGate === "hold" && (
                      <AlertCircle size={10} strokeWidth={2.5} />
                    )}
                    {storageFee > 0 ? `${RM(storageFee)} fee` : "fee due"}
                  </span>
                ) : (
                  <MiniBadge tone="muted">fee if held</MiniBadge>
                )
              }
            >
              <div className="p-3 space-y-2">
                {/* Per-day rate FRAME (batch 2 placeholder, Jess 2026-07-09): the
                    new by-day rates. The actual per-day accrual (delivery window +
                    public-holiday aware) is deferred — this only states the rates
                    so the block reads right; the fee below still uses the existing
                    calc until the by-day logic lands. */}
                <div className="rounded-[8px] border border-base-200/70 bg-base-50 px-2.5 py-1.5 text-[11px] text-base-500 flex items-center justify-between gap-2">
                  <span>
                    Rate · mattress{" "}
                    <span className="font-mono text-base-700">RM5</span>/day · sofa{" "}
                    <span className="font-mono text-base-700">RM14.30</span>/day
                  </span>
                  <span className="text-base-400 italic">by-day calc coming</span>
                </div>
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
              </div>
            </Panel>
          )}

          {/* On loan (migration 0209) — active loaner sofas out against this order;
              collected back (swap) at the real delivery. Only when a loan is live. */}
          {activeLoans.length > 0 && (
            <Panel
              title="On loan"
              summary={<MiniBadge tone="waiting">{activeLoans.length} out</MiniBadge>}
            >
              <div className="p-3 space-y-2">
                {activeLoans.map((loan) => (
                  <div
                    key={loan.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-base-100 bg-base-50 px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <div
                        className="text-[12px] font-medium truncate"
                        title={loan.item_sku ?? ""}
                      >
                        {loan.item_sku ?? "Sofa"}
                      </div>
                      <div className="text-[10px] text-base-500">
                        {loan.item_condition ?? "—"}
                        {loan.do_number ? ` · DO ${loan.do_number}` : ""} · loaned{" "}
                        {fmtDate(loan.loaned_at.slice(0, 10))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        returnLoan.mutate(
                          { loanId: loan.id },
                          {
                            onSuccess: () =>
                              toast.success("Loaner collected — back in stock"),
                            onError: (e) =>
                              toast.error(`Couldn't return — ${e.message}`),
                          },
                        )
                      }
                      disabled={returnLoan.isPending}
                      title="Collect the loaner at delivery — it returns to free stock"
                      className="btn-secondary text-[11px] whitespace-nowrap shrink-0"
                    >
                      Collect (swap)
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Card B — Delivery. Header badge = region. Body split Original |
              Logistic update; then the 2 remark rows; then a Route section only
              for a cross-border / multi-leg order. (Natural height now — the
              Activity card below carries `grow` to fill the column bottom.) */}
          <Panel
            title="Delivery"
            actions={
              <PanelMenu
                items={[
                  {
                    label: "Copy address",
                    icon: <Copy size={14} />,
                    disabled: !order.customer_address,
                    onClick: () => {
                      void navigator.clipboard.writeText(
                        order.customer_address ?? "",
                      );
                      toast.success("Address copied");
                    },
                  },
                ]}
              />
            }
            summary={
              assignedLogisticName ? (
                // Assigned → show the carrier (green = handled).
                <MiniBadge tone="kv">{assignedLogisticName}</MiniBadge>
              ) : pipelineStatus === "ready" ? (
                // Ready but no carrier → the ALERT lives on the header (Jess
                // 2026-07-11): amber, no sentence row. Assign via the picker below.
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] whitespace-nowrap">
                  <AlertCircle size={10} strokeWidth={2.5} /> Assign logistic
                </span>
              ) : loc.area === "Outstation" ? (
                <MiniBadge tone="outstation">Outstation</MiniBadge>
              ) : (
                <MiniBadge tone="muted">{loc.label ?? "Area —"}</MiniBadge>
              )
            }
          >
            <div className="p-3 min-h-0 overflow-auto space-y-2 flex-1">
              {/* No sentence row (Jess 2026-07-11) — the header pill signals the
                  state (⚑ Assign logistic / carrier name); the carrier picker below
                  IS the assign action. Stage actions (Issue PO / Confirm delivery)
                  live in the header ⋮ menu. */}
              {/* Original (what operation sets) | Logistic update (what the
                  carrier commits back). */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-0 items-start">
                <div className="min-w-0">
                  <FieldGrid>
                    <RoutingFields
                      orderId={order.id}
                      customerAddress={order.customer_address ?? null}
                      deliveryDate={order.delivery_date}
                      proceedDate={order.proceed_date ?? null}
                      opsAssignedLogistic={order.ops_assigned_logistic ?? null}
                      form={form}
                      hideRegion
                    />
                  </FieldGrid>
                </div>
                <div className="min-w-0">
                  <div className="t-micro text-base-400 mb-1">Logistic update</div>
                  <FieldGrid>
                    <LogisticEtaField form={form} />
                    <DeliveryTimeSlotField form={form} />
                  </FieldGrid>
                  {/* Call-by — reach the customer BEFORE the deadline to confirm
                      stock + timing; a daily cron drops the task on this date. The
                      lead-days stepper is the quiet knob; the DATE is the headline. */}
                  {contactByLabel && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md bg-info-soft/50 px-2 py-1">
                      <span className="flex items-center gap-1 text-[11.5px] font-medium text-info min-w-0">
                        <Phone size={12} strokeWidth={2.25} className="shrink-0" />
                        <span className="truncate">Call customer by {contactByLabel}</span>
                      </span>
                      <span className="flex items-center gap-0.5 text-[11px] text-info/70 whitespace-nowrap shrink-0">
                        <span>−</span>
                        <input
                          type="number"
                          min={0}
                          max={60}
                          value={form.draft.contact_by_days}
                          onChange={(e) => form.set("contact_by_days", e.target.value)}
                          placeholder="3"
                          aria-label="Call-by lead days before the deadline"
                          title="Days before the deadline to call the customer"
                          className="w-8 rounded border border-base-200 bg-white px-1 py-0.5 text-[11px] text-center outline-none focus:border-primary"
                        />
                        <span>d</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {/* 2 remark rows (span full width). The old single-field
                  "Carrier's remark" (carres_remark) was REMOVED (Jess 2026-07-11,
                  Option 1): all hand-written follow-up now lives in ONE place —
                  the Activity & notes timeline card below — which stacks entries
                  with who + when + history instead of overwriting one box.
                  customer_request + action_for_logistic keep their own semantics
                  (a customer ask / a standing instruction, not follow-up chatter). */}
              <div className="border-t border-base-100 pt-2">
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
                </FieldGrid>
              </div>
              {/* Carriers / route — always available now (Jess: an order can have
                  MORE than one carrier). A single trip shows the assigned carrier +
                  "Add leg"; adding a leg = adding a second carrier (multi-leg rows).
                  fallbackPartnerId prefers the Logistic select so the single-trip
                  read-out reflects the carrier picked above. */}
              <div className="border-t border-base-100 pt-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="t-micro text-base-400">Carriers / route</span>
                  <MiniBadge tone="muted">
                    {order.delivery_stops?.length
                      ? `${order.delivery_stops.length} legs`
                      : "single trip"}
                  </MiniBadge>
                </div>
                <DeliveryChain
                  orderId={order.id}
                  stops={order.delivery_stops ?? null}
                  fallbackPartnerId={
                    order.ops_assigned_logistic ?? order.delivery_partner_id
                  }
                />
              </div>
            </div>
          </Panel>

          {/* Card C — Activity & notes (Jess 2026-07-11, Option 1). THE single
              place for all hand-written follow-up on this order: the compose box
              lives here, so a note auto-attaches to THIS order (no order-picker),
              and every entry stacks with author + timestamp + tag — replacing the
              old overwrite-one-box "Carrier's remark". Also merges the system
              activity (imports, stock moves) so a new joiner reads the whole
              in-flight order at a glance. Carries `grow` to fill the column;
              scrolls its own body. Reuses the already-live AnnotationTimeline. */}
          <Panel title="Activity & notes" grow>
            <div className="p-3 overflow-auto min-h-0">
              <AnnotationTimeline orderId={order.id} />
            </div>
          </Panel>
        </div>{/* /right column */}
        </div>{/* /main|side grid */}
      </div>{/* /scroll body */}
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

/** GRN "Book in" stepper (migration 0208) — receive n units of one order line
 *  into stock (reserved to the SO), WITHOUT a portal PO. Fully-received lines
 *  auto-flip to Ready. */
function ReceiveLineModal({
  orderId,
  sku,
  lineQty,
  alreadyReceived,
  onClose,
}: {
  orderId: string;
  sku: string;
  lineQty: number;
  alreadyReceived: number;
  onClose: () => void;
}) {
  const remaining = Math.max(0, lineQty - alreadyReceived);
  const [qty, setQty] = useState(String(remaining || 1));
  const [condition, setCondition] = useState<"new" | "exhibition" | "old">("new");
  const [location, setLocation] = useState("");
  const [doNumber, setDoNumber] = useState("");
  const receive = useReceiveLine(orderId);
  const n = Number(qty);
  const valid = Number.isFinite(n) && n >= 1 && n <= 999;
  const field =
    "mt-0.5 w-full px-2 py-1.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-primary";

  function submit() {
    if (!valid) return;
    receive.mutate(
      {
        sku,
        qty: n,
        condition,
        location: location.trim() || undefined,
        doNumber: doNumber.trim() || undefined,
      },
      {
        onSuccess: (r) => {
          toast.success(
            `Booked ${r.received} unit(s) — ${r.lineReceived}/${r.lineQty}${r.ready ? " · Ready" : ""}`,
          );
          onClose();
        },
        onError: (e) => toast.error(`Couldn't book — ${e.message}`),
      },
    );
  }

  return (
    <Modal title="Book in received stock" onClose={onClose}>
      <div className="space-y-3">
        <div className="text-[12px] text-base-600">
          <span className="font-mono text-[11px]">{sku}</span>
          <span className="ml-2 text-base-400">
            received {alreadyReceived}/{lineQty}
          </span>
        </div>
        <label className="block">
          <span className="t-tiny text-base-500">Arrived now (units)</span>
          <input
            type="number"
            min={1}
            max={remaining || 999}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={field}
          />
          {remaining > 0 && (
            <span className="t-tiny text-base-400">remaining {remaining}</span>
          )}
        </label>
        <label className="block">
          <span className="t-tiny text-base-500">Condition</span>
          <select
            value={condition}
            onChange={(e) =>
              setCondition(e.target.value as "new" | "exhibition" | "old")
            }
            className={field}
          >
            <option value="new">New</option>
            <option value="exhibition">Exhibition</option>
            <option value="old">Old</option>
          </select>
        </label>
        <label className="block">
          <span className="t-tiny text-base-500">Location (optional)</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Carres Klang"
            className={field}
          />
        </label>
        <label className="block">
          <span className="t-tiny text-base-500">DO / receipt # (optional)</span>
          <input
            value={doNumber}
            onChange={(e) => setDoNumber(e.target.value)}
            placeholder="e.g. RF2607"
            className={field}
          />
        </label>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={receive.isPending}
            className="btn-ghost text-[12px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || receive.isPending}
            className="btn-primary text-[12px] disabled:opacity-40"
          >
            {receive.isPending ? "Booking…" : "Book in"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Loan-a-sofa DO prompt (migration 0209) — issue the loan DO + mark the picked
 *  free sofa on-loan to the order. The real sofa line stays Waiting. */
function LoanSofaModal({
  orderId,
  soRef,
  itemId,
  itemSku,
  onClose,
}: {
  orderId: string;
  soRef: string;
  itemId: string;
  itemSku: string;
  onClose: () => void;
}) {
  const [doNumber, setDoNumber] = useState("");
  const [notes, setNotes] = useState("");
  const loan = useLoanSofa(orderId);
  const field =
    "mt-0.5 w-full px-2 py-1.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-primary";

  function submit() {
    loan.mutate(
      {
        itemId,
        doNumber: doNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(
            `Loaned to ${soRef}${doNumber.trim() ? ` · DO ${doNumber.trim()}` : ""}`,
          );
          onClose();
        },
        onError: (e) => toast.error(`Couldn't loan — ${e.message}`),
      },
    );
  }

  return (
    <Modal title="Loan this sofa" onClose={onClose}>
      <div className="space-y-3">
        <div className="text-[12px] text-base-600">
          <span className="font-mono text-[11px]">{itemSku}</span>
          <span className="ml-2 text-base-400">→ {soRef} · FREE loaner</span>
        </div>
        <p className="t-tiny text-base-500">
          The sofa is marked on-loan; the real sofa line stays Waiting. Collect it
          back (swap) at the real delivery.
        </p>
        <label className="block">
          <span className="t-tiny text-base-500">Loan DO # (optional)</span>
          <input
            value={doNumber}
            onChange={(e) => setDoNumber(e.target.value)}
            placeholder="e.g. DO-5321"
            className={field}
          />
        </label>
        <label className="block">
          <span className="t-tiny text-base-500">Note (optional)</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. customer moving in this week"
            className={field}
          />
        </label>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={loan.isPending}
            className="btn-ghost text-[12px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loan.isPending}
            className="btn-primary text-[12px] disabled:opacity-40"
          >
            {loan.isPending ? "Loaning…" : "Loan sofa"}
          </button>
        </div>
      </div>
    </Modal>
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
  startEditRef,
}: {
  order: {
    id: string;
    status: string;
    customer_name: string | null;
    customer_phone: string | null;
    customer_address: string | null;
    placed_at?: string | null;
  };
  /** Lets an outside control (the panel ⋮) open this card's safe-edit mode. */
  startEditRef?: MutableRefObject<(() => void) | null>;
}) {
  const qc = useQueryClient();
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

  // Expose `start` to the panel ⋮ (Edit details) — kept current each render.
  useEffect(() => {
    if (startEditRef) startEditRef.current = start;
  });

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
      {/* Edit moved to the panel ⋮ (Jess 2026-07-11 — every panel's actions live in
          its header ⋮; the redundant inline button is gone). Read-only by default;
          the ⋮ "Edit details" opens the safe Save / Cancel mode. */}
    </div>
  );
}

/**
 * Build a wa.me link from a MY customer phone (weak-English staff want one tap to
 * message the customer). Takes the FIRST number if the field lists several
 * ("014-… | 012-…"), strips non-digits, and normalises a local `0…` to `60…`.
 */
export function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const first = phone.split(/[|,/]/)[0] ?? "";
  let d = first.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("60")) {
    /* already international */
  } else if (d.startsWith("0")) {
    d = `60${d.slice(1)}`;
  } else {
    d = `60${d}`;
  }
  return `https://wa.me/${d}`;
}

/** Compact label-left / value-right read row (Jess: match the clean mockup). */
function CompactField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px] border-b border-base-100/70 last:border-b-0">
      <span className="text-[11px] text-base-400 shrink-0">{label}</span>
      <span className="min-w-0 text-right text-base-900">{children}</span>
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

// ─── Money card (batch 2, Jess 2026-07-09) ───────────────────────────────────
// The clean replacement for the old 5-field Balance mess. Three locked rows
// (Total / Collected / Outstanding), a per-payment history list, and a 3-field
// Record-payment form — all wired to the existing order_payments ledger + hooks
// (useOrderPayments/useRecordPayment/useVoidPayment) and the existing receipt PDF
// (renderReceiptPdf). Lining-box; colour only for Outstanding (red) / Collected
// (green). Total store = ops_order_control.balance (path 1, no migration).

/** Render + open a receipt PDF for one ledger entry (reuses the shared
 *  renderReceiptPdf; receipt_no format R{so}-{n} until the PAY-/RCP- renumber). */
async function openReceipt(
  row: OrderPaymentRow,
  meta: { orderCode: string; customerName: string },
) {
  try {
    const blob = await renderReceiptPdf({
      receipt_no: row.receipt_no ?? row.id.slice(0, 8),
      issue_date: row.paid_on,
      order_code: meta.orderCode,
      customer: { name: meta.customerName },
      amount: Number(row.amount),
      method: row.method,
      kind: row.kind,
      reference: row.reference,
      note: row.note,
      currency: "MYR",
    });
    window.open(URL.createObjectURL(blob), "_blank");
  } catch (e) {
    toast.error(`Couldn't open receipt — ${(e as Error).message}`);
  }
}

/** One row of the Total / Collected / Outstanding stack. */
function MoneyRow({
  label,
  children,
  strong,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 ${strong ? "py-2" : "py-1.5"}`}
    >
      <span className="t-micro text-base-400">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

/** The 3-field Record-payment form (amount + date + note only, Jess: the whole
 *  point — split the free-text mess into clean typed inputs). method='cash' /
 *  kind='payment' are applied by the caller. */
function RecordPaymentForm({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: { amount: number; paidOn: string; note: string | null }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const amt = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(amt) && amt > 0 && !pending;
  const cell =
    "w-full px-2 py-1.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700";
  return (
    <div className="rounded-[8px] border border-base-200/70 bg-base-50 p-2 space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (RM)"
          aria-label="Payment amount"
          className={cell}
        />
        <input
          type="date"
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
          aria-label="Payment date"
          className={cell}
        />
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (e.g. Deposit · 2nd payment · final)"
        aria-label="Payment note"
        className={cell}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!valid}
          onClick={() =>
            onSubmit({ amount: amt, paidOn, note: note.trim() || null })
          }
          className="btn-hero text-[12px] disabled:opacity-50"
        >
          {pending ? "Recording…" : "Record payment"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] text-base-500 hover:text-base-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function MoneyCard({
  orderId,
  form,
  hasLineTotal,
  orderTotal,
  totalSet,
  collected,
  outstanding,
  ledger,
  receiptMeta,
}: {
  orderId: string;
  form: ReturnType<typeof useOrderControlForm>;
  hasLineTotal: boolean;
  orderTotal: number;
  totalSet: boolean;
  collected: number;
  outstanding: number;
  ledger: OrderPaymentRow[];
  receiptMeta: { orderCode: string; customerName: string };
}) {
  const role = useAuth((s) => s.role);
  const isPrincipal = role === "principal";
  const [adding, setAdding] = useState(false);
  const record = useRecordPayment(orderId, {
    onError: (e) => toast.error(`Couldn't record payment — ${e.message}`),
  });
  const voidPay = useVoidPayment(orderId, {
    onError: (e) => toast.error(`Couldn't void — ${e.message}`),
  });

  return (
    <div className="space-y-2.5">
      {/* Three locked rows — Total / Collected / Outstanding. */}
      <div className="rounded-[8px] border border-base-200/70 bg-white divide-y divide-base-100">
        <MoneyRow label="Total">
          {hasLineTotal ? (
            <span
              className="font-mono text-[13px] text-base-800"
              title="Summed from the order items"
            >
              {RM(orderTotal)}
            </span>
          ) : (
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.draft.balance}
              onChange={(e) => form.set("balance", e.target.value)}
              placeholder="Set total (RM)"
              aria-label="Order total"
              className="w-32 text-right font-mono text-[13px] px-1.5 py-0.5 border border-base-200 rounded bg-white outline-none focus:border-base-700"
            />
          )}
        </MoneyRow>
        <MoneyRow label="Collected">
          <span className="font-mono text-[13px] font-semibold text-success">
            {RM(collected)}
          </span>
        </MoneyRow>
        <MoneyRow label="Outstanding" strong>
          {totalSet ? (
            <span
              className={`font-mono text-[17px] font-bold leading-none ${
                outstanding > 0 ? "text-[#991B1B]" : "text-success"
              }`}
            >
              {outstanding > 0 ? RM(outstanding) : "Settled"}
            </span>
          ) : (
            <span className="text-[11px] text-base-400">Total not set</span>
          )}
        </MoneyRow>
      </div>

      {/* Payment history — one line per payment: label · date · amount · receipt. */}
      {ledger.length === 0 ? (
        <div className="text-[11px] text-base-400">No payments recorded yet.</div>
      ) : (
        <div className="space-y-1">
          {ledger.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 text-[12px] border-b border-base-100 pb-1 last:border-b-0"
            >
              <span className="min-w-0 truncate">
                <span className="font-medium text-base-800">
                  {p.note?.trim() || (p.kind === "deposit" ? "Deposit" : "Payment")}
                </span>
                <span className="text-base-400"> · {fmtDate(p.paid_on)}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="font-mono font-semibold text-success">
                  {RM(Number(p.amount))}
                </span>
                <button
                  type="button"
                  onClick={() => void openReceipt(p, receiptMeta)}
                  title={`Receipt ${p.receipt_no ?? ""}`}
                  aria-label={`Receipt ${p.receipt_no ?? p.id}`}
                  className="text-base-400 hover:text-primary"
                >
                  <FileText size={13} />
                </button>
                {isPrincipal && (
                  <button
                    type="button"
                    onClick={() => voidPay.mutate(p.id)}
                    disabled={voidPay.isPending}
                    title="Void this payment"
                    aria-label={`Void payment ${p.receipt_no ?? p.id}`}
                    className="text-[10px] text-base-300 hover:text-destructive"
                  >
                    void
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Record payment — the ONE flame CTA (Jess). Opens the 3-field form. */}
      {adding ? (
        <RecordPaymentForm
          pending={record.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(input) =>
            record.mutate(
              { ...input, method: "cash", kind: "payment" },
              { onSuccess: () => setAdding(false) },
            )
          }
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-hero text-[12px]">
          Record payment
        </button>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  title,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-base-50 ${
        disabled
          ? "opacity-40 cursor-not-allowed"
          : danger
            ? "text-destructive"
            : "text-base-900"
      }`}
    >
      <span className={`shrink-0 ${danger ? "text-destructive" : "text-base-500"}`}>{icon}</span>
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
  orderId,
  pipelineStatus,
  onServiceNoteClick,
  onTransferReadyClick,
  onConfirmProceedClick,
  onTopUpClick,
  onAbandonClick,
  onIssuePOsClick,
  onDispatchClick,
  onDOClick,
}: {
  order: DrawerBodyProps["data"]["order"];
  lines: operationOrderDetailLine[];
  stage: OperationStage;
  orderId: string;
  pipelineStatus: PipelineStatus;
  onServiceNoteClick: () => void;
  onTransferReadyClick: () => void;
  onConfirmProceedClick: () => void;
  onTopUpClick: () => void;
  onAbandonClick: () => void;
  onIssuePOsClick: () => void;
  onDispatchClick: () => void;
  onDOClick: () => void;
}) {
  const role = useAuth((s) => s.role);
  const [open, setOpen] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const close = () => {
    setOpen(false);
    setDlOpen(false);
  };
  // Rare / secondary stage actions moved off the ActionBar (batch 1 #1). These
  // still run the existing modals/mutations — the manual "Transfer to ready"
  // bridge lives here so a Ready-by-override order can still be advanced through
  // the functional stage machine (see "NEW/OLD STAGE NOT BRIDGED").
  const recheck = useRecheckStockMutation(orderId);
  const active = pipelineStatus !== "completed";
  const preProcure = pipelineStatus === "needs_setup" || pipelineStatus === "proceed";
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
            {/* Stage actions (Jess 2026-07-11) — the per-stage "next step" lives in
                the ⋮ now (no sentence row). Gated by pipelineStatus so only the
                relevant one shows. */}
            {active && (
              <>
                {(pipelineStatus === "needs_setup" || pipelineStatus === "proceed") && (
                  <MenuItem
                    icon={<PackagePlus className="w-4 h-4" />}
                    label="Issue PO"
                    onClick={() => {
                      close();
                      onIssuePOsClick();
                    }}
                  />
                )}
                {pipelineStatus === "ready" && (
                  <MenuItem
                    icon={<Truck className="w-4 h-4" />}
                    label="Assign logistic"
                    onClick={() => {
                      close();
                      onDispatchClick();
                    }}
                  />
                )}
                {pipelineStatus === "scheduled" && (
                  <MenuItem
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    label="Confirm delivery"
                    onClick={() => {
                      close();
                      onDOClick();
                    }}
                  />
                )}
                <MenuItem
                  icon={<RotateCcw className="w-4 h-4" />}
                  label={recheck.isPending ? "Checking…" : "Re-check stock"}
                  disabled={recheck.isPending}
                  onClick={async () => {
                    try {
                      await recheck.mutateAsync();
                      toast.info("Stock re-checked");
                    } catch (e) {
                      toast.error(e instanceof ApiError ? e.message : "Re-check failed");
                    }
                  }}
                />
                {preProcure && (
                  <MenuItem
                    icon={<ChevronRight className="w-4 h-4" />}
                    label="Confirm proceed"
                    onClick={() => {
                      close();
                      onConfirmProceedClick();
                    }}
                  />
                )}
                <MenuItem
                  icon={<PackagePlus className="w-4 h-4" />}
                  label="Transfer to ready"
                  title="Mark stock on-hand → ready (manual bridge)"
                  onClick={() => {
                    close();
                    onTransferReadyClick();
                  }}
                />
                <MenuItem
                  icon={<Pencil className="w-4 h-4" />}
                  label="Record top-up"
                  onClick={() => {
                    close();
                    onTopUpClick();
                  }}
                />
                <div className="border-t border-base-100 my-0.5" />
              </>
            )}
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
            {active && (
              <>
                <div className="border-t border-base-100 my-0.5" />
                <MenuItem
                  icon={<AlertCircle className="w-4 h-4" />}
                  label="Abandon order"
                  danger
                  onClick={() => {
                    close();
                    onAbandonClick();
                  }}
                />
              </>
            )}
          </div>
        </>
      )}
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

/** Readiness pill label + colour by status (locked vocab: No PO red · Waiting
 *  amber · Ready green). */
const STOCK_STATUS_META: Record<LineStockStatus, { t: string; c: string }> = {
  ready: { t: "Ready", c: "bg-[#DCFCE7] text-[#166534]" },
  waiting: { t: "Waiting", c: "bg-[#FEF3C7] text-[#92400E]" },
  nopo: { t: "No PO", c: "bg-[#DC2626] text-white" },
};

/**
 * The Stock cell in the Items panel: shows the readiness pill AND lets the
 * operator set it per line (Jess 2026-07-02 — "update the stock GRN each item").
 * Click → a tiny menu: Ready / Waiting / No PO (a manual override stored in
 * ops_order_control.line_stock_status), "Auto" to clear it back to the derived
 * free-stock value, and "Pick / reserve stock" to open the warehouse picker. A
 * "•" marks a manual override so it's distinct from the auto-derived value.
 */
function StockStatusCell({
  sku: _sku,
  status,
  isOverride,
  onSet,
  onPick,
}: {
  sku: string;
  status: LineStockStatus;
  isOverride: boolean;
  onSet: (s: LineStockStatus | null) => void;
  onPick: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = STOCK_STATUS_META[status];
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <div className="relative" onClick={stop}>
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        title="Set stock status (Received / Pending / No PO) or pick warehouse stock"
        data-testid={`stock-status-${_sku}`}
        className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${meta.c}`}
      >
        {meta.t}
        {isOverride && <span title="Manual override">•</span>}
        <ChevronDown size={10} strokeWidth={2.5} className="opacity-70" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { stop(e); setOpen(false); }} />
          <div className="absolute z-50 mt-1 left-0 w-[168px] bg-white border border-base-200 rounded-[6px] shadow-lg overflow-hidden py-1">
            {(["ready", "waiting", "nopo"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={(e) => { stop(e); onSet(s); setOpen(false); }}
                className={`w-full text-left px-2.5 py-1 text-[12px] hover:bg-primary/5 flex items-center gap-2 ${
                  status === s ? "font-semibold" : ""
                }`}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${
                  s === "ready" ? "bg-[#16A34A]" : s === "waiting" ? "bg-[#D97706]" : "bg-[#DC2626]"
                }`} />
                {STOCK_STATUS_META[s].t}
              </button>
            ))}
            <div className="border-t border-base-100 my-1" />
            <button
              type="button"
              onClick={(e) => { stop(e); onSet(null); setOpen(false); }}
              className="w-full text-left px-2.5 py-1 text-[12px] text-base-500 hover:bg-primary/5"
            >
              Auto (from stock)
            </button>
            <button
              type="button"
              onClick={(e) => { stop(e); onPick(); setOpen(false); }}
              className="w-full text-left px-2.5 py-1 text-[12px] text-primary hover:bg-primary/5"
            >
              Pick / reserve stock →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
