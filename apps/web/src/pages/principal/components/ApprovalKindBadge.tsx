/**
 * Small uppercase pill that colour-codes an approval by its `kind`. Mirrors
 * the proto's `ApprovalKindBadge` (`principal-dashboard.jsx` lines 250-257).
 *
 * Proto includes `discount` but Phase 3 MVP scope drops discount approvals
 * entirely (Loo: not in business model). We keep the component generic by
 * falling back to the neutral "Other" preset for unknown kinds — that's also
 * what surfaces if the API ever introduces a new kind we haven't styled.
 */
const KIND_STYLE: Record<string, string> = {
  refund: "bg-primary/10 text-primary",
  new_dealer: "bg-[#3c5a78]/10 text-[#3c5a78]",
  top_up: "bg-base-100 text-base-700",
  price_change: "bg-base-100 text-base-700",
  other: "bg-base-100 text-base-700",
};
const KIND_LABEL: Record<string, string> = {
  refund: "Refund",
  new_dealer: "Dealer",
  top_up: "Top-up",
  price_change: "Price",
  other: "Other",
};

interface Props {
  kind: string;
}

export default function ApprovalKindBadge({ kind }: Props) {
  const cls = KIND_STYLE[kind] ?? KIND_STYLE.other;
  const label = KIND_LABEL[kind] ?? "Other";
  return (
    <span
      className={`px-2 py-px rounded-full text-label font-semibold uppercase tracking-wider whitespace-nowrap ${cls}`}
    >
      {label}
    </span>
  );
}
