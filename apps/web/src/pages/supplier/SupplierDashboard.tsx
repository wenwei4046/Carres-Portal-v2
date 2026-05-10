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

  // 2026-05-10 (Loo) — was reading dropped column `purchase_orders.qty`
  // (post-0017 it lives on the embedded lines). Sum across the new lines[].
  const totalUnits = rows.reduce(
    (s, p) =>
      s + (p.lines ?? []).reduce((ss, l) => ss + (l.qty ?? 0), 0),
    0,
  );
  const pendingAck = rows.filter((p) => p.sup_status === "pending").length;
  const inProd = rows.filter(
    (p) => p.sup_status === "acknowledged" || p.sup_status === "in_production",
  ).length;
  const readyAwaiting = rows.filter(
    (p) =>
      p.sup_status === "ready_for_pickup" ||
      p.sup_status === "ready_confirm_sent",
  ).length;

  const stagePo = rows.filter((p) =>
    ["pending", "acknowledged", "in_production"].includes(p.sup_status),
  ).length;
  const stageReady = rows.filter((p) =>
    [
      "ready_for_pickup",
      "ready_confirm_sent",
      "pickup_assigned",
      "pickup_accepted",
      "shipped",
      "reassign_needed",
    ].includes(p.sup_status),
  ).length;
  const stageDelivered = rows.filter((p) =>
    ["picked_up", "delivered"].includes(p.sup_status),
  ).length;

  const topDemand = (demand.data ?? []).slice(0, 4);
  const maxDemand = topDemand[0]?.openQty ?? 0;

  const isLoading = pos.isLoading || demand.isLoading;

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="mb-7">
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Workspace
        </div>
        <h1 className="font-display text-[32px] mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
          Dashboard
        </h1>
        <div className="text-[13px] text-muted-foreground">
          Production pipeline · live from Supabase
        </div>
      </header>

      {/* KPI row — 4 cards (proto's 5 cards minus Incoming, deferred to
          SupplierIncoming page where the data fetch lives) */}
      <div
        className="grid grid-cols-4 gap-3.5 mb-5"
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
        <Kpi
          label="Total open units"
          value={totalUnits}
          hint={`${rows.length} POs across pipeline`}
        />
      </div>

      {/* Pipeline summary */}
      <div className="border border-border rounded-md p-5 mb-5 bg-card">
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-4">
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
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
            Coverage
          </div>
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-5 items-start">
            <div>
              <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-1">
                Categories
              </div>
              <div className="text-[13px] font-semibold text-foreground">
                {me.data.cat_covered.length > 0
                  ? me.data.cat_covered.join(" · ")
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-1">
                Lead time
              </div>
              <div className="text-[13px] font-semibold text-foreground">
                {me.data.lead_time ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-1">
                Contact
              </div>
              <div className="text-[13px] text-foreground truncate">
                {me.data.contact_email ?? me.data.contact ?? "—"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-1">
                Workflow
              </div>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  me.data.kind === "factory_pickup"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-primary/10 text-primary"
                }`}
              >
                {me.data.kind === "factory_pickup"
                  ? "Factory pickup"
                  : "Own logistics"}
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
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
          Recent activity
        </div>
        {activity.isLoading ? (
          <div className="text-[13px] text-muted-foreground py-2">Loading…</div>
        ) : (activity.data ?? []).length === 0 ? (
          <div className="text-[13px] text-muted-foreground py-2">
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
                  <span className="font-mono text-[12px] text-foreground mr-2">
                    {a.po_id}
                  </span>
                  <span className="text-[12.5px] text-muted-foreground">
                    {a.text}
                  </span>
                </div>
                <span className="text-[10.5px] text-muted-foreground font-mono whitespace-nowrap">
                  {formatRelative(a.occurred_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top SKUs */}
      <div className="border border-border rounded-md p-5 bg-card">
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-4">
          Top demand · open POs
        </div>
        {isLoading ? (
          <div className="text-[13px] text-muted-foreground py-6">Loading…</div>
        ) : topDemand.length === 0 ? (
          <div className="text-[13px] text-muted-foreground py-6">
            No open demand right now.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {topDemand.map((d) => (
              <div
                key={d.sku}
                className="grid grid-cols-[1fr_auto] gap-3 items-center"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate">
                    {d.sku}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Across {d.poCount} PO{d.poCount === 1 ? "" : "s"}
                  </div>
                  <div className="h-1.5 bg-secondary rounded mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${maxDemand ? (d.openQty / maxDemand) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="font-mono text-[18px] font-bold min-w-[42px] text-right">
                  {d.openQty}
                </div>
              </div>
            ))}
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
      <div className={`text-[10px] uppercase tracking-[0.12em] ${toneClass}`}>
        {title}
      </div>
      <div className="font-display text-[32px] mt-1 leading-none text-foreground">
        {count}
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">{subtitle}</div>
    </div>
  );
}

function PipelineArrow() {
  return (
    <div className="grid place-items-center text-muted-foreground text-[20px]">
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
