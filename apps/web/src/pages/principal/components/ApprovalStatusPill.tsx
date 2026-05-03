/**
 * Tiny status pill used in the approvals list + drawer header. Mirrors the
 * proto's `ApprovalStatusPill` (`reference/proto/principal-approvals.jsx`
 * lines 123-130). Uses Tailwind `text-primary` (terracotta), `text-success`
 * (olive), and `text-base-600` (muted grey) for pending / approved / rejected.
 *
 * Falls back to the pending styling for any unknown status — defensive default
 * matches `ApprovalKindBadge`'s "unknown → other" pattern.
 */
const STATUS: Record<string, { label: string; cls: string }> = {
  pending:  { label: "Pending",  cls: "bg-primary/10 text-primary" },
  approved: { label: "Approved", cls: "bg-success/10 text-success" },
  rejected: { label: "Rejected", cls: "bg-base-100 text-base-600" },
};

interface Props {
  status: string;
}

export default function ApprovalStatusPill({ status }: Props) {
  const s = STATUS[status] ?? STATUS.pending;
  return (
    <span
      className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
