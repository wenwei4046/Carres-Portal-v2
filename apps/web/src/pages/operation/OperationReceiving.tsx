import { useMemo, useState } from "react";
import { poReceivingProgress, type PoReceivingState } from "@carres/shared";
import {
  useOperationPos,
  useOperationSuppliers,
  useOperationWarehouse,
  type SupplierRow,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import ReceivePOModal from "./components/ReceivePOModal";
import PurchasingTabs from "./PurchasingTabs";

/**
 * OperationReceiving — the GRN (goods-received) station (P3 of
 * project-orders-control-spec; Jess redesign Q3a=B menu split).
 *
 * Splits the old "Receiving"(=Procurement) menu in two: PO create/manage stays
 * on the **Purchase Order** menu (TabbedProcurementShell), and THIS page is the
 * pure **待收 queue** — open POs whose goods come into Carres Klang. The
 * operator finds the PO, hits Receive, and books the units in via the existing
 * ReceivePOModal (per-line tick + DO upload + signed checkbox → the v3
 * operation_receive_po_with_do RPC; ops_stock_items incoming→free + stock_balances).
 *
 * GRN scope: goods INTO Carres Klang only. AL/HOUZS goods (mattress→HOUZS
 * Balakong, sofa→at OHANA) never hit Klang, so they're tracked by Stock
 * Location, not a Klang GRN. Current master data has Carres Klang as the only
 * own warehouse, so every open PO shown here is Klang-bound; when multi-location
 * lands (P4) this list filters to own-warehouse POs.
 *
 * 2026-07-27 (R1 of the receiving & claim queue): the row stops being a binary
 * "Receive → / Done". A PROGRESS column reads the four per-line numbers through
 * the shared `poReceivingProgress` and says, in words, where the delivery is —
 * In transit · Partially received (8/10) · Fully received · Receiving issue —
 * with the outstanding qty underneath it ("2 units pending delivery"). The
 * point of the card: 还有 2 张没到 must be readable from this list without
 * opening anything. The supplier's own Stage pill stays — it is a different
 * fact (what the supplier says) from what we actually counted.
 */

type Tab = "to_receive" | "received" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "to_receive", label: "To receive" },
  { key: "received", label: "Received" },
  { key: "all", label: "All" },
];

/** Humanise a PO sup_status into a short stage label for the queue. */
const SUP_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_production: "In production",
  ready_confirm_sent: "Awaiting accept",
  ready_for_pickup: "Ready",
  partially_shipped: "Partial",
  delivered: "Arrived",
  reassign_needed: "Reassign",
};

function supStatusLabel(s: string): string {
  return (
    SUP_STATUS_LABEL[s] ??
    s.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase())
  );
}

/** PO sup_status → v17 pill. pending/in_production = amber (waiting);
 *  ready_for_pickup/delivered = green; reassign = red. */
const SUP_STATUS_PILL: Record<string, string> = {
  pending: "pill-warning",
  in_production: "pill-warning",
  ready_confirm_sent: "pill-sent",
  ready_for_pickup: "pill-confirmed",
  partially_shipped: "pill-collected",
  delivered: "pill-confirmed",
  reassign_needed: "pill-overdue",
};
function supStatusPill(s: string): string {
  return SUP_STATUS_PILL[s] ?? "pill-neutral";
}

/** R1 — progress state → v17 pill. Grey while nothing has landed, amber while
 *  half-landed, green when settled, red when something is wrong. Colour lives
 *  here (design is the web's job); the shared module owns the state + words. */
const PROGRESS_PILL: Record<PoReceivingState, string> = {
  in_transit: "pill-neutral",
  partially_received: "pill-warning",
  fully_received: "pill-confirmed",
  receiving_issue: "pill-overdue",
};

