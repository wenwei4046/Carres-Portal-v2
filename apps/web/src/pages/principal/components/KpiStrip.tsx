import type { PrincipalDashboardKpis } from "@/lib/queries";

/**
 * KPI strip — 5 cards in a single row above the dashboard tiles.
 * Mirrors the proto's KPI helper (`reference/proto/principal-dashboard.jsx`
 * `KPI` lines 68-77). The Pending KPI gets an accent fill (light terracotta)
 * + click-through to the approvals tab when there's anything awaiting a
 * decision; otherwise it renders as a plain stat card.
 *
 * GMV is formatted as `RM 1.0k` for readability — the proto uses the same
 * (`/1000).toFixed(1)`) format. Active dealers reads `4/5` (active over
 * total non-rejected).
 */
interface KpiCardProps {
  label: string;
  value: string | number;
  accent?: boolean;
  onClick?: () => void;
}

function KpiCard({ label, value, accent, onClick }: KpiCardProps) {
  const baseCls =
    "px-[18px] py-4 rounded-md flex flex-col gap-1 text-left";
  const surfaceCls = accent
    ? "bg-primary/5 border border-primary/30"
    : "bg-white border border-base-200";
  const cls = `${baseCls} ${surfaceCls}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cls} cursor-pointer hover:border-primary/50 transition-colors`}
      >
        <div className="text-[9.5px] uppercase tracking-wider text-base-500 font-semibold">
          {label}
        </div>
        <div className="font-display text-[26px] font-semibold tracking-tight text-base-900">
          {value}
        </div>
      </button>
    );
  }
  return (
    <div className={cls}>
      <div className="text-[9.5px] uppercase tracking-wider text-base-500 font-semibold">
        {label}
      </div>
      <div className="font-display text-[26px] font-semibold tracking-tight text-base-900">
        {value}
      </div>
    </div>
  );
}

interface Props {
  kpis: PrincipalDashboardKpis;
  setTab: (t: string) => void;
}

const fmtMoney = (n: number) => `RM ${(n / 1000).toFixed(1)}k`;

export default function KpiStrip({ kpis, setTab }: Props) {
  return (
    <div className="grid grid-cols-5 gap-[14px] mb-6">
      <KpiCard label="GMV (period)" value={fmtMoney(Number(kpis.total_gmv ?? 0))} />
      <KpiCard label="Active orders" value={kpis.active_orders} />
      <KpiCard
        label="Active dealers"
        value={`${kpis.active_dealers}/${kpis.total_dealers}`}
      />
      <KpiCard
        label="Pending approvals"
        value={kpis.pending_approvals}
        accent={kpis.pending_approvals > 0}
        onClick={
          kpis.pending_approvals > 0 ? () => setTab("approvals") : undefined
        }
      />
      <KpiCard label="Low-stock SKUs" value={kpis.low_stock_skus} />
    </div>
  );
}
