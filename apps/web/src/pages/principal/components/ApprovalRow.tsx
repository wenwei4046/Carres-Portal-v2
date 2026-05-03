import ApprovalKindBadge from "./ApprovalKindBadge";
import ApprovalStatusPill from "./ApprovalStatusPill";

/**
 * Single row in the approvals list. Mirrors the proto's `ApprovalRow`
 * (`reference/proto/principal-approvals.jsx` lines 107-121). Layout is a 4-col
 * grid: kind badge · title+meta · amount · status pill. Non-pending rows are
 * dimmed (`opacity-70`) so the eye lands on the queue first.
 *
 * Field shape mirrors the `approvals` table (`select("*")` from the API).
 * `reason` is read from the DB row but only surfaced in the drawer, not the
 * row.
 */
interface Approval {
  id: string;
  kind: string;
  title: string;
  actor: string | null;
  refers_to: string | null;
  amount: number | string | null;
  created_at: string;
  status: string;
}

interface Props {
  a: Approval;
  onOpen: () => void;
}

export default function ApprovalRow({ a, onOpen }: Props) {
  const isPending = a.status === "pending";
  const borderCls = isPending ? "border-base-200" : "border-base-100 opacity-70";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left grid items-center gap-4 px-5 py-4 bg-white border rounded-md hover:bg-base-50 transition-colors ${borderCls}`}
      style={{ gridTemplateColumns: "auto 1fr auto auto" }}
    >
      <ApprovalKindBadge kind={a.kind} />
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-base-900 truncate">{a.title}</div>
        <div className="text-[11.5px] text-base-500 mt-0.5">
          {a.actor ?? "System"} &middot; {new Date(a.created_at).toLocaleDateString()}
          {a.refers_to ? ` · ref ${a.refers_to}` : ""}
        </div>
      </div>
      {a.amount != null ? (
        <div className="font-mono text-[14px] font-bold text-base-900">
          RM {Number(a.amount).toLocaleString()}
        </div>
      ) : (
        <div />
      )}
      <ApprovalStatusPill status={a.status} />
    </button>
  );
}
