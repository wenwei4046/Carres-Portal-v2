import type { PrincipalPendingApprovalRow } from "@/lib/queries";
import ApprovalKindBadge from "./ApprovalKindBadge";

/**
 * Awaiting-decision tile — top 4 pending approvals (server-side limited via
 * the dashboard RPC). Mirrors `principal-dashboard.jsx` lines 111-134.
 *
 * Empty state ("Inbox zero · everything's been decided.") covers the most
 * common steady-state condition. The "Review all" CTA only renders when
 * something is actually pending — otherwise the tile reads as a single
 * statement with nothing to act on.
 */
interface Props {
  pending: PrincipalPendingApprovalRow[];
  setTab: (t: string) => void;
}

export default function ApprovalsTile({ pending, setTab }: Props) {
  return (
    <div className="bg-white border border-base-200 rounded-md">
      <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-base-100">
        <div className="font-display text-strong font-semibold">Awaiting your decision</div>
        {pending.length > 0 && (
          <button
            type="button"
            onClick={() => setTab("approvals")}
            className="btn-primary text-label py-1 px-2.5"
          >
            Review all
          </button>
        )}
      </div>
      {pending.length === 0 ? (
        <div className="p-7 text-center text-meta text-base-500">
          Inbox zero &middot; everything&rsquo;s been decided.
        </div>
      ) : (
        <div>
          {pending.map((a) => (
            <div
              key={a.id}
              className="px-[18px] py-3 border-t border-base-100 flex items-center gap-2.5"
            >
              <ApprovalKindBadge kind={a.kind} />
              <div className="flex-1 min-w-0">
                <div className="text-meta font-semibold leading-tight">
                  {a.title}
                </div>
                <div className="text-label text-base-500 mt-0.5">
                  {a.actor} &middot; {new Date(a.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
