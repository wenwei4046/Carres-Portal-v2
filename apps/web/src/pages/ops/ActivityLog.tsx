import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

type ActivityEntry = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  module: string;
  action: string;
  entity_type: string | null;
  entity_ref: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  occurred_at: string;
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ActivityLog() {
  const q = useQuery({
    queryKey: ["ops", "activity"],
    queryFn: () =>
      apiFetch<{ entries: ActivityEntry[] }>("/api/ops/activity?limit=100").then((r) => r.entries),
    refetchInterval: 15000,
  });

  return (
    <div className="px-9 py-7">
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-1.5">
        Ops Panel
      </div>
      <h1 className="text-[28px] font-display font-bold text-base-900 mb-2">Activity Log</h1>
      <p className="text-[13px] text-base-600 mb-6 max-w-3xl">
        Live team feed — who did what, when. Auto-refreshes every 15 seconds.
        Visible to whole ops team for transparency.
      </p>

      {q.isLoading && (
        <div className="card p-9 text-center text-[12px] text-base-500 italic">Loading…</div>
      )}
      {q.isError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-[12px] text-destructive">
          Could not load activity: {q.error instanceof Error ? q.error.message : "unknown"}
        </div>
      )}
      {q.data?.length === 0 && (
        <div className="card p-9 text-center text-[12px] text-base-500 italic">
          No activity yet. Activity will appear here once team starts using the panel.
        </div>
      )}

      {q.data && q.data.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="max-h-[720px] overflow-auto">
            {q.data.map((e) => (
              <div
                key={e.id}
                className="flex gap-3 px-4 py-2.5 border-b border-base-100 text-[12.5px] last:border-b-0"
              >
                <div className="text-[10.5px] text-base-500 font-mono whitespace-nowrap pt-0.5 w-16 shrink-0">
                  {relativeTime(e.occurred_at)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base-900">
                    <span className="font-semibold">{e.actor_name ?? "system"}</span>
                    <span className="text-base-500"> · {e.module}</span>
                    {e.entity_ref && (
                      <span className="font-mono text-base-700"> · {e.entity_ref}</span>
                    )}
                  </div>
                  <div className="text-base-700">{e.summary}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
