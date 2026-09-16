import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useOpenWorkSet } from "../../use-open-work";

/**
 * The LEGACY `ops_tasks` read's own key (the header Bell and the Orders Control
 * page). ⛔ It used to be `["operation", "work"]` — the SAME key the shared
 * Work feed (`useOperationWork`) caches under — so whichever read landed first
 * poisoned the other: the Work page, the Quick Rail counts and the Payment
 * Monitor's owner cells read `{ tasks }` and showed nothing while the feed
 * carried 215 items (production, 2026-09-13). One key per read.
 */
export const TASKS_KEY = ["operation", "legacy-tasks"] as const;

/** Quick Rail is a count/navigation peek at My Work, never a second queue. */
export default function TasksPanel() {
  const myId = useAuth((state) => state.session)?.user?.id ?? null;
  const { items, generatedOn, complete, failedSources, loading, error } = useOpenWorkSet();
  const mine = myId ? items.filter((item) => item.ownerId === myId) : [];
  const missed = mine.filter((item) => item.timingBucket === "overdue").length;
  const today = mine.filter((item) => item.timingBucket !== "overdue" && item.dueIso === generatedOn).length;
  const counts = [
    { label: "Missed", count: missed, href: "/operation?tab=work&scope=mine&day=missed", danger: true },
    { label: "Today", count: today, href: `/operation?tab=work&scope=mine&day=${generatedOn}`, danger: false },
  ].filter((row) => row.count > 0);

  const openMyWork = (
    <Link
      to="/operation?tab=work&scope=mine"
      className="flex items-center justify-between rounded-lg border border-base-200 px-3 py-2 text-meta font-medium text-primary hover:bg-base-50"
    >
      <span>Open My Work</span>
      <ChevronRight size={14} />
    </Link>
  );

  if (loading) return <div className="text-meta text-base-400 py-4">Loading My Work…</div>;
  if (error) return <div className="space-y-3"><p className="text-meta text-danger py-2">My Work could not be loaded.</p>{openMyWork}</div>;

  return (
    <div className="space-y-3" data-testid="my-work-panel">
      {!complete ? (
        <p className="text-meta text-kit-amber-11" role="status">
          My Work could not be refreshed{failedSources.length > 0 ? ` · ${failedSources.join(", ")}` : ""}
        </p>
      ) : null}
      {counts.length > 0 ? <div className="rounded-lg border border-base-200 bg-white divide-y divide-base-100">
        {counts.map((row) => (
          <Link
            key={row.href}
            to={row.href}
            aria-label={`Open My Work · ${row.label} · ${row.count} ${row.count === 1 ? "action" : "actions"}`}
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-base-50"
          >
            <span className={`flex-1 text-body ${row.danger && row.count > 0 ? "text-danger font-semibold" : "text-base-700"}`}>
              {row.label}
            </span>
            <span className="text-body tabular-nums text-base-900">{row.count}</span>
            <ChevronRight size={14} className="text-base-300" />
          </Link>
        ))}
      </div> : complete ? <p className="text-body text-base-500">No work due now</p> : null}
      {openMyWork}
    </div>
  );
}
