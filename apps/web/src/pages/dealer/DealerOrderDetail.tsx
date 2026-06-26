import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  PROCEED_BLOCKER_LABEL,
  isProceedBlockerCode,
  type FloorConfigDto,
  type Order,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { proceedBlockers } from "@/lib/order-blockers";
import { useCatalog, useOrder, useProceedOrder } from "@/lib/queries";
import { orderTotal, lineSubtotal, addonSubtotal, floorSurcharge } from "@/lib/order-totals";
import { groupSofaBuildLines } from "@/lib/sofa-build-display";
import { SpecialsSummary } from "./new-order/special-addons-picker";
import DownloadSalesOrderButton from "@/components/DownloadSalesOrderButton";
import AddAddressModal from "./order-actions/AddAddressModal";
import CancelOrderDialog from "./order-actions/CancelOrderDialog";
import ConfirmDateModal from "./order-actions/ConfirmDateModal";
import EditOrderModal from "./order-actions/EditOrderModal";
import TopUpDepositModal from "./order-actions/TopUpDepositModal";

/** 0184 — friendly labels for the delivery TRIP fee addons the Hono recompute
 *  appends (keys seeded by migration 0184). Unknown keys fall back to the raw
 *  addon key (disposal addons etc. render as before). */
const DELIVERY_ADDON_LABELS: Record<string, string> = {
  DELIVERY: "Delivery fee",
  DELIVERY_CROSS: "Cross-category delivery",
  DELIVERY_ADD: "Additional delivery fee",
};

/** 0185 — a free order_line carries either an appended default-gift marker
 *  (`attrs.free_gift`) or a freed existing line marker (`attrs.free_item`).
 *  Returns a short tag to render alongside the line + "FREE" instead of RM0. */
function freeLineTag(attrs: Record<string, unknown> | null): string | null {
  if (!attrs) return null;
  if (attrs.free_gift) return "Free gift";
  if (attrs.free_item) return "Free item";
  return null;
}

