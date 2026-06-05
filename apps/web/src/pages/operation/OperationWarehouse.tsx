import { useEffect, useMemo, useState } from "react";
import {
  useCatalog,
  useOperationWarehouse,
  type LowStockStatus,
  type MovementsFilters,
  type WarehouseStockEntry,
} from "@/lib/queries";
import type { ProductCategory, ProductSkuDto } from "@carres/shared";
import AdjustStockModal from "./components/AdjustStockModal";
import ReserveDrilldownDialog from "./components/ReserveDrilldownDialog";
import SetThresholdDialog from "./components/SetThresholdDialog";

/**
 * OperationWarehouse — HQ stock balance per warehouse with category tabs +
 * status badges + manual adjust.
 *
 * Mirrors `reference/proto/operation-screens.jsx` `OperationWarehouse`
 * (lines 4-107):
 *   - Header (Warehouse kicker + "Stock balance" title + intro line about
 *     auto-deduct on delivery / auto-increment on PO receive)
 *   - Search SKU input (filter by SKU name / code substring within current
 *     category)
 *   - Movement log → button (deferred to M5 task 5; calls optional setTab).
 *   - Warehouse selector tile grid: one tile per warehouse, active = orange
 *     border + signature-50 fill, inactive = base-200 border + white. Each
 *     tile shows the warehouse name + address + units count + SKU count.
 *   - 3-tab category bar (Mattress / Bed frame / Sofa, matching DealerProducts
 *     icons) — active = base-900 fill / white text.
 *   - Stock table (4 cols): Product · This warehouse · All warehouses · Status.
 *     Row click = future "view log" prefill (M5.5). "+ Adjust" button per row
 *     opens AdjustStockModal pre-filled with sku + warehouseId + current qty.
 *   - Status badge: outline-style 9px UPPERCASE, color from low_stock_status.
 *     Plan §18.5 + comment in queries.ts:988-993:
 *       - "out" → danger (vivid red, proto #b91c1c)
 *       - "low" → warning (honey)
 *       - "ok"  → success (sage)
 *
 * Status logic: read from `useOperationWarehouse()` response directly. Per
 * the route comment (warehouse.ts:21-27) the "All warehouses" badge uses
 * `totalsBySku[sku].low_stock_status_aggregate`; the "This warehouse" cell
 * uses `byWarehouse[whId][i].low_stock_status`. We never re-compute on the
 * client.
 *
 * Categories: SKUs are formatted `category:model:variant` (per CreatePOModal
 * §65). The first segment maps 1-1 to ProductCategory and is the source of
 * truth for the tab filter (we don't trust catalog `models` for the table —
 * stock is keyed on the SKU code, not the model row).
 */
/** Pipeline v2 (C4) — `'reserved'` is a pseudo-category that switches the
 *  table semantics: instead of filtering by SKU prefix it shows every SKU in
 *  the active warehouse where `reserved > 0`, with a drill-down trigger that
 *  lists the orders holding the reserve. The other 3 tabs are 1-1 with
 *  ProductCategory and behave as before. */
type ActiveCat = ProductCategory | "reserved" | "alerts";

const CATEGORIES: { key: ProductCategory; label: string; icon: string }[] = [
  { key: "mattress", label: "Mattress", icon: "▭" },
  { key: "bedframe", label: "Bed frame", icon: "▤" },
  { key: "sofa", label: "Sofa", icon: "▦" },
];

interface Props {
  /** Optional shell-tab switcher (used by the bare "Movement log →" button to
   *  open the global movement log without any prefill). */
  setTab?: (t: string) => void;
  /** Optional prefilled jump to the movements tab — fired on row click +
   *  via the "Movement log →" button when we want to scope to this warehouse.
   *  M5.5 wiring per `reference/proto/operation.jsx` line 15+33. */
  goMovements?: (prefill?: Partial<MovementsFilters>) => void;
  /** Phase 10 (2026-06-05) — when true, the page opens on the "Alerts"
   *  pseudo-view (every low/out SKU at the active warehouse, across all
   *  categories), seeded by the dashboard StockAlertsTile via
   *  `OperationApp.goWarehouse({ alert: true })`. The shell unmounts this page
   *  when leaving the warehouse tab, so each fresh entry re-reads the prop — a
   *  plain sidebar / LowStock entry passes it falsy → the usual default.
   *  Closes `phase-4.5-chunk-2-alerts-tab-routing`. */
  initialAlert?: boolean;
}

