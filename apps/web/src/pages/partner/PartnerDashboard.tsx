import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queries";
import { apiFetch } from "@/lib/api";

/**
 * Partner · Today (dashboard).
 *
 * Proto reference: reference/proto/partner-dashboard.jsx (Loo 2026-05-10
 * iteration). Hero + KPI tiles + 3-column pipeline preview + Fleet & Recently
 * delivered side rail. Each preview card is clickable → jumps to the full
 * Factory pickups page.
 */
type Counts = {
  upcoming?: number;
  ready?: number;
  assigned: number;
  accepted: number;
  in_transit: number;
  delivered: number;
  total: number;
};

type DashboardPickupLine = {
  id: string;
  sku: string;
  qty: number;
  attrs: Record<string, unknown> | null;
};

type DashboardPickupRow = {
  id: string;
  dl: number | null;
  sup_status: string;
  status: string;
  eta_date: string | null;
  placed_at: string;
  suppliers: { name: string; contact: string | null } | null;
  warehouses: { name: string; address: string | null } | null;
  lines: DashboardPickupLine[];
};

type FleetRow = {
  id: string;
  plate: string;
  vehicle_type: string | null;
  capacity: string | null;
  driver_name: string | null;
  driver_phone: string | null;
};

type Bucket = "upcoming" | "awaiting" | "scheduled" | "in_transit" | "delivered";

function bucketOf(p: DashboardPickupRow): Bucket | null {
  if (p.status !== "open" && p.sup_status !== "delivered") return null;
  // 2026-05-11 (Loo): "Upcoming" preview — partner sees POs the supplier is
  // still producing so they can plan capacity by ETA before the row jumps
  // into Awaiting Accept. Source bucket = pre-LP-confirm sup_status values.
  if (
    p.sup_status === "pending" ||
    p.sup_status === "acknowledged" ||
    p.sup_status === "in_production"
  )
    return "upcoming";
  if (
    p.sup_status === "ready_confirm_sent" ||
    p.sup_status === "ready_for_pickup" ||
    p.sup_status === "pickup_assigned"
  )
    return "awaiting";
  if (p.sup_status === "pickup_accepted") return "scheduled";
  if (p.sup_status === "picked_up") return "in_transit";
  if (p.sup_status === "delivered") return "delivered";
  return null;
}

function lineSummary(lines: DashboardPickupLine[]): { head: string; rest: number; totalQty: number } {
  const totalQty = lines.reduce((s, l) => s + (l.qty ?? 0), 0);
  const head = lines[0];
  if (!head) return { head: "—", rest: 0, totalQty };
  const a = head.attrs as { color?: string; gap?: string; fabric_name?: string } | null;
  let label = head.sku;
  if (a?.color || a?.gap) {
    const bits: string[] = [];
    if (a.color) bits.push(a.color);
    if (a.gap) bits.push(`gap ${a.gap}`);
    label = `${head.sku} · ${bits.join(" · ")}`;
  } else if (a?.fabric_name) {
    label = `${head.sku} · ${a.fabric_name}`;
  }
  return { head: label, rest: lines.length - 1, totalQty };
}

