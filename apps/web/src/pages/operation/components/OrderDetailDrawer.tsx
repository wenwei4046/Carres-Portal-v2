import {
  type ReactNode,
  type MutableRefObject,
  Fragment,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Home,
  Download,
  ExternalLink,
  FileText,
  Flag,
  MapPin,
  MoreVertical,
  Package,
  PackagePlus,
  Pencil,
  Phone,
  RotateCcw,
  Truck,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  normalizeSkuKey,
  updateOrderInputSchema,
  type OpsStockListResponse,
} from "@carres/shared";
import { apiFetch, ApiError } from "@/lib/api";
import { renderDoPdf, renderReceiptPdf, renderInvoicePdf } from "@/lib/pdf/render";
import type { DoTemplateData, InvoiceTemplateData } from "@/lib/pdf/types";
import {
  qk,
  useOperationOrder,
  useRecheckStockMutation,
  useReceiveLine,
  useOrderLoans,
  useLoanSofa,
  useOperationSuppliers,
  useDeliveryPartners,
  useUpdateOrder,
  useOrderPayments,
  useRecordPayment,
  useVoidPayment,
  useSaveOrderControl,
  type OrderPaymentRow,
  type operationOrderDetailLine,
  type operationOrderDetailPo,
  type operationPoListRow,
} from "@/lib/queries";
import { cjkClassName } from "@/lib/cjk";
import { fmtDate } from "@/lib/fmt-date";
import { locationForAddress } from "@/lib/region";
import { lineReadiness, readinessCounts } from "@/lib/line-readiness";
import {
  buildCustomerChase,
  buildCustomerFinalReminder,
  buildCustomerReminder,
  buildLogisticChase,
  buildLogisticReminder,
  buildSupplierChase,
  buildSupplierReminder,
  rmAmount,
  salutationOf,
  titleCaseName,
} from "@/lib/wa-templates";
import {
  lineCategory,
  lineKind,
  lineSortRank,
  defaultLineLocation,
  stockMatchKey,
} from "@/lib/line-category";
import { useAuth } from "@/lib/auth";
import { Modal } from "./Modal";
import { SectionCard, SectionBand } from "@/components/SectionPanel";
import DeliveryChain from "./DeliveryChain";
import LoanPanel from "./LoanPanel";
import {
  RouteJourneyBar,
  StopsEditor,
  stopsToDisplay,
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
// Not wired since the Round-1A header pill took over — kept for the list pass.
void PIPELINE_PILL;

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
 * Panel — ONE SECTION inside the column's shared white card (UI-KIT §3+§5,
 * 2026-07-13): a cream <SectionBand> title strip + body, stacked inside a
 * single <SectionCard> per column — the EXACT structure the Orders-list facet
 * renders (KanbanGroup inside one SectionCard), so list + detail page are 1:1
 * by construction. The section itself carries NO card chrome — the column's
 * SectionCard owns the white surface + 1px neutral frame. `grow` fills
 * leftover column height (Activity). Collapsible; state persists per title.
 */