export default function OperationReceiving() {
  const [tab, setTab] = useState<Tab>("to_receive");
  const [search, setSearch] = useState("");
  const [receivePoId, setReceivePoId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useOperationPos();
  const suppliersQ = useOperationSuppliers();
  const warehouseQ = useOperationWarehouse();

  const supplierById = useMemo(() => {
    const m = new Map<string, SupplierRow>();
    for (const s of suppliersQ.data?.suppliers ?? []) m.set(s.id, s);
    return m;
  }, [suppliersQ.data]);

  const warehouseById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; address: string | null }>();
    for (const w of warehouseQ.data?.warehouses ?? []) m.set(w.id, w);
    return m;
  }, [warehouseQ.data]);

  // P4 (multi-location) — GRN only covers goods INTO an OWN warehouse
  // (owning_partner_id NULL, e.g. Carres Klang). LP-owned warehouses (HOUZS
  // Balakong, OHANA) never hit a Klang GRN — goods there are tracked by the
  // order's Stock Location instead. The own-WH filter only activates once an
  // LP-owned warehouse actually exists; until then every PO is own-WH so the
  // queue is unchanged (current master data has no LP warehouse).
  const ownWarehouseIds = useMemo(() => {
    const s = new Set<string>();
    for (const w of warehouseQ.data?.warehouses ?? [])
      if (w.owning_partner_id == null) s.add(w.id);
    return s;
  }, [warehouseQ.data]);
  const hasLpWarehouse = useMemo(
    () =>
      (warehouseQ.data?.warehouses ?? []).some(
        (w) => w.owning_partner_id != null,
      ),
    [warehouseQ.data],
  );

  const pos = useMemo(() => data?.pos ?? [], [data]);

  // Cancelled POs never belong in a receive queue; then narrow to own-warehouse
  // POs (GRN scope) once any LP-owned warehouse exists.
  const live = useMemo(() => {
    const notCancelled = pos.filter((p) => p.status !== "cancelled");
    return hasLpWarehouse
      ? notCancelled.filter((p) => ownWarehouseIds.has(p.warehouse_id))
      : notCancelled;
  }, [pos, hasLpWarehouse, ownWarehouseIds]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { to_receive: 0, received: 0, all: live.length };
    for (const p of live) {
      if (p.status === "received") c.received += 1;
      else c.to_receive += 1;
    }
    return c;
  }, [live]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return live.filter((p) => {
      if (tab === "to_receive" && p.status === "received") return false;
      if (tab === "received" && p.status !== "received") return false;
      if (!q) return true;
      const supName = supplierById.get(p.supplier_id)?.name ?? "";
      return (
        p.id.toLowerCase().includes(q) || supName.toLowerCase().includes(q)
      );
    });
  }, [live, tab, search, supplierById]);

  const receivePo = receivePoId
    ? live.find((p) => p.id === receivePoId) ?? null
    : null;

  if (isLoading) {
    return (
      <>
        <PurchasingTabs />
        <div className="px-9 py-8 pb-14">
        <div data-testid="operation-receiving-skeleton">
          <div className="h-9 w-1/3 bg-base-100 rounded animate-pulse mb-6" />
          <div className="bg-white border border-base-200 rounded">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-14 border-b border-base-100 animate-pulse bg-base-50/40"
              />
            ))}
          </div>
        </div>
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <PurchasingTabs />
        <div className="px-9 py-8 pb-14">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load purchase orders
          </div>
          <div className="text-[12px] text-base-700 mb-3">
            {(error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="btn-secondary text-[11px] py-1.5 px-3"
          >
            Retry
          </button>
        </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PurchasingTabs />
      <div className="px-9 py-8 pb-14" data-testid="operation-receiving">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-[18px] flex-wrap">
        <div>
          <div className="kicker">HQ · Operations</div>
          <h1 className="t-h1 font-display mt-1.5">
            Receiving
          </h1>
          <div className="text-[13px] text-base-600 mt-1.5">
            Receive goods into Carres Klang (GRN). Find the PO, book the units in.
          </div>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="PO number or supplier…"
          className="w-[230px] px-3 py-2 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700"
        />
      </div>

      {/* Status tabs */}
      <div
        className="flex gap-1 p-1 bg-base-100 rounded mb-3.5 w-fit max-w-full overflow-auto"
        role="tablist"
        aria-label="Receiving status"
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-[12px] rounded cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                active
                  ? "bg-white text-base-900 font-semibold shadow-sm"
                  : "text-base-600 font-medium hover:text-base-900"
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-px rounded-full ${
                  active ? "bg-base-100 text-base-700" : "bg-base-200 text-base-500"
                }`}
              >
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white border border-base-200 rounded overflow-auto">
        <table
          className="w-full border-collapse text-[13px] [&_tbody_tr:nth-child(even)]:bg-base-100/70"
          style={{ minWidth: 920 }}
        >
          <thead className="bg-base-700 border-b-2 border-primary text-white">
            <tr>
              <Th>PO</Th>
              <Th>Supplier</Th>
              <Th>Warehouse</Th>
              <Th>Progress</Th>
              <Th>ETA</Th>
              <Th>Stage</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="p-12 text-center text-[12px] text-base-500"
                >
                  No purchase orders in this tab.
                </td>
              </tr>
            )}
            {visible.map((po) => {
              const progress = poReceivingProgress(po.purchase_order_lines);
              const supName = supplierById.get(po.supplier_id)?.name ?? "—";
              const whName = warehouseById.get(po.warehouse_id)?.name ?? "—";
              const done = po.status === "received";
              return (
                <tr
                  key={po.id}
                  className="border-t border-base-100 align-top hover:bg-primary/5"
                  data-testid="receiving-row"
                >
                  <td className="px-4 py-3 whitespace-nowrap font-mono font-semibold text-base-900">
                    {po.id}
                  </td>
                  <td className="px-4 py-3 text-base-800">{supName}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-base-700">
                    {whName}
                  </td>
                  {/* R1 — the whole point of the card: what still has to
                      arrive is readable here, without opening anything. */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`pill ${PROGRESS_PILL[progress.state]}`}
                      data-testid={`receiving-progress-${po.id}`}
                    >
                      {progress.label}
                    </span>
                    {progress.pendingLabel && (
                      <div className="text-[11px] text-base-600 mt-1">
                        {progress.pendingLabel}
                      </div>
                    )}
                    {progress.issueLabel && (
                      <div className="text-[11px] text-danger mt-0.5">
                        {progress.issueLabel}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-base-700">
                    {po.eta_date ? (
                      fmtDate(po.eta_date)
                    ) : (
                      <span className="text-base-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`pill ${done ? "pill-confirmed" : supStatusPill(po.sup_status)}`}
                    >
                      {done ? "Received" : supStatusLabel(po.sup_status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {done ? (
                      <span className="inline-flex items-center gap-1 text-[12px] text-success">
                        <span className="w-[7px] h-[7px] rounded-full bg-success" />
                        Done
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setReceivePoId(po.id)}
                        className="btn-primary text-[11px] py-1.5 px-3"
                        data-testid={`receive-${po.id}`}
                      >
                        Receive →
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {receivePo && (
        <ReceivePOModal
          po={receivePo}
          supplier={supplierById.get(receivePo.supplier_id)}
          warehouse={warehouseById.get(receivePo.warehouse_id)}
          onClose={() => setReceivePoId(null)}
        />
      )}
      </div>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.02em] text-white text-left">
      {children}
    </th>
  );
}
