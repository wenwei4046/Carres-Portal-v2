/**
 * OperationWork — My Work / Team Work over the one server Work feed.
 *
 * **TWO FILTERS over the ONE open work set — never two datasets, never
 * another dashboard.** This page is ASSEMBLY:
 *
 *   WHAT is open   ← owning-module projectors on the Worker
 *   WHO + WHEN     ← structured normal owner · cover · acting person · due
 *
 * PRESENTATION: object identity, problem fact, action sentence, then timing.
 * Owner identity is metadata/grouping and never part of the action sentence.
 *
 * MY WORK shows only the signed-in person's actions (the scope answers who —
 * no repeated avatar). TEAM WORK groups per staff: avatar · full name ·
 * `{n} actions to do` · `{n} late` · the action list. Never a bare count word
 * — every count says WHAT it counts (card §7, supersedes the 2026-08-14
 * `open · overdue` tally). An item whose duty has no roster holder yet groups
 * under its DUTY word — never a hand-picked person, never the PIC borrowed
 * for another module's work.
 *
 * Interaction comes from the v2 feed. `open_module` remains a door to the
 * owning object; admitted `embedded` actions may use the owning module's
 * shared form and write contract. The selected action stays in Workspace;
 * only its explicit owning-object door navigates away.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { orderActionLines, workspaceDutyLabelOf, type OperationWorkModule } from "@carres/shared";
import { cjkClassName } from "@/lib/cjk";
import { fmtDate } from "@/lib/fmt-date";
import { avatarColor, personInitials, personLabel } from "@/lib/staff-avatar";
import ListPageShell from "@/components/ListPageShell";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import { useAuth } from "@/lib/auth";
import { useOpenWorkSet, type WorkRow } from "./use-open-work";
import {
  filterWork,
  workFocusDay,
  workHoliday,
  workLayoutFor,
  workSections,
  workWeek,
  type WorkWhen,
} from "./work/work-model";
import WorkSplitShell, { type WorkLayout } from "./work/WorkSplitShell";
import WorkActionPanel from "./work/WorkActionPanel";
import WorkDayNav from "./work/WorkDayNav";

type ViewKey = "mine" | "team";

const TONE_DOT: Record<string, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  success: "bg-success",
  neutral: "bg-base-300",
};

const MODULE_LABEL: Record<OperationWorkModule, string> = {
  orders: "Sales Orders",
  purchasing: "Purchasing",
  receiving: "Receiving",
  delivery: "Delivery",
  payment: "Payment",
  issue_tracker: "Issue Tracker",
};

/** Timing is metadata. Object, problem, and action keep their own ranks. */
function supportingLine(i: WorkRow): string {
  if (i.timingBucket === "overdue" && i.dueIso) {
    return `Required ${fmtDate(i.dueIso)} · ${i.workingDaysLate} working ${i.workingDaysLate === 1 ? "day" : "days"} missed`;
  }
  return i.dueIso ? `Required ${fmtDate(i.dueIso)}` : "No working date";
}

/**
 * ⭐ A DELIVERY WORK SENTENCE IS TWO STRUCTURED LINES (owner ruling
 * 2026-09-13, Delivery MASTER §10): the act with its recipient, then the
 * required result — never joined with `—`. `Deliver on {weekday, date}` is
 * spelled here through the one date home, because the engine spells no dates.
 */
function deliveryLines(item: WorkRow): { act: string; result: string | null } | null {
  if (item.module !== "delivery") return null;
  const act =
    item.ruleKey === "deliver_today" && item.dueIso
      ? orderActionLines("deliver_today", { deliveryDate: fmtDate(item.dueIso) }).act
      : item.action;
  return { act, result: item.requiredResult || null };
}

/** Team Work's owner group: the normal owner, a named person, or the duty. */
function ownerGroupKey(i: WorkRow): string {
  return i.normalOwnerId ??
    (i.ownerName ? `person:${i.ownerName}` : `duty:${i.ownerDuty ?? "No owner yet"}`);
}

