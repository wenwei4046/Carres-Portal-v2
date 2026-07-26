import { ShieldCheck } from "lucide-react";
import type { GuaranteeStatus } from "@carres/shared";
import { useOrderGuarantees } from "@/lib/queries";

/**
 * "This customer bought a guarantee" — the marker Loo asked to appear on every
 * customer-facing order surface (0261-0263).
 *
 * Rendered inside the Customer block of BOTH order-detail surfaces (ops drawer
 * + POS order detail) so the answer is in the same place regardless of who is
 * looking. Renders NOTHING when the order has no guarantee — no empty state,
 * no reserved space: on the ~190 orders that predate this feature the customer
 * card must look exactly as it did before.
 *
 * Voided guarantees are hidden here on purpose (a cancelled order's promise is
 * not a promise); the Guarantees desk still shows them for audit.
 */

const TONE: Record<GuaranteeStatus, string> = {
  pending: "pill-sent",
  active: "pill-confirmed",
  claimed: "pill-collected",
  expired: "pill-neutral",
  void: "pill-neutral",
};

const WORD: Record<GuaranteeStatus, string> = {
  pending: "Starts on delivery",
  active: "Covered",
  claimed: "Used",
  expired: "Expired",
  void: "Void",
};

export default function GuaranteeCoverStrip({ orderId }: { orderId: string }) {
  // The strip is silent-until-present; a failed read falls through to rendering
  // nothing rather than breaking the customer card around it.
  const q = useOrderGuarantees(orderId);

  const items = (q.data?.items ?? []).filter((g) => g.effectiveStatus !== "void");
  if (items.length === 0) return null;

  return (
    <div className="mt-2 rounded border border-primary/30 bg-primary/5 px-2.5 py-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <ShieldCheck size={14} strokeWidth={2} className="text-primary" />
        <span className="t-tiny font-semibold uppercase tracking-wide text-primary">
          Guarantee
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((g) => (
          <li key={g.id} className="flex items-start justify-between gap-2">
            <span className="min-w-0 text-[12px] text-base-800">
              {g.coversLabel ?? g.coversSku ?? "item not attached"}
              <span className="text-base-500">
                {" "}
                · {g.coverageYears}y{g.expiresOn ? ` to ${g.expiresOn}` : ""}
              </span>
            </span>
            <span className={`pill ${TONE[g.effectiveStatus]} shrink-0`}>
              {WORD[g.effectiveStatus]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
