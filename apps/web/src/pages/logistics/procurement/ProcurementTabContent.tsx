import { useMemo, useState } from "react";
import { useProcurementTab, useCatalog, useLogisticsSuppliers, useLogisticsWarehouse } from "@/lib/queries";
import type { LogisticsPoListRow, SupplierRow } from "@/lib/queries";
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
 * Per-tab body shared by NiceFutureMattressTab, HoOKkASofaTab, and
 * HoOKkABedFrameTab. Each tab is a thin wrapper that picks a slug; this
 * component does the actual fetch + table render. It mirrors the row layout
 * of `LogisticsProcurement.tsx` (the original single-page list) so tab
 * navigation feels seamless to the user.
 *
 * Why a helper instead of duplicating into each tab:
 *   - Three tabs render the same row shape (PO# / Items / Supplier /
 *     Warehouse / ETA / Status / Action). Duplicating would mean three places
 *     to keep in sync when the row layout evolves.
 *   - Slug-keyed cache (`qk.logistics.procurementTab(slug)`) means each tab
 *     still owns its own data — there's no shared state leaking between tabs.
 *   - Modals (Receive / AssignPickup / LpInbound / Detail) live here too so
 *     they always open against the active tab's PO list.
 *
 * The page-level "+ New PO" button + CreatePOModal mount live on the parent
 * `TabbedProcurementShell` (restored in T42-C2 after the legacy
 * `LogisticsProcurement.tsx` was removed in T36). Per-tab content keeps only
 * the filter chips + the row-level Receive/Assign/Detail actions.
 */
type FilterKey = "all" | "open" | "pickup" | "received";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open / partial" },
  { key: "pickup", label: "Pickup action" },
  { key: "received", label: "Received" },
];

// PO display status — same calc as LogisticsProcurement.tsx (mirrors proto's
// `poStatus(po)`: status='cancelled' → cancelled; 'received' → received; else
// derive from line received_qty rollup vs total qty).
function poDisplayStatus(po: LogisticsPoListRow): "open" | "partial" | "received" | "cancelled" {
  if (po.status === "cancelled") return "cancelled";
  if (po.status === "received") return "received";
  const lines = po.purchase_order_lines ?? [];
  const total = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const got = lines.reduce((s, l) => s + Number(l.received_qty || 0), 0);
  if (got === 0) return "open";
  if (got >= total) return "received";
  return "partial";
}

function poTotalQty(po: LogisticsPoListRow): number {
  return (po.purchase_order_lines ?? []).reduce(
    (s, l) => s + Number(l.qty || 0),
    0,
  );
}
function poReceivedQty(po: LogisticsPoListRow): number {
  return (po.purchase_order_lines ?? []).reduce(
    (s, l) => s + Number(l.received_qty || 0),
    0,
  );
}

