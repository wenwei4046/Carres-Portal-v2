// design-standard: not-a-list-page — the HR-P6 scoreboard inside the HR tabbed
// shell; the page header + month stepper live in HrApp.
import { useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_KPI,
  KPI_METRICS,
  kpiMetric,
  kpiTone,
  managerViewReady,
  type KpiKey,
  type KpiSource,
  type ScorecardRow,
  type Scorecards,
} from "@carres/shared";
import Btn from "@/components/Btn";
import { fieldCls } from "@/components/Field";
import Segmented from "@/components/Segmented";
import { SectionCard } from "@/components/SectionPanel";
import { rm } from "@/lib/format-currency";
import {
  useHrDeleteKpiTarget,
  useHrKpi,
  useHrSetKpiTarget,
  useHrSetStoreManager,
} from "@/lib/queries";

/**
 * Performance (HR-P6, migration 0276) — "are we on track this month".
 *
 * THREE DESIGN RULES LOO APPROVED, worth keeping straight when editing:
 *
 *  1. A person with no target of their own reads "No target". The store's target
 *     is NOT split across heads — dividing RM 60,000 by two would be inventing a
 *     number and then judging somebody against it.
 *  2. A department that does not sell shows "—", never 0%. Operation and Finance
 *     have no revenue; a grey dot means "does not sell", not "failing".
 *  3. The manager view ships OFF, with the reason and the fix on screen. Live
 *     there is exactly ONE reports_to edge in the company and floor staff have no
 *     manager field at all, so a rollup today would tell the COO her team sold
 *     RM 0 while her store sold RM 52,081. A wrong number is worse than an
 *     absent one.
 *
 * Percentages are FLOORED in the shared engine so the figure and the pill can
 * never disagree — see attainment().
 */

const PILL: Record<string, string> = {
  ready: "pill pill-confirmed",
  waiting: "pill pill-warning",
  neutral: "pill pill-neutral",
};

const STATE_LABEL = {
  on_track: "On track",
  behind: "Behind",
  no_target: "No target",
} as const;

const BAR: Record<string, string> = {
  ready: "bg-success",
  waiting: "bg-warning",
  neutral: "bg-base-300",
};

function fmt(kpiKey: KpiKey, n: number): string {
  return kpiMetric(kpiKey).unit === "rm" ? rm(n) : String(n);
}

/** One tile of the top strip. */
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
    <div className="flex-1 min-w-[160px] rounded-lg border border-base-200 bg-card px-4 py-3">
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

/** The attainment bar. Width is capped at 100% so an over-achiever does not
 *  overflow the track, but the % beside it still reads 121. */
function Bar({ row }: { row: ScorecardRow }) {
  const tone = kpiTone(row.state);
  const pct = row.pct ?? 0;
  return (
    <div className="flex-1 min-w-[80px] h-2 rounded-full bg-base-200 overflow-hidden">
      <div
        className={`h-full rounded-full ${BAR[tone]}`}
        style={{ width: `${Math.min(100, Math.max(row.target ? 2 : 0, pct))}%` }}
      />
    </div>
  );
}

function ScoreRow({
  row,
  kpiKey,
  indent,
  onEdit,
}: {
  row: ScorecardRow;
  kpiKey: KpiKey;
  indent?: boolean;
  onEdit: () => void;
}) {
  const tone = kpiTone(row.state);
  return (
    <div
      className={`flex items-center gap-3 h-11 px-3 border-b border-base-100 last:border-0 hover:bg-hovertint ${
        indent ? "pl-7" : ""
      } ${row.kind === "store" ? "bg-base-50" : ""}`}
    >
      <div className="w-[168px] shrink-0 min-w-0 flex items-baseline gap-1.5">
        <span className="text-strong font-medium truncate">{row.name}</span>
        {row.staffCode && <span className="text-meta text-base-400 t-num">{row.staffCode}</span>}
      </div>
      <Bar row={row} />
      <div className="w-[200px] shrink-0 text-right text-body t-num">
        <span className="font-semibold">{fmt(kpiKey, row.actual)}</span>
        {row.target !== null && (
          <span className="text-base-500"> of {fmt(kpiKey, row.target)}</span>
        )}
      </div>
      <div className="w-[52px] shrink-0 text-right text-strong font-semibold t-num">
        {row.pct === null ? <span className="text-base-400">—</span> : `${row.pct}%`}
      </div>
      <div className="w-[86px] shrink-0 text-right">
        <span className={PILL[tone]}>{STATE_LABEL[row.state]}</span>
      </div>
      <Btn
        variant="ghost"
        size="sm"
        icon={row.target === null ? Plus : Pencil}
        iconOnly
        title={row.target === null ? `Set a target for ${row.name}` : `Edit ${row.name}'s target`}
        aria-label={row.target === null ? `Set a target for ${row.name}` : `Edit ${row.name}'s target`}
        onClick={onEdit}
      />
    </div>
  );
}

