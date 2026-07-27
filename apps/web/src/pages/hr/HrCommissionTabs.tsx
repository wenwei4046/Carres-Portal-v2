import { Link } from "react-router-dom";
import { HandCoins, SlidersHorizontal, type LucideIcon } from "lucide-react";

/**
 * HrCommissionTabs — the shared sub-tab bar for the merged Commission module
 * (Loo 2026-07-27; same pattern as StockTabs (K0) and PurchasingTabs).
 *
 * Commission was TWO sidebar entries — the month report and the rate config —
 * for one subject. They are one module now, asked as two questions:
 *   • Earnings → `/hr?tab=commission`  (what each person earned this month)
 *   • Setup    → `/hr?tab=setup`       (the rates that compute it)
 *
 * URL-driven, not local state: every existing `?tab=setup` deep link (the
 * Overview "Needs a human" card, the BD "Assign in Setup" link) keeps working
 * unchanged, and the browser back button walks the two like real pages.
 */

export type CommissionSubTab = "commission" | "setup";

interface TabDef {
  key: CommissionSubTab;
  label: string;
  to: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { key: "commission", label: "Earnings", to: "/hr?tab=commission", icon: HandCoins },
  { key: "setup", label: "Setup", to: "/hr?tab=setup", icon: SlidersHorizontal },
];

export default function HrCommissionTabs({ active }: { active: CommissionSubTab }) {
  return (
    <div
      className="border-b border-base-200 mb-5"
      role="tablist"
      aria-label="Commission"
      data-testid="hr-commission-tabs"
    >
      <div className="flex gap-1">
        {TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              to={t.to}
              role="tab"
              aria-selected={isActive}
              data-testid={`hr-commission-tab-${t.key}`}
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
    </div>
  );
}