function categoryForSku(sku: string): string | null {
  const head = (sku || "").split(":")[0] || "";
  if (head === "mattress" || head === "bedframe" || head === "sofa") {
    return head;
  }
  return null;
}

function statusColor(status: LowStockStatus): string {
  if (status === "out") return "var(--danger)";
  if (status === "low") return "var(--warning)";
  return "var(--success)";
}
function statusLabel(status: LowStockStatus): string {
  if (status === "out") return "Out";
  if (status === "low") return "Low";
  return "OK";
}

export default function OperationWarehouse({
  setTab,
  goMovements,
  initialAlert,
}: Props) {
  const warehouseQ = useOperationWarehouse();
  const catalogQ = useCatalog();

  const warehouses = warehouseQ.data?.warehouses ?? [];
  const byWarehouse = warehouseQ.data?.byWarehouse ?? {};
  const totalsBySku = warehouseQ.data?.totalsBySku ?? {};

  const [activeWh, setActiveWh] = useState<string | null>(null);
  // `initialAlert` lands the user on the cross-category Alerts view. Each entry
  // to the warehouse tab remounts this page (the shell conditionally renders
  // it), so the initial value is re-read fresh every time.
  const [activeCat, setActiveCat] = useState<ActiveCat>(
    initialAlert ? "alerts" : "mattress",
  );
  const [search, setSearch] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<{
    sku: string;
    warehouseId: string;
    warehouseName: string;
    currentQty: number;
    reservedQty: number;
    skuLabel?: string;
  } | null>(null);
  // Pipeline v2 (C4) — drill-down dialog state. Set when the user clicks a
  // row on the "Reserved" tab; cleared on Modal onClose.
  const [drilldownTarget, setDrilldownTarget] = useState<{
    sku: string;
    warehouseId: string;
    warehouseName: string;
    skuLabel?: string;
  } | null>(null);
  // T42-pass3-C1 — threshold editor target. Opens SetThresholdDialog with the
  // row's current low/high so the user can update without accidentally clearing
  // existing values (the dialog's empty-text → null parsing means a blind open
  // would imply "clear both" on save).
  const [thresholdTarget, setThresholdTarget] = useState<{
    sku: string;
    warehouseId: string;
    warehouseName: string;
    currentLow: number | null;
    currentHigh: number | null;
  } | null>(null);

  // Default the active warehouse to the first one as soon as data arrives.
  useEffect(() => {
    if (!activeWh && warehouses.length > 0) {
      setActiveWh(warehouses[0].id);
    }
  }, [activeWh, warehouses]);

  // SKU lookup: catalog gives us the friendly variant name. The warehouse
  // route only returns the raw `sku` string — joining via this map is how the
  // "Product" column shows "Carres Cloud · King" instead of the bare code.
  const skuLabelMap = useMemo(() => {
    const m = new Map<string, ProductSkuDto>();
    for (const s of catalogQ.data?.skus ?? []) m.set(s.sku, s);
    return m;
  }, [catalogQ.data]);

  // Model name lookup keyed on modelId so a SKU row can be rendered as
  // "Carres Cloud · King" (proto format) instead of just "King" (variant
  // alone) — `ProductSkuDto.variant` is only the size/preset segment.
  const modelNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const md of catalogQ.data?.models ?? []) m.set(md.id, md.name);
    return m;
  }, [catalogQ.data]);

  // Per-warehouse totals for the tile cards: total units summed across SKUs
  // currently in that warehouse + count of SKUs with qty > 0. Mirrors proto
  // lines 14-18.
  const warehouseTotals = useMemo(() => {
    return warehouses.map((w) => {
      const rows = byWarehouse[w.id] ?? [];
      let units = 0;
      let skuCount = 0;
      for (const r of rows) {
        units += r.qty;
        if (r.qty > 0) skuCount += 1;
      }
      return { warehouse: w, units, skuCount };
    });
  }, [warehouses, byWarehouse]);

  // Rows for the active warehouse, filtered by category + search.
  // Pipeline v2 (C4): when activeCat='reserved' we skip the category filter
  // entirely and instead surface every SKU at this warehouse with reserved>0.
  const filteredRows = useMemo(() => {
    if (!activeWh) return [] as WarehouseStockEntry[];
    const rows = byWarehouse[activeWh] ?? [];
    const baseRows =
      activeCat === "reserved"
        ? rows.filter((r) => r.reserved > 0)
        : activeCat === "alerts"
          ? rows.filter((r) => r.low_stock_status !== "ok")
          : rows.filter((r) => categoryForSku(r.sku) === activeCat);
    if (!search.trim()) return baseRows;
    const q = search.trim().toLowerCase();
    return baseRows.filter((r) => {
      if (r.sku.toLowerCase().includes(q)) return true;
      const label = skuLabelMap.get(r.sku)?.variant.toLowerCase() ?? "";
      return label.includes(q);
    });
  }, [activeWh, byWarehouse, activeCat, search, skuLabelMap]);

  if (warehouseQ.isLoading) {
    return (
      <div className="px-9 py-8 pb-14">
        <WarehouseSkeleton />
      </div>
    );
  }
  if (warehouseQ.isError) {
    return (
      <div className="px-9 py-8 pb-14">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load warehouse
          </div>
          <div className="text-[12px] text-base-700 mb-3">
            {(warehouseQ.error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void warehouseQ.refetch()}
            className="btn-secondary text-[11px] py-1.5 px-3"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const activeWarehouse = warehouses.find((w) => w.id === activeWh) ?? null;

  return (
    <div className="px-9 py-7 pb-14">
      {/* Header */}
      <div className="flex justify-between items-start mb-[22px] gap-4">
        <div>
          <div className="kicker">Warehouse</div>
          <h1 className="font-display text-[32px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-bold text-base-900">
            Stock balance
          </h1>
          <div className="font-body text-[13px] text-base-600 mt-1 max-w-[680px]">
            Auto-deducted on delivery, auto-incremented when supplier DO is
            received. Use <strong>Adjust</strong> for damage / loss / one-off
            corrections — every change writes to the movement log.
          </div>
        </div>
        <div className="flex gap-2 items-center flex-shrink-0">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU…"
            aria-label="Search SKU"
            className="px-3.5 py-2 border border-base-300 rounded-[4px] text-[13px] bg-white outline-none focus:border-base-500 min-w-[220px]"
          />
          <button
            type="button"
            className="btn-secondary text-[12px] py-2 px-3 whitespace-nowrap"
            onClick={() => {
              // Prefer the prefilled jump (scopes to this warehouse) when the
              // shell wired it; fall back to plain tab switch otherwise so
              // existing tests + the no-prefill case keep working.
              if (goMovements) goMovements(activeWh ? { warehouseId: activeWh } : undefined);
              else setTab?.("movements");
            }}
            data-testid="warehouse-movement-log-button"
          >
            ⇅ Movement log →
          </button>
        </div>
      </div>

      {/* Warehouse selector tiles */}
      <div
        className="grid gap-3 mb-[22px]"
        style={{
          gridTemplateColumns: warehouses.length
            ? `repeat(${warehouses.length}, minmax(0, 1fr))`
            : "1fr",
        }}
        role="tablist"
        aria-label="Warehouse"
        data-testid="warehouse-tiles"
      >
        {warehouseTotals.map((t) => {
          const isActive = activeWh === t.warehouse.id;
          return (
            <button
              key={t.warehouse.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveWh(t.warehouse.id)}
              data-testid={`warehouse-tile-${t.warehouse.id}`}
              className="text-left rounded-[6px] p-[18px] transition-colors"
              style={{
                border: `1.5px solid ${isActive ? "var(--terracotta)" : "var(--base-200)"}`,
                background: isActive ? "var(--signature-50)" : "#fff",
              }}
            >
              <div className="font-ui text-[14px] font-semibold text-base-900">
                {t.warehouse.name}
              </div>
              <div className="font-body text-[11px] text-base-500 mt-0.5">
                {t.warehouse.address ?? "—"}
              </div>
              <div className="flex gap-[22px] mt-3">
                <div>
                  <div className="font-mono text-[26px] font-semibold leading-none text-base-900">
                    {t.units}
                  </div>
                  <div
                    className="font-body text-[10px] text-base-500 mt-0.5"
                    style={{
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    units
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[26px] font-semibold leading-none text-base-900">
                    {t.skuCount}
                  </div>
                  <div
                    className="font-body text-[10px] text-base-500 mt-0.5"
                    style={{
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    SKUs
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        {warehouses.length === 0 && (
          <div className="rounded-[6px] border border-base-200 bg-white p-6 text-center text-[13px] text-base-500">
            No warehouses configured yet.
          </div>
        )}
      </div>

      {/* Category tabs */}
      <div
        className="flex gap-2 mb-[18px] flex-wrap"
        role="tablist"
        aria-label="Category"
      >
        {CATEGORIES.map((c) => {
          const active = activeCat === c.key;
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveCat(c.key)}
              data-testid={`warehouse-cat-${c.key}`}
              className={[
                "px-3.5 py-2 rounded-[4px] text-[12px] transition-colors border flex gap-2 items-center",
                active
                  ? "bg-base-900 text-white border-base-900 font-semibold"
                  : "bg-white text-base-700 border-base-200 font-medium hover:border-base-400",
              ].join(" ")}
            >
              <span className="text-[14px]">{c.icon}</span>
              <span>{c.label}</span>
            </button>
          );
        })}
        {/* Phase 10 (2026-06-05) — Alerts pseudo-tab. Like Reserved it bypasses
            the SKU-category filter; instead it surfaces every SKU at the active
            warehouse whose per-warehouse status is low/out. Danger color hint
            (vs Reserved's warning) signals severity. Seeded on mount by the
            dashboard StockAlertsTile deep-link (`initialAlert`). Closes
            `phase-4.5-chunk-2-alerts-tab-routing`. */}
        <button
          type="button"
          role="tab"
          aria-selected={activeCat === "alerts"}
          onClick={() => setActiveCat("alerts")}
          data-testid="warehouse-cat-alerts"
          className={[
            "px-3.5 py-2 rounded-[4px] text-[12px] transition-colors border flex gap-2 items-center",
            activeCat === "alerts"
              ? "bg-base-900 text-white border-base-900 font-semibold"
              : "bg-white text-danger border-danger font-medium hover:bg-base-50",
          ].join(" ")}
        >
          <span className="text-[14px]">⚠</span>
          <span>Alerts</span>
        </button>
        {/* Pipeline v2 (C4) — Reserved pseudo-tab. Distinct color hint
            (warning border when inactive) signals it's not just another
            category but a different view. */}
        <button
          type="button"
          role="tab"
          aria-selected={activeCat === "reserved"}
          onClick={() => setActiveCat("reserved")}
          data-testid="warehouse-cat-reserved"
          className={[
            "px-3.5 py-2 rounded-[4px] text-[12px] transition-colors border flex gap-2 items-center",
            activeCat === "reserved"
              ? "bg-base-900 text-white border-base-900 font-semibold"
              : "bg-white text-warning border-warning font-medium hover:bg-warning-soft",
          ].join(" ")}
        >
          <span className="text-[14px]">⊙</span>
          <span>Reserved</span>
        </button>
      </div>

      {/* Stock table — two layouts: stock view (default) vs reserved view (C4). */}
      {activeCat === "reserved" ? (
        <div className="card p-0" data-testid="warehouse-reserved-table">
          <div
            className="grid items-center gap-4 px-[18px] py-3 bg-base-50 border-b border-base-200"
            style={{
              gridTemplateColumns: "minmax(0,2.4fr) 150px 150px 120px",
            }}
          >
            <div className="label">Product</div>
            <div className="label text-right">Reserved here</div>
            <div className="label text-right">All warehouses</div>
            <div className="label text-right" />
          </div>
          {!activeWarehouse ? (
            <div className="p-9 text-center text-base-500 text-[13px]">
              Pick a warehouse to view reserved stock.
            </div>
          ) : filteredRows.length === 0 ? (
            <div
              className="p-9 text-center text-base-500 text-[13px]"
              data-testid="warehouse-reserved-empty"
            >
              {search
                ? `No reserved SKUs match "${search}" at ${activeWarehouse.name}.`
                : `No SKUs are currently reserved at ${activeWarehouse.name}.`}
            </div>
          ) : (
            filteredRows.map((row) => {
              const totals = totalsBySku[row.sku];
              const totalAllReserved = totals?.total_reserved ?? row.reserved;
              const skuMeta = skuLabelMap.get(row.sku);
              const modelName = skuMeta ? modelNameById.get(skuMeta.modelId) : undefined;
              const friendly =
                modelName && skuMeta
                  ? `${modelName} · ${skuMeta.variant}`
                  : skuMeta?.variant ?? row.sku;
              return (
                <div
                  key={row.sku}
                  data-testid={`warehouse-reserved-row-${row.sku}`}
                  className="grid items-center gap-4 px-[18px] py-3 border-t border-base-100"
                  style={{
                    gridTemplateColumns: "minmax(0,2.4fr) 150px 150px 120px",
                  }}
                >
                  <div className="min-w-0">
                    <div className="font-body text-[13px] truncate">
                      {friendly}
                    </div>
                  </div>
                  <div className="font-mono text-[13px] text-right font-semibold">
                    {row.reserved}
                  </div>
                  <div className="font-mono text-[13px] text-right text-base-600">
                    {totalAllReserved}
                  </div>
                  <div className="text-right">
                    <button
                      type="button"
                      className="btn-secondary text-[11px] py-1 px-2.5"
                      onClick={() =>
                        setDrilldownTarget({
                          sku: row.sku,
                          warehouseId: activeWarehouse.id,
                          warehouseName: activeWarehouse.name,
                          skuLabel: skuMeta
                            ? modelName
                              ? `${modelName} · ${skuMeta.variant}`
                              : skuMeta.variant
                            : undefined,
                        })
                      }
                      data-testid={`warehouse-reserved-drilldown-${row.sku}`}
                    >
                      View orders →
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="card p-0" data-testid="warehouse-stock-table">
          <div
            className="grid items-center gap-4 px-[18px] py-3 bg-base-50 border-b border-base-200"
            style={{
              gridTemplateColumns: "minmax(0,2.6fr) 120px 120px 96px 200px",
            }}
          >
            <div className="label">Product</div>
            <div className="label text-right">This warehouse</div>
            <div className="label text-right">All warehouses</div>
            <div className="label text-right">Status</div>
            <div className="label text-right" />
          </div>

          {!activeWarehouse ? (
            <div className="p-9 text-center text-base-500 text-[13px]">
              Pick a warehouse to view stock.
            </div>
          ) : filteredRows.length === 0 ? (
            <div
              className="p-9 text-center text-base-500 text-[13px]"
              data-testid="warehouse-empty"
            >
              {activeCat === "alerts"
                ? search
                  ? `No low-stock alerts match "${search}" at ${activeWarehouse.name}.`
                  : `No low-stock alerts at ${activeWarehouse.name} — everything's healthy.`
                : search
                  ? `No SKUs match "${search}" in ${activeCat}.`
                  : `No ${activeCat} stock at ${activeWarehouse.name} yet.`}
            </div>
          ) : (
            filteredRows.map((row) => {
              const totals = totalsBySku[row.sku];
              const totalAll = totals?.total_qty ?? row.qty;
              const aggStatus = totals?.low_stock_status_aggregate ?? row.low_stock_status;
              const skuMeta = skuLabelMap.get(row.sku);
              const modelName = skuMeta ? modelNameById.get(skuMeta.modelId) : undefined;
              // Proto format: "{Model name} · {variant}" — e.g. "Carres Cloud
              // · Single". Falls back to variant-only or raw SKU if catalog
              // hasn't been loaded yet.
              const friendly = modelName && skuMeta
                ? `${modelName} · ${skuMeta.variant}`
                : (skuMeta?.variant ?? row.sku);
              return (
                <div
                  key={row.sku}
                  data-testid={`warehouse-row-${row.sku}`}
                  className="grid items-center gap-4 px-[18px] py-3 border-t border-base-100"
                  style={{
                    gridTemplateColumns: "minmax(0,2.6fr) 120px 120px 96px 200px",
                  }}
                >
                  <div className="min-w-0">
                    {goMovements ? (
                      <button
                        type="button"
                        className="group text-left w-full hover:text-primary transition-colors"
                        style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
                        onClick={() =>
                          goMovements({ sku: row.sku, warehouseId: activeWarehouse.id })
                        }
                        data-testid={`warehouse-row-link-${row.sku}`}
                        title="View movement log for this SKU"
                      >
                        <span className="block font-body text-[13px] truncate">
                          {friendly}
                        </span>
                        <span
                          className="block text-[10px] text-base-400 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-hidden="true"
                        >
                          view log →
                        </span>
                      </button>
                    ) : (
                      <div className="font-body text-[13px] truncate">{friendly}</div>
                    )}
                  </div>
                  <div className="font-mono text-[13px] text-right font-semibold">
                    {row.qty}
                  </div>
                  <div className="font-mono text-[13px] text-right text-base-600">
                    {totalAll}
                  </div>
                  <div className="text-right">
                    <span
                      className="font-ui font-bold uppercase border rounded-[3px] inline-block"
                      data-testid={`warehouse-badge-${row.sku}`}
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.12em",
                        color: statusColor(aggStatus),
                        borderColor: statusColor(aggStatus),
                        padding: "3px 7px",
                      }}
                    >
                      {statusLabel(aggStatus)}
                    </span>
                  </div>
                  <div className="flex justify-end gap-1.5 flex-wrap">
                    {/* T42-pass3-C1 — opens SetThresholdDialog with row's
                        current low/high prefilled (NULLs are fine; the dialog
                        renders empty inputs only when both are NULL). */}
                    <button
                      type="button"
                      className="btn-secondary text-[11px] py-1 px-2.5"
                      onClick={() =>
                        setThresholdTarget({
                          sku: row.sku,
                          warehouseId: activeWarehouse.id,
                          warehouseName: activeWarehouse.name,
                          currentLow: row.low_threshold,
                          currentHigh: row.high_threshold,
                        })
                      }
                      data-testid={`warehouse-threshold-${row.sku}`}
                      title={
                        row.low_threshold === null && row.high_threshold === null
                          ? "No threshold set — click to configure"
                          : `Low ${row.low_threshold ?? "—"} / High ${row.high_threshold ?? "—"}`
                      }
                    >
                      ⚙ Threshold
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-[11px] py-1 px-2.5"
                      onClick={() =>
                        setAdjustTarget({
                          sku: row.sku,
                          warehouseId: activeWarehouse.id,
                          warehouseName: activeWarehouse.name,
                          currentQty: row.qty,
                          reservedQty: row.reserved,
                          skuLabel: skuMeta?.variant,
                        })
                      }
                      data-testid={`warehouse-adjust-${row.sku}`}
                    >
                      + Adjust
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {adjustTarget && (
        <AdjustStockModal
          sku={adjustTarget.sku}
          warehouseId={adjustTarget.warehouseId}
          warehouseName={adjustTarget.warehouseName}
          currentQty={adjustTarget.currentQty}
          reservedQty={adjustTarget.reservedQty}
          skuLabel={adjustTarget.skuLabel}
          onClose={() => setAdjustTarget(null)}
        />
      )}

      {drilldownTarget && (
        <ReserveDrilldownDialog
          sku={drilldownTarget.sku}
          warehouseId={drilldownTarget.warehouseId}
          warehouseName={drilldownTarget.warehouseName}
          skuLabel={drilldownTarget.skuLabel}
          onClose={() => setDrilldownTarget(null)}
        />
      )}

      {/* T42-pass3-C1 — threshold editor. Opens with current low/high so the
           user sees + edits the existing values instead of accidentally
           clearing them. Cache invalidation lives inside SetThresholdDialog
           (warehouse + stockAlerts queries). */}
      {thresholdTarget && (
        <SetThresholdDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setThresholdTarget(null);
          }}
          warehouseId={thresholdTarget.warehouseId}
          warehouseName={thresholdTarget.warehouseName}
          sku={thresholdTarget.sku}
          currentLow={thresholdTarget.currentLow}
          currentHigh={thresholdTarget.currentHigh}
        />
      )}
    </div>
  );
}

function WarehouseSkeleton() {
  return (
    <div data-testid="warehouse-skeleton">
      <div className="h-12 w-1/3 bg-base-100 rounded animate-pulse mb-6" />
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-24 bg-base-100 rounded-[6px] animate-pulse"
          />
        ))}
      </div>
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-28 bg-base-100 rounded animate-pulse"
          />
        ))}
      </div>
      <div className="bg-white border border-base-200 rounded-[4px]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-14 border-b border-base-100 px-4 flex items-center gap-3"
          >
            <div className="h-3 flex-1 bg-base-50 rounded animate-pulse" />
            <div className="h-3 w-16 bg-base-50 rounded animate-pulse" />
            <div className="h-3 w-16 bg-base-50 rounded animate-pulse" />
            <div className="h-6 w-12 bg-base-50 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
