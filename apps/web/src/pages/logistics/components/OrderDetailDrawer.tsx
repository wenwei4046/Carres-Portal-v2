import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { renderDoPdf } from "@/lib/pdf/render";
import type { DoTemplateData } from "@/lib/pdf/types";
import {
  useLogisticsOrder,
  useRecheckStockMutation,
  type LogisticsOrderDetailLine,
  type LogisticsOrderDetailPo,
  type LogisticsOrderDetailStockBalance,
} from "@/lib/queries";
import { cjkClassName } from "@/lib/cjk";
import { useAuth } from "@/lib/auth";
import DownloadSalesOrderButton from "@/components/DownloadSalesOrderButton";
import DownloadInvoiceButton from "@/components/DownloadInvoiceButton";
import StageChip, { type LogisticsStage } from "./StageChip";
import DispatchModal from "./DispatchModal";
import DOAttachModal from "./DOAttachModal";
import AbandonOrderModal from "./AbandonOrderModal";
import ConfirmProceedDialog from "./ConfirmProceedDialog";
import TransferReadyDialog from "./TransferReadyDialog";
import TopUpDepositModal from "@/pages/dealer/order-actions/TopUpDepositModal";
import { SectionHead } from "./Modal";

/**
 * OrderDetailDrawer — slide-in panel from the right edge that shows full
 * order detail + 4-stage action bar + line items + linked POs + history.
 *
 * Mirrors `reference/proto/logistics-orders.jsx` `OrderDetailDrawer`
 * (lines 261-396):
 *   - Backdrop: rgba(34,31,32,0.55)
 *   - Drawer: 560px wide, full-height, white, rounded-none on left edge
 *   - Header: #DL + StageChip + customer name (CJK detect) + dealer; right
 *     side has Print DO (when delivered) + close
 *   - Action bar: tinted base-50 surface, conditional buttons per stage
 *   - Section: Stock & warehouse (warehouse name + total items + line table)
 *   - Section: Linked purchase orders (only if linkedPOs.length > 0)
 *   - Section: Delivery (phone, date, address, floor, emergency, partner, DO#)
 *   - Section: History
 *   - Footer: Order total
 *
 * The drawer fetches its own detail via `useLogisticsOrder(orderId)` so the
 * caller only needs to hand us an id.
 */
const RM = (n: number) =>
  `RM ${Math.round(Number(n) || 0).toLocaleString()}`;

interface Props {
  orderId: string;
  onClose: () => void;
}

function totalItems(lines: LogisticsOrderDetailLine[]): number {
  return lines.reduce((s, l) => s + Number(l.qty || 0), 0);
}

