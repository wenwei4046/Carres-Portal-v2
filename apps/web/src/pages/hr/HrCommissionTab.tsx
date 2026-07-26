// design-standard: not-a-list-page — month report table inside the HR tabbed
// shell; the page header (title + month stepper) is rendered by HrApp.
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { STAFF_TIER_LABEL, type BdCommissionResult, type StaffCommissionResult } from "@carres/shared";
import { useHrReport } from "@/lib/queries";
import { rm } from "@/lib/format-currency";

/**
 * Commission tab — the computed month report (0244/0245).
 * Every showroom staff shows even at RM0; a chevron expands the row into the
 * plain-prose breakdown (override / per-model / milestones).
 * 0250 adds the BD commission section below — BD staff earn a % of what
 * their assigned dealers sell; a chevron expands the dealer portfolio.
 */

function StaffBreakdown({ row }: { row: StaffCommissionResult }) {
  const hasAnything =
    row.overrideDetail.length > 0 ||
    row.perModel.length > 0 ||
    row.milestones.length > 0 ||
    row.basis > 0;
  return (
    <div className="px-10 py-3 space-y-3">
      {!hasAnything && (
        <div className="text-[12px] text-base-500">
          No commission activity this month.
        </div>
      )}

      {row.basis > 0 && (
        <div className="text-[12px] text-base-700">
          Sold <span className="t-num font-semibold">{rm(row.basis)}</span> of
          items personally
          {row.pctUsed != null && (
            <>
              {" "}
              at a{" "}
              <span className="t-num font-semibold">{row.pctUsed}%</span> rate
            </>
          )}
          {" — earns "}
          <span className="t-num font-semibold">
            {rm(row.directCommission)}
          </span>
          .
        </div>
      )}

      {row.overrideDetail.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-base-500 mb-1">
            Override from team sales
          </div>
          <ul className="space-y-0.5">
            {row.overrideDetail.map((d) => (
              <li key={d.fromStaffId} className="text-[12px] text-base-700">
                From {d.fromStaffName} —{" "}
                <span className="t-num font-semibold">{rm(d.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {row.perModel.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-base-500 mb-1">
            Per-model earnings
          </div>
          <ul className="space-y-0.5">
            {row.perModel.map((m) => (
              <li key={m.modelId} className="text-[12px] text-base-700">
                {m.modelName} — {m.units} unit{m.units === 1 ? "" : "s"} ×{" "}
                <span className="t-num">{rm(m.perUnitAmount)}</span> each ={" "}
                <span className="t-num font-semibold">
                  {rm(m.unitCommission)}
                </span>
                {m.tierBonus > 0 && m.tierThreshold != null && (
                  <>
                    {" "}
                    · volume bonus{" "}
                    <span className="t-num font-semibold">
                      {rm(m.tierBonus)}
                    </span>{" "}
                    for reaching {m.tierThreshold} units
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {row.milestones.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-base-500 mb-1">
            Milestone bonuses
          </div>
          <ul className="space-y-0.5">
            {row.milestones.map((m, i) => (
              <li key={i} className="text-[12px] text-base-700">
                {m.units} unit{m.units === 1 ? "" : "s"} of{" "}
                {m.category ?? "all items"} sold — passed the {m.thresholdQty}
                -unit milestone, bonus{" "}
                <span className="t-num font-semibold">{rm(m.bonusAmount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BdBreakdown({ row }: { row: BdCommissionResult }) {
  const hasAnything =
    row.portfolio.length > 0 ||
    row.overrideDetail.length > 0 ||
    row.perModel.length > 0 ||
    row.milestones.length > 0;
  return (
    <div className="px-10 py-3 space-y-3">
      {!hasAnything && (
        <div className="text-[12px] text-base-500">
          No dealer sales this month.
        </div>
      )}

      {row.portfolio.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-base-500 mb-1">
            Dealer portfolio
          </div>
          <ul className="space-y-0.5">
            {row.portfolio.map((p) => (
              <li key={p.dealerId} className="text-[12px] text-base-700">
                {p.dealerName} — {p.orderCount} order
                {p.orderCount === 1 ? "" : "s"},{" "}
                <span className="t-num">{rm(p.amount)}</span> sold
                {p.commission > 0 && (
                  <>
                    , commission{" "}
                    <span className="t-num font-semibold">
                      {rm(p.commission)}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {row.overrideDetail.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-base-500 mb-1">
            Override from BD Executives' dealer sales
          </div>
          <ul className="space-y-0.5">
            {row.overrideDetail.map((d) => (
              <li key={d.fromStaffId} className="text-[12px] text-base-700">
                Override from {d.fromStaffName} —{" "}
                <span className="t-num font-semibold">{rm(d.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {row.perModel.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-base-500 mb-1">
            Per-model earnings
          </div>
          <ul className="space-y-0.5">
            {row.perModel.map((m) => (
              <li key={m.modelId} className="text-[12px] text-base-700">
                {m.modelName} — {m.units} unit{m.units === 1 ? "" : "s"} ×{" "}
                <span className="t-num">{rm(m.perUnitAmount)}</span> each ={" "}
                <span className="t-num font-semibold">
                  {rm(m.unitCommission)}
                </span>
                {m.tierBonus > 0 && m.tierThreshold != null && (
                  <>
                    {" "}
                    · volume bonus{" "}
                    <span className="t-num font-semibold">
                      {rm(m.tierBonus)}
                    </span>{" "}
                    for reaching {m.tierThreshold} units
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {row.milestones.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-base-500 mb-1">
            Milestone bonuses
          </div>
          <ul className="space-y-0.5">
            {row.milestones.map((m, i) => (
              <li key={i} className="text-[12px] text-base-700">
                {m.units} unit{m.units === 1 ? "" : "s"} of{" "}
                {m.category ?? "all items"} sold — passed the {m.thresholdQty}
                -unit milestone, bonus{" "}
                <span className="t-num font-semibold">{rm(m.bonusAmount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function HrCommissionTab({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const { data, isLoading, isError } = useHrReport(year, month);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (isLoading) {
    return <div className="py-12 text-[13px] text-base-500">Loading the month report…</div>;
  }
  if (isError || !data) {
    return (
      <div className="py-12 text-[13px] text-danger">
        Failed to load the commission report. Refresh to retry.
      </div>
    );
  }

  const { report, bdReport, unattributed } = data;

  return (
    <div className="space-y-4">
      {/* Summary row — three independent white KPI cards (UI-KIT §A8). */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="kpi-box">
          <div className="text-[12px] uppercase tracking-[0.06em] text-base-500">
            Total commission
          </div>
          <div className="text-[18px] font-bold t-num mt-0.5">
            {rm(report.totalCommission)}
          </div>
        </div>
        <div className="kpi-box">
          <div className="text-[12px] uppercase tracking-[0.06em] text-base-500">
            Total sales basis
          </div>
          <div className="text-[18px] font-bold t-num mt-0.5">
            {rm(report.totalBasis)}
          </div>
        </div>
        <div className="kpi-box">
          <div className="text-[12px] uppercase tracking-[0.06em] text-base-500">
            Staff
          </div>
          <div className="text-[18px] font-bold t-num mt-0.5">
            {report.perStaff.length}
          </div>
        </div>
      </div>

      {/* Under-count warning — commission money is wrong until every order
          carries a salesperson, so this is loud + links to the worklist. */}
      {unattributed.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-2.5">
          <AlertTriangle size={16} className="shrink-0 text-warning" aria-hidden="true" />
          <div className="flex-1 text-[13px] text-base-900">
            {unattributed.length} order{unattributed.length === 1 ? "" : "s"}{" "}
            this month {unattributed.length === 1 ? "has" : "have"} no
            salesperson — commission is under-counted.
          </div>
          <Link
            to="/hr?tab=attribution"
            className="shrink-0 inline-flex items-center h-8 px-4 rounded-full text-[13px] font-semibold bg-base-100 text-base-900 hover:bg-base-200"
          >
            Assign now
          </Link>
        </div>
      )}

      {/* Per-staff table */}
      <div className="bg-white border border-base-200 rounded-[12px] overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-9" />
            <col />
            <col className="w-[7%]" />
            <col className="w-[13%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-base-200">
              <th aria-label="Expand" />
              <th className="text-left px-2 py-2 text-[12px] font-semibold text-base-900">
                Name
              </th>
              <th className="text-right px-2 py-2 text-[12px] font-semibold text-base-900">
                Orders
              </th>
              <th className="text-right px-2 py-2 text-[12px] font-semibold text-base-900">
                Sales basis
              </th>
              <th className="text-right px-2 py-2 text-[12px] font-semibold text-base-900">
                Direct
              </th>
              <th className="text-right px-2 py-2 text-[12px] font-semibold text-base-900">
                Override
              </th>
              <th className="text-right px-2 py-2 text-[12px] font-semibold text-base-900">
                Per-model
              </th>
              <th className="text-right px-2 py-2 text-[12px] font-semibold text-base-900">
                Milestone
              </th>
              <th className="text-right px-3 py-2 text-[12px] font-semibold text-base-900">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {report.perStaff.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-[13px] text-base-500">
                  No showroom staff found. Add staff from the store's POS Staff
                  page first.
                </td>
              </tr>
            )}
            {report.perStaff.map((row) => {
              const open = expanded.has(row.staff.id);
              return (
                <Fragment key={row.staff.id}>
                  <tr
                    className="h-11 border-b border-base-100 hover:bg-hovertint cursor-pointer"
                    onClick={() => toggle(row.staff.id)}
                  >
                    <td className="pl-2">
                      <button
                        type="button"
                        aria-label={open ? "Hide breakdown" : "Show breakdown"}
                        aria-expanded={open}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(row.staff.id);
                        }}
                        className="w-6 h-6 rounded-full inline-flex items-center justify-center text-base-500 hover:text-base-900"
                      >
                        {open ? (
                          <ChevronDown size={14} aria-hidden="true" />
                        ) : (
                          <ChevronRight size={14} aria-hidden="true" />
                        )}
                      </button>
                    </td>
                    <td className="px-2 whitespace-nowrap overflow-hidden">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[13px] font-semibold text-base-900 truncate">
                          {row.staff.name}
                        </span>
                        <span className="pill pill-neutral shrink-0">
                          {STAFF_TIER_LABEL[row.staff.staffRole] ?? row.staff.staffRole}
                        </span>
                      </div>
                      <div className="text-[11px] text-base-500 truncate">
                        {[row.staff.storeName, row.staff.outletName]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-2 text-right text-[13px] t-num">
                      {row.orderCount}
                    </td>
                    <td className="px-2 text-right text-[13px] t-num">
                      {rm(row.basis)}
                    </td>
                    <td className="px-2 text-right text-[13px] t-num">
                      {rm(row.directCommission)}
                    </td>
                    <td className="px-2 text-right text-[13px] t-num">
                      {rm(row.overrideCommission)}
                    </td>
                    <td className="px-2 text-right text-[13px] t-num">
                      {rm(row.perModelCommission)}
                    </td>
                    <td className="px-2 text-right text-[13px] t-num">
                      {rm(row.milestoneCommission)}
                    </td>
                    <td className="px-3 text-right text-[13px] t-num font-bold">
                      {rm(row.total)}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-base-100 bg-base-50">
                      <td colSpan={9}>
                        <StaffBreakdown row={row} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 0250 — BD commission: paid by what their assigned dealers sell. */}
      <div className="pt-2">
        <div className="text-[14px] font-semibold text-base-900">
          BD commission — paid by dealer sales
        </div>
        <div className="text-[12px] text-base-500">
          {bdReport.method === "per_model"
            ? "Per model · item KPI"
            : "% of dealer sales"}
        </div>
      </div>

      {bdReport.unassignedDealers.length > 0 && (
        <div className="flex items-center gap-1.5 text-[12px] text-base-700">
          <AlertTriangle
            size={14}
            className="shrink-0 text-warning"
            aria-hidden="true"
          />
          <span>
            {bdReport.unassignedDealers.length} dealer
            {bdReport.unassignedDealers.length === 1 ? " has" : "s have"} no BD
            owner — their sales pay nobody.
          </span>
          <Link
            to="/hr?tab=setup"
            className="font-semibold text-base-900 underline underline-offset-2"
          >
            Assign in Setup
          </Link>
        </div>
      )}

      <div className="bg-white border border-base-200 rounded-[12px] overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-9" />
            <col />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-base-200">
              <th aria-label="Expand" />
              <th className="text-left px-2 py-2 text-[12px] font-semibold text-base-900">
                Name
              </th>
              <th className="text-right px-2 py-2 text-[12px] font-semibold text-base-900">
                Dealers
              </th>
              <th className="text-right px-2 py-2 text-[12px] font-semibold text-base-900">
                Orders
              </th>
              <th className="text-right px-2 py-2 text-[12px] font-semibold text-base-900">
                Sales basis
              </th>
              <th className="text-right px-2 py-2 text-[12px] font-semibold text-base-900">
                Direct
              </th>
              <th className="text-right px-2 py-2 text-[12px] font-semibold text-base-900">
                Override
              </th>
              <th className="text-right px-2 py-2 text-[12px] font-semibold text-base-900">
                Per-model
              </th>
              <th className="text-right px-2 py-2 text-[12px] font-semibold text-base-900">
                Milestone
              </th>
              <th className="text-right px-3 py-2 text-[12px] font-semibold text-base-900">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {bdReport.perBd.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-8 text-center text-[13px] text-base-500"
                >
                  No BD accounts found.
                </td>
              </tr>
            )}
            {bdReport.perBd.map((row) => {
              const open = expanded.has(row.user.id);
              return (
                <Fragment key={row.user.id}>
                  <tr
                    className="h-11 border-b border-base-100 hover:bg-hovertint cursor-pointer"
                    onClick={() => toggle(row.user.id)}
                  >
                    <td className="pl-2">
                      <button
                        type="button"
                        aria-label={open ? "Hide portfolio" : "Show portfolio"}
                        aria-expanded={open}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(row.user.id);
                        }}
                        className="w-6 h-6 rounded-full inline-flex items-center justify-center text-base-500 hover:text-base-900"
                      >
                        {open ? (
                          <ChevronDown size={14} aria-hidden="true" />
                        ) : (
                          <ChevronRight size={14} aria-hidden="true" />
                        )}
                      </button>
                    </td>
                    <td className="px-2 whitespace-nowrap overflow-hidden">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[13px] font-semibold text-base-900 truncate">
                          {row.user.name}
                        </span>
                        <span className="pill pill-neutral shrink-0">
                          {row.position === "cbo" ? "CBO" : "BD Executive"}
                        </span>
                      </div>
                      <div className="text-[11px] text-base-500 truncate">
                        {row.user.email}
                      </div>
                    </td>
                    <td className="px-2 text-right text-[13px] t-num">
                      {row.dealerCount}
                    </td>
                    <td className="px-2 text-right text-[13px] t-num">
                      {row.orderCount}
                    </td>
                    <td className="px-2 text-right text-[13px] t-num">
                      {rm(row.basis)}
                    </td>
                    <td className="px-2 text-right text-[13px] t-num">
                      {row.directCommission > 0 ? rm(row.directCommission) : "—"}
                    </td>
                    <td className="px-2 text-right text-[13px] t-num">
                      {row.overrideCommission > 0
                        ? rm(row.overrideCommission)
                        : "—"}
                    </td>
                    <td className="px-2 text-right text-[13px] t-num">
                      {row.perModelCommission > 0
                        ? rm(row.perModelCommission)
                        : "—"}
                    </td>
                    <td className="px-2 text-right text-[13px] t-num">
                      {row.milestoneCommission > 0
                        ? rm(row.milestoneCommission)
                        : "—"}
                    </td>
                    <td className="px-3 text-right text-[13px] t-num font-bold">
                      {rm(row.commission)}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-base-100 bg-base-50">
                      <td colSpan={10}>
                        <BdBreakdown row={row} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
