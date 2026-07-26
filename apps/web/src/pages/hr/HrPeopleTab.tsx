// design-standard: not-a-list-page — the HR-P4 People register inside the HR
// tabbed shell; the page header lives in HrApp.
import { useMemo, useState } from "react";
import { ChevronRight, Info, TriangleAlert } from "lucide-react";
import {
  EMPLOYEE_ACCESS_LABEL,
  EMPLOYMENT_STATUS_LABEL,
  POSITION_BAND_LABEL,
  POSITION_BAND_ORDER,
  STAFF_TIER_LABEL,
  accessTone,
  employmentTone,
  needsExitRecorded,
  type HrPersonRow,
  type PositionBand,
} from "@carres/shared";
import { SectionCard } from "@/components/SectionPanel";
import { useHrPeople } from "@/lib/queries";
import HrPersonDrawer from "./HrPersonDrawer";

/**
 * People (HR-P4, migration 0269) — one row per human who has a CRnnn code.
 *
 * THE THING THIS SCREEN IS BUILT AROUND: two columns, two questions.
 *   Employment — HR's record of the person, derived from the dates on file.
 *   Access     — whether they can actually log in right now.
 * They are never the same field. Samantha sat `disabled` since May with nobody
 * noticing precisely because one value was being asked to mean both.
 *
 * There is no "Add person" button on purpose: people appear here the moment
 * they get a CR code, and codes are minted in the Team tab — THE account door.
 */

const PILL: Record<string, string> = {
  ready: "pill pill-confirmed",
  waiting: "pill pill-warning",
  overdue: "pill pill-overdue",
  neutral: "pill pill-neutral",
};

/** Grid template shared by the header and every row so columns cannot drift. */
const COLS =
  "grid grid-cols-[minmax(200px,1fr)_84px_190px_130px_124px_112px_28px] items-center gap-2.5";

