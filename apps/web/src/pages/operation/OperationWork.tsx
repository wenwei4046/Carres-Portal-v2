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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { orderActionLines, workspaceDutyLabelOf, type OperationWorkModule } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { avatarColor, personInitials, personLabel } from "@/lib/staff-avatar";
import ListPageShell from "@/components/ListPageShell";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import Icon from "@/components/kit/Icon";
import { TopBarIcons } from "./components/GlobalTopBar";
import { useOpenWorkSet, type WorkRow } from "./use-open-work";
import {
  filterWork,
  inWorkDay,
  isWorkDate,
  parseWorkWeek,
  WORK_MODULES,
  workFocusDay,
  workLayoutFor,
  workModuleCounts,
  workRailDates,
  workSections,
  type WorkWhen,
  workListTabOf,
} from "./work/work-model";
import WorkSplitShell, { type WorkLayout } from "./work/WorkSplitShell";
import WorkActionPanel from "./work/WorkActionPanel";
import WorkParties from "./work/WorkParties";
import WorkRail, { WorkDateSection, WorkModuleSection } from "./work/WorkDayNav";
import WorkCard, { WorkCardSkeleton, WorkListTabs, WorkSection, type WorkListTab } from "./work/WorkCard";

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

/** Team Work's owner group: the normal owner, a named person, or the duty. */
function ownerGroupKey(i: WorkRow): string {
  return i.normalOwnerId ??
    (i.ownerName ? `person:${i.ownerName}` : `duty:${i.ownerDuty ?? "No owner yet"}`);
}

