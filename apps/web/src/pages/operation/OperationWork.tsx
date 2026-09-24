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
 * under its governed DUTY word — never a hand-picked person. Routine Delivery
 * work is the order PIC's work; Delivery Duty is only the no-PIC fallback.
 *
 * Interaction comes from the v2 feed. `open_module` remains a door to the
 * owning object; admitted `embedded` actions may use the owning module's
 * shared form and write contract. The selected action stays in Workspace;
 * only its explicit owning-object door navigates away.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { workspaceDutyLabelOf, type OperationWorkModule } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { useAuth } from "@/lib/auth";
import { personLabel } from "@/lib/staff-avatar";
import Avatar from "@/components/kit/Avatar";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import PageShell from "@/components/kit/PageShell";
import Popover from "@/components/kit/Popover";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import Tabs from "@/components/kit/Tabs";
import { FilterRail, FilterRailGroup, FilterRailRow } from "./components/workspace-rail";
import { useOpenWorkSet, type WorkRow } from "./use-open-work";
import {
  filterWork,
  workFocusDay,
  workHoliday,
  workLayoutFor,
  workWeek,
  type WorkWhen,
} from "./work/work-model";
import WorkSplitShell, { type WorkLayout } from "./work/WorkSplitShell";
import WorkActionPanel from "./work/WorkActionPanel";
import WorkActionRow from "./work/WorkActionRow";
import WorkDayNav from "./work/WorkDayNav";

type ViewKey = "mine" | "team";

const MODULE_LABEL: Record<OperationWorkModule, string> = {
  orders: "Sales Orders",
  purchasing: "Purchasing",
  receiving: "Receiving",
  delivery: "Delivery",
  payment: "Payment",
  issue_tracker: "Issue Tracker",
};

/** Team Work's owner group: the normal owner, a named person, or the duty. */
function ownerGroupKey(i: WorkRow): string {
  return i.normalOwnerId ??
    (i.ownerName ? `person:${i.ownerName}` : `duty:${i.ownerDuty ?? "No owner yet"}`);
}

