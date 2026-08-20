import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Users, ListTodo, ScrollText, X, type LucideIcon } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useActiveOrder } from "@/lib/active-order";
import type { OpsTask } from "@carres/shared";
import CalendarPanel from "./rail/CalendarPanel";
import TeamPanel from "./rail/TeamPanel";
import TasksPanel, { TASKS_KEY } from "./rail/TasksPanel";
import AnnotationTimeline from "./AnnotationTimeline";
import GlobalActivity from "./GlobalActivity";

/**
 * OperationRightRail — Gmail-style collapsible right rail (Jess COO ask).
 * A 52px icon strip (Calendar / Keep notes / Follow-ups) that expands a 320px panel.
 * The Follow-ups icon carries a red badge = count of overdue tasks (open past the
 * 60-min SLA) so the team is nudged to take action within the hour. Follow-ups is
 * the same ops_tasks data the Orders list flag column drives.
 */
type Panel = "calendar" | "team" | "tasks" | "activity";
// Calendar (blue) · Team (green — the duty board) · Follow-ups — the
// Follow-ups rail is the SAME flag system as the Orders list flag column
// (both ops_tasks), so it uses the Flag icon + amber (Jess 2026-06-29).
// Team REPLACED Notes (Jess 2026-07-19): Keep notes shipped 6/12 and held
// exactly ONE note ever — dead slot, repurposed as the DUTY & ROLES board.
const TABS: { key: Panel; label: string; icon: LucideIcon; active: string }[] = [
  // Team FIRST (Jess 2026-07-19: "team put at first, after only calendar").
  { key: "team", label: "Team", icon: Users, active: "bg-success-soft text-success" },
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

  // Overdue count — shares the TasksPanel cache (single fetch), drives the badge.
  const { data: tasksData } = useQuery<{ tasks: OpsTask[] }>({
    queryKey: TASKS_KEY,
    queryFn: () => apiFetch("/api/ops/tasks"),
    refetchInterval: 60_000,
  });
  const myId = useAuth((s) => s.session)?.user?.id ?? null;
  // Personal alert: the Follow-ups badge counts MY open follow-ups (red if any
  // overdue), so each operator is nudged on their OWN queue (Jess 2026-06-29).
  const myTasks = (tasksData?.tasks ?? []).filter(
    (t) =>
      (t.assignedTo === myId || t.claimedBy === myId) &&
      (t.status === "open" || t.status === "claimed"),
  );
  const myOverdue = myTasks.filter((t) => t.overdue).length;

  // Per-tab badge: Tasks = my open follow-ups (red when any overdue).
  const badgeFor = (key: Panel): { n: number; tone: string } | null => {
    if (key === "tasks" && myTasks.length > 0)
      return { n: myTasks.length, tone: myOverdue > 0 ? "bg-danger" : "bg-base-700" };
    return null;
  };

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
            {active === "team" && <TeamPanel />}
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
              aria-label={t.label}
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
