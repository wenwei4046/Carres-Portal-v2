import { useMemo, useState } from "react";
import {
  useCatalog,
  useLogisticsPos,
  useLogisticsSuppliers,
  useLogisticsWarehouse,
  type LogisticsPoListRow,
  type SupplierRow,
} from "@/lib/queries";
import type { ProductSkuDto } from "@carres/shared";
import AssignPickupDialog from "./components/AssignPickupDialog";
import CreatePOModal, {
  type CreatePoPrefill,
} from "./components/CreatePOModal";
import PoDetailModal from "./components/PoDetailModal";
import ReceivePOModal from "./components/ReceivePOModal";

/**
 * LogisticsProcurement — full PO management page for HQ Logistics.
 *
 * Mirrors `reference/proto/logistics-screens.jsx` `LogisticsProcurement`
 * (lines 410-594):
 *   - Header (Procurement kicker + "Purchase orders" title + intro line that
 *     differentiates own_logistics vs factory_pickup + "+ New PO" button)
 *   - 4 filter chips (All · Open/partial · Pickup action · Received) with
 *     counts
 *   - Card-style table of POs with PO# / Items / Supplier / Warehouse / ETA /
 *     Status / Action columns
 *   - Per-row Action column reflects sup_status — primary actions are
 *     "Receive →" (default for any open PO; Q5 reform per v3 spec §7.3,
 *     applied by v3-S2.2), "Assign partner" (when sup_status='ready_for_pickup'),
 *     or pickup-flight status text (pickup_assigned / pickup_accepted /
 *     picked_up). ReassignWarehouseDialog is intentionally NOT wired here
 *     (D3=A — see ReassignWarehouseDialog.tsx header for explanation).
 *   - Modals open inline: CreatePOModal (`+ New PO`), ReceivePOModal (per
 *     row), AssignPickupDialog (per row).
 *
 * Note: this page reads `purchase_order_lines` from the list response embed
 * (the list endpoint already projects them — see queries.ts:954). There is no
 * GET /pos/:id endpoint yet (M5.0 stub); modals plucked their PO from the
 * list cache via `pos.find(p => p.id === id)`.
 */
type FilterKey = "all" | "open" | "pickup" | "received";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open / partial" },
  { key: "pickup", label: "Pickup action" },
  { key: "received", label: "Received" },
];

// PO status calc — proto uses `poStatus(po)` to distinguish open / partial /
// received based on the line received_qty rollup. The DB `status` column has
// only 3 values (open/received/cancelled), but proto displays "partial" when
// some lines are received. We mirror that here.
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

export default function LogisticsProcurement() {
  const [filter, setFilter] = useState<FilterKey>("open");
  const [createPrefill, setCreatePrefill] = useState<CreatePoPrefill | null>(
    null,
  );
  const [receivePoId, setReceivePoId] = useState<string | null>(null);
  const [assignPickupPoId, setAssignPickupPoId] = useState<string | null>(null);
  // C5.1 — selected PO row to show in the read-only detail modal. We hold the
  // full row (not just id) so the modal doesn't need a new GET /:id endpoint;
  // it reads everything from the list cache.
  const [detailPo, setDetailPo] = useState<LogisticsPoListRow | null>(null);

  const posQ = useLogisticsPos();
  const suppliersQ = useLogisticsSuppliers();
  const warehouseQ = useLogisticsWarehouse();
  const catalogQ = useCatalog();

  const pos = posQ.data?.pos ?? [];
  const suppliers = suppliersQ.data?.suppliers ?? [];
  const warehouses = warehouseQ.data?.warehouses ?? [];
  const supplierById = useMemo(() => {
    const m = new Map<string, SupplierRow>();
    for (const s of suppliers) m.set(s.id, s);
    return m;
  }, [suppliers]);
  const warehouseById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; address: string | null }>();
    for (const w of warehouses) m.set(w.id, w);
    return m;
  }, [warehouses]);
  // SKU lookup: catalog gives us the friendly variant name. The list endpoint
  // returns raw `sku` strings (e.g. `mattress:cloud:king`); joining via this
  // map matches LogisticsWarehouse.tsx so the Items column reads as a real
  // product name instead of a code.
  const skuLabelMap = useMemo(() => {
    const m = new Map<string, ProductSkuDto>();
    for (const s of catalogQ.data?.skus ?? []) m.set(s.sku, s);
    return m;
  }, [catalogQ.data]);

  // Filter pipeline mirrors proto lines 430-446.
  const counts = useMemo(() => {
    const acc = { all: pos.length, open: 0, pickup: 0, received: 0 };
    for (const p of pos) {
      const st = poDisplayStatus(p);
      if (st !== "received" && st !== "cancelled") acc.open += 1;
      if (st === "received") acc.received += 1;
      if (
        p.sup_status === "ready_for_pickup" ||
        p.sup_status === "delivered" ||
        p.sup_status === "reassign_needed"
      ) {
        acc.pickup += 1;
      }
    }
    return acc;
  }, [pos]);

  const filtered = useMemo(() => {
    return pos.filter((p) => {
      const st = poDisplayStatus(p);
      if (filter === "all") return true;
      if (filter === "open") return st !== "received" && st !== "cancelled";
      if (filter === "received") return st === "received";
      if (filter === "pickup") {
        return (
          p.sup_status === "ready_for_pickup" ||
          p.sup_status === "delivered" ||
          p.sup_status === "reassign_needed"
        );
      }
      return true;
    });
  }, [pos, filter]);

  if (posQ.isLoading) {
    return (
      <div className="px-9 py-8 pb-14">
        <ProcurementSkeleton />
      </div>
    );
  }
  if (posQ.isError) {
    return (
      <div className="px-9 py-8 pb-14">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load purchase orders
          </div>
          <div className="text-[12px] text-base-700 mb-3">
            {(posQ.error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void posQ.refetch()}
            className="btn-secondary text-[11px] py-1.5 px-3"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-9 py-7 pb-14">
      {/* Header */}
      <div className="flex justify-between items-start mb-[22px]">
        <div>
          <div className="kicker">Procurement</div>
          <h1 className="font-display text-[32px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-bold text-base-900">
            Purchase orders
          </h1>
          <div className="font-body text-[13px] text-base-600 mt-1 max-w-[780px]">
            POs auto-issue on order shortage. <strong>Own-logistics</strong>{" "}
            suppliers ship & you attach DO. <strong>Factory-pickup</strong>{" "}
            suppliers notify ready, you assign a delivery partner, partner
            collects & delivers, then you receive.
          </div>
        </div>
        <button
          type="button"
          className="btn-primary text-[12px]"
          onClick={() => setCreatePrefill({})}
          data-testid="new-po-button"
        >
          + New PO
        </button>
      </div>

      {/* Filter chips */}
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

      {/* PO list table */}
      <div className="card p-0" data-testid="po-list-table">
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
              <div className="text-[12px] font-body">{supp?.name ?? "—"}</div>
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
                />
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-9 text-center text-base-500 text-[13px]">
            No POs in this filter.
          </div>
        )}
      </div>

      {createPrefill !== null && (
        <CreatePOModal
          prefill={createPrefill}
          onClose={() => setCreatePrefill(null)}
        />
      )}
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
      {detailPo && (
        <PoDetailModal
          po={detailPo}
          supplier={supplierById.get(detailPo.supplier_id)}
          warehouse={warehouseById.get(detailPo.warehouse_id)}
          onClose={() => setDetailPo(null)}
        />
      )}
      {/*
        ReassignWarehouseDialog deliberately NOT wired here per Loo D3=A.
        See components/ReassignWarehouseDialog.tsx header for the rationale —
        the trigger to open it ships in Phase 7 when partner-rejection state
        is available. The component file exists + has tests so Phase 7 can
        wire the action button without rebuilding the dialog.
        TODO phase-7-reassign-warehouse-wire
      */}
    </div>
  );
}

