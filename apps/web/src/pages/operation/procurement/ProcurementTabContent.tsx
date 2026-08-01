import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useProcurementTab, useCatalog, useOperationSuppliers, useOperationWarehouse } from "@/lib/queries";
import type { operationPoListRow, SupplierRow } from "@/lib/queries";
import { purchasingActionButton } from "@carres/shared";
import type { ProcurementTabSlug } from "@carres/shared";
import type { ProductSkuDto } from "@carres/shared";
import AssignPickupDialog from "../components/AssignPickupDialog";
import ReassignWarehouseDialog from "../components/ReassignWarehouseDialog";
import LpInboundConfirmDialog from "../components/LpInboundConfirmDialog";
import PoDetailModal from "../components/PoDetailModal";
import ReceivePOModal from "../components/ReceivePOModal";

/**
 * ProcurementTabContent — Phase 4.5 Chunk 2 Sprint F Task 34.
 *
 * Per-tab body shared by NiceFutureMattressTab, OhanaSofaTab, and
 * OhanaBedFrameTab. Each tab is a thin wrapper that picks a slug; this
 * component does the actual fetch + table render. It mirrors the row layout
 * of `operationProcurement.tsx` (the original single-page list) so tab
 * navigation feels seamless to the user.
 *
 * Why a helper instead of duplicating into each tab:
 *   - Three tabs render the same row shape (PO# / Items / Supplier /
 *     Warehouse / ETA / Status / Action). Duplicating would mean three places
 *     to keep in sync when the row layout evolves.
 *   - Slug-keyed cache (`qk.operation.procurementTab(slug)`) means each tab
 *     still owns its own data — there's no shared state leaking between tabs.
 *   - Modals (Receive / AssignPickup / LpInbound / Detail) live here too so
 *     they always open against the active tab's PO list.
 *
 * The page-level "+ New PO" button + CreatePOModal mount live on the parent
 * `TabbedProcurementShell` (restored in T42-C2 after the legacy
 * `operationProcurement.tsx` was removed in T36). Per-tab content keeps only
 * the filter chips + the row-level Receive/Assign/Detail actions.
 */
type FilterKey = "all" | "open" | "pickup" | "received";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open / partial" },
  { key: "pickup", label: "Pickup action" },
  { key: "received", label: "Received" },
];

// PO display status — same calc as operationProcurement.tsx (mirrors proto's
// `poStatus(po)`: status='cancelled' → cancelled; 'received' → received; else
// derive from line received_qty rollup vs total qty).
function poDisplayStatus(po: operationPoListRow): "open" | "partial" | "received" | "cancelled" {
  if (po.status === "cancelled") return "cancelled";
  if (po.status === "received") return "received";
  const lines = po.purchase_order_lines ?? [];
  const total = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const got = lines.reduce((s, l) => s + Number(l.received_qty || 0), 0);
  if (got === 0) return "open";
  if (got >= total) return "received";
  return "partial";
}

function poTotalQty(po: operationPoListRow): number {
  return (po.purchase_order_lines ?? []).reduce(
    (s, l) => s + Number(l.qty || 0),
    0,
  );
}
function poReceivedQty(po: operationPoListRow): number {
  return (po.purchase_order_lines ?? []).reduce(
    (s, l) => s + Number(l.received_qty || 0),
    0,
  );
}

/** v17 pill per PO display status — open=amber, partial=indigo, received=green,
 *  cancelled=grey. Same mapping as PoDetailModal. */
const PO_STATUS_PILL: Record<ReturnType<typeof poDisplayStatus>, string> = {
  open: "pill-warning",
  partial: "pill-collected",
  received: "pill-confirmed",
  cancelled: "pill-neutral",
};

export interface ProcurementTabContentProps {
  slug: ProcurementTabSlug;
}