function Meter({ filled, total }: { filled: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((filled / total) * 100);
  const tone = filled === total ? "bg-success" : filled === 0 ? "bg-base-300" : "bg-warning";
  return (
    <div className="flex items-center gap-2">
      <div className="h-[5px] w-[52px] shrink-0 overflow-hidden rounded-full bg-base-200">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="t-tiny tabular-nums text-base-400">
        {filled}/{total}
      </span>
    </div>
  );
}

function PersonRow({
  p,
  totalFields,
  onOpen,
}: {
  p: HrPersonRow;
  totalFields: number;
  onOpen: () => void;
}) {
  const seat =
    p.positionName ??
    (p.staffRole ? (STAFF_TIER_LABEL[p.staffRole] ?? p.staffRole) : null);
  const sub = p.departmentName ?? p.storeName ?? (p.positionName ? null : "No seat yet");

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${COLS} h-11 w-full border-t border-base-200 px-3.5 text-left hover:bg-hovertint`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-base-100 text-[10.5px] font-semibold text-base-600">
          {p.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold leading-tight text-base-900">
            {p.name}
          </span>
          <span className="t-micro block truncate normal-case leading-tight text-base-400">
            {p.workEmail ?? "No email · signs in with a PIN"}
          </span>
        </span>
      </span>

      <span className="font-mono text-[12.5px] font-semibold text-base-600">
        {p.staffCode ?? "—"}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[12.5px] text-base-900">{seat ?? "Not set"}</span>
        {sub && <span className="t-micro block truncate normal-case text-base-400">{sub}</span>}
      </span>

      <span>
        <span className={PILL[employmentTone(p.employment)]}>
          {needsExitRecorded(p) ? "Exit not recorded" : EMPLOYMENT_STATUS_LABEL[p.employment]}
        </span>
      </span>

      <span>
        <span className={PILL[accessTone(p.access)]}>{EMPLOYEE_ACCESS_LABEL[p.access]}</span>
      </span>

      <Meter filled={p.filled} total={totalFields} />

      <ChevronRight size={14} className="text-base-300" />
    </button>
  );
}

function GroupBand({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex h-[30px] items-center gap-2 border-t border-base-200 bg-base-50 px-3.5">
      <span className="t-micro text-base-400">{title}</span>
      <span className="t-tiny text-base-300">{count}</span>
    </div>
  );
}

export default function HrPeopleTab() {
  const { data, isLoading, isError } = useHrPeople();
  const [openId, setOpenId] = useState<string | null>(null);

  const people = useMemo(() => data?.people ?? [], [data]);

  /** HQ people group by band (same vocabulary as the Team tab); floor staff
   *  group by store. One ordered list of [heading, rows]. */
  const groups = useMemo(() => {
    const hq = people.filter((p) => p.kind === "hq");
    const floor = people.filter((p) => p.kind === "floor");
    const out: [string, HrPersonRow[]][] = [];

    for (const band of POSITION_BAND_ORDER) {
      const rows = hq.filter((p) => p.band === band);
      if (rows.length) out.push([POSITION_BAND_LABEL[band as PositionBand], rows]);
    }
    const seatless = hq.filter((p) => !p.band);
    if (seatless.length) out.push(["No position yet", seatless]);

    const byStore = new Map<string, HrPersonRow[]>();
    for (const p of floor) {
      const key = p.storeName ?? "Showroom";
      const g = byStore.get(key);
      if (g) g.push(p);
      else byStore.set(key, [p]);
    }
    for (const [store, rows] of [...byStore.entries()].sort()) {
      out.push([`Showroom · ${store}`, rows]);
    }
    return out;
  }, [people]);

  const open = useMemo(
    () => people.find((p) => p.employeeId === openId) ?? null,
    [people, openId],
  );

  const complete = people.filter((p) => p.filled === (data?.totalFields ?? 8)).length;
  const needsExit = people.filter(needsExitRecorded);

  if (isLoading) {
    return <div className="t-small py-10 text-center text-base-500">Loading people…</div>;
  }
  if (isError || !data) {
    // A browser on this build against an older Worker gets a 404 here. Say so
    // instead of showing an empty register, which would read as "no staff".
    return (
      <div className="t-small py-10 text-center text-base-500">
        People is not available yet. If this persists, the API needs deploying.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The one row state that means somebody has to do something. */}
      {needsExit.length > 0 && (
        <div className="flex items-center gap-3.5 rounded-xl border border-base-200 border-l-[3px] border-l-warning bg-card px-4 py-3 shadow-sm">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning">
            <TriangleAlert size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold">
              {needsExit.length === 1
                ? `${needsExit[0]!.name} lost access with no exit recorded`
                : `${needsExit.length} people lost access with no exit recorded`}
            </div>
            <div className="t-tiny text-base-500">
              Access is already cut. The register still lists them as current, so they
              would carry into this month&apos;s commission run.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpenId(needsExit[0]!.employeeId)}
            className="btn-primary shrink-0"
          >
            {needsExit.length === 1 ? "Record the exit" : "Start with the first"}
          </button>
        </div>
      )}

      <SectionCard>
        <div className="flex items-center gap-2 px-3.5 py-3">
          <span className="t-small text-base-500">
            <b className="text-base-900">{people.length}</b> people ·{" "}
            <b className="text-base-900">{complete}</b> profiles complete
          </span>
          <span className="flex-1" />
          <span className="t-tiny text-base-400">
            A person appears here the moment they get a CR code in Team
          </span>
        </div>

        <div className={`${COLS} h-[34px] border-t border-base-200 bg-base-50 px-3.5`}>
          <span className="t-micro text-base-400">Person</span>
          <span className="t-micro text-base-400">CR</span>
          <span className="t-micro text-base-400">Position</span>
          <span className="t-micro text-base-400">Employment</span>
          <span className="t-micro text-base-400">Access</span>
          <span className="t-micro text-base-400">Profile</span>
          <span />
        </div>

        {groups.map(([heading, rows]) => (
          <div key={heading}>
            <GroupBand title={heading} count={rows.length} />
            {rows.map((p) => (
              <PersonRow
                key={p.employeeId}
                p={p}
                totalFields={data.totalFields}
                onOpen={() => setOpenId(p.employeeId)}
              />
            ))}
          </div>
        ))}

        <div className="flex items-center gap-2 border-t border-base-200 bg-base-50 px-3.5 py-2.5">
          <Info size={14} className="shrink-0 text-base-400" />
          <span className="t-tiny text-base-400">
            Showing all {people.length}. Store logins, supplier and partner accounts are not
            people — they have no CR code, so they never appear here.
          </span>
        </div>
      </SectionCard>

      {open && <HrPersonDrawer person={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