export default function PartnerDashboard() {
  const counts = useQuery({
    queryKey: qk.partner.dashboard(),
    queryFn: () => apiFetch<Counts>("/api/partner/dashboard"),
  });
  const pickups = useQuery({
    queryKey: qk.partner.pickups(),
    queryFn: () => apiFetch<DashboardPickupRow[]>("/api/partner/pickups"),
  });
  const fleet = useQuery({
    queryKey: qk.partner.fleet(),
    queryFn: () => apiFetch<FleetRow[]>("/api/partner/fleet"),
  });

  const buckets = useMemo(() => {
    const out = {
      upcoming: [] as DashboardPickupRow[],
      awaiting: [] as DashboardPickupRow[],
      scheduled: [] as DashboardPickupRow[],
      in_transit: [] as DashboardPickupRow[],
      delivered: [] as DashboardPickupRow[],
    };
    for (const p of pickups.data ?? []) {
      const b = bucketOf(p);
      if (b) out[b].push(p);
    }
    return out;
  }, [pickups.data]);

  if (counts.isLoading || !counts.data) {
    return <div className="px-9 py-8 pb-14 text-[13px] text-base-600">Loading…</div>;
  }
  const c = counts.data;

  return (
    <div className="px-9 py-8 pb-14 space-y-6">
      <div>
        <div className="kicker">LP · Today</div>
        <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-tight font-semibold">
          Today
        </h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <KpiTile
          label="Upcoming"
          value={c.upcoming ?? 0}
          hint="Supplier still producing"
        />
        <KpiTile
          label="Ready"
          value={c.ready ?? 0}
          hint="Time to pickup"
          accent={(c.ready ?? 0) > 0}
        />
        <KpiTile label="Assigned" value={c.assigned} />
        <KpiTile label="Accepted" value={c.accepted} />
        <KpiTile label="In transit" value={c.in_transit} />
        <KpiTile label="Delivered" value={c.delivered} />
      </div>

      {/* Active pipeline preview — 3 columns matching proto. Cards click
          through to Factory pickups for the full work view. */}
      <div className="flex justify-between items-end gap-4">
        <div className="kicker text-base-500">Active pipeline</div>
        <Link
          to="/delivery-partner/factory-pickups"
          className="text-[12px] text-primary hover:underline font-semibold"
        >
          See all pickups →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <PreviewColumn
          label="Upcoming"
          hint="Supplier still producing · plan ahead"
          accent="muted"
          items={buckets.upcoming}
        />
        <PreviewColumn
          label="Awaiting accept"
          hint="Dispatched to you · accept to schedule"
          accent="warning"
          items={buckets.awaiting}
        />
        <PreviewColumn
          label="Scheduled"
          hint="Pickup booked · waiting for collection"
          accent="info"
          items={buckets.scheduled}
        />
        <PreviewColumn
          label="In transit"
          hint="Goods loaded · en route to warehouse"
          accent="info"
          items={buckets.in_transit}
        />
      </div>

      {/* Side rail — Fleet + Recently delivered. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SideCard
          title="Fleet"
          hint={`${fleet.data?.length ?? 0} vehicle${(fleet.data?.length ?? 0) === 1 ? "" : "s"}`}
        >
          {(fleet.data ?? []).length === 0 ? (
            <div className="text-[12px] text-base-500 py-4 text-center">
              No vehicles yet — add via Fleet.
            </div>
          ) : (
            (fleet.data ?? []).map((f) => (
              <div
                key={f.id}
                className="grid grid-cols-[auto_1fr_auto] gap-2.5 items-center px-1 py-2.5 border-t border-base-100 first:border-0"
              >
                <span className="font-mono text-[11px] font-bold py-0.5 px-1.5 border border-base-300 rounded-[3px]">
                  {f.plate}
                </span>
                <div className="min-w-0">
                  <div className="font-body text-[12px] font-medium">
                    {f.driver_name ?? "—"}
                  </div>
                  <div className="font-body text-[10px] text-base-500">
                    {f.vehicle_type ?? "—"}
                    {f.capacity ? ` · ${f.capacity}` : ""}
                  </div>
                </div>
                <span className="font-mono text-[10px] text-base-500">
                  {f.driver_phone ?? ""}
                </span>
              </div>
            ))
          )}
        </SideCard>

        <SideCard
          title="Recently delivered"
          hint={`${buckets.delivered.length} this week`}
        >
          {buckets.delivered.length === 0 ? (
            <div className="text-[12px] text-base-500 py-4 text-center">
              No completed pickups yet.
            </div>
          ) : (
            buckets.delivered.slice(0, 4).map((po) => {
              const { head, rest, totalQty } = lineSummary(po.lines);
              const summary = rest > 0 ? `${head} +${rest} more · ${totalQty} units` : `${head} ×${totalQty}`;
              return (
                <div
                  key={po.id}
                  className="grid grid-cols-[auto_1fr_auto] gap-3 items-center px-1 py-2.5 border-t border-base-100 first:border-0"
                >
                  <span className="font-mono text-[12px] font-semibold">
                    {po.id}
                  </span>
                  <div className="min-w-0">
                    <div className="font-body text-[12px]">{summary}</div>
                    <div className="font-body text-[11px] text-base-500">
                      {po.suppliers?.name ?? "—"} → {po.warehouses?.name ?? "—"}
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-success uppercase tracking-[0.1em] font-bold">
                    {po.status === "received" ? "DONE" : "AT WH"}
                  </span>
                </div>
              );
            })
          )}
        </SideCard>
      </div>
    </div>
  );
}

function KpiTile({
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
      className={`bg-white rounded-md p-5 flex flex-col text-left border ${
        accent ? "border-primary" : "border-base-200"
      }`}
    >
      <div
        className={`text-[11px] uppercase tracking-[0.18em] font-semibold ${
          accent ? "text-primary" : "text-base-600"
        }`}
      >
        {label}
      </div>
      <div className="font-display text-[36px] leading-none mt-1.5 font-bold tracking-tight text-base-900">
        {value}
      </div>
      {hint && (
        <div className="text-[10px] text-base-500 mt-1.5">{hint}</div>
      )}
    </div>
  );
}

function PreviewColumn({
  label,
  hint,
  accent,
  items,
}: {
  label: string;
  hint: string;
  accent: "warning" | "info" | "muted";
  items: DashboardPickupRow[];
}) {
  const accentCls =
    accent === "warning"
      ? "text-warning"
      : accent === "info"
        ? "text-info"
        : "text-base-500";
  return (
    <div className="bg-white border border-base-200 rounded-md overflow-hidden">
      <div className="px-4 py-3.5 border-b border-base-100">
        <div className="flex justify-between items-baseline">
          <div className={`text-[11px] font-bold uppercase tracking-[0.14em] ${accentCls}`}>
            {label}
          </div>
          <span className="font-mono text-[13px] font-semibold">{items.length}</span>
        </div>
        <div className="font-body text-[11px] text-base-500 mt-0.5">{hint}</div>
      </div>
      <div className="p-2 min-h-[140px]">
        {items.length === 0 ? (
          <div className="text-center text-base-400 text-[11px] py-6">—</div>
        ) : (
          items.slice(0, 4).map((po) => {
            const { head, rest, totalQty } = lineSummary(po.lines);
            const summary = rest > 0 ? `${head} +${rest} more` : head;
            return (
              <Link
                key={po.id}
                to="/delivery-partner/factory-pickups"
                className="block w-full bg-white border border-base-100 rounded-[4px] px-3 py-2.5 mb-1.5 hover:border-primary transition-colors"
              >
                <div className="flex justify-between items-baseline">
                  <span className="font-mono text-[11px] font-semibold">{po.id}</span>
                  <span className="font-mono text-[11px] text-base-500">×{totalQty}</span>
                </div>
                <div className="font-body text-[12px] font-medium mt-0.5 truncate">
                  {summary}
                </div>
                <div className="font-body text-[10px] text-base-500 mt-1">
                  {po.suppliers?.name ?? "—"} → {po.warehouses?.name ?? "—"}
                  {po.eta_date ? ` · ${po.eta_date}` : ""}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function SideCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-base-200 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-base-100 flex justify-between items-baseline">
        <h3 className="text-[13px] font-semibold text-base-900">{title}</h3>
        {hint && (
          <span className="font-mono text-[11px] text-base-500">{hint}</span>
        )}
      </div>
      <div className="px-4 py-1">{children}</div>
    </div>
  );
}