function Panel({
  title,
  summary,
  actions,
  collapsedAction,
  grow,
  defaultOpen = true,
  className,
  children,
}: {
  title: string;
  /** Pinned to the header's right edge — the at-a-glance status badge. */
  summary?: ReactNode;
  /** Header ⋮ menu — this panel's own actions (Jess 2026-07-11). */
  actions?: ReactNode;
  /** v4 §4 standard header — a shortcut rendered in the band's right slot
   *  ONLY while the panel is collapsed (e.g. Balance's "+ Add payment"), so
   *  the expanded body's own flame CTA never doubles up (one flame/block). */
  collapsedAction?: ReactNode;
  grow?: boolean;
  /** Initial state when the user hasn't toggled this panel yet. UI-KIT v4 §9:
   *  panels default COLLAPSED to a one-line summary; expand to edit. */
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  // Per-panel hide / expand (Jess 2026-07-11) — every panel header toggles its
  // own body (accordion), so a big order can collapse the cards it doesn't need.
  // State persists across orders via localStorage, keyed by the panel title.
  // Key bumped v4 (2026-07-16 UI-KIT v4 panel rebuild) so the new per-section
  // defaults actually land for users who toggled under the old defaults.
  const storeKey = `ops-drawer-panel-v4:${title}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(storeKey);
      if (stored !== null) return stored !== "0";
    } catch {
      /* fall through to the default */
    }
    return defaultOpen;
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
  // THE shared section chrome (components/SectionPanel.tsx) — the SAME
  // SectionBand the Orders list facet's KanbanGroup renders, stacked the same
  // way (mb-1 inside the shared SectionCard). No bespoke card styling here.
  return (
    <div
      className={`mb-1 flex flex-col min-h-0 ${grow && open ? "flex-1" : "shrink-0"} ${className ?? ""}`}
    >
      <SectionBand
        title={title}
        collapsed={!open}
        onToggle={toggle}
        right={
          <span className="shrink-0 flex items-center gap-1.5">
            {summary}
            {!open && collapsedAction}
            {actions}
          </span>
        }
      />
      {open && children}
    </div>
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

// (ReadinessBadge removed 2026-07-13 — the Items header now shows
//  "<ready> ready · <toReserve> to reserve" inline, from the shared lineReadiness.)

/** KpiBox — a header metric card for ONE mission track (UI-KIT §3 + §7.2):
 *  Lucide track icon + label, headline value COLOURED by the §5.2 status (+ a
 *  small alert mark when red — no dots), sub-facts side by side when a track
 *  carries more than one, and the track's chase action(s) INSIDE the box when
 *  it's red/actionable. Light #F7F4EE fill (the kit's KPI fill), NO border. */
function KpiBox({
  icon,
  label,
  tone,
  value,
  subs,
  actions,
}: {
  icon: ReactNode;
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
  value: ReactNode;
  /** Sub-facts, rendered SIDE BY SIDE (§7.2 — a party with >1 issue). */
  subs?: ReactNode[];
  /** Chase button(s) when the track is red/actionable. */
  actions?: ReactNode;
}) {
  const VALUE: Record<string, string> = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    neutral: "text-base-900",
  };
  return (
    <div className="rounded-[8px] bg-[#F7F4EE] px-3 py-2 min-w-0 flex flex-col">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="shrink-0 text-base-400" aria-hidden="true">
          {icon}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-base-500 truncate">
          {label}
        </span>
        {tone === "danger" && (
          <AlertCircle
            size={12}
            strokeWidth={2.5}
            className="shrink-0 text-danger"
            aria-label="needs action"
          />
        )}
      </div>
      <div
        className={`mt-0.5 text-[16px] font-semibold tabular-nums truncate ${VALUE[tone]}`}
      >
        {value}
      </div>
      {subs && subs.length > 0 && (
        <div className="flex items-center gap-3 min-w-0 text-[11px] text-base-500">
          {subs.map((s, i) => (
            <span key={i} className="truncate">
              {s}
            </span>
          ))}
        </div>
      )}
      {actions && (
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">{actions}</div>
      )}
    </div>
  );
}

/** Chase actions inside a KpiBox — each actionable track carries a TWO-TONE
 *  pair (docs/whatsapp-chase-templates.md): [Reminder] gentle first contact
 *  (outline) + [Chase] firmer follow-up (solid flame). Both copy the template
 *  AND stamp the chase event (today manual WhatsApp; the future portal
 *  auto-fires the same event). */
const CHASE_BTN =
  "text-[11px] font-semibold px-2.5 py-1 rounded-md bg-primary text-white hover:bg-signature-700 whitespace-nowrap";
const REMIND_BTN =
  "text-[11px] font-semibold px-2.5 py-1 rounded-md border border-primary text-primary bg-white hover:bg-primary/5 whitespace-nowrap";

/** The [Reminder]+[Chase] pair for one audience. */
function ChasePair({
  onReminder,
  onChase,
  audience,
}: {
  onReminder: () => void;
  onChase: () => void;
  audience: string;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onReminder}
        title={`Copy the gentle ${audience} reminder + log the chase event`}
        className={REMIND_BTN}
      >
        Reminder
      </button>
      <button
        type="button"
        onClick={onChase}
        title={`Copy the firmer ${audience} chase + log the chase event`}
        className={CHASE_BTN}
      >
        Chase
      </button>
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
  // §7.6 — the Delivery card's multi-leg "Carriers / route" block is HIDDEN by
  // default (the Logistic dropdown is the default route); it expands behind
  // "+ Add stop" and stays open once the order actually has legs.
  const [showRouteBlock, setShowRouteBlock] = useState(false);
  // Lifted so the Customer panel's ⋮ "Edit details" can trigger the card's own
  // safe-edit mode (every panel gets a ⋮ — Jess 2026-07-11).
  // Customer identity lives in the header strip now (Jess 2026-07-15): the
  // name is the anchor; ▾ expands the full-width customer block inline.
  const [customerOpen, setCustomerOpen] = useState(false);
  // Add-payment modal lifted to the drawer level (v4 panel rebuild): the
  // Balance band's collapsed "+ Add payment" shortcut must work while the
  // panel body (MoneyCard) is unmounted.
  const [addingPayment, setAddingPayment] = useState(false);
  // Balance ⋮ "Edit total" → re-opens the MoneyCard total entry (the §3.2
  // Outstanding-only state carries no Total row, so ⋮ is the way back in).
  const balanceEditTotalRef = useRef<(() => void) | null>(null);
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
  // Units RESERVED to THIS SO (§7.7 "Reserve does nothing" fix): /reserve-item
  // stamps ops_stock_items.reserved_ref = the SO ref but never touches
  // ops_order_control.line_received (and the live control PUT rejects it), so
  // the detail payload's free-units-only view made a reserve look like a no-op
  // — the unit just vanished from "free" while the line stayed 0/N. Readiness
  // now ALSO counts the reserved ledger, fetched from the same live endpoint
  // the stock page uses.
  const reservedUnitsQuery = useQuery<OpsStockListResponse>({
    queryKey: ["operation", "ops-stock", "reserved"],
    queryFn: () => apiFetch<OpsStockListResponse>("/api/ops/stock/reserved"),
    staleTime: 10_000,
  });
  const reservedToSoByKey = new Map<string, number>();
  for (const u of reservedUnitsQuery.data?.items ?? []) {
    if (u.reservedRef !== soRef) continue;
    const k = stockMatchKey(u.sku);
    reservedToSoByKey.set(k, (reservedToSoByKey.get(k) ?? 0) + (u.qty ?? 1));
  }
  // Reserved-to-this-SO count for a line: the physical reserved ledger, or the
  // GRN line_received stamp — whichever is ahead (GRN books insert reserved
  // units too, so max() avoids double counting while surviving either path).
  const reservedCountOf = (sku: string, lineReceived: number) =>
    Math.max(lineReceived, reservedToSoByKey.get(stockMatchKey(sku)) ?? 0);
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
  // Loaners against this order (migration 0209 + generalized 0217). A loan is
  // "live" while out (on_loan) OR a supplier borrow still owed back.
  const loansQuery = useOrderLoans(order.id);
  const allLoans = loansQuery.data?.loans ?? [];
  const activeLoans = allLoans.filter((l) => l.status === "on_loan");
  const owedLoans = allLoans.filter(
    (l) => l.source === "supplier" && !l.returned_to_supplier_at,
  );
  const liveLoanCount = new Set([
    ...activeLoans.map((l) => l.id),
    ...owedLoans.map((l) => l.id),
  ]).size;
  const { data: suppliersData } = useOperationSuppliers();
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
  // (lastCallLabel dropped with the old hold/warn strip — the §3.2 delivery-eve
  //  flag + the step-3 On-hold alert row carry the last-call signal now.)
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
  // GRN received-so-far per line (migration 0208) — the units RESERVED to this
  // SO. Drives the Recv X/N counter AND the new strict readiness (Round 1A).
  const lineReceivedOf = (sku: string): number =>
    Number(form.control?.line_received?.[sku] ?? 0);
  // ONE readiness rule (lib/line-readiness, Round 1A) — the header stat strip,
  // the Items badge, every row pill, and the warehouse footer call this same
  // helper, so they can never contradict. STRICT vocab: a line is "ready" ONLY
  // when reserved-to-this-SO covers the qty; free shelf stock = "to reserve".
  const readinessOf = (sku: string, qty: number) =>
    lineReadiness({
      sku,
      qty,
      reservedCount: reservedCountOf(sku, lineReceivedOf(sku)),
      freeCount: (freeUnitsByKey.get(stockMatchKey(sku)) ?? []).length,
      hasPo: hasPoForSku(sku),
      override: form.draft.line_stock_status[sku],
    });
  const rCounts = readinessCounts(
    goodsLines.map((l) => readinessOf(l.sku, l.qty)),
  );
  const readyN = rCounts.ready;
  const toReserveN = rCounts.toReserve;
  const nopoN = rCounts.noPo;
  // Every goods line is reserved to this SO. Empty goods list (service-only) is
  // NOT "all received". Feeds the pipeline status + delivered gating.
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
  // Delivery-eve (page-rebuild §3.2): owing AND delivery is today/tomorrow →
  // the Balance panel shows the red flag, Outstanding reads danger, and Remind
  // switches to the final-reminder tone.
  const deliveryEveLabel: "today" | "tomorrow" | null =
    balanceOwing && daysToDelivery !== null && daysToDelivery >= 0 && daysToDelivery <= 1
      ? daysToDelivery === 0
        ? "today"
        : "tomorrow"
      : null;

  // The formal LP name resolves through the partners map (like the list does).
  const formalPartnerName =
    (partnersData?.partners ?? []).find((p) => p.id === order.delivery_partner_id)
      ?.name ?? null;
  // One sparse-save mutation for the customer-confirmed toggle (0220). Plain
  // field, NO alert-engine wiring — the list stays unaffected.
  const quickSave = useSaveOrderControl(order.id, {
    onError: (e) => toast.error(`Couldn't save — ${e.message}`),
  });
  const customerConfirmed = form.control?.customer_confirmed ?? false;
  // Chase-event stamp (0221, deploy-gated) — SILENT on error so a not-yet-
  // deployed API never blocks the chase itself (the copy already happened).
  const chaseStamp = useSaveOrderControl(order.id);
  // WhatsApp two-tone chase (docs/whatsapp-chase-templates.md): every audience
  // gets Reminder (gentle first contact) + Chase (firmer). COPY the template +
  // log the chase event; the stored number + wa.me deep link — and the portal
  // auto-fire — write the SAME event later.
  const chasePartnerName = assignedLogisticName ?? formalPartnerName ?? null;
  const receiptMetaOf = () => ({
    orderCode: `SO-${order.so}`,
    customerName: order.customer_name ?? "",
  });
  const firstPoNo =
    [...soPoBySku.values()][0] ?? (pos[0] ? pos[0].id.slice(0, 8) : null);
  const deadlineLabel = order.delivery_date_tbd
    ? "TBD"
    : order.delivery_date
      ? fmtDate(order.delivery_date).split(", ")[0]
      : "—";
  // Optional preferred-name/title for customer messages — never auto Mr/Ms.
  // Local-only for now (an ops_order_control column is deploy-gated), keyed by
  // order so it sticks across sessions on this machine.
  const salKey = `ops-salutation:${order.id}`;
  const [salutation, setSalutation] = useState<string>(() => {
    try {
      return localStorage.getItem(salKey) ?? "";
    } catch {
      return "";
    }
  });
  const saveSalutation = (v: string) => {
    setSalutation(v);
    try {
      if (v.trim()) localStorage.setItem(salKey, v);
      else localStorage.removeItem(salKey);
    } catch {
      /* private mode — session-only */
    }
  };
  const orderRef = (order.source_ref ?? [])[0] ?? null;
  const copyChase = (
    aud: "customer" | "logistic" | "supplier",
    tone: "reminder" | "chase" | "final",
  ) => {
    const customerInput = {
      salutation: salutationOf(salutation, order.customer_name),
      ref: orderRef,
      outstanding: rmAmount(moneyOutstanding),
      lines: orderedLines,
    };
    const text =
      aud === "customer"
        ? tone === "final"
          ? /* Delivery-eve final reminder (§3.2) — customer-only tone. */
            buildCustomerFinalReminder({
              ...customerInput,
              when: deliveryEveLabel ?? "tomorrow",
            })
          : (tone === "reminder" ? buildCustomerReminder : buildCustomerChase)(
              customerInput,
            )
        : aud === "supplier"
          ? (tone === "reminder" ? buildSupplierReminder : buildSupplierChase)({
              poNo: firstPoNo,
              ref: orderRef,
              lines: orderedLines,
              deadline: deadlineLabel,
            })
          : (tone === "reminder" ? buildLogisticReminder : buildLogisticChase)({
              logistic: chasePartnerName,
              ref: orderRef,
              customer: order.customer_name ?? null,
              region: loc.label ?? null,
              lines: orderedLines,
              deadline: deadlineLabel,
              overdue: daysToDelivery !== null && daysToDelivery < 0,
            });
    void navigator.clipboard.writeText(text);
    toast.success(
      `${
        tone === "chase" ? "Chase" : tone === "final" ? "Final reminder" : "Reminder"
      } copied — paste into WhatsApp`,
    );
    // The logged chase event — today a manual WhatsApp copy stamps it; the
    // future portal auto-fire writes the SAME event.
    chaseStamp.mutate({ last_chased_at: new Date().toISOString() });
  };

  // ═══ KPI boxes = the 3 mission tracks (UI-KIT §7.2, thresholds §5.2) ═══
  // The boxes ARE the action surface now (the standalone Next row is gone):
  // each reads the same signals (balance gate, shared lineReadiness, delivery
  // fields) and carries its own chase action(s) when red/actionable.
  type KpiTone = "success" | "warning" | "danger" | "neutral";
  // CUSTOMER · money — green paid/0 · amber owing pre-last-call · red owing past
  // the collect gate (the same balanceGate the Balance card shows).
  const moneyTone: KpiTone = !totalSet
    ? "neutral"
    : !balanceOwing
      ? "success"
      : balanceGate === "hold"
        ? "danger"
        : "warning";
  // STOCK — green all reserved · red No PO or an on-PO line with no / passed
  // ETA · amber otherwise (to-reserve or PO on track).
  const onPoStalled = goodsLines.some((l) => {
    if (readinessOf(l.sku, l.qty) !== "on_po") return false;
    const eta = form.draft.line_etas[l.sku] ?? poEtaBySku.get(l.sku) ?? "";
    return !eta || eta < todayIso;
  });
  const stockTone: KpiTone =
    goodsLines.length === 0
      ? "neutral"
      : readyN === goodsLines.length
        ? "success"
        : nopoN > 0 || onPoStalled
          ? "danger"
          : "warning";
  // LOGISTIC — green booked or >3 days left · amber ≤3 days & not booked · red
  // deadline passed & not booked.
  const bookedEta = form.control?.logistic_eta ?? null;
  const logisticTone: KpiTone =
    pipelineStatus === "completed" || bookedEta
      ? "success"
      : daysToDelivery === null
        ? "neutral"
        : daysToDelivery < 0
          ? "danger"
          : daysToDelivery <= 3
            ? "warning"
            : "success";
  // Sub-facts per box — side by side when a party carries more than one (§7.2).
  const moneySubs: string[] = !totalSet
    ? ["no total set"]
    : !balanceOwing
      ? [`${RM(collected)} collected`]
      : [
          `${RM(collected)} of ${RM(orderTotal)} collected`,
          collectByLabel ? `collect by ${collectByLabel}` : "collect on delivery",
        ];
  const stockSubs: string[] =
    goodsLines.length === 0
      ? ["no goods lines"]
      : readyN === goodsLines.length
        ? ["all reserved"]
        : ([
            toReserveN > 0 ? `${toReserveN} to reserve` : null,
            rCounts.onPo > 0 ? `${rCounts.onPo} on PO` : null,
            nopoN > 0 ? `${nopoN} no PO` : null,
          ].filter(Boolean) as string[]);
  const logisticSubs: string[] = bookedEta
    ? [
        `booked ${fmtDate(bookedEta).split(", ")[0]}`,
        ...(chasePartnerName ? [chasePartnerName] : []),
      ]
    : [chasePartnerName ?? "no carrier assigned", "not booked"];

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
      {/* ═══ IDENTITY STRIP ═══ ONE slim white Panel, full width, fixed
          (shrink-0 — the body scrolls under it), floating on the cream page:
          ‹ Orders back · #id (mono) · state pill (amber/blue/green/grey by
          ORDER STATE — never danger red) · meta · flag / ⋮ (no ✕ — back
          replaces it). The KPI mission-track boxes moved INTO the right body
          column (page-rebuild §4 — KPI + Alert is a body panel now, so the
          page is two columns with no separate header band). */}
      <header className="shrink-0 px-5 pt-3 bg-background">
        <SectionCard className="!p-0">
        <div className="px-4 h-[44px] flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to Orders"
            className="shrink-0 -ml-1.5 inline-flex items-center gap-0.5 pl-1 pr-2 py-1 rounded-md text-[13px] font-medium text-base-500 hover:text-base-900 hover:bg-base-100"
          >
            <ChevronLeft size={15} aria-hidden="true" />
            Orders
          </button>
          <span className="w-px h-4 bg-base-200 shrink-0" aria-hidden="true" />
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* §7.1 — the order's two IDs bold, +2 sizes, ADJACENT. The ref
                number stands alone (no "REF" word — Jess 2026-07-13). */}
            <span className="font-mono text-[22px] font-bold text-base-900 shrink-0">
              #{order.so}
            </span>
            {order.source_ref?.[0] && (
              <span
                className="font-mono text-[22px] font-bold text-base-700 shrink-0"
                title="Customer reference"
              >
                {order.source_ref[0]}
              </span>
            )}
            {(() => {
              const onHold = balanceOwing || storageOwing;
              const pill =
                pipelineStatus === "completed"
                  ? { cls: "pill-confirmed", label: "Delivered", hint: PIPELINE_HINT.completed }
                  : onHold
                    ? {
                        cls: "pill-warning",
                        label: "On hold",
                        hint: "Delivery is held until the balance / storage is collected — see the Balance card",
                      }
                    : pipelineStatus === "scheduled"
                      ? { cls: "pill-sent", label: "Scheduled", hint: PIPELINE_HINT.scheduled }
                      : {
                          cls: "pill-neutral",
                          label:
                            pipelineStatus === "ready"
                              ? "Ready to deliver"
                              : PIPELINE_LABEL[pipelineStatus],
                          hint: PIPELINE_HINT[pipelineStatus],
                        };
              return (
                <span className={`pill ${pill.cls}`} title={pill.hint}>
                  {pill.label}
                </span>
              );
            })()}
            {/* Customer anchor (Jess 2026-07-15) — the NAME stays on the strip;
                click it (or ▾) to slide the full-width customer block open.
                Region + ordered date fold INTO that block; the deadline is the
                KPI Logistic tile's job, never repeated here. */}
            <button
              type="button"
              onClick={() => setCustomerOpen((o) => !o)}
              aria-expanded={customerOpen}
              title={customerOpen ? "Hide customer details" : "Show customer details"}
              data-testid="customer-strip-toggle"
              className="min-w-0 flex-1 flex items-center gap-1 text-left text-[13px] text-base-600 hover:text-base-900"
            >
              <span
                className={`truncate font-medium ${cjkClassName(order.customer_name ?? "")}`}
              >
                {order.customer_name ?? "—"}
              </span>
              {customerOpen ? (
                <ChevronUp size={14} className="shrink-0 text-base-400" aria-hidden="true" />
              ) : (
                <ChevronDown size={14} className="shrink-0 text-base-400" aria-hidden="true" />
              )}
              {/* v4 rebuild — the collapsed line carries phone + region (the
                  expand shows the full address); hidden while open to avoid
                  double-reading against the pills. Phone = slashed-zero mono. */}
              {!customerOpen && (order.customer_phone || loc.label) && (
                <span className="min-w-0 truncate text-[12px] text-base-500 ml-1.5">
                  {order.customer_phone && (
                    <span className="font-mono">{order.customer_phone}</span>
                  )}
                  {order.customer_phone && loc.label ? " · " : ""}
                  {loc.label ?? ""}
                </span>
              )}
            </button>
          </div>
          <span className="flex items-center gap-1 shrink-0">
            {/* Ordered date lives HERE on the collapsed strip (Jess 2026-07-15
                rev 2) — muted meta, right side, before flag/⋮. */}
            {order.placed_at && (
              <span
                className="flex items-center gap-1 text-[12px] text-base-400 mr-1 whitespace-nowrap"
                title="Order placed"
              >
                <Calendar size={12} className="shrink-0" aria-hidden="true" />
                ordered {fmtDate(order.placed_at).split(", ")[0]}
              </span>
            )}
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
          </span>
        </div>
        {/* Customer expand (Jess 2026-07-15) — inline, FULL page width (not
            bound by the 32% left column): one icon-led read line of copy-chips
            + WhatsApp + ⋮. Salutation + field edits live in the ⋮ Edit form. */}
        {customerOpen && (
          <CustomerExpand
            order={order}
            regionLabel={loc.label ?? null}
            salutation={salutation}
            onSalutation={saveSalutation}
          />
        )}
        </SectionCard>
      </header>
      {/* ═══ BODY ═══ Header + this action bar STAY (shrink-0); the two columns
          each scroll INDEPENDENTLY (Jess 2026-07-11). The body itself does not
          scroll — it clips, and each column owns its own overflow-y. */}
      <div className="flex-1 min-h-0 px-5 py-3 flex flex-col gap-2.5 overflow-hidden bg-background">
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
              <span className="block text-[10px] font-semibold text-warning">
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
          className="grid gap-3 items-stretch flex-1 min-h-0 overflow-hidden"
          style={{
            // Page rebuild (Jess 2026-07-15 revision): left 32% (money summary)
            // | right 68% (goods + chase — the Items table is the hero) | 12px
            // gap. fr units keep the ratio exact after the gap is taken out.
            gridTemplateColumns: "minmax(0, 32fr) minmax(0, 68fr)",
            gridTemplateAreas: '"side main"',
          }}
        >

        {/* RIGHT Panel (UI-KIT §5.1) — ONE white SectionCard holding the work
            sections: ITEMS ORDERED / WAREHOUSE STOCK / LOAN, each a cream
            SectionBand — the exact facet structure. The column scrolls
            independently (overlay scrollbar); the card fills its height. */}
        <div
          style={{ gridArea: "main" }}
          className="min-w-0 min-h-0 overflow-y-auto scroll-overlay"
        >
          <div className="min-h-full flex flex-col gap-3">
          {/* Panel 0 — KPI + Alert (page-rebuild §4): ONE white panel holding
              the 3 mission-track tiles and (step 3) the stacked alert rows.
              Step-1 shell: the existing KpiBoxes moved here from the old
              header band; the 1.5fr/1fr/1fr tile split + hairline dividers +
              alert stack land in the step-3 build. */}
          <SectionCard className="shrink-0">
            <div className="p-1 grid grid-cols-3 gap-2">
              <KpiBox
                icon={<Wallet size={13} strokeWidth={2.25} />}
                label="Customer · Money"
                tone={moneyTone}
                value={
                  totalSet
                    ? moneyOutstanding > 0
                      ? RM(moneyOutstanding)
                      : "Paid"
                    : "—"
                }
                subs={moneySubs}
                actions={
                  /* Owing → the customer pair: Reminder while gentle contact is
                     right (amber), Chase once firmer follow-up is due — both
                     always offered; ops picks the tone. */
                  balanceOwing ? (
                    <ChasePair
                      audience="customer payment"
                      onReminder={() => copyChase("customer", "reminder")}
                      onChase={() => copyChase("customer", "chase")}
                    />
                  ) : undefined
                }
              />
              <KpiBox
                icon={<Package size={13} strokeWidth={2.25} />}
                label="Stock"
                tone={stockTone}
                value={`${readyN}/${goodsLines.length} ready`}
                subs={stockSubs}
                actions={
                  stockTone === "danger" || stockTone === "warning" ? (
                    <>
                      {nopoN > 0 && (
                        <button
                          type="button"
                          onClick={() => onIssuePOsClick()}
                          title="Raise a PO for the no-PO lines"
                          className={CHASE_BTN}
                        >
                          Raise PO
                        </button>
                      )}
                      {(rCounts.onPo > 0 || onPoStalled) && (
                        <ChasePair
                          audience="supplier (PO-led)"
                          onReminder={() => copyChase("supplier", "reminder")}
                          onChase={() => copyChase("supplier", "chase")}
                        />
                      )}
                    </>
                  ) : undefined
                }
              />
              <KpiBox
                icon={<Truck size={13} strokeWidth={2.25} />}
                label="Logistic"
                tone={logisticTone}
                value={
                  <>
                    {deadlineLabel}
                    {daysToDelivery !== null && daysToDelivery < 0 ? " · over" : ""}
                  </>
                }
                subs={logisticSubs}
                actions={
                  logisticTone === "danger" || logisticTone === "warning" ? (
                    <ChasePair
                      audience="logistic partner (REF-led)"
                      onReminder={() => copyChase("logistic", "reminder")}
                      onChase={() => copyChase("logistic", "chase")}
                    />
                  ) : undefined
                }
              />
            </div>
          </SectionCard>
          <SectionCard className="flex-1">
          {/* Panel 1 — Items ordered. Header badge = readiness (No PO / Waiting /
              Ready), counted over the goods lines. Dark-slate pinned header;
              only the rows scroll (up to ~8, then inside the box). */}
          <Panel
            title="Items ordered"
            summary={
              /* ONE readiness chip, ONE vocabulary (§7.7): "<x> ready · <p>
                 needs stock", from the SAME shared lineReadiness the row pills
                 use — ready = reserved-to-this-SO only (strict). */
              goodsLines.length === 0 ? (
                <MiniBadge tone="muted">no goods</MiniBadge>
              ) : (
                <MiniBadge
                  tone={readyN === goodsLines.length ? "ready" : "waiting"}
                >
                  {readyN} ready
                  {goodsLines.length - readyN > 0
                    ? ` · ${goodsLines.length - readyN} needs stock`
                    : ""}
                </MiniBadge>
              )
            }
            actions={
              <PanelMenu
                items={[
                  {
                    label: "Raise PO for shortages",
                    icon: <PackagePlus size={14} />,
                    onClick: () => onIssuePOsClick(),
                  },
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
            {/* §7.7 — the white table sits APART from the cream band (a gap +
                a neutral base-50 header row, not another cream strip). */}
            <div className="overflow-auto min-h-0 mt-1.5" style={{ maxHeight: 268 }}>
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10">
                  {/* §7.7 (2026-07-13): Item · Qty · Source · Status · Action.
                      Stock ETA / route / GRN moved into the row's expand
                      (chevron on Item); Status is AUTO-derived (no dropdown). */}
                  <tr className="bg-base-50 text-base-500">
                    <th className="text-left text-[10px] font-semibold px-2 py-1.5 border-r border-base-200">
                      Item
                    </th>
                    <th className="text-right text-[10px] font-semibold px-2 py-1.5 w-10 border-r border-base-200">
                      Qty
                    </th>
                    <th
                      className="text-left text-[10px] font-semibold px-2 py-1.5 w-24 border-r border-base-200"
                      title="Where the line is fulfilled from — a linked PO, or own Klang warehouse stock"
                    >
                      Source
                    </th>
                    <th
                      className="text-left text-[10px] font-semibold px-2 py-1.5 w-40 border-r border-base-200"
                      title="Auto-derived from reservations, free stock and POs — reserve stock to flip it green"
                    >
                      Status
                    </th>
                    <th className="text-center text-[10px] font-semibold px-2 py-1.5 w-[70px]">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // §7.7 — ONE row renderer, grouped into Needs action /
                    // Ready only past 5 lines (a small order reads flat).
                    const renderRow = (l: { sku: string; qty: number }) => {
                      const isService = lineKind(l.sku) === "service";
                      // Accessories (pillow / M.P / protector) come from the
                      // Klang warehouse — no PO, no receive step (Jess).
                      const isAcc = lineKind(l.sku) === "acc";
                      const rd = isService ? null : readinessOf(l.sku, l.qty);
                      const received = reservedCountOf(
                        l.sku,
                        lineReceivedOf(l.sku),
                      );
                      // Source — where the line is fulfilled from: the linked
                      // PO (AutoCount source_po wins, else a portal PO id),
                      // else own Klang warehouse stock.
                      const poNo =
                        soPoBySku.get(normalizeSkuKey(l.sku)) ??
                        pos
                          .find((p) =>
                            p.lines.some(
                              (pl) =>
                                normalizeSkuKey(pl.sku) ===
                                normalizeSkuKey(l.sku),
                            ),
                          )
                          ?.id.slice(0, 8);
                      // Per-item route STOPS (rides line_locations — the shape
                      // the LIVE schema accepts; [0] = the default location).
                      const savedLoc = form.draft.line_locations[l.sku];
                      const stops =
                        savedLoc !== undefined && savedLoc.length > 0
                          ? savedLoc
                          : [
                              defaultLineLocation(l.sku, assignedLogisticName) ??
                                "Carres Klang",
                            ];
                      const locValue = stops[0] ?? "";
                      const etaValue =
                        form.draft.line_etas[l.sku] ?? poEtaBySku.get(l.sku) ?? "";
                      const hasSpecialRoute = stops.length > 1;
                      const routeOpen = routeOpenSku === l.sku;
                      // AUTO-derived status (§7.7 — the manual dropdown is gone;
                      // reserving stock is what flips a line green).
                      const pill =
                        !rd
                          ? null
                          : rd === "reserved"
                            ? {
                                t: `Reserved · ${locValue || "Carres Klang"}`,
                                c: "bg-success-soft text-success",
                                hint: isAcc
                                  ? "Accessory — always in the Klang warehouse"
                                  : "Reserved to this SO",
                              }
                            : rd === "to_reserve"
                              ? {
                                  t: `To reserve · ${received}/${l.qty}`,
                                  c: "bg-warning-soft text-warning",
                                  hint: "Matching free stock exists — reserve it to this SO",
                                }
                              : rd === "on_po"
                                ? {
                                    t: "On PO",
                                    c: "bg-base-100 text-base-500",
                                    hint: "Waiting on supplier stock (PO raised)",
                                  }
                                : {
                                    t: "No PO",
                                    c: "bg-base-100 text-base-500",
                                    hint: "Nothing raised yet",
                                  };
                      return (
                        <Fragment key={l.sku}>
                          {/* A line that still needs reserving reads as an
                              AMBER tint (warning, never danger red). */}
                          <tr
                            onClick={() => setPickerSku(l.sku)}
                            className={`cursor-pointer ${
                              l.sku === activeLineSku
                                ? "bg-primary/10"
                                : rd === "to_reserve"
                                  ? "bg-warning-soft/40 hover:bg-warning-soft/60"
                                  : "hover:bg-base-50"
                            }`}
                          >
                            {/* Item — chevron expands the detail (stock ETA /
                                GRN / route-transfer). */}
                            <td className="border border-base-200 px-2 py-1 align-top">
                              <div className="flex items-start gap-1">
                                {!isService && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRouteOpenSku((cur) =>
                                        cur === l.sku ? null : l.sku,
                                      );
                                    }}
                                    title="Details — stock ETA, receiving (GRN), route / transfer"
                                    aria-expanded={routeOpen}
                                    className="shrink-0 mt-0.5 text-base-400 hover:text-base-700"
                                  >
                                    {routeOpen ? (
                                      <ChevronDown size={12} />
                                    ) : (
                                      <ChevronRight size={12} />
                                    )}
                                  </button>
                                )}
                                <span
                                  className="font-mono text-[10px] leading-tight break-words"
                                  title={l.sku}
                                >
                                  {l.sku}
                                </span>
                              </div>
                            </td>
                            {/* Qty */}
                            <td className="border border-base-200 px-2 py-1 text-right text-[12px] tabular-nums align-top">
                              {l.qty}
                            </td>
                            {/* Source — PO/#### or own Klang stock. */}
                            <td className="border border-base-200 px-2 py-1 align-middle">
                              {isService ? (
                                <span className="text-base-300 text-[11px]">—</span>
                              ) : poNo ? (
                                <span className="font-mono text-[10px] text-primary">
                                  {poNo}
                                </span>
                              ) : (
                                <span className="text-[11px] text-base-600">
                                  Klang stock
                                </span>
                              )}
                            </td>
                            {/* Status — auto-derived pill. */}
                            <td className="border border-base-200 px-1.5 py-1 align-middle">
                              {pill ? (
                                <span
                                  title={pill.hint}
                                  className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${pill.c}`}
                                >
                                  {pill.t}
                                </span>
                              ) : (
                                <span className="text-base-300 text-[11px]">—</span>
                              )}
                            </td>
                            {/* Action — inline Reserve on an unfulfilled line;
                                opens the warehouse picker filtered to it. */}
                            <td className="border border-base-200 px-1.5 py-1 text-center align-middle">
                              {rd && rd !== "reserved" ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPickerSku(l.sku);
                                    document
                                      .getElementById("warehouse-stock-panel")
                                      ?.scrollIntoView({
                                        block: "start",
                                        behavior: "smooth",
                                      });
                                  }}
                                  title="Open the warehouse picker filtered to this line"
                                  className="text-[11px] font-semibold text-primary border border-primary rounded-md px-2 py-0.5 hover:bg-primary/5 whitespace-nowrap"
                                >
                                  Reserve
                                </button>
                              ) : (
                                <span className="text-base-300 text-[11px]">—</span>
                              )}
                            </td>
                          </tr>
                          {!isService && routeOpen && (
                            <tr className="bg-base-50">
                              <td
                                colSpan={5}
                                className="border border-base-200 px-3 py-2"
                              >
                                <div className="space-y-2">
                                  {!isAcc && (
                                    <div className="flex items-center gap-4 flex-wrap">
                                      <label className="flex items-center gap-1.5 text-[11px] text-base-500">
                                        Stock ETA
                                        <input
                                          type="date"
                                          value={etaValue}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={(e) =>
                                            form.setLineEta(l.sku, e.target.value)
                                          }
                                          className="border border-base-300 rounded-[3px] bg-white px-1.5 py-0.5 text-[11px] focus:border-primary focus:outline-none"
                                        />
                                      </label>
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
                                        className={`inline-flex items-center gap-1 text-[11px] tabular-nums px-1.5 py-0.5 rounded ${
                                          lineReceivedOf(l.sku) >= l.qty
                                            ? "text-success font-semibold"
                                            : "text-primary hover:bg-primary/10"
                                        }`}
                                      >
                                        Received {lineReceivedOf(l.sku)}/{l.qty}
                                        {lineReceivedOf(l.sku) < l.qty && (
                                          <>
                                            <PackagePlus size={11} strokeWidth={2} />
                                            Book in
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  )}
                                  <div>
                                    <div className="text-[10px] font-semibold text-base-500 mb-1">
                                      Route — stop 1 is where the item sits; add
                                      a stop for a special transfer. Delivery to
                                      the customer is set in the Delivery panel.
                                    </div>
                                    {hasSpecialRoute && (
                                      <div className="max-w-[280px] mb-1">
                                        <RouteJourneyBar
                                          legs={stopsToDisplay(stops)}
                                        />
                                      </div>
                                    )}
                                    <StopsEditor
                                      stops={savedLoc ?? (locValue ? [locValue] : [])}
                                      onChange={(s) =>
                                        form.setLineLocation(l.sku, s)
                                      }
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    };
                    // Flat under 6 lines; else grouped Needs action / Ready.
                    if (orderedLines.length <= 5)
                      return orderedLines.map(renderRow);
                    const needs = orderedLines.filter(
                      (l) =>
                        lineKind(l.sku) !== "service" &&
                        readinessOf(l.sku, l.qty) !== "reserved",
                    );
                    const needSet = new Set(needs.map((l) => l.sku));
                    const rest = orderedLines.filter((l) => !needSet.has(l.sku));
                    const subheader = (label: string) => (
                      <tr key={`sub-${label}`}>
                        <td
                          colSpan={5}
                          className="border border-base-200 bg-base-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.04em] text-base-500"
                        >
                          {label}
                        </td>
                      </tr>
                    );
                    return (
                      <>
                        {needs.length > 0 && subheader("Needs action")}
                        {needs.map(renderRow)}
                        {rest.length > 0 && subheader("Ready")}
                        {rest.map(renderRow)}
                      </>
                    );
                  })()}
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
          {activeLineSku ? (
            /* ALWAYS viewable (§7.8) — including delivered orders. Natural
               height; the column scrolls; the picker caps its own row area.
               `bare` stacks it as a SECTION inside this column's shared card.
               The id anchors the Items rows' inline Reserve buttons (§7.7). */
            <div
              id="warehouse-stock-panel"
              className="min-h-0 flex flex-col shrink-0"
            >
              <StockPickerGrid
                bare
                sku={activeLineSku}
                soRef={soRef}
                need={(() => {
                  // Remaining to reserve = qty − already reserved to this SO,
                  // same numbers the row pill / badge read (one readiness rule).
                  const line = orderedLines.find((l) => l.sku === activeLineSku);
                  if (!line) return 1;
                  return Math.max(
                    0,
                    line.qty -
                      reservedCountOf(line.sku, lineReceivedOf(line.sku)),
                  );
                })()}
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
                Pick an item above to see its warehouse stock.
              </div>
            </Panel>
          )}

          {/* Loan (migration 0209 + 0217) — AFTER Warehouse stock in the work
              column (Jess 2026-07-13): lending a substitute is a stock action.
              Two sources: own warehouse OR borrowed from a supplier (a return
              obligation). The lend entry stays even at 0 loans. */}
          <Panel
            title="Loan"
            defaultOpen={false}
            summary={
              liveLoanCount > 0 ? (
                <MiniBadge tone="waiting">{liveLoanCount} out</MiniBadge>
              ) : (
                <MiniBadge tone="muted">none</MiniBadge>
              )
            }
          >
            <LoanPanel
              orderId={order.id}
              loans={allLoans}
              suppliers={suppliersData?.suppliers ?? []}
              freeUnits={freeUnits}
              orderCategories={[
                // CORE categories only — a loaner substitutes a mattress /
                // bedframe / sofa; "acc" would let keyword-missed units leak in.
                ...new Set(
                  goodsLines
                    .map((l) => lineCategory(l.sku))
                    .filter((c) => c !== "acc"),
                ),
              ]}
              onLend={(itemId, sku) => setLoanTarget({ itemId, sku })}
            />
          </Panel>

          {/* Card C — Activity & notes (Jess 2026-07-11 Option 1; moved to the
              right column BOTTOM 2026-07-15 — page-rebuild step 2). THE single
              place for all hand-written follow-up on this order: the compose box
              lives here, so a note auto-attaches to THIS order (no order-picker),
              and every entry stacks with author + timestamp + tag. Also merges
              the system activity (imports, stock moves). Carries `grow` to fill
              the column; scrolls its own body. Reuses AnnotationTimeline. */}
          <Panel title="Activity & notes" grow>
            <div className="p-3 overflow-auto min-h-0">
              <AnnotationTimeline orderId={order.id} />
            </div>
          </Panel>
          </SectionCard>
          </div>
        </div>

        {/* LEFT Panel (UI-KIT §5.1) — ONE white SectionCard holding the money
            summary sections: BALANCE / STORAGE / DELIVERY. The Customer panel
            moved into the header strip's expandable block (Jess 2026-07-15).
            Scrolls INDEPENDENTLY of the work column on the right. */}
        <div
          style={{ gridArea: "side" }}
          className="min-w-0 min-h-0 overflow-y-auto scroll-overlay"
        >
          <SectionCard className="min-h-full">
          {/* 1. Balance — its OWN card (Jess: split from Storage). Chip = the
              owing amount as danger TEXT (colour lock). The id anchors the
              banner's "Confirm & collect" push. */}
          <div id="card-balance" className="min-w-0 flex flex-col min-h-0">
          <Panel
            title="Balance"
            actions={
              /* §7.4 ⋮ — Generate invoice (server data → client PDF, same path
                 as DownloadInvoiceButton) + Print receipt (latest payment). */
              <PanelMenu
                items={[
                  {
                    label: "Generate invoice",
                    icon: <FileText size={14} />,
                    onClick: () => {
                      void (async () => {
                        try {
                          const dataInv = await apiFetch<InvoiceTemplateData>(
                            `/api/orders/${order.id}/invoice-pdf-data`,
                          );
                          const blob = await renderInvoicePdf(dataInv);
                          const url = URL.createObjectURL(blob);
                          window.open(url, "_blank");
                          setTimeout(() => URL.revokeObjectURL(url), 60_000);
                        } catch (e) {
                          const msg =
                            e instanceof ApiError ? e.message : String(e);
                          toast.error(`Invoice PDF failed — ${msg}`);
                        }
                      })();
                    },
                  },
                  {
                    label: "Print receipt",
                    icon: <Download size={14} />,
                    disabled: ledger.length === 0,
                    onClick: () => {
                      if (ledger[0]) void openReceipt(ledger[0], receiptMetaOf());
                    },
                  },
                  {
                    label: "Copy outstanding",
                    icon: <Copy size={14} />,
                    disabled: !isOwing,
                    onClick: () => {
                      void navigator.clipboard.writeText(RM(moneyOutstanding));
                      toast.success("Outstanding copied");
                    },
                  },
                  // Keyed totals only — a line-priced (native) total is summed
                  // from the items and can't be hand-edited.
                  ...(!hasLineTotal
                    ? [
                        {
                          label: "Edit total",
                          icon: <Pencil size={14} />,
                          onClick: () => balanceEditTotalRef.current?.(),
                        },
                      ]
                    : []),
                ]}
              />
            }
            defaultOpen={false}
            summary={
              /* v4 state-adaptive one-liner. FIX (Jess): never a bare "no
                 total" chip beside collected money — money-in-no-total reads
                 "Collected RMx · set total", neutral (no red). Amounts in the
                 slashed-zero mono; "Paid" is a status → pill. */
              !totalSet ? (
                <span className="text-[11px] text-base-500 font-mono whitespace-nowrap">
                  {collected > 0 ? `Collected ${RM(collected)} · ` : ""}
                  <span className="font-sans text-base-400">set total</span>
                </span>
              ) : isOwing ? (
                <span
                  title={
                    balanceGate === "hold"
                      ? "Delivery on hold — collect before dispatch"
                      : "Outstanding balance"
                  }
                  className={`text-[11px] font-mono font-semibold whitespace-nowrap ${
                    deliveryEveLabel ? "text-danger" : "text-base-800"
                  }`}
                >
                  Outstanding {RM(owingAmt)}
                  {collected > 0 ? (
                    <span className="font-normal text-base-500">
                      {" "}
                      · {RM(collected)} in
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="pill pill-confirmed text-[11px]">Paid ✓</span>
              )
            }
            collapsedAction={
              /* §1 — the collapsed line's "+ Add payment" shortcut (the ONE
                 flame in this block while collapsed; the expanded body's own
                 CTA takes over when open). */
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddingPayment(true);
                }}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-primary text-white hover:bg-signature-700 whitespace-nowrap"
              >
                + Add payment
              </button>
            }
          >
            <div className="p-3">
              {/* Page-rebuild §3.2 — the state-adaptive money stack owns the
                  collect-by line + the delivery-eve red flag now (the old
                  hold/warn strip folded into it). */}
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
                collectByLabel={collectByLabel}
                deliveryEve={deliveryEveLabel}
                onRemind={() =>
                  copyChase("customer", deliveryEveLabel ? "final" : "reminder")
                }
                onChase={() => copyChase("customer", "chase")}
                lastChasedAt={form.control?.last_chased_at ?? null}
                startEditTotalRef={balanceEditTotalRef}
                onAddPayment={() => setAddingPayment(true)}
              />
            </div>
          </Panel>
          {/* Add-payment modal (v4 §2 rebuild) — lives at the drawer level so
              the collapsed band's shortcut works with the body unmounted. */}
          {addingPayment && (
            <AddPaymentModal
              orderId={order.id}
              totalSet={totalSet}
              orderTotal={orderTotal}
              collected={collected}
              onClose={() => setAddingPayment(false)}
            />
          )}
          </div>

          {/* 3. Storage — its OWN card (Jess: split from Balance). Chip (Round
              1A): "held <n>d" while a fee is accruing (danger TEXT on hold —
              never a red block) · "not accruing" otherwise. ⋮ hidden until 1B
              (receipt printing not wired into the new pattern yet). */}
          {(hasMsbf || hasSof) && (
            <Panel
              title="Storage"
              defaultOpen={false}
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
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-base-100 ${
                      storageGate === "hold" ? "text-danger" : "text-warning"
                    }`}
                  >
                    {storageGate === "hold" && (
                      <AlertCircle size={10} strokeWidth={2.5} />
                    )}
                    {(() => {
                      const from =
                        form.control?.storage_from ?? form.draft.storage_from;
                      if (from && from.trim()) {
                        const days = Math.max(
                          0,
                          Math.round(
                            (Date.now() - new Date(`${from}T00:00:00`).getTime()) /
                              86_400_000,
                          ),
                        );
                        return `held ${days}d`;
                      }
                      return storageFee > 0 ? `${RM(storageFee)} fee` : "fee due";
                    })()}
                  </span>
                ) : (
                  <MiniBadge tone="muted">not accruing</MiniBadge>
                )
              }
            >
              <div className="p-3 space-y-2">
                {/* §7.5 — the locked rule (replaces the wrong RM/day placeholder):
                    fee runs START→END; START auto = the next same weekday after
                    the deadline; MS/BF RM150/month · Sofa 14 days free then RM200. */}
                <div className="rounded-[8px] border border-base-200/70 bg-base-50 px-2.5 py-1.5 text-[11px] text-base-500">
                  Starts the same weekday the week AFTER the deadline · MS/BF{" "}
                  <span className="font-mono text-base-700">RM150</span>/month ·
                  sofa free 14 days then{" "}
                  <span className="font-mono text-base-700">RM200</span>
                </div>
                <StorageControlFields
                  form={form}
                  hasMsbf={hasMsbf}
                  hasSof={hasSof}
                  orderId={order.id}
                  deadline={
                    !order.delivery_date_tbd ? order.delivery_date : null
                  }
                  meta={{
                    orderCode: `SO-${order.so}`,
                    customerName: order.customer_name ?? "",
                    customerPhone: order.customer_phone ?? "",
                  }}
                />
              </div>
            </Panel>
          )}

          {/* Loan moved to the RIGHT (work) column, after Warehouse stock
              (Jess 2026-07-13) — lending is a stock action, not a view card. */}

          {/* Card B — Delivery. Header badge = region. Body split Original |
              Logistic update; then the 2 remark rows; then a Route section only
              for a cross-border / multi-leg order. (Natural height now — the
              Activity card below carries `grow` to fill the column bottom.) */}
          <Panel
            title="Delivery"
            actions={
              /* Round 1A ⋮ discipline: only WIRED actions — Print DO hidden
                 until 1B. */
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
              /* Round 1A chip: "overdue" (danger text) · "booked <date>" (green)
                 · "not booked" (grey). */
              (() => {
                const eta = form.control?.logistic_eta ?? null;
                if (eta)
                  return (
                    <MiniBadge tone="kv">
                      booked {fmtDate(eta).split(", ")[0]}
                    </MiniBadge>
                  );
                if (daysToDelivery !== null && daysToDelivery < 0)
                  return (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-base-100 text-danger">
                      overdue
                    </span>
                  );
                return <MiniBadge tone="muted">not booked</MiniBadge>;
              })()
            }
          >
            <div className="p-3 min-h-0 overflow-auto space-y-2 flex-1">
              {/* Round 1A: ONE full-width column — label left / input right,
                  nothing truncated (the old two-column split squeezed each input
                  to ~140px). Field order: Logistic · Deadline · Logistic ETA ·
                  Time slot · Call window · Customer request. */}
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
                <LogisticEtaField form={form} />
                <DeliveryTimeSlotField form={form} />
              </FieldGrid>
              {/* Chase window (§7.6 — renamed from "Call customer by"): a MANUAL
                  reminder to chase the PARTNER N days before the deadline. It
                  feeds the list's next-action engine, it does NOT auto-message. */}
              {contactByLabel && (
                <div className="flex items-center justify-between gap-2 rounded-md bg-info-soft/50 px-2 py-1">
                  <span className="flex items-center gap-1 text-[11.5px] font-medium text-info min-w-0">
                    <Phone size={12} strokeWidth={2.25} className="shrink-0" />
                    <span className="truncate">Chase partner by {contactByLabel}</span>
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
                      aria-label="Chase window — days before the deadline to chase the partner"
                      title="Days before the deadline to chase the partner (manual reminder, no auto-message)"
                      className="w-8 rounded border border-base-200 bg-white px-1 py-0.5 text-[11px] text-center outline-none focus:border-primary"
                    />
                    <span>d</span>
                  </span>
                </div>
              )}
              {/* Customer confirmed (0220) — a FIELD inside Delivery per UI-KIT
                  §5.1 (moved out of the old header banner). Same quick sparse-
                  save; the list stays unaffected. */}
              <label className="flex items-center justify-between gap-2 rounded-md bg-base-50 px-2 py-1 cursor-pointer select-none">
                <span className="text-[11.5px] text-base-500">
                  Customer confirmed
                </span>
                <input
                  type="checkbox"
                  checked={customerConfirmed}
                  disabled={quickSave.isPending}
                  onChange={() =>
                    quickSave.mutate({ customer_confirmed: !customerConfirmed })
                  }
                  className="cursor-pointer accent-primary"
                />
              </label>
              <div className="border-t border-base-100 pt-2">
                <FieldGrid>
                  <RemarkControlField
                    form={form}
                    field="customer_request"
                    label="Customer request"
                    placeholder="e.g. postponed to end of May"
                  />
                </FieldGrid>
              </div>
              {/* Carriers / route (§7.6) — HIDDEN by default: the Logistic
                  dropdown above IS the standard single-carrier route, so the
                  multi-leg bar only renders when the order actually has legs,
                  or after "+ Add stop" opens it. */}
              {(order.delivery_stops?.length ?? 0) > 0 || showRouteBlock ? (
                <div className="border-t border-base-100 pt-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-base-400">
                      Carriers / route
                    </span>
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
              ) : (
                <div className="border-t border-base-100 pt-1.5">
                  <button
                    type="button"
                    onClick={() => setShowRouteBlock(true)}
                    title="Multi-leg delivery (a second carrier / transit hop) — the Logistic above covers the standard single trip"
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    + Add stop (multi-leg)
                  </button>
                </div>
              )}
            </div>
          </Panel>

          </SectionCard>
        </div>{/* /left panel */}
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
/** Header-strip customer block (Jess 2026-07-15 — the left-column Customer
 *  panel folded into the identity strip; rev 2 = cream pills). Read = ONE
 *  full-width line of cream copy-PILLS (icon + value; phone accent), 8px gap
 *  — white panel + cream blocks per UI-KIT, no verticals — + the round green
 *  WhatsApp button + [⋮]. Click a pill = copy that field. Ordered date lives
 *  on the collapsed strip, not here. ⋮ Edit details flips the line into the
 *  edit form (name / phone / address + the messages salutation). Save logic
 *  mirrors OrderCustomerCard (updateOrderInputSchema, presence-only). */
