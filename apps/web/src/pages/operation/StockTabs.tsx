import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Boxes, ArrowLeftRight, type LucideIcon } from "lucide-react";

/**
 * StockTabs — the shared top tab bar for the merged Stock module (K0,
 * Jess 2026-07-27; same pattern as PurchasingTabs, the 2026-07-21 merge).
 *
 * One warehouse, three questions:
 *   • On hand  → `/operation?tab=stock-onhand`  (what's here now)
 *   • In & out → `/operation?tab=movements`     (when things moved)
 *   • Ready stock (how much to keep) joins as the middle tab when K2 ships.
 *
 * Word law (COPY-STANDARD): the user-facing word is "Stock"; "Inventory" and
 * "Movements" are banned UI words. The in/out page's own h1 already reads
 * "Stock in & out history" — the tab label just says the same thing.
 */

type StockTab = "on-hand" | "in-out";

interface TabDef {
  key: StockTab;
  label: string;
  to: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { key: "on-hand", label: "On hand", to: "/operation?tab=stock-onhand", icon: Boxes },
  { key: "in-out", label: "In & out", to: "/operation?tab=movements", icon: ArrowLeftRight },
];

export default function StockTabs({ right }: { right?: ReactNode } = {}) {
  const location = useLocation();
  const tabParam = new URLSearchParams(location.search).get("tab");
  const active: StockTab = tabParam === "movements" ? "in-out" : "on-hand";

  return (
    <div
      className="shrink-0 bg-white border-b border-base-200 px-6"
      role="tablist"
      aria-label="Stock"
      data-testid="stock-tabs"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1">
          {TABS.map((t) => {
            const isActive = t.key === active;
            return (
              <Link
                key={t.key}
                to={t.to}
                role="tab"
                aria-selected={isActive}
                data-testid={`stock-tab-${t.key}`}
                className={[
                  "relative flex items-center gap-1.5 px-4 py-3 text-[13px] transition-colors border-b-2 -mb-px",
                  isActive
                    ? "border-primary text-base-900 font-semibold"
                    : "border-transparent text-base-600 font-medium hover:text-base-900",
                ].join(" ")}
              >
                <t.icon
                  size={14}
                  strokeWidth={2}
                  className={isActive ? "text-primary" : "text-base-400"}
                />
                {t.label}
              </Link>
            );
          })}
        </div>
        {right && (
          <div
            className="shrink-0 flex items-center gap-2 pr-1"
            data-testid="stock-tabs-right"
          >
            {right}
          </div>
        )}
      </div>
    </div>
  );
}