// Per-row action cell — picks the right CTA for an open PO.
//
// Default for any open PO is "Receive →" — Logistics can always press Receive,
// which opens ReceivePOModal (Q5 reform per v3 spec §7.3, applied by v3-S2.2).
// The previous gate on `sup_status === 'delivered'` blocked the own_logistics
// flow (HoOKkA Bedframe etc.) because supplier ships direct to WH and nobody
// flips a "delivered to WH" toggle, so sup_status never advances past
// in_production / shipped.
//
// The factory_pickup pickup-flight states keep their dedicated UI because
// Receive doesn't apply mid-pickup:
//   ready_for_pickup → "Assign partner" button (open AssignPickupDialog)
//   pickup_assigned  → "awaiting accept" text
//   pickup_accepted  → "pickup scheduled" text
//   picked_up        → "in transit" text
// Once the partner delivers the PO returns to the catch-all and Logistics
// presses Receive. Partner-side Receive (Phase 4.5 / v3-S7) will share the
// same RPC; this gate-drop is the v3-S2 logistics-only step.
function ActionCell({
  po,
  onReceive,
  onAssignPickup,
}: {
  po: LogisticsPoListRow;
  onReceive: () => void;
  onAssignPickup: () => void;
}) {
  const st = poDisplayStatus(po);
  const ss = po.sup_status;

  if (st === "received") {
    return null;
  }
  if (st === "cancelled") {
    return (
      <span className="font-mono text-[10px] text-base-500">cancelled</span>
    );
  }
  if (ss === "ready_for_pickup") {
    return (
      <button
        type="button"
        className="btn-primary text-[11px] py-1 px-2.5"
        onClick={(e) => {
          // Don't bubble to the row's onClick (opens PoDetailModal — C5.1).
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
  // v3-S2.2 catch-all: every other open-PO state (pending / acknowledged /
  // in_production / shipped / delivered / reassign_needed / null) gets the
  // Receive button. Was previously gated to sup_status === 'delivered' only.
  return (
    <button
      type="button"
      className="btn-secondary text-[11px] py-1 px-2.5"
      style={{ borderColor: "var(--success)", color: "var(--success)" }}
      onClick={(e) => {
        // Don't bubble to the row's onClick (opens PoDetailModal — C5.1).
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

function ProcurementSkeleton() {
  return (
    <div data-testid="procurement-skeleton">
      <div className="h-12 w-1/3 bg-base-100 rounded animate-pulse mb-6" />
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-7 w-24 bg-base-100 rounded animate-pulse"
          />
        ))}
      </div>
      <div className="bg-white border border-base-200 rounded-[4px]">
        {Array.from({ length: 5 }).map((_, i) => (
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
