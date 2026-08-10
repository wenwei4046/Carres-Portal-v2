import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";

/**
 * J2 — the case→order half of the cross-link.
 *
 * ONE definition of "which order is this case about", shared by the case list
 * and the case modal so the two can never disagree. Before J2 the modal
 * rendered the literal word "linked" for a case it could not name, and the list
 * did not mention the order at all.
 *
 * THREE states, and they are genuinely different:
 *   - linked, named    → SO-1258, one click into that order's drawer
 *   - linked, unnamed  → the order id is there but the SO number is not (a web
 *                        build talking to a Worker older than J2). Still a
 *                        working link — the deep link travels by id — just
 *                        without its number. Degrades, never crashes.
 *   - not linked       → said plainly. This is the live state of every case on
 *                        file today, so it is the state that had to read well.
 *                        Both call sites show the Ref No right beside this, so
 *                        the operator still has the one handle that exists.
 */
export default function CaseOrderLink({
  orderId,
  so,
  compact = false,
}: {
  orderId: string | null;
  /** undefined = the API did not send it; null = the case has no order. */
  so?: number | null;
  /** List rows are tight; the modal field can breathe. */
  compact?: boolean;
}) {
  const navigate = useNavigate();

  if (!orderId) {
    return (
      <span className={compact ? "text-meta text-base-400" : "text-body text-base-400"}>
        Not linked to an order
      </span>
    );
  }

  return (
    <button
      type="button"
      data-testid="case-order-link"
      onClick={(e) => {
        // The list row itself opens the case modal — this link must beat it.
        e.stopPropagation();
        // ⭐ CUTOVER 2026-08-10 — `?order=` is read by the OLD control table
        // (it opens the order drawer); the new register has no drawer and no
        // such param, so from Stage 1 until now this link landed on a page
        // that silently ignored it. It follows the drawer to the temporary
        // door, and it moves again when Service's own journey is migrated.
        navigate(`/operation/old-orders?order=${encodeURIComponent(orderId)}`);
      }}
      className={`inline-flex items-center gap-1 text-info hover:underline ${
        compact ? "text-meta" : "text-body"
      }`}
    >
      {typeof so === "number" ? `SO-${so}` : "Open order"}
      <ExternalLink size={12} aria-hidden />
    </button>
  );
}
