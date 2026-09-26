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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { orderActionLines, workspaceDutyLabelOf, type OperationWorkItem, type OperationWorkModule } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { avatarColor, personInitials, personLabel } from "@/lib/staff-avatar";
import ListPageShell from "@/components/ListPageShell";
import SearchInput from "@/components/kit/SearchInput";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import { useOpenWorkSet, type WorkRow } from "./use-open-work";
import {
  filterWork,
  inWorkDay,
  isWorkDate,
  parseWorkStatus,
  parseWorkWeek,
  toggleWorkStatus,
  WORK_MODULES,
  WORK_STATUS_ORDER,
  WORK_STATUS_WORD,
  workFocusDay,
  workLayoutFor,
  workModuleCounts,
  workRailDates,
  workSections,
  workStatusOf,
  workWeekWord,
  type WorkStatus,
  type WorkWhen,
} from "./work/work-model";
import WorkSplitShell, { type WorkLayout } from "./work/WorkSplitShell";
import WorkActionPanel from "./work/WorkActionPanel";
import WorkParties, { type MissionReport, type Party } from "./work/WorkParties";
import WorkOwnerSource from "./work/WorkOwnerSource";
import PoWindowPanel, { usePoWindow } from "./work/PoWindowPanel";
import ModuleHeader from "./components/ModuleHeader";
import { FilterRail, FilterRailGroup, FilterRailRow, FilterRailSelect, FilterRailWeekStrip, ShowFiltersButton, useFilterRailOpen } from "./components/workspace-rail";
import { WorkCardSkeleton, WorkSection } from "./work/WorkCard";
import WorkListRow from "./work/WorkListRow";

type ViewKey = "mine" | "team";

/** Cards drawn per step once a list passes 50 (card kit §List states). */
const CARD_STEP = 50;

const MODULE_LABEL: Record<OperationWorkModule, string> = {
  orders: "Sales Orders",
  purchasing: "Purchasing",
  receiving: "Receiving",
  delivery: "Delivery",
  payment: "Payment",
  issue_tracker: "Issue Tracker",
};

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

/** A PO window's mission (Purchasing §5.6.1): the summary, whose `Open`
 *  door is the blue act while demand is left, then To buy and POs to send. */
function PoWindowMission({ item, onOpen }: { item: OperationWorkItem; onOpen: () => void }) {
  const { window } = usePoWindow(item);
  return (
    <>
      <WorkActionPanel item={item} onOpen={onOpen} openIsPrimary={(window?.demand.rowIds.length ?? 0) > 0} />
      <PoWindowPanel item={item} />
    </>
  );
}

/** Team Work's owner group: the normal owner, a named person, or the duty. */
function ownerGroupKey(i: WorkRow): string {
  return i.normalOwnerId ??
    (i.ownerName ? `person:${i.ownerName}` : `duty:${i.ownerDuty ?? "No owner yet"}`);
}

