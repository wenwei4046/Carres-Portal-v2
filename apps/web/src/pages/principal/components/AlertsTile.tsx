import type { PrincipalAlerts } from "@/lib/queries";

/**
 * Operational alerts tile — surfaces low-stock SKUs and the count of
 * suspended dealers. Mirrors `principal-dashboard.jsx` lines 136-164.
 * Empty state ("All systems normal.") fires when both signals are clear.
 *
 * Low-stock list comes from the dashboard RPC (currently always empty in
 * Phase 3 MVP — wired in Phase 4 when stock comes online). Suspended-dealer
 * row click-through routes to the dealers tab so the principal can review
 * who is benched and why.
 */
interface Props {
  alerts: PrincipalAlerts;
  setTab: (t: string) => void;
}

export default function AlertsTile({ alerts, setTab }: Props) {
  const { suspended_dealers, low_stock } = alerts;
  const isEmpty = suspended_dealers === 0 && low_stock.length === 0;

  return (
    <div className="bg-white border border-base-200 rounded-md">
      <div className="px-[18px] py-3.5 border-b border-base-100 font-display text-base font-semibold">
        Alerts
      </div>
      {isEmpty ? (
        <div className="p-7 text-center text-[12px] text-base-500">
          All systems normal.
        </div>
      ) : (
        <div>
          {low_stock.map((s) => (
            <div
              key={s.sku}
              className="px-[18px] py-2.5 border-t border-base-100 flex items-center gap-2.5"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <div className="flex-1 text-[12px]">{s.name}</div>
              <div className="font-mono text-[11px] text-base-600">
                {s.available} left &middot; {s.incoming} incoming
              </div>
            </div>
          ))}
          {suspended_dealers > 0 && (
            <button
              type="button"
              onClick={() => setTab("dealers")}
              className="w-full px-[18px] py-2.5 border-t border-base-100 flex items-center gap-2.5 text-left bg-transparent cursor-pointer hover:bg-base-50 transition-colors"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-base-500" />
              <div className="flex-1 text-[12px]">
                {suspended_dealers} dealer{suspended_dealers > 1 ? "s" : ""} suspended
              </div>
              <div className="text-[11px] text-base-500">Review &rarr;</div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
