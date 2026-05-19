import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useMemo } from "react";
import { apiFetch } from "@/lib/api";

/**
 * Phase 10 · BD · Dashboard — `reference/proto/bd-dashboard.jsx` pixel parity.
 *
 * Rewritten 2026-05-19 — was inquiry-pipeline counts (wrong); BD's actual
 * mission is tracking existing active dealer sales movement. New layout:
 *   - "How every dealer is doing." header
 *   - 2 KPIs: Network GMV + Active dealers
 *   - Dealers-by-GMV leaderboard (progress bar + orders/active count)
 *   - Recent dealer activity feed (audit_log filtered by dealer_id NOT NULL)
 */

type DealerRow = {
  id: string;
  name: string;
  region: string | null;
  status: "active" | "pending" | "suspended" | "rejected";
  orderCount: number;
  gmv: number;
  outstanding: number;
};

type ActivityRow = {
  id: string;
  role: string | null;
  actor: string | null;
  action: string;
  dealerId: string | null;
  dealerName: string | null;
  occurredAt: string;
};

export default function BDDashboard() {
  const dealersQ = useQuery<{ dealers: DealerRow[] }>({
    queryKey: ["bd", "dealers"],
    queryFn: () => apiFetch("/api/bd/dealers"),
  });
  const activityQ = useQuery<{ rows: ActivityRow[] }>({
    queryKey: ["bd", "activity"],
    queryFn: () => apiFetch("/api/bd/dealers/activity"),
  });

  const dealers = dealersQ.data?.dealers ?? [];
  const activity = activityQ.data?.rows ?? [];

  const activeDealers = dealers.filter((d) => d.status === "active").length;
  const totalGmv = dealers.reduce((s, d) => s + d.gmv, 0);
  const totalOrders = dealers.reduce((s, d) => s + d.orderCount, 0);

  const ranked = useMemo(() => {
    return [...dealers].sort((a, b) => b.gmv - a.gmv);
  }, [dealers]);
  const maxGmv = Math.max(1, ...ranked.map((d) => d.gmv));

  return (
    <div className="px-9 py-8 pb-14">
      <div className="mb-7">
        <div className="kicker">BD · Network pulse</div>
        <h1 className="font-display text-[34px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-semibold">
          How every dealer is doing.
        </h1>
        <div className="text-[13px] text-base-600 mt-1.5">
          {dealers.length} dealers across the network · {totalOrders} orders to date
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 mb-6">
        <KPI label="Network GMV" value={`RM ${(totalGmv / 1000).toFixed(1)}k`} />
        <KPI label="Active dealers" value={`${activeDealers}/${dealers.length}`} />
      </div>

      <div className="grid gap-[18px]" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        {/* Dealers by GMV leaderboard */}
        <div className="bg-white border border-base-200 rounded">
          <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-base-100">
            <div className="font-display text-[16px] font-semibold">Dealers by GMV</div>
            <Link
              to="/bd/dealers"
              className="text-[11px] font-medium text-base-700 px-2.5 py-1 border border-base-200 rounded hover:bg-base-50"
            >
              Manage all
            </Link>
          </div>
          <div className="py-2">
            {dealersQ.isLoading && (
              <div className="px-[18px] py-4 text-[12px] text-base-500">Loading…</div>
            )}
            {!dealersQ.isLoading && ranked.length === 0 && (
              <div className="px-[18px] py-4 text-[12px] text-base-500">No dealers yet.</div>
            )}
            {ranked.map((d, i) => (
              <Link
                key={d.id}
                to={`/bd/dealers/${d.id}`}
                className={`block py-2.5 px-[18px] hover:bg-base-50 transition-colors ${d.status === "suspended" ? "opacity-50" : ""}`}
                style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", alignItems: "center", gap: 12 }}
              >
                <div className="font-mono text-[11px] text-base-400">{i + 1}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold">{d.name}</span>
                    {d.status !== "active" && (
                      <span className={`text-[9px] font-bold px-1.5 py-px rounded-full tracking-[0.06em] ${
                        d.status === "pending" ? "bg-primary/10 text-primary" : "bg-base-200 text-base-600"
                      }`}>
                        {d.status.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 mt-1">
                    <div className="flex-1 h-1 bg-base-100 rounded overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${(d.gmv / maxGmv) * 100}%` }} />
                    </div>
                    <div className="text-[10.5px] text-base-500">{d.region ?? "—"}</div>
                  </div>
                </div>
                <div className="text-right" style={{ minWidth: 110 }}>
                  <div className="font-mono text-[13px] font-bold">RM {(d.gmv / 1000).toFixed(1)}k</div>
                  <div className="text-[10px] text-base-500 mt-0.5">
                    {d.orderCount} order{d.orderCount !== 1 ? "s" : ""}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent dealer activity */}
        <div className="bg-white border border-base-200 rounded">
          <div className="px-[18px] py-3.5 border-b border-base-100">
            <div className="font-display text-[16px] font-semibold">Recent dealer activity</div>
          </div>
          <div className="py-1">
            {activityQ.isLoading && (
              <div className="px-[18px] py-4 text-[12px] text-base-500">Loading…</div>
            )}
            {!activityQ.isLoading && activity.length === 0 && (
              <div className="px-[18px] py-4 text-[12px] text-base-500">No recent activity.</div>
            )}
            {activity.map((a, i) => (
              <div
                key={a.id}
                className={`px-[18px] py-2.5 flex justify-between items-start gap-3 ${i ? "border-t border-base-100" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-base-700 leading-snug">{a.action}</div>
                  <div className="text-[10.5px] text-base-500 mt-0.5">
                    {a.dealerName ?? "—"}
                    {a.occurredAt ? ` · ${a.occurredAt.slice(0, 10)}` : ""}
                  </div>
                </div>
                {a.role && (
                  <span className="text-[9px] px-1.5 py-px bg-base-100 rounded-full text-base-600 font-semibold tracking-[0.06em] uppercase whitespace-nowrap">
                    {a.role}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-base-200 rounded p-4">
      <div className="kicker text-[9px]">{label}</div>
      <div className="font-display text-[26px] font-semibold mt-1 tracking-[-0.02em]">{value}</div>
    </div>
  );
}
