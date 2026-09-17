import { useState } from "react";
import { CalendarDays, ListTodo, ScrollText, X, type LucideIcon } from "lucide-react";
import { useActiveOrder } from "@/lib/active-order";
import CalendarPanel from "./rail/CalendarPanel";
import TasksPanel from "./rail/TasksPanel";
import AnnotationTimeline from "./AnnotationTimeline";
import GlobalActivity from "./GlobalActivity";
import { useOpenWorkSet } from "../use-open-work";
import { myMissedAndToday } from "../work/work-model";

/**
 * OperationRightRail — Gmail-style collapsible right rail (Jess COO ask).
 * A 52px icon strip (Calendar / Keep notes / Follow-ups) that expands a 320px panel.
 * The Follow-ups icon carries a red badge = count of overdue tasks (open past the
 * 60-min SLA) so the team is nudged to take action within the hour. Follow-ups is
 * the same ops_tasks data the Orders list flag column drives.
 */
type Panel = "calendar" | "tasks" | "activity";
// Calendar (blue) · Team (green — the duty board) · Follow-ups — the
// Follow-ups rail is the SAME flag system as the Orders list flag column
// (both ops_tasks), so it uses the Flag icon + amber (Jess 2026-06-29).
// Team REPLACED Notes (Jess 2026-07-19): Keep notes shipped 6/12 and held
// exactly ONE note ever — dead slot, repurposed as the DUTY & ROLES board.
const TABS: { key: Panel; label: string; icon: LucideIcon; active: string }[] = [
  { key: "calendar", label: "Calendar", icon: CalendarDays, active: "bg-info-soft text-info" },
  // My Work wears the SAME icon as the left navigation's `Work` destination
  // (`portal-nav.ts`, ListTodo) — owner ruling 2026-08-15. The rail is that
  // destination's peek (ui/MASTER.md §5), and a peek that wears a different
  // face than the door it previews reads as a different feature. The Flag it
  // replaced was borrowed from the Orders follow-up column, which is a
  // different system entirely.
  { key: "tasks", label: "My Work", icon: ListTodo, active: "bg-warning-soft text-warning" },
  // Activity = the open order's history timeline (Jess 2026-06-30: moved off the
  // page into the rail, after the flag). Shows only when an order is open.
  { key: "activity", label: "Activity", icon: ScrollText, active: "bg-base-100 text-base-700" },
];

export default function OperationRightRail() {
  const [active, setActive] = useState<Panel | null>(null);
  const activeOrderId = useActiveOrder((s) => s.orderId);

  const { items, myUserId, focusDay, hasData } = useOpenWorkSet();
  // ONE count (Workspace MASTER §7.1): the same Missed + focus-day number the
  // panel prints and My Work's focus list holds. Later days never count, and
  // no response yet means no number — never `0`.
  const { missed, today } = myMissedAndToday(items, myUserId, focusDay);

  const badgeFor = (key: Panel): { n: number; tone: string } | null => {
    if (key === "tasks" && hasData && missed + today > 0)
      return { n: missed + today, tone: missed > 0 ? "bg-danger" : "bg-base-700" };
    return null;
  };
  const nameFor = (tab: (typeof TABS)[number]): string =>
    tab.key === "tasks" && hasData ? `My Work · ${missed} missed · ${today} today` : tab.label;

  return (
    <div className="flex h-screen sticky top-0">
      {/* Active panel */}
      {active && (
        <div className="w-[340px] flex flex-col border-l border-base-200 bg-white">
          <div className="flex items-center justify-between px-3.5 h-12 border-b border-base-100 shrink-0">
            <div className="text-strong text-base-900 flex items-center gap-2">
              {(() => {
                const Icon = TABS.find((t) => t.key === active)?.icon;
                return Icon ? <Icon size={18} className="text-base-500" /> : null;
              })()}
              {TABS.find((t) => t.key === active)?.label}
            </div>
            <button
              type="button"
              onClick={() => setActive(null)}
              className="p-1 rounded text-base-500 hover:bg-hovertint"
              aria-label="Close panel"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3.5 min-h-0">
            {active === "calendar" && <CalendarPanel />}
            {active === "tasks" && <TasksPanel />}
            {active === "activity" &&
              (activeOrderId ? (
                <AnnotationTimeline orderId={activeOrderId} />
              ) : (
                <GlobalActivity />
              ))}
          </div>
        </div>
      )}

      {/* Icon strip */}
      <div className="w-[52px] flex flex-col items-center py-3 gap-1 border-l border-base-200 bg-white">
        {TABS.map((t) => {
          const isActive = active === t.key;
          const badge = badgeFor(t.key);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(isActive ? null : t.key)}
              title={t.label}
              aria-label={nameFor(t)}
              className={`relative w-9 h-9 rounded-full grid place-items-center transition-colors ${
                isActive ? t.active : "text-base-500 hover:bg-hovertint"
              }`}
            >
              <t.icon size={18} strokeWidth={2} />
              {badge && (
                <span
                  className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full ${badge.tone} text-white text-label font-semibold leading-[16px] text-center`}
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
