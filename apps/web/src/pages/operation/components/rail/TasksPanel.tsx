import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useOpenWorkSet } from "../../use-open-work";

export const TASKS_KEY = ["operation", "work"] as const;

/** Quick Rail is a count/navigation peek at My Work, never a second queue. */
export default function TasksPanel() {
  const myId = useAuth((state) => state.session)?.user?.id ?? null;
  const { items, loading, error } = useOpenWorkSet();
  const mine = myId ? items.filter((item) => item.ownerId === myId) : [];
  const late = mine.filter((item) => item.workingDaysLate > 0).length;
  const today = mine.filter(
    (item) => item.workingDaysLate === 0 && item.dueIso === new Date().toISOString().slice(0, 10),
  ).length;
  const later = mine.length - late - today;
  const counts = [
    { label: "Late", count: late, filter: "overdue", danger: true },
    { label: "Due today", count: today, filter: "today", danger: false },
    { label: "Later", count: later, filter: "later", danger: false },
  ];

  if (loading) return <div className="text-meta text-base-400 py-4">Loading…</div>;
  if (error) return <div className="text-meta text-danger py-4">My Work could not be loaded.</div>;

  return (
    <div className="space-y-3" data-testid="my-work-panel">
      <div className="rounded-lg border border-base-200 bg-white divide-y divide-base-100">
        {counts.map((row) => (
          <Link
            key={row.filter}
            to={`/operation?tab=work&scope=mine&when=${row.filter}`}
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-base-50"
          >
            <span className={`flex-1 text-body ${row.danger && row.count > 0 ? "text-danger font-semibold" : "text-base-700"}`}>
              {row.label}
            </span>
            <span className="text-body tabular-nums text-base-900">{row.count}</span>
            <ChevronRight size={14} className="text-base-300" />
          </Link>
        ))}
      </div>
      <Link
        to="/operation?tab=work&scope=mine"
        className="flex items-center justify-between rounded-lg border border-base-200 px-3 py-2 text-meta font-medium text-primary hover:bg-base-50"
      >
        <span>Open My Work</span>
        <ChevronRight size={14} />
      </Link>
    </div>
  );
}
