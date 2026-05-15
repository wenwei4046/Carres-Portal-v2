import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

type InventoryRow = {
  sku: string;
  qty: number;
  warehouse_id: string;
  warehouse: { id: string; name: string; kind: string } | null;
  product: {
    sku: string;
    variant: string;
    variant_kind: string;
    price: number;
    model: { category: string; model_key: string; name: string } | null;
    supplier: { name: string } | null;
  } | null;
};

const CATEGORIES = [
  { value: "", label: "All categories" },
  { value: "mattress", label: "Mattress" },
  { value: "bedframe", label: "Bedframe" },
  { value: "sofa", label: "Sofa" },
];

export default function StockInventory() {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");

  const q = useQuery({
    queryKey: ["ops", "inventory", { category, search, warehouseFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (search) params.set("q", search);
      if (warehouseFilter) params.set("warehouse", warehouseFilter);
      const qs = params.toString();
      return apiFetch<{ items: InventoryRow[] }>(
        `/api/ops/inventory${qs ? `?${qs}` : ""}`,
      ).then((r) => r.items);
    },
    refetchInterval: 30000,
  });

  // Group by warehouse for summary
  const byWarehouse = useMemo(() => {
    const map = new Map<string, { name: string; total: number; skuCount: number }>();
    for (const row of q.data ?? []) {
      const wid = row.warehouse_id;
      const name = row.warehouse?.name ?? "(unknown)";
      const ex = map.get(wid) ?? { name, total: 0, skuCount: 0 };
      ex.total += row.qty;
      ex.skuCount += 1;
      map.set(wid, ex);
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v }));
  }, [q.data]);

  const warehouseOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const row of q.data ?? []) {
      if (row.warehouse_id) set.set(row.warehouse_id, row.warehouse?.name ?? row.warehouse_id);
    }
    return [...set.entries()];
  }, [q.data]);

  const totalUnits = (q.data ?? []).reduce((s, r) => s + (r.qty ?? 0), 0);
  const totalSkus = q.data?.length ?? 0;

  return (
    <div className="px-9 py-7">
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-1.5">
        Ops Panel
      </div>
      <h1 className="text-[28px] font-display font-bold text-base-900 mb-2">
        Stock Inventory
      </h1>
      <p className="text-[13px] text-base-600 mb-6 max-w-3xl">
        Live view of all warehouses. Same data wenwei's Logistics → Warehouse uses —
        any update there reflects here in 30 seconds. Read-only on this page; use
        Stock Transfer to move stock between warehouses.
      </p>

      {/* Warehouse summary tiles */}
      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: `repeat(${Math.max(1, byWarehouse.length + 1)}, minmax(0, 1fr))` }}>
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-1.5">
            All warehouses
          </div>
          <div className="text-[24px] font-display font-bold text-base-900 leading-tight">
            {q.isLoading ? "…" : totalUnits}
          </div>
          <div className="text-[10.5px] text-base-500 mt-1">
            {totalSkus} SKU rows · across {byWarehouse.length} location(s)
          </div>
        </div>
        {byWarehouse.map((w) => (
          <div key={w.id} className="card p-4">
            <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-1.5 truncate">
              {w.name}
            </div>
            <div className="text-[24px] font-display font-bold text-base-900 leading-tight">
              {w.total}
            </div>
            <div className="text-[10.5px] text-base-500 mt-1">{w.skuCount} SKUs</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2.5 items-center mb-4">
        <input
          type="search"
          placeholder="Search SKU or model name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1 max-w-md text-[12px] px-2.5 py-1"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input text-[12px] px-2.5 py-1"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={warehouseFilter}
          onChange={(e) => setWarehouseFilter(e.target.value)}
          className="input text-[12px] px-2.5 py-1"
        >
          <option value="">All warehouses</option>
          {warehouseOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {q.isLoading && (
        <div className="card p-9 text-center text-[12px] text-base-500 italic">Loading…</div>
      )}
      {q.isError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-[12px] text-destructive">
          Could not load inventory: {q.error instanceof Error ? q.error.message : "unknown"}
        </div>
      )}
      {q.data && q.data.length === 0 && (
        <div className="card p-9 text-center text-[12px] text-base-500 italic">
          No stock matches your filters.
        </div>
      )}

      {q.data && q.data.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div
            className="grid gap-3 px-4 py-2 bg-base-50 border-b border-base-200 text-[10px] uppercase tracking-wider text-base-500 font-semibold"
            style={{ gridTemplateColumns: "1.6fr 100px 90px 110px 130px 1fr" }}
          >
            <div>SKU / model</div>
            <div>Category</div>
            <div className="text-right">Qty</div>
            <div>Warehouse</div>
            <div>Supplier</div>
            <div>Variant</div>
          </div>
          <div className="max-h-[640px] overflow-auto">
            {q.data.map((row, i) => (
              <div
                key={`${row.sku}-${row.warehouse_id}-${i}`}
                className="grid gap-3 px-4 py-2 border-t border-base-100 text-[12px] items-center"
                style={{ gridTemplateColumns: "1.6fr 100px 90px 110px 130px 1fr" }}
              >
                <div className="min-w-0">
                  <div className="font-mono text-base-900 truncate" title={row.sku}>
                    {row.sku}
                  </div>
                  {row.product?.model?.name && (
                    <div className="text-[10.5px] text-base-500 truncate">
                      {row.product.model.name}
                    </div>
                  )}
                </div>
                <div className="text-[10.5px] uppercase tracking-wider text-base-600">
                  {row.product?.model?.category ?? "—"}
                </div>
                <div className="text-right font-mono font-semibold text-base-900">
                  {row.qty}
                </div>
                <div className="text-base-700 truncate" title={row.warehouse?.name ?? ""}>
                  {row.warehouse?.name ?? "—"}
                </div>
                <div className="text-base-700 truncate">{row.product?.supplier?.name ?? "—"}</div>
                <div className="text-base-700 truncate">{row.product?.variant ?? "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