function WorkRowButton({
  item,
  onOpen,
  scope,
  selected,
}: {
  item: WorkRow;
  onOpen: (i: WorkRow) => void;
  scope: ViewKey;
  selected: boolean;
}) {
  const delivery = deliveryLines(item);
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid={`work-row-${item.soRef}-${item.ruleKey}`}
      onClick={() => onOpen(item)}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left ${selected ? "bg-kit-blue-3 shadow-[inset_2px_0_0_var(--blue-9)]" : "hover:bg-base-50"}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full shrink-0 ${TONE_DOT[item.broken ? "danger" : item.tone] ?? "bg-base-300"}`}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-label font-semibold text-base-500">
          {item.soRef} · {MODULE_LABEL[item.module]}
        </span>
        <span className={`${cjkClassName(item.problem)} block text-body font-semibold text-base-900`}>
          {item.problem}
        </span>
        <span className={`${cjkClassName(item.action)} block text-body text-base-700`}>
          {item.locked && (
            <Lock size={11} strokeWidth={2.5} className="inline mr-1 -mt-0.5" aria-label="Held by Finance" />
          )}
          {delivery?.act ?? item.action}{item.recipient ? ` · ${item.recipient}` : ""}
        </span>
        {item.requiredResult ? (
          <span
            className="block text-body text-base-600"
            data-testid="work-row-result"
          >
            {delivery?.result ?? item.requiredResult}
          </span>
        ) : null}
        <span
          className={`block text-label font-normal ${
            item.timingBucket === "overdue" ? "text-danger" : "text-base-600"
          }`}
        >
          {supportingLine(item)}
          {item.ownerState === "covered" && item.activeCover
            ? scope === "mine"
              ? ` · Covered for ${item.normalOwner?.name ?? "normal owner"}`
              : ` · Covered by ${item.activeCover.name ?? "cover"}`
            : ""}
        </span>
      </span>
    </button>
  );
}

export default function OperationWork() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const workAreaRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<WorkLayout>(() =>
    typeof window === "undefined" ? "three" : workLayoutFor(window.innerWidth),
  );
  const [activePanel, setActivePanel] = useState<"list" | "detail">("list");

  // The Work AREA decides the panels, not the window: with the portal sidebar
  // open a 1280px window leaves ~950px, which cannot hold 1100px of panels.
  // A width of 0 means the area is not laid out yet — the window is the only
  // honest estimate until it is.
  useLayoutEffect(() => {
    const area = workAreaRef.current;
    if (!area) return;
    const measure = () => {
      const width = area.getBoundingClientRect().width;
      setLayout(workLayoutFor(width > 0 ? width : window.innerWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const authEmail = useAuth((s) => s.user?.email ?? null);

  const { items: allItems, generatedOn, unhealthySources, staff, staffById, loading, error, retry } = useOpenWorkSet();

  // The rail deep-links into a person's work: `?tab=work&scope=team&owner=…`.
  const linkedScope = params.get("scope");
  const linkedOwner = params.get("owner");
  const linkedWhen = params.get("when");
  const activeView: ViewKey = linkedScope === "team" ? "team" : "mine";
  const ownerFocus = linkedOwner;
  const search = params.get("q") ?? "";
  const when: WorkWhen = ["broken", "overdue", "today", "later", "no_date"].includes(linkedWhen ?? "")
    ? linkedWhen as WorkWhen
    : "all";
  const moduleParam = params.get("module");
  const moduleFilter: OperationWorkModule | "all" = [
    "orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker",
  ].includes(moduleParam ?? "") ? moduleParam as OperationWorkModule : "all";
  const covered = params.get("covered") === "1";
  const day = params.get("day") ?? (params.get("when") ? "all" : "focus");

  const updateParam = (key: string, value: string | null) => setParams((before) => {
    const next = new URLSearchParams(before);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    return next;
  }, { replace: true });

  const myUserId = useMemo(() => {
    if (!authEmail) return null;
    const me = staff.find((s) => s.email.toLowerCase() === authEmail.toLowerCase());
    return me?.user_id ?? null;
  }, [staff, authEmail]);

  /** My Work — only the signed-in person's actions. */
  const mineAll = useMemo(
    () => (myUserId ? allItems.filter((i) => i.ownerId === myUserId) : []),
    [allItems, myUserId],
  );
  const filters = useMemo(() => ({ search, when, module: moduleFilter, covered }), [search, when, moduleFilter, covered]);
  const mine = useMemo(() => filterWork(mineAll, filters), [filters, mineAll]);
  const filteredTeamItems = useMemo(() => filterWork(allItems, filters), [allItems, filters]);

  /** Team Work — grouped per RESOLVED owner (§0.1 Action Owner Engine,
   *  2026-08-27): an ops account (PIC · PO-duty holder), a named non-account
   *  person (a salesperson), or — where no roster holder exists — the DUTY
   *  word. */
  const teamGroups = useMemo(() => {
    const byOwner = new Map<string, WorkRow[]>();
    for (const i of filteredTeamItems) {
      const key = ownerGroupKey(i);
      const list = byOwner.get(key) ?? [];
      list.push(i);
      byOwner.set(key, list);
    }
    const groups = [...byOwner.entries()].map(([key, items]) => {
      const staffMember = key.startsWith("duty:") || key.startsWith("person:")
        ? null
        : staffById.get(key) ?? null;
      // A resolved person without an ops account still has a NAME (the
      // salesperson) — a person group, initials and all, never a duty word.
      const personName = staffMember
        ? personLabel(staffMember.name, staffMember.email)
        : key.startsWith("person:")
          ? key.slice(7)
          : (items[0]?.ownerName ?? null);
      // A duty group carries the duty KEY from the feed; the governed word
      // comes from the shared catalogue (`PO Duty` · `Delivery Duty`), and a
      // keyed duty with no holder prints the Staff & Duties door below.
      const dutyKey = key.startsWith("duty:") && items[0]?.ownerDutyKey ? items[0].ownerDutyKey : null;
      const dutyWord = key.startsWith("duty:")
        ? dutyKey ? workspaceDutyLabelOf(dutyKey) : key.slice(5)
        : null;
      return {
        key,
        person: personName !== null,
        userId: staffMember ? key : null,
        dutyKey,
        name: personName ?? dutyWord ?? "No owner yet",
        items: [...items].sort((a, b) =>
          (a.dueIso ?? "9999").localeCompare(b.dueIso ?? "9999"),
        ),
        late: items.filter((i) => i.timingBucket === "overdue").length,
        coverName: items.find((i) => i.activeCover)?.activeCover?.name ?? null,
      };
    });
    // People first (by printed name — coverage, never a ranking), duties last.
    return groups.sort((a, b) =>
      a.person && !b.person ? -1 : !a.person && b.person ? 1 : a.name.localeCompare(b.name),
    );
  }, [filteredTeamItems, staffById]);

  const visibleTeamGroups = useMemo(
    () => (ownerFocus ? teamGroups.filter((g) => g.key === ownerFocus) : teamGroups),
    [teamGroups, ownerFocus],
  );
  const ownerOptions = useMemo(() => [
    { value: "all", label: "All owners" },
    ...teamGroups.map((group) => ({ value: group.key, label: group.name })),
  ], [teamGroups]);

  const beforeDay = activeView === "mine"
    ? mine
    : visibleTeamGroups.flatMap((group) => group.items);
  const dueIsos = useMemo(() => beforeDay.map((item) => item.dueIso), [beforeDay]);
  /** MASTER §5.1: today when it is a working day, else the next working day. */
  const focusDay = useMemo(() => (generatedOn ? workFocusDay(generatedOn, dueIsos) : ""), [dueIsos, generatedOn]);
  const selectedDay = day === "focus" ? focusDay : day;
  const inDay = (item: WorkRow) => {
    if (day === "all") return true;
    if (item.timingBucket === "overdue") return day === "missed" || day === "focus";
    if (day === "missed") return false;
    if (day === "no_date") return item.dueIso === null;
    // The focus list also holds anything due between today and the focus day
    // (work dated on today's holiday or Sunday), so opening on the next
    // working day never hides it.
    if (day === "focus") return item.dueIso !== null && item.dueIso >= generatedOn && item.dueIso <= focusDay;
    return item.dueIso === day;
  };
  const visible = beforeDay.filter(inDay);
  const lateCount = visible.filter((i) => i.timingBucket === "overdue").length;

  /** Module counts ignore the module filter and nothing else: scope · owner ·
   *  search · the other filters · the current list. With all modules they add
   *  up to the rows in the list. */
  const moduleCountRows = (activeView === "mine"
    ? filterWork(mineAll, { ...filters, module: "all" })
    : filterWork(allItems, { ...filters, module: "all" }).filter((item) => !ownerFocus || ownerGroupKey(item) === ownerFocus)
  ).filter(inDay);

  const workingDays = useMemo(
    () => (focusDay ? workWeek(focusDay, dueIsos) : []),
    [dueIsos, focusDay],
  );
  const dayChoices = useMemo(() => [
    { key: "missed", label: "Missed", count: beforeDay.filter((item) => item.timingBucket === "overdue").length },
    ...workingDays.map((date) => {
      const holiday = workHoliday(date);
      return {
        key: date,
        label: fmtDate(date),
        count: beforeDay.filter((item) => item.dueIso === date && item.timingBucket !== "overdue").length,
        ...(holiday ? { holiday } : {}),
      };
    }),
    { key: "no_date", label: "No working date", count: beforeDay.filter((item) => item.dueIso === null).length },
    { key: "all", label: "All", count: beforeDay.length },
  ], [beforeDay, workingDays]);

  /* The four empty states, checked in order (HF-1, owner ruling 2026-09-17):
     a failed source · filters with no match · an empty day while other work
     is open · nothing open at all. Zero matches is never zero work. */
  const filtersActive = Boolean(search) || when !== "all" || moduleFilter !== "all" || covered
    || (activeView === "team" && Boolean(ownerFocus));
  const missedCount = dayChoices[0]!.count;
  const emptyDoor: { key: string; label: string } | null = (() => {
    if (missedCount > 0 && day !== "missed") return { key: "missed", label: "Open Missed" };
    const nextDate = beforeDay
      .filter((item) => item.timingBucket !== "overdue" && item.dueIso !== null && item.dueIso !== selectedDay)
      .map((item) => item.dueIso as string)
      .sort()[0];
    return nextDate ? { key: nextDate, label: `Open ${fmtDate(nextDate)}` } : null;
  })();
  const emptyState: "failed" | "no_match" | "day" | "clear" = unhealthySources.length > 0
    ? "failed"
    : filtersActive && beforeDay.length === 0
      ? "no_match"
      : beforeDay.length > 0
        ? "day"
        : "clear";
  const clearFilters = () => setParams((before) => {
    const next = new URLSearchParams(before);
    for (const key of ["q", "when", "module", "covered", "owner", "selected"]) next.delete(key);
    return next;
  }, { replace: true });
  const emptyButton = "mt-3 px-3 py-1.5 rounded-md border border-base-200 bg-white text-body text-base-700";
  const emptyBody = emptyState === "failed" ? null : (
    <div className="text-body text-base-400 py-8" data-testid="work-empty">
      {emptyState === "no_match" ? (
        <>
          <p>No work matches these filters</p>
          <button type="button" onClick={clearFilters} className={emptyButton}>Clear filters</button>
        </>
      ) : emptyState === "day" ? (
        <>
          {/^\d{4}-\d{2}-\d{2}$/.test(selectedDay) ? <p>No work on {fmtDate(selectedDay)}</p> : null}
          {emptyDoor ? (
            <button type="button" onClick={() => updateParam("day", emptyDoor.key)} className={emptyButton}>
              {emptyDoor.label}
            </button>
          ) : null}
        </>
      ) : (
        <p>{activeView === "mine" ? "Nothing assigned to you" : "No open work — every track is clear."}</p>
      )}
    </div>
  );

  const selectedId = params.get("selected");
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;
  const visibleIds = new Set(visible.map((item) => item.id));
  const displayMyGroups = workSections(visible);
  const displayTeamGroups = visibleTeamGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => visibleIds.has(item.id)) }))
    .filter((group) => group.items.length > 0);
  const openRow = (i: WorkRow) => {
    updateParam("selected", i.id);
    if (layout === "one") setActivePanel("detail");
  };

  return (
    <ListPageShell
      title="Work"
      testId="operation-work"
      titleRight={
        // Every count says WHAT it counts (card §7 — supersedes `open · overdue`).
        <span className="text-label text-base-400">
          {visible.length} action{visible.length === 1 ? "" : "s"} to do
          {lateCount > 0 ? ` · ${lateCount} missed` : ""}
        </span>
      }
      toolbar={
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-md border border-base-200 overflow-hidden">
            {(
              [
                ["mine", "My Work"],
                ["team", "Team Work"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                data-testid={`work-view-${k}`}
                aria-pressed={activeView === k}
                onClick={() => {
                  setParams((before) => {
                    const next = new URLSearchParams(before);
                    if (k === "mine") {
                      next.delete("scope");
                      next.delete("owner");
                    } else next.set("scope", "team");
                    return next;
                  }, { replace: true });
                }}
                className={`px-3 py-1.5 text-body ${
                  activeView === k
                    ? "bg-base-900 text-white font-semibold"
                    : "bg-white text-base-600 hover:bg-base-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {activeView === "team" && ownerFocus && (
            <button
              type="button"
              data-testid="work-owner-clear"
              onClick={() => updateParam("owner", null)}
              className="px-2 py-1 rounded-full text-label border border-base-900 bg-base-900 text-white"
            >
              {teamGroups.find((group) => group.key === ownerFocus)?.name ?? "One owner"}{" "}
              · Clear
            </button>
          )}
          <SearchInput
            id="work-search"
            value={search}
            onChange={(event) => updateParam("q", event.target.value)}
            placeholder="Search work…"
          />
          {activeView === "team" && (
            <Select
              id="work-owner"
              value={ownerFocus ?? "all"}
              onValueChange={(value) => updateParam("owner", value)}
              options={ownerOptions}
            />
          )}
          <Select
            id="work-module"
            value={moduleFilter}
            onValueChange={(value) => updateParam("module", value)}
            options={[
              { value: "all", label: "All modules" },
              { value: "orders", label: "Sales Orders" },
              { value: "purchasing", label: "Purchasing" },
              { value: "receiving", label: "Receiving" },
              { value: "delivery", label: "Delivery" },
              { value: "payment", label: "Payment" },
              { value: "issue_tracker", label: "Issue Tracker" },
            ]}
          />
          <button
            type="button"
            aria-pressed={covered}
            onClick={() => updateParam("covered", covered ? null : "1")}
            className={`px-3 py-1.5 rounded-md border text-body ${covered ? "border-base-900 bg-base-900 text-white" : "border-base-200 bg-white text-base-600"}`}
          >
            Covered
          </button>
          {(search || when !== "all" || moduleFilter !== "all" || covered || day !== "focus") && (
            <button
              type="button"
              onClick={() => setParams((before) => {
                const next = new URLSearchParams(before);
                for (const key of ["q", "when", "module", "covered", "owner", "day", "selected"]) next.delete(key);
                return next;
              }, { replace: true })}
              className="px-2 py-1.5 text-body text-kit-blue-11"
            >
              Clear all
            </button>
          )}
        </div>
      }
    >
      <div ref={workAreaRef} data-testid="work-area" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <WorkSplitShell
        layout={layout}
        activePanel={activePanel}
        rail={(
          <div className="p-3">
            <p className="text-label font-semibold text-kit-slate-12">Working day</p>
            <div className="mt-2 flex flex-col gap-1">
              {dayChoices.map((choice) => "holiday" in choice && choice.holiday ? (
                <div key={choice.key} data-holiday={choice.key} className="flex min-h-8 flex-col justify-center px-2 py-1 text-body text-kit-slate-11">
                  <span>{choice.label}</span>
                  <span className="text-meta">Public holiday · {choice.holiday}</span>
                </div>
              ) : (
                <button
                  key={choice.key}
                  type="button"
                  aria-pressed={selectedDay === choice.key}
                  onClick={() => updateParam("day", choice.key)}
                  className={`flex min-h-8 items-center justify-between rounded-control px-2 text-left text-body ${selectedDay === choice.key ? "bg-kit-blue-3 font-medium text-kit-slate-12" : "text-kit-slate-11 hover:bg-kit-slate-3"}`}
                >
                  <span>{choice.label}</span><span>{choice.count} actions</span>
                </button>
              ))}
            </div>
            <p className="mt-6 text-label font-semibold text-kit-slate-12">Module</p>
            <div className="mt-2 flex flex-col gap-1">
              {(["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((module) => (
                <button
                  key={module}
                  type="button"
                  aria-pressed={moduleFilter === module}
                  onClick={() => updateParam("module", moduleFilter === module ? null : module)}
                  className={`flex min-h-8 items-center justify-between rounded-control px-2 text-left text-body ${moduleFilter === module ? "bg-kit-blue-3 font-medium text-kit-slate-12" : "text-kit-slate-11 hover:bg-kit-slate-3"}`}
                >
                  <span>{MODULE_LABEL[module]}</span>
                  <span>{moduleCountRows.filter((item) => item.module === module).length}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        list={(<div className="h-full overflow-y-auto" data-testid="work-list">
        {layout !== "three" ? (
          <WorkDayNav
            days={dayChoices}
            value={selectedDay}
            onChange={(key) => updateParam("day", key)}
          />
        ) : null}
        <div className="px-4 py-3">
        {!loading && !error && unhealthySources.length > 0 ? (
          <div className="mb-3 border border-kit-amber-6 bg-kit-amber-3 px-3 py-2 text-body text-kit-amber-11" role="status" data-testid="work-source-failed">
            {unhealthySources.map((source) => (
              <p key={source.key}>
                Could not refresh {MODULE_LABEL[source.key]}
                {source.lastSuccessfulAt
                  ? ` · Last updated ${fmtDate(source.lastSuccessfulAt) === fmtDate(generatedOn)
                    ? fmtDate(source.lastSuccessfulAt, { timeOnly: true })
                    : fmtDate(source.lastSuccessfulAt, { time: true })}`
                  : ""}
              </p>
            ))}
          </div>
        ) : null}
        {loading ? (
          <div className="space-y-3 py-2" aria-label="Loading work" data-testid="work-loading">
            {[0, 1, 2].map((index) => (
              <div key={index} className="rounded-md border border-base-200 bg-white px-4 py-3 animate-pulse">
                <div className="h-3 w-24 rounded bg-base-100" />
                <div className="mt-2 h-4 w-56 max-w-full rounded bg-base-100" />
                <div className="mt-2 h-3 w-80 max-w-full rounded bg-base-100" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-8" data-testid="work-error">
            <p className="text-body text-danger">Work could not be loaded. Try again.</p>
            <button type="button" onClick={retry} className="mt-3 px-3 py-1.5 rounded-md border border-base-200 bg-white text-body text-base-700">
              Try again
            </button>
          </div>
        ) : activeView === "mine" ? (
          displayMyGroups.length === 0 ? (
            emptyBody
          ) : (
            displayMyGroups.map((g) => (
              <section key={g.key} className="mb-5" data-testid={`work-section-${g.key}`}>
                <h2 className="text-label font-semibold text-base-500 uppercase tracking-wide mb-1.5">
                  {g.label}
                  <span className="ml-2 font-normal normal-case text-base-400">
                    {g.items.length} action{g.items.length === 1 ? "" : "s"} to do
                    {g.items.filter((item) => item.timingBucket === "overdue").length > 0 && <span className="text-danger"> · {g.items.filter((item) => item.timingBucket === "overdue").length} missed</span>}
                  </span>
                </h2>
                <div className="border border-base-200 rounded-md divide-y divide-base-100 bg-white">
                  {g.items.map((i) => (
                    <WorkRowButton key={`${i.orderId}:${i.ruleKey}`} item={i as WorkRow} onOpen={openRow} scope="mine" selected={selected?.id === i.id} />
                  ))}
                </div>
              </section>
            ))
          )
        ) : displayTeamGroups.length === 0 ? (
          emptyBody
        ) : (
          displayTeamGroups.map((g) => (
            <section key={g.key} className="mb-5" data-testid={`work-owner-group-${g.key}`}>
              <h2 className="flex items-center gap-2 mb-1.5">
                {g.person ? (
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                    style={{
                      /* Stable per-person colour — the account id where one
                         exists, else the group key (a salesperson has no ops
                         account; the hash only needs a stable string). */
                      backgroundColor: avatarColor(g.userId ?? g.key).bg,
                      color: avatarColor(g.userId ?? g.key).fg,
                    }}
                  >
                    {personInitials(g.name, "")}
                  </span>
                ) : null}
                <span className="text-body font-semibold text-base-900">{g.name}</span>
                <span className="text-label font-normal text-base-400">
                  {g.items.length} action{g.items.length === 1 ? "" : "s"} to do
                  {g.late > 0 && <span className="text-danger"> · {g.late} missed</span>}
                </span>
                {g.coverName && (
                  <span className="text-label font-normal text-kit-amber-11">
                    Cover today: {g.coverName}
                  </span>
                )}
              </h2>
              {g.dutyKey && (
                // The governed configuration failure with its ONE door
                // (workspace/MASTER §4 · Delivery MASTER §13.1): never a
                // fallback person, never a Work-local assignment control.
                <p className="mb-1.5 text-label text-base-500" data-testid={`work-duty-unassigned-${g.dutyKey}`}>
                  Nobody holds {g.name}.{" "}
                  <Link className="text-kit-blue-11 underline" to="/operation?tab=staff-duties">
                    Set the holder in Workspace → Staff &amp; Duties
                  </Link>
                </p>
              )}
              <div className="border border-base-200 rounded-md divide-y divide-base-100 bg-white">
                {g.items.map((i) => (
                  <WorkRowButton key={`${i.orderId}:${i.ruleKey}`} item={i} onOpen={openRow} scope="team" selected={selected?.id === i.id} />
                ))}
              </div>
            </section>
          ))
        )}
        </div>
        </div>)}
        detail={selected ? (
          <div>
            {layout === "one" ? (
              <button type="button" className="min-h-10 px-4 text-body text-kit-blue-11" onClick={() => setActivePanel("list")}>Back to work</button>
            ) : null}
            <WorkActionPanel item={selected.source} onOpen={() => navigate(selected.destination)} />
          </div>
        ) : (
          <div className="p-6 text-body text-kit-slate-11">Select work to see what to do.</div>
        )}
      />
      </div>
    </ListPageShell>
  );
}