function CustomerExpand({
  order,
  regionLabel,
  salutation,
  onSalutation,
}: {
  order: {
    id: string;
    status: string;
    customer_name: string | null;
    customer_phone: string | null;
    customer_address: string | null;
  };
  regionLabel: string | null;
  /** Preferred greeting for WhatsApp messages (local-only store). */
  salutation: string;
  onSalutation: (v: string) => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const update = useUpdateOrder(order.id, {
    onSuccess: () => {
      setEditing(false);
      toast.success("Customer details updated");
      void qc.invalidateQueries({ queryKey: qk.operation.order(order.id) });
    },
    onError: (e) => setErr(e.message),
  });
  const startEdit = () => {
    setName(order.customer_name ?? "");
    setPhone(order.customer_phone ?? "");
    setAddress(order.customer_address ?? "");
    setErr(null);
    setEditing(true);
  };
  const save = () => {
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
  };
  const copy = (label: string, v: string | null) => {
    if (!v) return;
    void navigator.clipboard.writeText(v);
    toast.success(`${label} copied`);
  };
  const wa = waLink(order.customer_phone);
  const field =
    "mt-0.5 w-full px-2 py-1.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700";
  // One WHITE pill per field (rev 3 colour fix): content brighter than its
  // container — white pill + hairline floating on the light-grey (base-50)
  // expand strip. Never cream-on-cream: cream is the PAGE background only.
  // Muted icon + value in normal ink (phone accent); click = copy; 8px gap.
  const pillCls =
    "min-w-0 flex items-center gap-1.5 text-[12.5px] text-base-800 hover:text-base-900 bg-white border border-base-200 rounded-[8px] px-2.5 py-1 hover:brightness-[0.98] disabled:opacity-50";

  if (editing) {
    return (
      <div className="px-4 pb-3 pt-2.5 rounded-[8px] bg-base-50">
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="t-tiny text-base-500">Customer name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
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
            <span
              className="t-tiny text-base-500"
              title="Used as the greeting in WhatsApp messages. Blank = the customer name, title-cased."
            >
              Salutation (messages)
            </span>
            <input
              value={salutation}
              onChange={(e) => onSalutation(e.target.value)}
              placeholder={titleCaseName(order.customer_name ?? "")}
              className={field}
            />
          </label>
          <label className="block col-span-3">
            <span className="t-tiny text-base-500">Address</span>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className={`${field} resize-none`}
            />
          </label>
        </div>
        {err && <p className="t-tiny text-danger mt-1.5">{err}</p>}
        <div className="mt-2 flex items-center justify-end gap-2">
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
    /* Light-grey container (base-50, one step under white) — the white pills
       float on it. Rounded to sit inside the white card's inset. v4 §8b
       density: the read row is 44px fixed. */
    <div
      className="px-4 h-[44px] rounded-[8px] bg-base-50 flex items-center gap-2 min-w-0"
      data-testid="customer-expand"
    >
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => copy("Phone", order.customer_phone)}
          disabled={!order.customer_phone}
          title="Copy phone"
          className={`${pillCls} shrink-0`}
        >
          <Phone size={13} className="shrink-0 text-base-400" aria-hidden="true" />
          {/* v4 — phone is CONTENT: dark, slashed-zero mono (never accent). */}
          <span className="truncate font-medium font-mono text-base-900">
            {order.customer_phone ?? "—"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => copy("Region", regionLabel)}
          disabled={!regionLabel}
          title="Copy region"
          className={`${pillCls} shrink-0`}
        >
          <MapPin size={13} className="shrink-0 text-base-400" aria-hidden="true" />
          <span className="truncate">{regionLabel ?? "—"}</span>
        </button>
        <button
          type="button"
          onClick={() => copy("Address", order.customer_address)}
          disabled={!order.customer_address}
          title="Copy address"
          className={pillCls}
        >
          <Home size={13} className="shrink-0 text-base-400" aria-hidden="true" />
          <span className="truncate text-left">
            {order.customer_address ?? "—"}
          </span>
        </button>
      </div>
      <span className="flex items-center gap-1.5 shrink-0">
        {/* WhatsApp — round WHITE button (same family as the pills, no brand
            colour) with the outline whatsapp glyph in muted grey; opens wa.me
            directly, no confirm. */}
        <button
          type="button"
          onClick={() => {
            if (wa) window.open(wa, "_blank", "noopener");
          }}
          disabled={!wa}
          title="Open WhatsApp chat with the customer"
          aria-label="WhatsApp the customer"
          className="w-8 h-8 rounded-full bg-white border border-base-200 hover:brightness-[0.98] disabled:opacity-50 flex items-center justify-center shrink-0 text-base-500 hover:text-base-800"
        >
          <svg
            viewBox="0 0 24 24"
            width={16}
            height={16}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9" />
            <path d="M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1" />
          </svg>
        </button>
        <PanelMenu
          items={[
            ...(order.status === "place"
              ? [
                  {
                    label: "Edit details",
                    icon: <Pencil size={14} />,
                    onClick: startEdit,
                  },
                ]
              : []),
            {
              label: "Copy address",
              icon: <Copy size={14} />,
              disabled: !order.customer_address,
              onClick: () => copy("Address", order.customer_address),
            },
            {
              label: "Copy phone",
              icon: <Copy size={14} />,
              disabled: !order.customer_phone,
              onClick: () => copy("Phone", order.customer_phone),
            },
            {
              label: "WhatsApp customer",
              icon: <Phone size={14} />,
              disabled: !wa,
              onClick: () => {
                if (wa) window.open(wa, "_blank", "noopener");
              },
            },
          ]}
        />
      </span>
    </div>
  );
}

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

/** Fetch the order's invoice data + render the Sales Invoice PDF — the Balance ⋮
 *  "Print invoice". The invoice row is auto-issued at dispatch (migration 0098),
 *  so before dispatch the endpoint 404s → a clear toast. Mirrors
 *  DownloadInvoiceButton. */
async function openInvoicePdf(orderId: string, so: number) {
  try {
    const data = await apiFetch<InvoiceTemplateData>(
      `/api/orders/${orderId}/invoice-pdf-data`,
    );
    const blob = await renderInvoicePdf(data);
    window.open(URL.createObjectURL(blob), "_blank");
    toast.success(`Invoice INV-${String(so).padStart(6, "0")} opened`);
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : String(e);
    toast.error(`No invoice yet (issued at dispatch) — ${msg}`);
  }
}

/** Fetch DO data + render the Delivery Order PDF — the Delivery ⋮ "Print DO".
 *  Mirrors PrintDoButton (same /print-do-data endpoint). */
async function openDoPdf(orderId: string) {
  try {
    const data = await apiFetch<DoTemplateData>(
      `/api/operation/orders/${orderId}/print-do-data`,
    );
    const blob = await renderDoPdf(data);
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : String(e);
    toast.error(`Print delivery order failed — ${msg}`);
  }
}

// Not wired yet — reserved for the Drawer 1B ⋮ menu (invoice / DO print).
void openInvoicePdf;
void openDoPdf;

/** One row of the Total / Collected / Outstanding stack — v4 §3: label =
 *  12px uppercase muted; the value (right) is CONTENT, dark. */
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
      <span className="t4-label">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

/** v4 §2 — the Add-payment modal: two columns. LEFT = typed fields (amount /
 *  date-received default today / method Transfer·Cash·Card / bank when
 *  transfer / slip / note). RIGHT = the live "after this payment" balance —
 *  bill / collected / outstanding recompute per keystroke. Payments stay
 *  VOID-able (principal), never deletable. `Transfer` maps to the ledger's
 *  'bank' method; the bank name (HLB/RHB) rides `reference` (no schema
 *  change). Slip upload is a SHELL — order_payments.receipt_url exists but
 *  the record API doesn't accept it yet (receipt/invoice workstream). */
function AddPaymentModal({
  orderId,
  totalSet,
  orderTotal,
  collected,
  onClose,
}: {
  orderId: string;
  totalSet: boolean;
  orderTotal: number;
  collected: number;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<"bank" | "cash" | "card">("bank");
  const [bank, setBank] = useState<"" | "HLB" | "RHB">("");
  const [note, setNote] = useState("");
  const record = useRecordPayment(orderId, {
    onError: (e) => toast.error(`Couldn't record payment — ${e.message}`),
  });
  const amt = Number(amount);
  const amtOk = amount.trim() !== "" && Number.isFinite(amt) && amt > 0;
  const afterCollected = collected + (amtOk ? amt : 0);
  const afterOutstanding = Math.max(0, orderTotal - afterCollected);
  const cell =
    "mt-0.5 w-full px-2 py-1.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700";
  const money = "font-mono text-[13px] text-base-900";
  return (
    <Modal title="Add payment" onClose={onClose} size="lg">
      <div className="grid grid-cols-[3fr_2fr] gap-4">
        {/* LEFT — the typed fields. */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="t4-label">Amount (RM)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Payment amount"
                className={cell}
              />
            </label>
            <label className="block">
              <span className="t4-label">Date received</span>
              <input
                type="date"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
                aria-label="Payment date"
                className={cell}
              />
            </label>
            <label className="block">
              <span className="t4-label">Method</span>
              <select
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as "bank" | "cash" | "card")
                }
                aria-label="Payment method"
                className={cell}
              >
                <option value="bank">Transfer</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
              </select>
            </label>
            {method === "bank" ? (
              <label className="block">
                <span className="t4-label">Bank</span>
                <select
                  value={bank}
                  onChange={(e) => setBank(e.target.value as "" | "HLB" | "RHB")}
                  aria-label="Receiving bank"
                  className={cell}
                >
                  <option value="">—</option>
                  <option value="HLB">HLB</option>
                  <option value="RHB">RHB</option>
                </select>
              </label>
            ) : (
              <div aria-hidden="true" />
            )}
          </div>
          <label className="block">
            <span className="t4-label">Upload slip</span>
            <button
              type="button"
              disabled
              title="Slip / receipt upload lands with the receipt workstream (order_payments.receipt_url is ready)"
              className="mt-0.5 w-full px-2 py-1.5 border border-dashed border-base-300 rounded text-[12px] text-base-400 bg-base-50 cursor-not-allowed text-left"
            >
              Attach transfer slip — coming with receipts
            </button>
          </label>
          <label className="block">
            <span className="t4-label">Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Deposit · 2nd payment · final"
              aria-label="Payment note"
              className={cell}
            />
          </label>
        </div>
        {/* RIGHT — live "after this payment" (grey container, white page). */}
        <div
          className="rounded-[8px] bg-base-50 p-3 self-start"
          data-testid="payment-live-preview"
        >
          <div className="t4-label mb-2">After this payment</div>
          {totalSet ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-base-500">Bill total</span>
                <span className={money}>{RM(orderTotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-base-500">Collected</span>
                <span className={money}>{RM(afterCollected)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-base-200">
                <span className="text-[12px] text-base-500">Outstanding</span>
                {afterOutstanding > 0 ? (
                  <span className="font-mono text-[20px] font-bold text-base-900">
                    {RM(afterOutstanding)}
                  </span>
                ) : (
                  <span className="pill pill-confirmed text-[11px]">Paid ✓</span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-base-500">Collected</span>
                <span className={money}>{RM(afterCollected)}</span>
              </div>
              <div className="text-[12px] text-base-400">
                No total set — set the total in Balance to compute outstanding.
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost text-[12px]">
          Cancel
        </button>
        <button
          type="button"
          disabled={!amtOk || record.isPending}
          onClick={() =>
            record.mutate(
              {
                amount: amt,
                paidOn,
                note: note.trim() || null,
                method,
                kind: "payment",
                reference: method === "bank" && bank ? bank : null,
              },
              {
                onSuccess: () => {
                  toast.success("Payment recorded");
                  onClose();
                },
              },
            )
          }
          className="btn-hero text-[12px] disabled:opacity-50"
        >
          {record.isPending ? "Recording…" : "Record payment"}
        </button>
      </div>
    </Modal>
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
  collectByLabel,
  deliveryEve,
  onRemind,
  onChase,
  lastChasedAt,
  startEditTotalRef,
  onAddPayment,
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
  /** "Collect by <date>" under Outstanding when nothing is collected yet. */
  collectByLabel: string | null;
  /** Owing + delivery today/tomorrow → red flag + danger Outstanding +
   *  final-reminder Remind tone (page-rebuild §3.2). */
  deliveryEve: "today" | "tomorrow" | null;
  onRemind: () => void;
  onChase: () => void;
  /** Shared chase log — the same last_chased_at every chase button stamps. */
  lastChasedAt: string | null;
  /** Lets the panel ⋮ re-open the total entry once the stack has collapsed to
   *  the Outstanding-only state (same pattern as the Customer card's edit). */
  startEditTotalRef?: MutableRefObject<(() => void) | null>;
  /** Opens the drawer-level AddPaymentModal (v4 §2 — lifted so the collapsed
   *  band shortcut works too). */
  onAddPayment: () => void;
}) {
  const role = useAuth((s) => s.role);
  const isPrincipal = role === "principal";
  // §7.4 — a keyed Total READS formatted ("RM 1,749"), click to edit the raw
  // number. Starts in edit mode only while no total is set yet.
  const [editingTotal, setEditingTotal] = useState(false);
  const voidPay = useVoidPayment(orderId, {
    onError: (e) => toast.error(`Couldn't void — ${e.message}`),
  });

  // v4 rebuild states: paid-in-full / owing / no-total. (The Add-payment
  // modal itself lives at the drawer level now — see AddPaymentModal.)
  const paidInFull = totalSet && outstanding <= 0;
  // Outside entry point (panel ⋮ "Edit total") into the total editor.
  if (startEditTotalRef) startEditTotalRef.current = () => setEditingTotal(true);
  // Colour = problem only: Outstanding reads plain ink; danger ONLY on
  // delivery-eve. v4 §3: Outstanding is the HERO NUMBER — 20 Bold.
  const outstandingBig = (
    <span
      className={`font-mono text-[20px] font-bold leading-none ${
        deliveryEve ? "text-danger" : "text-base-900"
      }`}
    >
      {RM(outstanding)}
    </span>
  );
  // The set-total entry — reused by the partial Total row AND the no-total
  // hint state. Reads formatted once keyed; click to edit.
  const totalNode = hasLineTotal ? (
    <span
      className="font-mono text-[12px] text-base-600"
      title="Summed from the order items"
    >
      {RM(orderTotal)}
    </span>
  ) : editingTotal || orderTotal <= 0 ? (
    <input
      type="number"
      min={0}
      step="0.01"
      autoFocus={editingTotal}
      value={form.draft.balance}
      onChange={(e) => form.set("balance", e.target.value)}
      /* Pin the input while focused: the first digit typed flips totalSet and
         re-shapes the stack — without this the entry unmounts mid-typing. */
      onFocus={() => setEditingTotal(true)}
      onBlur={() => setEditingTotal(false)}
      placeholder="Set total (RM)"
      aria-label="Order total"
      className="w-32 text-right font-mono text-[12px] px-1.5 py-0.5 border border-base-200 rounded bg-white outline-none focus:border-base-700"
    />
  ) : (
    <button
      type="button"
      onClick={() => setEditingTotal(true)}
      title="Keyed total — click to edit"
      className="font-mono text-[12px] text-base-600 hover:text-base-900 underline decoration-dotted decoration-base-300 underline-offset-2"
    >
      {RM(orderTotal)}
    </button>
  );

  return (
    <div className="space-y-2.5">
      {/* Delivery-eve red flag (§3.2) — danger TEXT on the neutral surface
          (no red block; the alert stripe belongs to the step-3 alert rows). */}
      {deliveryEve && (
        <div
          className="flex items-center gap-1.5 rounded-md bg-base-50 px-2 py-1.5 text-[11.5px] font-medium text-danger"
          data-testid="balance-delivery-eve"
        >
          <AlertCircle size={12} strokeWidth={2.5} className="shrink-0" />
          Delivery {deliveryEve}, still owing {RM(outstanding)}
        </div>
      )}

      {/* v4 §1 expanded stack — the ORIGINAL BILL amount + outstanding always
          read together: Total / Collected / Outstanding (hero). States:
            · no total   → Total entry + Collected (if any money in) + neutral
                           "set total" hint — NEVER an error-red Outstanding
            · owing      → all three rows; Outstanding = 20 Bold hero
            · paid       → Total / Collected / Paid ✓ pill
          The Total entry pins itself while focused (editingTotal) so typing
          the first digit can't unmount it. */}
      <div className="rounded-[8px] border border-base-200/70 bg-white divide-y divide-base-100">
        <MoneyRow label="Total">{totalNode}</MoneyRow>
        {(totalSet || collected > 0) && (
          <MoneyRow label="Collected">
            <span className="font-mono text-[12px] text-success">
              {RM(collected)}
            </span>
          </MoneyRow>
        )}
        {!totalSet ? (
          <div className="px-3 py-1.5 text-[11px] text-base-400">
            Set total to calculate balance
          </div>
        ) : paidInFull ? (
          <MoneyRow label="Outstanding" strong>
            <span className="pill pill-confirmed text-[11px]">Paid ✓</span>
          </MoneyRow>
        ) : (
          <>
            <MoneyRow label="Outstanding" strong>
              {outstandingBig}
            </MoneyRow>
            {collected === 0 && collectByLabel && (
              <div className="px-3 py-1.5 text-[11px] text-base-400">
                Collect by {collectByLabel}
              </div>
            )}
          </>
        )}
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

      {/* Bottom actions — + Add payment (the ONE flame CTA while expanded;
          opens the drawer-level 2-col modal) · Remind + Chase to the CUSTOMER
          (both stamp the ONE shared chase log). On delivery-eve the Remind
          flips to the firmer final-reminder tone. */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onAddPayment}
          className="btn-hero text-[12px]"
        >
          + Add payment
        </button>
        {totalSet && outstanding > 0 && (
          <>
            <button
              type="button"
              onClick={onRemind}
              title={
                deliveryEve
                  ? "Copy the delivery-eve FINAL reminder + log the chase event"
                  : "Copy the gentle payment reminder + log the chase event"
              }
              className={REMIND_BTN}
            >
              {deliveryEve ? "Final reminder" : "Remind"}
            </button>
            <button
              type="button"
              onClick={onChase}
              title="Copy the firmer payment chase + log the chase event"
              className={CHASE_BTN}
            >
              Chase
            </button>
          </>
        )}
      </div>
      {lastChasedAt && (
        <div className="text-[11px] text-base-400">
          Last chased {fmtDate(lastChasedAt)}
        </div>
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
          className={`text-[9px] font-bold py-[3px] px-[7px] border rounded-[3px] ${stColor}`}
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

