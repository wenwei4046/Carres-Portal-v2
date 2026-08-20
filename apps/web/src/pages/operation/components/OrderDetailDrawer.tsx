import {
  type ReactNode,
  type MutableRefObject,
  Fragment,
  useEffect,
  useRef,
  useState,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowRight,
  Bed,
  BedDouble,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  MessageCircle,
  Plus,
  Printer,
  Download,
  ExternalLink,
  FileText,
  Flag,
  MapPin,
  MoreVertical,
  Package,
  PackagePlus,
  Wrench,
  Paperclip,
  Pencil,
  Phone,
  RotateCcw,
  ScrollText,
  LifeBuoy,
  Sofa,
  Truck,
  Undo2,
  Wallet,
  Warehouse,
  Upload,
  User,
  X,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  purchasingActionButton,
  computeStorageFee,
  defaultStorageStart,
  normalizeSkuKey,
  DELIVERY_TIME_SLOTS,
  isSundayIso,
  isLivePayment,
  orderMoney,
  deliveryGroupOf,
  deliveryGroupLabel,
  orderDeliveryGroups,
  type DeliveryGroupKey,
  displayGuaranteeId,
  effectiveGuaranteeStatus,
  deliveryDateGapFact,
  orderActionButton,
  updateOrderInputSchema,
  type OpsStockListResponse,
  type OpsOrderControl,
  type OrderPaymentMethod,
  type OrderActionTrack,
} from "@carres/shared";
import { apiFetch, ApiError } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { ATTACHMENTS_BUCKET } from "@/lib/storage";
import {
  renderDoPdf,
  renderReceiptPdf,
  renderInvoicePdf,
  renderSalesOrderPdf,
  renderPoPdf,
} from "@/lib/pdf/render";
import type {
  DoTemplateData,
  InvoiceTemplateData,
  SalesOrderTemplateData,
  PoTemplateData,
} from "@/lib/pdf/types";
import {
  qk,
  useOperationOrder,
  useRecheckStockMutation,
  useOrderLoans,
  useLoanSofa,
  useOperationSuppliers,
  useDeliveryPartners,
  useUpdateOrder,
  useOrderPayments,
  useRecordPayment,
  useVoidPayment,
  useSaveOrderControl,
  useConfirmBooking,
  usePartnerBookingCheck,
  useSetPartnerDeliveryRules,
  useDeliveryPhotos,
  useUploadDeliveryPhoto,
  useOrderServiceCases,
  useOrderGuarantees,
  type OrderPaymentRow,
  type operationOrderDetailLine,
  type operationOrderDetailPo,
} from "@/lib/queries";
import { cjkClassName } from "@/lib/cjk";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { displayCustomerName } from "@/lib/customer-name";
import { orderStatusPill } from "@/lib/status-pill";
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
} from "@/lib/wa-templates";
import {
  lineCategory,
  resolvedCategory,
  lineSize,
  lineKind,
  lineSortRank,
  defaultLineLocation,
  stockMatchKey,
} from "@/lib/line-category";
import { useAuth } from "@/lib/auth";
import { Modal } from "./Modal";
import { SectionCard, SectionBand } from "@/components/SectionPanel";
import Btn from "@/components/Btn";
import GuaranteeCoverStrip from "@/components/GuaranteeCoverStrip";
import Money from "@/components/Money";
import { fieldCls } from "@/components/Field";
import BookingSpine from "./BookingSpine";
import DeliveryChain from "./DeliveryChain";
import LoanPanel from "./LoanPanel";
import { MiniStopsBar, StopsEditor } from "./RouteJourneyBar";
import {
  useOrderControlForm,
  RoutingFields,
  LogisticEtaField,
  StorageCollectWaiver,
  StorageExtensionRow,
  RemarkControlField,
  OrderControlSaveBar,
  FieldGrid,
  FieldRow,
} from "./OrderControlPanel";
import ServiceNoteModal from "./ServiceNoteModal";
import GenerateInvoiceOverlay from "./GenerateInvoiceOverlay";
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
import AnnotationTimeline from "./AnnotationTimeline";
import ChangeRequestsPanel from "./ChangeRequestsPanel";
import OrderDocuments, {
  deriveOrderDocuments,
  countDocumentsOnFile,
  countDocumentsMissing,
  documentsMissingToState,
  type OrderDocRow,
} from "./OrderDocuments";
import RelatedCases, {
  deriveRelatedCases,
  countRelatedCases,
  countOpenCases,
  type RelatedCaseRow,
} from "./RelatedCases";
import OrderJourneyHeader, {
  deriveOrderJourney,
  type OrderJourneySignals,
} from "./OrderJourneyHeader";
import DelayPlanningPanel from "./DelayPlanningPanel";
import OrderActionList from "./OrderActionList";
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
  nav?: DrawerNav;
  /** J3 — the ladder's OWN answer for this order, computed by the Orders list
   *  (see `journeySignalsFor`). Optional: absent means the order was not in the
   *  loaded list, and the journey strip renders nothing rather than run a
   *  second derivation that could disagree with the row it came from. */
  journey?: OrderJourneySignals;
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

/** C1 (Jess 2026-07-27): `Pending` is a banned word — pending on WHAT? This
 *  stage means the PO is out and the goods have not landed, so it says that.
 *  NOTE this is the DRAWER's own stage set and `scheduled` here is
 *  `operation_stage = dispatched | ready_to_dispatch` — NOT the list's
 *  customer-confirmed booking, so the two deliberately keep different words. */
const PIPELINE_LABEL: Record<PipelineStatus, string> = {
  needs_setup: "Needs setup",
  proceed: "Proceed",
  pending: "Goods not in",
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

/** Prev/next stepping through the list the drawer was opened from. */
export type DrawerNav = {
  index: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
};

export default function OrderDetailDrawer({
  orderId,
  onClose,
  nav,
  journey,
}: Props) {
  const { data, isLoading, isError, error, refetch } = useOperationOrder(orderId);

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

  // ⭐ CARD 4B · SINGLE PO CREATION AUTHORITY (2026-08-11).
  //
  // `gotoProcurementWithPrefill` lived here. It walked this order's shortages
  // and jumped to /operation/procurement carrying a `CreatePOModal` prefill, so
  // the drawer was a Purchase Order creation door in everything but name — the
  // modal it opened called `operation_create_po` / `operation_create_pos_batch`,
  // both now out of the browser's reach (migration 0339).
  //
  // It is REMOVED, not rerouted. Card 4B forbids replacing it with another PO
  // creation shortcut, so there is deliberately no "open Batch Purchase for this
  // order" button here either. Shortages become `purchase_demands` and are
  // issued by Batch Purchase through `purchasing_issue_pos_batch(jsonb)`.

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
              nav={nav}
              data={data}
              journey={journey}
              onClose={onClose}
              onDispatchClick={() => setShowDispatch(true)}
              onDOClick={() => setShowDO(true)}
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
          className="p-1 text-strong text-base-700 hover:text-base-900 leading-none"
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
          className="p-1 text-strong text-base-700 hover:text-base-900 leading-none"
        >
          ×
        </button>
      </div>
      <div className="rounded-[4px] bg-destructive/10 border border-destructive/30 p-4 text-body">
        <div className="text-destructive font-semibold mb-2">
          Couldn&rsquo;t load order
        </div>
        <div className="text-meta text-base-700 mb-3">{message}</div>
        <Btn size="sm" onClick={onRetry}>
          Retry
        </Btn>
      </div>
    </div>
  );
}

interface DrawerBodyProps {
  nav?: DrawerNav;
  data: NonNullable<ReturnType<typeof useOperationOrder>["data"]>;
  /** J3 — see Props.journey. */
  journey?: OrderJourneySignals;
  onClose: () => void;
  onServiceNoteClick: () => void;
  onDispatchClick: () => void;
  onDOClick: () => void;
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
  leading,
  summary,
  actions,
  collapsedAction,
  grow,
  defaultOpen = true,
  className,
  children,
}: {
  title: string;
  /** Optional step badge before the title — ties this tab header to its
   *  journey-spine node (same number + colour). */
  leading?: ReactNode;
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
        leading={leading}
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
      {/* v4 "box = clickable": the panel ⋮ is the SAME boxed round icon
          button as the strip's (sm 24px — it lives inside a band). */}
      <Btn
        iconOnly
        size="sm"
        aria-label="Panel actions"
        title="Panel actions"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical size={14} />
      </Btn>
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
                className="w-full text-left px-3 py-1.5 text-meta flex items-center gap-2 hover:bg-hovertint disabled:opacity-40"
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
/* `dayMon` is DELETED (owner ruling 2026-08-15). Loo's D1 chip spec — day and
 * month, no year, no weekday — was implemented by regexing the year back off
 * `fmtDateShort`. THE YEAR RULE means `fmtDateShort` already answers "23 Aug"
 * for a current-year date, and answers "15 Jan 27" for the one case where the
 * regex was hiding the fact that mattered. The chips call it directly. */

/** Chip form of a time slot: "Afternoon (12pm–3pm)" → "12pm–3pm"; free text
 *  passes through unchanged. */
const shortSlot = (slot: string) => /\(([^)]+)\)/.exec(slot)?.[1] ?? slot;

