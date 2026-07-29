import {
  useSupplierPos,
  useSupplierDemand,
  useSupplierMe,
  useSupplierActivity,
  type SupplierPoRow,
} from "@/lib/queries";

/**
 * Supplier Dashboard — Phase 6.
 *
 * Visual reference: `reference/proto/supplier-pages.jsx:47-198`.
 *
 * Wires `useSupplierPos` (full RLS-scoped list) + `useSupplierDemand`
 * (top SKUs from open POs) + `useSupplierMe` (Coverage callout) +
 * `useSupplierActivity` (last 6 po_history entries). KPI row → pipeline
 * overview → Coverage → Recent activity → Top demand.
 *
 * Closes phase-6-supplier-recent-activity (V1 left this slot empty) and
 * phase-6-supplier-me-endpoint (Coverage callout was deferred).
 */
export default function SupplierDashboard() {
  const pos = useSupplierPos();
  const demand = useSupplierDemand();
  const me = useSupplierMe();
  const activity = useSupplierActivity();

  const rows: SupplierPoRow[] = pos.data ?? [];

  // 2026-05-15 (Loo) — "Total open units" KPI dropped in favour of the new
  // demand-side hero card (Committed (POs) reads the same units via
  // `useSupplierDemand`). totalUnits computation also dropped.
  const pendingAck = rows.filter((p) => p.sup_status === "pending").length;
  const inProd = rows.filter(
    (p) => p.sup_status === "acknowledged" || p.sup_status === "in_production",
  ).length;
  const readyAwaiting = rows.filter(
    (p) =>
      p.sup_status === "ready_for_pickup" ||
      p.sup_status === "ready_confirm_sent" ||
      // 0090 sofa flow (Loo 2026-05-12): partner WH owner accepted the
      // goods; supplier (own_logistics) now self-dispatches. Mirrors the
      // API ready bucket in apps/api/src/routes/supplier/pos.ts:49 so the
      // Dashboard pipeline counter matches the Ready-to-Pickup tab.
      p.sup_status === "partner_confirmed" ||
      // Task 14 (2026-05-15) — `partially_shipped` (migration 0107) keeps
      // un-picked threads visible; supplier still owes those threads.
      p.sup_status === "partially_shipped",
  ).length;

  const stagePo = rows.filter((p) =>
    ["pending", "acknowledged", "in_production"].includes(p.sup_status),
  ).length;
  const stageReady = rows.filter((p) =>
    [
      "ready_for_pickup",
      "ready_confirm_sent",
      "partner_confirmed",
      "pickup_assigned",
      "pickup_accepted",
      // Task 14 (2026-05-15) — partial PO still in ready stage until every
      // thread is picked (mirrors `readyAwaiting` above + API bucket).
      "partially_shipped",
      "shipped",
      "reassign_needed",
    ].includes(p.sup_status),
  ).length;
  const stageDelivered = rows.filter((p) =>
    ["picked_up", "delivered"].includes(p.sup_status),
  ).length;

  // 2026-05-15 (Loo) — Top demand displays Total = committed (openQty from
  // issued POs) + pending (pendingQty from sales orders not yet POed). The
  // prior "open POs only" view hid the existence of inbound sales orders that
  // hadn't been formalised into POs yet, producing the confusing UX where a
  // SKU surfaced in the list but showed a big 0. Now mirrors the Forecast
  // page's "Total demand" semantic — sort + display use the combined number.
  const demandRows = demand.data ?? [];
  const demandWithTotal = demandRows.map((d) => ({
    ...d,
    total: d.openQty + (d.pendingQty ?? 0),
  }));
  const topDemand = demandWithTotal
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);
  const maxDemand = topDemand[0]?.total ?? 0;

  // 2026-05-15 (Loo) — Mirror Forecast hero KPI row on Dashboard so the
  // supplier sees Total Demand = Committed + Pending front-and-center,
  // not just inside the Forecast sub-page.
  const totalCommitted = demandRows.reduce((s, r) => s + r.openQty, 0);
  const totalPending = demandRows.reduce((s, r) => s + (r.pendingQty ?? 0), 0);
  const totalDemand = totalCommitted + totalPending;

  const isLoading = pos.isLoading || demand.isLoading;

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="mb-7">
        <div className="text-label uppercase tracking-[0.12em] text-muted-foreground">
          Workspace
        </div>
        <h1 className="font-display text-page mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
          Dashboard
        </h1>
        <div className="text-body text-muted-foreground">
          Production pipeline · live from Supabase
        </div>
      </header>

      {/* Demand KPI row — Total demand hero + Committed + Pending. Mirrors
          the Forecast page's KPI layout (1.5fr/1fr/1fr) so the math is
          visible at a glance. Total = Committed + Pending. */}
      <div
        className="grid grid-cols-[1.5fr_1fr_1fr] gap-3.5 mb-5"
        data-testid="supplier-dashboard-demand-kpis"
      >
        <div
          className={`border-2 rounded-md p-5 bg-primary/[0.04] ${
            totalDemand > 0 ? "border-primary/40" : "border-border"
          }`}
        >
          <div
            className={`text-label uppercase tracking-[0.06em] ${
              totalDemand > 0 ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Total demand
          </div>
          <div className="flex items-baseline gap-3 mt-2">
            <div className="font-display text-page leading-none">
              {totalDemand}
            </div>
            {totalDemand > 0 && (
              <div className="text-meta text-muted-foreground leading-snug">
                = <span className="font-mono">{totalCommitted}</span> committed
                {" + "}
                <span className="font-mono">{totalPending}</span> pending
              </div>
            )}
          </div>
          <div className="text-label text-muted-foreground mt-2">
            Across {demandRows.length} SKU{demandRows.length === 1 ? "" : "s"}
          </div>
        </div>
        <Kpi
          label="Committed (POs)"
          value={totalCommitted}
          hint="Already-issued PO lines"
        />
        <Kpi
          label="Pending (orders)"
          value={totalPending}
          hint="Sales orders not yet POed"
          accent={totalPending > 0}
        />
      </div>

      {/* Pipeline KPI row — what's mid-flight on this supplier's POs right
          now. "Total open units" KPI dropped 2026-05-15 (Loo) since it
          duplicates the new Committed (POs) card above. */}
      <div
        className="grid grid-cols-3 gap-3.5 mb-5"
        data-testid="supplier-dashboard-kpis"
      >
        <Kpi
          label="Pending acknowledgement"
          value={pendingAck}
          hint="New POs from Carres"
          accent={pendingAck > 0}
        />
        <Kpi
          label="In production"
          value={inProd}
          hint="Acknowledged + producing"
        />
        <Kpi
          label="Ready · awaiting pickup"
          value={readyAwaiting}
          hint="Goods staged at factory"
          accent={readyAwaiting > 0}
        />
      </div>

      {/* Pipeline summary */}
      <div className="border border-border rounded-md p-5 mb-5 bg-card">
        <div className="text-label uppercase tracking-[0.12em] text-muted-foreground mb-4">
          Pipeline overview
        </div>
        <div className="grid grid-cols-[1fr_24px_1fr_24px_1fr] items-stretch">
          <PipelineCell
            title="PO"
            count={stagePo}
            subtitle="Awaiting ack / producing"
            tone="warn"
          />
          <PipelineArrow />
          <PipelineCell
            title="Ready to Pickup"
            count={stageReady}
            subtitle="Staged · partner inbound"
            tone="info"
          />
          <PipelineArrow />
          <PipelineCell
            title="Delivered"
            count={stageDelivered}
            subtitle="DO uploaded · closed"
            tone="ok"
          />
        </div>
      </div>

      {/* Coverage callout — proto:supplier-pages.jsx:184-195. Static profile
          info from suppliers row. Kind badge tells the supplier at a glance
          which workflow applies to their POs (skip-ack vs ack-first). */}
      {me.data && (
        <div
          className="border border-border rounded-md p-5 mb-5 bg-card"
          data-testid="supplier-coverage-callout"
        >
          <div className="text-label uppercase tracking-[0.12em] text-muted-foreground mb-3">
            Coverage
          </div>
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-5 items-start">
            <div>
              <div className="text-label uppercase tracking-[0.06em] text-muted-foreground mb-1">
                Categories
              </div>
              <div className="text-body font-semibold text-foreground">
                {me.data.cat_covered.length > 0
                  ? me.data.cat_covered.join(" · ")
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-label uppercase tracking-[0.06em] text-muted-foreground mb-1">
                Lead time
              </div>
              <div className="text-body font-semibold text-foreground">
                {me.data.lead_time ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-label uppercase tracking-[0.06em] text-muted-foreground mb-1">
                Contact
              </div>
              <div className="text-body text-foreground truncate">
                {me.data.contact_email ?? me.data.contact ?? "—"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-label uppercase tracking-[0.06em] text-muted-foreground mb-1">
                Workflow
              </div>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-label font-semibold ${
                  me.data.kind === "factory_pickup"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-primary/10 text-primary"
                }`}
              >
                {me.data.kind === "factory_pickup"
                  ? "Factory pickup"
                  : "Own operation"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Recent activity — last 6 po_history entries (RLS-scoped to this
          supplier via po_history_read policy 0002:256). */}
      <div
        className="border border-border rounded-md p-5 mb-5 bg-card"
        data-testid="supplier-recent-activity"
      >
        <div className="text-label uppercase tracking-[0.12em] text-muted-foreground mb-3">
          Recent activity
        </div>
        {activity.isLoading ? (
          <div className="text-body text-muted-foreground py-2">Loading…</div>
        ) : (activity.data ?? []).length === 0 ? (
          <div className="text-body text-muted-foreground py-2">
            No recent activity yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {(activity.data ?? []).map((a) => (
              <div
                key={a.id}
                className="flex items-baseline justify-between py-1 border-b border-dashed border-border last:border-0"
              >
                <div className="min-w-0 mr-3">
                  <span className="font-mono text-meta text-foreground mr-2">
                    {a.po_id}
                  </span>
                  <span className="text-meta text-muted-foreground">
                    {a.text}
                  </span>
                </div>
                <span className="text-label text-muted-foreground font-mono whitespace-nowrap">
                  {formatRelative(a.occurred_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top SKUs */}
      <div className="border border-border rounded-md p-5 bg-card">
        <div className="text-label uppercase tracking-[0.12em] text-muted-foreground mb-4">
          Top demand · committed + pending
        </div>
        {isLoading ? (
          <div className="text-body text-muted-foreground py-6">Loading…</div>
        ) : topDemand.length === 0 ? (
          <div className="text-body text-muted-foreground py-6">
            No demand right now.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {topDemand.map((d) => {
              const pendingCount = d.pendingOrderCount ?? 0;
              return (
                <div
                  key={d.sku}
                  className="grid grid-cols-[1fr_auto] gap-3 items-center"
                >
                  <div className="min-w-0">
                    <div className="text-body font-semibold truncate">
                      {d.sku}
                    </div>
                    <div className="text-label text-muted-foreground mt-0.5">
                      Across {d.poCount} PO{d.poCount === 1 ? "" : "s"}
                      {pendingCount > 0 && (
                        <>
                          {" · "}
                          {pendingCount} pending order
                          {pendingCount === 1 ? "" : "s"}
                        </>
                      )}
                    </div>
                    <div className="h-1.5 bg-secondary rounded mt-1.5 overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${maxDemand ? (d.total / maxDemand) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="font-mono text-strong font-semibold min-w-[42px] text-right">
                    {d.total}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
        className={`text-label uppercase tracking-[0.06em] ${
          accent ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {label}
      </div>
      <div className="font-display text-page mt-1.5 leading-none">
        {value}
      </div>
      {hint && (
        <div className="text-label text-muted-foreground mt-1.5">{hint}</div>
      )}
    </div>
  );
}

function PipelineCell({
  title,
  count,
  subtitle,
  tone,
}: {
  title: string;
  count: number;
  subtitle: string;
  tone: "warn" | "info" | "ok";
}) {
  const toneClass =
    tone === "warn"
      ? "text-primary"
      : tone === "info"
        ? "text-blue-600"
        : "text-success";
  return (
    <div className="text-center px-1">
      <div className={`text-label uppercase tracking-[0.12em] ${toneClass}`}>
        {title}
      </div>
      <div className="font-display text-page mt-1 leading-none text-foreground">
        {count}
      </div>
      <div className="text-label text-muted-foreground mt-1">{subtitle}</div>
    </div>
  );
}

function PipelineArrow() {
  return (
    <div className="grid place-items-center text-muted-foreground text-title">
      →
    </div>
  );
}

/** Compact relative time for the activity feed. Stays readable up to a
 *  week; falls back to ISO date thereafter. */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diff = Date.now() - then;
  if (diff < 60_000)            return "just now";
  if (diff < 60 * 60_000)       return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000)  return `${Math.floor(diff / (60 * 60_000))}h ago`;
  if (diff < 7 * 24 * 60 * 60_000) return `${Math.floor(diff / (24 * 60 * 60_000))}d ago`;
  return iso.slice(0, 10);
}
