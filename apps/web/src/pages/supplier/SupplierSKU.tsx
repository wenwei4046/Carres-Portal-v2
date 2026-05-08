import { useMemo, useState } from "react";
import {
  useSupplierProducts,
  useSupplierDemand,
  type SupplierProductRow,
} from "@/lib/queries";

/**
 * Supplier · Total SKU — Phase 6 V1.
 *
 * Visual reference: `reference/proto/supplier-pages.jsx:786-960`.
 *
 * Cross-reference table (Carres SKU + Product + Variant + Open demand +
 * Price). Category filter + search. Open demand column joined from
 * useSupplierDemand hook.
 *
 * Skipped vs proto: "Supplier SKU" code column (proto synthesizes a fake
 * code from the Carres SKU; real systems would map this in a table — V1
 * doesn't have that table, so the column is omitted).
 */
export default function SupplierSKU() {
  const products = useSupplierProducts();
  const demand = useSupplierDemand();

  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<string | "all">("all");

  const rows: SupplierProductRow[] = products.data ?? [];
  const demandMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of demand.data ?? []) m.set(d.sku, d.openQty);
    return m;
  }, [demand.data]);

  const cats = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.category);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (catFilter !== "all" && r.category !== catFilter) return false;
      if (!q) return true;
      return (
        r.sku.toLowerCase().includes(q) ||
        r.model?.name.toLowerCase().includes(q) ||
        r.variant.toLowerCase().includes(q)
      );
    });
  }, [rows, catFilter, query]);

  const byCat = useMemo(() => {
    const out: Record<string, SupplierProductRow[]> = {};
    for (const r of filtered) {
      if (!out[r.category]) out[r.category] = [];
      out[r.category].push(r);
    }
    return out;
  }, [filtered]);

  const totalSkus = rows.length;
  const totalModels = useMemo(
    () => new Set(rows.map((r) => `${r.category}:${r.model_key}`)).size,
    [rows],
  );
  const totalDemand = useMemo(
    () => [...demandMap.values()].reduce((s, v) => s + v, 0),
    [demandMap],
  );

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="mb-7">
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Catalog
        </div>
        <h1 className="font-display text-[32px] mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
          Total SKU
        </h1>
        <div className="text-[13px] text-muted-foreground">
          All SKUs you supply · Carres canonical codes used across the portal.
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3.5 mb-5">
        <Kpi
          label="Total SKUs"
          value={totalSkus}
          hint={`Across ${cats.length} categor${cats.length === 1 ? "y" : "ies"}`}
        />
        <Kpi label="Models covered" value={totalModels} hint="Unique product models" />
        <Kpi
          label="Open demand"
          value={totalDemand}
          hint="Units across active POs"
        />
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search SKU, model, variant…"
          className="flex-1 min-w-[220px] px-3.5 py-2.5 border border-border rounded text-[13px] bg-card"
        />
        <div className="flex gap-1 px-1 py-0.5 bg-card border border-border rounded">
          <FilterChip
            active={catFilter === "all"}
            onClick={() => setCatFilter("all")}
          >
            All
          </FilterChip>
          {cats.map((c) => (
            <FilterChip
              key={c}
              active={catFilter === c}
              onClick={() => setCatFilter(c)}
            >
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </FilterChip>
          ))}
        </div>
      </div>

      <div
        className="border border-border rounded-md bg-card overflow-hidden"
        data-testid="supplier-sku-table"
      >
        <div className="grid grid-cols-[minmax(200px,2fr)_minmax(180px,1.5fr)_100px_100px_100px] gap-4 px-5 py-3.5 border-b border-border bg-secondary/30">
          <HeaderCell>Carres SKU</HeaderCell>
          <HeaderCell>Product</HeaderCell>
          <HeaderCell align="right">Variant</HeaderCell>
          <HeaderCell align="right">Open demand</HeaderCell>
          <HeaderCell align="right">Price (RM)</HeaderCell>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
            No SKUs match.
          </div>
        ) : (
          Object.entries(byCat).map(([cat, items]) => (
            <div key={cat}>
              <div className="px-5 py-2.5 border-b border-border text-[11px] font-bold uppercase tracking-[0.18em] text-primary flex items-center gap-2.5 bg-card">
                <span>{cat}</span>
                <span className="text-muted-foreground font-medium tracking-normal normal-case">
                  · {items.length} SKU{items.length === 1 ? "" : "s"}
                </span>
              </div>
              {items.map((r) => {
                const d = demandMap.get(r.sku) ?? 0;
                return (
                  <div
                    key={r.sku}
                    className="grid grid-cols-[minmax(200px,2fr)_minmax(180px,1.5fr)_100px_100px_100px] gap-4 px-5 py-3 border-b border-border items-center bg-card"
                  >
                    <div className="font-mono text-[12px] truncate">
                      {r.sku}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold truncate">
                        {r.model?.name ?? "—"}
                      </div>
                      {r.model?.blurb && (
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {r.model.blurb}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-[12px] font-medium">
                      {r.variant}
                    </div>
                    <div className="text-right">
                      {d > 0 ? (
                        <span className="font-mono text-[12px] font-bold px-2.5 py-0.5 rounded bg-primary/10 text-primary">
                          {d}
                        </span>
                      ) : (
                        <span className="font-mono text-[12px] text-muted-foreground">
                          —
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-right text-[12px] font-semibold">
                      {r.price.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="border border-border rounded-md p-4 bg-card">
      <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </div>
      <div className="font-display text-[28px] mt-1.5 leading-none">
        {value}
      </div>
      {hint && (
        <div className="text-[11px] text-muted-foreground mt-1.5">{hint}</div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-1 rounded text-[11px] font-semibold uppercase tracking-[0.1em] ${
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-secondary/50"
      }`}
    >
      {children}
    </button>
  );
}

function HeaderCell({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div
      className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground"
      style={{ textAlign: align ?? "left" }}
    >
      {children}
    </div>
  );
}