export default function ProcurementTabContent({
  slug,
}: ProcurementTabContentProps) {
  const [filter, setFilter] = useState<FilterKey>("open");
  const [receivePoId, setReceivePoId] = useState<string | null>(null);
  const [assignPickupPoId, setAssignPickupPoId] = useState<string | null>(null);
  const [reassignPoId, setReassignPoId] = useState<string | null>(null);
  const [lpInboundFor, setLpInboundFor] = useState<string | null>(null);
  const [detailPo, setDetailPo] = useState<operationPoListRow | null>(null);

  const tabQ = useProcurementTab(slug);
  const suppliersQ = useOperationSuppliers();
  const warehouseQ = useOperationWarehouse();
  const catalogQ = useCatalog();

  const pos = tabQ.data?.pos ?? [];

  /**
   * `?po=` — To Order's PO No. link lands HERE with that document opened
   * (Jess, 2026-08-01: the receipt is the door to the next step). Once, on
   * the first load that can answer; the filter widens to `all` so a
   * received or cancelled document still opens.
   */
  const [searchParams] = useSearchParams();
  const wantedPo = searchParams.get("po");
  const openedWanted = useRef(false);
  useEffect(() => {
    if (!wantedPo || openedWanted.current || pos.length === 0) return;
    const hit = pos.find((p) => p.id === wantedPo);
    if (!hit) return;
    openedWanted.current = true;
    setFilter("all");
    setDetailPo(hit);
  }, [wantedPo, pos]);
  const suppliers = suppliersQ.data?.suppliers ?? [];
  const warehouses = warehouseQ.data?.warehouses ?? [];

  const supplierById = useMemo(() => {
    const m = new Map<string, SupplierRow>();
    for (const s of suppliers) m.set(s.id, s);
    return m;
  }, [suppliers]);
  const warehouseById = useMemo(() => {
    const m = new Map<
      string,
      { id: string; name: string; address: string | null }
    >();
    for (const w of warehouses) m.set(w.id, w);
    return m;
  }, [warehouses]);
  const skuLabelMap = useMemo(() => {
    const m = new Map<string, ProductSkuDto>();
    for (const s of catalogQ.data?.skus ?? []) m.set(s.sku, s);
    return m;
  }, [catalogQ.data]);

  // 2026-05-10 (Loo): "Pickup action" must exclude already-received POs.
  // The receive RPC leaves sup_status='delivered' (semantically "goods were
  // delivered to warehouse") even after status flips to 'received', which
  // used to double-count POs as both Pickup-action AND Received. Gate the
  // bucket on `p.status !== 'received'` so the chip only counts work that
  // still needs a operation hand-off.
  const needsPickup = (p: { status: string; sup_status: string }) =>
    p.status !== "received" &&
    // 2026-05-10 (Loo) — ready_confirm_sent is the actual state factory-pickup
    // suppliers land in after Mark Ready (operation_supplier_ready_confirm
    // RPC sets it). It was missing here so the Pickup action chip + sidebar
    // badge silently sat at 0 even though the PO was waiting for partner
    // assignment. Surfaced 2026-05-10 by Loo testing the Nice Future flow.
    // 2026-05-15 (Task 14) — `partially_shipped` (migration 0107): at least
    // one thread is still ready and not picked, so the PO STILL needs more
    // pickup work. Without this entry the chip silently drops the partial PO
    // from the Pickup-action count even though there's outstanding work.
    (p.sup_status === "ready_confirm_sent" ||
      p.sup_status === "ready_for_pickup" ||
      p.sup_status === "partially_shipped" ||
      p.sup_status === "delivered" ||
      p.sup_status === "reassign_needed");

  const counts = useMemo(() => {
    const acc = { all: pos.length, open: 0, pickup: 0, received: 0 };
    for (const p of pos) {
      const st = poDisplayStatus(p);
      if (st !== "received" && st !== "cancelled") acc.open += 1;
      if (st === "received") acc.received += 1;
      if (needsPickup(p)) acc.pickup += 1;
    }
    return acc;
  }, [pos]);

  const filtered = useMemo(() => {
    return pos.filter((p) => {
      const st = poDisplayStatus(p);
      if (filter === "all") return true;
      if (filter === "open") return st !== "received" && st !== "cancelled";
      if (filter === "received") return st === "received";
      if (filter === "pickup") return needsPickup(p);
      return true;
    });
  }, [pos, filter]);

  if (tabQ.isLoading) {
    return (
      <div className="px-9 py-7" data-testid={`procurement-tab-loading-${slug}`}>
        <div className="bg-white border border-base-200 rounded-[4px]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-14 border-b border-base-100 px-4 flex items-center gap-3"
            >
              <div className="h-3 w-16 bg-base-50 rounded animate-pulse" />
              <div className="h-3 flex-1 bg-base-50 rounded animate-pulse" />
              <div className="h-6 w-20 bg-base-50 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tabQ.isError) {
    return (
      <div className="px-9 py-7" data-testid={`procurement-tab-error-${slug}`}>
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-body">
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load purchase orders
          </div>
          <div className="text-meta text-base-700 mb-3">
            {(tabQ.error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void tabQ.refetch()}
            className="btn-secondary text-label py-1.5 px-3"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="px-9 py-7"
      data-testid={`procurement-tab-content-${slug}`}
    >
      {/* Filter chips — same model as operationProcurement.tsx but local to
          this tab so each tab's filter state is independent. */}
      <div
        className="flex gap-1.5 mb-[18px] flex-wrap"
        role="tablist"
        aria-label="PO filter"
      >
        {FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            active={filter === f.key}
            label={`${f.label} · ${counts[f.key]}`}
            onClick={() => setFilter(f.key)}
          />
        ))}
      </div>

      {/*
        2026-05-18 (Loo C+D) — row redesign:
        - Dropped Supplier column (redundant per supplier tab)
        - Dropped Warehouse column (only 1 WH currently, zero info)
        - Dropped standalone ETA column (PO eta_date now footer text in Items)
        - Added Orders column (per-source-SO: #SO · customer · MM-DD · 🔴/🟡/🟢)
        Urgency dots are per-SO (visual transparency) but PO.urgency is the
        worst-case used for any aggregate sorting/filter logic.
      */}
      <div className="card p-0" data-testid={`po-list-table-${slug}`}>
        <div
          className="grid items-center gap-4 px-[18px] py-3 bg-base-50 border-b border-base-200"
          style={{
            gridTemplateColumns: "96px 1.5fr 2.2fr 110px 130px",
          }}
        >
          <div className="label">PO #</div>
          <div className="label">Items</div>
          <div className="label">Orders</div>
          <div className="label text-right">Status</div>
          <div className="label text-right">Action</div>
        </div>
        {filtered.map((po) => {
          const lines = po.purchase_order_lines ?? [];
          const total = poTotalQty(po);
          const got = poReceivedQty(po);
          const st = poDisplayStatus(po);
          const orders = po.orders ?? [];
          return (
            <div
              key={po.id}
              data-testid={`po-row-${po.id}`}
              onClick={() => setDetailPo(po)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDetailPo(po);
                }
              }}
              className="grid items-start gap-4 px-[18px] py-3 border-t border-base-100 hover:bg-base-50 transition-colors cursor-pointer"
              style={{
                gridTemplateColumns: "96px 1.5fr 2.2fr 110px 130px",
              }}
            >
              <div
                className="font-mono text-meta font-semibold pt-0.5"
                title={po.id}
              >
                {po.id.slice(0, 8)}
              </div>
              <div className="min-w-0">
                {lines.map((l, i) => {
                  const fully = (l.received_qty || 0) >= (l.qty || 0);
                  const skuName = skuLabelMap.get(l.sku)?.variant ?? l.sku;
                  return (
                    <div
                      key={i}
                      className="text-meta leading-[1.4] flex gap-1.5 items-baseline font-body"
                    >
                      <span
                        className="rounded-full flex-shrink-0"
                        style={{
                          width: 6,
                          height: 6,
                          background: fully
                            ? "var(--success)"
                            : l.received_qty
                              ? "var(--info, #2563eb)"
                              : "var(--warning)",
                          transform: "translateY(-1px)",
                        }}
                      />
                      <span
                        className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                        title={l.sku}
                      >
                        {skuName}
                      </span>
                      <span
                        className="font-mono text-label whitespace-nowrap"
                        style={{
                          color: fully ? "var(--success)" : "var(--base-600)",
                        }}
                      >
                        {l.received_qty || 0}/{l.qty}
                      </span>
                    </div>
                  );
                })}
                {lines.length > 1 && (
                  <div className="font-mono text-label text-base-500 mt-1">
                    Σ {got}/{total} units
                  </div>
                )}
                {po.eta_date && (
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="font-ui text-label uppercase tracking-[0.12em] text-base-500 font-semibold">
                      PO ETA
                    </span>
                    <span className="font-mono text-meta text-base-900 font-semibold">
                      {po.eta_date}
                    </span>
                  </div>
                )}
              </div>
              <div className="min-w-0">
                {orders.length === 0 ? (
                  <div className="text-label text-base-500 italic font-body">
                    Stockpile · no source order
                  </div>
                ) : (
                  <>
                    {orders.map((o) => (
                      <OrdersRow key={o.so} order={o} />
                    ))}
                    {orders.length > 1 && (
                      <div className="font-mono text-label text-base-500 mt-1">
                        Σ {orders.length} orders
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="text-right pt-0.5">
                <span className={`pill capitalize ${PO_STATUS_PILL[st]}`}>
                  {st}
                </span>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <ActionCell
                  po={po}
                  onReceive={() => setReceivePoId(po.id)}
                  onAssignPickup={() => setAssignPickupPoId(po.id)}
                  onLpInboundConfirm={() => setLpInboundFor(po.id)}
                  onReassign={() => setReassignPoId(po.id)}
                />
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div
            className="p-9 text-center text-base-500 text-body"
            data-testid={`procurement-tab-empty-${slug}`}
          >
            No POs in this channel.
          </div>
        )}
      </div>

      {receivePoId &&
        (() => {
          const po = pos.find((p) => p.id === receivePoId);
          if (!po) return null;
          return (
            <ReceivePOModal
              po={po}
              supplier={supplierById.get(po.supplier_id)}
              warehouse={warehouseById.get(po.warehouse_id)}
              onClose={() => setReceivePoId(null)}
            />
          );
        })()}
      {assignPickupPoId &&
        (() => {
          const po = pos.find((p) => p.id === assignPickupPoId);
          if (!po) return null;
          return (
            <AssignPickupDialog
              po={po}
              supplier={supplierById.get(po.supplier_id)}
              warehouse={warehouseById.get(po.warehouse_id)}
              onClose={() => setAssignPickupPoId(null)}
            />
          );
        })()}
      {lpInboundFor && (
        <LpInboundConfirmDialog
          poId={lpInboundFor}
          onClose={() => setLpInboundFor(null)}
        />
      )}
      {reassignPoId &&
        (() => {
          // Phase 7 sweep: wire ReassignWarehouseDialog (Phase 4 D3=A had
          // deferred this — the dialog existed but no trigger was mounted).
          // Surfaces when a PO reaches sup_status='reassign_needed' (state
          // production deferred to whoever ships the partner customer-rejected
          // action; the dialog is ready to receive that traffic now).
          const po = pos.find((p) => p.id === reassignPoId);
          if (!po) return null;
          return (
            <ReassignWarehouseDialog
              po={po}
              supplier={supplierById.get(po.supplier_id)}
              onClose={() => setReassignPoId(null)}
            />
          );
        })()}
      {detailPo && (
        <PoDetailModal
          po={detailPo}
          supplier={supplierById.get(detailPo.supplier_id)}
          warehouse={warehouseById.get(detailPo.warehouse_id)}
          onClose={() => setDetailPo(null)}
          onReceive={() => {
            const id = detailPo.id;
            setDetailPo(null);
            setReceivePoId(id);
          }}
        />
      )}
    </div>
  );
}

// Per-row action cell — mirrors v3 spec §7.3 "Receive default" + factory_pickup
// carve-outs.
//
// 2026-05-11 (Loo): Direct-Receive escape hatch.
// The receive RPC `operation_receive_po_with_do` (0076) only requires
// status='open' — sup_status is unconstrained, and on full receive it
// atomically flips status='received' + sup_status='delivered' (or
// 'at_warehouse_waiting' for relocated). So operation CAN legitimately
// receive at any pickup-pipeline stage when DO comes in via supplier or
// warehouse-direct channels (skipping the partner-side "Mark Arrived"
// button). The partner kanban filters by status='open', so once the PO
// flips to received it disappears from their view — no stale UI.
//
// UI rules:
//   - terminal states (received / cancelled): no actions
//   - reassign_needed: Reassign warehouse (the only way out of that hole)
//   - other states: surface the stage-specific primary action AS WELL AS
//     a small "Direct receive" link as the always-available escape hatch
function ActionCell({
  po,
  onReceive,
  onAssignPickup,
  onLpInboundConfirm,
  onReassign,
}: {
  po: operationPoListRow;
  onReceive: () => void;
  onAssignPickup: () => void;
  onLpInboundConfirm: () => void;
  onReassign: () => void;
}) {
  const st = poDisplayStatus(po);
  const ss = po.sup_status;

  if (st === "received") return null;
  if (st === "cancelled") {
    return (
      <span className="font-mono text-label text-base-500">cancelled</span>
    );
  }
  if (ss === "reassign_needed") {
    // Phase 7 sweep: customer rejected at original wh — needs relocation.
    return (
      <button
        type="button"
        className="btn-primary text-label py-1 px-2.5"
        onClick={(e) => {
          e.stopPropagation();
          onReassign();
        }}
        data-testid={`reassign-${po.id}`}
      >
        Reassign warehouse
      </button>
    );
  }

  const directReceive = (
    <button
      type="button"
      className="text-label text-base-500 underline hover:text-base-800 transition-colors"
      onClick={(e) => {
        e.stopPropagation();
        onReceive();
      }}
      data-testid={`receive-po-${po.id}`}
    >
      Direct receive →
    </button>
  );

  if (ss === "ready_confirm_sent") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          className="btn-primary text-label py-1 px-2.5"
          onClick={(e) => {
            e.stopPropagation();
            onLpInboundConfirm();
          }}
          data-testid={`lp-inbound-confirm-${po.id}`}
        >
          LP Pre-flight (proxy)
        </button>
        {directReceive}
      </div>
    );
  }
  if (ss === "ready_for_pickup") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          className="btn-primary text-label py-1 px-2.5"
          onClick={(e) => {
            e.stopPropagation();
            onAssignPickup();
          }}
          data-testid={`assign-pickup-${po.id}`}
        >
          Assign partner
        </button>
        {directReceive}
      </div>
    );
  }
  if (
    ss === "pickup_assigned" ||
    ss === "pickup_accepted" ||
    ss === "picked_up" ||
    // 2026-05-15 (Task 14) — `partially_shipped` (migration 0107): partner
    // picked some threads, others still ready at factory. Show as in-flight
    // (no primary Receive); direct-receive link stays available for the
    // DO-arrives-via-supplier escape hatch.
    ss === "partially_shipped" ||
    // 2026-05-15 (Task 14) — `shipped` is the post-all-threads-picked terminal
    // (per migration 0108 F3, supplier branch); partner is en route to WH.
    ss === "shipped"
  ) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="font-mono text-label text-base-500">
          {ss === "pickup_assigned"
            ? "awaiting accept"
            : ss === "pickup_accepted"
              ? "pickup scheduled"
              : ss === "partially_shipped"
                ? "partially picked"
                : "in transit"}
        </span>
        {directReceive}
      </div>
    );
  }
  // Default (sup_status='delivered' = partner already pressed Arrived at WH,
  // OR any other unhandled state): the full primary check-in button.
  //
  // R8 (2026-07-28) — it said `Receive →`. This is the SAME act, opening the
  // SAME `ReceivePOModal`, as the button one tab over on Receiving, and
  // COPY-STANDARD bans `Receive` as a verb. Renamed with that sibling rather
  // than left as the last screen in the module spelling it the old way.
  return (
    <button
      type="button"
      className="btn-secondary text-label py-1 px-2.5"
      style={{ borderColor: "var(--success)", color: "var(--success)" }}
      onClick={(e) => {
        e.stopPropagation();
        onReceive();
      }}
      data-testid={`receive-po-${po.id}`}
    >
      {purchasingActionButton("check_in")}
    </button>
  );
}

