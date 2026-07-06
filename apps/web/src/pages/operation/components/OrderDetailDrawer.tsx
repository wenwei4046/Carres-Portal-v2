import { type ReactNode, type MouseEvent, useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Flag,
  MoreVertical,
  Pencil,
  Phone,
  RotateCcw,
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
  stockMatchKey,
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
  grow,
  className,
  children,
}: {
  title: string;
  /** Pinned to the header's right edge — the at-a-glance status badge. */
  summary?: ReactNode;
  grow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`border border-base-200 rounded-[12px] bg-white overflow-hidden flex flex-col min-h-0 ${grow ? "flex-1" : ""} ${className ?? ""}`}
    >
      <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-base-100 shrink-0">
        <span className="t-h4 text-base-900 truncate">{title}</span>
        {summary != null && (
          <span className="shrink-0 flex items-center gap-1.5">{summary}</span>
        )}
      </header>
      {children}
    </section>
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

/** The collect-before-delivery gate badge (Jess 2026-07-02): amber "Collect
 *  before delivery" (warning, ETA still >1 day off) → red "Hold delivery" (block,
 *  from ETA−1 if uncollected). Renders on the Bill + Storage panel headers. */
function GateBadge({ gate }: { gate: "hold" | "warn" | null }) {
  if (gate === "hold")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#991B1B] whitespace-nowrap">
        <AlertCircle size={10} strokeWidth={2.5} /> Hold delivery
      </span>
    );
  if (gate === "warn")
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] whitespace-nowrap">
        Collect before delivery
      </span>
    );
  return null;
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
  // Header summary = the OWING amount (Jess: operation tracks outstanding, not a
  // bill). Prefer the operator/import-keyed control balance; else the derived
  // outstanding; never show "RM 0 paid" (that read as settled when it wasn't).
  const controlOwing = form.draft.balance.trim() ? Number(form.draft.balance) : 0;
  const paymentSummary =
    controlOwing > 0
      ? `${RM(controlOwing)} owing`
      : hasTotal
        ? outstanding <= 0
          ? "Settled"
          : `${RM(outstanding)} owing`
        : "No balance";

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
  const readinessOf = (sku: string, qty: number): "ready" | "waiting" | "nopo" =>
    form.draft.line_stock_status[sku] ?? derivedReadiness(sku, qty);
  const readyN = goodsLines.filter((l) => readinessOf(l.sku, l.qty) === "ready").length;
  const waitingN = goodsLines.filter((l) => readinessOf(l.sku, l.qty) === "waiting").length;
  const nopoN = goodsLines.filter((l) => readinessOf(l.sku, l.qty) === "nopo").length;

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
  const balanceOwing = hasTotal && outstanding > 0;
  // Storage is "incurred" when the operator set a From date, OR the Master import
  // carried a fee (migration 0200, Jess: a Master fee auto-marks incurred → it
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
  // "hold" = red block (ETA−1 uncollected) · "warn" = amber reminder · null = ok.
  const balanceGate = balanceOwing ? (pastLastCall ? "hold" : "warn") : null;
  const storageGate = storageOwing ? (pastLastCall ? "hold" : "warn") : null;
  const holdCount = (balanceGate === "hold" ? 1 : 0) + (storageGate === "hold" ? 1 : 0);

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
        className="flex-1 min-h-0 overflow-hidden px-5 py-3 grid gap-2.5 items-stretch"
        style={{
          // Locked one-screen layout (Jess 2026-07-01): LEFT (~1.05fr) = two
          // listing panels (Items ordered · Warehouse stock); RIGHT (~0.95fr) =
          // stacked cards (Customer|Balance · Delivery). align-items:stretch →
          // both columns EQUAL height, bottoms line up (no 高高低低).
          gridTemplateColumns: "1.05fr 0.95fr",
          gridTemplateRows: "auto auto auto minmax(0,1fr)",
          gridTemplateAreas:
            '"banner banner" "header header" "actions actions" "main side"',
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
          {/* Status · boxed order # · grey Ref — NO customer name (it lives in
              the Customer card; Jess: don't repeat it here). */}
          <div className="flex items-center gap-2.5 min-w-0">
            <StageChip stage={stage} />
            <span className="font-mono font-semibold text-base-900 border border-base-300 rounded-md px-2 py-0.5 bg-white shrink-0">
              #{order.so}
            </span>
            {order.source_ref?.[0] && (
              <span className="t-small text-base-400 font-mono shrink-0 uppercase">
                Ref {order.source_ref[0]}
              </span>
            )}
            {holdCount > 0 && (
              <span
                title="Delivery is blocked — clear the reasons in the Bill / Storage panels below"
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#FEE2E2] text-[#991B1B] shrink-0"
              >
                <AlertCircle size={12} strokeWidth={2.5} /> HOLD DELIVERY ({holdCount})
              </span>
            )}
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

        {/* Action strip — the stage actions live at the TOP now (Jess 2026-07-02:
            "bottom shouldn't be there, put top"), right under the header where the
            operator lands, not buried at the drawer bottom. */}
        <div
          style={{ gridArea: "actions" }}
          className="flex items-center justify-between gap-3 rounded-[8px] bg-base-50 border border-base-100 px-3 py-2 min-w-0"
        >
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

        {/* LEFT column — the two locked listing panels: Items ordered (fixed
            scroll table, ≤8 rows) on top · Warehouse stock (the reserve grid,
            grows to fill so the column bottom lines up with the right side). */}
        <div
          style={{ gridArea: "main" }}
          className="flex flex-col gap-2.5 min-w-0 min-h-0"
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
          >
            <div className="overflow-auto min-h-0" style={{ maxHeight: 268 }}>
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-base-700 text-white">
                    <th
                      className="text-left text-[10px] uppercase tracking-[0.04em] font-semibold px-2 py-1.5 w-24 border-r border-base-600"
                      title="Has this item's stock been received? Received / Pending (waiting on PO) / No PO"
                    >
                      Stock
                    </th>
                    <th className="text-left text-[10px] uppercase tracking-[0.04em] font-semibold px-2 py-1.5 w-28 border-r border-base-600">
                      Stock ETA
                    </th>
                    <th className="text-right text-[10px] uppercase tracking-[0.04em] font-semibold px-2 py-1.5 w-10 border-r border-base-600">
                      Qty
                    </th>
                    <th className="text-left text-[10px] uppercase tracking-[0.04em] font-semibold px-2 py-1.5 border-r border-base-600">
                      Model
                    </th>
                    <th className="text-left text-[10px] uppercase tracking-[0.04em] font-semibold px-2 py-1.5 w-24 border-r border-base-600">
                      PO
                    </th>
                    <th className="text-left text-[10px] uppercase tracking-[0.04em] font-semibold px-2 py-1.5 w-32">
                      Location
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orderedLines.map((l) => {
                    const isService = lineKind(l.sku) === "service";
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
                        : (defaultLineLocation(l.sku) ?? "");
                    // Per-item Stock ETA (migration 0170) — when the item's stock
                    // arrives; defaults to the linked PO's date, overridable.
                    const etaValue =
                      form.draft.line_etas[l.sku] ?? poEtaBySku.get(l.sku) ?? "";
                    // One row per SKU (duplicate lines combined above) → key on SKU.
                    return (
                      <tr
                        key={l.sku}
                        onClick={() => setPickerSku(l.sku)}
                        className={`cursor-pointer ${l.sku === activeLineSku ? "bg-primary/10" : "hover:bg-base-50"}`}
                      >
                        <td className="border border-base-200 px-1.5 py-1 align-top">
                          {isService || !rd ? (
                            <span className="text-base-300 text-[11px]">—</span>
                          ) : (
                            <StockStatusCell
                              sku={l.sku}
                              status={rd}
                              isOverride={isStatusOverride}
                              onSet={(s) => form.setLineStockStatus(l.sku, s)}
                              onPick={() => setPickerSku(l.sku)}
                            />
                          )}
                        </td>
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
                        <td className="border border-base-200 px-2 py-1 text-right text-[12px] tabular-nums align-top">
                          {l.qty}
                        </td>
                        <td className="border border-base-200 px-2 py-1 align-top">
                          <div
                            className="font-mono text-[10px] leading-tight break-words"
                            title={l.sku}
                          >
                            {l.sku}
                          </div>
                        </td>
                        <td className="border border-base-200 px-2 py-1 font-mono text-[10px] align-middle">
                          {poNo ? (
                            <span className="text-primary">{poNo}</span>
                          ) : (
                            <span className="text-base-300">—</span>
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
                      </tr>
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
              />
            </div>
          ) : (
            <Panel title="Warehouse stock" grow summary={<MiniBadge tone="muted">—</MiniBadge>}>
              <div className="flex-1 grid place-items-center t-tiny text-base-400 p-6">
                {stage === "delivered"
                  ? "Delivered — stock settled."
                  : "Pick an item above to see its warehouse stock."}
              </div>
            </Panel>
          )}
        </div>

        {/* RIGHT column — the two locked cards: a combined Customer | Balance
            split card (+ conditional Storage strip), then a Delivery card that
            grows to fill so both columns' bottoms line up. */}
        <div
          style={{ gridArea: "side" }}
          className="flex flex-col gap-2.5 min-w-0 min-h-0 overflow-auto"
        >
          {/* 1. Customer — a quiet identity card (name / phone / address, with an
              inline Edit on a Place order). Header summary = the area. */}
          <Panel
            title="Customer"
            summary={
              loc.label ? (
                <span
                  title={loc.label}
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-base-100 text-base-500 max-w-[140px] truncate"
                >
                  {loc.label}
                </span>
              ) : undefined
            }
          >
            <div className="p-3">
              <OrderCustomerCard order={order} />
            </div>
          </Panel>

          {/* 2. Balance — its OWN card (Jess: split from Storage). Header summary =
              the gate (Collect before delivery / Hold delivery) or the owing amount.
              Collect-by (ETA−7d) / last-call (ETA−1d) readout escalates with the
              gate colour. Operation shows only the OUTSTANDING owed (no Bill/Total). */}
          <Panel
            title="Balance"
            summary={
              balanceGate ? (
                <GateBadge gate={balanceGate} />
              ) : (
                <MiniBadge tone="muted">{paymentSummary}</MiniBadge>
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
              <PaymentControlFields
                form={form}
                paid={Number(order.paid || 0)}
                total={grandTotal}
                orderId={order.id}
                receiptMeta={{
                  orderCode: `SO-${order.so}`,
                  customerName: order.customer_name ?? "",
                }}
              />
            </div>
          </Panel>

          {/* 3. Storage — its OWN card (Jess: split from Balance). Header summary =
              the storage gate or "fee if held". StorageControlFields lays the two
              category fees (MS/BF · Sofa) 2-col; fee auto-computes today (Master
              import is P2). Only shows when a storable category is on the order. */}
          {(hasMsbf || hasSof) && (
            <Panel
              title="Storage"
              summary={
                storageGate ? (
                  <GateBadge gate={storageGate} />
                ) : (
                  <MiniBadge tone="muted">fee if held</MiniBadge>
                )
              }
            >
              <div className="p-3">
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

          {/* Card B — Delivery. Header badge = region. Body split Original |
              Logistic update; then the 3 remark rows; then a Route section only
              for a cross-border / multi-leg order. Grows to fill the column. */}
          <Panel
            title="Delivery"
            grow
            summary={
              loc.area === "KV" ? (
                <MiniBadge tone="kv">Klang Valley</MiniBadge>
              ) : loc.area === "Outstation" ? (
                <MiniBadge tone="outstation">Outstation</MiniBadge>
              ) : (
                <MiniBadge tone="muted">Area —</MiniBadge>
              )
            }
          >
            <div className="p-3 min-h-0 overflow-auto space-y-2 flex-1">
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
              {/* 3 remark rows (span full width). */}
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
                  <RemarkControlField
                    form={form}
                    field="carres_remark"
                    label="Carrier's remark"
                    placeholder="Internal note"
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
        </div>{/* /right column */}

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
        {shortageCount > 0 ? (
          <div className="text-[12px] text-warning mb-2 font-body">
            Waiting on stock for {shortageCount} line{shortageCount === 1 ? "" : "s"}.
            When the supplier DO arrives, mark the PO as received in <strong>Procurement</strong>{" "}
            — or transfer manually if stock is already on-hand.
          </div>
        ) : (
          <div className="text-[12px] text-base-700 mb-2 font-body">
            Proceeded — stock is on-hand. Transfer to ready, then dispatch.
          </div>
        )}
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
