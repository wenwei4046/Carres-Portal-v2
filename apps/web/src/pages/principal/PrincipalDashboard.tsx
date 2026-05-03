import { usePrincipalDashboard } from "@/lib/queries";
import KpiStrip from "./components/KpiStrip";
import DealerLeaderboard from "./components/DealerLeaderboard";
import ApprovalsTile from "./components/ApprovalsTile";
import AlertsTile from "./components/AlertsTile";
import RecentActivityTile from "./components/RecentActivityTile";

interface Props {
  setTab: (t: string) => void;
}

/**
 * Principal landing page — KPI strip + 4 tiles in a 1.4:1 grid.
 * Mirrors the proto's `compact` layout (`reference/proto/principal-dashboard.jsx`
 * lines 43-49). Detailed layout (sparkline + category breakdown) is out of
 * scope for Phase 3 MVP — comes back in Phase 5+.
 */
export default function PrincipalDashboard({ setTab }: Props) {
  const { data, isLoading, isError, error } = usePrincipalDashboard();

  if (isLoading || !data) {
    return <div className="px-9 py-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (isError) {
    return (
      <div className="px-9 py-8">
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Couldn&rsquo;t load dashboard: {(error as Error).message}
        </p>
      </div>
    );
  }

  const { kpis, leaderboard, pending_approvals, audit_recent, alerts } = data;

  return (
    <div className="px-9 py-8 pb-14">
      <div className="mb-7">
        <div className="kicker">HQ · Overview</div>
        <h1 className="font-display text-[34px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-semibold">
          The whole network, at a glance.
        </h1>
        <div className="text-[13px] text-base-600 mt-1.5">
          {kpis.total_dealers} dealers · {kpis.active_orders} active orders
        </div>
      </div>

      <KpiStrip kpis={kpis} setTab={setTab} />

      <div className="grid gap-[18px]" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <DealerLeaderboard stats={leaderboard} setTab={setTab} />
        <ApprovalsTile pending={pending_approvals} setTab={setTab} />
        <AlertsTile alerts={alerts} setTab={setTab} />
        <RecentActivityTile rows={audit_recent} />
      </div>
    </div>
  );
}
