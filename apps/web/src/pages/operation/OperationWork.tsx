/**
 * OperationWork — the Workspace Work page (Workspace MASTER §5.10, APPROVED /
 * LOCKED by Jess 2026-09-28: "yes" to 定 and to the four kit admissions).
 *
 * Three columns over the ONE server Work feed:
 *
 *   rail          My Task · Team Work, search, the month (Mon to Sat, each
 *                 day's count), ATTENTION and MODULE; under the chosen module
 *                 one row per order: its SO No and its task count
 *   Mission       the order header and its Order Route stops — acts first,
 *                 each act finished in place with the owning module's form
 *   Communication one tab per outside party, recorded channels only
 *
 * Widths (the page never scales on desktop): 1340+ 280 · ≥460 · 340;
 * 1100–1339 240 · ≥460 · 300; 900–1099 220 · ≥400 · 280. Each column scrolls
 * alone. Below 900 is the phone round (not in this build): the three columns
 * keep their 900 sizes and the page scrolls sideways.
 *
 * Counts count OCCURRENCES, never POs: a PO window with two unsent POs for one
 * order is one task on that order's row.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { OperationWorkModule } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import ListPageShell from "@/components/ListPageShell";
import Icon from "@/components/kit/Icon";
import SearchInput from "@/components/kit/SearchInput";
import ModuleHeader from "./components/ModuleHeader";
import { FilterRailGroup, FilterRailMonthGrid, FilterRailRow } from "./components/workspace-rail";
import { useOpenWorkSet, type WorkRow } from "./use-open-work";
import { filterWork, isWorkDate, parseWorkMonth, WORK_MODULES, workFocusDay, workRailMonth, workStatusOf } from "./work/work-model";
import { useWorkOrderIndex } from "./work/use-work-data";
import { workOrderGroups, type WorkOrderGroup } from "./work/work-orders";
import { STOP_ORDER, type CommParty, type WorkAct, type WorkPoFact } from "./work/work-stops";
import WorkMission from "./work/WorkMission";
import WorkPoMission from "./work/WorkPoMission";
import WorkCommunication from "./work/WorkCommunication";
import WorkActionPanel from "./work/WorkActionPanel";
import PoWindowPanel from "./work/PoWindowPanel";
import { useLogisticsModel } from "./work/LogisticsCard";

export const WORK_PAGE_COPY = {
  title: "Workspace",
  mine: "My Task",
  team: "Team Work",
  search: "Search work…",
  attention: "Attention",
  module: "Module",
  allModules: "All modules",
  broken: "Broken commitment",
  missed: "Missed",
  waiting: "Waiting for answer",
  noDate: "No date",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  loading: "Loading…",
  failed: "Work could not be loaded. Try again.",
  empty: "Nothing assigned to you",
  clear: "No open work. Every track is clear.",
  seeTeam: "See Team Work",
  nothingDue: (date: string) => `Nothing due on ${date}`,
  noMissed: "No missed work",
  openDay: (date: string) => `Open ${date}`,
  openMissed: "Open Missed",
} as const;

const MODULE_LABEL: Record<OperationWorkModule, string> = {
  orders: "Sales Orders",
  purchasing: "Purchasing",
  receiving: "Receiving",
  delivery: "Delivery",
  payment: "Payment",
  issue_tracker: "Issue Tracker",
};

type Attention = "broken" | "missed" | "waiting" | "no_date";

/** The three desktop width bands (§5.10 BUILD SHEET). */
function columnsFor(width: number): { cols: string; band: "wide" | "mid" | "narrow" } {
  if (width >= 1340) return { cols: "280px minmax(460px,1fr) 340px", band: "wide" };
  if (width >= 1100) return { cols: "240px minmax(460px,1fr) 300px", band: "mid" };
  return { cols: "220px minmax(400px,1fr) 280px", band: "narrow" };
}

