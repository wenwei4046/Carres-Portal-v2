import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queries";
import { apiFetch } from "@/lib/api";

/**
 * Partner Dashboard — landing page for the LP role.
 *
 * Phase 4.5 Chunk 1 Task 25 wires this up against `GET /api/partner/dashboard`
 * (Task 24). The endpoint returns aggregate counts grouped by leg state so the
 * LP can see at a glance how many pickups need their attention today and how
 * many are already in flight or delivered.
 *
 * KPI breakdown:
 *   - assigned    — RFD has fired but the LP hasn't accepted yet
 *   - accepted    — LP accepted, pickup scheduled
 *   - in_transit  — vehicle picked up, en route
 *   - delivered   — completed pickups (today's count)
 *
 * The 3-column pipeline is a placeholder summary — the full per-leg list lives
 * in `PartnerPickupsPage` (Task 26). We deliberately don't duplicate that data
 * here; this page is a quick-glance KPI hub, not a work queue.
 */
type Counts = {
  assigned: number;
  accepted: number;
  in_transit: number;
  delivered: number;
  total: number;
};

export default function PartnerDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: qk.partner.dashboard(),
    queryFn: () => apiFetch<Counts>("/api/partner/dashboard"),
  });

  if (isLoading || !data) {
    return <div className="px-9 py-8 pb-14 text-[13px] text-base-600">Loading…</div>;
  }

  return (
    <div className="px-9 py-8 pb-14 space-y-6">
      <div>
        <div className="kicker">LP · Today</div>
        <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-tight font-semibold">
          Today
        </h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Assigned" value={data.assigned} />
        <KpiTile label="Accepted" value={data.accepted} />
        <KpiTile label="In transit" value={data.in_transit} />
        <KpiTile label="Delivered" value={data.delivered} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PipelineCol title="Assigned" />
        <PipelineCol title="Accepted" />
        <PipelineCol title="In transit" />
      </div>
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-base-200 rounded-md p-5 flex flex-col text-left">
      <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
        {label}
      </div>
      <div className="font-display text-[36px] leading-none mt-1.5 font-bold tracking-tight text-base-900">
        {value}
      </div>
    </div>
  );
}

function PipelineCol({ title }: { title: string }) {
  return (
    <div className="bg-white border border-base-200 rounded-md p-4">
      <h3 className="text-[13px] font-semibold text-base-900 mb-2">{title}</h3>
      <p className="text-[12px] text-base-500">See Pickups for full list.</p>
    </div>
  );
}