/**
 * 2026-05-18 (Loo C+D) — per-source-SO row in the Orders column.
 * Shows: `#SO · Customer · MM-DD · urgency-dot`. Customer name truncates with
 * ellipsis; dot color comes from per-SO delivery_date diff from today
 * (matches the server-side `urgency` calc one-for-one):
 *   < 7 days  → 🔴 critical (var(--danger))
 *   7-14 days → 🟡 urgent   (var(--warning))
 *   >= 14 days → 🟢 normal   (var(--success))
 *   no date   → muted dot   (var(--base-300))
 *
 * Kept in this file (not factored to its own component) because it has zero
 * standalone use — only the procurement-tabs list embeds it.
 */
function OrdersRow({
  order,
}: {
  order: { so: number; customer_name: string; delivery_date: string | null };
}) {
  const dot = (() => {
    if (!order.delivery_date) return "var(--base-300)";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(order.delivery_date + "T00:00:00");
    const days = Math.floor((target.getTime() - today.getTime()) / 86400000);
    if (days < 7) return "var(--danger, #dc2626)";
    if (days < 14) return "var(--warning)";
    return "var(--success)";
  })();
  const dateLabel = order.delivery_date
    ? order.delivery_date.slice(5) // "MM-DD" from "YYYY-MM-DD"
    : "TBD";
  return (
    <div className="text-meta leading-[1.5] flex gap-1.5 items-baseline font-body">
      <span className="font-mono text-label text-base-700 flex-shrink-0">
        #{order.so}
      </span>
      <span
        className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-base-700"
        title={order.customer_name}
      >
        {order.customer_name}
      </span>
      {/* Customer ETA — Loo 2026-05-18: bumped to be visually prominent
          (was 11px muted, easy to miss). Bold + dark + a uppercase "DUE"
          micro-label so the operator can scan customer deadlines at a glance
          without confusing it with the PO ETA. The urgency dot to the right
          encodes the same info in color. */}
      <span className="font-ui text-label uppercase tracking-[0.12em] text-base-500 font-semibold whitespace-nowrap">
        DUE
      </span>
      <span className="font-mono text-meta text-base-900 font-semibold whitespace-nowrap">
        {dateLabel}
      </span>
      <span
        className="rounded-full flex-shrink-0"
        style={{
          width: 8,
          height: 8,
          background: dot,
          transform: "translateY(-1px)",
        }}
        aria-hidden
      />
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-[4px] text-meta transition-colors border",
        active
          ? "bg-base-900 text-white border-base-900 font-semibold"
          : "bg-white text-base-700 border-base-200 font-medium hover:border-base-400",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