function statusColor(st: ReturnType<typeof poDisplayStatus>): string {
  if (st === "received") return "var(--success)";
  if (st === "partial") return "var(--info, #2563eb)";
  if (st === "cancelled") return "var(--base-400)";
  return "var(--warning)";
}

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
  const [detailPo, setDetailPo] = useState<LogisticsPoListRow | null>(null);

  const tabQ = useProcurementTab(slug);
  const suppliersQ = useLogisticsSuppliers();
  const warehouseQ = useLogisticsWarehouse();
  const catalogQ = useCatalog();

  const pos = tabQ.data?.pos ?? [];
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
  // still needs a logistics hand-off.
  const needsPickup = (p: { status: string; sup_status: string }) =>
    p.status !== "received" &&
    (p.sup_status === "ready_for_pickup" ||
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
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load purchase orders
          </div>
          <div className="text-[12px] text-base-700 mb-3">
            {(tabQ.error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void tabQ.refetch()}
            className="btn-secondary text-[11px] py-1.5 px-3"
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
      {/* Filter chips — same model as LogisticsProcurement.tsx but local to
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

      <div className="card p-0" data-testid={`po-list-table-${slug}`}>
        <div
          className="grid items-center gap-4 px-[18px] py-3 bg-base-50 border-b border-base-200"
          style={{
            gridTemplateColumns: "96px 2.4fr 1.2fr 1fr 96px 120px 130px",
          }}
        >
          <div className="label">PO #</div>
          <div className="label">Items</div>
          <div className="label">Supplier</div>
          <div className="label">Warehouse</div>
          <div className="label">ETA</div>
          <div className="label text-right">Status</div>
          <div className="label text-right">Action</div>
        </div>
        {filtered.map((po) => {
          const supp = supplierById.get(po.supplier_id);
          const wh = warehouseById.get(po.warehouse_id);
          const lines = po.purchase_order_lines ?? [];
          const total = poTotalQty(po);
          const got = poReceivedQty(po);
          const st = poDisplayStatus(po);
          const stColor = statusColor(st);
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
              className="grid items-center gap-4 px-[18px] py-3 border-t border-base-100 hover:bg-base-50 transition-colors cursor-pointer"
              style={{
                gridTemplateColumns: "96px 2.4fr 1.2fr 1fr 96px 120px 130px",
              }}
            >
              <div
                className="font-mono text-[12px] font-semibold"
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
                      className="text-[12px] leading-[1.4] flex gap-1.5 items-baseline font-body"
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
                        className="font-mono text-[11px] whitespace-nowrap"
                        style={{
                          color: fully ? "var(--success)" : "var(--base-600)",
                        }}
                      >
                        {l.received_qty || 0}/{l.qty}
                      </span>
                    </div>
                  );
                })}
                {po.dl && (
                  <div className="text-[10px] text-base-500 mt-1 font-body">
                    for order #{po.dl}
                  </div>
                )}
                {po.dl_refs && po.dl_refs.length > 0 && (
                  <div className="text-[10px] text-base-500 mt-1 font-body">
                    bundle of {po.dl_refs.length} orders ·{" "}
                    {po.dl_refs.map((d) => `#${d}`).join(", ")}
                  </div>
                )}
                {lines.length > 1 && (
                  <div className="font-mono text-[10px] text-base-500 mt-1">
                    Σ {got}/{total} units
                  </div>
                )}
              </div>
              <div className="text-[12px] font-body">
                {supp?.name ?? "—"}
              </div>
              <div className="text-[12px] font-body">{wh?.name ?? "—"}</div>
              <div className="font-mono text-[11px] text-base-600">
                {po.eta_date ?? "—"}
              </div>
              <div className="text-right">
                <span
                  className="font-ui font-bold uppercase border rounded-[3px]"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.12em",
                    color: stColor,
                    borderColor: stColor,
                    padding: "3px 7px",
                  }}
                >
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
            className="p-9 text-center text-base-500 text-[13px]"
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

// Per-row action cell — same logic as LogisticsProcurement.tsx (mirrors v3
// spec §7.3 "Receive default" + factory_pickup carve-outs). Kept inline here
// so each tab stays self-contained without a deep import chain.
function ActionCell({
  po,
  onReceive,
  onAssignPickup,
  onLpInboundConfirm,
  onReassign,
}: {
  po: LogisticsPoListRow;
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
      <span className="font-mono text-[10px] text-base-500">cancelled</span>
    );
  }
  if (ss === "reassign_needed") {
    // Phase 7 sweep: customer rejected at original wh — needs relocation.
    // The dialog itself was shipped in Phase 4 (F1.A) but stayed dead UI
    // pending Phase 7. This is the trigger.
    return (
      <button
        type="button"
        className="btn-primary text-[11px] py-1 px-2.5"
        style={{
          background: "var(--brand-signature)",
          borderColor: "var(--brand-signature)",
        }}
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
  if (ss === "ready_confirm_sent") {
    return (
      <button
        type="button"
        className="btn-primary text-[11px] py-1 px-2.5"
        onClick={(e) => {
          e.stopPropagation();
          onLpInboundConfirm();
        }}
        data-testid={`lp-inbound-confirm-${po.id}`}
      >
        LP Pre-flight 代按
      </button>
    );
  }
  if (ss === "ready_for_pickup") {
    return (
      <button
        type="button"
        className="btn-primary text-[11px] py-1 px-2.5"
        onClick={(e) => {
          e.stopPropagation();
          onAssignPickup();
        }}
        data-testid={`assign-pickup-${po.id}`}
      >
        Assign partner
      </button>
    );
  }
  if (ss === "pickup_assigned" || ss === "pickup_accepted") {
    return (
      <span className="font-mono text-[10px] text-base-500">
        {ss === "pickup_assigned" ? "awaiting accept" : "pickup scheduled"}
      </span>
    );
  }
  if (ss === "picked_up") {
    return (
      <span className="font-mono text-[10px] text-base-500">in transit</span>
    );
  }
  return (
    <button
      type="button"
      className="btn-secondary text-[11px] py-1 px-2.5"
      style={{ borderColor: "var(--success)", color: "var(--success)" }}
      onClick={(e) => {
        e.stopPropagation();
        onReceive();
      }}
      data-testid={`receive-po-${po.id}`}
    >
      Receive →
    </button>
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
        "px-3 py-1.5 rounded-[4px] text-[12px] transition-colors border",
        active
          ? "bg-base-900 text-white border-base-900 font-semibold"
          : "bg-white text-base-700 border-base-200 font-medium hover:border-base-400",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