function MiniBadge({
  tone,
  children,
}: {
  tone: "nopo" | "waiting" | "ready" | "kv" | "outstation" | "muted";
  children: ReactNode;
}) {
  // v4 §6 — status = soft tint + dark same-hue text, NEVER a solid block
  // (the old solid-red nopo badge is gone). red = blocks · amber = warning ·
  // green = ok; values from docs/UI-KIT.md §1.
  const TONE: Record<string, string> = {
    nopo: "bg-[#FCEBEB] text-[#A32D2D]",
    waiting: "bg-[#FAEEDA] text-[#854F0B]",
    ready: "bg-[#EAF3DE] text-[#3B6D11]",
    kv: "bg-[#EAF3DE] text-[#3B6D11]",
    outstation: "bg-[#FAEEDA] text-[#854F0B]",
    muted: "bg-base-100 text-base-500",
  };
  return (
    /* v4 §11e — the ONE pill spec: 11/600, px-2 py-0.5, rounded-full. */
    <span
      className={`text-meta font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

// (ReadinessBadge removed 2026-07-13 — the Items header now shows
//  "<ready> ready · <toReserve> to reserve" inline, from the shared lineReadiness.)



/** 42px listing-thumb fallback — the line's CATEGORY icon (no product photos
 *  in the order payload yet; when photoUrl lands, render it here instead). */
function CatIcon({
  cat,
}: {
  cat: "mattress" | "bedframe" | "sofa" | "acc" | "service";
}) {
  const I =
    cat === "mattress"
      ? BedDouble
      : cat === "bedframe"
        ? Bed
        : cat === "sofa"
          ? Sofa
          : cat === "service"
            ? Wrench
            : Package;
  return <I size={18} strokeWidth={2} aria-hidden="true" />;
}

// (DeliveryStep — the rev24 4-node in-tab spine — retired 2026-07-19 for the
// grounded Delivery card, Loan-template language. The whole-order journey spine
// stays in the left rail.)

/** rev23 (Jess) — the Customer-request NOTES are an auto-dated LOG, not one
 *  overwrite box: "18 Jul · wants 15 July" stacks on "12 Jul · prefers
 *  Saturday — told NETS". Everything still lives in the ONE customer_request
 *  text column (newline per entry, newest first) — zero migration, the list
 *  tooltip + Master export keep reading it; casual date-chatter lands HERE so
 *  the one-time formal Postponed extension isn't burned on small talk. */
function DeliveryNotesLog({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const entries = value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    // Date law (Jess rev25): every shown date = "31 Jul 26".
    const stamp = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
    onCommit([`${stamp} · ${text}`, ...entries].join("\n"));
    setDraft("");
  };
  return (
    <div className="min-w-0">
      {entries.map((e, i) => (
        <div
          key={i}
          className="text-meta text-base-700 py-1 border-b border-base-100/70 last:border-b-0"
        >
          {e}
        </div>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
        }}
        onBlur={add}
        placeholder="+ add note — date stamps itself"
        aria-label="Add a customer note (auto-dated)"
        className="mt-1 w-full border border-base-300 rounded-[5px] bg-white px-1.5 py-0.5 text-body outline-none hover:border-base-400 focus:border-primary placeholder:text-base-300"
      />
    </div>
  );
}

/** The drawer's detail tabs (Jess 2026-07-17): Items+Warehouse share ONE tab;
 *  every other panel is its own tab. Contents stay mounted behind `hidden`. */
type DrawerTab =
  | "items"
  | "delivery"
  | "balance"
  | "storage"
  | "loan"
  | "documents"
  /** J2 — only reachable when the order actually HAS a case (the tab hides
   *  itself otherwise), so this state is never entered on an order with none. */
  | "cases"
  | "activity";

/** Track tone — drives the tab-rail alert dots. */
type KpiTone = "success" | "warning" | "danger" | "neutral";

/** Dial states (MASTER SPEC §8) — NO blue: Unpaid/No-stock = gray · Deposit/
 *  Partial/Arriving = amber · Overdue/Delayed = red · Paid/Ready = green. */
type DialState = "gray" | "amber" | "red" | "green";
const DIAL_COLOR: Record<DialState, { main: string; soft: string }> = {
  gray: { main: "var(--dial-gray)", soft: "var(--dial-gray-soft)" },
  amber: { main: "var(--dial-amber)", soft: "var(--dial-amber-soft)" },
  red: { main: "var(--dial-red)", soft: "var(--dial-red-soft)" },
  green: { main: "var(--dial-green)", soft: "var(--dial-green-soft)" },
};

/** A pie SECTOR from 12 o'clock, clockwise, `frac` of the full circle. */
function sectorPath(cx: number, cy: number, r: number, frac: number): string {
  const a = frac * 2 * Math.PI - Math.PI / 2;
  const x = cx + r * Math.cos(a);
  const y = cy + r * Math.sin(a);
  const large = frac > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${x} ${y} Z`;
}

/** PieDial (MASTER SPEC §8, rebuilt 2026-07-18) — a filled-SECTOR dial:
 *  soft-tinted disc + 2.5 ring, the sector fills the REAL fraction, and a
 *  CHECK replaces the sector at full. Sits BESIDE the KPI headline value —
 *  never on a stage row. Palette = the 4 dial states (no blue). */
function PieDial({
  fraction,
  state,
  px = 24,
}: {
  fraction: number;
  state: DialState;
  /** Rendered box in px. (Named `px`, not `size`: RULE C reserves `size={N}`
   *  for Lucide icons.) */
  px?: number;
}) {
  const c = DIAL_COLOR[state];
  const f = Math.max(0, Math.min(1, fraction));
  const full = f >= 1;
  return (
    <span
      className="inline-grid place-items-center shrink-0 align-middle"
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      {/* viewBox 28: r12 ring + 2.5 stroke (SPEC §8 geometry). */}
      <svg width={px} height={px} viewBox="0 0 28 28">
        <circle cx={14} cy={14} r={12} fill={c.soft} stroke={c.main} strokeWidth={2.5} />
        {!full && f > 0 && <path d={sectorPath(14, 14, 12, f)} fill={c.main} />}
        {full && (
          <polyline
            points="8.5,14.5 12.5,18.5 19.5,10.5"
            fill="none"
            stroke={state === "green" ? "var(--dial-check)" : c.main}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
  );
}

/** One ACTIONS row — a counterparty someone has to reach right now. */
interface CallsRow {
  key: string;
  label: string;
  sub: string;
  /** Hover detail when the sub is abbreviated (e.g. the full PO list behind
   *  a "2 POs" count). Falls back to the sub itself. */
  subTitle?: string;
  /** red dot = overdue (sorts on top) · amber dot = due soon. */
  urgency: "overdue" | "attention";
  onAct: (tone: "reminder" | "chase") => void;
  /** Row click → the tab where this is WORKED (supplier→Items,
   *  logistics→Delivery, customer→Balance). Actions▾ stays the message. */
  onOpen?: () => void;
}

/** Relative "how long ago" for the last-message stamp — truncation-proof. */
function agoWord(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** CALLS (MASTER SPEC §7, B2. `Chase now` → `Actions` by C1 when Jess banned the
 *  word; `Actions` → **`Calls`** by C6, because that name was then on TWO blocks
 *  of one drawer — this panel and the dynamic checklist below the journey strip —
 *  and COPY-STANDARD rule 8 is "same word app-wide". Jess ruled 2026-07-28: the
 *  checklist KEEPS `Actions`, because it is literally a list of open actions and
 *  the dictionary already gives that column its plural word, and THIS panel
 *  renames. `Calls` is not a new word: it is the verb this whole panel is made of
 *  — `Call` = outward communication whose outcome is recorded, one of the five —
 *  and it is already in the panel's own locked empty state,
 *  `0 calls to make · everything on track.`). The left-rail panel
 *  that owns ALL the outward calls: one row per COUNTERPARTY — supplier (POs
 *  merged per supplier, §13) / logistics / owing customer.
 *  Colour discipline: the DOT + the overdue FACT line carry the red; the
 *  counterparty name stays ink (red marks what's wrong, not who). Overdue
 *  sorts on top; Actions▾ = Remind / Call (the two message tones, same language
 *  as the Items rows' menu). `lastChasedAt` = the shared order-level stamp
 *  (0221; populates once the API deploys). */
function CallsPanel({
  rows,
  lastChasedAt,
  collapsed,
}: {
  rows: CallsRow[];
  lastChasedAt: string | null;
  /** UI-KIT §1.4 rule 1 — Current Action is ALWAYS VISIBLE. The rail may
   *  collapse to 56px, but this block may not vanish with it: it is the reason
   *  the record is open, and a user must never expand something to find out
   *  what to do today. Collapsed = the same truth in icon form. */
  collapsed?: boolean;
}) {
  if (collapsed) {
    const overdueN = rows.filter((r) => r.urgency === "overdue").length;
    return (
      <div
        className="kpi-box grid place-items-center py-2 shrink-0"
        title={
          rows.length === 0
            ? "Calls — 0 calls to make"
            : `Calls — ${rows.map((r) => `${r.label} · ${r.sub}`).join(" / ")}`
        }
      >
        <span className="relative">
          <Bell size={18} strokeWidth={2} aria-hidden="true" className="text-base-500" />
          {rows.length > 0 && (
            <span
              aria-hidden="true"
              className={`absolute -top-1 -right-1.5 min-w-4 h-4 px-1 rounded-full ring-2 ring-white grid place-items-center text-label font-semibold text-white ${
                overdueN > 0 ? "bg-danger" : "bg-warning"
              }`}
            >
              {rows.length}
            </span>
          )}
        </span>
        {/* The screen reader gets the panel's own locked words, never a second
            spelling invented for the collapsed state. */}
        <span className="sr-only">
          {rows.length === 0
            ? "0 calls to make"
            : `${rows.length} calls to make`}
        </span>
      </div>
    );
  }
  return (
    <div className="kpi-box shrink-0">
      <span className="flex items-baseline gap-2 mb-1">
        <span className="text-meta font-semibold uppercase tracking-[0.05em] text-base-500">
          Calls
        </span>
        {rows.length > 0 && lastChasedAt && (
          <span
            className="ml-auto text-meta text-base-400 whitespace-nowrap"
            title={`Last message copied ${fmtDate(lastChasedAt)}`}
          >
            last message {agoWord(lastChasedAt)}
          </span>
        )}
      </span>
      {rows.length === 0 ? (
        <span className="flex items-center gap-1.5 min-h-9 text-meta font-medium text-success">
          <Check size={14} strokeWidth={2.5} aria-hidden="true" />
          0 calls to make · everything on track.
        </span>
      ) : (
        rows.map((r) => (
          <div
            key={r.key}
            className={`flex items-center gap-2 min-h-9 min-w-0 ${
              r.onOpen
                ? "cursor-pointer rounded-[6px] -mx-1 px-1 hover:bg-hovertint"
                : ""
            }`}
            onClick={r.onOpen}
            role={r.onOpen ? "button" : undefined}
            title={r.onOpen ? "Open where this is worked" : undefined}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                r.urgency === "overdue" ? "bg-danger" : "bg-warning"
              }`}
              /* "Attention" is a banned word — it names a mood, not the work. */
              title={r.urgency === "overdue" ? "Overdue" : "Due soon"}
              aria-label={r.urgency === "overdue" ? "Overdue" : "Due soon"}
            />
            <span className="min-w-0 flex-1">
              <span
                className="block text-body font-medium leading-tight truncate text-base-900"
                title={r.label}
              >
                {r.label}
              </span>
              <span
                className={`block text-meta truncate ${
                  r.urgency === "overdue"
                    ? "text-danger font-medium"
                    : "text-base-500"
                }`}
                title={r.subTitle ?? r.sub}
              >
                {r.sub}
              </span>
            </span>
            {/* The two message TONES, in the canonical words: `Remind` is the
                pre-deadline follow-up, `Call` the firm one. The row above
                already names the party and what is outstanding. */}
            <RowManageMenu
              items={[
                { label: "Remind", onClick: () => r.onAct("reminder") },
                { label: "Call", onClick: () => r.onAct("chase") },
              ]}
            />
          </div>
        ))
      )}
    </div>
  );
}

/** One CURRENT ISSUES row — a state that is holding this order up. */
interface CurrentIssueRow {
  key: string;
  /** UI-KIT §1.4 rule 4 — the SAME three business categories the list row's
   *  dots use. The type is `OrderActionTrack` from packages/shared, so a
   *  fourth category does not compile and the list and the drawer structurally
   *  cannot speak two vocabularies. */
  track: OrderActionTrack;
  /** A FACT, never a to-do — the to-do is ACTIONS, one block above. */
  text: string;
  tone: "danger" | "warning";
  onOpen?: () => void;
}

const ISSUE_TRACK: Record<
  OrderActionTrack,
  { icon: LucideIcon; label: string }
> = {
  goods: { icon: Package, label: "Goods" },
  delivery: { icon: Truck, label: "Delivery" },
  money: { icon: Wallet, label: "Money" },
};
/** Law 6 order — goods · delivery · money, the same order the list row's dots
 *  render in. */
const ISSUE_TRACK_ORDER: OrderActionTrack[] = ["goods", "delivery", "money"];

/** CURRENT ISSUES (UI-KIT §1.4 ③) — what is stopping this order RIGHT NOW,
 *  grouped by the three business tracks.
 *
 *  Why it exists: the five reasons an order stalls were readable only by
 *  assembling them yourself out of a spine node, a tab dot and two tab bodies,
 *  so no single surface answered "why is this stuck".
 *
 *  Why it is not ACTIONS: that block names a COUNTERPARTY and carries the
 *  message buttons — it answers *who to call*. This one answers *what is
 *  wrong*, including the things nobody can be called about.
 *
 *  §1.4 rule 2 — it AUTO-HIDES when there is nothing wrong. No "✓ None", no
 *  empty card, no reassuring tick: an ERP exists to say where today is not
 *  normal, and §1.3 is a height budget this block only draws against when it
 *  has earned it. */
function CurrentIssuesPanel({
  rows,
  collapsed,
}: {
  rows: CurrentIssueRow[];
  collapsed?: boolean;
}) {
  if (rows.length === 0) return null;
  const danger = rows.some((r) => r.tone === "danger");
  if (collapsed) {
    return (
      <div
        className="kpi-box grid place-items-center py-2 shrink-0"
        title={`Current issues — ${rows.map((r) => r.text).join(" / ")}`}
      >
        <span className="relative">
          <AlertCircle
            size={18}
            strokeWidth={2}
            aria-hidden="true"
            className={danger ? "text-danger" : "text-warning"}
          />
          <span
            aria-hidden="true"
            className={`absolute -top-1 -right-1.5 min-w-4 h-4 px-1 rounded-full ring-2 ring-white grid place-items-center text-label font-semibold text-white ${
              danger ? "bg-danger" : "bg-warning"
            }`}
          >
            {rows.length}
          </span>
        </span>
        <span className="sr-only">
          {rows.length} current issue{rows.length > 1 ? "s" : ""}
        </span>
      </div>
    );
  }
  return (
    <div className="kpi-box shrink-0">
      <span className="flex items-baseline gap-2 mb-1">
        <span className="text-meta font-semibold uppercase tracking-[0.05em] text-base-500">
          Current issues
        </span>
        <span className="ml-auto text-meta text-base-400 whitespace-nowrap">
          {rows.length}
        </span>
      </span>
      {ISSUE_TRACK_ORDER.flatMap((track) => {
        const inTrack = rows.filter((r) => r.track === track);
        if (inTrack.length === 0) return [];
        const { icon: Icon, label } = ISSUE_TRACK[track];
        return inTrack.map((r, i) => (
          <div
            key={r.key}
            className={`flex items-center gap-2 min-h-9 min-w-0 ${
              r.onOpen
                ? "cursor-pointer rounded-[6px] -mx-1 px-1 hover:bg-hovertint"
                : ""
            }`}
            onClick={r.onOpen}
            role={r.onOpen ? "button" : undefined}
            title={r.onOpen ? `${label} — open where this is worked` : label}
          >
            {/* The track icon labels the group; only the FIRST row of a track
                carries it, so three issues on one track read as one group. */}
            <span className="w-4 shrink-0 grid place-items-center text-base-400">
              {i === 0 ? (
                <Icon size={14} strokeWidth={2} aria-hidden="true" />
              ) : null}
            </span>
            <span
              className={`block min-w-0 flex-1 text-body leading-tight truncate ${
                r.tone === "danger"
                  ? "text-danger font-medium"
                  : "text-base-900"
              }`}
              title={r.text}
            >
              {i === 0 && <span className="sr-only">{label}: </span>}
              {r.text}
            </span>
          </div>
        ));
      })}
    </div>
  );
}

/** Clean SKU CODE for the Items SKU column (§9) — the trailing model code
 *  ("Lumi FirmCare-L1201F-Q" → "L1201F-Q"); no code (accessories/services)
 *  → em-dash, never the lowercase normalize slug. */
function skuCode(sku: string): string {
  const m = sku.trim().match(/([A-Za-z]{0,3}\d{3,}[A-Za-z]{0,2}(?:-[A-Za-z])?)\s*$/);
  return m ? m[1].toUpperCase() : "—";
}

/** Site SHORT name for the Items LOCATION column (§9 — "Klang/NETS", never
 *  the full site string). */
function shortSite(loc: string): string {
  const l = loc.toLowerCase();
  if (l.includes("klang")) return "Klang";
  if (l.includes("balakong") || l.includes("houzs")) return "HOUZS";
  if (l.includes("future")) return "NF";
  if (l.includes("supplier")) return "Supplier";
  if (l.includes("ohana")) return "Ohana";
  return loc;
}

/** §9 ACTIONS column — "Actions ▾": the row's secondary actions (Reserve /
 *  Loan / Change route). The row's MUST-DO action renders as its own direct
 *  button beside this menu. Plural, and the same word the list column carries
 *  (Jess 2026-07-27) — a row can have several. */
function RowManageMenu({
  items,
}: {
  items: { label: string; onClick: () => void; disabled?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <Btn size="sm" onClick={() => setOpen((v) => !v)} title="Row actions">
        Actions
        <ChevronDown size={14} aria-hidden="true" />
      </Btn>
      {open && (
        <>
          <span className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <span className="absolute right-0 top-full mt-1 w-40 z-20 bg-white border border-base-200 rounded-[8px] shadow-lg py-1 block">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className="w-full text-left px-2.5 py-1.5 text-meta hover:bg-hovertint disabled:opacity-40"
              >
                {it.label}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}

/** One PO-led follow-up target — a supplier (portal PO) or a bare AutoCount PO
 *  number, with the category lines it covers. */
interface ChaseGroup {
  key: string;
  /** Supplier name when known, else the PO number itself. */
  label: string;
  poNo: string;
  lines: { sku: string; qty: number }[];
  eta: string | null;
  overdue: boolean;
}

/** One category row of the Stock card (Option A, 2026-07-18). */
interface StockCat {
  cat: "mattress" | "bedframe" | "sofa" | "acc";
  label: string;
  ready: number;
  total: number;
  allReady: boolean;
  /** PO-led follow-up targets, overdue first. */
  groups: ChaseGroup[];
  /** The row's supplier-status readout ("in stock" / "no PO" / "<sup> · ETA x"). */
  status: string;
  /** Stalled / overdue — the follow-up turns hot. */
  hot: boolean;
}



function DrawerBody({
  nav,
  data,
  journey,
  onClose,
  onDispatchClick,
  onDOClick,
  onAbandonClick,
  onConfirmProceedClick,
  onTransferReadyClick,
  onTopUpClick,
  onServiceNoteClick,
  onFollowUpClick,
}: DrawerBodyProps) {
  const { order, lines, addons, total, pos } = data;
  // Defensive default: an API build that predates freeUnits (web can deploy
  // ahead of the Worker) must not crash the drawer — just no picker until then.
  const freeUnits = data.freeUnits ?? [];
  const qc = useQueryClient();
  // Ready picker (Jess 2026-06-30): which line's reserve dialog is open + the
  // free units grouped by normalized key, so each line resolves its real
  // available units across the order/warehouse naming drift.
  const [pickerSku, setPickerSku] = useState<string | null>(null);
  // Option C (Jess 2026-07-17 rev 6): Items takes FULL width; the Warehouse
  // picker slides in on the RIGHT only when a line's Reserve is clicked.
  const [pickerOpen, setPickerOpen] = useState(false);
  // Route "Option D" — which item's journey legs are expanded in-place (one at a
  // time; the heavy detail stays inside the drawer so the list never gets busy).
  const [routeOpenSku, setRouteOpenSku] = useState<string | null>(null);
  // rev18 — the Stock ETA column edits IN PLACE (click the date → input);
  // the expander no longer repeats it.
  const [etaEditSku, setEtaEditSku] = useState<string | null>(null);
  // §7.6 — the Delivery card's multi-leg "Logistics / route" block is HIDDEN by
  // default (the Logistics dropdown is the default route); it expands behind
  // "+ Add stop" and stays open once the order actually has legs.
  const [showRouteBlock, setShowRouteBlock] = useState(false);
  // rev23 — "Postponed? →" reveals the one-time formal extension recorder
  // (0196); casual date chatter goes to the NOTES log instead.
  const [postponeOpen, setPostponeOpen] = useState(false);
  // rev25 — the auto-reminder −Nd tuner hides behind a click (0/162 ever
  // changed it; the 0197 cron fires the task by itself).
  const [editingChaseDays, setEditingChaseDays] = useState(false);
  // Lifted so the Customer panel's ⋮ "Edit details" can trigger the card's own
  // safe-edit mode (every panel gets a ⋮ — Jess 2026-07-11).
  // Customer identity lives in the header strip now (Jess 2026-07-15): the
  // name is the anchor; ▾ expands the full-width customer block inline.
  // Add-payment modal lifted to the drawer level (v4 panel rebuild): the
  // Balance band's collapsed "+ Add payment" shortcut must work while the
  // panel body (MoneyCard) is unmounted.
  const [addingPayment, setAddingPayment] = useState(false);
  // §10 Generate invoice — the full-screen charges + live-preview overlay.
  const [invoiceOverlayOpen, setInvoiceOverlayOpen] = useState(false);
  // GRN — receive an open linked PO right here (Jess: receive in the order).
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
  // rev20 (Jess) — UNRESERVE: put a picked unit back to free stock and choose
  // again. Two-step inline confirm on the ✓ Ready pill (no browser dialog):
  // first click arms "↩ Unreserve?", second click releases ONE unit reserved
  // to this SO for that line (POST /api/ops/stock/release — the same endpoint
  // the Stock page uses).
  const [unreserveSku, setUnreserveSku] = useState<string | null>(null);
  const releaseStock = useMutation({
    mutationFn: (itemId: string) =>
      apiFetch("/api/ops/stock/release", {
        method: "POST",
        body: JSON.stringify({ itemId }),
      }),
    onSuccess: () => {
      toast.success("Unreserved — the unit is back in free stock");
      setUnreserveSku(null);
      void qc.invalidateQueries({ queryKey: ["operation", "ops-stock"] });
      void qc.invalidateQueries({ queryKey: qk.operation.order(order.id) });
    },
    onError: (e: Error) => {
      setUnreserveSku(null);
      toast.error(`Couldn't unreserve — ${e.message}`);
    },
  });
  const reservedUnitIdFor = (sku: string): string | null =>
    (reservedUnitsQuery.data?.items ?? []).find(
      (u) =>
        u.reservedRef === soRef &&
        stockMatchKey(u.sku) === stockMatchKey(sku),
    )?.id ?? null;
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
    lines.reduce<Record<string, { sku: string; qty: number; category?: string | null }>>((acc, l) => {
      // D9 (2026-08-20) — the CATALOG's category rides through the merge. It is
      // a property of the SKU, so every duplicate row carries the same value:
      // seed it once and never overwrite. `e.category ?? l.category` would be
      // wrong — it turns a legitimate `null` (asked, catalog silent) into a
      // later row's `undefined` (nobody asked), and those two mean different
      // things downstream.
      const e = acc[l.sku] ?? { sku: l.sku, qty: 0, category: l.category };
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
  // Date law (Jess rev25): shown dates are "31 Jul 26" — no weekday tail.
  const contactByLabel =
    !order.delivery_date_tbd && order.delivery_date
      ? fmtDate(
          new Date(new Date(order.delivery_date).getTime() - contactByDays * 86_400_000)
            .toISOString()
            .slice(0, 10),
        ).split(", ")[0]
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

  const nopoN = rCounts.noPo;
  // Every goods line is reserved to this SO. Empty goods list (service-only) is
  // NOT "all received". Feeds the pipeline status + delivered gating.
  const allReceived = goodsLines.length > 0 && readyN === goodsLines.length;

  // T8 delivery groups — per-group readiness for the split flow. Deliberately
  // NOT `readinessOf`: that one also counts free shelf stock and the operator's
  // Master-sheet override, which the booking gate (correctly) ignores. Offering
  // a split the server would then refuse is worse than offering none, so this
  // hint feeds the gate the SAME inputs the API does — reserved-to-this-SO only.
  const bookingGroupStates = orderDeliveryGroups(goodsLines).map((key) => ({
    key,
    ready: goodsLines
      .filter((l) => deliveryGroupOf(l.sku) === key)
      .every(
        (l) =>
          lineReadiness({
            sku: l.sku,
            qty: l.qty,
            reservedCount: reservedCountOf(l.sku, lineReceivedOf(l.sku)),
            freeCount: 0,
            hasPo: false,
          }) === "reserved",
      ),
  }));

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

  // Collect-before-delivery gate (Jess 2026-07-02), keyed to the logistics date
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
  // ── Money (C5, 2026-07-27) — Total / Collected / Outstanding through the ONE
  //    shared rule (`orderMoney`), the same one the Orders row's 🔒 and the
  //    server's booking gate ask, so the three can never disagree about a
  //    number that decides whether a delivery goes out.
  //
  //    Collected was Σ of the `order_payments` ledger. That table holds ZERO
  //    rows and no live payment path writes it, so this drawer showed the full
  //    order value outstanding for every customer — SO-1209 read "RM 7,248
  //    outstanding · HOLD DELIVERY" while `orders.paid` said it was paid in
  //    full. `orders.paid` is the money truth (`top_up_order`, Stripe, and the
  //    AutoCount import all write it). The ledger is still fetched below for
  //    the payment HISTORY list and for storage collections.
  const ledger = paymentsQuery.data?.payments ?? [];
  const keyedBalance = form.draft.balance.trim()
    ? Number(form.draft.balance)
    : form.control?.balance ?? null;
  const money = orderMoney({
    lineSum: hasLineTotal ? grandTotal : 0,
    paid: order.paid,
    controlBalance: keyedBalance,
  });
  const collected = money.paid;
  const orderTotal = money.total ?? 0;
  const totalSet = money.known;
  const moneyOutstanding = money.goodsOwing;
  const balanceOwing = money.owing;
  // ── AUTO storage (Jess 2026-07-18): the machine counts, nobody clicks.
  // Anchor = (supplier late ? latest goods ETA : deadline) + 7d — a
  // supplier-late stretch never bills the customer. A manual From date
  // overrides the anchor; an override of exactly 0 = "No storage" exempt.
  const storageDeadline = !order.delivery_date_tbd ? order.delivery_date : null;
  const latestGoodsEta = (() => {
    let m: string | null = null;
    for (const l of goodsLines) {
      const e = form.draft.line_etas[l.sku] ?? poEtaBySku.get(l.sku) ?? null;
      if (e && (!m || e > m)) m = e;
    }
    return m;
  })();
  const deliveredForStorage = pipelineStatus === "completed";
  const supplierLate = !!(
    storageDeadline &&
    latestGoodsEta &&
    latestGoodsEta > storageDeadline &&
    !deliveredForStorage
  );
  const autoStorageAnchor = storageDeadline
    ? defaultStorageStart(supplierLate ? latestGoodsEta : storageDeadline)
    : null;
  const storageExempt = form.storageOverride === 0;
  const effectiveStorageStart =
    form.storageFrom ??
    (!deliveredForStorage &&
    autoStorageAnchor &&
    autoStorageAnchor <= todayIso
      ? autoStorageAnchor
      : null);
  // "incurred" = counting (auto or manual) OR a Master-imported fee — it
  // enters the collect-before-delivery gate. Exempt kills it.
  const storageIncurred =
    !storageExempt &&
    ((hasMsbf || hasSof) && !!effectiveStorageStart ||
      Number(form.control?.storage_fee_msbf ?? 0) > 0 ||
      Number(form.control?.storage_fee_sof ?? 0) > 0);
  // C9 — what stops HOLDING the delivery: collected, or the manager released
  // it. A release is not a payment, so the fee stays in the invoice below and
  // its Collect action stays on the row; only the hold goes.
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
  // ── Balance v3 invoice math (2026-07-17) — the Balance tab reads as an
  // INVOICE: CHARGES (goods + the storage fee) − PAYMENTS (all kinds) =
  // Balance due. The storage FEE flows in as one charge line; the Storage tab
  // owns the detail (rule per STATUS-STANDARD §7.5: start = next same weekday
  // after the deadline; MS/BF RM150/month; sofa 14d free then RM200).
  const storageEndEff =
    form.draft.storage_to.trim() || form.draft.logistic_eta.trim() || todayIso;
  const storageAuto = computeStorageFee({
    startDate: effectiveStorageStart,
    asOf: storageEndEff,
    hasMsbf,
    hasSof,
  });
  // Effective storage charge: exempt 0 > manual override > Master fee > auto.
  const storageCharge = storageExempt
    ? 0
    : storageIncurred
      ? (form.storageOverride ?? (storageFee > 0 ? storageFee : storageAuto.total))
      : 0;
  // 0347 — a VOIDED row is not money. A void has been a STAMP since 0343 (the
  // row survives so the history survives), and every sum over this ledger has
  // to ask the one predicate rather than spell `voided_at` for itself.
  const storageCollected = ledger
    .filter((p) => p.kind === "storage" && isLivePayment(p))
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  /** The newest payment that still stands — what `Print receipt` means. */
  const latestLivePayment = ledger.find(isLivePayment) ?? null;
  const invoiceTotal = orderTotal + storageCharge;
  const collectedAll = collected + storageCollected;
  const balanceDue = totalSet ? Math.max(0, invoiceTotal - collectedAll) : 0;
  // Collect-by = delivery − 7d (the date collectByLabel shows) — past it and
  // still owing ⇒ the dial family reads Overdue.
  const collectByPast =
    deliveryMs !== null && Date.now() > deliveryMs - 7 * 86_400_000;
  // Payment status dial family (STATUS-STANDARD §1): Unpaid / Deposit /
  // Overdue / Paid. "Sent" is omitted — no invoice-sent signal exists today.
  const payStatus: "Unpaid" | "Deposit" | "Overdue" | "Paid" | null = !totalSet
    ? null
    : balanceDue <= 0
      ? "Paid"
      : collectByPast
        ? "Overdue"
        : collectedAll > 0
          ? "Deposit"
          : "Unpaid";
  const payFraction =
    payStatus === "Paid" ? 1 : invoiceTotal > 0 ? collectedAll / invoiceTotal : 0;
  const payToneCls =
    payStatus === "Paid"
      ? "text-success"
      : payStatus === "Overdue"
        ? "text-danger"
        : "text-info";
  // Dial state (§8 — NO blue): Unpaid=gray · Deposit=amber · Overdue=red ·
  // Paid=green. One mapping for the band pill AND the headline dial.
  const payDialState: DialState =
    payStatus === "Paid"
      ? "green"
      : payStatus === "Overdue"
        ? "red"
        : payStatus === "Deposit"
          ? "amber"
          : "gray";
  // Balance panel STATUS pill + status-strip Money cell (batch 2): the ledger
  // Outstanding drives them all, so pill / strip / header sticker never disagree.
  const isOwing = balanceOwing;
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
  // One sparse-save mutation for every instant-saved Delivery field (2A) +
  // the customer-confirmed toggle (0220). NO alert-engine wiring — the list
  // stays unaffected.
  const quickSave = useSaveOrderControl(order.id, {
    onSuccess: () => toast.success("Saved"),
    onError: (e) => toast.error(`Couldn't save — ${e.message}`),
  });
  // Follow-up stamp (0221, deploy-gated) — SILENT on error so a not-yet-
  // deployed API never blocks the message itself (the copy already happened).
  const chaseStamp = useSaveOrderControl(order.id);
  // WhatsApp two-tone chase (docs/whatsapp-chase-templates.md): every audience
  // gets Reminder (gentle first contact) + Call (firmer). COPY the template +
  // log the event; the stored number + wa.me deep link — and the portal
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
  // Full canonical date (date law §A0: weekday ALWAYS on a displayed date) —
  // the Delivery card shows this; deadlineLabel (weekday stripped) stays for
  // the short message-template strings only.
  const deadlineFull = order.delivery_date_tbd
    ? "TBD"
    : order.delivery_date
      ? fmtDate(order.delivery_date)
      : "—";
  // Optional preferred-name/title for customer messages — never auto Mr/Ms.
  // Local-only for now (an ops_order_control column is deploy-gated), keyed by
  // order so it sticks across sessions on this machine.
  const salKey = `ops-salutation:${order.id}`;
  const [salutation] = useState<string>(() => {
    try {
      return localStorage.getItem(salKey) ?? "";
    } catch {
      return "";
    }
  });
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
    // The word in the toast is the TONE of the message that was copied, and
    // C1 banned "Chase": the firm tone is a Call (COPY-STANDARD verb table).
    const toneWord =
      tone === "chase" ? "Call text" : tone === "final" ? "Final reminder" : "Reminder";
    // 1B — wa.me DIRECT send (Jess 2026-07-19). The CUSTOMER has a personal
    // number → open their WhatsApp with the message pre-filled (one tap to send;
    // we never auto-send). Supplier/logistics go to a GROUP (chat.whatsapp.com,
    // no ?text= prefill) → copy the text as before. Clipboard is kept as the
    // desktop fallback regardless.
    void navigator.clipboard.writeText(text);
    const customerWa = aud === "customer" ? waLink(order.customer_phone) : null;
    if (customerWa) {
      window.open(`${customerWa}?text=${encodeURIComponent(text)}`, "_blank");
      toast.success(`${toneWord} — opening WhatsApp to the customer, hit send`);
    } else if (aud === "customer") {
      toast.success(`${toneWord} copied — no customer number on file, paste into WhatsApp`);
    } else {
      toast.success(`${toneWord} copied — paste into the WhatsApp group`);
    }
    // The logged follow-up event — a manual send stamps it; the future portal
    // auto-fire writes the SAME event.
    chaseStamp.mutate({ last_chased_at: new Date().toISOString() });
  };

  // ═══ KPI tracks = the 3 mission tracks (MASTER SPEC §7, A2) ═══
  // Three full-width progress lines; the tones colour each track's CURRENT
  // node. The outward calls live in the left-rail ACTIONS panel.
  // CUSTOMER · money — green paid/0 · amber owing pre-last-call · red owing past
  // the collect gate (the same balanceGate the Balance card shows).
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
  // LOGISTICS — green booked or >3 days left · amber ≤3 days & no date · red
  // deadline passed & no date confirmed.
  const bookedEta = form.control?.logistic_eta ?? null;

  // ═══ Detail tabs (Jess 2026-07-17) — Items+Warehouse share one tab. ═══
  const [tab, setTab] = useState<DrawerTab>("items");
  // Which spine step the operator clicked (Jess 甲 2026-07-19) — disambiguates
  // the two Balance steps (deposit vs balance) so the tab header wears the
  // clicked step's number + colour. null = opened via nav / not a step.
  const [clickedStep, setClickedStep] = useState<number | null>(null);
  // S4 (2026-07-18) — ‹prev/next› keeps the drawer mounted, so `tab` carries
  // across orders; if the new order doesn't offer the current tab (Storage
  // hides without MS/BF/SOF goods), fall back to Items instead of a blank pane.
  useEffect(() => {
    if (tab === "storage" && !(hasMsbf || hasSof)) setTab("items");
  }, [tab, hasMsbf, hasSof]);
  // Item-listing groups (Jess 2026-07-18): Ready collapsible; category groups
  // remember manual toggles (default: all-reserved groups start collapsed).
  const [catOpen, setCatOpen] = useState<Record<string, boolean>>({});
  // Vertical tab rail (Jess 2026-07-17 rev 5) — collapsible to icon-only.
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("ops-drawer-rail") === "1";
    } catch {
      return false;
    }
  });
  const toggleRail = () =>
    setRailCollapsed((v) => {
      try {
        localStorage.setItem("ops-drawer-rail", v ? "0" : "1");
      } catch {
        /* private mode */
      }
      return !v;
    });

  // ═══ Track signals (A2) — shared by the stage arrays + ACTIONS. ═══
  const deliveredDone = pipelineStatus === "completed";
  const goodsN = goodsLines.length;
  const overDeadline = daysToDelivery !== null && daysToDelivery < 0;

  // ═══ J1 — the Documents list, derived at read time ═══
  // Nothing new is stored or fetched for this: the invoice + delivery-order
  // numbers ride the order row, receipts are the payment ledger, purchase
  // orders + their signed supplier DO ride the detail payload, and the photo
  // ledger is T6's own query (asked for only once the order is delivered,
  // since that is the only state where a photo can exist).
  const docPhotosQ = useDeliveryPhotos(order.id, { enabled: deliveredDone });
  const supplierNameOf = (id: string | null): string | null =>
    (suppliersData?.suppliers ?? []).find((s) => s.id === id)?.name ?? null;
  const documentRows = deriveOrderDocuments({
    so: order.so,
    invoiceNo: order.invoice_no ?? null,
    doNumber: order.do_number ?? null,
    // "Left the warehouse" — the transition that auto-issues BOTH the invoice
    // and the delivery order number (0098). Past it, either one absent is a gap.
    dispatched: stage === "dispatched" || stage === "delivered",
    delivered: deliveredDone,
    // 0347 — a voided payment's receipt is not a document on file.
    payments: ledger.filter(isLivePayment).map((p) => ({
      id: p.id,
      receiptNo: p.receipt_no,
      // Only a fallback: a receipt row that has no number yet is named by the
      // day it was paid, in the compact date form the drawer uses elsewhere.
      paidOnLabel: fmtDateShort(p.paid_on),
    })),
    pos: pos.map((p) => ({
      id: p.id,
      supplierName: supplierNameOf(p.supplier_id),
      received: p.status === "received",
      doFilePath: p.do_file_path ?? null,
    })),
    photos: docPhotosQ.data?.photos ?? [],
  });
  const docsOnFile = countDocumentsOnFile(documentRows);
  const docsMissing = countDocumentsMissing(documentRows);
  // Law 7: only the documents whose absence no action already owns may be
  // STATED as something wrong. The badge above keeps counting all of them.
  const healthDocRows = documentsMissingToState(documentRows);

  // ═══ J2 — Related cases: has anything gone wrong on this order? ═══
  // Both reads are silent-when-absent (retry: false) — a case list that fails
  // to load must not break a drawer whose real job is the order itself. The
  // guarantee query shares its key with the Customer block's cover strip, so
  // React Query serves both from ONE request.
  const casesQ = useOrderServiceCases(order.id);
  const orderGuaranteesQ = useOrderGuarantees(order.id);
  const relatedCaseRows = deriveRelatedCases({
    serviceCases: (casesQ.data?.items ?? []).map((c) => ({
      id: c.id,
      caseNo: c.caseNo,
      caseTypeLabel: c.caseTypeLabel,
      statusLabel: c.statusLabel,
      statusIsClosed: c.statusIsClosed,
      openedLabel: fmtDateShort(c.openedAt),
    })),
    guarantees: (orderGuaranteesQ.data?.items ?? []).map((g) => ({
      id: g.id,
      displayId: displayGuaranteeId(g),
      coversLabel: g.coversLabel,
      guaranteeLabel: g.guaranteeLabel,
      claimCaseId: g.claimCaseId,
      claimedLabel: g.claimedAt ? fmtDateShort(g.claimedAt.slice(0, 10)) : "",
      // Expiry is a date fact, never the raw column (guarantee.ts law).
      effectiveStatus: effectiveGuaranteeStatus(g.status, g.expiresOn),
    })),
  });
  const caseCount = countRelatedCases(relatedCaseRows);
  const openCaseCount = countOpenCases(relatedCaseRows);

  // ═══ J3 — the journey strip: where · who · what is wrong ═══
  // The ladder's answer arrives as a prop (see OperationOrdersControl's
  // `journeySignalsFor`), so nothing about the stage, the verb or the owner is
  // recomputed here. This block adds ONLY the two facts the Orders list cannot
  // see, and neither of them contradicts the ladder:
  //   · docsMissing — J1's derived list, drawer-only data. Law 7 (Loo,
  //     2026-07-28) narrows what may reach the HEALTH line to the documents no
  //     action already covers: `documentsMissingToState`. The Documents tab's
  //     own badge still counts every missing row — a records surface may say
  //     what it lacks; what it may not do is say it a second time in the voice
  //     of work the engine already owns.
  //   · moneyOutstanding — the payment LEDGER (order total − collected). The
  //     ladder's PayHold reads `ops_order_control.balance`, which is NULL on
  //     every live order, so the list's money dot correctly reads "no balance
  //     data" while 18 orders genuinely owe. The strip states the ledger fact
  //     and never calls it a hold: a hold is the ladder's word, and the ladder
  //     is not holding this order. See carry-forward
  //     `payhold-blind-to-the-payment-ledger`.
  const journeyView = journey
    ? deriveOrderJourney({
        signals: journey,
        docsMissing: healthDocRows.length,
        docsMissingLabels: healthDocRows.map((r) => r.label),
        ledgerOutstanding: moneyOutstanding,
        ledgerOutstandingLabel: Math.round(moneyOutstanding).toLocaleString(),
        // The amount the ladder itself locked on — its own PayHold input, NOT
        // the ledger's. Empty when the lock is on but no balance is on file.
        holdAmountLabel:
          journey.holdAmount && journey.holdAmount > 0
            ? Math.round(journey.holdAmount).toLocaleString()
            : "",
      })
    : null;
  /** Open one case in the module that OWNS it. This panel states that a case
   *  exists; reading and working it stays where it already lives, so there is
   *  no second place to edit a case. */
  const openRelatedCase = (row: RelatedCaseRow) => {
    if (row.caseId) {
      navigate(`/operation?tab=service-notes&case=${encodeURIComponent(row.caseId)}`);
      return;
    }
    // The guarantee desk's one search box takes the guarantee handle. A claimed
    // guarantee whose handle is somehow absent still lands the operator on the
    // desk filtered to claims rather than nowhere.
    navigate(
      `/operation?tab=guarantees&status=claimed` +
        (row.guaranteeSearch ? `&q=${encodeURIComponent(row.guaranteeSearch)}` : ""),
    );
  };
  /** Open one document. Every path already existed — this is the one place
   *  that routes a row to it, so the panel adds no new way to fetch a file. */
  const openDocument = (row: OrderDocRow) => {
    switch (row.kind) {
      case "sales_order":
        void openSalesOrderPdf(order.id, order.so);
        return;
      case "invoice":
        void openInvoicePdf(order.id, order.so);
        return;
      case "delivery_order":
        void openDoPdf(order.id);
        return;
      case "receipt": {
        const p = ledger.find((r) => r.id === row.paymentId);
        if (p) void openReceipt(p, receiptMetaOf());
        return;
      }
      case "purchase_order":
        if (row.poId) void openPoPdf(row.poId);
        return;
      case "supplier_do":
        if (row.storagePath) void openSupplierDo(row.storagePath);
        return;
      case "delivery_photo":
        if (row.photoUrl) window.open(row.photoUrl, "_blank", "noopener");
        else toast.error("That photo's link expired — reopen the order");
        return;
    }
  };

  // ── STOCK by CATEGORY (KPI rev 10) — one row per core category present:
  // N/M ready + that category's supplier status + its OWN PO-led follow-up.
  // Chase targets group by PO: a portal PO resolves its supplier name; an
  // AutoCount source_po chases by the PO number itself.
  const CAT_WORD = {
    mattress: "Mattress",
    bedframe: "Bedframe",
    sofa: "Sofa",
    acc: "Accessory",
  } as const;
  // An AutoCount source PO carries no supplier id — infer the name from the
  // supplier master ONLY when exactly one supplier covers the category
  // (`cat_covered`, the same convention Create-PO's auto-detect uses).
  // Ambiguous / unmaintained master → keep the PO number, never guess.
  const CAT_COVER_WORD = {
    mattress: "mattress",
    bedframe: "bedframe",
    sofa: "sofa",
    acc: "accessory",
  } as const;
  const uniqueSupplierFor = (cat: keyof typeof CAT_COVER_WORD): string | null => {
    const covers = (suppliersData?.suppliers ?? []).filter((s) =>
      (s.cat_covered ?? []).includes(CAT_COVER_WORD[cat]),
    );
    return covers.length === 1 ? covers[0].name : null;
  };
  const stockCats: StockCat[] = (
    ["mattress", "bedframe", "sofa", "acc"] as const
  ).flatMap((cat) => {
    const catLines = goodsLines.filter((l) => lineCategory(l.sku) === cat);
    if (catLines.length === 0) return [];
    const ready = catLines.filter(
      (l) => readinessOf(l.sku, l.qty) === "reserved",
    ).length;
    const allReady = ready === catLines.length;
    const byPo = new Map<string, ChaseGroup>();
    for (const l of catLines) {
      const k = normalizeSkuKey(l.sku);
      const srcPo = soPoBySku.get(k);
      const portalPo = pos.find((p) =>
        p.lines.some((pl) => normalizeSkuKey(pl.sku) === k),
      );
      const poNo = srcPo ?? (portalPo ? portalPo.id.slice(0, 8) : null);
      if (!poNo) continue;
      const supName = portalPo
        ? (suppliersData?.suppliers.find((sp) => sp.id === portalPo.supplier_id)
            ?.name ?? null)
        : uniqueSupplierFor(cat);
      const eta =
        form.draft.line_etas[l.sku] ??
        poEtaBySku.get(l.sku) ??
        portalPo?.eta_date ??
        null;
      const g =
        byPo.get(poNo) ??
        ({ key: poNo, label: supName ?? poNo, poNo, lines: [], eta: null, overdue: false } as ChaseGroup);
      g.lines.push({ sku: l.sku, qty: l.qty });
      if (eta && (!g.eta || eta < g.eta)) g.eta = eta;
      byPo.set(poNo, g);
    }
    const groups = [...byPo.values()].map((g) => ({
      ...g,
      overdue: !!g.eta && g.eta < todayIso,
    }));
    groups.sort((a, b) => Number(b.overdue) - Number(a.overdue));
    const status = allReady
      ? "in stock"
      : groups.length === 0
        ? "no PO"
        : groups[0].overdue
          ? `${groups[0].label} · overdue`
          : groups[0].eta
            ? `${groups[0].label} · ETA ${fmtDate(groups[0].eta).split(",")[0]}`
            : `${groups[0].label} · no ETA`;
    const hot =
      !allReady &&
      groups.length > 0 &&
      (groups.some((g) => g.overdue) || groups.every((g) => !g.eta));
    return [
      {
        cat,
        label: CAT_WORD[cat],
        ready,
        total: catLines.length,
        allReady,
        groups,
        status,
        hot,
      },
    ];
  });
  // A PO-led supplier chase for ONE group — the category rows + popover use
  // this (fixes the old popover copying the generic first-PO template no
  // matter which supplier was picked).
  const copySupplierChaseFor = (
    g: { label: string; poNo: string; lines: { sku: string; qty: number }[] },
    tone: "reminder" | "chase",
  ) => {
    const text = (tone === "reminder" ? buildSupplierReminder : buildSupplierChase)({
      poNo: g.poNo,
      ref: orderRef,
      lines: g.lines,
      deadline: deadlineLabel,
    });
    void navigator.clipboard.writeText(text);
    toast.success(
      `${tone === "reminder" ? "Reminder" : "Call text"} copied — ${g.label}`,
    );
    chaseStamp.mutate({ last_chased_at: new Date().toISOString() });
  };
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

  // Chase groups merged ACROSS categories by PO (a PO spanning two categories
  // is one counterparty) — un-ready categories only.
  const chaseByPo = new Map<string, ChaseGroup>();
  for (const c of stockCats) {
    if (c.allReady) continue;
    for (const g of c.groups) {
      const prev = chaseByPo.get(g.key);
      if (prev) {
        prev.lines = [...prev.lines, ...g.lines];
        if (g.eta && (!prev.eta || g.eta < prev.eta)) prev.eta = g.eta;
        prev.overdue = prev.overdue || g.overdue;
      } else {
        chaseByPo.set(g.key, { ...g, lines: [...g.lines] });
      }
    }
  }
  const chaseGroups = [...chaseByPo.values()];

  // ═══ ACTIONS rows (§7, B2) — one per COUNTERPARTY; overdue on top.
  // A delivered order is CLOSED: no supplier/logistics call remains — only
  // an owing customer survives delivery. Lateness reads RELATIVE ("5d late"
  // beats a truncated absolute date). ═══
  const daysLateOf = (iso: string) =>
    Math.max(1, Math.round((Date.parse(todayIso) - Date.parse(iso)) / 86_400_000));
  // Same-supplier POs collapse into ONE row (§13: one counterparty, one
  // message) — a resolved name groups by name; an anonymous AutoCount PO
  // stays its own row (can't prove two POs share a supplier).
  const byParty = new Map<
    string,
    { label: string; named: boolean; poNos: string[]; lines: { sku: string; qty: number }[]; eta: string | null; overdue: boolean }
  >();
  if (!deliveredDone) {
    for (const g of chaseGroups) {
      const named = g.label !== g.poNo;
      const key = named ? `name:${g.label}` : `po:${g.poNo}`;
      const prev = byParty.get(key);
      if (prev) {
        prev.poNos.push(g.poNo);
        prev.lines = [...prev.lines, ...g.lines];
        if (g.eta && (!prev.eta || g.eta < prev.eta)) prev.eta = g.eta;
        prev.overdue = prev.overdue || g.overdue;
      } else {
        byParty.set(key, {
          label: g.label,
          named,
          poNos: [g.poNo],
          lines: [...g.lines],
          eta: g.eta,
          overdue: g.overdue,
        });
      }
    }
  }
  const chaseRows: CallsRow[] = [...byParty.entries()].map(([key, p]) => {
    const lateBit = p.overdue
      ? `${daysLateOf(p.eta!)}d late`
      : p.eta
        ? `ETA ${fmtDate(p.eta).split(",")[0]}`
        : "no ETA";
    return {
      key: `sup-${key}`,
      label: p.label,
      // Named row: the sub keeps the PO reference so a mis-inferred name is
      // always cross-checkable — one PO shows its number, several show a
      // count (the full list rides the title tooltip; the LATE bit must
      // never truncate). Anonymous row: the PO IS the title — the sub says
      // what KIND it is instead.
      sub: p.named
        ? `${p.poNos.length === 1 ? p.poNos[0] : `${p.poNos.length} POs`} · ${lateBit}`
        : `Supplier · ${lateBit}`,
      subTitle: `${p.poNos.join(" · ")} · ${lateBit}`,
      urgency: p.overdue ? ("overdue" as const) : ("attention" as const),
      onAct: (tone: "reminder" | "chase") =>
        copySupplierChaseFor(
          { label: p.label, poNo: p.poNos.join(" / "), lines: p.lines },
          tone,
        ),
      onOpen: () => setTab("items"),
    };
  });
  if (chasePartnerName && !deliveredDone && (!bookedEta || overDeadline)) {
    const lateDays = daysToDelivery !== null && daysToDelivery < 0 ? -daysToDelivery : null;
    chaseRows.push({
      key: "logistic",
      label: chasePartnerName,
      // A fact may state an ABSENCE ("no date confirmed") but never a to-do
      // word — "not booked" is banned (C1, Jess 2026-07-27).
      sub: overDeadline
        ? `${bookedEta ? `logistics said ${fmtDate(bookedEta).split(",")[0]}` : "no date confirmed"} · ${lateDays}d late`
        : `no date confirmed · due ${deadlineLabel}`,
      urgency: overDeadline ? "overdue" : "attention",
      onAct: (tone) => copyChase("logistic", tone),
      onOpen: () => setTab("delivery"),
    });
  }
  if (balanceOwing) {
    chaseRows.push({
      key: "customer",
      label: order.customer_name ? displayCustomerName(order.customer_name) : "Customer",
      sub: `${RM(moneyOutstanding)} outstanding`,
      urgency: balanceGate === "hold" ? "overdue" : "attention",
      onAct: (tone) => copyChase("customer", tone),
      onOpen: () => setTab("balance"),
    });
  }
  chaseRows.sort(
    (a, b) => Number(b.urgency === "overdue") - Number(a.urgency === "overdue"),
  );

  // ── CURRENT ISSUES (UI-KIT §1.4 ③) ───────────────────────────────────────
  // What is HOLDING THIS ORDER UP, grouped by the three business tracks.
  //
  // Every value below is already computed above for some other surface — this
  // block READS them, it does not decide anything. No new business rule, no
  // new request, no new threshold: if this list is wrong, the surface that
  // owns the number is wrong, and it is wrong there too.
  //
  // Not the same as ACTIONS: that block names a counterparty and carries the
  // message buttons (who to call). This one states the condition (what is
  // wrong) — including the ones nobody can be called about, like a storage
  // fee that is holding the delivery.
  const currentIssues: CurrentIssueRow[] = [];
  // 📦 GOODS — the lines that cannot be delivered yet, and why.
  if (nopoN > 0) {
    currentIssues.push({
      key: "goods-nopo",
      track: "goods",
      text: `${nopoN} ${nopoN === 1 ? "line has" : "lines have"} no PO`,
      tone: "danger",
      onOpen: () => setTab("items"),
    });
  }
  const notReadyN = goodsLines.length - readyN - nopoN;
  if (notReadyN > 0) {
    currentIssues.push({
      key: "goods-notready",
      track: "goods",
      text: `${notReadyN} ${notReadyN === 1 ? "line" : "lines"} not in stock yet`,
      tone: "warning",
      onOpen: () => setTab("items"),
    });
  }
  // A supplier past its own ETA is a GOODS problem even when the chase row for
  // it already exists — the chase says who to call, this says why we are late.
  const lateSuppliers = [...byParty.values()].filter((p) => p.overdue);
  if (lateSuppliers.length > 0) {
    currentIssues.push({
      key: "goods-supplier-late",
      track: "goods",
      text:
        lateSuppliers.length === 1
          ? `${lateSuppliers[0].label} is past its ETA`
          : `${lateSuppliers.length} suppliers past their ETA`,
      tone: "danger",
      onOpen: () => setTab("items"),
    });
  }
  // 🚚 DELIVERY — a fact may state an ABSENCE but never a to-do word (C1).
  if (!deliveredDone && !bookedEta) {
    currentIssues.push({
      key: "delivery-nodate",
      track: "delivery",
      text: "No delivery date confirmed",
      tone: overDeadline ? "danger" : "warning",
      onOpen: () => setTab("delivery"),
    });
  }
  if (!deliveredDone && overDeadline) {
    currentIssues.push({
      key: "delivery-late",
      track: "delivery",
      text: `Past the deadline · ${deadlineLabel}`,
      tone: "danger",
      onOpen: () => setTab("delivery"),
    });
  }
  // 💰 MONEY — `hold` means it is stopping the goods, `warn` that it will.
  if (balanceOwing) {
    currentIssues.push({
      key: "money-balance",
      track: "money",
      text:
        balanceGate === "hold"
          ? `${RM(moneyOutstanding)} outstanding · holding delivery`
          : `${RM(moneyOutstanding)} outstanding`,
      tone: balanceGate === "hold" ? "danger" : "warning",
      onOpen: () => setTab("balance"),
    });
  }
  if (storageOwing) {
    currentIssues.push({
      key: "money-storage",
      track: "money",
      text:
        storageGate === "hold"
          ? "Storage fee uncollected · holding delivery"
          : "Storage fee uncollected",
      tone: storageGate === "hold" ? "danger" : "warning",
      onOpen: () => setTab("storage"),
    });
  }

  // THE journey spine — extracted so each tab header can wear the SAME step
  // number + colour as its spine node (Jess 甲 2026-07-19): one numbered journey,
  // whether you read the rail (overview) or the header (you-are-here).
  // Each step reads as 3 lines (Jess 2026-07-19): panel (which tab it opens) ·
  // action (what to do at this step) · sub (the live description).
  const journeySteps: {
    panel: string;
    title: string;
    sub: string;
    state: JourneyState;
    tab: DrawerTab;
  }[] = [
    {
      panel: "Balance",
      title: "Collect deposit",
      tab: "balance",
      state: collectedAll > 0 ? "done" : totalSet ? "wait" : "todo",
      sub:
        collectedAll > 0
          ? `${RM(collectedAll)} in`
          : totalSet
            ? "nothing received yet"
            : "—",
    },
    {
      panel: "Items",
      title: "Stock ready",
      tab: "items",
      state:
        deliveredDone || (goodsN > 0 && readyN >= goodsN)
          ? "done"
          : stockTone === "danger"
            ? "act"
            : "wait",
      sub: deliveredDone
        ? "all delivered"
        : `${readyN}/${goodsN} ready${
            goodsN - readyN > 0 ? ` · waiting ${goodsN - readyN}` : ""
          }`,
    },
    {
      panel: "Balance",
      title: "Collect balance",
      tab: "balance",
      state: !totalSet ? "todo" : balanceDue > 0 ? "act" : "done",
      sub: !totalSet
        ? "nothing owing on record"
        : balanceDue > 0
          ? `still owes ${RM(balanceDue)} · before delivery`
          : "all paid",
    },
    ...(hasMsbf || hasSof
      ? [
          {
            panel: "Storage",
            title: "Hold & charge",
            tab: "storage" as DrawerTab,
            state: storageOwing
              ? storageGate === "hold"
                ? ("act" as const)
                : ("wait" as const)
              : storageIncurred && storageCleared
                ? ("done" as const)
                : ("todo" as const),
            sub: storageOwing
              ? `${storageCharge > 0 ? RM(storageCharge) : "fee"} unpaid`
              : storageIncurred && storageCleared
                ? "collected"
                : supplierLate
                  ? "waiting supplier — not counting"
                  : "not counting",
          },
        ]
      : []),
    // Loaner — a conditional step BEFORE Deliver (Jess 2026-07-19): when a
    // substitute is out it lives IN the journey (swapped back at delivery).
    ...(liveLoanCount > 0
      ? [
          {
            panel: "Loan",
            title: "Loaner out",
            tab: "loan" as DrawerTab,
            state: "wait" as const,
            sub: `${liveLoanCount} out · back at delivery`,
          },
        ]
      : []),
    {
      panel: "Delivery",
      title: "Deliver",
      tab: "delivery",
      state: deliveredDone
        ? "done"
        : logisticTone === "danger"
          ? "act"
          : "wait",
      sub: deliveredDone
        ? "delivered"
        : `${assignedLogisticName ?? "no logistics picked yet"}${
            logisticTone === "danger" ? " · no date confirmed" : ""
          }`,
    },
  ];
  // The step badge a tab header wears: the clicked step when it matches this
  // tab (Balance = 2 steps), else the tab's first step. Non-journey tabs → none.
  const stepBadgeFor = (t: DrawerTab): ReactNode => {
    const i =
      clickedStep != null && journeySteps[clickedStep]?.tab === t
        ? clickedStep
        : journeySteps.findIndex((s) => s.tab === t);
    return i < 0 ? null : <StepBadge n={i + 1} state={journeySteps[i].state} />;
  };

  return (
    <div className="flex flex-col h-full min-h-0">
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
      {/* HEADER (Jess 2026-07-17 rev 4) — a BARE strip, not a card: back link
          left; ‹ n of m › prev/next stepping the list + flag + ⋮ right (round
          34px icon buttons, base-100 hover wash). ZERO order data here — the
          identity lives in the Customer card below. */}
      <header className="shrink-0 px-5 h-11 flex items-center gap-1.5 border-b border-base-200 bg-background">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to Orders"
          className="shrink-0 -ml-1.5 inline-flex items-center gap-0.5 pl-1 pr-2 py-1 rounded-md text-body font-medium text-base-500 hover:text-base-900 hover:bg-hovertint"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Orders
        </button>
        <span className="text-base-300" aria-hidden="true">·</span>
        <span className="font-mono text-body font-semibold text-base-700">#{order.so}</span>
        <span className="flex-1" />
        {nav && (
          <span className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={nav.onPrev}
              disabled={!nav.onPrev}
              aria-label="Previous order"
              title="Previous order in the list"
              className="size-[34px] rounded-full inline-grid place-items-center text-base-600 hover:bg-hovertint disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="text-meta text-base-500 t-num whitespace-nowrap px-0.5">
              {nav.index} of {nav.total}
            </span>
            <button
              type="button"
              onClick={nav.onNext}
              disabled={!nav.onNext}
              aria-label="Next order"
              title="Next order in the list"
              className="size-[34px] rounded-full inline-grid place-items-center text-base-600 hover:bg-hovertint disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={onFollowUpClick}
          aria-label="Add follow-up"
          title="Add a follow-up (write the issue + assign)"
          className="size-[34px] rounded-full inline-grid place-items-center text-base-600 hover:bg-hovertint hover:text-primary shrink-0"
        >
          <Flag size={16} />
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
          onDispatchClick={onDispatchClick}
          onDOClick={onDOClick}
        />
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
        {/* J3 — the journey strip. It sits HERE, in the full-width band under
            the bare header, and not in the header itself: that strip is
            deliberately data-free (Jess rev4, "the identity lives in the
            Customer card"), and not at the top of the right column either
            (Jess rev15 cleared that column so "the work surface starts at the
            top"). This band already carries the operator's own note, so a
            second full-width line of order truth belongs alongside it.
            Renders nothing when the ladder's answer is absent. */}
        {journeyView && <OrderJourneyHeader journey={journeyView} />}
        {/* C2 — the dynamic checklist. The strip above names the action that
            leads; this names ALL of them, because an order has several open at
            once and the old ladder showed one and hid the rest. Same computed
            list, same order, so its first row is always the strip's Next. */}
        {journey && <OrderActionList actions={journey.openActions} />}
        {/* C8 — the form that closes `Delay planning`. It renders only while
            the LADDER has that action open, so it can never contradict the
            list above it, and it disappears by itself the moment the decision
            is stored. COPY-STANDARD's rule that a FORM already collecting the
            inputs IS the checklist — never a second row of ticks beside it. */}
        {journey?.delay &&
          journey.openActions.some((a) => a.key === "delay_planning") && (
            <DelayPlanningPanel
              orderId={order.id}
              supplierEtaIso={journey.delay.supplierEtaIso}
              promisedDateIso={journey.delay.promisedDateIso}
            />
          )}
        {/* Operator's own free-text note — full text (the header only chips it). */}
        {form.draft.action_for_logistic.trim() && (
          <div className="shrink-0 flex items-start gap-2 rounded-[4px] border border-warning/50 bg-warning/10 px-3 py-2 text-meta">
            <AlertCircle
              className="w-4 h-4 shrink-0 mt-0.5 text-warning"
              aria-hidden="true"
            />
            <span className="text-base-900">
              <span className="block text-meta font-semibold text-warning">
                Action needed
              </span>
              {form.draft.action_for_logistic}
            </span>
          </div>
        )}
        {/* ═══ TWO-COLUMN SHELL — the UI-KIT §1.4 Information Hierarchy ═══
            LEFT 280px (collapsible to 56 icon-only), top to bottom:
              ① Identity        CustomerIdentityCard
              ② Current Action  CallsPanel      — ALWAYS visible
              ③ Current Issues  CurrentIssuesPanel — auto-hides when empty
              ④ Progress        JourneyCard
                 then the section rail (⑤⑥) and Activity (⑦), which open in
                 the RIGHT column.
            RIGHT: the selected tab's content owns the whole column.
            Desktop ~1920 is the truth — no responsive reflow.

            NOTE for the next reader: the rev9 comment that used to sit here
            described "3 KPI track boxes pinned on top" of the right column.
            They were removed at rev15 and the comment was not — it then
            outlived them by long enough to be quoted back as the live design.
            A stale comment is a second source of truth; delete it with the
            code it describes. */}
        <div className="flex-1 min-h-0 overflow-hidden flex gap-3">
        {/* LEFT — customer identity + the section rail. */}
        <div
          className={`shrink-0 flex flex-col gap-2.5 min-h-0 ${
            railCollapsed ? "w-14" : "w-[280px]"
          }`}
        >
          <CustomerIdentityCard
            order={order}
            regionLabel={loc.label ?? null}
            statusWord={
              balanceOwing || storageOwing
                ? "On hold"
                : pipelineStatus === "completed"
                  ? "Delivered"
                  : PIPELINE_LABEL[pipelineStatus]
            }
            collapsed={railCollapsed}
          />
          {/* ② CURRENT ACTION (UI-KIT §1.4) — a PANEL, not a tab, directly
              under Identity. It used to hide with the collapsed rail; §1.4
              rule 1 forbids that (it is the reason the record is open), so it
              now renders in icon form instead of disappearing. */}
          <CallsPanel
            rows={chaseRows}
            lastChasedAt={form.control?.last_chased_at ?? null}
            collapsed={railCollapsed}
          />
          {/* ③ CURRENT ISSUES (UI-KIT §1.4) — why the order is not moving,
              grouped by goods · delivery · money. Renders NOTHING when there
              is nothing wrong (rule 2), so it costs no height on a healthy
              order. */}
          <CurrentIssuesPanel rows={currentIssues} collapsed={railCollapsed} />
          {/* THE SPINE — nav + progress + status in one (Jess 2026-07-18):
              deposit → goods → balance → storage (when storing categories
              exist) → deliver. Collapsed rail shows nodes only. */}
          {(
            <JourneyCard
              onGo={(t, i) => {
                setTab(t);
                setClickedStep(i);
              }}
              activeTab={tab}
              collapsed={railCollapsed}
              steps={journeySteps}
            />
          )}
          <nav
          className={"flex-1 flex flex-col gap-1 min-h-0 overflow-y-auto no-scrollbar"}
          aria-label="Order sections"
        >
          {(
            [
              /* Items / Delivery / Balance / Storage moved ONTO the spine —
                 the nav keeps only the non-flow utilities (Jess: demoted,
                 never hidden). */
              {
                key: "loan",
                label: "Loan",
                icon: Undo2,
                v: liveLoanCount > 0 ? String(liveLoanCount) : undefined,
              },
              /* J1 — every paper this order has, in one place. A utility, not
                 a step: it sits with Loan / Activity, never on the spine. The
                 count is what is ON FILE; the amber dot means a document the
                 order should already have is missing. */
              {
                key: "documents",
                label: "Documents",
                icon: FileText,
                v: String(docsOnFile),
                w: docsMissing > 0 ? `${docsMissing} missing` : undefined,
                tone: docsMissing > 0 ? "warning" : undefined,
              },
              /* J2 — Cases. The ONLY tab that comes and goes: the card's rule
                 is that an order with no case shows nothing, and a permanent
                 tab reading "0" on every clean order is exactly the empty box
                 it forbids. Amber when a case is still open — that is someone's
                 job today; a closed case is history and stays quiet. */
              ...(caseCount > 0
                ? [
                    {
                      key: "cases" as const,
                      label: "Cases",
                      icon: LifeBuoy,
                      v: String(caseCount),
                      w: openCaseCount > 0 ? `${openCaseCount} open` : undefined,
                      tone: openCaseCount > 0 ? ("warning" as const) : undefined,
                    },
                  ]
                : []),
              { key: "activity", label: "Activity", icon: ScrollText },
            ] as {
              key: DrawerTab;
              label: string;
              icon: LucideIcon;
              tone?: "danger" | "warning";
              v?: string;
              w?: string;
            }[]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-selected={tab === t.key}
              title={t.label + (t.v ? ` — ${t.v}` : "") + (t.w ? ` ${t.w}` : "")}
              className={`h-10 rounded-lg flex items-center gap-2 shrink-0 ${
                railCollapsed ? "justify-center px-0" : "px-2.5"
              } text-body font-semibold transition-colors ${
                tab === t.key
                  ? "railtab-active"
                  : "railtab-idle text-base-700"
              }`}
            >
              {/* Grey icon + corner badge (iOS-style): red = act · amber =
                  waiting. The icon itself never changes colour. */}
              <span className="relative shrink-0">
                <t.icon size={16} strokeWidth={2} aria-hidden="true" />
                {t.tone && (
                  <span
                    aria-hidden="true"
                    className={`absolute -top-1 -right-1.5 w-2 h-2 rounded-full ring-2 ring-white ${
                      t.tone === "danger" ? "bg-danger" : "bg-warning"
                    }`}
                  />
                )}
              </span>
              {!railCollapsed && <span className="truncate">{t.label}</span>}
              {!railCollapsed && (t.v || t.w) && (
                <span className="ml-auto text-right shrink-0 leading-tight">
                  {t.v && (
                    <span
                      className={`block text-meta font-semibold font-mono tabular-nums ${
                        t.tone === "danger"
                          ? "text-danger"
                          : t.tone === "warning"
                            ? "text-warning"
                            : "text-base-700"
                      }`}
                    >
                      {t.v}
                    </span>
                  )}
                  {t.w && (
                    <span className="block text-label font-medium text-base-500">
                      {t.w}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
          <span className="flex-1" />
          <button
            type="button"
            onClick={toggleRail}
            aria-label={railCollapsed ? "Expand sections" : "Collapse sections"}
            title={railCollapsed ? "Expand" : "Collapse"}
            className={`h-10 rounded-lg flex items-center gap-2 shrink-0 text-base-400 hover:bg-base-900/5 hover:text-base-700 ${
              railCollapsed ? "justify-center px-0" : "px-2.5"
            }`}
          >
            {railCollapsed ? (
              <ChevronRight size={16} aria-hidden="true" />
            ) : (
              <>
                <ChevronLeft size={16} aria-hidden="true" />
                <span className="text-body font-medium">Collapse</span>
              </>
            )}
          </button>
        </nav>
        </div>
        {/* RIGHT — the tab content owns the whole column (rev15, Jess: the
            KPI strip is GONE — the tab dots, ACTIONS panel and each tab's
            own §8 status vocabulary carry the state; the work surface starts
            at the top). */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2.5 overflow-hidden"><div className="flex-1 min-w-0 min-h-0 overflow-y-auto scroll-overlay">
          {/* 0233/0234 (add-product P3) — dealer-submitted product change
              awaiting approval. ABOVE the tab gate so it shows on EVERY tab
              (Loo live-test 2026-07-18: ops couldn't find it); auto-hides
              when none is pending. */}
          <ChangeRequestsPanel orderId={order.id} />
          <div className={tab === "items" ? "min-h-full" : "hidden"}>
          {/* Option C (rev 6) + desktop truth (Jess): Items takes FULL width;
              picking a line slides the Warehouse card in from the right at a
              fixed 56/44 split — NO responsive reflow, the layout is identical
              on the office 1920 screens and a laptop. */}
          <div
            className={
              pickerOpen
                ? "grid grid-cols-[56fr_44fr] gap-3 items-start"
                : "grid grid-cols-1 gap-3 items-start"
            }
          >
          <SectionCard className="shrink-0">
          {/* rev15c (Jess) — the DELIVERY-style band STAYS ("can see where
              we are" + hide/expand); what goes is the grey base under the
              column-header row and the 268px inner scroll cap (the table
              runs full length; the tab column scrolls). */}
          <Panel
            title="Items"
            leading={stepBadgeFor("items")}
            summary={
              /* ONE readiness chip, ONE vocabulary (§7.7): "<x> ready · <p>
                 needs stock", from the SAME shared lineReadiness the row pills
                 use — ready = reserved-to-this-SO only (strict). */
              /* rev17 copy — never lead with a zero: all ready → "All
                 ready ✓" · none ready → "N needs stock" · mixed → both. */
              goodsLines.length === 0 ? (
                <MiniBadge tone="muted">no goods</MiniBadge>
              ) : readyN === goodsLines.length ? (
                <MiniBadge tone="ready">All ready ✓</MiniBadge>
              ) : readyN === 0 ? (
                <MiniBadge tone="waiting">
                  {goodsLines.length} needs stock
                </MiniBadge>
              ) : (
                <MiniBadge tone="waiting">
                  {readyN} ready · {goodsLines.length - readyN} needs stock
                </MiniBadge>
              )
            }
            actions={
              <PanelMenu
                /* CARD 4B (2026-08-11) — `Raise PO for shortages` is GONE.
                   It pushed this order's shortages into CreatePOModal, which
                   called the legacy ungoverned create RPCs. Shortages reach
                   Purchasing as purchase_demands and are issued by Batch
                   Purchase; nothing here creates a Purchase Order. */
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
            <div className="overflow-x-auto min-h-0 mt-1">
              {/* table-fixed — the w-* column widths are REAL and the long
                  item name truncates (auto layout let it blow past a
                  MacBook's card width). */}
              <table className="w-full border-collapse table-fixed">
                {/* §9 — formal columns across the FULL width (data tables are
                    exempt from the ~1000 forms cap). */}
                {/* rev15c (Jess) — no grey base under the column headers:
                    white sticky row + a hairline keeps the separation. */}
                <thead className="sticky top-0 z-10">
                  {/* rev18 (Jess's final format): STATUS · STOCK ETA · QTY ·
                      ITEM · PO · ARRIVED. Alert-first; SKU folds into the
                      Item sub-line; ARRIVED (goods-in / GRN — the words
                      "Received"/"Book in" are dead) is its own column, fully
                      separate from the route expander; ETA edits in place. */}
                  <tr className="bg-white text-base-500 border-b border-base-100">
                    <th className="text-left text-label font-semibold uppercase tracking-[0.04em] px-2 py-1.5 w-28">Status</th>
                    <th className="text-left text-label font-semibold uppercase tracking-[0.04em] px-2 py-1.5 w-24">Stock ETA</th>
                    <th className="text-right text-label font-semibold uppercase tracking-[0.04em] px-2 py-1.5 w-10">Qty</th>
                    <th className="text-left text-label font-semibold uppercase tracking-[0.04em] px-2 py-1.5">Item</th>
                    <th className="text-left text-label font-semibold uppercase tracking-[0.04em] px-2 py-1.5 w-24">PO</th>
                    {/* rev20 (Jess 1-B) — ONE word everywhere: the column, the
                        count and the button all say GRN (her AutoCount doc). */}
                    <th className="text-left text-label font-semibold uppercase tracking-[0.04em] px-2 py-1.5 w-32" title="Goods arrived at the warehouse (GRN)">GRN</th>
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
                      const routeOpen = routeOpenSku === l.sku;
                      // AUTO-derived status (§7.7 — the manual dropdown is gone;
                      // reserving stock is what flips a line green).
                      // §9 status vocab (same words as the dial): Reserved
                      // green · Need N amber · On PO grey · Delayed red (the
                      // PO's ETA has passed and the goods aren't in).
                      const etaPassed = !!etaValue && etaValue < todayIso;
                      const pill =
                        !rd
                          ? null
                          : rd === "reserved"
                            ? {
                                /* rev18 — "Ready", the layman word (v3
                                   vocab); "Reserved" collided with
                                   "Received" for weak-English staff. */
                                t: "Ready",
                                c: "pill-confirmed",
                                hint: isAcc
                                  ? "Accessory — always in the Klang warehouse"
                                  : "A unit is locked to this order",
                              }
                            : rd === "to_reserve"
                              ? {
                                  t: `Need ${Math.max(1, l.qty - received)}`,
                                  c: "pill-warning",
                                  hint: "Matching free stock exists — reserve it to this SO",
                                }
                              : rd === "on_po"
                                ? etaPassed
                                  ? {
                                      t: "Delayed",
                                      c: "pill-overdue",
                                      hint: "The PO's ETA has passed — call the supplier for a new ready date",
                                    }
                                  : {
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
                          {/* v4 §8/§8d — the ACTIVE line reads as the SELECTION
                              blue wash; while one line is active the OTHER rows
                              dim to ~60% (attention moves by light, the POS
                              pattern). Status lives in the Status pill. 44px. */}
                          <tr
                            onClick={() => setPickerSku(l.sku)}
                            className={`cursor-pointer h-[52px] transition-opacity ${
                              /* rev19 (Jess: option A colour states) — ONE
                                 blue family, three strengths: idle = white ·
                                 hover = whisper blue (the old base-50 grey
                                 was invisible) · selected (picker open for
                                 this line) = blue wash + 3px blue left bar.
                                 Hover previews selection — same colour story. */
                              pickerOpen && l.sku === activeLineSku
                                ? "is-selected"
                                : `hover:bg-hovertint ${
                                    pickerOpen ? "opacity-60 hover:opacity-100" : ""
                                  }`
                            }`}
                          >
                            {/* rev18 columns (Jess's final format) — STATUS ·
                                STOCK ETA (click-to-edit) · QTY · ITEM (no
                                thumb; sub = size · SKU; mini route bar when a
                                special multi-stop route exists) · PO ·
                                ARRIVED (goods-in count + [+ Arrived] GRN).
                                Rows stay WHITE — colour lives in the pills
                                and the red dates only (Jess: row tints made
                                the listing unreadable). */}
                            {/* STATUS — the pill IS the row's action door
                                (rev20): amber "Need N ›" → warehouse picker;
                                green "✓ Ready" → two-step "↩ Unreserve?"
                                (release the unit back to free stock). */}
                            <td className="border-b border-base-100 px-1.5 py-1 align-middle">
                              {pill ? (
                                rd === "to_reserve" ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPickerSku(l.sku);
                                      setPickerOpen(true);
                                      document
                                        .getElementById("warehouse-stock-panel")
                                        ?.scrollIntoView({
                                          block: "start",
                                          behavior: "smooth",
                                        });
                                    }}
                                    title="Matching stock is free — click to reserve a unit to this order"
                                    className={`inline-flex items-center gap-1 text-meta font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${pill.c} hover:brightness-90`}
                                  >
                                    {pill.t}
                                    <ChevronRight size={14} strokeWidth={2.5} aria-hidden="true" />
                                  </button>
                                ) : rd === "reserved" && !isAcc && !isService ? (
                                  unreserveSku === l.sku ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const itemId = reservedUnitIdFor(l.sku);
                                        if (!itemId) {
                                          toast.error(
                                            "No reserved unit found for this line",
                                          );
                                          setUnreserveSku(null);
                                          return;
                                        }
                                        releaseStock.mutate(itemId);
                                      }}
                                      disabled={releaseStock.isPending}
                                      title="Click again to put the unit back into free stock"
                                      className="inline-flex items-center gap-1 text-meta font-medium px-2 py-0.5 rounded-full whitespace-nowrap pill-overdue hover:brightness-95 disabled:opacity-50"
                                    >
                                      ↩ Unreserve?
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setUnreserveSku(l.sku);
                                      }}
                                      title="A unit is locked to this order — click to unreserve it"
                                      className={`inline-flex items-center gap-1 text-meta font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${pill.c} hover:brightness-95`}
                                    >
                                      <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                                      {pill.t}
                                    </button>
                                  )
                                ) : (
                                  <span
                                    title={pill.hint}
                                    className={`inline-flex items-center gap-1 text-meta font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${pill.c}`}
                                  >
                                    {rd === "reserved" && (
                                      <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                                    )}
                                    {pill.t}
                                  </span>
                                )
                              ) : (
                                <span className="text-base-300 text-meta">—</span>
                              )}
                            </td>
                            {/* STOCK ETA — red alert when late / missing;
                                click the date to edit IN PLACE (the expander
                                no longer repeats it). */}
                            <td className="border-b border-base-100 px-2 py-1.5 align-middle">
                              {isService || isAcc || rd === "reserved" ? (
                                <span className="text-base-300 text-meta">—</span>
                              ) : etaEditSku === l.sku ? (
                                <input
                                  type="date"
                                  autoFocus
                                  value={etaValue}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    form.setLineEta(l.sku, e.target.value)
                                  }
                                  onBlur={() => setEtaEditSku(null)}
                                  className="border border-base-300 rounded-[3px] bg-white px-1 py-0.5 text-meta focus:border-primary focus:outline-none w-full"
                                />
                              ) : etaValue ? (
                                <span
                                  className={`inline-flex items-center gap-1 text-meta tabular-nums ${
                                    etaPassed ||
                                    (!order.delivery_date_tbd &&
                                      !!order.delivery_date &&
                                      etaValue > order.delivery_date)
                                      ? "text-danger font-medium"
                                      : "text-base-700"
                                  }`}
                                  title={
                                    etaPassed
                                      ? "ETA has passed — goods not in"
                                      : !order.delivery_date_tbd &&
                                          !!order.delivery_date &&
                                          etaValue > order.delivery_date
                                        ? "ETA is AFTER the delivery deadline"
                                        : "Expected stock arrival"
                                  }
                                >
                                  {(etaPassed ||
                                    (!order.delivery_date_tbd &&
                                      !!order.delivery_date &&
                                      etaValue > order.delivery_date)) && (
                                    <AlertCircle size={14} strokeWidth={2.5} className="shrink-0" />
                                  )}
                                  <span
                                    className="border-b border-dashed border-base-300 cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEtaEditSku(l.sku);
                                    }}
                                    title="Click to change the stock ETA"
                                  >
                                    {fmtDate(etaValue).split(",")[0]}
                                  </span>
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-meta font-medium text-danger cursor-pointer"
                                  title="No stock ETA — click to set it, or call the supplier for the ready date"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEtaEditSku(l.sku);
                                  }}
                                >
                                  <AlertCircle size={14} strokeWidth={2.5} className="shrink-0" />
                                  no ETA
                                </span>
                              )}
                            </td>
                            {/* QTY — the bare number (§9: no "QTY" word). */}
                            <td className="border-b border-base-100 px-2 py-1.5 text-right align-middle text-body tabular-nums">
                              {l.qty}
                            </td>
                            {/* ITEM — chevron (route expander) + name; sub =
                                size · SKU; a special multi-stop route draws
                                the always-visible mini numbered bar (no thumb
                                icon — Jess). */}
                            <td className="border-b border-base-100 px-2 py-1.5 align-middle">
                              <div className="flex items-center gap-2 min-w-0">
                                {!isService && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRouteOpenSku((cur) =>
                                        cur === l.sku ? null : l.sku,
                                      );
                                    }}
                                    title="Route / special transfer"
                                    aria-expanded={routeOpen}
                                    className="shrink-0 text-base-500 hover:text-base-800"
                                  >
                                    {routeOpen ? (
                                      <ChevronDown size={14} />
                                    ) : (
                                      <ChevronRight size={14} />
                                    )}
                                  </button>
                                )}
                                <span className="min-w-0 flex-1">
                                  <span
                                    className="block text-body font-semibold text-foreground leading-tight truncate"
                                    title={l.sku}
                                  >
                                    {l.sku}
                                  </span>
                                  {(lineSize(l.sku) || skuCode(l.sku) !== "—") && (
                                    <span className="block text-meta text-base-500 leading-tight truncate">
                                      {lineSize(l.sku) === "K"
                                        ? "King"
                                        : lineSize(l.sku) === "Q"
                                          ? "Queen"
                                          : lineSize(l.sku) === "S"
                                            ? "Single"
                                            : null}
                                      {lineSize(l.sku) && skuCode(l.sku) !== "—"
                                        ? " · "
                                        : null}
                                      {skuCode(l.sku) !== "—" ? (
                                        <span className="font-mono text-label">
                                          {skuCode(l.sku)}
                                        </span>
                                      ) : null}
                                    </span>
                                  )}
                                  {stops.length > 1 && (
                                    <span className="block mt-0.5">
                                      <MiniStopsBar
                                        stops={stops}
                                        names={stops.map(shortSite).join(" → ")}
                                      />
                                    </span>
                                  )}
                                </span>
                              </div>
                            </td>
                            {/* PO — In stock / PO#### */}
                            <td className="border-b border-base-100 px-2 py-1.5 align-middle">
                              {isService ? (
                                <span className="text-base-300 text-meta">—</span>
                              ) : poNo ? (
                                <span className="font-mono text-meta text-base-700 truncate block max-w-[110px]" title={poNo}>
                                  {poNo}
                                </span>
                              ) : (
                                <span className="text-meta text-base-600">In stock</span>
                              )}
                            </td>
                            {/* ARRIVED — goods-in count (GRN; "Received" and
                                "Book in" are dead words). The count is the
                                quiet fact; [+ Arrived] records an arrival. */}
                            <td className="border-b border-base-100 px-1.5 py-1 align-middle">
                              {isService || isAcc || !poNo ? (
                                <span className="text-base-300 text-meta">—</span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5">
                                  <span
                                    className={`text-meta tabular-nums ${
                                      lineReceivedOf(l.sku) >= l.qty
                                        ? "text-base-900 font-semibold"
                                        : "text-base-500"
                                    }`}
                                    title="Units arrived at the warehouse"
                                  >
                                    {lineReceivedOf(l.sku)}/{l.qty}
                                  </span>
                                  {/* D2 (2026-08-06) — the WRITE door is GONE.
                                      A per-line receive used to open
                                      `ReceiveLineModal` → POST /receive-line,
                                      which booked units into the stock register
                                      and stamped this counter **without opening
                                      a Receiving Session**: no
                                      `warehouse_receipts` row, no
                                      `receiving_events` entry, and it never
                                      touched `purchase_order_lines.received_qty`.
                                      That is not a second door onto one act —
                                      it is a second RECORD of it.

                                      Measured before removal: it had been used
                                      **zero** times (`line_received` empty on
                                      all 65 control rows, 0 units reserved to an
                                      SO) while the Receiving Workspace had
                                      posted 3 sessions. Purchasing's own C1
                                      ruling applies — *a live route with no
                                      caller is a bypass one curl away*.

                                      The count STAYS, because it is a fact worth
                                      reading; the hand-over to Receiving is the
                                      PO row's existing `Check in` link, one
                                      block down. Orders may SHOW cross-module
                                      work and may not WRITE it. */}
                                </span>
                              )}
                            </td>
                          </tr>
                          {!isService && routeOpen && (
                            /* rev18 — the expander is the ROUTE ONLY (Jess:
                               don't mix goods-in with the special handling —
                               ETA edits in its column, Arrived has its own
                               column). Chips ARE the journey and the editor. */
                            <tr className="bg-base-50">
                              <td
                                colSpan={6}
                                className="border-b border-base-100 bg-base-50 px-3 py-2"
                              >
                                <StopsEditor
                                  stops={savedLoc ?? (locValue ? [locValue] : [])}
                                  onChange={(s) =>
                                    form.setLineLocation(l.sku, s)
                                  }
                                  onDone={() => setRouteOpenSku(null)}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    };
                    // ≤5 lines → Needs action / Ready (Ready collapsible).
                    // >5 lines → auto-group by CATEGORY (Jess 2026-07-18):
                    // grey band header (icon + count + "N need stock"),
                    // all-reserved groups auto-collapse.
                    const needsLine = (l: { sku: string; qty: number }) =>
                      lineKind(l.sku) !== "service" &&
                      readinessOf(l.sku, l.qty) !== "reserved";
                    const groupHeader = (
                      key: string,
                      label: string,
                      icon: ReactNode,
                      total: number,
                      needN: number,
                      open: boolean,
                      onToggle: () => void,
                    ) => (
                      <tr key={`grp-${key}`}>
                        <td colSpan={6} className="border-b border-base-100 p-0">
                          <button
                            type="button"
                            onClick={onToggle}
                            aria-expanded={open}
                            className="w-full flex items-center gap-1.5 bg-base-100/70 px-2 py-1.5 text-left"
                          >
                            {open ? (
                              <ChevronDown size={14} className="shrink-0 text-base-500" aria-hidden="true" />
                            ) : (
                              <ChevronRight size={14} className="shrink-0 text-base-500" aria-hidden="true" />
                            )}
                            <span className="text-base-500">{icon}</span>
                            <span className="text-meta font-semibold uppercase tracking-[0.04em] text-base-600">
                              {label}
                            </span>
                            <span className="text-meta tabular-nums text-base-500">{total}</span>
                            {needN > 0 && (
                              <span className="ml-auto text-meta font-semibold text-warning">
                                {needN} need stock
                              </span>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                    // Items ALWAYS split by category (Jess 2026-07-19/20): every
                    // category present gets its own header + rows — Mattress ·
                    // Bedframe · Sofa · Accessory · Service — so EVERY item
                    // carries its category icon (Jess: even a single-line order
                    // shows the category header + icon; the flat exception is
                    // retired).
                    // Service lines fall to "acc" under lineCategory — split them
                    // into their OWN group so Accessory ≠ Service.
                    const groupCatOf = (
                      sku: string,
                    ): "mattress" | "bedframe" | "sofa" | "acc" | "service" =>
                      lineKind(sku) === "service" ? "service" : lineCategory(sku);
                    const CATS: {
                      key: "mattress" | "bedframe" | "sofa" | "acc" | "service";
                      label: string;
                    }[] = [
                      { key: "mattress", label: "Mattress" },
                      { key: "bedframe", label: "Bedframe" },
                      { key: "sofa", label: "Sofa" },
                      { key: "acc", label: "Accessory" },
                      { key: "service", label: "Service" },
                    ];
                    return CATS.map(({ key, label }) => {
                      const rows = orderedLines.filter(
                        (l) => groupCatOf(l.sku) === key,
                      );
                      if (rows.length === 0) return null;
                      const needN = rows.filter(needsLine).length;
                      const open = catOpen[key] ?? needN > 0; // all-reserved auto-collapses
                      return (
                        <Fragment key={key}>
                          {groupHeader(
                            key,
                            label,
                            <CatIcon cat={key} />,
                            rows.length,
                            needN,
                            open,
                            () =>
                              setCatOpen((cur) => ({ ...cur, [key]: !open })),
                          )}
                          {open && rows.map(renderRow)}
                        </Fragment>
                      );
                    });
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
                      <PoRow key={po.id} po={po} divider={i > 0} />
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
          </SectionCard>

          {pickerOpen && (
          <div className="min-w-0 animate-drawer-slide-in relative">
          <button
            type="button"
            aria-label="Close warehouse stock"
            title="Close"
            onClick={() => setPickerOpen(false)}
            className="absolute right-2 top-2 z-10 size-7 rounded-full inline-grid place-items-center text-base-500 hover:bg-hovertint hover:text-base-800"
          >
            <X size={14} />
          </button>
          <SectionCard className="shrink-0">
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
              <div className="flex-1 grid place-items-center text-meta text-base-400 p-6">
                Pick an item above to see its warehouse stock.
              </div>
            </Panel>
          )}
          </SectionCard>
          </div>
          )}
          </div>

          </div>

          <div className={tab === "loan" ? "min-h-full flex flex-col gap-3" : "hidden"}>
          <SectionCard className="shrink-0">
          {/* Loan (migration 0209 + 0217) — AFTER Warehouse stock in the work
              column (Jess 2026-07-13): lending a substitute is a stock action.
              Two sources: own warehouse OR borrowed from a supplier (a return
              obligation). The lend entry stays even at 0 loans. */}
          <Panel
            title="Loan"
            leading={stepBadgeFor("loan")}
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
                //
                // D9, 2026-08-20: `resolvedCategory` asks the CATALOG first and
                // only parses the SKU text where the catalog is silent. The
                // "keyword-missed" the comment above worries about is exactly
                // what that fixes — and it had a second, unstated cost: a line
                // the keyword list missed contributed NOTHING to this set, so
                // its own category could not be matched by any free unit.
                ...new Set(
                  goodsLines
                    .map((l) => resolvedCategory(l.sku, l.category))
                    .filter((c) => c !== "acc"),
                ),
              ]}
              onLend={(itemId, sku) => setLoanTarget({ itemId, sku })}
              logisticEta={bookedEta}
              partners={partnersData?.partners ?? []}
              orderCode={soRef}
              orderRef={(order.source_ref ?? [])[0] ?? null}
              customerName={order.customer_name ?? ""}
              customerPhone={order.customer_phone ?? ""}
            />
          </Panel>
          </SectionCard>

          </div>

          <div className={tab === "documents" ? "min-h-full flex flex-col gap-3" : "hidden"}>
          <SectionCard className="shrink-0">
          {/* J1 (Order Journey) — Documents. Every paper this order has, one
              row each, and what is missing said out loud. Derived at read
              time from records already on screen elsewhere: nothing is stored
              here, nothing is linked by hand. Read-only on purpose — the
              delivery photo is UPLOADED in the Delivery card, so there is one
              upload door, not two. */}
          <Panel
            title="Documents"
            summary={
              docsMissing > 0 ? (
                <MiniBadge tone="waiting">{docsMissing} missing</MiniBadge>
              ) : (
                <MiniBadge tone="muted">
                  {docsOnFile} on file
                </MiniBadge>
              )
            }
          >
            <OrderDocuments rows={documentRows} onOpen={openDocument} />
          </Panel>
          </SectionCard>
          </div>

          {/* J2 (Order Journey) — Related cases. Rendered only when the order
              HAS one: no case means no tab and no panel, so a clean order is
              silent rather than reassured. Read-only in both directions — every
              row hands off to the module that owns the record. */}
          {caseCount > 0 && (
          <div className={tab === "cases" ? "min-h-full flex flex-col gap-3" : "hidden"}>
          <SectionCard className="shrink-0">
          <Panel
            title="Related cases"
            summary={
              openCaseCount > 0 ? (
                <MiniBadge tone="waiting">{openCaseCount} open</MiniBadge>
              ) : (
                <MiniBadge tone="muted">{caseCount} closed</MiniBadge>
              )
            }
          >
            <RelatedCases rows={relatedCaseRows} onOpen={openRelatedCase} />
          </Panel>
          </SectionCard>
          </div>
          )}

          <div className={tab === "activity" ? "min-h-full flex flex-col gap-3" : "hidden"}>
          <SectionCard className="shrink-0">
          {/* Card C — Activity & notes (Jess 2026-07-11 Option 1; moved to the
              right column BOTTOM 2026-07-15 — page-rebuild step 2). THE single
              place for all hand-written follow-up on this order: the compose box
              lives here, so a note auto-attaches to THIS order (no order-picker),
              and every entry stacks with author + timestamp + tag. Also merges
              the system activity (imports, stock moves). Carries `grow` to fill
              the column; scrolls its own body. Reuses AnnotationTimeline. */}
          <Panel title="Activity & notes">
            <div className="p-3 overflow-auto min-h-0">
              <AnnotationTimeline orderId={order.id} />
            </div>
          </Panel>
          </SectionCard>
          </div>


          <div className={tab === "balance" ? "min-h-full flex flex-col gap-3" : "hidden"}>
          {/* 1. Balance — its OWN card (Jess: split from Storage). Chip = the
              owing amount as danger TEXT (colour lock). The id anchors the
              banner's "Confirm & collect" push. */}
          <div id="card-balance" className="min-w-0 flex flex-col min-h-0 shrink-0">
          <SectionCard>
          <Panel
            title="Balance"
            leading={stepBadgeFor("balance")}
            actions={
              /* §7.4 ⋮ — Generate invoice (server data → client PDF, same path
                 as DownloadInvoiceButton) + Print receipt (latest payment). */
              <PanelMenu
                items={[
                  {
                    // §10 — opens the charges + LIVE-preview overlay (issues
                    // on demand via 0229; works before dispatch).
                    label: "Generate invoice",
                    icon: <FileText size={14} />,
                    onClick: () => setInvoiceOverlayOpen(true),
                  },
                  {
                    label: "Print receipt",
                    icon: <Download size={14} />,
                    // 0347 — "the latest receipt" is the latest LIVE payment;
                    // a voided row has no receipt to print.
                    disabled: !latestLivePayment,
                    onClick: () => {
                      if (latestLivePayment)
                        void openReceipt(latestLivePayment, receiptMetaOf());
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
                  // (fix #3) "Edit total" dropped — the inline Goods box is
                  // THE one entry point for the keyed total.
                ]}
              />
            }
            // Tab context (§10): landing on the Balance TAB should show the
            // invoice open — the collapsed band was the stacked-card era.
            defaultOpen
            summary={
              /* Balance v3 header — the payment status PILL from the dial
                 family (STATUS-STANDARD §1): Unpaid / Deposit / Overdue /
                 Paid. The dial's fill = collected ÷ invoice total. */
              payStatus ? (
                <span
                  title={
                    balanceGate === "hold"
                      ? "Delivery on hold — collect before dispatch"
                      : `Collected ${RM(collectedAll)} of ${RM(invoiceTotal)}`
                  }
                  className={`inline-flex items-center gap-1.5 text-meta font-semibold whitespace-nowrap ${payToneCls}`}
                >
                  <PieDial px={18} fraction={payFraction} state={payDialState} />
                  {payStatus}
                </span>
              ) : (
                <span className="text-meta text-base-500 whitespace-nowrap">
                  {collected > 0 ? (
                    <>
                      Collected <Money value={collected} tone="row" className="text-base-800" /> ·{" "}
                    </>
                  ) : null}
                  <span className="text-base-400">set total</span>
                </span>
              )
            }
            collapsedAction={
              /* The collapsed line's shortcut to the page hero (only one of
                 the two ever shows — v4 §2 one-flame-per-page holds). */
              <Btn
                variant="hero"
                size="sm"
                icon={Plus}
                onClick={(e) => {
                  e.stopPropagation();
                  setAddingPayment(true);
                }}
              >
                Add payment
              </Btn>
            }
          >
            <div className="p-3">
              {/* Page-rebuild §3.2 — the state-adaptive money stack owns the
                  collect-by line + the delivery-eve red flag now (the old
                  hold/warn strip folded into it). */}
              <MoneyCard
                orderId={order.id}
                so={order.so}
                form={form}
                hasLineTotal={hasLineTotal}
                orderTotal={orderTotal}
                totalSet={totalSet}
                collected={collectedAll}
                lines={lines}
                storageCharge={storageCharge}
                storageIncurred={storageIncurred}
                invoiceTotal={invoiceTotal}
                balanceDue={balanceDue}
                collectByPast={collectByPast}
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
                lastChasedAt={form.control?.last_chased_at ?? null}
                onShowItems={() => setTab("items")}
                onGenerateInvoice={() => setInvoiceOverlayOpen(true)}
              />
            </div>
          </Panel>
          </SectionCard>
          {/* Add-payment modal (v4 §2 rebuild) — lives at the drawer level so
              the collapsed band's shortcut works with the body unmounted. */}
          {addingPayment && (
            <AddPaymentModal
              orderId={order.id}
              onClose={() => setAddingPayment(false)}
            />
          )}
          {/* §10 Generate invoice — charges + live PDF preview + outputs. */}
          {invoiceOverlayOpen && (
            <GenerateInvoiceOverlay
              orderId={order.id}
              so={order.so}
              invoiceNo={order.invoice_no ?? null}
              customerName={order.customer_name ?? ""}
              customerPhone={order.customer_phone ?? null}
              customerAddress={order.customer_address ?? null}
              lines={lines}
              hasLineTotal={hasLineTotal}
              orderTotal={orderTotal}
              totalSet={totalSet}
              storageCharge={storageCharge}
              storageIncurred={storageIncurred}
              invoiceTotal={invoiceTotal}
              balanceDue={balanceDue}
              onClose={() => setInvoiceOverlayOpen(false)}
            />
          )}
          </div>
          </div>

          <div className={tab === "storage" ? "min-h-full flex flex-col gap-3" : "hidden"}>
          {/* 3. Storage — its OWN card (Jess: split from Balance). Chip (Round
              1A): "held <n>d" while a fee is accruing (danger TEXT on hold —
              never a red block) · "not accruing" otherwise. ⋮ hidden until 1B
              (receipt printing not wired into the new pattern yet). */}
          {(hasMsbf || hasSof) && (
            <SectionCard className="shrink-0">
            <Panel
              title="Storage"
              leading={stepBadgeFor("storage")}
              // Tab context — landing on the Storage TAB shows the card open.
              defaultOpen
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
                    className={`inline-flex items-center gap-1 text-meta font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      /* v4 §6 — status pill: soft tint + dark same-hue. */
                      storageGate === "hold"
                        ? "bg-[#FCEBEB] text-[#A32D2D]"
                        : "bg-[#FAEEDA] text-[#854F0B]"
                    }`}
                  >
                    {storageGate === "hold" && (
                      <AlertCircle size={14} strokeWidth={2.5} />
                    )}
                    {(() => {
                      const from =
                        form.control?.storage_from ?? form.draft.storage_from;
                      if (from && from.trim()) {
                        // S2 — the meter stops at the window END (actual
                        // delivery / collection, else the logistic ETA);
                        // "today" only while still accruing.
                        const end =
                          form.draft.storage_to.trim() ||
                          form.draft.logistic_eta.trim() ||
                          new Date().toISOString().slice(0, 10);
                        const days = Math.max(
                          0,
                          Math.round(
                            (new Date(`${end}T00:00:00`).getTime() -
                              new Date(`${from}T00:00:00`).getTime()) /
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
              {/* Option A "shape that speaks" (Jess 2026-07-18): timeline card
                  + the working flows. The old rule-box / Storage? / Paid?
                  controls are retired — the timeline shows the rule, a start
                  date means storing, and Collect is the only paid-truth. */}
              <StorageCard
                form={form}
                hasMsbf={hasMsbf}
                hasSof={hasSof}
                deadline={storageDeadline}
                latestGoodsEta={latestGoodsEta}
                supplierLate={supplierLate}
                autoAnchor={autoStorageAnchor}
                effectiveStart={effectiveStorageStart}
                exempt={storageExempt}
                delivered={deliveredForStorage}
              />
              {/* The flows show ONLY when storage is actually in play — a
                  not-storing order ends at the quiet card above (Jess: no
                  floating collect buttons on orders that never stored). Each
                  flow sits in its own framed zone. */}
              {(() => {
                const waiverState =
                  form.control?.storage_waiver_status ?? "none";
                const storageActive =
                  storageIncurred ||
                  !!form.control?.storage_collected_at ||
                  waiverState !== "none";
                const extActive =
                  storageActive || (form.control?.extension_count ?? 0) > 0;
                if (!storageActive && !extActive) return null;
                return (
                  <div className="px-3 pb-3 space-y-2">
                    {storageActive && (
                      <div className="rounded-[10px] border border-base-200/70">
                        <StorageCollectWaiver
                          orderId={order.id}
                          control={form.control}
                          charge={
                            form.draft.storage_fee_override.trim()
                              ? Number(form.draft.storage_fee_override)
                              : storageCharge
                          }
                        />
                      </div>
                    )}
                    {extActive && (
                      <div className="rounded-[10px] border border-base-200/70">
                        <StorageExtensionRow
                          orderId={order.id}
                          control={form.control}
                          hasMsbf={hasMsbf}
                          hasSof={hasSof}
                          meta={{
                            orderCode: `SO-${order.so}`,
                            customerName: order.customer_name ?? "",
                            customerPhone: order.customer_phone ?? "",
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </Panel>
            </SectionCard>
          )}
          </div>

          <div className={tab === "delivery" ? "min-h-full flex flex-col gap-3" : "hidden"}>
          {/* Card B — Delivery. Header badge = region. Body split Original |
              Logistics update; then the 2 remark rows; then a Route section only
              for a cross-border / multi-leg order. (Natural height now — the
              Activity card below carries `grow` to fill the column bottom.) */}
          <SectionCard className="shrink-0">
          <Panel
            title="Delivery"
            leading={stepBadgeFor("delivery")}
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
                  // 3A (Jess 2026-07-18): multi-leg is a 0/179 rarity — it
                  // lives behind the ⋮, not on the tab face. The block still
                  // auto-shows whenever an order actually HAS legs.
                  {
                    label: "Multi-leg route…",
                    icon: <Truck size={14} />,
                    onClick: () => setShowRouteBlock(true),
                  },
                ]}
              />
            }
            summary={
              /* rev24 header (Jess): DEADLINE readout + the truth-ladder chip
                 (Delivered ✓ › on hold › overdue Nd › booked › not booked ›
                 no logistics). "booked" = logistic_eta; assigned-but-unbooked
                 is the 93% normal state and must NOT read as failure. A
                 delivered order never alarms (pre-golive guardrail #2). */
              /* rev25 (Jess): badge FIRST, no "deadline" word, the date stays
                 BLACK — red lives only inside the badge. */
              <span className="flex items-center gap-2 min-w-0">
                {(() => {
                  if (deliveredDone)
                    return <MiniBadge tone="ready">Delivered ✓</MiniBadge>;
                  if (balanceGate === "hold" || storageGate === "hold")
                    return (
                      <span
                        title="Delivery on hold — collect the balance / storage fee before dispatch"
                        className="inline-flex items-center gap-1 text-meta font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-[#FCEBEB] text-[#A32D2D]"
                      >
                        <AlertCircle size={14} strokeWidth={2.5} />
                        on hold
                      </span>
                    );
                  if (daysToDelivery !== null && daysToDelivery < 0)
                    return (
                      <span className="inline-flex items-center gap-1 text-meta font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-[#FCEBEB] text-[#A32D2D]">
                        overdue {-daysToDelivery}d
                      </span>
                    );
                  // D1 (0277, Loo): the chip states FACTS. Green is reserved
                  // for the CUSTOMER's confirmation; a logistics date alone must
                  // never read as done — that mislabel is the 68% stuck-order
                  // root the two-stage booking exists to fix.
                  if (
                    form.control?.booking_stage === "confirmed" &&
                    form.control.confirmed_date
                  )
                    return (
                      <MiniBadge tone="ready">
                        confirmed {fmtDateShort(form.control.confirmed_date)}
                        {form.control.confirmed_time_slot
                          ? ` · ${shortSlot(form.control.confirmed_time_slot)}`
                          : ""}
                      </MiniBadge>
                    );
                  const eta = form.control?.logistic_eta ?? null;
                  if (eta)
                    return (
                      <MiniBadge tone="waiting">
                        not confirmed · logistics said {fmtDateShort(eta)}
                      </MiniBadge>
                    );
                  // C1 (Jess 2026-07-27): T1 banned "Unscheduled" and this badge
                  // survived it. Its replacement is NOT T1's "need booking" —
                  // that hides a to-do inside a fact ("need" = the reader still
                  // has to work out what to do). The badge states the ACTION
                  // that closes the gap instead, with the party named.
                  if (order.ops_assigned_logistic)
                    return (
                      <MiniBadge tone="waiting">
                        {deliveryDateGapFact(chasePartnerName)}
                      </MiniBadge>
                    );
                  return <MiniBadge tone="muted">No logistics picked</MiniBadge>;
                })()}
                {/* deadline date lives ONCE — on the card header below (mono);
                    a second sans copy here read as "two fonts" (Jess). */}
              </span>
            }
          >
            <div className="p-3 min-h-0 overflow-auto flex-1">
              {/* rev24 (Jess Option A — 合体): ONE column, ONE vocabulary — the
                  progress line IS the step header and each step's fields live
                  under their own node. Node grammar = the approved JourneyCard
                  sample (ink ✓ done · ONE coloured current node: red act /
                  amber waiting · pale ring not-yet). Stock is a read-only step
                  so the logistic sees goods readiness before calling. */}
              {(() => {
                const eta = form.control?.logistic_eta ?? null;
                const late = daysToDelivery !== null && daysToDelivery < 0;
                const hasStockStep = goodsN > 0;
                const onHold = balanceGate === "hold" || storageGate === "hold";
                // The delivery status word (D1 0277, supersedes the 2026-07-19
                // "Scheduled" wording): Confirmed = the CUSTOMER confirmed date
                // + slot · Not confirmed = only a logistics date (logistic_eta)
                // exists · logistics assigned with no date at all = the ACTION
                // that closes it (C1 banned the gap-word that used to sit here)
                // · Delivered = done (grey, never alarms).
                const bookingConfirmed =
                  form.control?.booking_stage === "confirmed" &&
                  !!form.control.confirmed_date;
                const statusWord = deliveredDone
                  ? "Delivered"
                  : onHold
                    ? "On hold"
                    : late
                      ? `Overdue ${-(daysToDelivery ?? 0)}d`
                      : bookingConfirmed
                        ? "Confirmed"
                        : eta
                          ? "Not confirmed"
                          : order.ops_assigned_logistic
                            ? deliveryDateGapFact(chasePartnerName)
                            : "No logistics picked";
                return (
                  <div className="max-w-[700px]">
                    {/* Grounded delivery card (Loan template; Jess 2026-07-19) —
                        ONE shipment = ONE card. The 4-node in-tab spine is
                        retired; the whole-order journey spine stays in the left
                        rail. Icon never tints (grey when done); status word in
                        the caption; deadline anchor + DO print top-right. */}
                    <div className="bg-white border border-base-200 rounded-[11px] shadow-[0_1px_2px_rgba(16,24,40,0.05)] overflow-hidden">
                      {/* header — truck · status · logistics · deadline / DO */}
                      <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span
                            className={`h-8 w-8 shrink-0 rounded-[9px] grid place-items-center ${
                              deliveredDone
                                ? "bg-base-100 text-base-500"
                                : "bg-primary/10 text-primary"
                            }`}
                          >
                            {deliveredDone ? <Check size={16} /> : <Truck size={16} />}
                          </span>
                          <div className="min-w-0">
                            <div className="text-label font-semibold tracking-[0.05em] uppercase text-base-500">
                              {statusWord}
                            </div>
                            <div
                              className={`text-body font-semibold truncate ${
                                deliveredDone ? "text-base-500" : "text-base-900"
                              }`}
                              title={chasePartnerName ?? "No logistics picked yet"}
                            >
                              {chasePartnerName ?? "No logistics picked yet"}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {/* the deadline DATE lives ONCE, in the labeled
                              "Customer deadline" row below (mono, full weekday);
                              the header keeps only the urgency badge + DO. */}
                          {late && !deliveredDone && (
                            <span className="text-label font-semibold rounded-[5px] px-1.5 py-0.5 bg-[#FCEBEB] text-[#A32D2D]">
                              overdue {-(daysToDelivery ?? 0)}d
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => void openDoPdf(order.id)}
                            title="Print the Delivery Order (DO) — the driver's what-to-do sheet: items, address, RM to collect"
                            className="inline-flex items-center gap-1 text-label text-primary"
                          >
                            <Printer size={14} /> DO
                          </button>
                        </div>
                      </div>
                      {/* T5 — booking progress spine (read-only): WHERE the
                          delivery is in 3 seconds. Each tick derives from a
                          signal this card already reads — the logistics name
                          above, booking_stage (0277), do_number (auto on
                          dispatch, 0098), the same delivered signal as the
                          chip, the delivery-photo ledger (T6, 0280) — so
                          ticks and chip can never disagree. */}
                      <BookingSpine
                        partnerAssigned={!!chasePartnerName}
                        customerConfirmed={bookingConfirmed}
                        doIssued={!!order.do_number}
                        delivered={deliveredDone}
                        photoUploaded={
                          (form.control?.delivery_photos?.length ?? 0) > 0
                        }
                      />
                      {/* body */}
                      <div className="border-t border-base-100 px-3 py-2">
                  <FieldGrid>
                    <RoutingFields
                      orderId={order.id}
                      customerAddress={order.customer_address ?? null}
                      deliveryDate={order.delivery_date}
                      proceedDate={order.proceed_date ?? null}
                      opsAssignedLogistic={order.ops_assigned_logistic ?? null}
                      form={form}
                      hideRegion
                      hideDeadline
                    />
                    {/* rev23 — the deadline is IMPORT-OWNED (AutoCount "New-
                        Delivery Date"): read-only here. A customer delay is
                        recorded via Postponed (the one-time 0196 extension —
                        original date snapshotted for storage) — NOT by editing
                        this date; casual "prefers Saturday" talk → NOTES. */}
                    <FieldRow label="Customer deadline">
                      <span className="flex items-center gap-2 min-w-0 flex-wrap justify-end">
                        <span className="text-label text-base-500 whitespace-nowrap">
                          auto · AutoCount
                        </span>
                        <span
                          className={`font-mono text-body font-semibold ${overDeadline && !deliveredDone ? "text-danger" : "text-base-900"}`}
                        >
                          {deadlineFull}
                        </span>
                        {/* paint-once: with an extension recorded, the row
                            right below already says "→ 31 Jul 26 …". */}
                        {(form.control?.extension_count ?? 0) === 0 && (
                          <button
                            type="button"
                            onClick={() => setPostponeOpen((v) => !v)}
                            title="Record the customer's ONE-TIME formal delivery extension (affects the storage free window; a 2nd needs a principal). Casual date talk goes in Notes."
                            className="text-meta text-info hover:underline whitespace-nowrap"
                          >
                            Postponed?
                          </button>
                        )}
                      </span>
                    </FieldRow>
                    {(postponeOpen ||
                      (form.control?.extension_count ?? 0) > 0) && (
                      <StorageExtensionRow
                        orderId={order.id}
                        control={form.control}
                        hasMsbf={hasMsbf}
                        hasSof={hasSof}
                        meta={{
                          orderCode: `SO-${order.so}`,
                          customerName: order.customer_name ?? "",
                          customerPhone: order.customer_phone ?? "",
                        }}
                      />
                    )}
                  </FieldGrid>
                      </div>
                      {/* Goods ready — READ-ONLY (guardrail: the work lives in
                          Items). SAME stockCats the Items tab derives from. */}
                      {hasStockStep && (
                        <DRow k="Goods ready">
                          <span className="leading-relaxed">
                            {stockCats.map((c, i) => (
                              <span key={c.cat}>
                                {i > 0 && " · "}
                                {c.label} {c.ready}/{c.total}
                                {c.allReady ? (
                                  " ✓"
                                ) : (
                                  <span className="text-warning"> — {c.status}</span>
                                )}
                              </span>
                            ))}
                          </span>
                          <button
                            type="button"
                            onClick={() => setTab("items")}
                            className="text-label text-info whitespace-nowrap"
                          >
                            Items ›
                          </button>
                        </DRow>
                      )}
                      {/* Collect — SAME balanceDue the Balance tab shows; hidden
                          when no total (never a wrong RM0 on the phone). The one
                          line the person on the phone actually needs. */}
                      {!deliveredDone && totalSet && balanceDue > 0 && (
                        <DRow k="Collect">
                          <span className="font-mono font-semibold text-danger">
                            {RM(balanceDue)}
                          </span>
                          <span className="text-label text-base-400">
                            before delivery
                          </span>
                        </DRow>
                      )}
                      {/* Confirm delivery date — the two message tones:
                          Remind (gentle, pre-deadline) / Call (firm). */}
                      {order.ops_assigned_logistic && !deliveredDone && (
                        <DRow k="Confirm delivery date">
                          <span className="flex items-center gap-1.5">
                            <Btn
                              variant="ghost"
                              size="sm"
                              icon={Bell}
                              onClick={() => copyChase("logistic", "reminder")}
                            >
                              Remind
                            </Btn>
                            <Btn
                              variant="box"
                              size="sm"
                              icon={MessageCircle}
                              onClick={() => copyChase("logistic", "chase")}
                            >
                              Call
                            </Btn>
                          </span>
                        </DRow>
                      )}
                      {/* D1 BOOKING (0277) — the two-stage truth under Confirm
                          delivery date: what logistics said (provisional) vs what
                          the CUSTOMER confirmed (date + slot, evidence-stamped).
                          The server enforces the gates; hints here assist. */}
                      {!deliveredDone && (
                        <BookingBlock
                          // S4 keeps the DRAWER mounted across ‹prev/next› so
                          // the tab carries — deliberate, see :1988. The
                          // booking panel must NOT carry: its date, slot and
                          // trip split are one order's answer, and Confirm
                          // posts them to whichever orderId is current. Keyed
                          // here and not on the drawer, so S4 survives.
                          key={order.id}
                          orderId={order.id}
                          control={form.control}
                          doNumber={order.do_number ?? null}
                          goodsReadyHint={allReceived}
                          balanceOwingHint={balanceOwing}
                          outstandingHint={moneyOutstanding}
                          groupStates={bookingGroupStates}
                        />
                      )}
                      {/* T6 (0280) — the artifact: once delivered, the proof
                          photo attaches here. The server refuses uploads on a
                          not-yet-delivered order; this row simply doesn't
                          render until then. */}
                      {deliveredDone && (
                        <DeliveryPhotoRow orderId={order.id} />
                      )}
                      {/* The fields nobody fills (ETA 1.6% · chase-day 0.5%) —
                          tucked behind a fold, opened only when needed (Jess
                          2026-07-19: design to the data). */}
                      {!deliveredDone && (
                        <details className="border-b border-base-100 last:border-b-0">
                          <summary className="px-3 py-2 text-label text-base-500 cursor-pointer select-none list-none flex items-center gap-1.5">
                            <ChevronDown size={14} /> Booking ETA · auto-reminder
                          </summary>
                          <div className="px-3 pb-2">
                            <FieldGrid>
                              {/* fields save the moment they change (Customer-
                                  confirmed checkbox REMOVED rev25 — "we don't
                                  mark"; the 0220 column stays, no UI). */}
                              <LogisticEtaField
                                form={form}
                                onCommit={(v) =>
                                  quickSave.mutate({ logistic_eta: v || null })
                                }
                              />
                            </FieldGrid>
                            {/* Auto-reminder — the 0197 cron creates the
                                task by ITSELF on deadline−N; nothing to press. */}
                            {contactByLabel && (
                              <div className="flex items-center gap-1 py-0.5 text-meta text-base-400">
                                <span className="truncate">
                                  if no date confirmed, auto-reminder {contactByLabel}
                                </span>
                                {editingChaseDays ? (
                                  <span className="flex items-center gap-0.5 whitespace-nowrap shrink-0">
                                    <span>−</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={60}
                                      autoFocus
                                      value={form.draft.contact_by_days}
                                      onChange={(e) =>
                                        form.set("contact_by_days", e.target.value)
                                      }
                                      onBlur={(e) => {
                                        const v = e.target.value.trim();
                                        const saved =
                                          form.control?.contact_by_days != null
                                            ? String(form.control.contact_by_days)
                                            : "";
                                        if (v !== saved)
                                          quickSave.mutate({
                                            contact_by_days: v ? Number(v) : null,
                                          });
                                        setEditingChaseDays(false);
                                      }}
                                      placeholder="3"
                                      aria-label="Days before the deadline for the automatic reminder"
                                      className="w-8 rounded border border-base-200 bg-white px-1 py-0.5 text-meta text-center outline-none focus:border-primary"
                                    />
                                    <span>d</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setEditingChaseDays(true)}
                                    title="Automatic — a task is created by itself this many days before the deadline. Click to change."
                                    className="text-base-400 hover:text-base-600 whitespace-nowrap shrink-0"
                                  >
                                    · −{contactByDays}d auto
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                      {/* Delivered = grey note; a delivered order never alarms
                          (pre-golive guardrail #2). */}
                      {deliveredDone && (
                        <div className="px-3 py-2.5 text-center text-meta font-semibold text-base-500">
                          Delivered — nothing to do
                        </div>
                      )}
                    </div>
                    {/* NOTES — not a stage: the auto-dated customer log. */}
                    <div className="border-t border-base-100 mt-2.5 pt-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-meta font-semibold uppercase tracking-[0.04em] text-base-600">
                          Notes
                        </span>
                        <span className="text-label text-base-400">
                          · auto-dated
                        </span>
                      </div>
                      <DeliveryNotesLog
                        value={form.draft.customer_request}
                        onCommit={(next) => {
                          form.set("customer_request", next);
                          quickSave.mutate({ customer_request: next || null });
                        }}
                      />
                    </div>
              {/* Logistics / route (§7.6) — HIDDEN by default: the Logistics
                  dropdown above IS the standard single-company route, so the
                  multi-leg bar only renders when the order actually has legs,
                  or after "+ Add stop" opens it. */}
              {/* 3A — no permanent multi-leg furniture on the tab face: the
                  block renders only when the order HAS legs, or after the ⋮
                  "Multi-leg route…" opens it. */}
              {((order.delivery_stops?.length ?? 0) > 0 || showRouteBlock) && (
                <div className="border-t border-base-100 pt-2 mt-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-meta text-base-400">
                      Logistics / route
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
              )}
                  </div>
                );
              })()}
            </div>
          </Panel>
          </SectionCard>
          </div>
        </div>{/* /tab contents */}
        </div>{/* /right column */}
        </div>{/* /two-column shell */}
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

// D2 (2026-08-06) — `ReceiveLineModal` and its `useReceiveLine` hook STOOD HERE
// and are deleted with the route they called. Receiving happens in ONE place, the
// Receiving Workspace, which opens a Session and writes the event; this modal wrote
// neither. It had never been used. Do not add a receive form to this drawer again —
// the hand-over is the PO row's `Check in` link.
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
  const field = `mt-0.5 ${fieldCls}`; // THE one input recipe (components/Field)

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
        <div className="text-meta text-base-600">
          <span className="font-semibold text-meta text-foreground">{itemSku}</span>
          <span className="ml-2 text-base-400">→ {soRef} · FREE loaner</span>
        </div>
        <p className="text-meta text-base-500">
          The sofa is marked on-loan; the real sofa line stays Waiting. Collect it
          back (swap) at the real delivery.
        </p>
        <label className="block">
          <span className="text-meta text-base-500">Loan DO # (optional)</span>
          <input
            value={doNumber}
            onChange={(e) => setDoNumber(e.target.value)}
            placeholder="e.g. DO-5321"
            className={field}
          />
        </label>
        <label className="block">
          <span className="text-meta text-base-500">Note (optional)</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. customer moving in this week"
            className={field}
          />
        </label>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose} disabled={loan.isPending}>
            Cancel
          </Btn>
          <Btn variant="hero" onClick={submit} disabled={loan.isPending}>
            {loan.isPending ? "Loaning…" : "Loan sofa"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/** Grid cells (spreadsheet look) — label cell (darker for readability) + value
 *  cell, both fully bordered. Kc/Vc compose into 1- or 2-up grid rows. */
/** CustomerIdentityCard (Jess 2026-07-17 rev 4) — identity ONLY, no stage
 *  checklist: 38px flame-tint person circle · name · "#so · region · state"
 *  · contact chips (copy / WhatsApp) · pencil = inline edit of name / phone /
 *  address. NOTE: Carres has NO customer master yet — the edit updates THIS
 *  order's customer fields (updateOrderInputSchema, presence-only); a real
 *  cross-order customer record needs its own table + API (flagged to Jess). */
function CustomerIdentityCard({
  order,
  regionLabel,
  statusWord,
  collapsed = false,
}: {
  order: {
    id: string;
    so: number;
    status: string;
    customer_name: string | null;
    customer_phone: string | null;
    customer_address: string | null;
    source_ref?: string[] | null;
    /** POS entry extras — `fields.building_type` shows under the address. */
    entry_data?: Record<string, unknown> | null;
  };
  regionLabel: string | null;
  statusWord: string;
  /** Rail collapsed (56px icon-only) — the block shrinks to the avatar. */
  collapsed?: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  // rev 9 shell: the block reads COMPACT by default; the full address expands
  // on demand (it ate the 260px rail's height when always open).
  const [showAddr, setShowAddr] = useState(false);
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
  const wa = waLink(order.customer_phone);
  // Building type (Loo 2026-07-19) — POS wizard extra riding entry_data;
  // delivery-access info (landed vs condo etc.) for scheduling.
  const buildingType = (() => {
    const f = (order.entry_data as { fields?: Record<string, unknown> } | null | undefined)
      ?.fields;
    const v = f?.["building_type"];
    return typeof v === "string" && v.trim() ? v : null;
  })();
  const copy = (v: string, what: string) => {
    void navigator.clipboard.writeText(v);
    toast.success(`${what} copied`);
  };
  const chip =
    "inline-flex items-center gap-1 rounded-[6px] border border-base-200 bg-base-50 px-1.5 py-0.5 text-meta text-base-700 hover:border-base-300 min-w-0";
  const field =
    "mt-0.5 w-full px-2 py-1 border border-base-200 rounded-[6px] text-body bg-white outline-none focus:border-primary";
  // Rail collapsed (56px) — icon-only: the avatar carries the identity as a
  // tooltip; everything else waits for the rail to expand.
  if (collapsed) {
    return (
      <div
        className="kpi-box grid place-items-center py-2"
        title={`${order.customer_name ? displayCustomerName(order.customer_name) : "—"} · #${order.so} · ${statusWord}`}
      >
        <span className="size-[34px] rounded-full grid place-items-center shrink-0 bg-base-100 text-base-500">
          <User size={18} strokeWidth={2} aria-hidden="true" />
        </span>
      </div>
    );
  }
  return (
    <div className="kpi-box relative">
      <div className="flex items-start gap-2 min-w-0">
        <span className="size-[34px] rounded-full grid place-items-center shrink-0 bg-base-100 text-base-500">
          <User size={18} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block text-body font-semibold leading-tight ${cjkClassName(order.customer_name ?? "")}`}
            title={order.customer_name ?? undefined}
          >
            {order.customer_name ? displayCustomerName(order.customer_name) : "—"}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 min-w-0 flex-wrap">
            {/* The ONE black element on the page — the order id badge. */}
            <span className="font-mono font-semibold text-meta text-white bg-base-900 rounded-[5px] px-1.5 py-0.5 shrink-0">
              #{order.so}
            </span>
            {/* Customer/supplier REF — the CR/TCF the suppliers recognise (Jess
                2026-07-19). One order can carry several; show the first + "+N". */}
            {(order.source_ref ?? []).length > 0 && (
              <span
                className="font-mono text-meta text-base-700 bg-base-100 border border-base-200 rounded-[5px] px-1.5 py-0.5 shrink-0"
                title={(order.source_ref ?? []).join(" · ")}
              >
                {(order.source_ref ?? [])[0]}
                {(order.source_ref ?? []).length > 1
                  ? ` +${(order.source_ref ?? []).length - 1}`
                  : ""}
              </span>
            )}
            {/* State PILL — the ONE shared status→pill map (no per-surface
                hand-roll; Pending is amber here too now). */}
            <span className={`pill text-meta shrink-0 ${orderStatusPill(statusWord)}`}>
              {statusWord}
            </span>
            {regionLabel && (
              <span className="text-meta text-base-500 truncate">
                {regionLabel}
              </span>
            )}
          </span>
        </span>
        <button
          type="button"
          aria-label={editing ? "Cancel edit" : "Edit customer details"}
          title={editing ? "Cancel edit" : "Edit name / phone / address"}
          onClick={() => {
            if (editing) {
              setEditing(false);
              return;
            }
            setName(order.customer_name ?? "");
            setPhone(order.customer_phone ?? "");
            setAddress(order.customer_address ?? "");
            setErr(null);
            setEditing(true);
          }}
          className="size-7 rounded-full inline-grid place-items-center text-base-500 hover:bg-hovertint hover:text-base-800 shrink-0"
        >
          {editing ? <X size={14} /> : <Pencil size={14} />}
        </button>
      </div>
      {!editing ? (
        <div className="mt-2 space-y-1.5 min-w-0">
          <div className="flex items-center gap-1 flex-wrap min-w-0">
            {order.customer_phone && (
              <button
                type="button"
                className={chip}
                onClick={() => copy(order.customer_phone ?? "", "Phone")}
                title="Copy phone"
              >
                <Phone size={14} aria-hidden="true" />
                <span className="font-mono truncate">{order.customer_phone}</span>
              </button>
            )}
            {wa && (
              <button
                type="button"
                className={`${chip} text-chase`}
                onClick={() => window.open(wa, "_blank", "noopener")}
                title="Open WhatsApp chat"
                aria-label="WhatsApp"
              >
                <MessageCircle size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          {/* Address behind an expand (rev 9 shell — the compact block keeps
              the 260px rail short; expanding shows the FULL address, click =
              copy as before). */}
          {order.customer_address && (
            <>
              <button
                type="button"
                onClick={() => setShowAddr((v) => !v)}
                aria-expanded={showAddr}
                title={showAddr ? "Hide the address" : "Show the full address"}
                className="flex items-center gap-1 text-meta font-medium text-base-500 hover:text-base-800"
              >
                <MapPin size={14} aria-hidden="true" className="text-base-400" />
                Address
                {showAddr ? (
                  <ChevronDown size={14} aria-hidden="true" />
                ) : (
                  <ChevronRight size={14} aria-hidden="true" />
                )}
              </button>
              {showAddr && (
                <button
                  type="button"
                  className="w-full text-left text-body text-base-900 leading-snug hover:text-base-700"
                  onClick={() => copy(order.customer_address ?? "", "Address")}
                  title="Click to copy the address"
                >
                  {order.customer_address}
                </button>
              )}
              {showAddr && buildingType && (
                <div
                  className="text-meta text-base-500"
                  data-testid="ops-building-type"
                >
                  Building type: {buildingType}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* Edit expands WITHIN its own card as a floating overlay (Jess: never
           push the sibling panels — the stat row keeps one equal height). */
        <div
          className="absolute left-1 right-1 top-12 z-20 bg-white border border-base-200 rounded-[10px] shadow-lg p-2.5 space-y-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" aria-label="Customer name" />
          <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" aria-label="Customer phone" />
          <input className={field} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" aria-label="Customer address" />
          {/* Data-honest (no customer master table exists — each order keeps
              its own copy): this edit changes THIS ORDER ONLY. */}
          <div className="text-meta text-base-500 leading-snug">
            Updates this order only — other orders keep their own copy.
          </div>
          {err && <div className="text-meta text-danger">{err}</div>}
          <div className="flex items-center gap-1.5">
            <Btn
              size="sm"
              onClick={() => {
                setErr(null);
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
              }}
              disabled={update.isPending}
            >
              Save
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

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
      "mt-0.5 w-full px-2 py-1.5 border border-base-200 rounded text-body bg-white outline-none focus:border-base-700";
    return (
      <div className="space-y-2">
        <label className="block">
          <span className="text-meta text-base-500">Customer name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="text-meta text-base-500">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            className={field}
          />
        </label>
        <label className="block">
          <span className="text-meta text-base-500">Address</span>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            className={`${field} resize-none`}
          />
        </label>
        {err && <p className="text-meta text-danger">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={update.isPending}
            className="btn-ghost text-meta"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={update.isPending}
            className="btn-primary text-meta"
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
    <div className="flex flex-col h-full text-meta">
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
      {/* 0261-0263 — "did this customer buy a guarantee". Renders nothing when
          they didn't, so pre-guarantee orders look untouched. */}
      <GuaranteeCoverStrip orderId={order.id} />
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
      <span className="text-meta text-base-400 shrink-0">{label}</span>
      <span className="min-w-0 text-right text-base-900">{children}</span>
    </div>
  );
}

/** Grounded-card KV row — the Loan-card language, STANDARD kit tokens (label
 *  base-500 uppercase 11/600 — READABLE, not the washed base-300; value base-900;
 *  36px). Used by the Delivery card. */
/**
 * C7 → SLICE 2 — the delivery order, in one row, and it is a FACT in both
 * states.
 *
 * Issued → the number, a door to the document's page. Not issued → the words,
 * because the SYSTEM issues the document itself the moment every requirement
 * is met (`docs/orders/MASTER.md` §8 — no Issue, Release or Approve button in
 * any state) — PLUS the one governed manual door the owner ruled 2026-08-19
 * (card §5): `Request Delivery Order`, for the outstation trip whose partner
 * schedules the customer, so the paper is needed BEFORE a confirmed booking
 * exists. The door walks the SAME issuing path with the SAME gates — goods,
 * money (0362) and the Finance exception — merely without waiting for the
 * booking-confirm trigger. A refusal names the failing gate.
 */
function DeliveryOrderRow({
  orderId,
  doNumber,
}: {
  orderId: string;
  doNumber: string | null;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const request = useMutation({
    mutationFn: () =>
      apiFetch<{ order: { do_number: string | null }; issued: boolean }>(
        `/api/operation/orders/${encodeURIComponent(orderId)}/delivery-order/request`,
        { method: "POST" },
      ),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: qk.operation.order(orderId) });
      void qc.invalidateQueries({ queryKey: qk.operation.orders() });
      if (res.order.do_number) {
        toast.success(`Delivery order issued — ${res.order.do_number}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DRow k="Delivery order">
      {doNumber ? (
        /* The number is a DOOR to the document's own page (§0.1: DO → DO). */
        <button
          type="button"
          className="font-mono text-body font-semibold text-blue-700 underline-offset-2 hover:underline"
          onClick={() =>
            navigate(`/operation/delivery-orders/${encodeURIComponent(doNumber)}`)
          }
        >
          {doNumber}
        </button>
      ) : (
        <span className="flex items-center gap-2 flex-wrap justify-end min-w-0">
          {/* An absent value reads as WORDS, never a dash (COPY-STANDARD
              2026-08-15) — and the words say who acts: the system, or this
              one governed request door. */}
          <span className="text-meta text-base-500">
            No delivery order yet — the system issues it when the goods, money
            and date are ready
          </span>
          <Btn
            data-testid="request-delivery-order"
            disabled={request.isPending}
            onClick={() => request.mutate()}
          >
            Request Delivery Order
          </Btn>
        </span>
      )}
    </DRow>
  );
}

/** D1 two-stage booking (0277) — the BOOKING rows under Confirm delivery date.
 *  Stage 1 (provisional) = the logistics company's date; it already lives in
 *  logistic_eta (editable in the Booking ETA fold). This block records
 *  Stage 2: the CUSTOMER's yes — date + time slot, both required (invariant
 *  #1). Re-confirm updates the date/slot and re-stamps the evidence (no
 *  un-confirm — a typo is fixed by confirming again).
 *
 *  C7 (2026-07-27) — the confirm endpoint no longer refuses on goods or money
 *  (`docs/ORDERS-WORKING-FLOW.md` §5: agreeing a date is softer than issuing
 *  the document). It still refuses date-and-slot-both and Sunday; the hint
 *  line below now names what ISSUING will refuse, which is where the hard gate
 *  lives. */
function BookingBlock({
  orderId,
  control,
  doNumber,
  goodsReadyHint,
  balanceOwingHint,
  outstandingHint,
  groupStates,
}: {
  orderId: string;
  control: OpsOrderControl | null;
  /** C7 — `orders.do_number`: the delivery order's own completion signal.
   *  Non-null = the document exists for this trip. */
  doNumber: string | null;
  goodsReadyHint: boolean;
  balanceOwingHint: boolean;
  outstandingHint: number;
  /** T8 — every delivery group on this order with its own readiness, computed
   *  from the SAME reserved-to-this-SO rule the server gate uses. */
  groupStates: { key: DeliveryGroupKey; ready: boolean }[];
}) {
  const stage = control?.booking_stage ?? "none";
  const eta = control?.logistic_eta ?? null;
  const confirmed = stage === "confirmed" && !!control?.confirmed_date;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  // T9 (0283) — what the ORDER'S CARRIER says about this date. Asked only while
  // the panel is open (a closed panel has no date to ask about). Advisory: the
  // Confirm button never reads it, because a partner's working pattern is the
  // partner's fact, not one of our obligations — the operator may have already
  // phoned them.
  const [rulesOpen, setRulesOpen] = useState(false);
  const partnerCheck = usePartnerBookingCheck(orderId, open ? date : "");
  const partnerWarnings = partnerCheck.data?.warnings ?? [];
  const checkedPartner = partnerCheck.data?.partner ?? null;
  // T8 — which groups THIS trip carries. null = the whole order, and it is the
  // default on purpose: the operator has to actively choose a split, because
  // splitting requires having asked the customer (Jess: never auto-split).
  const [tripGroups, setTripGroups] = useState<DeliveryGroupKey[] | null>(null);
  const readyGroups = groupStates.filter((g) => g.ready).map((g) => g.key);
  const waitingGroups = groupStates.filter((g) => !g.ready).map((g) => g.key);
  const splitAvailable = readyGroups.length > 0 && waitingGroups.length > 0;
  // The scope of the booking already on file (null column = the whole order).
  const bookedGroups = (control?.booking_groups ?? null) as
    | DeliveryGroupKey[]
    | null;
  const owedGroups = bookedGroups
    ? groupStates.map((g) => g.key).filter((k) => !bookedGroups.includes(k))
    : [];
  const confirm = useConfirmBooking(orderId, {
    onSuccess: (res) => {
      toast.success("Booking confirmed — the customer's date + slot are recorded");
      // T9 — the booking is SAVED either way; if the company's own rules bend
      // on that date, say so once so the operator knows to ring them.
      const first = res.partnerWarnings?.[0];
      if (first) toast.warning(first.message);
      // C7 — §5: agreeing a date WARNS about goods and money, it no longer
      // refuses. The sentences name what the delivery order will refuse if
      // nobody clears them, so the operator hears it now instead of at the
      // last step.
      for (const w of res.gateWarnings ?? []) toast.warning(w);
      setOpen(false);
      setRulesOpen(false);
      setTripGroups(null);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't confirm the booking",
      ),
  });
  const sunday = !!date && isSundayIso(date);
  // The trip being booked right now: an explicit split, or everything.
  const tripScope = tripGroups ?? groupStates.map((g) => g.key);
  const tripReady =
    tripScope.length === 0 ||
    tripScope.every((k) => readyGroups.includes(k));
  const gateHints: string[] = [];
  if (!tripReady)
    gateHints.push(
      tripGroups
        ? `${tripScope.map(deliveryGroupLabel).join(" + ")} not all reserved`
        : "goods not all reserved",
    );
  else if (!goodsReadyHint && !tripGroups) gateHints.push("goods not all reserved");
  // Decision A (owner ruling 2026-08-16, docs/orders/MASTER.md §8) — money no
  // longer blocks the delivery order, so it may not ride the "cannot be
  // issued" sentence above. It gets its own honest line: the collection stays
  // open, and the paper issues regardless. Same voice as the server's own
  // warning ("collection is still open").
  const moneyHint = balanceOwingHint
    ? `RM ${outstandingHint.toFixed(2)} outstanding — collection is still open; it does not block the delivery order`
    : null;
  const FIELD =
    "rounded border border-base-300 bg-white px-1.5 py-0.5 text-body text-base-900 outline-none hover:border-base-400 focus:border-primary";
  return (
    <>
      <DRow k="Booking">
        {confirmed && control ? (
          <span className="flex items-center gap-2 flex-wrap justify-end min-w-0">
            <span className="text-meta font-semibold text-success whitespace-nowrap">
              ✓ Customer confirmed
            </span>
            <span className="font-mono text-body font-semibold text-base-900 whitespace-nowrap">
              {fmtDate(control.confirmed_date).split(",")[0]}
            </span>
            {control.confirmed_time_slot && (
              <span className="text-meta text-base-600 whitespace-nowrap">
                {control.confirmed_time_slot}
              </span>
            )}
            {bookedGroups && (
              <MiniBadge tone="muted">
                {bookedGroups.map(deliveryGroupLabel).join(" + ")} only
              </MiniBadge>
            )}
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => {
                setDate(control.confirmed_date ?? "");
                setSlot(control.confirmed_time_slot ?? "");
                setTripGroups(bookedGroups);
                setOpen((v) => !v);
              }}
            >
              Re-confirm
            </Btn>
          </span>
        ) : (
          <span className="flex items-center gap-2 flex-wrap justify-end min-w-0">
            {eta ? (
              <>
                <span className="text-meta text-base-600 whitespace-nowrap">
                  logistics said
                </span>
                <span className="font-mono text-body font-semibold text-base-900 whitespace-nowrap">
                  {fmtDate(eta).split(",")[0]}
                </span>
                <MiniBadge tone="waiting">not confirmed</MiniBadge>
              </>
            ) : (
              <span className="text-meta text-base-400">no date yet</span>
            )}
            <Btn
              variant="box"
              size="sm"
              onClick={() => {
                setDate(eta ?? "");
                setSlot("");
                setOpen((v) => !v);
              }}
            >
              Confirm with customer
            </Btn>
          </span>
        )}
      </DRow>
      {/* C7 — the delivery order (Jess 2026-07-27). Logistics ring to say they
          are delivering tomorrow and, until this card, an operator had to
          produce the paper by hand — the number was stamped by a DB trigger on
          the DISPATCH transition (0098), a day too late to hand over. One press
          now, the moment the customer's date is confirmed, and the SYSTEM
          writes it. The row always renders: an outstation trip needs its
          paper BEFORE a confirmed booking exists (owner ruling 2026-08-19),
          so the request door must be reachable in that state too. */}
      <DeliveryOrderRow orderId={orderId} doNumber={doNumber} />
      {/* T8 — the second trip. A split order still owes the customer a group;
          this row is the ONLY place that says so, and it stays until that
          group is booked. The button re-opens the same confirm panel scoped to
          what is owed, so the follow-up trip goes through the same door (and
          the same gates) as the first one. */}
      {confirmed && owedGroups.length > 0 && (
        <DRow k="Second trip">
          <span className="flex items-center gap-2 flex-wrap justify-end min-w-0">
            <span className="text-meta text-base-600 whitespace-nowrap">
              {owedGroups.map(deliveryGroupLabel).join(" + ")} still to deliver
            </span>
            {owedGroups.every((k) => readyGroups.includes(k)) ? (
              <Btn
                variant="box"
                size="sm"
                onClick={() => {
                  setDate("");
                  setSlot("");
                  setTripGroups(owedGroups);
                  setOpen(true);
                }}
              >
                Book second trip
              </Btn>
            ) : (
              <MiniBadge tone="waiting">stock not in yet</MiniBadge>
            )}
          </span>
        </DRow>
      )}
      {open && (
        <DRow k="Customer confirmed" block>
          {/* T8 — the wait-vs-split conversation. It appears ONLY when part of
              the order is ready and part is not, and it opens on "wait": the
              operator has to pick the split after asking the customer, which
              is exactly what "never auto-split" means on screen. */}
          {splitAvailable && !bookedGroups && (
            <div className="py-1 space-y-1 text-right">
              <div className="text-meta text-base-600">
                {waitingGroups.map(deliveryGroupLabel).join(" + ")} not ready
                yet. Ask the customer:
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <Btn
                  variant={tripGroups === null ? "box" : "ghost"}
                  size="sm"
                  onClick={() => setTripGroups(null)}
                  title="Nothing is delivered until every item is in — one trip"
                >
                  Wait for everything
                </Btn>
                <Btn
                  variant={tripGroups !== null ? "box" : "ghost"}
                  size="sm"
                  onClick={() => setTripGroups(readyGroups)}
                  title={`Deliver ${readyGroups.map(deliveryGroupLabel).join(" + ")} now; the rest goes on a second trip`}
                >
                  Deliver {readyGroups.map(deliveryGroupLabel).join(" + ")} now
                </Btn>
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap justify-end py-0.5">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Customer-confirmed delivery date"
              className={`${FIELD} w-[150px]`}
            />
            <select
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              aria-label="Customer-confirmed time slot"
              className={`${FIELD} w-[190px]`}
            >
              <option value="">— time slot —</option>
              {DELIVERY_TIME_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Btn
              variant="box"
              size="sm"
              // C7 (§5) — goods and money no longer disable this button: a date
              // can be agreed with a customer while both are still coming, and
              // the paper is what refuses to exist. What still stops it is §5's
              // own short list: date + slot both, and no Sunday.
              disabled={!date || !slot || sunday || confirm.isPending}
              title={
                !date || !slot
                  ? "Date AND time slot both needed — a date alone is not a confirmation"
                  : undefined
              }
              onClick={() =>
                confirm.mutate({
                  confirmedDate: date,
                  confirmedTimeSlot: slot,
                  // Omitted for a normal delivery — the server reads "absent"
                  // as the whole order, so a split can only ever be explicit.
                  ...(tripGroups ? { deliverGroups: tripGroups } : {}),
                })
              }
            >
              {confirm.isPending
                ? "Recording…"
                : tripGroups
                  ? `Record ${tripGroups.map(deliveryGroupLabel).join(" + ")} delivery`
                  : "Record confirmation"}
            </Btn>
          </div>
          {sunday && (
            <div className="text-right text-meta text-danger py-0.5">
              Sunday is not a delivery working day — pick another date
            </div>
          )}
          {/* T9 (0283) — the company's own rules against THIS date. Amber, not
              red, and the Confirm button stays live: these are the partner's
              facts, and a phone call can change them. Every line names the
              company so a new hire knows who to ring. */}
          {partnerWarnings.length > 0 && (
            <div className="text-right text-meta text-warning py-0.5 space-y-0.5">
              {partnerWarnings.map((w) => (
                <div key={w.key}>{w.message}</div>
              ))}
            </div>
          )}
          {checkedPartner && (
            <div className="text-right py-0.5">
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => setRulesOpen((v) => !v)}
              >
                {rulesOpen ? "Close" : `${checkedPartner.name} delivery rules`}
              </Btn>
            </div>
          )}
          {rulesOpen && checkedPartner && (
            <PartnerRulesEditor
              partnerId={checkedPartner.id}
              partnerName={checkedPartner.name}
              rules={partnerCheck.data?.rules ?? null}
              onSaved={() => {
                setRulesOpen(false);
                void partnerCheck.refetch();
              }}
            />
          )}
          {gateHints.length > 0 && (
            <div className="text-right text-meta text-warning py-0.5">
              Not ready yet: {gateHints.join(" · ")} — the delivery order cannot
              be issued until these are cleared
            </div>
          )}
          {/* Money is a separate sentence because it is a separate truth
              (decision A): it warns, it never blocks the paper. */}
          {moneyHint && (
            <div className="text-right text-meta text-warning py-0.5">
              {moneyHint}
            </div>
          )}
        </DRow>
      )}
      {confirmed && control?.customer_confirmed_at && (
        <div className="px-3 pb-1.5 text-right text-label text-base-400">
          recorded {fmtDate(control.customer_confirmed_at, { time: true })}
        </div>
      )}
    </>
  );
}

/** T9 (0283) — the logistics company's own delivery rules, edited where FIRST
 *  read (L6: "build the fields WITH the first consumer, not as an admin page up
 *  front"). Four facts, plain words: which days it runs, days it is not running
 *  at all, how many drops it takes, and how much notice it needs.
 *
 *  Sunday is not offered: nobody delivers on Sunday, and the booking gate
 *  refuses it for every company — showing a switch for it would suggest the
 *  rule is negotiable per partner.
 *
 *  The rules belong to the CARRIER, not this order: saving here changes what
 *  the portal warns about on every order that uses it, which is why the panel
 *  says so out loud and why the write is audited server-side. */
function PartnerRulesEditor({
  partnerId,
  partnerName,
  rules,
  onSaved,
}: {
  partnerId: string;
  partnerName: string;
  rules: {
    offDays: number[];
    blackoutDates: string[];
    dailyCapacity: number | null;
    bookingLeadDays: number;
  } | null;
  onSaved: () => void;
}) {
  const [offDays, setOffDays] = useState<number[]>(rules?.offDays ?? [0]);
  const [blackouts, setBlackouts] = useState<string[]>(rules?.blackoutDates ?? []);
  const [capacity, setCapacity] = useState<string>(
    rules?.dailyCapacity != null ? String(rules.dailyCapacity) : "",
  );
  const [lead, setLead] = useState<string>(String(rules?.bookingLeadDays ?? 0));
  const [newBlackout, setNewBlackout] = useState("");
  const save = useSetPartnerDeliveryRules(partnerId, {
    onSuccess: () => {
      toast.success(`${partnerName} delivery rules saved`);
      onSaved();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't save the delivery rules",
      ),
  });
  const FIELD =
    "rounded border border-base-300 bg-white px-1.5 py-0.5 text-body text-base-900 outline-none hover:border-base-400 focus:border-primary";
  const WEEK = [
    { n: 1, label: "Mon" },
    { n: 2, label: "Tue" },
    { n: 3, label: "Wed" },
    { n: 4, label: "Thu" },
    { n: 5, label: "Fri" },
    { n: 6, label: "Sat" },
  ];
  const runsOn = (n: number) => !offDays.includes(n);
  const toggleDay = (n: number) =>
    setOffDays((cur) =>
      cur.includes(n) ? cur.filter((d) => d !== n) : [...cur, n],
    );
  // Sunday is always off; the API validates the same thing, this keeps the
  // operator from saving a company that runs no day at all.
  const runsSomeDay = WEEK.some((d) => runsOn(d.n));
  const capacityNum = capacity.trim() === "" ? null : Number(capacity);
  const leadNum = Number(lead || 0);
  const valid =
    runsSomeDay &&
    Number.isInteger(leadNum) &&
    leadNum >= 0 &&
    leadNum <= 30 &&
    (capacityNum === null ||
      (Number.isInteger(capacityNum) && capacityNum >= 1 && capacityNum <= 999));
  return (
    <DRow k={`${partnerName} rules`} block>
      <div className="py-1 space-y-1.5 text-right">
        <div className="text-label text-base-500">
          These are {partnerName}&apos;s own rules — they apply to every order
          this logistics company delivers, and they warn, never block.
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span className="text-meta text-base-600">Delivers on</span>
          {WEEK.map((d) => (
            <Btn
              key={d.n}
              variant={runsOn(d.n) ? "box" : "ghost"}
              size="sm"
              onClick={() => toggleDay(d.n)}
              title={
                runsOn(d.n)
                  ? `${partnerName} runs on ${d.label}`
                  : `${partnerName} does not run on ${d.label}`
              }
            >
              {d.label}
            </Btn>
          ))}
        </div>
        {!runsSomeDay && (
          <div className="text-meta text-danger">
            A logistics company must run on at least one day of the week
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span className="text-meta text-base-600">Needs</span>
          <input
            type="number"
            min={0}
            max={30}
            value={lead}
            onChange={(e) => setLead(e.target.value)}
            aria-label={`${partnerName} booking notice in working days`}
            className={`${FIELD} w-[70px]`}
          />
          <span className="text-meta text-base-600">
            working days notice · takes at most
          </span>
          <input
            type="number"
            min={1}
            max={999}
            value={capacity}
            placeholder="not set"
            onChange={(e) => setCapacity(e.target.value)}
            aria-label={`${partnerName} deliveries a day`}
            className={`${FIELD} w-[90px]`}
          />
          <span className="text-meta text-base-600">deliveries a day</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span className="text-meta text-base-600">Not running on</span>
          {blackouts.length === 0 && (
            <span className="text-meta text-base-400">no dates</span>
          )}
          {blackouts.map((b) => (
            <Btn
              key={b}
              variant="ghost"
              size="sm"
              onClick={() => setBlackouts((cur) => cur.filter((x) => x !== b))}
              title="Remove this date"
            >
              {fmtDate(b).split(",")[0]} ×
            </Btn>
          ))}
          <input
            type="date"
            value={newBlackout}
            onChange={(e) => {
              const v = e.target.value;
              setNewBlackout("");
              if (v && !blackouts.includes(v))
                setBlackouts((cur) => [...cur, v].sort());
            }}
            aria-label={`Add a date ${partnerName} is not running`}
            className={`${FIELD} w-[150px]`}
          />
        </div>
        <div className="flex items-center gap-1.5 justify-end">
          <Btn
            variant="box"
            size="sm"
            disabled={!valid || save.isPending}
            onClick={() =>
              save.mutate({
                offDays: [0, ...WEEK.filter((d) => !runsOn(d.n)).map((d) => d.n)],
                blackoutDates: blackouts,
                dailyCapacity: capacityNum,
                bookingLeadDays: leadNum,
              })
            }
          >
            {save.isPending ? "Saving…" : "Save rules"}
          </Btn>
        </div>
      </div>
    </DRow>
  );
}

/** T6 (0280) — the delivery-photo row inside the delivery card, shown only
 *  once the order is delivered. Existing photos open in a new tab via
 *  short-lived signed urls (the bucket is private); Upload shrinks the file
 *  browser-side, then runs the sign-upload → attach flow. The SERVER is the
 *  gate (delivered-only + own-order path prefix) — this row is assistance. */
function DeliveryPhotoRow({ orderId }: { orderId: string }) {
  const photosQ = useDeliveryPhotos(orderId);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDeliveryPhoto(orderId, {
    onSuccess: () => toast.success("Delivery photo uploaded"),
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't upload the delivery photo",
      ),
  });
  const photos = photosQ.data?.photos ?? [];
  return (
    <DRow k="Delivery photo">
      <span className="flex items-center gap-2 flex-wrap justify-end min-w-0">
        {photos.length === 0 ? (
          <span className="text-meta text-base-400">no photo yet</span>
        ) : (
          photos.map((p, i) =>
            p.url ? (
              <a
                key={p.path}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-meta text-info hover:underline whitespace-nowrap"
              >
                Photo {i + 1}
              </a>
            ) : (
              <span
                key={p.path}
                className="text-meta text-base-500 whitespace-nowrap"
              >
                Photo {i + 1}
              </span>
            ),
          )
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-label="Delivery photo file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = "";
          }}
        />
        <Btn
          variant="box"
          size="sm"
          icon={Upload}
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? "Uploading…" : "Upload delivery photo"}
        </Btn>
      </span>
    </DRow>
  );
}

function DRow({
  k,
  children,
  block = false,
}: {
  k: string;
  children: ReactNode;
  /** block = value drops below the label (for a field/form that needs width). */
  block?: boolean;
}) {
  return (
    <div
      className={`px-3 py-1.5 border-b border-base-100 last:border-b-0 ${
        block
          ? ""
          : "flex items-center justify-between gap-x-3 gap-y-1 flex-wrap min-h-9"
      }`}
    >
      <span
        className={`text-label font-semibold uppercase tracking-[0.03em] text-base-500 shrink-0 ${
          block ? "block mb-1" : ""
        }`}
      >
        {k}
      </span>
      <span
        className={`min-w-0 text-body font-medium text-base-900 ${
          block
            ? ""
            : "text-right flex items-center gap-2 justify-end flex-wrap"
        }`}
      >
        {children}
      </span>
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

/** Fetch DO data + render the Delivery Order PDF — the Delivery card's "🖨 DO".
 *  The driver's what-to-do sheet: items · customer · address · RM to collect.
 *  Mirrors PrintDoButton (same /print-do-data endpoint).
 *
 *  C7 (2026-07-27) — this used to RECOMPUTE the number client-side and override
 *  the server's, which made the two printers in this very file disagree (the
 *  kebab's `PrintDoButton` never overrode anything) and made a reprint on a
 *  different day print a different number than the first copy. The number is
 *  now minted ONCE, when the delivery order is issued, in the same locked
 *  scheme — so the paper the customer signs is reproducible, which is the whole
 *  reason `docNumber` derives its tail from a stable seed. */
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

// Invoice print stays reserved for the ⋮ menu; DO print is wired on the card.
void openInvoicePdf;

/** J1 — the Sales Order PDF, same fetch-render-open flow DownloadSalesOrderButton
 *  runs. A function (not the button) because the Documents panel renders a
 *  uniform Open control on every row. */
async function openSalesOrderPdf(orderId: string, so: number) {
  try {
    const data = await apiFetch<SalesOrderTemplateData>(
      `/api/orders/${orderId}/sales-order-data`,
    );
    const blob = await renderSalesOrderPdf(data);
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
    toast.success(`Sales Order SO-${String(so).padStart(6, "0")} opened`);
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : String(e);
    toast.error(`Open sales order failed — ${msg}`);
  }
}

/** J1 — the Purchase Order PDF, the same endpoint + renderer PoDetailModal's
 *  Print button uses. */
async function openPoPdf(poId: string) {
  try {
    const data = await apiFetch<PoTemplateData>(
      `/api/operation/pos/${poId}/print-data`,
    );
    const blob = await renderPoPdf(data);
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : String(e);
    toast.error(`Open purchase order failed — ${msg}`);
  }
}

/** J1 — the supplier's signed DO in the private `delivery-orders` bucket.
 *  Signed browser-side with the caller's own JWT: the bucket's
 *  `delivery_orders_read` policy admits operation + principal outright, so
 *  this needs no Worker route (the same pattern viewSlip uses). */
async function openSupplierDo(path: string) {
  const { data, error } = await supabase.storage
    .from("delivery-orders")
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    toast.error(`Couldn't open the supplier DO — ${error?.message ?? "no URL"}`);
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

/** Malaysian receiving banks for the Bank-transfer dropdown (free set — the
 *  name rides `reference`, no schema change). */
const MY_BANKS = [
  "Maybank",
  "CIMB",
  "Public Bank",
  "RHB",
  "HLB",
  "AmBank",
  "Bank Islam",
  "BSN",
  "HSBC",
  "UOB",
  "OCBC",
  "Other",
] as const;

/** PaymentForm (Balance-tab inline spec, 2026-07-18) — ONE payment entry
 *  form, used INLINE in the Balance tab's Payments column and (wrapped in a
 *  Modal) by the collapsed band's Add-payment shortcut. Amount · Date ·
 *  Method (Cash / Bank transfer / Cheque / e-wallet) · Bank (when transfer) ·
 *  Ref no · receipt UPLOAD (drag/tap, image/PDF → orders-attachments, live
 *  via the 0180 internal-write policy) · Save/Cancel. Saving uploads the slip
 *  first, then records with `receiptUrl` (persistence deploy-gated — the live
 *  schema strips the key; the payment itself always records). The Save is the
 *  inline form's PRIMARY → the black workhorse (spec-sanctioned here). */
function PaymentForm({
  orderId,
  onDone,
  onCancel,
}: {
  orderId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<OrderPaymentMethod>("bank");
  const [bank, setBank] = useState("");
  const [refNo, setRefNo] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const record = useRecordPayment(orderId, {
    onError: (e) => toast.error(`Couldn't record payment — ${e.message}`),
  });
  const amt = Number(amount);
  const amtOk = amount.trim() !== "" && Number.isFinite(amt) && amt > 0;
  const cell = `mt-0.5 ${fieldCls}`; // THE one input recipe (components/Field)

  const acceptFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!/^image\/|^application\/pdf$/.test(f.type)) {
      toast.error("Receipt must be an image or a PDF");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Receipt too large — max 10 MB");
      return;
    }
    setFile(f);
  };

  async function save() {
    if (!amtOk || saving || record.isPending) return;
    setSaving(true);
    // 1. Upload the customer's proof first. A failed upload blocks the save
    //    so a slip is never silently dropped; remove the file to record
    //    without one.
    let receiptUrl: string | null = null;
    if (file) {
      const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-60);
      const path = `orders/${orderId}/payments/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (error) {
        setSaving(false);
        toast.error(`Slip upload failed — ${error.message}`);
        return;
      }
      receiptUrl = `${ATTACHMENTS_BUCKET}/${path}`;
    }
    // 2. Record. Bank + ref ride `reference`; the slip path rides `receiptUrl`.
    const reference =
      [method === "bank" ? bank : "", refNo.trim()].filter(Boolean).join(" · ") ||
      null;
    record.mutate(
      {
        amount: amt,
        paidOn,
        note: note.trim() || null,
        method,
        kind: "payment",
        reference,
        receiptUrl,
      },
      {
        onSuccess: () => {
          toast.success("Payment recorded");
          onDone();
        },
        onSettled: () => setSaving(false),
      },
    );
  }

  return (
    <div className="rounded-[8px] border border-base-200 bg-base-50 p-2.5 space-y-2">
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
            onChange={(e) => setMethod(e.target.value as OrderPaymentMethod)}
            aria-label="Payment method"
            className={cell}
          >
            <option value="cash">Cash</option>
            <option value="bank">Bank transfer</option>
            <option value="cheque">Cheque</option>
            <option value="online">e-wallet</option>
          </select>
        </label>
        {method === "bank" ? (
          <label className="block">
            <span className="t4-label">Bank</span>
            <select
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              aria-label="Receiving bank"
              className={cell}
            >
              <option value="">—</option>
              {MY_BANKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="t4-label">Ref no (optional)</span>
            <input
              type="text"
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              placeholder="e.g. transaction no"
              aria-label="Payment reference number"
              className={cell}
            />
          </label>
        )}
      </div>
      {method === "bank" && (
        <label className="block">
          <span className="t4-label">Ref no (optional)</span>
          <input
            type="text"
            value={refNo}
            onChange={(e) => setRefNo(e.target.value)}
            placeholder="e.g. transaction / cheque no"
            aria-label="Payment reference number"
            className={cell}
          />
        </label>
      )}
      {/* Customer proof — drag/tap; image/PDF. */}
      <div className="block">
        <span className="t4-label">Upload receipt (customer proof)</span>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            acceptFile(e.dataTransfer.files?.[0]);
          }}
          className={`mt-0.5 flex items-center gap-2 w-full px-2 py-2 border border-dashed rounded text-meta cursor-pointer ${
            dragOver
              ? "border-primary bg-primary/5 text-base-700"
              : file
                ? "border-base-300 bg-white text-base-800"
                : "border-base-300 bg-white text-base-500 hover:border-base-400"
          }`}
        >
          <input
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            aria-label="Upload payment receipt"
            onChange={(e) => {
              acceptFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {file ? (
            <>
              <Paperclip size={14} className="shrink-0 text-base-600" />
              <span className="min-w-0 truncate">
                {file.name}
                <span className="text-base-400">
                  {" "}
                  · {(file.size / 1024).toFixed(0)} KB
                </span>
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setFile(null);
                }}
                title="Remove file"
                aria-label="Remove receipt file"
                className="ml-auto shrink-0 text-base-400 hover:text-danger"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <Upload size={14} className="shrink-0" />
              Drop the slip here, or tap to choose (image / PDF)
            </>
          )}
        </label>
      </div>
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
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <Btn variant="ghost" onClick={onCancel}>
          Cancel
        </Btn>
        {/* Inline-form primary — the black workhorse (spec 2026-07-18). */}
        <button
          type="button"
          disabled={!amtOk || saving || record.isPending}
          onClick={() => void save()}
          className="btn-primary text-body disabled:opacity-40"
        >
          {saving || record.isPending ? "Saving…" : "Save payment"}
        </button>
      </div>
    </div>
  );
}

/** The collapsed band's Add-payment shortcut — the SAME PaymentForm, wrapped
 *  in a Modal (the panel body is unmounted while collapsed, so the inline
 *  spot doesn't exist yet). */
function AddPaymentModal({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  return (
    <Modal title="Record payment" onClose={onClose}>
      <PaymentForm orderId={orderId} onDone={onClose} onCancel={onClose} />
    </Modal>
  );
}

/** Method → display label (Balance v3 payment rows + the record modal). */
const PAY_METHOD_LABEL: Record<OrderPaymentMethod, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  card: "Card",
  cheque: "Cheque",
  online: "e-wallet",
  other: "Other",
};

/** Open a payment's uploaded proof: an https receipt URL directly, or a
 *  storage path via a fresh signed URL (internal read, 1h TTL). */
async function viewSlip(p: OrderPaymentRow) {
  const u = p.receipt_url;
  if (!u) return;
  if (/^https?:/i.test(u)) {
    window.open(u, "_blank", "noopener");
    return;
  }
  const path = u.startsWith(`${ATTACHMENTS_BUCKET}/`)
    ? u.slice(ATTACHMENTS_BUCKET.length + 1)
    : u;
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    toast.error(`Couldn't open slip — ${error?.message ?? "no URL"}`);
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

/** "Where this order is" — the SPINE (Jess 2026-07-18): ONE vertical
 *  progress line that is ALSO the section nav. Steps in doing order with
 *  real numbers; clicking a step opens its tab (blue wash = the tab you're
 *  on). Node grammar per Jess's approved sample: ink-filled ✓ done (the
 *  connector darkens behind it) · red ring = act now · amber = waiting ·
 *  pale ring = not yet. The line is a READING order, not a gate — every
 *  node shows its own live state. The step WORDS are the locked
 *  vocabulary; numbers may shift when the Storage step is absent.
 *  Collapsed rail → nodes only. */
type JourneyState = "done" | "act" | "wait" | "todo";

/** The step-number badge a tab header wears — SAME number + colour as its
 *  journey-spine node, so the drawer reads as one numbered journey (Jess 甲). */
function StepBadge({ n, state }: { n: number; state: JourneyState }) {
  return (
    <span
      className={`shrink-0 w-5 h-5 rounded-full grid place-items-center text-label font-semibold ${
        state === "done"
          ? "bg-base-200 text-base-500"
          : state === "act"
            ? "bg-error-soft text-danger ring-1 ring-danger"
            : state === "wait"
              ? "bg-warning-soft text-warning"
              : "bg-white border-2 border-base-300 text-base-400"
      }`}
      aria-hidden="true"
    >
      {n}
    </span>
  );
}

function JourneyCard({
  steps,
  activeTab,
  collapsed,
  onGo,
}: {
  steps: {
    panel: string;
    title: string;
    sub: string;
    state: JourneyState;
    tab: DrawerTab;
  }[];
  activeTab: DrawerTab;
  collapsed: boolean;
  onGo: (t: DrawerTab, stepIndex: number) => void;
}) {
  return (
    <div
      className={`bg-white border border-base-200 rounded-xl shrink-0 ${
        collapsed ? "p-1.5" : "p-3"
      }`}
    >
      {!collapsed && <div className="t4-label mb-2 px-1">Where this order is</div>}
      {steps.map((st, i) => {
        const last = i === steps.length - 1;
        const groundDone = steps.slice(0, i + 1).every((x) => x.state === "done");
        const active = st.tab === activeTab;
        return (
          <button
            key={st.title}
            type="button"
            onClick={() => onGo(st.tab, i)}
            aria-selected={active}
            title={`${st.title} — ${st.sub}`}
            className={`relative w-full flex items-start text-left group rounded-lg ${
              collapsed
                ? "justify-center px-0 py-1.5"
                : "gap-2.5 px-1.5 py-1.5"
            } ${active ? "is-selected" : "hover:bg-hovertint"} ${last ? "" : "pb-3"}`}
            // Selection = the ONE `.is-selected` class (#C2E7FF wash + #378ADD
            // bar); hover = the KIT blue hovertint, NEVER grey. Text stays dark
            // ink for contrast. (Jess 2026-07-20: one visible selection blue,
            // no faint hand-rolls.)
          >
            {!last && (
              <span
                aria-hidden="true"
                className={`absolute ${
                  collapsed ? "left-1/2 -translate-x-1/2" : "left-[17px]"
                } top-8 bottom-0 w-0.5 ${
                  groundDone ? "bg-base-300" : "bg-base-200"
                }`}
              />
            )}
            <span
              className={`relative z-[1] w-6 h-6 rounded-full grid place-items-center text-meta font-semibold shrink-0 ${
                st.state === "done"
                  ? "bg-base-200 text-base-500"
                  : st.state === "act"
                    ? "bg-error-soft text-danger ring-2 ring-danger"
                    : st.state === "wait"
                      ? "bg-warning-soft text-warning"
                      : "bg-white border-2 border-base-300 text-base-400"
              }`}
            >
              {i + 1}
            </span>
            {!collapsed && (
              <span className="min-w-0">
                {/* line 1 — which panel this step opens (Jess 2026-07-19) */}
                <span className="block text-label font-semibold uppercase tracking-[0.05em] text-base-400">
                  {st.panel}
                </span>
                {/* line 2 — the step's action. SELECTED = blue background
                    (bg-info-soft) + DARK ink text, matching the Orders facet
                    selection (blue chip + near-black text). The old blue-on-blue
                    (text-info on bg-info-soft) was unreadable — Jess 2026-07-19
                    "before select blue, now grey cant read". */}
                <span className="block text-body font-semibold group-hover:underline text-base-900">
                  {st.title}
                </span>
                <span
                  className={`block text-meta ${
                    st.state === "act"
                      ? "font-semibold text-danger"
                      : st.state === "wait"
                        ? "font-medium text-warning"
                        : "text-base-500"
                  }`}
                >
                  {st.sub}
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** StorageCard (Jess 2026-07-18, version B): FIVE steps, always the same
 *  order, the customer's PROMISED DATE first — everything grows from it.
 *  ① promised delivery ② free week ③ counts from ④ fee so far ⑤ ends.
 *  Counting is AUTOMATIC (anchor = (supplier-late ? latest goods ETA :
 *  deadline) + 7d); a supplier-late stretch never bills the customer.
 *  "No storage" = exemption (override 0). No instructions — facts only. */
function StorageCard({
  form,
  hasMsbf,
  hasSof,
  deadline,
  latestGoodsEta,
  supplierLate,
  autoAnchor,
  effectiveStart,
  exempt,
  delivered,
}: {
  form: ReturnType<typeof useOrderControlForm>;
  hasMsbf: boolean;
  hasSof: boolean;
  deadline: string | null;
  latestGoodsEta: string | null;
  supplierLate: boolean;
  autoAnchor: string | null;
  effectiveStart: string | null;
  exempt: boolean;
  delivered: boolean;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const { draft, set } = form;
  const endSet = draft.storage_to.trim();
  const endEff = endSet || draft.logistic_eta.trim() || todayIso;
  const auto = computeStorageFee({
    startDate: effectiveStart,
    asOf: endEff,
    hasMsbf,
    hasSof,
  });
  const impMsbf = form.control?.storage_fee_msbf ?? null;
  const impSof = form.control?.storage_fee_sof ?? null;
  const hasImportedFee = (impMsbf ?? 0) > 0 || (impSof ?? 0) > 0;
  const overrideSet = draft.storage_fee_override.trim() !== "";
  const effTotal = exempt
    ? 0
    : overrideSet
      ? Number(draft.storage_fee_override)
      : hasImportedFee
        ? (impMsbf ?? 0) + (impSof ?? 0)
        : auto.total;
  const collectedAt = form.control?.storage_collected_at ?? null;
  // C9 — `approved` means the manager RELEASED the delivery, which is not the
  // same as forgiving the fee. Waived = released with nothing left to collect
  // (the decision wrote the override to 0). Released-and-still-owed keeps
  // counting and keeps its `unpaid` pill, because the money is still ours.
  const released = form.control?.storage_waiver_status === "approved";
  const waived = released && effTotal <= 0;
  const d2n = (iso: string) =>
    new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  const dayDiff = (a: string, b: string) =>
    Math.round((d2n(b) - d2n(a)) / 86_400_000);
  const counting = !exempt && !!effectiveStart && !collectedAt && !waived;
  const soFar = effectiveStart
    ? Math.max(0, dayDiff(effectiveStart, endSet || todayIso))
    : 0;
  const freeBase = supplierLate && latestGoodsEta ? latestGoodsEta : deadline;
  // ONE value language (Jess): every fact sits in a chip or a pill — no
  // bare prose, no glyph arrows, no how-to sentences.
  const chip =
    "inline-flex items-center font-mono text-meta font-semibold text-base-800 border border-base-200 rounded-[6px] px-1.5 py-0.5 bg-white";
  const soft = "pill bg-base-100 text-base-500";

  // Grounded-card status (Loan template; Jess 2026-07-19) — the 5-node spine is
  // retired for the ONE storage card. done / not-charging = grey (never green).
  const stDone = delivered || !!collectedAt || waived || exempt;
  const statusWord = delivered
    ? "Delivered"
    : collectedAt
      ? "Collected"
      : waived
        ? "Waived"
        : released
          ? "Released"
          : exempt
            ? "No storage"
            : counting
              ? "Counting"
              : "Not counting";
  const statusName = delivered
    ? "Delivered"
    : collectedAt
      ? "Fee collected"
      : waived
        ? "Fee waived"
        : released
          ? `RM ${Math.round(effTotal).toLocaleString()} still to collect`
          : exempt
            ? "Exempted"
            : counting
              ? `Day ${soFar}`
              : "In the free week";
  const feeDue = counting && effTotal > 0;

  const deadlinePassed = !!deadline && deadline < todayIso;
  const overdueDays = deadline ? Math.max(0, dayDiff(deadline, todayIso)) : 0;

  return (
    <div className="p-3">
      {/* Grounded storage card (Loan template; Jess 2026-07-19) — the 5-node
          spine is retired; every fact is a labeled row. Anchor (promised
          delivery) first; the Fee row is the money. Icon never tints (grey when
          not charging / done). */}
      <div className="bg-white border border-base-200 rounded-[11px] shadow-[0_1px_2px_rgba(16,24,40,0.05)] overflow-hidden">
        {/* header — box · status · badge */}
        <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              className={`h-8 w-8 shrink-0 rounded-[9px] grid place-items-center ${
                feeDue ? "bg-primary/10 text-primary" : "bg-base-100 text-base-500"
              }`}
            >
              <Warehouse size={16} />
            </span>
            <div className="min-w-0">
              <div className="text-label font-semibold tracking-[0.05em] uppercase text-base-500">
                {statusWord}
              </div>
              <div
                className={`text-body font-semibold truncate ${
                  stDone || !counting ? "text-base-500" : "text-base-900"
                }`}
              >
                {statusName}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {feeDue ? (
              <span className="pill pill-warning">fee due</span>
            ) : !stDone && counting ? null : (
              <span className="pill bg-base-100 text-base-500">
                {stDone ? "done" : "no fee"}
              </span>
            )}
          </div>
        </div>
        {/* body — labeled rows */}
        <div className="border-t border-base-100">
          {/* ① the anchor — the customer's promised date, ALWAYS first */}
          <DRow k="Promised delivery">
        {deadline ? (
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <span className={chip}>{fmtDate(deadline)}</span>
            {delivered ? (
              <span className="pill pill-confirmed">delivered</span>
            ) : deadlinePassed ? (
              <span className="pill pill-overdue">passed {overdueDays}d</span>
            ) : (
              <span className={soft}>in {dayDiff(todayIso, deadline)}d</span>
            )}
          </span>
        ) : (
          <span className={soft}>TBD</span>
        )}
          </DRow>

          {/* ② the free week — restarts on a supplier-late stretch */}
          <DRow k="Free week">
        {freeBase && autoAnchor ? (
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <span className={chip}>{fmtDate(freeBase)}</span>
            <ArrowRight size={14} className="text-base-400 shrink-0" aria-hidden="true" />
            <span className={chip}>{fmtDate(autoAnchor)}</span>
            {supplierLate && latestGoodsEta && (
              <span className="pill pill-warning">
                supplier late · ETA {fmtDate(latestGoodsEta)}
              </span>
            )}
          </span>
        ) : (
          <span className={soft}>—</span>
        )}
          </DRow>

          {/* ③ counting from — auto, a manual date overrides */}
          <DRow k="Counts from">
        <span className="inline-flex items-center gap-1.5 flex-wrap justify-end">
          {exempt ? (
            <span className={soft}>exempted</span>
          ) : (
            <>
              {/* ONE date control (Jess: why two calendars?) — shows the
                  auto anchor; editing it IS the manual override. */}
              <input
                type="date"
                value={draft.storage_from || effectiveStart || autoAnchor || ""}
                onChange={(e) => set("storage_from", e.target.value)}
                aria-label="Storage start (edit = manual override)"
                className={chip}
              />
              {form.storageFrom && (
                <>
                  <span className={soft}>manual</span>
                  <button
                    type="button"
                    onClick={() => set("storage_from", "")}
                    title="Back to auto"
                    aria-label="Reset storage start to auto"
                    className="text-base-400 hover:text-base-700"
                  >
                    <X size={14} />
                  </button>
                </>
              )}
              {effectiveStart && !exempt && (
                <span className="pill pill-confirmed">counting</span>
              )}
            </>
          )}
        </span>
          </DRow>

          {/* ④ the money — the day-count lives in the header caption/name */}
          <DRow k="Fee">
        {collectedAt ? (
          <span className="pill pill-confirmed">
            collected · {fmtDate(String(collectedAt).slice(0, 10))}
          </span>
        ) : waived ? (
          <span className={soft}>written off by the manager</span>
        ) : exempt ? (
          <span className="inline-flex items-center gap-2">
            <span className={soft}>No storage</span>
            <button
              type="button"
              onClick={() => set("storage_fee_override", "")}
              className="text-meta text-base-500 hover:text-base-800 underline"
            >
              undo
            </button>
          </span>
        ) : counting ? (
          <span className="inline-flex items-center gap-1.5 flex-wrap justify-end">
            {hasMsbf && (
              <span className={chip}>
                MS/BF{" "}
                {impMsbf != null
                  ? impMsbf.toLocaleString()
                  : `${auto.msbfMonths} mth × 150`}
              </span>
            )}
            {hasSof && (
              <span className={chip}>
                Sofa{" "}
                {impSof != null
                  ? impSof.toLocaleString()
                  : auto.sofCharged
                    ? "flat 200"
                    : "free"}
              </span>
            )}
            {/* ONE money control (same law as the step-3 date): the box
                shows the auto/Master figure; editing IS the override. */}
            <span className="inline-flex items-center gap-1">
              <span className="font-mono font-semibold text-meta text-base-500">
                RM
              </span>
              <input
                type="number"
                min={0}
                value={
                  overrideSet
                    ? draft.storage_fee_override
                    : String(
                        hasImportedFee
                          ? (impMsbf ?? 0) + (impSof ?? 0)
                          : auto.total,
                      )
                }
                onChange={(e) => set("storage_fee_override", e.target.value)}
                aria-label="Storage fee (edit = manual override)"
                className={`${chip} w-24 text-right ${effTotal > 0 ? "text-danger" : ""}`}
              />
            </span>
            {overrideSet && (
              <>
                <span className={soft}>manual</span>
                <button
                  type="button"
                  onClick={() => set("storage_fee_override", "")}
                  title="Back to auto"
                  aria-label="Reset the fee to auto"
                  className="text-base-400 hover:text-base-700"
                >
                  <X size={14} />
                </button>
              </>
            )}
            {effTotal > 0 && <span className="pill pill-overdue">unpaid</span>}
            <button
              type="button"
              onClick={() => set("storage_fee_override", "0")}
              className="text-meta text-base-500 hover:text-base-800 underline"
            >
              No storage
            </button>
          </span>
        ) : (
          <span className={soft}>RM 0</span>
        )}
          </DRow>

          {/* ⑤ when it stops */}
          <DRow k="Ends">
        <span className="inline-flex items-center gap-1.5 flex-wrap justify-end">
          {delivered ? (
            <span className="pill pill-confirmed">
              delivered · {fmtDate(endEff)}
            </span>
          ) : (
            <>
              <input
                type="date"
                value={draft.storage_to}
                onChange={(e) => set("storage_to", e.target.value)}
                aria-label="Storage end (blank = follows delivery)"
                title="Blank = follows delivery"
                className={chip}
              />
              {!endSet && <span className={soft}>follows delivery</span>}
            </>
          )}
        </span>
          </DRow>
        </div>
      </div>
    </div>
  );
}

/** One charge row of the invoice list — label left, amount right (v4 §3:
 *  words Inter, amounts the ONE money recipe). */
function ChargeRow({
  num,
  label,
  sub,
  amount,
}: {
  /** Line number (1, 2, 3…) — the storage-fee line carries none. */
  num?: number;
  label: string;
  sub?: string;
  amount: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0 truncate text-body text-base-800">
        {num !== undefined && (
          <span className="text-base-400 tabular-nums">{num}. </span>
        )}
        {label}
        {sub && <span className="text-base-400"> {sub}</span>}
      </span>
      <span className="shrink-0 text-right">{amount}</span>
    </div>
  );
}

/**
 * MoneyCard v4 (Balance-tab inline spec, 2026-07-18) — TWO internal columns
 * filling the tab: LEFT = numbered CHARGES (order items auto + the storage
 * fee from the §7.5 rule + bold Total, keyed-total set INLINE) · RIGHT =
 * PAYMENTS (each with its uploaded proof + View) + the INLINE expandable
 * Record-payment form (no modal) + Balance due (15/700, red/green) + the
 * Invoice · Receipt · Remind action row. Money: hero15 due / row12 ledger,
 * always tabular. Invoice renders its PDF on click — never an always-on
 * preview.
 */
function MoneyCard({
  orderId,
  form,
  hasLineTotal,
  orderTotal,
  totalSet,
  collected,
  lines,
  storageCharge,
  storageIncurred,
  invoiceTotal,
  balanceDue,
  collectByPast,
  ledger,
  receiptMeta,
  collectByLabel,
  deliveryEve,
  onRemind,
  lastChasedAt,
  onShowItems,
  onGenerateInvoice,
}: {
  orderId: string;
  so: number;
  form: ReturnType<typeof useOrderControlForm>;
  hasLineTotal: boolean;
  /** Goods total — the line sum (native) or the keyed figure (AutoCount). */
  orderTotal: number;
  totalSet: boolean;
  /** Σ ALL payments (goods + deposit + storage) — the invoice nets one pot. */
  collected: number;
  /** Raw order lines — the CHARGES item rows (unit_price 0 on imports). */
  lines: operationOrderDetailLine[];
  /** The effective storage fee (override > Master import > auto §7.5 rule). */
  storageCharge: number;
  storageIncurred: boolean;
  /** Goods + storage. */
  invoiceTotal: number;
  /** invoiceTotal − collected, floored at 0. */
  balanceDue: number;
  collectByPast: boolean;
  ledger: OrderPaymentRow[];
  receiptMeta: { orderCode: string; customerName: string };
  /** "Collect by <date>" under Balance due while owing. */
  collectByLabel: string | null;
  /** Owing + delivery today/tomorrow → red flag + danger due +
   *  final-reminder Remind tone (page-rebuild §3.2). */
  deliveryEve: "today" | "tomorrow" | null;
  onRemind: () => void;
  /** Shared chase log — the same last_chased_at every chase button stamps. */
  lastChasedAt: string | null;
  /** Jump to the Items tab (the imported-order "N items" link). */
  onShowItems: () => void;
  /** Open the §10 Generate-invoice overlay (the ONE invoice path). */
  onGenerateInvoice: () => void;
}) {
  const role = useAuth((s) => s.role);
  const isPrincipal = role === "principal";
  // A keyed Total READS formatted; click to edit. Starts in edit mode only
  // while no total is set yet.
  const [editingTotal, setEditingTotal] = useState(false);
  // The INLINE Record-payment form (Balance-tab spec — no modal here; the
  // collapsed band's shortcut still wraps the same form in a Modal).
  const [addingInline, setAddingInline] = useState(false);
  const voidPay = useVoidPayment(orderId, {
    onError: (e) => toast.error(`Couldn't void — ${e.message}`),
  });

  // CHARGES — merge same-SKU lines; per-line amounts only exist on a
  // line-priced (native) order. "<model> · <size> ×<qty>".
  const merged: { sku: string; qty: number; amount: number }[] = [];
  for (const l of lines) {
    const e = merged.find((m) => m.sku === l.sku);
    const amt = Number(l.unit_price || 0) * Number(l.qty || 0);
    if (e) {
      e.qty += Number(l.qty || 0);
      e.amount += amt;
    } else {
      merged.push({ sku: l.sku, qty: Number(l.qty || 0), amount: amt });
    }
  }
  const sizeWord = (sku: string) => {
    const s = lineSize(sku);
    return s === "K" ? "King" : s === "Q" ? "Queen" : s === "S" ? "Single" : null;
  };

  // The keyed-total entry — the goods amount on an AutoCount order.
  const keyedTotalNode =
    editingTotal || orderTotal <= 0 ? (
      <input
        type="number"
        min={0}
        step="0.01"
        autoFocus={editingTotal}
        // Unset shows an EMPTY box — a resting "0" here reads as "total =
        // RM 0"; the raw draft only appears while actually editing.
        value={
          editingTotal
            ? form.draft.balance
            : Number(form.draft.balance || 0) > 0
              ? form.draft.balance
              : ""
        }
        onChange={(e) => form.set("balance", e.target.value)}
        onFocus={() => setEditingTotal(true)}
        onBlur={() => setEditingTotal(false)}
        placeholder={hasLineTotal ? "Set total (RM)" : "Still owes (RM)"}
        aria-label="Order total"
        className="w-32 text-right font-mono text-meta px-1.5 py-0.5 border border-base-200 rounded bg-white outline-none focus:border-base-700"
      />
    ) : (
      <button
        type="button"
        onClick={() => setEditingTotal(true)}
        title="Keyed total — click to edit"
        className="underline decoration-dotted decoration-base-300 underline-offset-2"
      >
        <Money value={orderTotal} tone="row" className="text-base-900" />
      </button>
    );

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-x-5 gap-y-2.5 items-start">
      {/* Grounded-card header (Loan template; Jess 2026-07-20) — icon + status
          caption + the outstanding headline, replacing the prose hint (no
          how-to sentences). Icon never tints; paid / no-total = grey. */}
      <div className="col-span-2 flex items-center justify-between gap-2 pb-2 border-b border-base-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`h-8 w-8 shrink-0 rounded-[9px] grid place-items-center ${
              balanceDue > 0 ? "bg-primary/10 text-primary" : "bg-base-100 text-base-500"
            }`}
          >
            <Wallet size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-label font-semibold tracking-[0.05em] uppercase text-base-500">
              {!totalSet ? "No total" : balanceDue > 0 ? "Owing" : "Paid"}
            </div>
            <div
              className={`text-body font-semibold truncate ${
                balanceDue > 0 ? "text-base-900" : "text-base-500"
              }`}
            >
              {!totalSet ? (
                collected > 0 ? (
                  <>
                    Collected{" "}
                    <span className="font-mono">{RM(collected)}</span> so far
                  </>
                ) : (
                  "Nothing on record"
                )
              ) : balanceDue > 0 ? (
                <>
                  Still owes{" "}
                  <span className="font-mono text-danger">{RM(balanceDue)}</span>
                </>
              ) : (
                "All collected"
              )}
            </div>
          </div>
        </div>
        {balanceDue > 0 && (
          <span
            className={`pill ${collectByPast ? "pill-overdue" : "pill-warning"} shrink-0`}
          >
            {collectByLabel ? `by ${collectByLabel}` : "before delivery"}
          </span>
        )}
      </div>
      {/* Delivery-eve red flag (§3.2) — spans both columns. */}
      {deliveryEve && (
        <div
          className="col-span-2 flex items-center gap-1.5 rounded-md bg-base-50 px-2 py-1.5 text-meta font-medium text-danger"
          data-testid="balance-delivery-eve"
        >
          <AlertCircle size={14} strokeWidth={2.5} className="shrink-0" />
          Delivery {deliveryEve}, still owing {RM(balanceDue)}
        </div>
      )}

      {/* ── LEFT · CHARGES ─────────────────────────────────────────── */}
      <div className="min-w-0">
        <div className="t4-label mb-1">Charges</div>
        <div className="rounded-[8px] border border-base-200/70 bg-white px-3 divide-y divide-base-100">
          {/* International rule (option A, 2026-07-18): an invoice line always
              carries money. Native orders list their priced item rows; an
              IMPORTED order (no per-line prices) collapses goods into ONE
              keyed line — the item detail lives in the Items tab + on the DO,
              never as amount-less invoice rows. */}
          {hasLineTotal ? (
            merged.map((m, i) => (
              <ChargeRow
                key={m.sku}
                num={i + 1}
                label={m.sku}
                sub={`${sizeWord(m.sku) ? `· ${sizeWord(m.sku)} ` : ""}×${m.qty}`}
                amount={
                  <Money value={m.amount} tone="row" className="text-base-900" />
                }
              />
            ))
          ) : (
            <div className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate text-body text-base-800">
                Customer still owes
                <button
                  type="button"
                  onClick={onShowItems}
                  title="See every item in the Items tab"
                  className="text-base-400 hover:text-info hover:underline"
                >
                  {" "}
                  · {merged.length} item{merged.length === 1 ? "" : "s"}
                </button>
              </span>
              <span className="shrink-0 text-right">{keyedTotalNode}</span>
            </div>
          )}
          {/* The storage FEE flows in as a charge (no number); the Storage tab
              owns the detail (STATUS-STANDARD §7.5 rule). */}
          <ChargeRow
            label="Storage fee"
            sub={storageIncurred ? undefined : "· not accruing"}
            amount={
              <Money
                value={storageCharge}
                tone="row"
                className={storageCharge > 0 ? "text-base-900" : "text-base-400"}
              />
            }
          />
          {/* Total = goods + storage — top-bordered, bold. */}
          <div className="flex items-center justify-between gap-3 py-2 border-t border-base-200">
            <span className="text-body font-semibold text-base-900">
              {hasLineTotal ? "Total" : "To collect"}
            </span>
            {totalSet ? (
              <Money value={invoiceTotal} tone="row" className="text-base-900" />
            ) : (
              <span className="text-meta text-base-400">
                {hasLineTotal
                  ? "set the goods total above"
                  : "key what's owed above"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT · PAYMENTS + DUE ─────────────────────────────────── */}
      <div className="min-w-0 space-y-2.5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="t4-label">Payments</span>
            {!addingInline && (
              <Btn size="sm" icon={Plus} onClick={() => setAddingInline(true)}>
                Record payment
              </Btn>
            )}
          </div>
          {/* INLINE expandable entry form (no modal — Balance-tab spec). */}
          {addingInline && (
            <div className="mb-2">
              <PaymentForm
                orderId={orderId}
                onDone={() => setAddingInline(false)}
                onCancel={() => setAddingInline(false)}
              />
            </div>
          )}
          {ledger.length === 0 ? (
            !addingInline && (
              <div className="text-meta text-base-400 py-1">
                No payments recorded yet.
              </div>
            )
          ) : (
            <div className="rounded-[8px] border border-base-200/70 bg-white px-3 divide-y divide-base-100">
              {ledger.map((p) => {
                // 0347 — a void is a STAMP (0343), so the row stays in the
                // history and must READ as reversed: struck through, no
                // receipt to print, and no second Void button (the RPC would
                // refuse it anyway — `already_voided`).
                const voided = !isLivePayment(p);
                return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2.5 py-2 ${voided ? "opacity-60" : ""}`}
                  data-testid={voided ? "payment-voided" : undefined}
                >
                  {/* Proof thumbnail — the uploaded slip when present. */}
                  <button
                    type="button"
                    onClick={() => void viewSlip(p)}
                    disabled={!p.receipt_url}
                    title={p.receipt_url ? "Open the uploaded slip" : "No slip uploaded"}
                    className={`w-9 h-9 rounded-md border grid place-items-center shrink-0 ${
                      p.receipt_url
                        ? "border-base-200 bg-base-50 text-base-600 hover:text-base-900"
                        : "border-dashed border-base-200 bg-base-50 text-base-300 cursor-default"
                    }`}
                  >
                    <Paperclip size={14} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-body font-semibold truncate ${
                        voided ? "text-base-500 line-through" : "text-base-900"
                      }`}
                    >
                      {p.note?.trim() ||
                        (p.kind === "deposit"
                          ? "Deposit"
                          : p.kind === "storage"
                            ? "Storage fee"
                            : "Payment")}{" "}
                      ·{" "}
                      <Money
                        value={Number(p.amount)}
                        tone="row"
                        className={voided ? "text-base-500" : "text-base-900"}
                      />
                    </div>
                    <div className="text-meta text-base-500 truncate">
                      {fmtDate(p.paid_on)} · {PAY_METHOD_LABEL[p.method] ?? p.method}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </div>
                  </div>
                  {voided && (
                    <span className="pill pill-neutral shrink-0" title={p.void_reason ?? undefined}>
                      Voided
                    </span>
                  )}
                  {p.receipt_url && (
                    <button
                      type="button"
                      onClick={() => void viewSlip(p)}
                      className="text-meta font-medium text-info hover:underline shrink-0"
                    >
                      View
                    </button>
                  )}
                  {!voided && (
                    <button
                      type="button"
                      onClick={() => void openReceipt(p, receiptMeta)}
                      title={`Receipt ${p.receipt_no ?? ""}`}
                      aria-label={`Receipt ${p.receipt_no ?? p.id}`}
                      className="text-base-500 hover:text-base-800 shrink-0"
                    >
                      <FileText size={14} />
                    </button>
                  )}
                  {isPrincipal && !voided && (
                    <button
                      type="button"
                      onClick={() => voidPay.mutate(p.id)}
                      disabled={voidPay.isPending}
                      title="Void this payment (reversible — payments are never deleted)"
                      aria-label={`Void payment ${p.receipt_no ?? p.id}`}
                      className="text-base-500 hover:text-danger shrink-0"
                    >
                      <Undo2 size={14} />
                    </button>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Balance due = Total − Collected · 2px top border · 15/700. */}
        <div className="border-t-2 border-base-300 pt-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-body font-semibold text-base-900">Balance due</span>
            {!totalSet ? (
              <span className="text-meta text-base-400">
                {hasLineTotal
                  ? "Set the goods total to calculate"
                  : "Key what's owed to calculate"}
              </span>
            ) : balanceDue > 0 ? (
              <Money value={balanceDue} tone="hero" className="text-danger" />
            ) : (
              <span className="text-body font-semibold leading-none text-success">
                Settled
              </span>
            )}
          </div>
          {totalSet && balanceDue > 0 && collectByLabel && (
            <div
              className={`mt-0.5 text-meta ${
                collectByPast ? "font-medium text-danger" : "text-base-500"
              }`}
            >
              Collect by {collectByLabel}
              {collectByPast ? " — passed" : ""}
            </div>
          )}
        </div>

        {/* Actions — Invoice (PDF on click, never an always-on preview) ·
            Receipt · Remind (WhatsApp green outline; final tone on
            delivery-eve, hot fill past collect-by). */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* ONE invoice path (fix #4): both this button and the panel ⋮ open
              the §10 overlay — the old direct-PDF route 422'd pre-dispatch. */}
          <Btn icon={FileText} onClick={onGenerateInvoice}>
            Invoice
          </Btn>
          <Btn
            icon={Download}
            /* 0347 — a voided payment has no receipt to open. */
            disabled={!ledger.some(isLivePayment)}
            title={
              ledger.some(isLivePayment) ? "Open the latest receipt PDF" : "No payment yet"
            }
            onClick={() => {
              const latest = ledger.find(isLivePayment);
              if (latest) void openReceipt(latest, receiptMeta);
            }}
          >
            Receipt
          </Btn>
          {totalSet && balanceDue > 0 && (
            <button
              type="button"
              onClick={onRemind}
              title={
                deliveryEve
                  ? "Copy the delivery-eve FINAL reminder (WhatsApp) + log the message"
                  : "Copy the gentle payment reminder (WhatsApp) + log the message"
              }
              className={`btn-chase ${collectByPast ? "btn-chase-hot" : ""}`}
            >
              <MessageCircle size={14} aria-hidden="true" />
              {deliveryEve ? "Final reminder" : "Remind"}
            </button>
          )}
        </div>
        {lastChasedAt && (
          <div className="text-meta text-base-400">
            Last message copied {fmtDate(lastChasedAt)}
          </div>
        )}
      </div>
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
      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-meta hover:bg-hovertint ${
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
                {/* CARD 4B (2026-08-11) — the `Issue PO` item is GONE, and it is
                    NOT replaced by another PO creation shortcut. It jumped to
                    /operation/procurement carrying a CreatePOModal prefill, and
                    that modal called the legacy ungoverned create RPCs.
                    `purchasing_issue_pos_batch(jsonb)` is the only authority
                    that may create a Purchase Order, and Batch Purchase is the
                    only door that calls it. */}
                {pipelineStatus === "ready" && (
                  <MenuItem
                    icon={<Truck className="w-4 h-4" />}
                    label="Assign logistics"
                    onClick={() => {
                      close();
                      onDispatchClick();
                    }}
                  />
                )}
                {pipelineStatus === "scheduled" && (
                  <MenuItem
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    // C3 reported this as C7's rename and read it as
                    // `Issue delivery order` under the verb dictionary. It is
                    // NOT: the door it opens attaches the CUSTOMER'S SIGNED DO
                    // and flips the order to delivered — its own primary button
                    // already says `Mark delivered`, which is the dictionary's
                    // BUTTON word for `Deliver today`. Issuing happens earlier
                    // and elsewhere (the Delivery card's own row). Renaming it
                    // to `Issue delivery order` would have put one word on two
                    // different acts, which is the error C6 finding #2 fixed
                    // one card ago.
                    label={orderActionButton("deliver_today") ?? "Mark delivered"}
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
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-meta hover:bg-hovertint text-base-900"
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

function PoRow({ po, divider }: { po: operationOrderDetailPo; divider: boolean }) {
  const totalQty = po.lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const got = po.lines.reduce((s, l) => s + Number(l.received_qty || 0), 0);
  /* v4 §6 — status = FILLED pill (soft tint + dark same-hue); the outline
     chip + the blue partial state are gone (blue = selection only; a
     part-received PO still reads amber = waiting). */
  const stColor =
    po.status === "received"
      ? "bg-[#EAF3DE] text-[#3B6D11]"
      : "bg-[#FAEEDA] text-[#854F0B]";
  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto] gap-3 px-3.5 py-3 items-center ${divider ? "border-t border-base-100" : ""}`}
    >
      <span className="font-mono text-meta font-semibold">{po.id.slice(0, 8)}</span>
      <div>
        {po.lines.map((l, j) => (
          <div key={j} className="text-meta leading-snug font-body">
            <span className="text-foreground">{l.sku}</span>{" "}
            <span className="font-mono text-base-500">
              {l.received_qty || 0}/{l.qty}
            </span>
          </div>
        ))}
        <div className="text-meta text-base-500 mt-0.5">
          ETA {po.eta_date ?? "—"} · Σ {got}/{totalQty}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span
          className={`text-meta font-semibold px-2 py-0.5 rounded-full ${stColor}`}
        >
          {po.status}
        </span>
        {po.status !== "received" && po.status !== "cancelled" && (
          /* Card C1 (Jess, 2026-08-03 — DATA INTEGRITY, not UX). This was the
             LAST door that moved `received_qty` without opening a Receiving
             Session: it opened `ReceivePOModal`, which called
             `operation_receive_po_with_do` straight — stock moved, and the
             delivery left no record at all. Its own tooltip promised
             "records the GRN", which was simply untrue.

             It hands over to the Receiving Workspace now, the same way the
             Purchase Orders tab does. One act, one door, one record. */
          <Link
            to={`/operation?tab=receiving&po=${encodeURIComponent(po.id)}`}
            className="inline-flex items-center gap-1.5 text-meta font-semibold px-2 py-1 rounded border border-base-200 hover:bg-base-50"
            title="Open this purchase order in Receiving"
            data-testid={`drawer-check-in-${po.id}`}
          >
            <PackagePlus size={14} />
            {purchasingActionButton("check_in")}
          </Link>
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
      className="w-full flex items-center gap-2 px-3 py-2 text-left text-meta hover:bg-hovertint disabled:opacity-40 text-base-900"
    >
      <span className="text-base-500 shrink-0">
        <FileText className="w-4 h-4" />
      </span>
      {pending ? "Opening…" : "Print DO"}
    </button>
  );
}
