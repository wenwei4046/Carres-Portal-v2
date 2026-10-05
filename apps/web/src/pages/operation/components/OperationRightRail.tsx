import { useEffect, useState } from "react";
import { CalendarDays, ListTodo, ScrollText, X, type LucideIcon } from "lucide-react";
import { useActiveOrder } from "@/lib/active-order";
import CalendarPanel from "./rail/CalendarPanel";
import AnnotationTimeline from "./AnnotationTimeline";
import GlobalActivity from "./GlobalActivity";
import TasksArea from "../tasks/TasksArea";
import { useTasksHost } from "../tasks/tasks-host";
import { useOpenWorkSet } from "../use-open-work";
import { myMissedAndToday } from "../work/work-model";

/**
 * OperationRightRail — the Quick Rail and the ONE right area beside the page.
 *
 * ── LOCAL PROPOSAL (owner direction 2026-10-05) — NOT DEPLOYED ────────────
 *
 * Three ICON-ONLY doors, `Calendar · Tasks · Activity`: no visible word, each
 * door keeps its name as tooltip and accessible name, its icon, its 60×44 hit
 * area and its selected style. `Tasks` replaces `My Work` with the same icon
 * (the left navigation's `Work` face, ListTodo) and the same badge: Missed +
 * today, red while anything is missed, none while loading or failed.
 *
 * The area shows ONE view at a time and is at most 560px wide. Opening Tasks
 * never changes the page on the left. A view, once opened, stays MOUNTED
 * (hidden) — so the Tasks list keeps its place and an open task keeps its
 * draft — but leaving a task with unsaved input through another door or ×
 * still asks `Leave without saving?` first (storyboard screen 26).
 */
type Door = "calendar" | "tasks" | "activity";

/* Calendar (blue) · Tasks · Activity. Tasks wears the SAME icon as the left
   navigation's `Work` destination (`portal-nav.ts`, ListTodo — owner ruling
   2026-08-15). */
const TABS: { key: Door; label: string; icon: LucideIcon; active: string }[] = [
  { key: "calendar", label: "Calendar", icon: CalendarDays, active: "bg-info-soft text-info" },
  { key: "tasks", label: "Tasks", icon: ListTodo, active: "bg-warning-soft text-warning" },
  // Activity = the open order's history timeline when an order is open,
  // otherwise recent business changes the signed-in person may see.
  { key: "activity", label: "Activity", icon: ScrollText, active: "bg-base-100 text-base-700" },
];

export default function OperationRightRail() {
  const [active, setActive] = useState<Door | null>(null);
  const [mounted, setMounted] = useState<ReadonlySet<Door>>(() => new Set());
  const activeOrderId = useActiveOrder((s) => s.orderId);
  const guard = useTasksHost((s) => s.guard);

  const show = (next: Door | null) => {
    setActive(next);
    if (next) setMounted((current) => (current.has(next) ? current : new Set([...current, next])));
  };
  /* Leaving Tasks with an unsaved task asks first; Tasks itself never does. */
  const go = (next: Door | null) => (active === "tasks" && next !== "tasks" ? guard(() => show(next)) : show(next));
  /* `View tasks` (the first-entry reminder) opens the same Tasks list. */
  const tasksRequest = useTasksHost((s) => s.tasksRequest);
  useEffect(() => {
    if (tasksRequest > 0) show("tasks");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a request, not a dependency
  }, [tasksRequest]);

  const { items, myUserId, myFocus, hasData, error } = useOpenWorkSet();
  // ONE count (Workspace MASTER §7.1): the same Missed + today number the list
  // prints. No response yet, or a failed read, means no number — never `0`.
  const { missed, today } = myMissedAndToday(items, myUserId, myFocus);

  const badgeFor = (key: Door): { n: number; tone: string } | null => {
    if (key === "tasks" && hasData && !error && missed + today > 0)
      return { n: missed + today, tone: missed > 0 ? "bg-danger" : "bg-base-700" };
    return null;
  };
  const nameFor = (tab: (typeof TABS)[number]): string =>
    tab.key === "tasks" && hasData ? `Tasks · ${missed} missed · ${today} today` : tab.label;

  const doorTab = active && active !== "tasks" ? TABS.find((t) => t.key === active) : undefined;

  return (
    <div className="flex h-screen sticky top-0">
      {mounted.size > 0 && (
        <div
          className="flex w-[clamp(366px,32vw,560px)] max-w-drawer flex-col border-l border-base-200 bg-white"
          hidden={active === null}
          data-testid="right-area"
          data-view={active ?? "closed"}
        >
          {doorTab ? (
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-base-100 px-3.5">
              <div className="flex min-w-0 items-center gap-2 text-strong text-base-900">
                <doorTab.icon size={18} className="shrink-0 text-base-500" />
                <span className="truncate">{doorTab.label}</span>
              </div>
              <button type="button" onClick={() => show(null)} className="rounded p-1 text-base-500 hover:bg-hovertint" aria-label="Close panel">
                <X size={16} />
              </button>
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {mounted.has("tasks") && (
              <div hidden={active !== "tasks"} className="flex min-h-0 flex-1 flex-col">
                <TasksArea onClose={() => show(null)} />
              </div>
            )}
            {mounted.has("calendar") && (
              <div hidden={active !== "calendar"} className="min-h-0 flex-1 overflow-auto p-3.5">
                <CalendarPanel />
              </div>
            )}
            {mounted.has("activity") && (
              <div hidden={active !== "activity"} className="min-h-0 flex-1 overflow-auto p-3.5">
                {activeOrderId ? <AnnotationTimeline orderId={activeOrderId} /> : <GlobalActivity />}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Icon strip — ICON ONLY; the name is the tooltip and the accessible name. */}
      <div className="w-[64px] flex flex-col items-center py-3 gap-2 border-l border-base-200 bg-white">
        {TABS.map((t) => {
          const isActive = active === t.key;
          const badge = badgeFor(t.key);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => go(isActive ? null : t.key)}
              title={t.label}
              aria-label={nameFor(t)}
              aria-pressed={isActive}
              data-testid={`rail-door-${t.key}`}
              className={`relative flex h-11 w-[60px] items-center justify-center rounded-md transition-colors ${
                isActive ? t.active : "text-base-500 hover:bg-hovertint"
              }`}
            >
              <t.icon size={18} strokeWidth={2} aria-hidden />
              {badge && (
                <span
                  data-rail-badge
                  className={`absolute -top-0.5 right-1 min-w-[16px] h-[16px] px-1 rounded-full ${badge.tone} text-white text-label font-semibold leading-[16px] text-center`}
                >
                  {badge.n > 99 ? "99+" : badge.n}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
