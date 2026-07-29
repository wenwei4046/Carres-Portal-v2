import type { PrincipalLeaderboardRow } from "@/lib/queries";

/**
 * Dealer leaderboard tile — top 4 dealers by GMV with a horizontal bar
 * indicating relative size. Mirrors `principal-dashboard.jsx` lines 79-109.
 * Suspended dealers render with 50% opacity + a SUSPENDED chip; pending
 * dealers get a terracotta PENDING chip.
 *
 * The bar is normalised against the highest-GMV dealer in the slice (so the
 * leader always reaches 100%). Empty state ("No dealers yet.") covers fresh
 * environments where no dealers have been invited yet.
 */
interface Props {
  stats: PrincipalLeaderboardRow[];
  setTab: (t: string) => void;
}

export default function DealerLeaderboard({ stats, setTab }: Props) {
  const max = Math.max(1, ...stats.map((s) => Number(s.gmv)));
  return (
    <div className="bg-white border border-base-200 rounded-md">
      <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-base-100">
        <div className="font-display text-strong font-semibold">Dealer leaderboard</div>
        <button
          type="button"
          onClick={() => setTab("dealers")}
          className="btn-secondary text-label py-1 px-2.5"
        >
          Manage all
        </button>
      </div>
      <div className="py-2">
        {stats.length === 0 ? (
          <div className="px-[18px] py-7 text-center text-meta text-base-500">
            No dealers yet.
          </div>
        ) : (
          stats.map((d, i) => (
            <div
              key={d.id}
              className={`px-[18px] py-2.5 grid items-center gap-3 ${
                d.status === "suspended" ? "opacity-50" : ""
              }`}
              style={{ gridTemplateColumns: "20px 1fr auto" }}
            >
              <div className="font-mono text-label text-base-400">{i + 1}</div>
              <div className="min-w-0">
                <div className="text-body font-semibold flex items-center gap-2">
                  <span className="truncate">{d.name}</span>
                  {d.status === "suspended" && (
                    <span className="text-label px-1.5 py-px bg-base-200 rounded-full text-base-600">
                      SUSPENDED
                    </span>
                  )}
                  {d.status === "pending" && (
                    <span className="text-label px-1.5 py-px bg-primary/10 rounded-full text-primary">
                      PENDING
                    </span>
                  )}
                </div>
                <div className="h-1 bg-base-100 rounded-sm mt-1.5 overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(Number(d.gmv) / max) * 100}%` }}
                  />
                </div>
                <div className="text-label text-base-500 mt-1">
                  {d.region} · {d.order_count} orders
                </div>
              </div>
              <div className="font-mono text-body font-semibold text-base-900">
                RM {(Number(d.gmv) / 1000).toFixed(1)}k
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