function inAttention(item: WorkRow, key: Attention): boolean {
  if (key === "broken") return item.broken;
  if (key === "missed") return item.timingBucket === "overdue";
  if (key === "waiting") return workStatusOf(item) === "waiting";
  return item.dueIso === null;
}

export default function OperationWork() {
  const [params, setParams] = useSearchParams();
  const areaRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth));
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const measure = () => setWidth(area.getBoundingClientRect().width || window.innerWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const layout = columnsFor(width);

  const { items: allItems, generatedOn, myUserId, loading, error, retry, unhealthySources, refreshFailed } = useOpenWorkSet();
  const { index } = useWorkOrderIndex();

  const set = (patch: Record<string, string | null>) =>
    setParams((before) => {
      const next = new URLSearchParams(before);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      return next;
    }, { replace: true });

  const scope: "mine" | "team" = params.get("scope") === "team" ? "team" : "mine";
  const search = params.get("q") ?? "";
  const moduleParam = params.get("module");
  const moduleFilter: OperationWorkModule | "all" = WORK_MODULES.includes(moduleParam as OperationWorkModule) ? (moduleParam as OperationWorkModule) : "all";

  const scoped = useMemo(
    () => filterWork(scope === "mine" ? allItems.filter((i) => myUserId && i.ownerId === myUserId) : allItems, { search, when: "all", module: "all" }),
    [allItems, myUserId, scope, search],
  );
  const dueIsos = useMemo(() => scoped.map((i) => i.dueIso), [scoped]);
  const focusDay = useMemo(() => (generatedOn ? workFocusDay(generatedOn, dueIsos) : ""), [generatedOn, dueIsos]);
  const anyMissed = scoped.some((i) => i.timingBucket === "overdue");
  /* THE OPENING CHOICE (Jess, 2026-09-27): Missed when anything is missed,
     else the focus day. One choice at a time. */
  const dayParam = params.get("day");
  const choice = dayParam ?? (anyMissed ? "missed" : focusDay);
  const inChoice = (item: WorkRow) =>
    choice === "all"
      ? true
      : isWorkDate(choice)
      ? item.timingBucket !== "overdue" && item.dueIso === choice
      : ["broken", "missed", "waiting", "no_date"].includes(choice)
        ? inAttention(item, choice as Attention)
        : false;
  const chosenSet = scoped.filter(inChoice);
  const visible = moduleFilter === "all" ? chosenSet : chosenSet.filter((i) => i.module === moduleFilter);

  const spell = (iso: string) => fmtDate(iso);
  const groups = useMemo(() => workOrderGroups(visible, index, spell), [visible, index]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosenKey = params.get("order");
  /* A related order opened from a PO view may hold no act of mine: its Route
     still shows, with `Back to {PO No}` (A3). */
  const backKey = params.get("back");
  const selected: WorkOrderGroup | null =
    groups.find((g) => g.key === chosenKey) ??
    (chosenKey?.startsWith("order:")
      ? { key: chosenKey, orderId: chosenKey.slice(6), label: chosenKey, items: [], acts: [] }
      : null) ??
    groups[0] ??
    null;

  /* The rail month: the URL's month, else the chosen date's, else today's. */
  const monthKey = parseWorkMonth(params.get("month")) ?? parseWorkMonth(isWorkDate(choice) ? choice : focusDay || generatedOn);
  const railDates = useMemo(() => (monthKey && generatedOn ? workRailMonth(scoped, generatedOn, monthKey) : null), [scoped, generatedOn, monthKey]);
  const attentionCount = (key: Attention) => scoped.filter((i) => inAttention(i, key)).length;
  const moduleCount = (m: OperationWorkModule | "all") => (m === "all" ? chosenSet : chosenSet.filter((i) => i.module === m)).length;

  /* Communication follows the act being worked; an order opens on its first act. */
  const [party, setParty] = useState<CommParty>("supplier");
  const [workingAct, setWorkingAct] = useState<WorkAct | null>(null);
  useEffect(() => {
    /* The first act in Route order — the one the Mission draws on top. */
    const first = [...(selected?.acts ?? [])].sort((a, b) => STOP_ORDER.indexOf(a.stop) - STOP_ORDER.indexOf(b.stop))[0] ?? null;
    setWorkingAct(first);
    if (first) setParty(first.party);
  }, [selected?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos: WorkPoFact[] = useMemo(() => {
    if (!selected?.orderId) return [];
    return index.windows.flatMap((w) =>
      w.pos
        .filter((p) => p.orderIds.includes(selected.orderId!))
        .map((p) => ({ poId: p.poId, documentNo: p.documentNo, supplierName: p.supplierName, sent: p.sent })),
    );
  }, [index.windows, selected?.orderId]);

  const titleRow = "flex h-16 shrink-0 items-center border-b border-kit-slate-5 px-4";
  const scopeButton = (key: "mine" | "team", label: string) => (
    <button
      type="button"
      aria-pressed={scope === key}
      onClick={() => set({ scope: key === "team" ? "team" : null, order: null })}
      className={`h-9 px-3 text-control ${scope === key ? "bg-kit-slate-3 font-semibold text-kit-slate-12" : "bg-white text-kit-slate-11 hover:bg-kit-slate-2"}`}
      data-testid={`work-view-${key}`}
    >
      {label}
    </button>
  );

  const rail = (
    <nav className="flex min-h-0 min-w-0 flex-col border-r border-kit-slate-5 bg-white" aria-label="Work filters" data-testid="work-rail">
      <div className={titleRow}>
        <div className="inline-flex overflow-hidden rounded-control border border-kit-slate-5" data-testid="work-view-switch">
          {scopeButton("mine", WORK_PAGE_COPY.mine)}
          {scopeButton("team", WORK_PAGE_COPY.team)}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
        <SearchInput id="work-search" toolbar placeholder={WORK_PAGE_COPY.search} value={search} onChange={(e) => set({ q: e.target.value || null })} data-testid="work-search" />
        {railDates ? (
          <div className="mt-3" data-testid="work-rail-month" data-focus-day={focusDay}>
            <div className="flex h-8 items-center gap-1">
              <button type="button" aria-label={WORK_PAGE_COPY.previousMonth} title={WORK_PAGE_COPY.previousMonth} onClick={() => set({ month: railDates.previousMonth })} className="grid h-8 w-8 place-items-center rounded-control border border-kit-slate-5 text-kit-slate-11 hover:bg-kit-slate-3">
                <Icon name="previous" size={16} />
              </button>
              <span className="flex-1 text-center text-strong text-kit-slate-12" data-testid="work-rail-month-label">{railDates.month}</span>
              <button type="button" aria-label={WORK_PAGE_COPY.nextMonth} title={WORK_PAGE_COPY.nextMonth} onClick={() => set({ month: railDates.nextMonth })} className="grid h-8 w-8 place-items-center rounded-control border border-kit-slate-5 text-kit-slate-11 hover:bg-kit-slate-3">
                <Icon name="forward" size={16} />
              </button>
            </div>
            <FilterRailMonthGrid
              testId="work-rail-days"
              compact
              weeks={railDates.weeks.map((week) => week.map((d) => d && { iso: d.iso, label: d.label, weekday: d.weekday, dayNumber: d.dayNumber, closed: d.holiday, count: d.count, today: d.today }))}
              chosenIso={isWorkDate(choice) ? choice : null}
              onPick={(iso) => set({ day: iso, order: null })}
            />
          </div>
        ) : null}
        <div className="-mx-4">
          <FilterRailGroup title={WORK_PAGE_COPY.attention} icon="late" groupKey="work-attention" chosen={null}>
            {(["broken", "missed", "waiting", "no_date"] as Attention[]).map((key) => (
              <FilterRailRow
                key={key}
                tone="workspace"
                label={WORK_PAGE_COPY[key === "no_date" ? "noDate" : key]}
                count={attentionCount(key)}
                active={choice === key}
                onClick={() => set({ day: key, order: null })}
                testId={`work-rail-${key === "no_date" ? "no-date" : key}`}
              />
            ))}
          </FilterRailGroup>
          <FilterRailGroup title={WORK_PAGE_COPY.module} icon="modules" groupKey="work-module" chosen={null}>
            {(["all", ...WORK_MODULES] as const).map((m) => (
              <div key={m}>
                <FilterRailRow
                  tone="workspace"
                  label={m === "all" ? WORK_PAGE_COPY.allModules : MODULE_LABEL[m]}
                  count={moduleCount(m)}
                  active={moduleFilter === m}
                  resets={m === "all"}
                  onClick={() => set({ module: m === "all" ? null : m, order: null })}
                  testId={`work-rail-module-${m}`}
                />
                {moduleFilter === m
                  ? groups.map((g) => (
                      <FilterRailRow
                        key={g.key}
                        tone="workspace"
                        indent
                        label={g.label}
                        supportingText={g.windowDate ? fmtDate(g.windowDate) : undefined}
                        count={g.items.length}
                        active={selected?.key === g.key}
                        onClick={() => set({ order: g.key, back: null })}
                        testId={`work-order-row-${g.label}`}
                      />
                    ))
                  : null}
              </div>
            ))}
          </FilterRailGroup>
        </div>
      </div>
    </nav>
  );

  const logistics = useLogisticsModel(selected?.orderId ?? "");
  /* THE EMPTY STATES, in order (HF-1, owner ruling 2026-09-17): a day with
     nothing while other work is open names the door to it; zero matches is
     never zero work. */
  const nextDoor: { key: string; label: string } | null = (() => {
    if (anyMissed && choice !== "missed") return { key: "missed", label: WORK_PAGE_COPY.openMissed };
    const next = scoped
      .filter((i) => i.timingBucket !== "overdue" && i.dueIso !== null && i.dueIso !== choice)
      .map((i) => i.dueIso as string)
      .sort()[0];
    return next ? { key: next, label: WORK_PAGE_COPY.openDay(fmtDate(next)) } : null;
  })();
  const teamHasWork = allItems.length > 0;
  const emptyState = (
    <div className="p-6 text-body text-kit-slate-11" data-testid="work-empty">
      {scoped.length > 0 ? (
        <>
          <p className="text-kit-slate-12">
            {isWorkDate(choice) ? WORK_PAGE_COPY.nothingDue(fmtDate(choice)) : choice === "missed" ? WORK_PAGE_COPY.noMissed : WORK_PAGE_COPY.empty}
          </p>
          {nextDoor ? (
            <button type="button" onClick={() => set({ day: nextDoor.key, order: null })} className="mt-3 h-9 rounded-control border border-kit-slate-5 bg-white px-3 text-body text-kit-slate-12 hover:bg-kit-slate-3">
              {nextDoor.label}
            </button>
          ) : null}
        </>
      ) : scope === "mine" ? (
        <>
          <p>{WORK_PAGE_COPY.empty}</p>
          {teamHasWork ? (
            <button type="button" onClick={() => set({ scope: "team" })} className="mt-3 h-9 rounded-control border border-kit-slate-5 bg-white px-3 text-body text-kit-slate-12 hover:bg-kit-slate-3" data-testid="work-empty-team-door">
              {WORK_PAGE_COPY.seeTeam}
            </button>
          ) : null}
        </>
      ) : (
        <p>{WORK_PAGE_COPY.clear}</p>
      )}
    </div>
  );
  /* A failed source is never zero work (HF-1): it says which one and when. */
  const health =
    !loading && !error && (unhealthySources.length > 0 || refreshFailed) ? (
      <div className="shrink-0 border-b border-kit-amber-6 bg-kit-amber-3 px-6 py-2 text-body text-kit-amber-11" role="status" data-testid="work-source-failed">
        {unhealthySources.map((source) => (
          <p key={source.key}>
            Could not refresh {MODULE_LABEL[source.key]}
            {source.lastSuccessfulAt ? ` · Last updated ${fmtDate(source.lastSuccessfulAt, { time: true })}` : ""}
          </p>
        ))}
        {refreshFailed ? (
          <p className="flex items-center gap-3">
            {WORK_PAGE_COPY.failed}
            <button type="button" onClick={retry} className="h-8 rounded-control border border-kit-slate-5 bg-white px-3 text-body text-kit-slate-12">Try again</button>
          </p>
        ) : null}
      </div>
    ) : null;
  const mission = (
    <main className="flex min-h-0 min-w-0 flex-col border-r border-kit-slate-5 bg-white" data-testid="work-middle">
      {health}
      {loading ? (
        <p className="p-6 text-body text-kit-slate-11" role="status">{WORK_PAGE_COPY.loading}</p>
      ) : error ? (
        <div className="p-6">
          <p className="text-body text-kit-red-11">{WORK_PAGE_COPY.failed}</p>
          <button type="button" onClick={retry} className="mt-2 h-9 rounded-control border border-kit-slate-5 px-3 text-body">Try again</button>
        </div>
      ) : !selected ? (
        unhealthySources.length > 0 && scoped.length === 0 ? null : emptyState
      ) : selected.poId ? (
        <WorkPoMission
          key={selected.poId}
          poId={selected.poId}
          acts={selected.acts}
          items={selected.items}
          index={index}
          onOpenOrder={(orderId) => set({ order: `order:${orderId}`, back: selected.key })}
          onPickAct={(act) => {
            setWorkingAct(act);
            setParty(act.party);
          }}
        />
      ) : selected.orderId ? (
        <WorkMission
          key={selected.orderId}
          back={backKey?.startsWith("po:") ? { label: `Back to ${backKey.slice(3)}`, onBack: () => set({ order: backKey, back: null }) } : null}
          orderId={selected.orderId}
          acts={selected.acts}
          items={selected.items}
          pos={pos}
          logistics={selected.orderId ? logistics.model ?? null : null}
          stacked={layout.band !== "wide"}
          narrow={layout.band === "narrow"}
          onPickAct={(act) => {
            setWorkingAct(act);
            setParty(act.party);
          }}
        />
      ) : (
        /* An occurrence that names no single order (A3): its own panel. */
        <div className="min-h-0 flex-1 overflow-y-auto p-6" data-testid="work-object-mission">
          {selected.items.map((item) =>
            item.source.object.kind === "po_window" ? (
              <div key={item.id} className="flex flex-col gap-3">
                <WorkActionPanel item={item.source} onOpen={() => window.location.assign(item.destination)} />
                <PoWindowPanel item={item.source} />
              </div>
            ) : (
              <WorkActionPanel key={item.id} item={item.source} onOpen={() => window.location.assign(item.destination)} />
            ),
          )}
        </div>
      )}
    </main>
  );

  return (
    <>
      <ModuleHeader destinationHeader testId="work-destination-header" word={WORK_PAGE_COPY.title} docTitle="Workspace — Carres" />
      <ListPageShell register testId="operation-work">
        <div ref={areaRef} className="min-h-0 min-w-0 flex-1 overflow-x-auto" data-testid="work-area" data-band={layout.band}>
          <div className="grid h-full min-h-0" style={{ gridTemplateColumns: layout.cols }}>
            {rail}
            {mission}
            <aside className="flex min-h-0 min-w-0 flex-col bg-white" data-testid="work-comm-column">
              {selected?.orderId || selected?.poId ? (
                <WorkCommunication
                  orderId={selected.orderId}
                  supplierName={selected.poId ? selected.items.find((i) => i.recipient)?.recipient ?? null : null}
                  party={party}
                  onParty={setParty}
                  sendAct={workingAct?.kind === "send_po"}
                />
              ) : (
                <header className={titleRow}>
                  <h2 className="text-strong text-kit-slate-12">Communication</h2>
                </header>
              )}
            </aside>
          </div>
        </div>
      </ListPageShell>
    </>
  );
}
