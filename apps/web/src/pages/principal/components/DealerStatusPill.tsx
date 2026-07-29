/**
 * Tiny status pill for the dealer admin list + drawer header. Mirrors the
 * proto's `DealerStatusPill` (`reference/proto/principal-dealers.jsx`
 * lines 112-119) plus a fourth `rejected` variant the DB schema supports
 * (rejected new_dealer approvals flip the dealer row to status='rejected').
 *
 * Falls back to the pending styling for any unknown status — defensive
 * default matches `ApprovalStatusPill`'s "unknown → pending" pattern.
 */
const STYLE: Record<string, { l: string; cls: string }> = {
  active:    { l: "Active",    cls: "bg-success/10 text-success" },
  pending:   { l: "Pending",   cls: "bg-primary/10 text-primary" },
  suspended: { l: "Suspended", cls: "bg-base-200 text-base-700" },
  rejected:  { l: "Rejected",  cls: "bg-base-100 text-base-500" },
};

interface Props {
  status: string;
}

export default function DealerStatusPill({ status }: Props) {
  const s = STYLE[status] ?? STYLE.pending;
  return (
    <span
      className={`px-2.5 py-[3px] rounded-full text-label font-semibold uppercase tracking-wider ${s.cls}`}
    >
      {s.l}
    </span>
  );
}