interface EditState {
  kind: "person" | "store";
  id: string;
  name: string;
  value: string;
  effectiveFrom: string;
  targetId: string | null;
}

/** First day of the month being viewed — the sane default for a new target. */
function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function TargetDialog({
  edit,
  kpiKey,
  onClose,
}: {
  edit: EditState;
  kpiKey: KpiKey;
  onClose: () => void;
}) {
  const [value, setValue] = useState(edit.value);
  const [from, setFrom] = useState(edit.effectiveFrom);
  const save = useHrSetKpiTarget();
  const remove = useHrDeleteKpiTarget();
  const metric = kpiMetric(kpiKey);

  const submit = () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a target above zero");
      return;
    }
    save.mutate(
      {
        kpiKey,
        employeeId: edit.kind === "person" ? edit.id : null,
        dealerId: edit.kind === "store" ? edit.id : null,
        targetValue: n,
        effectiveFrom: from,
      },
      {
        onSuccess: () => {
          toast.success(`${edit.name} · target set`);
          onClose();
        },
        onError: (e) => toast.error(e.message || "Could not save the target"),
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
        className="bg-white rounded w-full max-w-[440px] overflow-hidden"
      >
        <div className="px-6 pt-5 pb-4 border-b border-base-100">
          <div className="kicker text-label">HR · Performance</div>
          <h2 className="font-display text-title mt-1 tracking-[-0.02em] font-semibold">
            {edit.targetId ? "Edit target" : "Set a target"}
          </h2>
          <div className="text-meta text-base-600 mt-1 leading-relaxed">
            {edit.name} · {metric.label}. Saving against the same start date
            corrects this target; pick a later date to change it from then on and
            leave earlier months as they were judged.
          </div>
        </div>
        <div className="p-6 grid gap-3">
          <label className="text-meta font-semibold text-base-700">
            Monthly target {metric.unit === "rm" ? "(RM)" : "(quantity)"}
            <input
              autoFocus
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
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
        </div>
        <div className="px-6 pb-5 flex items-center gap-2">
          <Btn variant="hero" onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save target"}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <span className="flex-1" />
          {edit.targetId && (
            <Btn
              variant="ghost"
              icon={Trash2}
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(edit.targetId as string, {
                  onSuccess: () => {
                    toast.success("Target removed");
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

/** The gap card — why the manager view is off, and the one click that fixes it. */
function ManagerCard({ source }: { source: KpiSource }) {
  const c = source.managerCoverage;
  const ready = managerViewReady(c);
  const setOwner = useHrSetStoreManager();

  return (
    <SectionCard>
      <div className="flex items-center gap-2 h-10 px-3 border-b border-base-200">
        <span className="text-strong text-base-900">Manager view</span>
        <span className="flex-1" />
        <span className={ready ? PILL.ready : PILL.neutral}>{ready ? "On" : "Off"}</span>
      </div>
      <div className="p-3 flex flex-col gap-3">
        {ready ? (
          <div className="flex items-center gap-2 text-body text-base-700">
            <Check size={16} className="text-success shrink-0" aria-hidden="true" />
            Every store has an owner, so each manager's number is the sum of their
            people.
          </div>
        ) : (
          <>
            <p className="text-body text-base-700">
              A manager's number is the sum of the people under them. Right now the
              org chart cannot answer who is under whom:
            </p>
            <div className="flex flex-col gap-2">
              {c.hqTotal > c.hqWithManager && (
                <div className="flex items-start gap-2">
                  <TriangleAlert size={14} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <div className="text-body text-base-900">
                      {c.hqTotal - c.hqWithManager} of {c.hqTotal} HQ staff have no
                      manager set
                    </div>
                    <div className="text-meta text-base-500">
                      Set it on the Team tab — it climbs the chart on its own.
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <TriangleAlert size={14} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <div className="text-body text-base-900">
                    Showroom staff have no manager field at all
                  </div>
                  <div className="text-meta text-base-500">
                    The people who actually sell sit outside the HQ chart, so a store
                    needs an owner instead.
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* The unlock: one picker per store. */}
        <div className="flex flex-col gap-1.5 border-t border-base-200 pt-2">
          {source.stores.map((s) => (
            <div key={s.dealerId} className="flex items-center gap-2 h-9">
              <span className="text-body text-base-900 flex-1 min-w-0 truncate">
                {s.name}
              </span>
              <span className="text-meta text-base-500 shrink-0">this store's number belongs to</span>
              <select
                value={s.managerUserId ?? ""}
                onChange={(e) =>
                  setOwner.mutate(
                    { dealerId: s.dealerId, appUserId: e.target.value || null },
                    {
                      onSuccess: () => toast.success(`${s.name} · owner updated`),
                      onError: (err) => toast.error(err.message || "Could not set the owner"),
                    },
                  )
                }
                className={`${fieldCls} !h-7 !w-[190px] shrink-0 text-meta`}
                aria-label={`Owner of ${s.name}`}
              >
                <option value="">Nobody yet</option>
                {source.managerCandidates.map((m) => (
                  <option key={m.appUserId} value={m.appUserId}>
                    {m.name}
                    {m.positionName ? ` · ${m.positionName}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {!ready && (
          <p className="text-meta text-base-500 border-t border-base-200 pt-2">
            Until a store has an owner this stays <b>Off</b> rather than showing a
            manager RM 0 while their store sold something.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

function DepartmentStrip({ s, kpiKey }: { s: Scorecards; kpiKey: KpiKey }) {
  return (
    <SectionCard>
      <div className="flex items-center gap-2 h-10 px-3 border-b border-base-200">
        <span className="text-strong text-base-900">Department chart</span>
        <span className="flex-1" />
        <span className="text-meta text-base-500">also shown on the Team tab</span>
      </div>
      <div className="p-3">
        <div className="flex gap-2.5 flex-wrap">
          {s.departments.map((d) => (
            <div
              key={d.name}
              className="flex-1 min-w-[150px] border border-base-200 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${BAR[kpiTone(d.state)]}`}
                  aria-hidden="true"
                />
                <span className="text-strong text-base-900 truncate">{d.name}</span>
              </div>
              <div className="text-meta text-base-500">
                {d.headcount} {d.headcount === 1 ? "person" : "people"}
                {d.sells
                  ? d.pct === null
                    ? " · no target set"
                    : ` · ${d.pct}% of target`
                  : " · no sales target"}
                {d.sells && d.pct !== null ? ` (${fmt(kpiKey, d.actual)})` : ""}
              </div>
            </div>
          ))}
        </div>
        <p className="text-meta text-base-500 border-t border-base-200 mt-2 pt-2">
          A grey dot means “this department does not sell”, not “this department is
          failing”. Departments with no revenue of their own show a dash rather than
          a fake 0%.
        </p>
      </div>
    </SectionCard>
  );
}

export default function HrPerformanceTab({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const [kpiKey, setKpiKey] = useState<KpiKey>(DEFAULT_KPI);
  const [edit, setEdit] = useState<EditState | null>(null);
  const { data, isLoading } = useHrKpi(year, month, kpiKey);

  const metric = kpiMetric(kpiKey);
  const editFor = (row: ScorecardRow): EditState => ({
    kind: row.kind,
    id: row.id,
    name: row.name,
    value: row.target !== null ? String(row.target) : "",
    effectiveFrom: row.effectiveFrom ?? monthStart(year, month),
    targetId: row.targetId,
  });

  const targetRows = useMemo(() => {
    if (!data) return [];
    // Newest start date first — the current number is the one you want on top.
    return [...data.source.targets]
      .filter((t) => t.kpiKey === kpiKey)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  }, [data, kpiKey]);

  if (isLoading || !data) {
    return <div className="py-12 text-body text-base-500">Loading performance…</div>;
  }

  const s = data.scorecards;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Segmented
          ariaLabel="Metric"
          value={kpiKey}
          onChange={setKpiKey}
          options={KPI_METRICS.map((m) => ({ value: m.key, label: m.label }))}
        />
        <span className="flex-1" />
        <span className={data.monthLocked ? PILL.neutral : PILL.ready}>
          {data.monthLocked ? "Closed · commission settled" : "Open · figures live"}
        </span>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Tile
          label={metric.unit === "rm" ? "Sold" : metric.label}
          value={fmt(kpiKey, s.totals.actual)}
          sub={`${s.totals.orderCount} order${s.totals.orderCount === 1 ? "" : "s"} · ${
            s.totals.scored
          } ${s.totals.scored === 1 ? "person" : "people"}`}
        />
        <Tile
          label="Target"
          value={s.totals.target === null ? "—" : fmt(kpiKey, s.totals.target)}
          sub={s.totals.target === null ? "no store target set" : `${s.stores.length} store`}
          muted={s.totals.target === null}
        />
        <Tile
          label="Attainment"
          value={s.totals.pct === null ? "—" : `${s.totals.pct}%`}
          sub={
            s.totals.target === null
              ? "set a target to see this"
              : s.totals.actual >= s.totals.target
                ? "target reached"
                : `${fmt(kpiKey, s.totals.target - s.totals.actual)} to go`
          }
          muted={s.totals.pct === null}
        />
        <Tile
          label="On track"
          value={`${s.totals.onTrack} of ${s.totals.scored}`}
          sub="people at 100% or better"
          muted={s.totals.scored === 0}
        />
      </div>

      <SectionCard>
        <div className="flex items-center gap-2 h-10 px-3 border-b border-base-200">
          <span className="text-strong text-base-900">This month</span>
          <span className="flex-1" />
          <span className="text-meta text-base-500">
            On track ≥ 100% · Behind under · No target = nothing set yet
          </span>
        </div>
        {s.stores.length === 0 ? (
          <div className="px-3 py-6 text-body text-base-500">
            No showroom is set up for scoring yet. A store appears here once it has
            its first staff member with a CR code.
          </div>
        ) : (
          s.stores.map((store) => (
            <div key={store.id}>
              <ScoreRow row={store} kpiKey={kpiKey} onEdit={() => setEdit(editFor(store))} />
              {s.people
                .filter((p) => p.dealerId === store.dealerId)
                .map((p) => (
                  <ScoreRow
                    key={p.id}
                    row={p}
                    kpiKey={kpiKey}
                    indent
                    onEdit={() => setEdit(editFor(p))}
                  />
                ))}
            </div>
          ))
        )}
        <div className="px-3 py-2 flex flex-col gap-1.5">
          <p className="text-meta text-base-500">
            Sold is the attributed line value of native orders placed this month, the
            same figure the Overview tab reports. This page shows no commission, so it
            can never disagree with a frozen statement.
          </p>
          {s.unscoredSold > 0 && (
            <p className="text-meta text-base-500 border-t border-base-200 pt-1.5">
              {rm(s.unscoredSold)} of the store total was sold by somebody with no
              staff code yet, so it is counted for the store but has no row of its own.
              Give them a CR code on the Team tab.
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard>
        <div className="flex items-center gap-2 h-10 px-3 border-b border-base-200">
          <span className="text-strong text-base-900">Targets</span>
          <span className="pill pill-neutral">{targetRows.length} set</span>
          <span className="flex-1" />
        </div>
        {targetRows.length === 0 ? (
          <div className="px-3 py-6 text-body text-base-500">
            No {metric.label.toLowerCase()} target yet. Use the ✏ on any row above to
            set one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {["Who", "Kind", "Monthly target", "From", "Set by"].map((h, i) => (
                    <th
                      key={h}
                      className={`text-label uppercase tracking-[0.05em] text-base-500 font-medium px-2.5 py-2 border-b border-base-200 whitespace-nowrap ${
                        i === 2 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {targetRows.map((t) => (
                  <tr key={t.id} className="hover:bg-hovertint">
                    <td className="px-2.5 h-11 text-body">
                      {t.subjectName ?? "—"}
                      {t.staffCode && (
                        <span className="text-meta text-base-400 t-num"> {t.staffCode}</span>
                      )}
                    </td>
                    <td className="px-2.5 h-11 text-body text-base-500">
                      {t.scopeKind === "store" ? "Store" : "Person"}
                    </td>
                    <td className="px-2.5 h-11 text-body text-right t-num font-medium">
                      {fmt(kpiKey, t.targetValue)}
                    </td>
                    <td className="px-2.5 h-11 text-body t-num">{t.effectiveFrom}</td>
                    <td className="px-2.5 h-11 text-body text-base-500">
                      {t.setByName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-meta text-base-500 px-3 py-2 border-t border-base-200">
          A target is never edited in place — changing it writes a new row from a date
          you choose, so last month keeps the number it was actually judged on. A
          person's own target wins over their store's; with no personal target the
          store's is <b>not</b> split across heads, the person simply reads “no target”.
        </p>
      </SectionCard>

      <DepartmentStrip s={s} kpiKey={kpiKey} />
      <ManagerCard source={data.source} />

      {edit && <TargetDialog edit={edit} kpiKey={kpiKey} onClose={() => setEdit(null)} />}
    </div>
  );
}
