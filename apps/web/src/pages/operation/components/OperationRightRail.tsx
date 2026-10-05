import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, ListTodo, ScrollText, X, type LucideIcon } from "lucide-react";
import { useActiveOrder } from "@/lib/active-order";
import { useCurrentPageWork } from "@/components/working-panel/page-work";
import CalendarPanel from "./rail/CalendarPanel";
import TasksPanel from "./rail/TasksPanel";
import AnnotationTimeline from "./AnnotationTimeline";
import GlobalActivity from "./GlobalActivity";
import PageWorkPanel, { WORKING_PANEL_WORDS } from "./rail/PageWorkPanel";
import { useOpenWorkSet } from "../use-open-work";
import { myMissedAndToday } from "../work/work-model";

/**
 * OperationRightRail — the Quick Rail and the ONE right area beside the page.
 *
 * ── LOCALHOST PROPOSAL (owner flow 2026-10-05) — NOT DEPLOYED ──────────────
 *
 * Three ICON-ONLY doors, `Calendar · Tasks · Activity` (owner-approved names;
 * the visible 10px words are gone, each door keeps its tooltip and accessible
 * name, its icon, its 60×44 hit area and its selected style). `Tasks`
 * replaces `My Work` with the same icon, badge and count.
 *
 * The right area shows ONE view at a time — never two stacked panels:
 *
 *   page      the current module page's own work (the shared Working Panel,
 *             page-supplied source). Opens by itself when a page with a work
 *             source is entered.
 *   calendar · tasks · activity   the three doors.
 *
 * HOW TASKS COEXISTS WITH CALENDAR AND ACTIVITY IS STILL UNDER OWNER RESEARCH,
 * so this is the most reversible arrangement, not a decision: every view that
 * was opened STAYS MOUNTED (hidden, never unmounted), so glancing at Calendar
 * or Tasks never loses the open task or an editor's draft, and `Back to
 * {page}` returns to exactly where the operator was. Pressing the selected
 * door again also returns to the page's work (or closes the area when the
 * page has none). Closing the area hides it and keeps the same state.
 */
type Door = "calendar" | "tasks" | "activity";
type View = Door | "page";

/* Calendar (blue) · Tasks · Activity. Tasks wears the SAME icon as the left
   navigation's `Work` destination (`portal-nav.ts`, ListTodo — owner ruling
   2026-08-15): the door previews that destination, so it keeps its face. */
const TABS: { key: Door; label: string; icon: LucideIcon; active: string }[] = [
  { key: "calendar", label: "Calendar", icon: CalendarDays, active: "bg-info-soft text-info" },
  { key: "tasks", label: "Tasks", icon: ListTodo, active: "bg-warning-soft text-warning" },
  // Activity = the open order's history timeline when an order is open,
  // otherwise recent business changes the signed-in person may see.
  { key: "activity", label: "Activity", icon: ScrollText, active: "bg-base-100 text-base-700" },
];

export default function OperationRightRail() {
  const [view, setView] = useState<View | null>(null);
  /* Views opened at least once stay mounted (hidden) — the draft guard. */
  const [mounted, setMounted] = useState<ReadonlySet<View>>(() => new Set());
  const activeOrderId = useActiveOrder((s) => s.orderId);
  const page = useCurrentPageWork();
  const pageKey = page?.pageKey ?? null;

  const show = (next: View | null) => {
    setView(next);
    if (next) setMounted((current) => (current.has(next) ? current : new Set([...current, next])));
  };

  /* Entering a page that offers work opens the area on that work. Leaving it
     returns a page view to closed; a door view the operator chose stays. */
  const lastPage = useRef<string | null>(null);
  useEffect(() => {
    if (pageKey === lastPage.current) return;
    lastPage.current = pageKey;
    if (pageKey) {
      show("page");
      return;
    }
    setView((current) => (current === "page" ? null : current));
    setMounted((current) => {
      if (!current.has("page")) return current;
      const next = new Set(current);
      next.delete("page");
      return next;
    });
  }, [pageKey]);

  const { items, myUserId, myFocus, hasData } = useOpenWorkSet();
  // ONE count (Workspace MASTER §7.1): the same Missed + focus-day number the
  // panel prints and My Work's focus list holds. Later days never count, and
  // no response yet means no number — never `0`.
  const { missed, today } = myMissedAndToday(items, myUserId, myFocus);

  const badgeFor = (key: Door): { n: number; tone: string } | null => {
    if (key === "tasks" && hasData && missed + today > 0)
      return { n: missed + today, tone: missed > 0 ? "bg-danger" : "bg-base-700" };
    return null;
  };
  const nameFor = (tab: (typeof TABS)[number]): string =>
    tab.key === "tasks" && hasData ? `Tasks · ${missed} missed · ${today} today` : tab.label;

  const pressDoor = (door: Door) => {
    if (view !== door) return show(door);
    show(page ? "page" : null);
  };

  const doorTab = view && view !== "page" ? TABS.find((t) => t.key === view) : undefined;

  return (
    <div className="flex h-screen sticky top-0">
      {/* The ONE right area. Hidden — never unmounted — while closed. */}
      {mounted.size > 0 && (
        <div
          className="flex w-[clamp(366px,32vw,560px)] max-w-drawer flex-col border-l border-base-200 bg-white"
          hidden={view === null}
          data-testid="right-area"
          data-view={view ?? "closed"}
        >
          {doorTab ? (
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-base-100 px-3.5">
              <div className="flex min-w-0 items-center gap-2 text-strong text-base-900">
                <doorTab.icon size={18} className="shrink-0 text-base-500" />
                <span className="truncate">{doorTab.label}</span>
              </div>
              <button
                type="button"
                onClick={() => show(null)}
                className="rounded p-1 text-base-500 hover:bg-hovertint"
                aria-label="Close panel"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          {page && view && view !== "page" ? (
            /* The obvious way back to the page's own work (PROPOSAL word). */
            <button
              type="button"
              onClick={() => show("page")}
              data-testid="back-to-page-work"
              className="flex h-9 shrink-0 items-center gap-1.5 border-b border-base-100 px-3.5 text-left text-meta font-medium text-kit-blue-11 hover:bg-hovertint"
            >
              <ArrowLeft size={14} aria-hidden />
              {WORKING_PANEL_WORDS.backTo(page.pageName)}
            </button>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">
            {mounted.has("page") && page ? (
              <div hidden={view !== "page"} className="h-full" data-testid="right-area-page">
                <PageWorkPanel key={page.pageKey} source={page} onClose={() => show(null)} />
              </div>
            ) : null}
            {mounted.has("calendar") && (
              <div hidden={view !== "calendar"} className="p-3.5">
                <CalendarPanel />
              </div>
            )}
            {mounted.has("tasks") && (
              <div hidden={view !== "tasks"} className="p-3.5">
                <TasksPanel />
              </div>
            )}
            {mounted.has("activity") && (
              <div hidden={view !== "activity"} className="p-3.5">
                {activeOrderId ? <AnnotationTimeline orderId={activeOrderId} /> : <GlobalActivity />}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Icon strip — ICON ONLY; the name is the tooltip and the accessible name. */}
      <div className="w-[64px] flex flex-col items-center py-3 gap-2 border-l border-base-200 bg-white">
        {TABS.map((t) => {
          const isActive = view === t.key;
          const badge = badgeFor(t.key);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => pressDoor(t.key)}
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
