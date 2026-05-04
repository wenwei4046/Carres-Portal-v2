import { useEffect, useMemo, useState } from "react";
import {
  useCatalog,
  useLogisticsWarehouse,
  type LowStockStatus,
  type MovementsFilters,
  type WarehouseStockEntry,
} from "@/lib/queries";
import type { ProductCategory, ProductSkuDto } from "@carres/shared";
import AdjustStockModal from "./components/AdjustStockModal";

/**
 * LogisticsWarehouse — HQ stock balance per warehouse with category tabs +
 * status badges + manual adjust.
 *
 * Mirrors `reference/proto/logistics-screens.jsx` `LogisticsWarehouse`
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
 * Status logic: read from `useLogisticsWarehouse()` response directly. Per
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
   *  M5.5 wiring per `reference/proto/logistics.jsx` line 15+33. */
  goMovements?: (prefill?: Partial<MovementsFilters>) => void;
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

export default function LogisticsWarehouse({ setTab, goMovements }: Props) {
  const warehouseQ = useLogisticsWarehouse();
  const catalogQ = useCatalog();

  const warehouses = warehouseQ.data?.warehouses ?? [];
  const byWarehouse = warehouseQ.data?.byWarehouse ?? {};
  const totalsBySku = warehouseQ.data?.totalsBySku ?? {};

  const [activeWh, setActiveWh] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<ProductCategory>("mattress");
  const [search, setSearch] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<{
    sku: string;
    warehouseId: string;
    warehouseName: string;
    currentQty: number;
    reservedQty: number;
    skuLabel?: string;
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
  const filteredRows = useMemo(() => {
    if (!activeWh) return [] as WarehouseStockEntry[];
    const rows = byWarehouse[activeWh] ?? [];
    const inCat = rows.filter((r) => categoryForSku(r.sku) === activeCat);
    if (!search.trim()) return inCat;
    const q = search.trim().toLowerCase();
    return inCat.filter((r) => {
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
      </div>

      {/* Stock table */}
      <div className="card p-0" data-testid="warehouse-stock-table">
        <div
          className="grid items-center gap-4 px-[18px] py-3 bg-base-50 border-b border-base-200"
          style={{
            gridTemplateColumns: "minmax(0,2.4fr) 130px 130px 110px 96px",
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
            {search
              ? `No SKUs match "${search}" in ${activeCat}.`
              : `No ${activeCat} stock at ${activeWarehouse.name} yet.`}
          </div>
        ) : (
          filteredRows.map((row) => {
            const totals = totalsBySku[row.sku];
            const totalAll = totals?.total_qty ?? row.qty;
            const aggStatus = totals?.low_stock_status_aggregate ?? row.low_stock_status;
            const skuMeta = skuLabelMap.get(row.sku);
            const friendly = skuMeta?.variant ?? row.sku;
            return (
              <div
                key={row.sku}
                data-testid={`warehouse-row-${row.sku}`}
                className="grid items-center gap-4 px-[18px] py-3 border-t border-base-100"
                style={{
                  gridTemplateColumns: "minmax(0,2.4fr) 130px 130px 110px 96px",
                }}
              >
                <div className="min-w-0">
                  {goMovements ? (
                    <button
                      type="button"
                      className="text-left w-full font-body text-[13px] truncate hover:text-primary transition-colors"
                      style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
                      onClick={() =>
                        goMovements({ sku: row.sku, warehouseId: activeWarehouse.id })
                      }
                      data-testid={`warehouse-row-link-${row.sku}`}
                      title="View movement log for this SKU"
                    >
                      <span className="font-body text-[13px] truncate inline-block max-w-full">
                        {friendly}
                      </span>
                      <span
                        className="text-[10px] text-base-400 ml-1.5"
                        aria-hidden="true"
                      >
                        view log →
                      </span>
                    </button>
                  ) : (
                    <div className="font-body text-[13px] truncate">{friendly}</div>
                  )}
                  {skuMeta ? (
                    <div className="font-mono text-[10px] text-base-500 mt-0.5 truncate">
                      {row.sku}
                    </div>
                  ) : null}
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
                <div className="text-right">
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
