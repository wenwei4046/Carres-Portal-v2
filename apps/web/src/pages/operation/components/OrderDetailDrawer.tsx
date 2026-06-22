import { type ReactNode, useEffect, useState } from "react";
import {
  Banknote,
  ChevronDown,
  ClipboardList,
  Package,
  StickyNote,
  Truck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { renderDoPdf } from "@/lib/pdf/render";
import type { DoTemplateData } from "@/lib/pdf/types";
import {
  useOperationOrder,
  useRecheckStockMutation,
  type operationOrderDetailLine,
  type operationOrderDetailPo,
  type operationOrderDetailStockBalance,
} from "@/lib/queries";
import { cjkClassName } from "@/lib/cjk";
import { fmtDate } from "@/lib/fmt-date";
import { locationForAddress } from "@/lib/region";
import { useAuth } from "@/lib/auth";
import AnnotationTimeline from "./AnnotationTimeline";
import DeliveryChain from "./DeliveryChain";
import {
  useOrderControlForm,
  RoutingFields,
  StockControlFields,
  DeliveryTimeSlotField,
  PaymentControlFields,
  RemarkControlFields,
  OrderControlSaveBar,
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
        style={{ width: 560, maxWidth: "100vw" }}
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
function DrawerSection({
  icon,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-base-200 rounded-[4px] bg-white mb-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-base-50"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-base-400 shrink-0">{icon}</span>
          <span className="t-h4 text-base-900">{title}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {!open && summary != null && (
            <span className="text-[11px] text-base-500 truncate max-w-[180px]">
              {summary}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-base-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
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
  // Loo 2026-05-12 — surface the SO PDF reprint button in the header. Hook
  // lives in DrawerBody (not the parent OrderDetailDrawer) because the
  // button JSX renders here; pulling `role` from the parent scope would
  // ReferenceError at runtime.
  const role = useAuth((s) => s.role);
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
  // new placed/proceed_request enum values without falling through to a
  // bogus awaiting_operation_action default.
  const stage: OperationStage = (() => {
    if (order.status === "place") return "placed";
    if (order.operation_stage) return order.operation_stage as OperationStage;
    if (order.status === "delivered") return "delivered";
    return "awaiting_operation_action";
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
      {/* Header — SO + stage + name + an outstanding glance + close, plus the
          stage-gated doc reprints. Fixed; the section stack scrolls below. */}
      <div className="px-5 pt-4 pb-3 border-b border-base-100 shrink-0">
        <div className="flex justify-between items-center gap-3">
          <div className="flex gap-2.5 items-center min-w-0">
            <span className="font-mono text-[12px] text-base-500">#{order.so}</span>
            <StageChip stage={stage} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="p-1 text-[20px] text-base-700 hover:text-base-900 leading-none shrink-0"
          >
            ×
          </button>
        </div>

        <div className="flex items-start justify-between gap-3 mt-1.5">
          <div
            className={`${cjkClassName(order.customer_name)} text-[20px] font-semibold tracking-[-0.02em] text-base-900 min-w-0 truncate`}
          >
            {order.customer_name}
          </div>
          <BalancePill outstanding={outstanding} hasTotal={hasTotal} />
        </div>

        <div className="flex items-center gap-2 mt-2.5 empty:hidden">
          {role && stage !== "dispatched" && stage !== "delivered" && (
            <DownloadSalesOrderButton
              orderId={order.id}
              so={order.so}
              role={role}
              variant="secondary"
            />
          )}
          {role && (stage === "dispatched" || stage === "delivered") && order.invoice_no && (
            <DownloadInvoiceButton
              orderId={order.id}
              so={order.so}
              role={role}
              variant="secondary"
            />
          )}
          {order.do_number && (
            <PrintDoButton orderId={order.id} doNumber={order.do_number} />
          )}
        </div>
      </div>

      {/* Scrolling section stack — 5 sections, one category each (P5). */}
      <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
        {/* 1 · Order — identity + location + status */}
        <DrawerSection
          icon={<ClipboardList className="w-4 h-4" />}
          title="Order"
          summary={loc.label || order.customer_phone || "—"}
          defaultOpen
        >
          <KV
            label="Phone"
            value={order.customer_phone ?? <em className="text-base-500">—</em>}
          />
          <KV
            label="Location"
            value={
              loc.label ? (
                <span
                  className={loc.area === "Outstation" ? "text-warning font-medium" : ""}
                >
                  {loc.label}
                  {loc.area === "Outstation" ? " · call first" : ""}
                </span>
              ) : (
                <em className="text-base-500">—</em>
              )
            }
          />
          <KV
            label="Address"
            value={order.customer_address ?? <em className="text-base-500">—</em>}
          />
          <KV label="Status" value={order.status} />
        </DrawerSection>

        {/* 2 · Items & stock — every stock fact in one place */}
        <DrawerSection
          icon={<Package className="w-4 h-4" />}
          title="Items & stock"
          summary={`${totalItems(lines)} item${totalItems(lines) === 1 ? "" : "s"}${shortages.length ? ` · ${shortages.length} short` : ""}`}
          defaultOpen
        >
          <KV
            label="Source WH"
            value={warehouse?.name ?? <em className="text-base-500">—</em>}
          />
          {/* Line items as a compact sheet: Item · Qty · On hand. On-hand is
              dropped once Delivered (goods already left this warehouse). */}
          <table className="w-full text-[12px] mt-2">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.04em] text-base-500 border-b border-base-200">
                <th className="text-left font-medium py-1">Item</th>
                <th className="text-right font-medium py-1 w-10">Qty</th>
                {stage !== "delivered" && (
                  <th className="text-right font-medium py-1 w-20">On hand</th>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const bal = stockBalances.find((b) => b.sku === l.sku);
                const have = bal
                  ? Math.max(0, Number(bal.qty) - Number(bal.reserved))
                  : 0;
                const ok = have >= l.qty;
                return (
                  <tr
                    key={l.sku}
                    className="border-b border-base-100 last:border-0 align-top"
                  >
                    <td className="py-1 pr-2 font-mono break-all">{l.sku}</td>
                    <td className="py-1 text-right tabular-nums">{l.qty}</td>
                    {stage !== "delivered" && (
                      <td
                        className={`py-1 text-right font-mono ${ok ? "text-success" : "text-warning"}`}
                      >
                        {have}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3">
            <StockControlFields form={form} />
          </div>
          {pos.length > 0 && (
            <div className="mt-3">
              <div className="label mb-1">Linked purchase orders</div>
              <div className="border border-base-100 rounded-[4px]">
                {pos.map((po, i) => (
                  <PoRow key={po.id} po={po} divider={i > 0} />
                ))}
              </div>
            </div>
          )}
        </DrawerSection>

        {/* 3 · Delivery — carrier + date + slot + the nested multi-leg route */}
        <DrawerSection
          icon={<Truck className="w-4 h-4" />}
          title="Delivery"
          summary={deadlineSummary}
          defaultOpen
        >
          <RoutingFields
            orderId={order.id}
            customerAddress={order.customer_address ?? null}
            status={order.status}
            deliveryDate={order.delivery_date}
            deliveryDateTbd={order.delivery_date_tbd}
            opsAssignedLogistic={order.ops_assigned_logistic ?? null}
            deliveryPartnerId={order.delivery_partner_id}
          />
          <div className="mt-3">
            <DeliveryTimeSlotField form={form} />
          </div>
          {/* Multi-leg chain (γ · migration 0156) — nested under Delivery where
              it belongs; collapsed unless the order actually has legs set. */}
          <details className="mt-3.5" open={(order.delivery_stops?.length ?? 0) > 0}>
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
          summary={paymentSummary}
        >
          <PaymentControlFields
            form={form}
            paid={Number(order.paid || 0)}
            total={grandTotal}
          />
        </DrawerSection>

        {/* 5 · Notes & actions — remarks + case shortcuts + activity (collapsed) */}
        <DrawerSection
          icon={<StickyNote className="w-4 h-4" />}
          title="Notes & actions"
          summary={
            form.remarkCount
              ? `${form.remarkCount} remark${form.remarkCount === 1 ? "" : "s"}`
              : "—"
          }
        >
          <RemarkControlFields form={form} />
          <div className="flex flex-wrap gap-2 mt-3.5">
            <button
              type="button"
              onClick={onServiceNoteClick}
              className="btn-secondary text-[12px]"
            >
              + Service Note
            </button>
            <button
              type="button"
              disabled
              title="Refunds are created in Finance → Refunds"
              className="btn-secondary text-[12px] opacity-50 cursor-not-allowed"
            >
              + Refund
            </button>
            <button
              type="button"
              disabled
              title="Issues module coming — needs the ops_issues table"
              className="btn-secondary text-[12px] opacity-50 cursor-not-allowed"
            >
              + Issue
            </button>
          </div>
          <div className="label mt-4 mb-1.5">Activity</div>
          <div className="max-h-[280px] overflow-auto pr-1 -mr-1">
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

/** Outstanding-balance pill for the drawer header — terracotta while the
 *  customer still owes, green "Settled" once covered. Hidden when the order has
 *  no computable total (AutoCount no-price imports) so it never shows a fake 0. */
function BalancePill({
  outstanding,
  hasTotal,
}: {
  outstanding: number;
  hasTotal: boolean;
}) {
  if (!hasTotal) return null;
  if (outstanding <= 0)
    return (
      <span className="shrink-0 whitespace-nowrap text-[12px] font-medium text-success bg-success/10 px-2.5 py-1 rounded-full">
        Settled
      </span>
    );
  return (
    <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
      Outstanding {RM(outstanding)}
    </span>
  );
}

function KV({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3 py-1 border-b border-base-100 last:border-0">
      <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.04em] text-base-500">
        {label}
      </span>
      <span className="flex-1 min-w-0 text-[12px] text-base-900 font-body">
        {value}
      </span>
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
  if (stage === "proceed_request") {
    return (
      <div>
        <div className="text-[12px] text-base-700 mb-2 font-body">
          Dealer pushed this order. Confirm to triage — system will reserve
          stock or queue a PO based on availability.
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            className="btn-primary text-[12px]"
            onClick={onConfirmProceedClick}
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
  if (stage === "awaiting_operation_action") {
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
      className="btn-secondary text-[11px] py-1.5 px-3 disabled:opacity-50"
    >
      {pending ? "Opening…" : "Print DO"}
    </button>
  );
}