function calcShortages(
  lines: LogisticsOrderDetailLine[],
  stockBalances: LogisticsOrderDetailStockBalance[],
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
  const { data, isLoading, isError, error, refetch } = useLogisticsOrder(orderId);
  const navigate = useNavigate();

  const [showDispatch, setShowDispatch] = useState(false);
  const [showDO, setShowDO] = useState(false);
  const [showAbandon, setShowAbandon] = useState(false);
  const [showConfirmProceed, setShowConfirmProceed] = useState(false);
  const [showTransferReady, setShowTransferReady] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);

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
      showTopUp;
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
  ]);

  // 2026-05-10 (Loo) — "+ Issue POs" jumps to /logistics/procurement with a
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
    navigate(`/logistics/procurement/${slug}`, {
      state: {
        prefill: {
          dl: data.order.dl,
          lines: prefillLines,
          note: `From order #${data.order.dl} · ${prefillLines.length} short line${prefillLines.length === 1 ? "" : "s"}`,
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
        className="bg-card text-card-foreground border border-base-200 rounded-none overflow-auto h-screen"
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
                  dl: data.order.dl,
                  dealerId: data.order.dealer_id,
                  paid: data.order.paid,
                }}
                total={data.total}
                onClose={() => setShowTopUp(false)}
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
  data: NonNullable<ReturnType<typeof useLogisticsOrder>["data"]>;
  onClose: () => void;
  onDispatchClick: () => void;
  onDOClick: () => void;
  onIssuePOsClick: () => void;
  onAbandonClick: () => void;
  onConfirmProceedClick: () => void;
  onTransferReadyClick: () => void;
  onTopUpClick: () => void;
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
}: DrawerBodyProps) {
  const { order, lines, addons, total, warehouse, stockBalances, pos, history, threads } = data;
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
  // bogus awaiting_logistics_action default.
  const stage: LogisticsStage = (() => {
    if (order.status === "place") return "placed";
    if (order.logistics_stage) return order.logistics_stage as LogisticsStage;
    if (order.status === "delivered") return "delivered";
    return "awaiting_logistics_action";
  })();
  const shortages = calcShortages(lines, stockBalances);
  const dealerName = order.dealers?.name ?? "—";

  return (
    <>
      {/* Header */}
      <div className="px-7 pt-5 pb-3.5 border-b border-base-100 flex justify-between items-start gap-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex gap-2.5 items-center">
            <span className="font-mono text-[12px] text-base-500">
              #{order.dl}
            </span>
            <StageChip stage={stage} />
          </div>
          <div
            className={`${cjkClassName(order.customer_name)} text-[22px] font-semibold mt-1 tracking-[-0.02em] text-base-900`}
          >
            {order.customer_name}
          </div>
          <div className="text-[12px] text-base-600 mt-0.5">{dealerName}</div>
        </div>
        <div className="flex items-center gap-2">
          {/* 2026-05-13 (Loo) — stage gates the customer-doc affordances:
           *    pre-dispatch  → Sales Order (the original quote/contract)
           *    dispatched+   → Sales Invoice + Carres DO (the order has
           *                    "become" the invoice; SO is no longer the
           *                    live doc the customer is handed). 0098's
           *                    BEFORE-UPDATE trigger seeds order.invoice_no
           *                    and order.do_number at the same moment so
           *                    both buttons surface together. */}
          {role && stage !== "dispatched" && stage !== "delivered" && (
            <DownloadSalesOrderButton
              orderId={order.id}
              dl={order.dl}
              role={role}
              variant="secondary"
            />
          )}
          {role && (stage === "dispatched" || stage === "delivered") && order.invoice_no && (
            <DownloadInvoiceButton
              orderId={order.id}
              dl={order.dl}
              role={role}
              variant="secondary"
            />
          )}
          {order.do_number && (
            <PrintDoButton orderId={order.id} doNumber={order.do_number} />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="p-1 text-[20px] text-base-700 hover:text-base-900 leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Action bar — depends on stage */}
      <div className="px-7 py-4 bg-base-50 border-b border-base-100">
        <ActionBar
          stage={stage}
          orderId={order.id}
          dl={order.dl}
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
      </div>

      <div className="p-7">
        {/* Stock & warehouse */}
        <SectionHead>Stock &amp; warehouse</SectionHead>
        <div className="bg-white border border-base-200 rounded-[4px] p-3.5 mb-4 grid grid-cols-2 gap-3">
          <KV label="Source warehouse" value={warehouse?.name ?? <em className="text-base-500">—</em>} />
          <KV label="Total items" value={String(totalItems(lines))} />
          <div className="col-span-2">
            <div className="label mb-2">Lines</div>
            {lines.map((l, i) => {
              const bal = stockBalances.find((b) => b.sku === l.sku);
              const have = bal ? Math.max(0, Number(bal.qty) - Number(bal.reserved)) : 0;
              const ok = have >= l.qty;
              // Once the order is Delivered the on-hand check stops being
              // meaningful (goods are gone from this warehouse already), so
              // collapse the line row to just SKU × qty.
              const showStock = stage !== "delivered";
              return (
                <div
                  key={l.sku}
                  className={`grid ${showStock ? "grid-cols-[1fr_auto_auto]" : "grid-cols-[1fr]"} gap-3 py-2 items-center ${i ? "border-t border-dashed border-base-100" : ""}`}
                >
                  <div className="text-[12px] font-body">
                    <span className="font-mono">{l.sku}</span> ×{l.qty}
                  </div>
                  {showStock && (
                    <>
                      <div className={`font-mono text-[11px] ${ok ? "text-success" : "text-warning"}`}>
                        {have} on hand
                      </div>
                      <div
                        className={`w-[14px] h-[14px] rounded-full ${ok ? "bg-success" : "bg-warning"}`}
                        aria-label={ok ? "in stock" : "shortage"}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Linked POs */}
        {pos.length > 0 && (
          <>
            <SectionHead>Linked purchase orders</SectionHead>
            <div className="bg-white border border-base-200 rounded-[4px] mb-4">
              {pos.map((po, i) => (
                <PoRow key={po.id} po={po} divider={i > 0} />
              ))}
            </div>
          </>
        )}

        {/* Customer & delivery */}
        <SectionHead>Delivery</SectionHead>
        <div className="bg-white border border-base-200 rounded-[4px] p-3.5 mb-4 grid grid-cols-2 gap-3">
          <KV label="Phone" value={order.customer_phone ?? "—"} />
          <KV
            label="Date"
            value={
              order.delivery_date_tbd ? (
                <em className="text-warning">TBD</em>
              ) : (
                order.delivery_date ?? "—"
              )
            }
          />
          <div className="col-span-2">
            <KV
              label="Address"
              value={
                order.customer_address ?? (
                  <em className="text-warning">Pending</em>
                )
              }
            />
          </div>
          {order.do_number && <KV label="DO number" value={order.do_number} />}
        </div>

        {/* History */}
        <SectionHead>History</SectionHead>
        <div className="bg-white border border-base-200 rounded-[4px] px-4 py-3">
          {history.length === 0 ? (
            <div className="text-[12px] text-base-500">No history yet.</div>
          ) : (
            history.map((h, i) => (
              <div
                key={i}
                className={`grid grid-cols-[auto_1fr] gap-3 py-1.5 ${i ? "border-t border-dashed border-base-100" : ""}`}
              >
                <span className="font-mono text-[10px] text-base-500 whitespace-nowrap">
                  {h.occurred_at?.slice(0, 16)?.replace("T", " ")}
                </span>
                <span className="text-[12px] font-body">
                  {h.text}{" "}
                  <span className="text-base-500">· {h.by_role ?? "system"}</span>
                </span>
              </div>
            ))
          )}
        </div>

        {/* Total */}
        <div className="flex justify-between mt-4 py-3.5 border-t border-base-200">
          <span className="text-[13px] text-base-600">Order total</span>
          <span className="font-mono text-[18px] font-semibold text-base-900">
            {RM(total + addonsSum(addons))}
          </span>
        </div>
      </div>
    </>
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

function KV({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div className="text-[13px] text-base-900 font-body">{value}</div>
    </div>
  );
}

interface ActionBarProps {
  stage: LogisticsStage;
  orderId: string;
  dl: number;
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
          Order placed by dealer. Waiting for them to push it to logistics — no
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
  if (stage === "awaiting_logistics_action") {
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

function PoRow({ po, divider }: { po: LogisticsOrderDetailPo; divider: boolean }) {
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
        `/api/logistics/orders/${orderId}/print-do-data`,
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
