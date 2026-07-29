// design-standard: not-a-list-page — the HR-P7 people-cost view inside the HR
// tabbed shell; the page header + month stepper live in HrApp.
import { useState } from "react";
import { Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  REVENUE_ABSENCE_LABEL,
  type CompRegisterRow,
  type PeopleCost,
} from "@carres/shared";
import Btn from "@/components/Btn";
import { fieldCls } from "@/components/Field";
import { SectionCard } from "@/components/SectionPanel";
import { rm } from "@/lib/format-currency";
import { useHrComp, useHrDeleteStaffComp, useHrSetStaffComp } from "@/lib/queries";

/**
 * People cost (HR-P7, migration 0278) — what the team costs, per month.
 *
 * THREE RULES LOO APPROVED, worth keeping straight when editing:
 *
 *  1. **Commission is never merged into the salary figure.** His words:
 *     "separate, don't merge". Two numbers, side by side, always. The shared
 *     engine has no field that sums them and a test enforces that — do not
 *     compute `fixedCost + commissionCost` in this file either.
 *  2. **HQ cost is never divided across stores.** Splitting head-office salary
 *     over one showroom would invent a figure and then judge the store against
 *     it. Overhead is labelled overhead.
 *  3. **The cost/revenue ratio is not printed while the month is running.**
 *     Live at build time, every order in the database sat in 21–26 Jul — six
 *     days of a 31-day month. A full month of salary over six days of sales
 *     reads as a collapse. It appears by itself once the month closes.
 *
 * This is the only screen in Carres that shows salary. It is hr + principal only
 * (D3), and every write is audited with the figures.
 */

const PILL: Record<string, string> = {
  ready: "pill pill-confirmed",
  waiting: "pill pill-warning",
  neutral: "pill pill-neutral",
};

function Tile({
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
    <div className="flex-1 min-w-[170px] rounded-lg border border-base-200 bg-card px-4 py-3">
      <div className="text-label uppercase tracking-[0.05em] text-base-500">{label}</div>
      <div
        className={`t-num text-page leading-8 font-semibold ${
          muted ? "text-base-400" : "text-base-900"
        }`}
      >
        {value}
      </div>
      <div className="text-meta text-base-500">{sub}</div>
    </div>
  );
}

interface EditState {
  employeeId: string;
  name: string;
  compId: string | null;
  base: string;
  allowance: string;
  burden: string;
  effectiveFrom: string;
}

