// design-standard: not-a-list-page — the HR landing digest inside the HR
// tabbed shell; the page header (title + month stepper) is rendered by HrApp.
import { Link } from "react-router-dom";
import { AlertTriangle, Check } from "lucide-react";
import { SectionCard } from "@/components/SectionPanel";
import { rm } from "@/lib/format-currency";
import { useHrReport } from "@/lib/queries";

/**
 * Overview (O1) — the HR landing page: what the month is worth, and what
 * actually needs a human.
 *
 * Design rule this page exists to enforce: **a count that can never reach
 * zero is not an alert.** Before 0265 the attribution worklist showed 37
 * imported-archive orders that no salesperson could ever own, so it read
 * "37 things need you" forever and taught HR to ignore the number. Those
 * rows are now excluded at the source and reported as a footnote instead.
 *
 * Empty is a legitimate, informative state here — "nothing needs you today"
 * is the answer HR wants most mornings, not a sign the page is broken.
 */

function StatTile({
  label,
  value,
  sub,
  muted,
}: {
  label: string;
  value: string;
  sub: string;
  muted?: boolean;
}) {
  return (
    <div className="flex-1 min-w-[160px] rounded-lg border border-base-200 bg-card px-4 py-3">
      <div className="t-micro text-base-500">{label}</div>
      <div
        className={`t-num text-[24px] leading-8 font-semibold ${
          muted ? "text-base-400" : "text-base-900"
        }`}
      >
        {value}
      </div>
      <div className="t-tiny text-base-500">{sub}</div>
    </div>
  );
}

/** One thing a human has to act on. */
function TodoRow({ text, to }: { text: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 h-9 px-2 rounded hover:bg-hovertint text-[13px] text-base-900"
    >
      <AlertTriangle size={14} className="text-warning shrink-0" />
      <span className="flex-1 min-w-0 truncate">{text}</span>
      <span className="t-tiny text-base-500 shrink-0">Open →</span>
    </Link>
  );
}

export default function HrOverviewTab({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const { data, isLoading } = useHrReport(year, month);

  if (isLoading || !data) {
    return <div className="py-12 text-[13px] text-base-500">Loading overview…</div>;
  }

  const { report, bdReport, unattributed, staff, config } = data;
  // Both keys arrived with 0265; a Worker that predates it simply omits them.
  // Falling back to the report's own basis keeps the tile honest rather than
  // showing RM 0 as if nothing sold.
  const legacyUnattributed = data.legacyUnattributed ?? 0;
  const monthSold = data.monthSold ?? {
    amount: report.totalBasis,
    orderCount: report.perStaff.reduce((n, s) => n + s.orderCount, 0),
  };

  const commissionTotal = report.totalCommission + (bdReport?.totalCommission ?? 0);
  const ratedStaffIds = new Set((config.rates ?? []).map((r) => r.salespersonId));
  const activeStaff = staff.filter((s) => s.active);
  const staffWithoutRate = activeStaff.filter((s) => !ratedStaffIds.has(s.id));

  // Everything that genuinely needs a person. Each row is actionable — if it
  // cannot be acted on it does not belong here (see the header note).
  const todos: { text: string; to: string }[] = [];
  if (unattributed.length > 0) {
    todos.push({
      text: `${unattributed.length} order${unattributed.length === 1 ? "" : "s"} without a salesperson`,
      // Attribution retired 2026-07-27 — the worklist opens on Commission →
      // Earnings, under the warning it belongs to.
      to: "/hr?tab=commission",
    });
  }
  if (commissionTotal === 0 && staffWithoutRate.length === activeStaff.length && activeStaff.length > 0) {
    todos.push({
      text: "No commission rates set up yet — everyone earns RM 0",
      to: "/hr?tab=setup",
    });
  } else if (staffWithoutRate.length > 0) {
    todos.push({
      text: `${staffWithoutRate.length} staff without a commission rate`,
      to: "/hr?tab=setup",
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 flex-wrap">
        <StatTile
          label="SOLD"
          value={rm(monthSold.amount)}
          sub={`${monthSold.orderCount} order${monthSold.orderCount === 1 ? "" : "s"}`}
        />
        <StatTile
          label="COMMISSION"
          value={rm(commissionTotal)}
          sub={commissionTotal === 0 ? "no rates set up yet" : "staff + BD"}
          muted={commissionTotal === 0}
        />
        <StatTile
          label="PEOPLE"
          value={String(activeStaff.length)}
          sub="active showroom staff"
        />
      </div>

      <SectionCard>
        {/* Deliberately NOT a SectionBand: that one collapses, and the whole
            point of this card is that it is always in your face. */}
        <div className="flex items-center gap-2 h-10 px-3 border-b border-base-200">
          <span className="t-h4 text-base-900">Needs a human</span>
          {todos.length > 0 && (
            <span className="pill pill-overdue">{todos.length}</span>
          )}
        </div>
        <div className="p-2">
          {todos.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-3 text-[13px] text-base-700">
              <Check size={16} className="text-success shrink-0" />
              Nothing needs you today.
            </div>
          ) : (
            <div className="flex flex-col">
              {todos.map((t) => (
                <TodoRow key={t.to + t.text} text={t.text} to={t.to} />
              ))}
            </div>
          )}

          {legacyUnattributed > 0 && (
            <p className="t-tiny text-base-500 px-2 pt-2 border-t border-base-200 mt-2">
              {legacyUnattributed} imported archive order
              {legacyUnattributed === 1 ? " is" : "s are"} not counted here — they
              came from the old system and never had a salesperson, so there is
              nothing to assign.
            </p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