export default function OperationWork() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const workAreaRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<WorkLayout>(() =>
    typeof window === "undefined" ? "three" : workLayoutFor(window.innerWidth),
  );
  const [activePanel, setActivePanel] = useState<"list" | "detail">("list");
  /** 960–1279px: the rail is collapsed until the toolbar's `Filters` opens it. */
  const [railOpen, setRailOpen] = useState(false);
  /** Below 960px: which compact filter control is open. */
  const [compact, setCompact] = useState<"date" | "module" | null>(null);

  // The PAGE decides the panels, not the window: with the portal sidebar open
  // a 1440px window leaves ~1200px of page. The page is this page's own
  // full-width frame (canvas padding included), so the owner's breakpoints
  // (1280 · 960) read exactly as written when no sidebar is drawn. A width of
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
  const inDay = (item: WorkRow) => inWorkDay(item, day, generatedOn, focusDay);
  const listTab: WorkListTab = params.get("list") === "waiting" || params.get("list") === "completed"
    ? params.get("list") as WorkListTab
    : "todo";
  /* To do · Waiting (§5.10): one day's open set split by the recorded reply
     state; the rail's counts keep the whole open set. */
  const inDaySet = beforeDay.filter(inDay);
  const todoRows = inDaySet.filter((item) => workListTabOf(item) === "todo");
  const waitingRows = inDaySet.filter((item) => workListTabOf(item) === "waiting");
  const visible = listTab === "waiting" ? waitingRows : listTab === "completed" ? [] : todoRows;
  const lateCount = visible.filter((i) => i.timingBucket === "overdue").length;

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
  const filtersActive = Boolean(search) || when !== "all" || moduleFilter !== "all" || covered
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
  // The date rail and its badge already say when; the list is one ordered run.
  const myItems = workSections(visible).flatMap((section) => section.items);
  const displayTeamGroups = visibleTeamGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => visibleIds.has(item.id)) }))
    .filter((group) => group.items.length > 0);
  const openRow = (i: WorkRow) => {
    updateParam("selected", i.id);
    if (layout === "one") setActivePanel("detail");
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

  /** The heading names the chosen Date — the same words as the rail. */
  const listHeading = selectedDay === "missed"
    ? "Missed"
    : selectedDay === "no_date"
      ? "No working date"
      : isWorkDate(selectedDay)
        ? fmtDate(selectedDay)
        : "Work";
  const moduleWord = moduleFilter === "all" ? "All modules" : MODULE_LABEL[moduleFilter];

  const card = (i: WorkRow) => (
    <WorkCard
      cover={i.ownerState === "covered" && i.activeCover
        ? activeView === "mine"
          ? `Covered for ${i.normalOwner?.name ?? "normal owner"}`
          : `Covered by ${i.activeCover.name ?? "cover"}`
        : null}
      key={`${i.orderId}:${i.ruleKey}`}
      item={i}
      moduleLabel={MODULE_LABEL[i.module]}
      action={`${deliveryLines(i)?.act ?? i.action}`}
      today={generatedOn}
      selected={layout !== "one" && selected?.id === i.id}
      onSelect={() => openRow(i)}
      onOpenRecord={() => navigate(i.destination)}
    />
  );

  const dateSection = railDates ? (
    <WorkDateSection
      dates={railDates}
      selected={railSelected}
      onSelect={(key) => {
        updateParam("day", key);
        setCompact(null);
      }}
      onWeek={(monday) => updateParam("week", monday)}
    />
  ) : null;
  const moduleSection = (
    <WorkModuleSection
      modules={railModules}
      counts={moduleCounts}
      total={moduleCountRows.length}
      selected={moduleFilter}
      onSelect={(module) => {
        updateParam("module", module);
        setCompact(null);
      }}
    />
  );

  /* One toolbar control: 36px from 960px, 40px below; 14/20; 12px sides. */
  const toolbarRow = layout === "one" ? "flex flex-wrap items-center gap-2" : "contents";
  const toolbarButton = (active: boolean) =>
    `inline-flex h-10 items-center gap-1.5 rounded-control border px-3 text-control min-[960px]:h-9 ${active ? "border-kit-blue-9 bg-kit-blue-3 text-kit-slate-12" : "border-kit-slate-4 bg-white text-kit-slate-12 hover:bg-kit-slate-3"}`;

  const listBody = listTab === "completed" || (listTab === "waiting" && !loading && visible.length === 0) ? (
    <p className="py-2 text-body text-kit-slate-11" data-testid="work-tab-empty">
      {listTab === "waiting" ? "No work waiting for this selection." : "No work completed for this selection."}
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
      <div className="flex flex-col gap-2" data-testid="work-section-list">{myItems.slice(0, cardLimit).map(card)}</div>
    )
  ) : displayTeamGroups.length === 0 ? (
    emptyBody
  ) : (
    <div className="flex flex-col gap-4">
      {shownTeamGroups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2" data-testid={`work-owner-group-${g.key}`}>
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
    <ListPageShell
      title="Work"
      testId="operation-work"
      workspace
      actions={<TopBarIcons />}
      titleRight={
        // Every count says WHAT it counts (card §7 — supersedes `open · overdue`).
        <span className="block truncate text-[12px] font-normal leading-4 text-base-400 min-[960px]:text-[13px] min-[960px]:leading-[18px]" data-testid="work-header-count">
          {visible.length} action{visible.length === 1 ? "" : "s"} to do
          {lateCount > 0 ? ` · ${lateCount} missed` : ""}
        </span>
      }
    >
      <div ref={workAreaRef} data-testid="work-area" data-layout={layout} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        {/* The toolbar: ONE independent white section (owner density ruling
            2026-09-25). Below 960px it is exactly two rows — Date · Module ·
            My/Team, then Search · Owner · Covered — and below 600px four:
            Date · Module / My/Team / Search / Owner · Covered. */}
        <WorkSection aria-label="Work toolbar" className={`flex shrink-0 gap-2 p-2.5 min-[600px]:p-3 ${layout === "one" ? "flex-col" : "flex-wrap items-center"}`} data-testid="work-toolbar">
          <div className={toolbarRow} data-testid="work-toolbar-row-1">
            {layout === "two" ? (
              <button
                type="button"
                aria-expanded={railOpen}
                aria-controls="work-filters"
                data-testid="work-filters-toggle"
                onClick={() => setRailOpen((open) => !open)}
                className={toolbarButton(railOpen)}
              >
                <Icon name="panelToggle" />
                Filters
              </button>
            ) : null}
            {layout === "one" ? (
              <>
                <button
                  type="button"
                  aria-expanded={compact === "date"}
                  data-testid="work-compact-date"
                  onClick={() => setCompact((open) => (open === "date" ? null : "date"))}
                  className={toolbarButton(compact === "date")}
                >
                  <Icon name="date" />
                  {listHeading}
                </button>
                <button
                  type="button"
                  aria-expanded={compact === "module"}
                  data-testid="work-compact-module"
                  onClick={() => setCompact((open) => (open === "module" ? null : "module"))}
                  className={toolbarButton(compact === "module")}
                >
                  <Icon name="modules" />
                  {moduleWord}
                </button>
              </>
            ) : null}
            {/* The border is inside the 36px (40px): each segment is 34px (38px). */}
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
                  className={`h-[38px] px-3 text-control min-[960px]:h-[34px] max-[599px]:flex-1 ${
                    activeView === k
                      ? "bg-kit-slate-12 font-semibold text-white"
                      : "bg-white text-kit-slate-11 hover:bg-kit-slate-3"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className={toolbarRow} data-testid="work-toolbar-row-2">
            <div className={layout === "one" ? "min-w-[160px] flex-1 max-[599px]:basis-full" : "w-60 shrink-0"}>
              <SearchInput
                toolbar
                id="work-search"
                value={search}
                onChange={(event) => updateParam("q", event.target.value)}
                placeholder="Search work…"
              />
            </div>
            {activeView === "team" && (
              <Select
                id="work-owner"
                value={ownerFocus ?? "all"}
                onValueChange={(value) => updateParam("owner", value)}
                options={ownerOptions}
                toolbar
              />
            )}
            <button
              type="button"
              aria-pressed={covered}
              onClick={() => updateParam("covered", covered ? null : "1")}
              className={toolbarButton(covered)}
            >
              Covered
            </button>
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
            {(search || when !== "all" || moduleFilter !== "all" || covered || day !== "focus") && (
              <button
                type="button"
                onClick={() => setParams((before) => {
                  const next = new URLSearchParams(before);
                  for (const key of ["q", "when", "module", "covered", "owner", "day", "week", "selected"]) next.delete(key);
                  return next;
                }, { replace: true })}
                className="h-10 px-2 text-control text-kit-blue-11 min-[960px]:h-9"
              >
                Clear all
              </button>
            )}
          </div>
        </WorkSection>

        {/* Below 960px the chosen compact control opens its section here. */}
        {layout === "one" && compact ? (
          <div className="shrink-0" data-testid={`work-compact-${compact}-panel`}>
            {compact === "date" ? dateSection : moduleSection}
          </div>
        ) : null}

        <WorkSplitShell
          layout={layout}
          activePanel={activePanel}
          railOpen={railOpen}
          rail={(
            <div id="work-filters">
              <WorkRail>
                {dateSection}
                {moduleSection}
              </WorkRail>
            </div>
          )}
          list={(
            <div className="flex min-h-0 flex-1 flex-col" data-testid="work-list">
              {/* The heading and tabs stay put; the cards scroll beneath them. */}
              <div className="shrink-0">
                <h2 className="mb-2 flex min-h-6 flex-wrap items-baseline gap-x-1.5 text-[16px] font-semibold leading-[22px] text-work-ink" data-testid="work-list-heading">
                  {listHeading}
                  <span className="text-[13px] font-medium leading-[18px] text-work-muted">
                    {todoRows.length} action{todoRows.length === 1 ? "" : "s"} to do
                  </span>
                </h2>
                <WorkListTabs
                  value={listTab}
                  counts={{ todo: todoRows.length, ...(waitingRows.length > 0 ? { waiting: waitingRows.length } : {}) }}
                  onChange={(tab) => updateParam("list", tab === "todo" ? null : tab)}
                />
              </div>
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
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto pb-1" data-testid="work-card-scroll">
                <div key={listTab} className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-[120ms] motion-safe:ease-out">
                  {listBody}
                </div>
                {hasMore && listTab !== "completed" ? <div ref={moreRef} aria-hidden className="h-px" data-testid="work-list-more" /> : null}
              </div>
            </div>
          )}
          detail={selected ? (
            <>
              {layout === "one" ? (
                <button type="button" className="inline-flex h-10 shrink-0 items-center gap-1.5 self-start text-body text-kit-blue-11" data-testid="work-back" onClick={() => setActivePanel("list")}>
                  <Icon name="back" />
                  Back to work
                </button>
              ) : null}
              <WorkActionPanel item={selected.source} onOpen={() => navigate(selected.destination)} />
              <WorkParties item={selected.source} />
            </>
          ) : (
            <WorkSection className="shrink-0 p-6 text-body text-kit-slate-11">Select work to see what to do.</WorkSection>
          )}
        />
      </div>
    </ListPageShell>
  );
}