function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function CompDialog({ edit, onClose }: { edit: EditState; onClose: () => void }) {
  const [base, setBase] = useState(edit.base);
  const [allowance, setAllowance] = useState(edit.allowance);
  const [burden, setBurden] = useState(edit.burden);
  const [from, setFrom] = useState(edit.effectiveFrom);
  const save = useHrSetStaffComp();
  const remove = useHrDeleteStaffComp();

  const n = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const preview =
    Number.isFinite(n(base)) && Number.isFinite(n(allowance)) && Number.isFinite(n(burden))
      ? (n(base) + n(allowance)) * (1 + n(burden) / 100)
      : null;

  const submit = () => {
    if (!Number.isFinite(n(base)) || n(base) < 0) {
      toast.error("Base cannot be negative");
      return;
    }
    if (n(burden) < 0 || n(burden) > 100) {
      toast.error("Burden must be between 0 and 100%");
      return;
    }
    save.mutate(
      {
        employeeId: edit.employeeId,
        baseMonthly: n(base),
        fixedAllowance: n(allowance),
        employerBurdenPct: n(burden),
        effectiveFrom: from,
      },
      {
        onSuccess: () => {
          toast.success(`${edit.name} · salary recorded`);
          onClose();
        },
        onError: (e) => toast.error(e.message || "Could not save"),
      },
    );
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] grid place-items-center p-5"
      style={{ background: "rgba(20,18,16,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded w-full max-w-[460px] overflow-hidden"
      >
        <div className="px-6 pt-5 pb-4 border-b border-base-100">
          <div className="kicker text-label">HR · People cost</div>
          <h2 className="font-display text-title mt-1 tracking-[-0.02em] font-semibold">
            {edit.compId ? "Edit salary" : "Record salary"}
          </h2>
          <div className="text-meta text-base-600 mt-1 leading-relaxed">
            {edit.name}. Saving against the same start date corrects this row; pick a
            later date for a raise and earlier months keep the figure they were
            actually incurred at.
          </div>
        </div>
        <div className="p-6 grid grid-cols-2 gap-3">
          <label className="text-meta font-semibold text-base-700">
            Base monthly (RM)
            <input
              autoFocus
              inputMode="decimal"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className={`${fieldCls} mt-1 font-normal t-num`}
            />
          </label>
          <label className="text-meta font-semibold text-base-700">
            Fixed allowance (RM)
            <input
              inputMode="decimal"
              value={allowance}
              onChange={(e) => setAllowance(e.target.value)}
              className={`${fieldCls} mt-1 font-normal t-num`}
            />
          </label>
          <label className="text-meta font-semibold text-base-700">
            Employer burden (%)
            <input
              inputMode="decimal"
              value={burden}
              onChange={(e) => setBurden(e.target.value)}
              className={`${fieldCls} mt-1 font-normal t-num`}
            />
          </label>
          <label className="text-meta font-semibold text-base-700">
            Applies from
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={`${fieldCls} mt-1 font-normal t-num`}
            />
          </label>
          <div className="col-span-2 rounded-lg bg-base-50 border border-base-200 px-3 py-2">
            <div className="text-label uppercase tracking-[0.05em] text-base-500">Loaded monthly cost</div>
            <div className="t-num text-strong font-semibold" data-testid="comp-loaded-preview">
              {preview === null ? "—" : rm(preview)}
            </div>
            <div className="text-meta text-base-500">
              (base + allowance) × (1 + burden). Burden is an estimate you type —
              Carres never computes EPF, SOCSO, EIS or PCB.
            </div>
          </div>
        </div>
        <div className="px-6 pb-5 flex items-center gap-2">
          <Btn variant="hero" onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <span className="flex-1" />
          {edit.compId && (
            <Btn
              variant="ghost"
              icon={Trash2}
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(edit.compId as string, {
                  onSuccess: () => {
                    toast.success("Salary row removed");
                    onClose();
                  },
                  onError: (e) => toast.error(e.message || "Could not remove it"),
                })
              }
            >
              Remove
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The three parts of fixed cost, as ONE bar.
 *
 * Deliberately greyscale. A first pass used a purple/blue/grey palette, which the
 * design-standard check caught as hard-coded hex — and it was the right catch for
 * a second reason: UI-KIT rule 2 reserves colour for action · selection · status ·
 * alert, and "which slice is allowance" is none of those. Three shades of the
 * neutral ramp give the contrast a composition bar actually needs. The segments
 * always sum to the total, so no track shows through.
 */
const COMPO_PARTS = [
  { key: "base", label: "Base", bar: "bg-base-800" },
  { key: "allowance", label: "Allowance", bar: "bg-base-500" },
  { key: "burden", label: "Employer burden", bar: "bg-base-300" },
] as const;

function CompositionBar({ cost }: { cost: PeopleCost }) {
  const total = cost.fixedCost;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-base-100 my-1.5">
        {COMPO_PARTS.map((p) => (
          <div
            key={p.key}
            className={p.bar}
            style={{ width: `${pct(cost.breakdown[p.key])}%` }}
          />
        ))}
      </div>
      <div className="text-meta text-base-500">
        {rm(cost.breakdown.base)} base + {rm(cost.breakdown.allowance)} allowance +{" "}
        {rm(cost.breakdown.burden)} employer burden — typed in, never computed
      </div>
    </>
  );
}

export default function HrPeopleCostTab({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const [edit, setEdit] = useState<EditState | null>(null);
  const { data, isLoading } = useHrComp(year, month);

  if (isLoading || !data) {
    return <div className="py-12 text-body text-base-500">Loading people cost…</div>;
  }

  const { cost } = data;
  const editFor = (r: CompRegisterRow): EditState => ({
    employeeId: r.employeeId,
    name: r.name,
    compId: r.compId,
    base: r.baseMonthly !== null ? String(r.baseMonthly) : "",
    allowance: r.fixedAllowance !== null ? String(r.fixedAllowance) : "0",
    burden: r.employerBurdenPct !== null ? String(r.employerBurdenPct) : "0",
    effectiveFrom: r.effectiveFrom ?? monthStart(year, month),
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Four tiles, none of which needs revenue to mean something. */}
      <div className="flex gap-3 flex-wrap">
        <Tile
          label="Monthly cost"
          value={rm(cost.fixedCost)}
          sub={`loaded · ${cost.recorded} of ${cost.headcount} recorded`}
          muted={cost.fixedCost === 0}
        />
        {/* Its own tile on purpose — never folded into the figure above. */}
        <Tile
          label="Commission"
          value={rm(cost.commissionCost)}
          sub={cost.commissionCost === 0 ? "no rates set up yet" : "this month, variable"}
          muted={cost.commissionCost === 0}
        />
        <Tile label="Headcount" value={String(cost.headcount)} sub="people on file" />
        <Tile
          label="Average per person"
          value={rm(cost.avgFixedPerPerson)}
          sub="fixed only, excludes commission"
          muted={cost.fixedCost === 0}
        />
      </div>

      <SectionCard>
        <div className="flex items-center gap-2 h-10 px-3 border-b border-base-200">
          <span className="text-strong text-base-900">Where the cost sits</span>
          <span className="flex-1" />
          <div className="flex gap-3 flex-wrap">
            {COMPO_PARTS.map((p) => (
              <span key={p.key} className="inline-flex items-center gap-1.5 text-meta text-base-500">
                <i className={`w-2 h-2 rounded-sm shrink-0 ${p.bar}`} aria-hidden="true" />
                {p.label}
              </span>
            ))}
          </div>
        </div>
        <div className="px-3 pt-2">
          <CompositionBar cost={cost} />
        </div>
        <div className="overflow-x-auto mt-2">
          <table className="w-full">
            <thead>
              <tr>
                {["Group", "People", "Loaded cost", "Revenue", "Cost of revenue"].map((h, i) => (
                  <th
                    key={h}
                    className={`text-label uppercase tracking-[0.05em] text-base-500 font-medium px-2.5 py-2 border-b border-base-200 whitespace-nowrap ${
                      i === 0 ? "text-left" : "text-right"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cost.groups.map((g) => (
                <tr key={g.name} className="hover:bg-hovertint">
                  <td className="px-2.5 h-11 text-strong font-medium">{g.name}</td>
                  <td className="px-2.5 h-11 text-body text-right t-num">{g.headcount}</td>
                  <td className="px-2.5 h-11 text-body text-right t-num font-medium">
                    {rm(g.fixedCost)}
                  </td>
                  <td className="px-2.5 h-11 text-body text-right t-num">
                    {g.revenue === null ? (
                      <span className="text-base-400">—</span>
                    ) : (
                      rm(g.revenue)
                    )}
                  </td>
                  <td className="px-2.5 h-11 text-body text-right">
                    {g.costPctOfRevenue !== null ? (
                      <span className="t-num font-semibold">{g.costPctOfRevenue}%</span>
                    ) : g.absence ? (
                      <span className="text-base-400">{REVENUE_ABSENCE_LABEL[g.absence]}</span>
                    ) : (
                      <span className={PILL.waiting}>partial month</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 flex flex-col gap-1.5">
          <p className="text-meta text-base-500">
            <b>Head-office cost is never divided across stores.</b> Splitting it over a
            showroom would invent a figure and then judge the store against it. Overhead
            is reported as overhead.
          </p>
          <p className="text-meta text-base-500 border-t border-base-200 pt-1.5">
            People with no department land in <b>Management</b> — the Chairman and COO are
            department-less by design (they top the org chart). Give anyone else a
            position on the Team tab and they move into their own row.
          </p>
        </div>
      </SectionCard>

      {cost.stores.map((s) => (
        <SectionCard key={s.dealerId}>
          <div className="flex items-center gap-2 h-10 px-3 border-b border-base-200">
            <span className="text-strong text-base-900">{s.name}</span>
            <span className="flex-1" />
            {s.costPctOfRevenue === null && (
              <span className={PILL.waiting}>ratio not shown yet</span>
            )}
          </div>
          <div className="p-3 flex flex-col gap-2.5">
            <div className="flex gap-7 flex-wrap">
              <div>
                <div className="text-label uppercase tracking-[0.05em] text-base-500">Staff cost</div>
                <div className="t-num text-title font-semibold">{rm(s.fixedCost)}</div>
              </div>
              <div>
                <div className="text-label uppercase tracking-[0.05em] text-base-500">Revenue on file</div>
                <div className="t-num text-title font-semibold">{rm(s.revenue)}</div>
              </div>
              <div>
                <div className="text-label uppercase tracking-[0.05em] text-base-500">Staff cost as % of revenue</div>
                <div
                  className={`t-num text-title font-semibold ${
                    s.costPctOfRevenue === null ? "text-base-400" : ""
                  }`}
                >
                  {s.costPctOfRevenue === null ? "—" : `${s.costPctOfRevenue}%`}
                </div>
              </div>
            </div>

            {cost.coverage.monthInProgress && (
              <div className="flex gap-2 items-start rounded-lg bg-warning-soft border border-base-200 px-3 py-2 text-body">
                <TriangleAlert size={14} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  {cost.coverage.partial ? (
                    <>
                      <b>
                        Sales on file cover {cost.coverage.firstOrderDate}–
                        {cost.coverage.lastOrderDate} — {cost.coverage.daysWithOrders} of{" "}
                        {cost.coverage.daysInMonth} days.
                      </b>{" "}
                    </>
                  ) : (
                    <b>This month is still running. </b>
                  )}
                  A full month of salary against part of a month of sales would read as a
                  wildly wrong ratio, so the percentage stays hidden until the month is
                  complete. It appears on its own — nothing to switch on.
                </div>
              </div>
            )}

            <p className="text-meta text-base-500">
              Revenue here is the same attributed figure the Performance tab and the
              Overview tile use — one computation, so the three screens cannot quote three
              numbers.
            </p>
          </div>
        </SectionCard>
      ))}

      <SectionCard>
        <div className="flex items-center gap-2 h-10 px-3 border-b border-base-200">
          <span className="text-strong text-base-900">Salary register</span>
          <span className="pill pill-neutral">
            {cost.recorded} of {cost.headcount} recorded
          </span>
          <span className="flex-1" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {["Who", "Position", "Base", "Allowance", "Burden", "Loaded", "From", ""].map(
                  (h, i) => (
                    <th
                      key={h || `sp-${i}`}
                      className={`text-label uppercase tracking-[0.05em] text-base-500 font-medium px-2.5 py-2 border-b border-base-200 whitespace-nowrap ${
                        i >= 2 && i <= 5 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {cost.register.map((r) => (
                <tr key={r.employeeId} className="hover:bg-hovertint">
                  <td className="px-2.5 h-11 text-body">
                    {r.name}
                    {r.staffCode && (
                      <span className="text-meta text-base-400 t-num"> {r.staffCode}</span>
                    )}
                  </td>
                  <td className="px-2.5 h-11 text-body text-base-500">
                    {r.positionName ?? (r.storeName ? r.storeName : "—")}
                  </td>
                  {r.compId === null ? (
                    <td
                      className="px-2.5 h-11 text-body text-base-400"
                      colSpan={5}
                    >
                      Nothing recorded yet
                    </td>
                  ) : (
                    <>
                      <td className="px-2.5 h-11 text-body text-right t-num">
                        {rm(r.baseMonthly ?? 0)}
                      </td>
                      <td className="px-2.5 h-11 text-body text-right t-num">
                        {rm(r.fixedAllowance ?? 0)}
                      </td>
                      <td className="px-2.5 h-11 text-body text-right t-num">
                        {r.employerBurdenPct}%
                      </td>
                      <td className="px-2.5 h-11 text-body text-right t-num font-semibold">
                        {rm(r.loaded ?? 0)}
                      </td>
                      <td className="px-2.5 h-11 text-body t-num">{r.effectiveFrom}</td>
                    </>
                  )}
                  <td className="px-2.5 h-11 text-right">
                    <Btn
                      variant="ghost"
                      size="sm"
                      icon={r.compId === null ? Plus : Pencil}
                      iconOnly
                      title={
                        r.compId === null
                          ? `Record a salary for ${r.name}`
                          : `Edit ${r.name}'s salary`
                      }
                      aria-label={
                        r.compId === null
                          ? `Record a salary for ${r.name}`
                          : `Edit ${r.name}'s salary`
                      }
                      onClick={() => setEdit(editFor(r))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 flex flex-col gap-1.5">
          <p className="text-meta text-base-500">
            A salary is <b>never edited in place</b> — a raise is a new row from the date it
            starts, so last month's cost stays what it actually was. Same rule as
            commission rates and targets.
          </p>
          <p className="text-meta text-base-500 border-t border-base-200 pt-1.5">
            <b>Carres never computes EPF, SOCSO, EIS or PCB.</b> Burden is one percentage a
            human types as an estimate so the cost figure is not misleadingly low. No
            payslip, no bank file, no e-filing — that stays with the payroll provider.
          </p>
        </div>
      </SectionCard>

      {edit && <CompDialog edit={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
