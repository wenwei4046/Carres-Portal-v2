import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { fmtDate } from "@/lib/fmt-date";
import { useOpenWorkSet } from "../../use-open-work";
import { myMissedAndToday, WORK_SOURCE_LABEL } from "../../work/work-model";

/**
 * The LEGACY `ops_tasks` read's own key (the header Bell and the Orders Control
 * page). ⛔ It used to be `["operation", "work"]` — the SAME key the shared
 * Work feed (`useOperationWork`) caches under — so whichever read landed first
 * poisoned the other: the Work page, the Quick Rail counts and the Payment
 * Monitor's owner cells read `{ tasks }` and showed nothing while the feed
 * carried 215 items (production, 2026-09-13). One key per read.
 */
export const TASKS_KEY = ["operation", "legacy-tasks"] as const;

/** `Last updated {time}` — a timestamp through the one date home. */
function lastUpdated(at: string | number | null): string | null {
  if (at === null) return null;
  const iso = typeof at === "number" ? new Date(at).toISOString() : at;
  return `Last updated ${fmtDate(iso, { time: true })}`;
}

/**
 * Quick Rail is a count/navigation peek at My Work, never a second queue
 * (Workspace MASTER §7). Its numbers come from `myMissedAndToday` — the same
 * selector the icon badge reads — so the badge, this panel and My Work's focus
 * list print one number. Loading keeps the rows with placeholders; a failed
 * refresh keeps the last safe counts and says so; a failed source is named in
 * words and never reads as `0` or as a clear state.
 */
export default function TasksPanel() {
  const {
    items, myUserId, focusDay, sourceHealth, hasData, refreshFailed, lastUpdatedAt, error, retry,
  } = useOpenWorkSet();
  const { missed, today } = myMissedAndToday(items, myUserId, focusDay);
  const rows = [
    { label: "Missed", count: missed, href: "/operation?tab=work&scope=mine&day=missed", danger: true },
    { label: "Today", count: today, href: `/operation?tab=work&scope=mine&day=${focusDay}`, danger: false },
  ];

  const openMyWork = (
    <Link
      to="/operation?tab=work&scope=mine"
      className="flex items-center justify-between rounded-lg border border-base-200 px-3 py-2 text-meta font-medium text-primary hover:bg-base-50"
    >
      <span>Open My Work</span>
      <ChevronRight size={14} />
    </Link>
  );

  if (!hasData) {
    return (
      <div className="space-y-3" data-testid="my-work-panel">
        {error ? (
          <div role="status" className="space-y-2">
            <p className="text-meta text-kit-amber-11">My Work could not be refreshed</p>
            <button
              type="button"
              onClick={retry}
              className="px-3 py-1.5 rounded-md border border-base-200 bg-white text-meta text-base-700"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <span className="sr-only" role="status">Loading work</span>
            <div className="rounded-lg border border-base-200 bg-white divide-y divide-base-100" aria-hidden="true">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex-1 text-body text-base-700">{row.label}</span>
                  <span className="h-3 w-5 rounded bg-base-100 animate-pulse" />
                </div>
              ))}
            </div>
          </>
        )}
        {openMyWork}
      </div>
    );
  }

  const healthy = !refreshFailed && sourceHealth.length === 0;
  const counted = rows.filter((row) => row.count > 0);

  return (
    <div className="space-y-3" data-testid="my-work-panel">
      {!healthy ? (
        <div className="space-y-1 text-meta text-kit-amber-11" role="status">
          <p>
            <span>My Work could not be refreshed</span>
            {refreshFailed && lastUpdatedAt !== null ? (
              <span className="block text-base-500">{lastUpdated(lastUpdatedAt)}</span>
            ) : null}
          </p>
          {sourceHealth.map((source) => (
            <p key={source.key}>
              <span>{`Could not refresh ${WORK_SOURCE_LABEL[source.key]}`}</span>
              {source.lastSuccessfulAt ? (
                <span className="block text-base-500">{lastUpdated(source.lastSuccessfulAt)}</span>
              ) : null}
            </p>
          ))}
        </div>
      ) : null}
      {counted.length > 0 ? (
        <div className="rounded-lg border border-base-200 bg-white divide-y divide-base-100">
          {counted.map((row) => (
            <Link
              key={row.href}
              to={row.href}
              aria-label={`Open My Work · ${row.label} · ${row.count} ${row.count === 1 ? "action" : "actions"}`}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-base-50"
            >
              <span className={`flex-1 text-body ${row.danger ? "text-danger font-semibold" : "text-base-700"}`}>
                {row.label}
              </span>
              <span className="text-body tabular-nums text-base-900">{row.count}</span>
              <ChevronRight size={14} className="text-base-300" />
            </Link>
          ))}
        </div>
      ) : healthy ? (
        <p className="text-body text-base-500">No work due now</p>
      ) : null}
      {openMyWork}
    </div>
  );
}