export default function DealerOrderDetail({
  id,
  onClose,
  readOnly = false,
}: {
  id: string;
  onClose: () => void;
  /** Trace-only view (principal): hide the dealer Edit/Cancel + the Proceed
   *  action panel. Default false → the dealer's full interactive detail. */
  readOnly?: boolean;
}) {
  const { data: order, isPending, error } = useOrder(id);
  const { data: catalog } = useCatalog();
  const role = useAuth((s) => s.role);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // ESC closes the modal — but only when no inner modal is layered on top
  // (otherwise ESC inside an editor/dialog would close the parent and lose state).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !editing && !cancelling) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editing, cancelling]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-base-900/55 grid place-items-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[760px] max-h-[88vh] flex flex-col bg-card text-card-foreground rounded-md shadow-md border border-base-900/10"
      >
        <header className="px-7 py-5 border-b border-base-100 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-xs text-base-500">{order ? `#${order.so}` : "—"}</div>
            <div className="font-display text-2xl mt-0.5 tracking-[-0.02em] truncate">{order?.customer.name ?? "Loading…"}</div>
            {order?.customer.phone && (
              <div className="font-mono text-xs text-base-500 mt-0.5">{order.customer.phone}</div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Edit + Cancel only on Place orders — once proceeded, changes
             *  and cancellation go through operation. Mirrors proto's
             *  customer editor button + the implicit cancel intent. */}
            {/* 2026-05-12 (Loo) — customer-facing Sales Order PDF.
             *  Always available on the detail drawer regardless of order
             *  status; the button itself hides for denied roles. */}
            {order && role && (
              <DownloadSalesOrderButton
                orderId={order.id}
                so={order.so}
                role={role}
                variant="secondary"
              />
            )}
            {!readOnly && order?.status === "place" && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="btn-secondary text-[11px] py-1.5 px-3"
                >
                  ✎ Edit details
                </button>
                <button
                  type="button"
                  onClick={() => setCancelling(true)}
                  className="btn-ghost text-[11px] py-1.5 px-3 hover:text-destructive"
                  title="Cancel this order"
                >
                  Cancel
                </button>
              </>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="btn-ghost text-xl leading-none px-2 py-1"
            >
              ×
            </button>
          </div>
        </header>

        <div className="px-7 py-6 overflow-auto flex-1">
          {isPending && <p className="text-sm text-base-500">Loading order…</p>}
          {error && (
            <p className="rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {(error as Error).message}
            </p>
          )}
          {order && catalog && <OrderBody order={order} floorConfig={catalog.floorConfig} readOnly={readOnly} />}
          {order && !catalog && <p className="text-sm text-base-500">Loading totals…</p>}
        </div>
      </div>

      {/* Edit + Cancel modals layered on top of the detail modal. Each
       *  closes itself on submit success — detail stays open until the
       *  outer × is clicked. */}
      {editing && order && (
        <EditOrderModal order={order} onClose={() => setEditing(false)} />
      )}
      {cancelling && order && (
        <CancelOrderDialog order={order} onClose={() => setCancelling(false)} />
      )}
    </div>
  );
}

function OrderBody({
  order,
  floorConfig,
  readOnly = false,
}: {
  order: Order;
  floorConfig: FloorConfigDto;
  readOnly?: boolean;
}) {
  const total = orderTotal(order, floorConfig);
  const sub = lineSubtotal(order);
  const ad = addonSubtotal(order);
  const stair = floorSurcharge(order, floorConfig);
  const paidPct = total > 0 ? Math.round((order.paid / total) * 100) : 0;

  const stages = [
    { key: "place", label: "Place", done: true, current: order.status === "place" },
    { key: "proceed_order", label: "Proceed", done: order.status !== "place" && order.status !== "cancelled", current: order.status === "proceed_order" },
    { key: "delivered", label: "Delivered", done: order.status === "delivered", current: order.status === "delivered" },
  ];

  return (
    <>
      {/* Stages */}
      <p className="label mb-3">Order journey</p>
      <div className="flex items-center mb-2">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div
              className={`w-4 h-4 rounded-full border-[1.5px] ${
                s.done ? "bg-primary border-primary" : "bg-card border-base-300"
              } ${s.current ? "ring-[5px] ring-signature-100" : ""} flex-shrink-0`}
            />
            {i < stages.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${stages[i + 1]?.done ? "bg-primary" : "bg-base-200"}`} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between mb-6 text-[11px] uppercase tracking-[0.1em]">
        {stages.map((s, i) => (
          <span
            key={s.key}
            className={`${s.current ? "text-primary font-bold" : s.done ? "text-base-700" : "text-base-400"}`}
            style={{ flex: 1, textAlign: i === 0 ? "left" : i === stages.length - 1 ? "right" : "center" }}
          >
            {s.label}
          </span>
        ))}
      </div>

      {/* Action panel — Place→Proceed transition or status info. Hidden in the
       *  principal trace-only view (read access without dealer mutations). */}
      {!readOnly && <ActionPanel order={order} />}

      {/* Customer */}
      <p className="label mb-2">Customer details</p>
      <div className="rounded border border-base-900/10 p-3.5 mb-4 grid grid-cols-2 gap-3.5 text-sm">
        <KV label="Name" value={order.customer.name || "—"} />
        <KV label="Phone" value={order.customer.phone ?? "—"} />
        <KV label="Address" value={order.customer.addressUnknown ? "Pending" : (order.customer.address ?? "—")} />
        <KV label="Delivery" value={order.delivery.dateTbd ? "TBD" : (order.delivery.date ?? "—")} />
        {/* Phase 11.1 — proceed (production-start) date */}
        <KV label="Proceed" value={order.delivery.dateTbd ? "TBD" : (order.delivery.proceedDate ?? "—")} />
      </div>

      {/* Items — exploded sofa-build lines (sharing a sofa_build_key) collapse
       *  into one "Sofa" row for the customer view; every flat line renders
       *  exactly as before (groupSofaBuildLines is a no-op for keyless lines). */}
      <p className="label mb-2">Items</p>
      <div className="rounded border border-base-900/10 mb-4 overflow-hidden">
        {groupSofaBuildLines(order.lines ?? []).map((row, i) =>
          row.kind === "sofa_build" ? (
            <div key={row.buildKey} className={`flex justify-between px-3.5 py-2.5 text-sm ${i ? "border-t border-base-100" : ""}`}>
              <span className="font-mono">
                Sofa · {row.summary} × {row.qty}
              </span>
              <span className="font-mono">RM {row.totalPrice.toLocaleString()}</span>
            </div>
          ) : (
            <div key={row.line.id} className={`px-3.5 py-2.5 text-sm ${i ? "border-t border-base-100" : ""}`}>
              <div className="flex justify-between">
                <span className="font-mono">
                  {row.line.sku} × {row.line.qty}
                  {freeLineTag(row.line.attrs) && (
                    <span className="ml-2 pill pill-confirmed align-middle">
                      {freeLineTag(row.line.attrs)}
                    </span>
                  )}
                </span>
                <span className="font-mono">
                  {freeLineTag(row.line.attrs)
                    ? "FREE"
                    : `RM ${(row.line.unitPrice * row.line.qty).toLocaleString()}`}
                </span>
              </div>
              <SpecialsSummary attrs={row.line.attrs} className="mt-1 ml-0.5 flex flex-col gap-0.5" />
            </div>
          ),
        )}
        {(order.addons ?? []).map((a, i) => {
          // 2026-05-19 (migration 0133) — disposal addons carry an attrs.size
          // tag set by the wizard. Render it next to the addon key so the
          // partner picking up the old furniture knows what size to handle.
          const size =
            typeof a.attrs === "object" &&
            a.attrs !== null &&
            typeof (a.attrs as { size?: unknown }).size === "string"
              ? ((a.attrs as { size: string }).size)
              : null;
          // 0184 — delivery trip fee addons (appended by the Hono recompute)
          // render with a friendly label; the base line may carry the linked
          // source SO when it's a cross-category follow-up.
          const deliveryLabel = DELIVERY_ADDON_LABELS[a.addonKey] ?? null;
          const sourceSo =
            typeof a.attrs === "object" &&
            a.attrs !== null &&
            typeof (a.attrs as { cross_category_source_so?: unknown }).cross_category_source_so === "string"
              ? ((a.attrs as { cross_category_source_so: string }).cross_category_source_so)
              : null;
          return (
            <div key={a.id} className={`flex justify-between px-3.5 py-2.5 text-sm text-base-600 ${(order.lines?.length ?? 0) + i > 0 ? "border-t border-base-100" : ""}`}>
              <span className="font-mono">
                + {deliveryLabel ?? a.addonKey}
                {size && <span className="text-base-700"> · {size}</span>}
                {sourceSo && <span className="text-base-700"> · ↳ {sourceSo}</span>}
                {" "}× {a.qty}
              </span>
              <span className="font-mono">RM {(a.unitPrice * a.qty).toLocaleString()}</span>
            </div>
          );
        })}
        {(order.lines ?? []).length === 0 && (order.addons ?? []).length === 0 && (
          <div className="px-3.5 py-3 text-sm text-base-500">No items recorded.</div>
        )}
        <div className="px-3.5 py-3 border-t border-base-200 bg-base-50">
          <Row label="Subtotal" value={`RM ${sub.toLocaleString()}`} />
          {ad > 0 && <Row label="Add-ons" value={`RM ${ad.toLocaleString()}`} />}
          {stair > 0 && <Row label="Stair carry" value={`RM ${stair.toLocaleString()}`} />}
          <div className="flex justify-between mt-2 pt-2 border-t border-base-200">
            <span className="text-sm font-semibold">Total</span>
            <span className="font-mono text-sm font-bold">RM {total.toLocaleString()}</span>
          </div>
          <div className={`flex justify-between mt-1 text-[11px] ${paidPct >= 50 ? "text-success" : "text-warning"}`}>
            <span>Paid</span>
            <span className="font-mono">RM {order.paid.toLocaleString()} ({paidPct}%)</span>
          </div>
        </div>
      </div>

      {/* Activity */}
      <p className="label mb-2">Activity</p>
      <div className="rounded border border-base-900/10 overflow-hidden">
        {(order.history ?? []).map((h, i) => (
          <div key={h.id} className={`grid grid-cols-[1fr_auto] gap-3.5 px-3.5 py-2.5 text-xs ${i ? "border-t border-base-100" : ""}`}>
            <span>{h.text}</span>
            <span className="font-mono text-base-500">{new Date(h.occurredAt).toLocaleString()}</span>
          </div>
        ))}
        {(order.history ?? []).length === 0 && (
          <div className="px-3.5 py-3 text-sm text-base-500">No activity yet.</div>
        )}
      </div>
    </>
  );
}

/**
 * Action panel — proto/dealer-orders.jsx:271-307 parity. Three states:
 *   • status === 'place' + no blockers → success-soft callout + Proceed button
 *   • status === 'place' + blockers    → warning-soft callout + blocker list +
 *                                         3 resolution buttons + disabled
 *                                         "Locked (N pending)" button
 *   • status === 'proceed_order'       → info-soft "In operation' hands" panel
 *   • else (delivered / cancelled)     → no panel
 *
 * Each resolution button opens a focused modal (AddAddress / ConfirmDate /
 * TopUpDeposit) that calls the corresponding RPC. Once the modal succeeds,
 * React Query invalidates the order detail and the panel re-renders with
 * one less blocker — repeat until ready, then the Proceed button enables.
 *
 * Server-side validation (RPC `proceed_order`) re-runs every blocker check so
 * a race condition where the client sees "ready" but the order changed under
 * us still gets caught — we surface the server's blocker code via toast.
 */
function ActionPanel({ order }: { order: Order }) {
  // Which resolution modal is currently open. null when none. Mutually
  // exclusive — only one modal is mounted at a time.
  const [openModal, setOpenModal] = useState<"address" | "date" | "topup" | null>(null);

  const proceedMut = useProceedOrder({
    onSuccess: () => {
      toast.success(`Order #${order.so} sent to operation`);
    },
    onError: (err) => {
      // 422 with a known blocker code → show the matching label so the dealer
      // knows exactly which precondition the server rejected. Other errors
      // get the generic message from ApiError.
      if (err instanceof ApiError && err.status === 422) {
        const code = (err.body as { code?: unknown } | null)?.code;
        if (isProceedBlockerCode(code)) {
          toast.error(`Cannot proceed: ${PROCEED_BLOCKER_LABEL[code]}`);
          return;
        }
      }
      toast.error(err.message || "Could not proceed order");
    },
  });

  if (order.status === "proceed_order") {
    return (
      <div className="rounded p-4 mb-5 bg-info-soft border border-info">
        <div className="text-[13px] font-semibold text-info">In operation&rsquo; hands</div>
        <p className="text-xs text-base-700 mt-0.5">
          Order will move to <strong>Delivered</strong> when operation submits the DO.
        </p>
      </div>
    );
  }

  if (order.status !== "place") {
    return null;
  }

  const blockers = proceedBlockers(order);
  const ready = blockers.length === 0;

  if (ready) {
    return (
      <div className="rounded p-4 mb-5 bg-success-soft border border-success">
        <div className="text-[13px] font-semibold text-success mb-1">✓ Ready to proceed</div>
        <p className="text-xs text-base-700">
          Customer info complete and payment ≥ 50%. You can push this order to operation.
        </p>
        <button
          type="button"
          onClick={() => proceedMut.mutate(order.id)}
          disabled={proceedMut.isPending}
          className="btn-primary w-full mt-3"
        >
          {proceedMut.isPending ? "Sending…" : "Proceed → Send to operation"}
        </button>
      </div>
    );
  }

  // Total for TopUpDepositModal balance math. Mirrors the RPC formula
  // (line + addon, no stair). Fall back to summing rels when totalAmount is
  // missing from older responses.
  const total =
    order.totalAmount ??
    (order.lines?.reduce((s, l) => s + l.unitPrice * l.qty, 0) ?? 0) +
      (order.addons?.reduce((s, a) => s + a.unitPrice * a.qty, 0) ?? 0);

  // Which resolution buttons to render. Mirrors proto/dealer-orders.jsx:286-289.
  const showAddress = order.customer.addressUnknown;
  const showDate = order.delivery.dateTbd;
  const paidPct = total > 0 ? (order.paid / total) * 100 : 0;
  const showTopUp = paidPct < 50;

  return (
    <>
      <div className="rounded p-4 mb-5 bg-warning-soft border border-warning">
        <div className="text-[13px] font-semibold text-warning mb-2">Resolve before proceeding</div>
        <ul className="m-0 pl-4 text-xs text-base-800 leading-[1.7] list-disc">
          {blockers.map((b) => (
            <li key={b.code}>{b.message}</li>
          ))}
        </ul>

        {/* Resolution buttons — proto:285-289. Smaller btn-secondary style so
         *  the "Locked" Proceed button below stays the visual primary. */}
        {(showAddress || showDate || showTopUp) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {showAddress && (
              <button
                type="button"
                onClick={() => setOpenModal("address")}
                className="btn-secondary text-[11px] py-1.5 px-3"
              >
                + Add address
              </button>
            )}
            {showDate && (
              <button
                type="button"
                onClick={() => setOpenModal("date")}
                className="btn-secondary text-[11px] py-1.5 px-3"
              >
                + Confirm date
              </button>
            )}
            {showTopUp && (
              <button
                type="button"
                onClick={() => setOpenModal("topup")}
                className="btn-secondary text-[11px] py-1.5 px-3"
              >
                + Top up to 50%
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          disabled
          className="btn-primary w-full mt-3"
          title={`Resolve ${blockers.length} item${blockers.length === 1 ? "" : "s"} above to enable`}
        >
          Proceed Order — locked ({blockers.length} pending)
        </button>
      </div>

      {/* Modals — only one mounted at a time. Each closes itself + invalidates
       *  React Query on success so the panel re-renders without this row
       *  having to re-derive state. */}
      {openModal === "address" && (
        <AddAddressModal order={order} onClose={() => setOpenModal(null)} />
      )}
      {openModal === "date" && (
        <ConfirmDateModal order={order} onClose={() => setOpenModal(null)} />
      )}
      {openModal === "topup" && (
        <TopUpDepositModal
          order={order}
          total={total}
          onClose={() => setOpenModal(null)}
        />
      )}
    </>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1" style={{ letterSpacing: "0.16em", fontSize: "10px" }}>{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs text-base-600">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