export default function OperationWork() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const workAreaRef = useRef<HTMLDivElement>(null);
  /* On one stage the rail floats over the list only while `Show filters` is
     pressed; a pick or Hide closes it (the Payment Monitor's own rule). */
  const [phoneRailOverride, setPhoneRailOverride] = useState(false);
  const [railOpen, setRailOpen] = useFilterRailOpen("carres.work.rail", workAreaRef);
  const [layout, setLayout] = useState<WorkLayout>(() =>
    typeof window === "undefined" ? "three" : workLayoutFor(window.innerWidth),
  );
  const railVisible = layout === "one" ? railOpen && phoneRailOverride : railOpen;
  const [activePanel, setActivePanel] = useState<"list" | "detail">("list");
  /* §5.10: which party card is open (one at a time) and what the mission
     reports — the summary opens a card and carries the one blue act while
     every card is collapsed. Reset whenever another work item is chosen. */
  const [openParty, setOpenParty] = useState<Party | null>(null);
  const [mission, setMission] = useState<MissionReport>({ shown: false, act: null, openCardHasAct: false });
  const reportMission = useCallback((report: MissionReport) => {
    setMission((before) =>
      before.shown === report.shown && before.act?.party === report.act?.party && before.act?.label === report.act?.label && before.openCardHasAct === report.openCardHasAct ? before : report,
    );
  }, []);
  /* §5.10: entering the detail on one stage puts focus on `Back to work`. */
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (activePanel === "detail") backRef.current?.focus();
  }, [activePanel]);

  // The PAGE decides the panels, not the window: with the portal sidebar open
  // a 1440px window leaves ~1200px of page. The page is this page's own
  // full-width frame (canvas padding included), so the owner's breakpoints
  // (1280 · 768) read exactly as written when no sidebar is drawn. A width of
  // 0 means the page is not laid out yet — the window is the only honest
  // estimate until it is.
  useLayoutEffect(() => {
    const area = workAreaRef.current?.closest<HTMLElement>("[data-testid='operation-work']") ?? workAreaRef.current;
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
  const { items: allItems, generatedOn, myUserId, unhealthySources, staffById, loading, error, refreshFailed, retry } = useOpenWorkSet();

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
  const moduleFilter: OperationWorkModule | "all" = WORK_MODULES.includes(moduleParam as OperationWorkModule)
    ? moduleParam as OperationWorkModule
    : "all";
  const statuses = useMemo(() => parseWorkStatus(params.get("status")), [params]);
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
  const filters = useMemo(() => ({ search, when, module: moduleFilter }), [search, when, moduleFilter]);
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

  /* The whole team's open set, before any filter — the header's answer when
     My Work is empty (owner review 2026-09-25 item 5). */
  const teamTotal = teamGroups.reduce((n, g) => n + g.items.length, 0);

  const visibleTeamGroups = useMemo(
    () => (ownerFocus ? teamGroups.filter((g) => g.key === ownerFocus) : teamGroups),
    [teamGroups, ownerFocus],
  );

  const beforeDay = activeView === "mine"
    ? mine
    : visibleTeamGroups.flatMap((group) => group.items);
  const dueIsos = useMemo(() => beforeDay.map((item) => item.dueIso), [beforeDay]);
  /** MASTER §5.1: today when it is a working day, else the next working day. */
  const focusDay = useMemo(() => (generatedOn ? workFocusDay(generatedOn, dueIsos) : ""), [dueIsos, generatedOn]);
  const selectedDay = day === "focus" ? focusDay : day;
  const inDay = (item: WorkRow) => inWorkDay(item, day, generatedOn, focusDay);
  /* Status (Jess, 2026-09-26: the rail's `Status` rows, more than one may be
     on): one day's open set split by the recorded reply state; the rail's
     date counts keep the whole open set. */
  const inDaySet = beforeDay.filter(inDay);
  const statusCounts = Object.fromEntries(WORK_STATUS_ORDER.map((k) => [k, 0])) as Record<WorkStatus, number>;
  for (const item of inDaySet) statusCounts[workStatusOf(item)] += 1;
  const visible = inDaySet.filter((item) => statuses.includes(workStatusOf(item)));

  /** Module counts ignore the module filter and nothing else: scope · owner ·
   *  search · the other filters · the current list. With all modules they add
   *  up to the rows in the list. */
  const moduleCountRows = (activeView === "mine"
    ? filterWork(mineAll, { ...filters, module: "all" })
    : filterWork(allItems, { ...filters, module: "all" }).filter((item) => !ownerFocus || ownerGroupKey(item) === ownerFocus)
  ).filter(inDay);

  /** The rail's visible week (owner ruling 2026-09-24): the URL's `week`,
   *  else the week of the chosen date, else the week of the focus day. The
   *  arrows move it one work week without touching the chosen Date. */
  const week = parseWorkWeek(params.get("week")) ?? (isWorkDate(day) ? day : focusDay);
  const railDates = useMemo(
    () => (week ? workRailDates(beforeDay, generatedOn, week) : null),
    [beforeDay, generatedOn, week],
  );
  const railSelected = selectedDay === "missed" || selectedDay === "no_date" || isWorkDate(selectedDay) ? selectedDay : null;
  const moduleCounts = workModuleCounts(moduleCountRows);
  const railModules = WORK_MODULES.map((key) => ({ key, label: MODULE_LABEL[key] }));

  /* The four empty states, checked in order (HF-1, owner ruling 2026-09-17):
     a failed source · filters with no match · an empty day while other work
     is open · nothing open at all. Zero matches is never zero work. */
  const filtersActive = Boolean(search) || when !== "all" || moduleFilter !== "all"
    || (activeView === "team" && Boolean(ownerFocus));
  const missedCount = railDates?.missed ?? 0;
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
    for (const key of ["q", "when", "module", "status", "owner", "selected"]) next.delete(key);
    return next;
  }, { replace: true });
  const emptyButton = "mt-3 px-3 py-1.5 rounded-md border border-base-200 bg-white text-body text-base-700";
  /* The empty list is one white section that ends where its words end
     (item 24), never a canvas-long blank. */
  const emptyBody = emptyState === "failed" ? null : (
    <div className="rounded-work border border-work-line bg-white px-4 py-5 text-body text-base-400" data-testid="work-empty">
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
        <>
          <p>{activeView === "mine" ? "Nothing assigned to you" : "No open work — every track is clear."}</p>
          {activeView === "mine" && teamTotal > 0 ? (
            /* The door out of an empty My Work (item 6 of the review). */
            <button type="button" onClick={() => updateParam("scope", "team")} className={emptyButton} data-testid="work-empty-team-door">
              See Team Work
            </button>
          ) : null}
        </>
      )}
    </div>
  );

  const selectedId = params.get("selected");
  const selectedKey = (visible.find((item) => item.id === selectedId) ?? visible[0] ?? null)?.id ?? null;
  /* A new item starts with every card collapsed. The mission (keyed per item)
     reports itself on mount — child effects run first, so it is not reset here. */
  useEffect(() => {
    setOpenParty(null);
  }, [selectedKey]);
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;
  const visibleIds = new Set(visible.map((item) => item.id));
  // The date rail and its badge already say when; the list is one ordered run.
  const myItems = workSections(visible).flatMap((section) => section.items);
  const displayTeamGroups = visibleTeamGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => visibleIds.has(item.id)) }))
    .filter((group) => group.items.length > 0);
  const openRow = (i: WorkRow) => {
    updateParam("selected", i.id);
    if (layout === "one") setActivePanel("detail");
    /* At `two` the detail replaces the rail (WorkSplitShell): the pick hides
       the rail, remembered like Hide filters. */
    if (layout === "two" && railVisible) setRailOpen(false);
  };

  /* Card kit §List states: past 50 cards the list draws 50 more each time its
     end scrolls into view, in the same order, so keyboard order never jumps.
     A new selection of filters starts again at 50. */
  const [cardLimit, setCardLimit] = useState(CARD_STEP);
  // Choosing a card is not a new selection of filters: `selected` never resets.
  const listKey = [...params.entries()].filter(([key]) => key !== "selected").map(([k, v]) => `${k}=${v}`).join("&");
  useEffect(() => setCardLimit(CARD_STEP), [listKey]);
  const moreRef = useRef<HTMLDivElement>(null);
  const listTotal = activeView === "mine" ? myItems.length : displayTeamGroups.reduce((n, g) => n + g.items.length, 0);
  const hasMore = listTotal > cardLimit;
  useEffect(() => {
    const sentinel = moreRef.current;
    if (!sentinel || !hasMore) return;
    if (typeof IntersectionObserver === "undefined") {
      setCardLimit(Number.POSITIVE_INFINITY);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setCardLimit((limit) => limit + CARD_STEP);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, cardLimit]);
  let teamBudget = cardLimit;
  const shownTeamGroups = displayTeamGroups.flatMap((g) => {
    if (teamBudget <= 0) return [];
    const items = g.items.slice(0, teamBudget);
    teamBudget -= items.length;
    return [{ ...g, items }];
  });

  /* The two-line picker row (Jess, 2026-09-26). A covered row names the
     normal owner in My Work (`For Li Ching`); Team Work groups by that owner
     already, so the row says nothing twice. */
  const card = (i: WorkRow) => (
    <WorkListRow
      key={`${i.orderId}:${i.ruleKey}`}
      item={i}
      action={`${deliveryLines(i)?.act ?? i.action}`}
      cover={activeView === "mine" && i.ownerState === "covered" ? (i.normalOwner?.name ?? "normal owner") : null}
      selected={layout !== "one" && selected?.id === i.id}
      onSelect={() => openRow(i)}
      onOpenRecord={() => navigate(i.destination)}
    />
  );
  /** The one line over the list: the chosen Date, the rail's own words. */
  const listHeading = selectedDay === "missed"
    ? "Missed"
    : selectedDay === "no_date"
      ? "No date"
      : isWorkDate(selectedDay)
        ? fmtDate(selectedDay)
        : null;

  /* THE RAIL EVERY PAGE FOLLOWS (Jess, 2026-09-26 — the Payment Monitor rail,
     then her correction the same day): ONE header line `‹ Week of 28 Sep ›`,
     then the week as one row of day tiles (weekday · day number · count —
     five, six when Saturday holds work), then the fixed rows `Missed` and
     `No date`, the `Status` rows (more than one may be on), the `Page` rows
     and — in Team Work — the Owner select. A non-working day is a grey tile
     with no count; today is the solid-blue tile; the chosen day is ringed.
     Hidden, it leaves a 44px `Show filters` strip; the choice is remembered
     per browser (`useFilterRailOpen`). */
  const weekArrow = "grid h-8 w-7 shrink-0 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3";
  const pickDay = (key: string) => {
    updateParam("day", key);
    if (layout === "one") setPhoneRailOverride(false);
  };
  const rail = railDates ? (
    <FilterRail
      testId="work-rail"
      ariaLabel="Work filters"
      onHide={() => { setRailOpen(false); setPhoneRailOverride(false); }}
      header={(
        <div data-testid="work-rail-week" className="flex items-center gap-1 pr-8">
          <button type="button" aria-label="Previous week" title="Previous week" className={weekArrow} onClick={() => updateParam("week", railDates.previousWeek)}>
            <Icon name="previous" size={16} />
          </button>
          <span className="min-w-0 flex-1 truncate text-center text-body font-semibold text-kit-slate-12" data-testid="work-rail-week-label">
            {workWeekWord(week)}
          </span>
          <button type="button" aria-label="Next week" title="Next week" className={weekArrow} onClick={() => updateParam("week", railDates.nextWeek)}>
            <Icon name="forward" size={16} />
          </button>
        </div>
      )}
    >
      <FilterRailWeekStrip
        testId="work-rail-days"
        days={railDates.days.map((d) => ({ iso: d.iso, label: d.label, weekday: d.weekday, dayNumber: d.dayNumber, closed: d.holiday, count: d.count, today: d.today }))}
        chosenIso={railSelected}
        onPick={pickDay}
      />
      <div className="border-t border-kit-slate-5 py-2">
        <FilterRailRow label="Missed" count={railDates.missed} active={railSelected === "missed"} testId="work-rail-missed" onClick={() => pickDay("missed")} />
        <FilterRailRow label="No date" count={railDates.noDate} active={railSelected === "no_date"} testId="work-rail-no-date" onClick={() => pickDay("no_date")} />
      </div>
      {/* Status rows: each one is on or off on its own; the last one on stays. */}
      <FilterRailGroup title="Status" icon="flag" chosen={statuses.length === 1 && statuses[0] === "todo" ? null : statuses.map((k) => WORK_STATUS_WORD[k]).join(" · ")}>
        {WORK_STATUS_ORDER.map((k) => (
          <FilterRailRow key={k} label={WORK_STATUS_WORD[k]} count={statusCounts[k]} active={statuses.includes(k)} resets={k === "todo"} testId={`work-rail-status-${k}`} onClick={() => updateParam("status", toggleWorkStatus(statuses, k))} />
        ))}
      </FilterRailGroup>
      <FilterRailGroup title="Page" icon="modules" chosen={moduleFilter === "all" ? null : MODULE_LABEL[moduleFilter]}>
        <FilterRailRow label="All pages" count={moduleCountRows.length} active={moduleFilter === "all"} resets testId="work-rail-page-all" onClick={() => updateParam("module", "all")} />
        {railModules.map((m) => (
          <FilterRailRow key={m.key} label={m.label} count={moduleCounts[m.key]} active={moduleFilter === m.key} testId={`work-rail-page-${m.key}`} onClick={() => updateParam("module", m.key)} />
        ))}
      </FilterRailGroup>
      {activeView === "team" ? (
        <FilterRailGroup title="Owner" icon="people" chosen={ownerFocus ? teamGroups.find((g) => g.key === ownerFocus)?.name ?? null : null}>
          <FilterRailSelect
            label="Owner"
            value={ownerFocus}
            options={teamGroups.map((g) => ({ value: g.key, label: g.name, count: g.items.length }))}
            onChange={(next) => updateParam("owner", next)}
            testId="work-rail-owner"
            allLabel="All owners"
          />
        </FilterRailGroup>
      ) : null}
    </FilterRail>
  ) : null;

  /* A status choice with nothing in it is its own sentence, never the day's
     empty state (the day may well have To do work the choice hides). */
  const listBody = !loading && visible.length === 0 && inDaySet.length > 0 ? (
    <p className="py-2 text-body text-kit-slate-11" data-testid="work-tab-empty">
      No work for this Status choice.
    </p>
  ) : loading ? (
    <WorkCardSkeleton />
  ) : error && !refreshFailed ? (
    <div className="rounded-work border border-work-line bg-white px-4 py-3" data-testid="work-error">
      <p className="text-body text-danger">Work could not be loaded. Try again.</p>
      <button type="button" onClick={retry} className="mt-2 rounded-control border border-kit-slate-4 bg-white px-3 py-1.5 text-body text-kit-slate-12">
        Try again
      </button>
    </div>
  ) : activeView === "mine" ? (
    myItems.length === 0 ? emptyBody : (
      <div className="flex flex-col border-t border-kit-slate-4" data-testid="work-section-list">{myItems.slice(0, cardLimit).map(card)}</div>
    )
  ) : displayTeamGroups.length === 0 ? (
    emptyBody
  ) : (
    <div className="flex flex-col gap-4">
      {shownTeamGroups.map((g) => (
        <section key={g.key} className="flex flex-col" data-testid={`work-owner-group-${g.key}`}>
          <h3 className="flex h-8 min-w-0 items-center gap-2 whitespace-nowrap" data-testid={`work-owner-heading-${g.key}`}>
            {g.person ? (
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold leading-4"
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
            <span className="min-w-0 truncate text-[15px] font-semibold leading-5 text-kit-slate-12">{g.name}</span>
            <span className="shrink-0 text-[12px] font-normal leading-4 text-kit-slate-11">
              {g.items.length} action{g.items.length === 1 ? "" : "s"} to do
              {g.late > 0 && <span className="font-medium text-danger"> · {g.late} missed</span>}
            </span>
            {g.coverName && (
              <span className="min-w-0 truncate text-[12px] font-normal leading-4 text-kit-amber-11">
                Cover today: {g.coverName}
              </span>
            )}
          </h3>
          {g.dutyKey && (
            // The governed configuration failure with its ONE door
            // (workspace/MASTER §4 · Delivery MASTER §13.1): never a
            // fallback person, never a Work-local assignment control.
            <p className="text-label text-kit-slate-11" data-testid={`work-duty-unassigned-${g.dutyKey}`}>
              Nobody holds {g.name}.{" "}
              <Link className="text-kit-blue-11 underline" to="/operation?tab=staff-duties">
                Set the holder in Workspace → Staff &amp; Duties
              </Link>
            </p>
          )}
          {g.items.map(card)}
        </section>
      ))}
    </div>
  );

  return (
    <>
      {/* The 50px Destination Header every listing carries (UI MASTER §6.0,
          owner ruling 2026-09-25: Work follows the Sales Orders shell). It
          embeds the global utilities; the page prints no count up here. */}
      <ModuleHeader destinationHeader testId="work-destination-header" word="Work" docTitle="Work — Carres" />
      <ListPageShell register testId="operation-work">
      {/* The rail runs from the page header to the bottom (Jess, 2026-09-26:
          the toolbar is the right column's, never a bar across the rail). */}
      <div ref={workAreaRef} data-testid="work-area" data-layout={layout} className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {railVisible
          ? (layout === "one"
              ? <div className="absolute inset-y-0 left-0 z-20 flex shadow-lg">{rail}</div>
              : rail)
          : layout !== "one"
            ? (
              <aside className="flex w-11 shrink-0 flex-col items-center gap-2 border-r border-kit-slate-5 bg-white py-2" data-testid="work-rail-collapsed">
                <ShowFiltersButton onShow={() => setRailOpen(true)} testId="work-show-filters-rail" />
                <span className="text-label text-kit-slate-11 [writing-mode:vertical-rl]">Show filters</span>
              </aside>
            )
            : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4" data-testid="work-right-column">
        {/* The toolbar row of the §6.0 shell: white, one bottom rule, no box.
            My Work · Team Work · Search (340px). Below 600px the controls
            wrap. `Covering` is gone (Jess, 2026-09-26): cover shows on the
            row itself, never as a toolbar button. */}
        <section aria-label="Work toolbar" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-base-200 bg-white px-2 py-1.5" data-testid="work-toolbar">
          {!railVisible ? <ShowFiltersButton onShow={() => { setRailOpen(true); setPhoneRailOverride(true); }} testId="work-show-filters" /> : null}
          <div className="inline-flex overflow-hidden rounded-control border border-kit-slate-4 max-[599px]:basis-full" data-testid="work-view-switch">
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
                className={`h-[34px] px-3 text-control max-[599px]:flex-1 ${
                  activeView === k
                    ? "bg-kit-blue-9 font-semibold text-white"
                    : "bg-white text-kit-slate-11 hover:bg-kit-slate-3"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="w-[340px] shrink-0 max-[599px]:w-auto max-[599px]:basis-full">
            <SearchInput
              toolbar
              id="work-search"
              value={search}
              onChange={(event) => updateParam("q", event.target.value)}
              placeholder="Search work…"
            />
          </div>
          {activeView === "team" && ownerFocus && (
            <button
              type="button"
              data-testid="work-owner-clear"
              onClick={() => updateParam("owner", null)}
              className="rounded-full border border-kit-slate-12 bg-kit-slate-12 px-2 py-1 text-label text-white"
            >
              {teamGroups.find((group) => group.key === ownerFocus)?.name ?? "One owner"}{" "}
              · Clear
            </button>
          )}
          {(search || when !== "all" || moduleFilter !== "all" || params.get("status") || day !== "focus") && (
            <button
              type="button"
              onClick={() => setParams((before) => {
                const next = new URLSearchParams(before);
                for (const key of ["q", "when", "module", "status", "owner", "day", "week", "selected"]) next.delete(key);
                return next;
              }, { replace: true })}
              className="h-9 px-2 text-control text-kit-blue-11"
            >
              Clear all
            </button>
          )}
        </section>

        <WorkSplitShell
          layout={layout}
          activePanel={activePanel}
          railBeside={railVisible}
          list={(
            <div className="flex min-h-0 flex-1 flex-col" data-testid="work-list">
              {/* One line: the chosen Date (Jess, 2026-09-26 — the calendar
                  reference's `Monday, August 31`). No count, no tabs. */}
              {listHeading && layout !== "one" ? (
                <h2 className="shrink-0 pb-2 text-[13px] font-semibold leading-[18px] text-kit-slate-12" data-testid="work-list-heading">{listHeading}</h2>
              ) : null}
              {!loading && !error && unhealthySources.length > 0 ? (
                <div className="mt-3 shrink-0 rounded-work border border-kit-amber-6 bg-kit-amber-3 px-3 py-2 text-body text-kit-amber-11" role="status" data-testid="work-source-failed">
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
              {refreshFailed ? (
                // A failed refresh keeps the last good list and the filters;
                // only this row says so (card kit §List states).
                <div className="mt-3 flex shrink-0 items-center gap-3 rounded-work border border-work-line bg-white px-3 py-2" role="status" data-testid="work-refresh-failed">
                  <p className="min-w-0 flex-1 text-body text-danger">Work could not be loaded. Try again.</p>
                  <button type="button" onClick={retry} className="h-8 shrink-0 rounded-control border border-kit-slate-4 bg-white px-3 text-body text-kit-slate-12 hover:bg-kit-slate-3">
                    Try again
                  </button>
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto pb-1" data-testid="work-card-scroll">
                <div key={statuses.join(",")} className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-[120ms] motion-safe:ease-out">
                  {listBody}
                </div>
                {hasMore ? <div ref={moreRef} aria-hidden className="h-px" data-testid="work-list-more" /> : null}
              </div>
            </div>
          )}
          detail={selected ? (
            <>
              {layout === "one" ? (
                <button ref={backRef} type="button" className="inline-flex h-10 shrink-0 items-center gap-1.5 self-start text-body text-kit-blue-11" data-testid="work-back" onClick={() => setActivePanel("list")}>
                  <Icon name="back" />
                  Back to work
                </button>
              ) : null}
              {refreshFailed ? (
                /* §5.10: the last good mission stays; only this line says so. */
                <div className="flex shrink-0 items-center gap-3 rounded-work border border-work-line bg-white px-3 py-2" role="status" aria-live="polite" data-testid="work-detail-refresh-failed">
                  <p className="min-w-0 flex-1 text-body text-kit-slate-12">Some information could not be refreshed.</p>
                  <Button size="touch" onClick={retry}>Try again</Button>
                </div>
              ) : null}
              {selected.source.object.kind === "po_window" ? (
                <PoWindowMission item={selected.source} onOpen={() => navigate(selected.destination)} />
              ) : (
                <>
                  {/* Route first (Jess, 2026-09-26): an order's mission opens
                      on its Route and Sales Order card; the summary block is
                      drawn only for work that names no order. */}
                  {!mission.shown ? (
                    <WorkActionPanel
                      item={selected.source}
                      hasParties={false}
                      primaryAct={null}
                      onOpen={() => navigate(selected.destination)}
                    />
                  ) : null}
                  <WorkParties key={selected.id} item={selected.source} openParty={openParty} onOpenParty={setOpenParty} onReport={reportMission} />
                </>
              )}
              <WorkOwnerSource item={selected.source} />
            </>
          ) : loading || listTotal > 0 ? (
            <WorkSection className="shrink-0 p-6" data-testid="work-detail-empty">
              <p className="text-[15px] font-semibold leading-5 text-kit-slate-12">Select a work item</p>
              <p className="mt-0.5 text-body text-kit-slate-11">Choose an item from the Work list to see its mission.</p>
            </WorkSection>
          ) : null /* nothing to select: no box asks for a choice */}
        />
        </div>
      </div>
      </ListPageShell>
    </>
  );
}
