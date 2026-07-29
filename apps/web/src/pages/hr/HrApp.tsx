import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
// Unified Internal Portal — shared role-aware rail (no props, self-owned state).
import PortalSidebar from "@/pages/portal/PortalSidebar";
import PageHeader from "@/components/PageHeader";
import HrOverviewTab from "./HrOverviewTab";
import HrCommissionTab from "./HrCommissionTab";
import HrCommissionTabs from "./HrCommissionTabs";
import HrSetupTab from "./HrSetupTab";
import HrTeamTab from "./HrTeamTab";
import HrPeopleTab from "./HrPeopleTab";
import HrPerformanceTab from "./HrPerformanceTab";
import HrPeopleCostTab from "./HrPeopleCostTab";

/**
 * HR (HQ Internal) shell — sidebar + `?tab=` switched content
 * (0244/0245, 2026-07-25). Commission calculation for Carres' OWN sales
 * executives — no base payroll.
 *
 * Tabs (portal-nav.ts "hr" group): commission | setup.
 * `commission` and `setup` are ONE sidebar entry (Loo 2026-07-27) — the month
 * report and the rates that compute it are one subject, split by the
 * `HrCommissionTabs` sub-tab bar. Both `?tab=` values are unchanged, so every
 * existing deep link still lands where it did.
 *
 * `attribution` was retired the same day (Loo: "no more use for me"). Its
 * worklist lives inside Commission → Earnings now and only renders while an
 * order is unassigned; an old `?tab=attribution` bookmark falls through to
 * Overview like any other unknown tab.
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
      <span className="px-1.5 text-meta font-semibold tabular-nums text-base-900 min-w-[92px] text-center whitespace-nowrap">
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
  // O1: Overview is the LANDING tab — HR should open onto "what needs me
  // today", not straight into the commission table. Existing `?tab=` deep
  // links keep working unchanged; only the no-tab default moved.
  const tab =
    rawTab === "setup" ||
    rawTab === "team" ||
    rawTab === "people" ||
    rawTab === "performance" ||
    rawTab === "people-cost" ||
    rawTab === "commission"
      ? rawTab
      : "overview";

  const [ym, setYm] = useState<YearMonth>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  const title =
    tab === "team"
      ? "Team"
      : tab === "people"
        ? "People"
      : tab === "performance"
        ? `Performance · ${monthLabel(ym)}`
      : tab === "people-cost"
        ? `People cost · ${monthLabel(ym)}`
      : tab === "setup"
        // Under the sub-tab bar the page must not repeat the active tab
        // (COPY-STANDARD module-tab law) — the bar says "Setup". No month
        // either: a rate takes effect from today, it is not month-scoped.
        ? "Commission"
        : tab === "overview"
          ? `Overview · ${monthLabel(ym)}`
          : `Commission · ${monthLabel(ym)}`;

  // The Commission module = two sub-tabs behind ONE sidebar entry. Its own bar
  // carries the hairline, so the header drops its border (no double line).
  const inCommission = tab === "commission" || tab === "setup";

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
            noBorder={inCommission}
            className={inCommission ? "" : "mb-4"}
            actions={
              tab !== "setup" && tab !== "team" && tab !== "people" ? (
                <MonthStepper value={ym} onChange={setYm} />
              ) : undefined
            }
          />
          {inCommission && (
            <HrCommissionTabs active={tab === "setup" ? "setup" : "commission"} />
          )}
          {tab === "overview" && (
            <HrOverviewTab year={ym.year} month={ym.month} />
          )}
          {tab === "commission" && (
            <HrCommissionTab year={ym.year} month={ym.month} />
          )}
          {tab === "setup" && <HrSetupTab year={ym.year} month={ym.month} />}
          {tab === "team" && <HrTeamTab />}
          {tab === "people" && <HrPeopleTab />}
          {tab === "performance" && (
            <HrPerformanceTab year={ym.year} month={ym.month} />
          )}
          {tab === "people-cost" && (
            <HrPeopleCostTab year={ym.year} month={ym.month} />
          )}
        </div>
      </main>
    </div>
  );
}
