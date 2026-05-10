import { useSupplierDemand, useSupplierPos } from "@/lib/queries";

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
  const pendingPos = useSupplierPos("po");

  const rows = demand.data ?? [];
  // 2026-05-10 (Loo) — `openQty` is committed via PO; `pendingQty` is
  // pre-commit demand from sales orders with matching cat_covered. Surface
  // both so the supplier can plan production capacity without waiting for
  // logistics to formalise every order into a PO.
  const totalOpenUnits = rows.reduce((s, r) => s + r.openQty, 0);
  const totalPendingUnits = rows.reduce((s, r) => s + (r.pendingQty ?? 0), 0);
  const totalUnits = totalOpenUnits + totalPendingUnits;
  const pendingAck = (pendingPos.data ?? []).filter(
    (p) => p.sup_status === "pending",
  ).length;

  // Group by category prefix (proto:715-720). SKU format: cat:model:variant.
  const byCat: Record<string, typeof rows> = {};
  for (const r of rows) {
    const cat = r.sku.split(":")[0];
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

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <Kpi
          label="Total demand"
          value={totalUnits}
          accent={totalUnits > 0}
          hint={`Across ${rows.length} SKU${rows.length === 1 ? "" : "s"}`}
        />
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
        <Kpi
          label="Pending ack"
          value={pendingAck}
          hint="Awaiting supplier acknowledgement"
          accent={pendingAck > 0}
        />
      </div>

      {rows.length === 0 ? (
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
                {items.reduce((s, i) => s + i.openQty, 0)} units · {items.length} SKU
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