export default function OperationWork() {
  const navigate = useNavigate();
  const role = useAuth((state) => state.role);
  const canViewTeam = role === "principal" || role === "operation";
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

  // One identity, shared with the Right Rail (HF-3): the signed-in account id.
  const { items: allItems, generatedOn, myUserId, unhealthySources, staffById, loading, error, retry } = useOpenWorkSet();

  // The rail deep-links into a person's work: `?tab=work&scope=team&owner=…`.
  const linkedScope = params.get("scope");
  const linkedOwner = params.get("owner");
  const linkedWhen = params.get("when");
  const activeView: ViewKey = canViewTeam && linkedScope === "team" ? "team" : "mine";
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
    // `all` clears a filter, but on the day list it IS a day choice: dropping
    // it would fall back to the focus list while `All` still shows every count.
    if (!value || (value === "all" && key !== "day")) next.delete(key);
    else next.set(key, value);
    return next;
  }, { replace: true });

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
  const emptyBody = emptyState === "failed" ? null : (
    <div className="mx-3 my-4 flex min-h-44 flex-col items-center justify-center rounded-panel border border-kit-slate-5 bg-white px-5 py-8 text-center text-body text-kit-slate-11" data-testid="work-empty">
      <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-kit-slate-3 text-kit-slate-11"><Icon name="order" size={18} /></span>
      {emptyState === "no_match" ? (
        <>
          <p>No work matches these filters</p>
          <div className="mt-3"><Button type="button" variant="neutral" onClick={clearFilters}>Clear filters</Button></div>
        </>
      ) : emptyState === "day" ? (
        <>
          {/^\d{4}-\d{2}-\d{2}$/.test(selectedDay) ? <p>No work on {fmtDate(selectedDay)}</p> : null}
          {emptyDoor ? (
            <div className="mt-3">
              <Button type="button" variant="neutral" onClick={() => updateParam("day", emptyDoor.key)}>{emptyDoor.label}</Button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p>{activeView === "mine" ? "Nothing assigned to you" : "No open work"}</p>
          {activeView === "mine" && canViewTeam ? (
            <div className="mt-3">
              <Button type="button" variant="neutral" onClick={() => updateParam("scope", "team")}>Open Team Work</Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  const selectedId = params.get("selected");
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;
  const visibleIds = new Set(visible.map((item) => item.id));
  const displayMyGroups = useMemo(() => {
    const missed = visible.filter((item) => item.timingBucket === "overdue");
    const dated = visible.filter((item) => item.timingBucket !== "overdue" && item.dueIso !== null);
    const noDate = visible.filter((item) => item.dueIso === null);
    const groups: { key: string; label: string; items: WorkRow[] }[] = [];
    if (missed.length) groups.push({ key: "overdue", label: "Missed", items: missed });
    const byDate = new Map<string, WorkRow[]>();
    for (const item of dated) {
      const key = item.dueIso as string;
      byDate.set(key, [...(byDate.get(key) ?? []), item]);
    }
    for (const [date, items] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      groups.push({ key: `date-${date}`, label: fmtDate(date), items });
    }
    if (noDate.length) groups.push({ key: "no_date", label: "No working date", items: noDate });
    return groups;
  }, [visible]);
  const displayTeamGroups = visibleTeamGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => visibleIds.has(item.id)) }))
    .filter((group) => group.items.length > 0);
  const openRow = (i: WorkRow) => {
    updateParam("selected", i.id);
    if (layout !== "three") setActivePanel("detail");
  };

  const toolbar = (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Tabs
        label="Work scope"
        value={activeView}
        tabs={canViewTeam
          ? [{ value: "mine", label: "My Work" }, { value: "team", label: "Team Work" }]
          : [{ value: "mine", label: "My Work" }]}
        onValueChange={(value) => {
          setParams((before) => {
            const next = new URLSearchParams(before);
            if (value === "mine") {
              next.delete("scope");
              next.delete("owner");
            } else next.set("scope", "team");
            next.delete("selected");
            return next;
          }, { replace: true });
          setActivePanel("list");
        }}
      />
      <SearchInput
        id="work-search"
        value={search}
        onChange={(event) => updateParam("q", event.target.value)}
        placeholder="Search work…"
      />
      {layout === "one" ? (
        <Select
          id="work-module"
          value={moduleFilter}
          onValueChange={(value) => updateParam("module", value)}
          options={[
            { value: "all", label: "All modules" },
            ...Object.entries(MODULE_LABEL).map(([value, label]) => ({ value, label })),
          ]}
        />
      ) : null}
      {activeView === "team" && layout === "one" ? (
        <Select
          id="work-owner"
          value={ownerFocus ?? "all"}
          onValueChange={(value) => updateParam("owner", value)}
          options={ownerOptions}
        />
      ) : null}
      <Popover
        label="Work filters"
        align="end"
        trigger={<Button type="button" variant="neutral" icon="filter">Filters</Button>}
      >
        <label className="flex min-h-10 items-center gap-2 text-body text-kit-slate-12">
          <input
            type="checkbox"
            checked={covered}
            onChange={() => updateParam("covered", covered ? null : "1")}
            className="h-4 w-4 rounded-control border-kit-slate-6 text-kit-blue-9 focus:ring-kit-blue-9"
          />
          Covered
        </label>
      </Popover>
      {(search || when !== "all" || moduleFilter !== "all" || covered || day !== "focus" || ownerFocus) ? (
        <Button type="button" variant="ghost" onClick={() => {
          setParams((before) => {
            const next = new URLSearchParams(before);
            for (const key of ["q", "when", "module", "covered", "owner", "day", "selected"]) next.delete(key);
            return next;
          }, { replace: true });
          setActivePanel("list");
        }}>
          Clear all
        </Button>
      ) : null}
    </div>
  );
  return (
    <PageShell
      variant="work"
      title="Work"
      toolbar={toolbar}
      chips={covered ? [{ label: "Covered", onClear: () => updateParam("covered", null) }] : undefined}
    >
      <div ref={workAreaRef} data-testid="operation-work" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <WorkSplitShell
        layout={layout}
        activePanel={activePanel}
        rail={(
          <FilterRail testId="work-filter-rail" ariaLabel="Work filters" className="gap-4 border-r-0 bg-transparent px-0 pb-0">
            <FilterRailGroup title="Working day" icon="date" className="rounded-panel border border-kit-slate-5 bg-white px-3">
              {dayChoices.map((choice) => "holiday" in choice && choice.holiday ? (
                <div key={choice.key} data-holiday={choice.key} className="flex min-h-[36px] flex-col justify-center px-2 py-1 text-body text-kit-slate-11">
                  <span>{choice.label}</span>
                  <span className="text-meta">Public holiday · {choice.holiday}</span>
                </div>
              ) : (
                <FilterRailRow
                  key={choice.key}
                  testId={`work-day-${choice.key}`}
                  label={choice.label}
                  count={choice.count}
                  active={selectedDay === choice.key}
                  resets={choice.key === "all"}
                  onClick={() => updateParam("day", choice.key)}
                />
              ))}
            </FilterRailGroup>
            <FilterRailGroup title="Module" icon="order" className="rounded-panel border border-kit-slate-5 bg-white px-3">
              <FilterRailRow
                testId="work-module-all"
                label="All modules"
                count={moduleCountRows.length}
                active={moduleFilter === "all"}
                resets
                onClick={() => updateParam("module", null)}
              />
              {(["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((module) => (
                <FilterRailRow
                  key={module}
                  testId={`work-module-${module}`}
                  label={MODULE_LABEL[module]}
                  count={moduleCountRows.filter((item) => item.module === module).length}
                  active={moduleFilter === module}
                  onClick={() => updateParam("module", moduleFilter === module ? null : module)}
                />
              ))}
            </FilterRailGroup>
            {activeView === "team" ? (
              <FilterRailGroup title="Owner" icon="people" className="rounded-panel border border-kit-slate-5 bg-white px-3">
                {ownerOptions.map((option) => (
                  <FilterRailRow
                    key={option.value}
                    testId={`work-owner-${option.value}`}
                    label={option.label}
                    active={(ownerFocus ?? "all") === option.value}
                    resets={option.value === "all"}
                    onClick={() => updateParam("owner", option.value)}
                  />
                ))}
              </FilterRailGroup>
            ) : null}
          </FilterRail>
        )}
        list={(<div className="h-full overflow-y-auto" data-testid="work-list">
        {layout === "one" ? (
          <WorkDayNav
            days={dayChoices}
            value={selectedDay}
            onChange={(key) => updateParam("day", key)}
          />
        ) : null}
        <div>
        {!loading && !error && unhealthySources.length > 0 ? (
          <div className="border-b border-kit-amber-6 bg-kit-amber-3 px-4 py-2 text-body text-kit-amber-11" role="status" data-testid="work-source-failed">
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
          <div className="p-2" aria-label="Loading work" data-testid="work-loading">
            {[0, 1, 2].map((index) => (
              <div key={index} className="mb-2 overflow-hidden rounded-control border border-kit-slate-5 bg-white px-3 py-2 motion-safe:animate-pulse">
                <div className="h-3 w-24 rounded bg-base-100" />
                <div className="mt-2 h-4 w-56 max-w-full rounded bg-base-100" />
                <div className="mt-2 h-3 w-80 max-w-full rounded bg-base-100" />
                <div className="mt-2 h-7 border-t border-kit-slate-5 pt-2"><div className="h-2.5 w-20 rounded bg-base-100" /></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="mx-3 my-4 flex min-h-44 flex-col items-center justify-center rounded-panel border border-kit-red-6 bg-white px-5 py-8 text-center" data-testid="work-error">
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-kit-red-3 text-kit-red-11"><Icon name="late" size={18} /></span>
            <p className="text-body text-danger">Work could not be loaded. Try again.</p>
            <div className="mt-3"><Button type="button" variant="neutral" onClick={retry}>Try again</Button></div>
          </div>
        ) : activeView === "mine" ? (
          displayMyGroups.length === 0 ? (
            emptyBody
          ) : (
            displayMyGroups.map((g) => (
              <section key={g.key} data-testid={`work-section-${g.key}`}>
                <h2 className="flex min-h-9 items-center border-b border-kit-slate-5 px-4 text-label font-semibold uppercase tracking-wide text-kit-slate-11">
                  {g.label} <span className="ml-1 font-normal tabular-nums text-kit-slate-11">{g.items.length}</span>
                </h2>
                <div className="bg-white">
                  {g.items.map((i) => (
                    <WorkActionRow
                      key={i.id}
                      item={i.source}
                      onSelect={() => openRow(i)}
                      onOpen={() => navigate(i.destination)}
                      selected={selected?.id === i.id}
                      ownerContext={i.ownerState === "covered" ? `Covered for ${i.normalOwner?.name ?? "normal owner"}` : null}
                    />
                  ))}
                </div>
              </section>
            ))
          )
        ) : displayTeamGroups.length === 0 ? (
          emptyBody
        ) : (
          displayTeamGroups.map((g) => (
            <section key={g.key} data-testid={`work-owner-group-${g.key}`}>
              <h2 className="flex min-h-11 items-center gap-2 border-b border-kit-slate-5 px-4">
                {g.person ? (
                  <Avatar userId={g.userId ?? g.key} name={g.name} />
                ) : null}
                <span className="text-body font-semibold text-kit-slate-12">{g.name}</span>
                <span className="text-label font-normal text-kit-slate-11">
                  {g.items.length} action{g.items.length === 1 ? "" : "s"} to do
                  {g.late > 0 && <span className="text-kit-red-11"> · {g.late} missed</span>}
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
              <div className="bg-white">
                {g.items.map((i) => (
                  <WorkActionRow
                    key={i.id}
                    item={i.source}
                    onSelect={() => openRow(i)}
                    onOpen={() => navigate(i.destination)}
                    selected={selected?.id === i.id}
                    ownerContext={i.ownerState === "covered" ? `Covered by ${i.activeCover?.name ?? "cover"}` : null}
                  />
                ))}
              </div>
            </section>
          ))
        )}
        </div>
        </div>)}
        detail={selected ? (
          <div>
            {layout !== "three" ? (
              <div className="border-b border-kit-slate-5 px-3 py-1.5">
                <Button type="button" variant="ghost" onClick={() => setActivePanel("list")}>Back to work</Button>
              </div>
            ) : null}
            <WorkActionPanel item={selected.source} onOpen={() => navigate(selected.destination)} />
          </div>
        ) : (
          <div aria-hidden="true" className="min-h-full bg-white" />
        )}
      />
      </div>
    </PageShell>
  );
}
