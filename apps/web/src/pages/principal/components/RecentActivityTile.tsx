import type { PrincipalAuditRow } from "@/lib/queries";
import RoleChip from "./RoleChip";

/**
 * Recent activity feed — last 5 audit log rows from the dashboard RPC.
 * Mirrors `principal-dashboard.jsx` lines 166-188. The RPC pre-sorts by
 * occurred_at desc and slices to 5 server-side, so we render whatever we
 * receive verbatim.
 *
 * Empty state covers fresh-environment / first-day-after-reset scenarios.
 * No "Full log" CTA in Phase 3 — the audit page lands in Phase 5.
 */
interface Props {
  rows: PrincipalAuditRow[];
}

export default function RecentActivityTile({ rows }: Props) {
  return (
    <div className="bg-white border border-base-200 rounded-md">
      <div className="px-[18px] py-3.5 border-b border-base-100 font-display text-base font-semibold">
        Recent activity
      </div>
      {rows.length === 0 ? (
        <div className="p-7 text-center text-[12px] text-base-500">No activity yet.</div>
      ) : (
        <div>
          {rows.map((e) => (
            <div
              key={e.id}
              className="px-[18px] py-2.5 border-t border-base-100 grid items-center gap-2.5 text-[12px]"
              style={{ gridTemplateColumns: "auto 1fr auto" }}
            >
              <RoleChip role={e.role} />
              <div className="min-w-0 truncate">
                <span className="text-base-900">{e.action}</span>
                <span className="text-base-500"> &middot; {e.actor_text}</span>
              </div>
              <div className="font-mono text-[10.5px] text-base-400 whitespace-nowrap">
                {new Date(e.occurred_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
