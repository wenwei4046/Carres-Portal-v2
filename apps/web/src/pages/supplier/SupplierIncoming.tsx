import { useSupplierDemand } from "@/lib/queries";

/**
 * Supplier · Incoming — Phase 6 V1.
 *
 * Visual reference: `reference/proto/supplier-pages.jsx:697-781`.
 *
 * Proto reads sales orders (status='place') filtered by supplier.cat_covered
 * for upstream demand forecasting. V1 simplification: shows aggregated open
 * PO demand by SKU (which is the closest forward-looking signal we surface
 * via existing endpoints). True sales-order forecast deferred via carry-
 * forward `phase-6-incoming-server-side` — when added, this page swaps to
 * GET /api/supplier/incoming.
 *
 * Numbers in the KPI row: total open units / open POs / pending acks.
 */
export default function SupplierIncoming() {
  const demand = useSupplierDemand();

  const rows = demand.data ?? [];
  // 2026-05-10 (Loo) — `openQty` is committed via PO; `pendingQty` is
  // pre-commit demand from sales orders with matching cat_covered. Surface
  // both so the supplier can plan production capacity without waiting for
  // operation to formalise every order into a PO.
  // 2026-05-15 (Loo) — "Pending ack" KPI removed. It was a sub-status of
  // committed POs (sup_status='pending') and didn't belong in a demand
  // forecast view; supplier reads PO ack state on the POs page anyway.
  // Only the 3 furniture categories belong in a supplier forecast; the server
  // already excludes accessories/services (category null), but guard anyway.
  const relevant = rows.filter((r) => r.category);
  const totalOpenUnits = relevant.reduce((s, r) => s + r.openQty, 0);
  const totalPendingUnits = relevant.reduce((s, r) => s + (r.pendingQty ?? 0), 0);
  const totalUnits = totalOpenUnits + totalPendingUnits;

  // Group by server-derived category (migration 0148 resolve_demand_category).
  // The legacy `sku.split(":")` is gone — AutoCount + canonical SKUs have no
  // category prefix.
  const byCat: Record<string, typeof rows> = {};
  for (const r of relevant) {
    const cat = r.category as string;
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(r);
  }

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="mb-7">
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Forecast
        </div>
        <h1 className="font-display text-[32px] mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
          Incoming Demand
        </h1>
        <div className="text-[13px] text-muted-foreground">
          Two demand buckets: <strong>committed</strong> (issued POs) and{" "}
          <strong>pending</strong> (sales orders not yet POed). Aggregated only —
          no customer-level detail.
        </div>
      </header>

      {/* KPI row — Total demand is the hero (wider + tinted + bigger number
          + inline breakdown), Committed and Pending are smaller peer cards
          showing the two components that sum to Total. Visual hierarchy
          mirrors the math: Total = Committed + Pending. */}
      <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-3.5 mb-5">
        <div
          className={`border-2 rounded-md p-5 bg-primary/[0.04] ${
            totalUnits > 0 ? "border-primary/40" : "border-border"
          }`}
        >
          <div
            className={`text-[10px] uppercase tracking-[0.06em] ${
              totalUnits > 0 ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Total demand
          </div>
          <div className="flex items-baseline gap-3 mt-2">
            <div className="font-display text-[44px] leading-none">
              {totalUnits}
            </div>
            {totalUnits > 0 && (
              <div className="text-[12px] text-muted-foreground leading-snug">
                = <span className="font-mono">{totalOpenUnits}</span> committed
                {" + "}
                <span className="font-mono">{totalPendingUnits}</span> pending
              </div>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-2">
            Across {relevant.length} SKU{relevant.length === 1 ? "" : "s"}
          </div>
        </div>
        <Kpi
          label="Committed (POs)"
          value={totalOpenUnits}
          hint="Already-issued PO lines"
        />
        <Kpi
          label="Pending (orders)"
          value={totalPendingUnits}
          hint="Sales orders not yet POed"
          accent={totalPendingUnits > 0}
        />
      </div>

      {relevant.length === 0 ? (
        <div className="border border-border rounded-md p-10 text-center bg-card">
          <div className="text-[14px] text-muted-foreground">
            No incoming demand right now.
          </div>
          <div className="text-[12px] text-muted-foreground mt-1.5">
            New sales orders + POs from Carres will appear here as they land.
          </div>
        </div>
      ) : (
        Object.entries(byCat).map(([cat, items]) => (
          <div
            key={cat}
            className="border border-border rounded-md mb-5 overflow-hidden bg-card"
            data-testid={`incoming-cat-${cat}`}
          >
            <div className="px-5 py-3.5 border-b border-border flex items-baseline justify-between bg-secondary/30">
              <div className="text-[10px] uppercase tracking-[0.12em] font-semibold">
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {/* Total = committed + pending, matching the hero KPI math —
                    committed-only here understated categories whose demand is
                    mostly un-POed sales orders (Loo 2026-06-04). */}
                {items.reduce((s, i) => s + i.openQty + (i.pendingQty ?? 0), 0)}{" "}
                units · {items.length} SKU
                {items.length === 1 ? "" : "s"}
              </div>
            </div>
            <div>
              {items.map((it, i) => (
                <div
                  key={it.sku}
                  className={`grid grid-cols-[1fr_140px_140px] items-center gap-4 px-5 py-3.5 ${
                    i === items.length - 1 ? "" : "border-b border-border"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate">
                      {it.sku}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {it.poCount} PO{it.poCount === 1 ? "" : "s"}
                      {it.pendingOrderCount > 0 && (
                        <>
                          {" · "}
                          {it.pendingOrderCount} pending order
                          {it.pendingOrderCount === 1 ? "" : "s"}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[18px] font-bold">
                      {it.openQty}
                    </span>
                    <span className="text-[9px] uppercase tracking-[0.06em] text-muted-foreground ml-1.5">
                      committed
                    </span>
                  </div>
                  <div className="text-right">
                    <span
                      className={`font-mono text-[18px] font-bold ${
                        it.pendingQty > 0 ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {it.pendingQty ?? 0}
                    </span>
                    <span className="text-[9px] uppercase tracking-[0.06em] text-muted-foreground ml-1.5">
                      pending
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="text-[11px] text-muted-foreground leading-snug mt-5">
        Demand shown is aggregated only. A formal Purchase Order is issued by
        Carres Procurement before any production commitment.
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`border rounded-md p-4 bg-card ${
        accent ? "border-primary" : "border-border"
      }`}
    >
      <div
        className={`text-[10px] uppercase tracking-[0.06em] ${
          accent ? "text-primary" : "text-muted-foreground"
        }`}
      >
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
