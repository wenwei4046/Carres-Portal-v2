import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
// Unified Internal Portal — shared role-aware rail (no props, self-owned state).
import PortalSidebar from "@/pages/portal/PortalSidebar";
import PageHeader from "@/components/PageHeader";
import HrCommissionTab from "./HrCommissionTab";
import HrAttributionTab from "./HrAttributionTab";
import HrSetupTab from "./HrSetupTab";
import HrTeamTab from "./HrTeamTab";

/**
 * HR (HQ Internal) shell — sidebar + `?tab=` switched content
 * (0244/0245, 2026-07-25). Commission calculation for Carres' OWN sales
 * executives — no base payroll.
 *
 * Tabs (portal-nav.ts "hr" group): commission | attribution | setup.
 * URL-driven like OperationApp: PortalSidebar links to `/hr?tab=<key>`, and
 * this shell reads the param directly (HR has no path-driven sections, so no
 * local tab state is needed — the URL IS the tab).
 *
 * One shared month (year + month, default = current month) feeds BOTH the
 * commission report and the attribution worklist so stepping the month in
 * either place keeps the two views in sync.
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

export function monthLabel({ year, month }: YearMonth): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function stepMonth({ year, month }: YearMonth, delta: -1 | 1): YearMonth {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Compact ◀ month ▶ stepper — grey rail like Segmented, view control only. */
function MonthStepper({
  value,
  onChange,
}: {
  value: YearMonth;
  onChange: (next: YearMonth) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 bg-base-100 rounded-full p-0.5 h-8 shrink-0">
      <button
        type="button"
        title="Previous month"
        aria-label="Previous month"
        onClick={() => onChange(stepMonth(value, -1))}
        className="w-7 h-7 rounded-full inline-flex items-center justify-center text-base-500 hover:text-base-900 hover:bg-hovertint"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <span className="px-1.5 text-[12px] font-semibold tabular-nums text-base-900 min-w-[92px] text-center whitespace-nowrap">
        {MONTH_NAMES[value.month - 1].slice(0, 3)} {value.year}
      </span>
      <button
        type="button"
        title="Next month"
        aria-label="Next month"
        onClick={() => onChange(stepMonth(value, 1))}
        className="w-7 h-7 rounded-full inline-flex items-center justify-center text-base-500 hover:text-base-900 hover:bg-hovertint"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function HrApp() {
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab =
    rawTab === "attribution" || rawTab === "setup" || rawTab === "team"
      ? rawTab
      : "commission";

  const [ym, setYm] = useState<YearMonth>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  const title =
    tab === "team"
      ? "Team"
      : tab === "setup"
        ? "Commission Setup"
        : tab === "attribution"
          ? `Attribution · ${monthLabel(ym)}`
          : `Commission · ${monthLabel(ym)}`;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <PortalSidebar />
      <main className="flex-1 min-w-0">
        {/* px-9 py-8 = the portal page-frame law (matches Overview/Accounts) —
            the header needs breathing room above the kicker, not flush-top. */}
        <div className="px-9 py-8 pb-14 max-w-[1200px] mx-auto">
          <PageHeader
            kicker="HR"
            title={title}
            className="mb-4"
            actions={
              tab !== "setup" && tab !== "team" ? (
                <MonthStepper value={ym} onChange={setYm} />
              ) : undefined
            }
          />
          {tab === "commission" && (
            <HrCommissionTab year={ym.year} month={ym.month} />
          )}
          {tab === "attribution" && (
            <HrAttributionTab year={ym.year} month={ym.month} />
          )}
          {tab === "setup" && <HrSetupTab year={ym.year} month={ym.month} />}
          {tab === "team" && <HrTeamTab />}
        </div>
      </main>
    </div>
  );
}
